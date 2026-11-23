"""Normalización y validación de cédula panameña y del token QR del carné UTP.

Mantener alineado con frontend/src/utils/cedula.ts y frontend/src/utils/qr.ts.

    8-123-456   provincia-tomo-asiento
    PE-12-345   panameño nacido en el extranjero
    E-8-12345   extranjero
    N-12-345    naturalizado
    8AV-12-345  registrado antes de la vigencia
    8PI-12-345  población indígena
"""
from __future__ import annotations

import base64
import binascii
import re

_PATRON_CEDULA = re.compile(r"^(?:(PE|E|N)|(\d{1,2})(AV|PI)?)-(\d{1,4})-(\d{1,6})$")
_SEPARADORES = re.compile(r"\s*[-‐‑–—]\s*|\s+")
_PATRON_BASE64 = re.compile(r"^[A-Za-z0-9+/]{4,508}={0,2}$")


def normalizar_cedula(entrada: str) -> str:
    """Unifica separadores, pasa a mayúsculas y quita ceros a la izquierda (08-0123-00456 → 8-123-456)."""
    texto = _SEPARADORES.sub("-", entrada.strip().upper())
    texto = re.sub(r"-+", "-", texto)
    return "-".join(p.lstrip("0") or "0" if p.isdigit() else p for p in texto.split("-"))


def cedula_valida(entrada: str) -> str | None:
    """Cédula normalizada, o None si el formato no es válido."""
    cedula = normalizar_cedula(entrada)
    partes = _PATRON_CEDULA.match(cedula)
    if not partes:
        return None
    if partes.group(2) is not None and not 1 <= int(partes.group(2)) <= 13:
        return None
    return cedula


def cedula_de_token_qr(token: str) -> str | None:
    """Decodifica el QR del carné UTP (Base64 de "<cedula>@<sufijo>"). None si no tiene ese formato."""
    limpio = token.strip()
    if not _PATRON_BASE64.match(limpio) or len(limpio) % 4:
        return None
    try:
        texto = base64.b64decode(limpio, validate=True).decode("utf8")
    except (binascii.Error, UnicodeDecodeError):
        return None
    cedula, arroba, _ = texto.partition("@")
    return cedula_valida(cedula) if arroba and cedula else None
