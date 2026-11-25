"""Endpoints de la API contra el mock de la API UTP (mismo código que mock-utp/servidor.py)."""
import base64
import io

import pytest
import qrcode
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import Configuracion
from app.db import Validacion
from app.main import crear_app

from .conftest import caja_de, crear_cliente_utp, tienda_de_pruebas

QR_ANA = "OC0xMjMtNDU2QHV0cC5hYy5wYQ=="


@pytest.fixture(autouse=True)
def sesion_de_caja(api) -> dict:
    """Validar exige sesión: estas pruebas validan como cajero de una tienda con una oferta vigente."""
    encabezados = caja_de(api, tienda_de_pruebas(api))
    api.headers.update(encabezados)
    return encabezados


def bitacora(api: TestClient) -> list[tuple[str, str]]:
    with api.app.state.sesiones() as sesion:
        return [(v.criterio, v.resultado) for v in sesion.scalars(select(Validacion).order_by(Validacion.id))]


def test_estudiante_activo_por_cedula(api):
    r = api.get("/api/carnets/validar", params={"cedula": "08-0123-00456"})
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo.pop("descuento")["comercio"] == "Tienda de pruebas"
    assert cuerpo == {
        "nombre": "ANA MARÍA PÉREZ GÓMEZ",
        "cedula": "8-123-456",
        "tipo": "Estudiante",
        "unidad": "Facultad de Ingeniería de Sistemas Computacionales",
        "programa": "Licenciatura en Ingeniería de Software",
        "sede": "Campus Víctor Levi Sasso",
        "estado": "ACTIVO",
        "periodo": {"anio": 2026, "semestre": 2},
        "fuente": "utp",
    }
    assert r.headers["cache-control"] == "no-store"


def test_estudiante_inactivo_no_es_error(api):
    r = api.get("/api/carnets/validar", params={"cedula": "8-234-567"})
    assert r.status_code == 200
    assert r.json()["estado"] == "INACTIVO"
    assert r.json()["motivo"] == "No matriculado en el periodo vigente"


def test_campos_opcionales_se_omiten(api):
    r = api.get("/api/carnets/validar", params={"cedula": "E-8-12345"})
    cuerpo = r.json()
    assert "programa" not in cuerpo and "sede" not in cuerpo
    assert cuerpo["unidad"] == "Universidad Tecnológica de Panamá"
    assert cuerpo["periodo"] == {"anio": 2027, "semestre": 3}


def test_por_qr_del_carne(api):
    r = api.get("/api/carnets/validar", params={"qr": QR_ANA})
    assert r.status_code == 200
    assert r.json()["cedula"] == "8-123-456"


def test_no_encontrado(api):
    r = api.get("/api/carnets/validar", params={"cedula": "8-999-999"})
    assert r.status_code == 404
    assert "error" in r.json()


def test_qr_invalido(api):
    r = api.get("/api/carnets/validar", params={"qr": "zzz"})
    assert r.status_code == 400
    assert r.json() == {"error": "El código QR del carné no es válido."}


def test_parametros_incorrectos(api):
    assert api.get("/api/carnets/validar").status_code == 400
    assert api.get("/api/carnets/validar", params={"cedula": "8-123-456", "qr": QR_ANA}).status_code == 400
    assert api.get("/api/carnets/validar", params={"cedula": "abc"}).json() == {"error": "Formato de cédula no válido."}
    assert api.get("/api/carnets/validar", params={"qr": "x" * 600}).status_code == 400
    r = api.get("/api/carnets/validar", params={"carnet": "2023-00451"})
    assert r.status_code == 400 and "cédula o el QR" in r.json()["error"]


def test_sistema_de_matricula_caido_es_503_no_inactivo(api):
    r = api.get("/api/carnets/validar", params={"cedula": "8-500-500"})
    assert r.status_code == 503
    assert r.headers["retry-after"] == "30"
    assert "no está disponible" in r.json()["error"]


def test_timeout_es_503(api):
    r = api.get("/api/carnets/validar", params={"cedula": "8-600-600"})
    assert r.status_code == 503
    assert "no respondió a tiempo" in r.json()["error"]


def test_bitacora_sin_datos_personales(api):
    api.get("/api/carnets/validar", params={"cedula": "8-123-456"})
    api.get("/api/carnets/validar", params={"qr": "OC0yMzQtNTY3QHV0cC5hYy5wYQ=="})
    api.get("/api/carnets/validar", params={"cedula": "8-999-999"})
    api.get("/api/carnets/validar", params={"cedula": "8-500-500"})
    api.get("/api/carnets/validar", params={"cedula": "abc"})  # inválida: no llega a la UTP ni a la bitácora
    assert bitacora(api) == [("cedula", "ACTIVO"), ("qr", "INACTIVO"), ("cedula", "NO_ENCONTRADO"),
                             ("cedula", "NO_VERIFICADO")]
    columnas = set(Validacion.__table__.columns.keys())
    # Solo metadatos para el reporte de validación: nunca cédula, nombre ni el QR.
    assert columnas == {"id", "criterio", "resultado", "tiempo_ms", "comercio_id", "consultado_en"}


def test_salud(api):
    api.get("/api/carnets/validar", params={"cedula": "8-123-456"})
    assert api.get("/api/salud").json() == {"estado": "ok", "baseDatos": "ok", "validacionesRegistradas": 1}


def test_ruta_inexistente(api):
    r = api.get("/api/nada")
    assert r.status_code == 404 and r.json() == {"error": "Ruta no encontrada."}


def test_limite_por_ip(url_mock, sesiones, sesion_de_caja):
    cliente = crear_cliente_utp(url_mock)
    with TestClient(crear_app(Configuracion(rate_limit_max=2, _env_file=None), cliente=cliente,
                              sesiones=sesiones)) as http:
        http.headers.update(sesion_de_caja)
        for _ in range(2):
            assert http.get("/api/carnets/validar", params={"cedula": "8-123-456"}).status_code == 200
        r = http.get("/api/carnets/validar", params={"cedula": "8-123-456"})
        assert r.status_code == 429
        assert int(r.headers["retry-after"]) > 0


def test_cors(api):
    r = api.get("/api/salud", headers={"Origin": "http://localhost:5173"})
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
    r = api.get("/api/salud", headers={"Origin": "https://otro-sitio.com"})
    assert "access-control-allow-origin" not in r.headers


# --- foto del QR (OpenCV) ------------------------------------------------------------------

def png_con_qr(texto: str) -> bytes:
    salida = io.BytesIO()
    qrcode.make(texto).save(salida, format="PNG")
    return salida.getvalue()


def png_en_blanco() -> bytes:
    import cv2
    import numpy as np

    return cv2.imencode(".png", np.full((200, 200, 3), 255, dtype=np.uint8))[1].tobytes()


def test_imagen_con_qr_del_carne(api):
    r = api.post("/api/carnets/validar-imagen", files={"imagen": ("carne.png", png_con_qr(QR_ANA), "image/png")})
    assert r.status_code == 200
    assert r.json()["nombre"] == "ANA MARÍA PÉREZ GÓMEZ"
    assert bitacora(api) == [("imagen", "ACTIVO")]


def test_imagen_con_cedula_en_texto(api):
    r = api.post("/api/carnets/validar-imagen", files={"imagen": ("c.png", png_con_qr("8-234-567"), "image/png")})
    assert r.status_code == 200 and r.json()["estado"] == "INACTIVO"


def test_imagen_sin_qr(api):
    r = api.post("/api/carnets/validar-imagen", files={"imagen": ("b.png", png_en_blanco(), "image/png")})
    assert r.status_code == 400 and "No se encontró" in r.json()["error"]


def test_archivo_que_no_es_imagen(api):
    r = api.post("/api/carnets/validar-imagen", files={"imagen": ("x.png", b"no soy una imagen", "image/png")})
    assert r.status_code == 400 and r.json() == {"error": "El archivo no es una imagen válida."}


def test_qr_ajeno(api):
    r = api.post("/api/carnets/validar-imagen",
                 files={"imagen": ("q.png", png_con_qr("https://ejemplo.com"), "image/png")})
    assert r.status_code == 400


def test_token_base64_con_cedula_invalida_en_imagen(api):
    texto = base64.b64encode(b"abc@utp.ac.pa").decode()
    r = api.post("/api/carnets/validar-imagen", files={"imagen": ("q.png", png_con_qr(texto), "image/png")})
    assert r.status_code == 400
