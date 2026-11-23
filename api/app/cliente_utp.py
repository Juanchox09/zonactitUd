"""Cliente de la API de Estado de Estudiante de la UTP (contrato en ../api-estudiante-mock/openapi.yaml).

    POST {base}/auth/token                  OAuth2 client_credentials
    GET  {base}/estudiantes/{cedula}/estado
    POST {base}/estudiantes/validar-carne   {"token_qr": ...}

Reglas del contrato que se respetan aquí:
  - 200 con activo=false es "inactivo", no un error.
  - 500, 503, 429 y timeout (5 s) son "no se pudo verificar", nunca "inactivo".
  - Límite de 60 solicitudes por minuto por cliente: se aplica un límite propio por debajo
    y una caché corta para no repetir la misma consulta (p. ej. el mismo QR escaneado dos veces).

Si la API definitiva cambia rutas o nombres de campos, este es el único archivo a tocar.
"""
from __future__ import annotations

import logging
import math
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx

log = logging.getLogger("actitud.utp")

MENSAJE_QR_INVALIDO = "El código QR del carné no es válido."


class ErrorSolicitud(Exception):
    """La consulta está mal formada (p. ej. QR que no se puede decodificar) → 400."""


class ErrorNoVerificado(Exception):
    """No se pudo determinar el estado (servicio caído, timeout, cupo…) → 503. Nunca es "inactivo"."""

    def __init__(self, mensaje: str, reintentar_en: int | None = None):
        super().__init__(mensaje)
        self.reintentar_en = reintentar_en


@dataclass(frozen=True)
class EstudianteUtp:
    cedula: str
    nombre: str
    activo: bool
    periodo_anio: int
    periodo_semestre: int
    sede: str | None = None
    facultad: str | None = None
    carrera: str | None = None

    @classmethod
    def desde_json(cls, d: Any) -> EstudianteUtp | None:
        periodo = d.get("periodo") if isinstance(d, dict) else None
        if not (isinstance(d, dict) and isinstance(d.get("cedula"), str) and isinstance(d.get("nombre"), str)
                and isinstance(d.get("activo"), bool) and isinstance(periodo, dict)
                and isinstance(periodo.get("anio"), int) and isinstance(periodo.get("semestre"), int)):
            return None
        texto = lambda campo: d[campo] if isinstance(d.get(campo), str) else None  # noqa: E731
        return cls(d["cedula"], d["nombre"], d["activo"], periodo["anio"], periodo["semestre"],
                   texto("sede"), texto("facultad"), texto("carrera"))


class ClienteUtp:
    def __init__(self, url_base: str, client_id: str, client_secret: str, *, timeout_s: float = 5.0,
                 limite_por_minuto: int = 55, cache_segundos: int = 30,
                 transporte: httpx.BaseTransport | None = None, reloj: Callable[[], float] = time.monotonic):
        self._client_id = client_id
        self._client_secret = client_secret
        self._limite = limite_por_minuto
        self._cache_segundos = cache_segundos
        self._reloj = reloj
        self._http = httpx.Client(base_url=url_base.rstrip("/"), timeout=timeout_s, transport=transporte,
                                  headers={"Accept": "application/json"})
        self._token: tuple[str, float] | None = None  # (valor, vence_en)
        self._candado_token = threading.Lock()
        self._candado_cupo = threading.Lock()
        self._recientes: deque[float] = deque()
        self._cache: dict[str, tuple[float, EstudianteUtp | None]] = {}

    def cerrar(self) -> None:
        self._http.close()

    # --- consultas públicas ---------------------------------------------------------------

    def consultar_por_cedula(self, cedula: str) -> EstudianteUtp | None:
        return self._con_cache(f"c:{cedula}", lambda: self._solicitar(
            "GET", f"/estudiantes/{quote(cedula, safe='')}/estado"))

    def validar_carne(self, token_qr: str) -> EstudianteUtp | None:
        return self._con_cache(f"q:{token_qr}", lambda: self._solicitar(
            "POST", "/estudiantes/validar-carne", json={"token_qr": token_qr}))

    # --- caché y cupo --------------------------------------------------------------------

    def _con_cache(self, clave: str, consultar: Callable[[], EstudianteUtp | None]) -> EstudianteUtp | None:
        ahora = self._reloj()
        guardado = self._cache.get(clave)
        if guardado and guardado[0] > ahora:
            return guardado[1]
        valor = consultar()
        if self._cache_segundos > 0:
            if len(self._cache) >= 1000:
                self._cache = {k: v for k, v in self._cache.items() if v[0] > ahora}
                if len(self._cache) >= 1000:
                    self._cache.clear()
            self._cache[clave] = (ahora + self._cache_segundos, valor)
        return valor

    def _reservar_cupo(self) -> None:
        """Ventana deslizante de 60 s, por debajo del límite de la API."""
        with self._candado_cupo:
            ahora = self._reloj()
            while self._recientes and self._recientes[0] <= ahora - 60:
                self._recientes.popleft()
            if len(self._recientes) >= self._limite:
                espera = math.ceil(self._recientes[0] + 60 - ahora)
                raise ErrorNoVerificado(
                    f"Hay demasiadas consultas al servicio de la UTP en este momento. Intenta de nuevo en {espera} s.",
                    espera)
            self._recientes.append(ahora)

    # --- HTTP ----------------------------------------------------------------------------

    def _solicitar(self, metodo: str, ruta: str, *, json: dict | None = None,
                   reintento: bool = False) -> EstudianteUtp | None:
        if not reintento:
            self._reservar_cupo()
        token = self._obtener_token()
        respuesta = self._llamar(metodo, ruta, json=json, headers={"Authorization": f"Bearer {token}"})

        if respuesta.status_code == 200:
            estudiante = EstudianteUtp.desde_json(_json_o_none(respuesta))
            if estudiante is None:
                log.error("API UTP devolvió un cuerpo que no cumple el contrato EstadoEstudiante.")
                raise ErrorNoVerificado(
                    "El servicio de la UTP devolvió una respuesta inesperada. No se pudo verificar el estado.")
            return estudiante
        if respuesta.status_code == 404:
            return None

        cuerpo = _json_o_none(respuesta)
        error: dict = cuerpo if isinstance(cuerpo, dict) else {}
        codigo = error.get("codigo", "")
        if respuesta.status_code == 401 and not reintento:
            # Token expirado o revocado: se pide uno nuevo una sola vez.
            self._token = None
            return self._solicitar(metodo, ruta, json=json, reintento=True)
        if respuesta.status_code == 400:
            raise ErrorSolicitud(MENSAJE_QR_INVALIDO if codigo == "QR_INVALIDO"
                                 else error.get("mensaje", "Solicitud no válida."))

        reintentar_en = _entero(respuesta.headers.get("Retry-After"))
        if respuesta.status_code in (401, 403):
            log.error("API UTP rechazó las credenciales del sistema (%s %s)", respuesta.status_code, codigo)
            raise ErrorNoVerificado("El sistema no tiene acceso al servicio de la UTP. Avisa al administrador.")
        if respuesta.status_code == 429:
            raise ErrorNoVerificado("El servicio de la UTP está saturado. Intenta de nuevo en unos segundos.",
                                    reintentar_en)
        if respuesta.status_code == 503:
            raise ErrorNoVerificado("El sistema de matrícula de la UTP no está disponible en este momento.",
                                    reintentar_en)
        log.warning("API UTP respondió %s %s (trace_id %s)", respuesta.status_code, codigo,
                    error.get("trace_id", "-"))
        raise ErrorNoVerificado("El servicio de la UTP respondió con un error. No se pudo verificar el estado.")

    def _obtener_token(self) -> str:
        # El candado hace que varias consultas simultáneas compartan la misma solicitud de token.
        with self._candado_token:
            if self._token and self._token[1] > self._reloj():
                return self._token[0]
            respuesta = self._llamar("POST", "/auth/token", data={
                "grant_type": "client_credentials",
                "client_id": self._client_id,
                "client_secret": self._client_secret,
            })
            datos = _json_o_none(respuesta)
            if respuesta.status_code != 200 or not isinstance(datos, dict) or not isinstance(
                    datos.get("access_token"), str):
                log.error("API UTP no emitió token (%s). Revisa UTP_CLIENT_ID y UTP_CLIENT_SECRET.",
                          respuesta.status_code)
                raise ErrorNoVerificado(
                    "El sistema no pudo autenticarse con el servicio de la UTP. Avisa al administrador.")
            segundos = datos.get("expires_in") if isinstance(datos.get("expires_in"), int) else 300
            # Se renueva 60 s antes de que venza.
            self._token = (datos["access_token"], self._reloj() + max(segundos - 60, 10))
            return self._token[0]

    def _llamar(self, metodo: str, ruta: str, **kwargs: Any) -> httpx.Response:
        try:
            return self._http.request(metodo, ruta, **kwargs)
        except httpx.TimeoutException:
            raise ErrorNoVerificado(
                "El servicio de la UTP no respondió a tiempo. No se pudo verificar el estado.") from None
        except httpx.HTTPError as error:
            log.warning("No se pudo conectar con la API UTP: %s", error)
            raise ErrorNoVerificado(
                "No se pudo conectar con el servicio de la UTP. No se pudo verificar el estado.") from None


def _json_o_none(respuesta: httpx.Response) -> Any:
    try:
        return respuesta.json()
    except ValueError:
        return None


def _entero(valor: str | None) -> int | None:
    return int(valor) if valor and valor.isdigit() else None
