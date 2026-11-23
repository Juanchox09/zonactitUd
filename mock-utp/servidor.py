"""Mock de la API de Estado de Estudiante UTP con los estudiantes en MySQL.

Sigue el contrato de ../api-estudiante-mock/openapi.yaml (igual que mock_server.py de esa carpeta),
pero en lugar de un diccionario fijo lee los estudiantes de la tabla utp_mock.estudiantes en cada
consulta: agregar o cambiar una fila se refleja de inmediato.

Agregados sugeridos en la sección 7 del documento de la API:
  - 8-600-600 tarda 6 s en responder (para probar el timeout de 5 s del backend).
  - Límite de 60 solicitudes por minuto (429 + Retry-After).
  - Latencia opcional: MOCK_LATENCIA_MS=150-400

Uso:  python servidor.py [puerto]        (por defecto 8090)
"""
from __future__ import annotations

import base64
import binascii
import json
import os
import random
import re
import sys
import threading
import time
import uuid
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Protocol
from urllib.parse import parse_qs, unquote

BASE = "/api/v1"
CLIENT_ID = os.environ.get("MOCK_CLIENT_ID", "carnet-qr-tesis")
CLIENT_SECRET = os.environ.get("MOCK_CLIENT_SECRET", "mock-secret")
TOKEN = "mock-token-123"
TOKEN_SIN_SCOPE = "mock-token-sin-permiso"  # para probar 403
PANAMA = timezone(timedelta(hours=-5))
CEDULA_RE = re.compile(r"^[A-Za-z0-9]{1,4}-\d{1,5}-\d{1,6}$")
CEDULA_503 = "8-500-500"
CEDULA_LENTA = "8-600-600"
LIMITE_POR_MINUTO = 60


@dataclass(frozen=True)
class Estudiante:
    cedula: str
    nombre: str
    activo: bool
    sede: str | None
    facultad: str | None
    carrera: str | None
    periodo_anio: int = 2026
    periodo_semestre: int = 2


class FuenteEstudiantes(Protocol):
    def buscar(self, cedula: str) -> Estudiante | None: ...
    def cualquiera(self) -> Estudiante | None: ...


class FuenteMemoria:
    """Para pruebas."""

    def __init__(self, estudiantes: list[Estudiante]):
        self._datos = {e.cedula: e for e in estudiantes}

    def buscar(self, cedula: str) -> Estudiante | None:
        return self._datos.get(cedula)

    def cualquiera(self) -> Estudiante | None:
        return next(iter(self._datos.values()), None)


class FuenteMySQL:
    """Lee utp_mock.estudiantes. Abre una conexión por consulta: simple y sin estado compartido entre hilos."""

    COLUMNAS = "cedula, nombre, activo, sede, facultad, carrera, periodo_anio, periodo_semestre"

    def __init__(self, host: str, puerto: int, usuario: str, clave: str, base: str):
        self._conexion = dict(host=host, port=puerto, user=usuario, password=clave, database=base,
                              charset="utf8mb4", connect_timeout=3, read_timeout=3)

    def _uno(self, sql: str, parametros: tuple = ()) -> Estudiante | None:
        import pymysql

        with pymysql.connect(**self._conexion) as conexion, conexion.cursor() as cursor:
            cursor.execute(sql, parametros)
            fila = cursor.fetchone()
        if not fila:
            return None
        cedula, nombre, activo, sede, facultad, carrera, anio, semestre = fila
        return Estudiante(cedula, nombre.upper(), bool(activo), sede, facultad, carrera, int(anio), int(semestre))

    def buscar(self, cedula: str) -> Estudiante | None:
        return self._uno(f"SELECT {self.COLUMNAS} FROM estudiantes WHERE cedula = %s", (cedula,))

    def cualquiera(self) -> Estudiante | None:
        return self._uno(f"SELECT {self.COLUMNAS} FROM estudiantes ORDER BY cedula LIMIT 1")


def normalizar(cedula: str) -> str:
    return "-".join(str(int(p)) if p.isdigit() else p.upper() for p in cedula.strip().split("-"))


def decodificar_qr(token: str) -> str | None:
    try:
        texto = base64.b64decode(token, validate=True).decode("utf8").strip()
    except (binascii.Error, UnicodeDecodeError, ValueError):
        return None
    return texto.split("@")[0] if "@" in texto else None


class Limitador:
    def __init__(self, maximo: int):
        self._maximo = maximo
        self._marcas: deque[float] = deque()
        self._candado = threading.Lock()

    def permitir(self) -> bool:
        ahora = time.monotonic()
        with self._candado:
            while self._marcas and self._marcas[0] <= ahora - 60:
                self._marcas.popleft()
            if len(self._marcas) >= self._maximo:
                return False
            self._marcas.append(ahora)
            return True


def crear_servidor(fuente: FuenteEstudiantes, puerto: int = 8090, *, host: str = "0.0.0.0",
                   retardo_lento: float = 6.0, latencia_ms: tuple[int, int] | None = None) -> ThreadingHTTPServer:
    limitador = Limitador(LIMITE_POR_MINUTO)

    class Manejador(BaseHTTPRequestHandler):
        server_version = "MockApiUtp/1.0"

        def log_message(self, formato, *args):  # silenciado: las rutas llevan cédulas
            pass

        def _enviar(self, estado: int, cuerpo: dict, encabezados: dict | None = None) -> None:
            datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf8")
            self.send_response(estado)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(datos)))
            for clave, valor in (encabezados or {}).items():
                self.send_header(clave, valor)
            self.end_headers()
            self.wfile.write(datos)

        def _error(self, estado: int, codigo: str, mensaje: str, detalle: str | None = None,
                   encabezados: dict | None = None) -> None:
            cuerpo = {"codigo": codigo, "mensaje": mensaje, "trace_id": uuid.uuid4().hex[:12]}
            if detalle:
                cuerpo["detalle"] = detalle
            self._enviar(estado, cuerpo, encabezados)

        def _autorizado(self) -> bool:
            auth = self.headers.get("Authorization", "")
            if auth == f"Bearer {TOKEN}":
                return True
            if auth == f"Bearer {TOKEN_SIN_SCOPE}":
                self._error(403, "SIN_PERMISO", "El cliente no tiene permiso para esta consulta.")
            else:
                self._error(401, "NO_AUTENTICADO", "Token ausente o inválido.",
                            encabezados={"WWW-Authenticate": 'Bearer error="invalid_token"'})
            return False

        def _dentro_del_limite(self) -> bool:
            if limitador.permitir():
                return True
            self._error(429, "LIMITE_EXCEDIDO", f"Límite de {LIMITE_POR_MINUTO} solicitudes por minuto excedido.",
                        encabezados={"Retry-After": "60"})
            return False

        def _estado(self, cedula_cruda: str) -> None:
            if not CEDULA_RE.match(cedula_cruda):
                return self._error(400, "CEDULA_INVALIDA", "Formato de cédula inválido.", "Formato esperado: 8-123-456")
            cedula = normalizar(cedula_cruda)
            if cedula == CEDULA_503:
                return self._error(503, "ORIGEN_NO_DISPONIBLE", "El sistema de matrícula no está disponible.",
                                   encabezados={"Retry-After": "30"})
            if cedula == CEDULA_LENTA:
                time.sleep(retardo_lento)
            try:
                est = fuente.buscar(cedula) or (fuente.cualquiera() if cedula == CEDULA_LENTA else None)
            except Exception as error:  # base de datos caída → el sistema de matrícula "no está disponible"
                print(f"✘ No se pudo leer la base de estudiantes: {error}", file=sys.stderr)
                return self._error(503, "ORIGEN_NO_DISPONIBLE", "El sistema de matrícula no está disponible.",
                                   encabezados={"Retry-After": "30"})
            if not est:
                return self._error(404, "ESTUDIANTE_NO_ENCONTRADO", "No se encontró al estudiante.")
            cuerpo = {"cedula": cedula, "nombre": est.nombre, "activo": est.activo, "matriculado": est.activo}
            for campo in ("sede", "facultad", "carrera"):
                if getattr(est, campo):
                    cuerpo[campo] = getattr(est, campo)
            cuerpo["periodo"] = {"anio": est.periodo_anio, "semestre": est.periodo_semestre}
            cuerpo["consultado_en"] = datetime.now(PANAMA).isoformat(timespec="seconds")
            self._enviar(200, cuerpo)

        def _cuerpo(self) -> str:
            largo = int(self.headers.get("Content-Length") or 0)
            return self.rfile.read(largo).decode("utf8") if largo else ""

        def _latencia(self) -> None:
            if latencia_ms:
                time.sleep(random.uniform(*latencia_ms) / 1000)

        def do_GET(self):
            self._latencia()
            m = re.fullmatch(BASE + r"/estudiantes/([^/]+)/estado", self.path.split("?")[0])
            if not m:
                return self._error(404, "RUTA_NO_ENCONTRADA", "Ruta no encontrada.")
            if self._autorizado() and self._dentro_del_limite():
                self._estado(unquote(m.group(1)))

        def do_POST(self):
            self._latencia()
            ruta = self.path.split("?")[0]
            if ruta == BASE + "/auth/token":
                formulario = {k: v[0] for k, v in parse_qs(self._cuerpo()).items()}
                if formulario.get("grant_type") != "client_credentials":
                    return self._error(400, "SOLICITUD_INVALIDA", "grant_type debe ser client_credentials")
                if (formulario.get("client_id"), formulario.get("client_secret")) != (CLIENT_ID, CLIENT_SECRET):
                    return self._error(401, "NO_AUTENTICADO", "Credenciales de cliente inválidas.")
                return self._enviar(200, {"access_token": TOKEN, "token_type": "Bearer",
                                          "expires_in": 3600, "scope": "estudiantes.estado:read"})
            if ruta == BASE + "/estudiantes/validar-carne":
                if not self._autorizado() or not self._dentro_del_limite():
                    return
                try:
                    token_qr = json.loads(self._cuerpo() or "{}").get("token_qr")
                except (json.JSONDecodeError, AttributeError):
                    token_qr = None
                cedula = decodificar_qr(token_qr) if isinstance(token_qr, str) else None
                if not cedula:
                    return self._error(400, "QR_INVALIDO", "El token QR no se pudo decodificar.")
                return self._estado(cedula)
            self._error(404, "RUTA_NO_ENCONTRADA", "Ruta no encontrada.")

    servidor = ThreadingHTTPServer((host, puerto), Manejador)
    servidor.daemon_threads = True
    return servidor


def _latencia_desde_entorno() -> tuple[int, int] | None:
    valor = os.environ.get("MOCK_LATENCIA_MS", "")
    partes = valor.split("-")
    if len(partes) == 2 and all(p.strip().isdigit() for p in partes):
        return int(partes[0]), int(partes[1])
    return None


if __name__ == "__main__":
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("MOCK_PUERTO", 8090))
    fuente = FuenteMySQL(
        host=os.environ.get("MYSQL_HOST", "localhost"),
        puerto=int(os.environ.get("MYSQL_PORT", 3306)),
        usuario=os.environ.get("MYSQL_USER", "utp_mock"),
        clave=os.environ.get("MYSQL_PASSWORD", "utp_mock_local"),
        base=os.environ.get("MYSQL_DATABASE", "utp_mock"),
    )
    servidor = crear_servidor(fuente, puerto, latencia_ms=_latencia_desde_entorno())
    print(f"Mock API UTP escuchando en http://localhost:{puerto}{BASE}", flush=True)
    print("Estudiantes: tabla utp_mock.estudiantes (los cambios se aplican sin reiniciar)", flush=True)
    print(f"Credenciales: client_id={CLIENT_ID} client_secret={CLIENT_SECRET}", flush=True)
    servidor.serve_forever()
