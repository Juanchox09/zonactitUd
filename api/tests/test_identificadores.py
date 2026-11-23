import base64

import pytest

from app.identificadores import cedula_de_token_qr, cedula_valida, normalizar_cedula


@pytest.mark.parametrize("entrada, esperada", [
    ("8-123-456", "8-123-456"),
    ("08-0123-00456", "8-123-456"),
    (" 8 123 456 ", "8-123-456"),
    ("8–123–456", "8-123-456"),
    ("pe-12-345", "PE-12-345"),
    ("e-8-12345", "E-8-12345"),
    ("8-0-1", "8-0-1"),
])
def test_normaliza_cedula(entrada, esperada):
    assert normalizar_cedula(entrada) == esperada


@pytest.mark.parametrize("valida", ["8-123-456", "PE-12-345", "E-8-12345", "N-12-345", "8AV-15-678", "13-1-1"])
def test_cedulas_validas(valida):
    assert cedula_valida(valida) == valida


@pytest.mark.parametrize("invalida", ["abc", "14-123-456", "0-123-456", "8-123", "8-12345-456", "X-1-1", ""])
def test_cedulas_invalidas(invalida):
    assert cedula_valida(invalida) is None


def token(texto: str) -> str:
    return base64.b64encode(texto.encode()).decode()


def test_token_qr_del_carne_utp():
    assert cedula_de_token_qr("OC0xMjMtNDU2QHV0cC5hYy5wYQ==") == "8-123-456"
    assert cedula_de_token_qr(token("08-0123-00456@utp.ac.pa")) == "8-123-456"


@pytest.mark.parametrize("invalido", ["zzz", "8-123-456", token("sin-arroba"), token("@utp.ac.pa"),
                                      token("abc@utp.ac.pa"), "!!!!"])
def test_token_qr_invalido(invalido):
    assert cedula_de_token_qr(invalido) is None
