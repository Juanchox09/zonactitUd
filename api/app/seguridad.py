"""Inicio de sesión del administrador.

- Contraseñas: scrypt (biblioteca estándar) con sal aleatoria. Nunca se guarda la contraseña.
- Sesión: token firmado con HMAC-SHA256 que lleva el id del usuario, su rol y el vencimiento.
  No se guarda en la base; se invalida al vencer o al cambiar CLAVE_SESION.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

_N, _R, _P, _LARGO = 2**14, 8, 1, 32


def _b64(datos: bytes) -> str:
    return base64.urlsafe_b64encode(datos).rstrip(b"=").decode()


def _desde_b64(texto: str) -> bytes:
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


def cifrar_contrasena(contrasena: str) -> str:
    sal = os.urandom(16)
    huella = hashlib.scrypt(contrasena.encode(), salt=sal, n=_N, r=_R, p=_P, dklen=_LARGO)
    return f"scrypt${_b64(sal)}${_b64(huella)}"


def verificar_contrasena(contrasena: str, guardada: str) -> bool:
    try:
        algoritmo, sal, huella = guardada.split("$")
        if algoritmo != "scrypt":
            return False
        calculada = hashlib.scrypt(contrasena.encode(), salt=_desde_b64(sal), n=_N, r=_R, p=_P, dklen=_LARGO)
        return hmac.compare_digest(calculada, _desde_b64(huella))
    except (ValueError, TypeError):
        return False


def _firma(cuerpo: str, clave: str) -> str:
    return _b64(hmac.new(clave.encode(), cuerpo.encode(), hashlib.sha256).digest())


def crear_token(usuario_id: int, rol: str, clave: str, duracion_s: int) -> tuple[str, int]:
    """Devuelve el token y su vencimiento (segundos Unix)."""
    vence = int(time.time()) + duracion_s
    cuerpo = _b64(json.dumps({"sub": usuario_id, "rol": rol, "exp": vence}, separators=(",", ":")).encode())
    return f"{cuerpo}.{_firma(cuerpo, clave)}", vence


def leer_token(token: str, clave: str) -> dict | None:
    """Datos del token si la firma es válida y no ha vencido; si no, None."""
    try:
        cuerpo, firma = token.split(".")
        if not hmac.compare_digest(firma, _firma(cuerpo, clave)):
            return None
        datos = json.loads(_desde_b64(cuerpo))
    except (ValueError, TypeError):
        return None
    if not isinstance(datos, dict) or datos.get("exp", 0) < time.time():
        return None
    return datos
