from __future__ import annotations

import threading
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.cliente_utp import ClienteUtp
from app.config import Configuracion
from app.db import preparar_base
from app.main import crear_app
from servidor import Estudiante, FuenteMemoria, crear_servidor  # mock-utp/servidor.py

ESTUDIANTES = [
    Estudiante("8-123-456", "ANA MARÍA PÉREZ GÓMEZ", True, "Campus Víctor Levi Sasso",
               "Facultad de Ingeniería de Sistemas Computacionales", "Licenciatura en Ingeniería de Software"),
    Estudiante("8-234-567", "CARLOS ALBERTO RÍOS DE LEÓN", False, "Centro Regional de Chiriquí",
               "Facultad de Ingeniería Civil", "Licenciatura en Ingeniería Civil"),
    Estudiante("E-8-12345", "LUCÍA FERNANDA TORRES", True, None, None, None, 2027, 3),
]
CLIENT_ID, CLIENT_SECRET = "carnet-qr-tesis", "mock-secret"


@pytest.fixture
def url_mock() -> Iterator[str]:
    """Mock de la API UTP (el mismo código de mock-utp/) con estudiantes en memoria y un puerto libre."""
    servidor = crear_servidor(FuenteMemoria(ESTUDIANTES), 0, host="127.0.0.1", retardo_lento=1.5)
    hilo = threading.Thread(target=servidor.serve_forever, daemon=True)
    hilo.start()
    yield f"http://127.0.0.1:{servidor.server_address[1]}/api/v1"
    servidor.shutdown()
    servidor.server_close()


@pytest.fixture
def sesiones():
    motor = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    return preparar_base(motor)


def crear_cliente_utp(url: str, **opciones) -> ClienteUtp:
    opciones.setdefault("timeout_s", 0.8)
    opciones.setdefault("cache_segundos", 0)
    return ClienteUtp(url, opciones.pop("client_id", CLIENT_ID), opciones.pop("client_secret", CLIENT_SECRET),
                      **opciones)


@pytest.fixture
def api(url_mock, sesiones) -> Iterator[TestClient]:
    config = Configuracion(rate_limit_max=1000, _env_file=None)
    cliente = crear_cliente_utp(url_mock)
    with TestClient(crear_app(config, cliente=cliente, sesiones=sesiones)) as http:
        yield http
    cliente.cerrar()
