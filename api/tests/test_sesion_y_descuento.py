"""Descuento de la tienda al validar y login de administrador para ver los reportes."""
import time

from sqlalchemy import select

from app.db import Canje, Usuario, Validacion
from app.seguridad import cifrar_contrasena, crear_token, leer_token, verificar_contrasena

from .conftest import caja_de, entrar, tienda_de_pruebas

QR_ANA = "OC0xMjMtNDU2QHV0cC5hYy5wYQ=="


def crear_tienda(api, ofertas=(("porcentaje", 15, "15 % en bebidas"),), activa=True) -> tuple[int, dict]:
    """Tienda y la sesión de su caja."""
    tienda = tienda_de_pruebas(api, "Café Campus", ofertas, activa)
    return tienda, caja_de(api, tienda)


def canjes(api) -> list[Canje]:
    with api.app.state.sesiones() as sesion:
        return sesion.scalars(select(Canje)).all()


# --- descuento al validar ----------------------------------------------------------------------

def test_validacion_activa_guarda_el_porcentaje_de_la_tienda(api):
    tienda, caja = crear_tienda(api)
    r = api.get("/api/carnets/validar", params={"cedula": "8-123-456"}, headers=caja)
    assert r.status_code == 200, r.text
    descuento = r.json()["descuento"]
    assert descuento["comercio"] == "Café Campus" and descuento["porcentaje"] == 15
    assert descuento["yaRegistrado"] is False
    [canje] = canjes(api)
    assert canje.comercio_id == tienda and canje.porcentaje == 15 and canje.id == descuento["canjeId"]
    assert canje.facultad == "Facultad de Ingeniería de Sistemas Computacionales"
    assert "8-123-456" not in canje.estudiante


def test_por_qr_tambien_guarda_el_descuento(api):
    _, caja = crear_tienda(api)
    r = api.get("/api/carnets/validar", params={"qr": QR_ANA}, headers=caja)
    assert r.json()["descuento"]["porcentaje"] == 15


def test_se_usa_el_descuento_principal_de_la_tienda(api):
    _, caja = crear_tienda(api, ofertas=(("2x1", 50, "2x1 en combos"), ("porcentaje", 10, "10 % en el menú")))
    r = api.get("/api/carnets/validar", params={"cedula": "8-123-456"}, headers=caja)
    assert r.json()["descuento"]["tipo"] == "2x1" and r.json()["descuento"]["porcentaje"] == 50


def test_validar_dos_veces_seguidas_no_duplica_el_canje(api):
    _, caja = crear_tienda(api)
    api.get("/api/carnets/validar", params={"cedula": "8-123-456"}, headers=caja)
    r = api.get("/api/carnets/validar", params={"qr": QR_ANA}, headers=caja)
    assert r.json()["descuento"]["yaRegistrado"] is True
    assert len(canjes(api)) == 1


def test_inactivo_o_no_encontrado_no_guarda_descuento(api):
    _, caja = crear_tienda(api)
    r = api.get("/api/carnets/validar", params={"cedula": "8-234-567"}, headers=caja)
    assert r.json()["estado"] == "INACTIVO" and "descuento" not in r.json()
    assert api.get("/api/carnets/validar", params={"cedula": "8-999-999"}, headers=caja).status_code == 404
    assert canjes(api) == []


def test_sin_sesion_no_se_puede_validar(api):
    """Cada validación debe registrar la tienda y el descuento aplicado: sin sesión, 401."""
    crear_tienda(api)
    assert api.get("/api/carnets/validar", params={"cedula": "8-123-456"}).status_code == 401
    assert api.post("/api/carnets/validar-imagen", files={"imagen": ("q.png", b"x", "image/png")}).status_code == 401
    assert api.post("/api/canjes", json={"descuento_id": 1, "cedula": "8-123-456"}).status_code == 401
    assert canjes(api) == []
    with api.app.state.sesiones() as sesion:
        assert sesion.scalars(select(Validacion)).all() == []


def test_la_tienda_se_toma_de_la_sesion(api):
    tienda, caja = crear_tienda(api)
    otra = tienda_de_pruebas(api, "Otra tienda")
    r = api.get("/api/carnets/validar", params={"cedula": "8-123-456"}, headers=caja)
    assert r.json()["descuento"]["comercio"] == "Café Campus"
    # No puede validar a nombre de otra tienda.
    assert api.get("/api/carnets/validar", params={"cedula": "8-123-456", "comercio_id": otra},
                   headers=caja).status_code == 403
    [canje] = canjes(api)
    assert canje.comercio_id == tienda


def test_el_admin_debe_elegir_la_tienda(api):
    tienda, _ = crear_tienda(api)
    admin = entrar(api)
    r = api.get("/api/carnets/validar", params={"cedula": "8-123-456"}, headers=admin)
    assert r.status_code == 400 and "tienda" in r.json()["error"]
    r = api.get("/api/carnets/validar", params={"cedula": "8-123-456", "comercio_id": tienda}, headers=admin)
    assert r.status_code == 200 and r.json()["descuento"]["comercio"] == "Café Campus"


def test_ofertas_de_hoy_de_la_tienda_de_la_sesion(api):
    _, caja = crear_tienda(api, ofertas=(("porcentaje", 10, "10 % en el menú"), ("2x1", 50, "2x1 en combos")))
    r = api.get("/api/validacion/tienda", headers=caja)
    assert r.status_code == 200
    datos = r.json()
    assert datos["nombre"] == "Café Campus" and len(datos["ofertas"]) == 2
    assert datos["aplicada"] == datos["ofertas"][0]["id"] and datos["ofertas"][0]["principal"] is True
    assert api.get("/api/validacion/tienda").status_code == 401


def test_tienda_sin_ofertas_hoy_o_inactiva(api):
    _, sin_ofertas = crear_tienda(api, ofertas=())
    r = api.get("/api/carnets/validar", params={"cedula": "8-123-456"}, headers=sin_ofertas)
    assert r.status_code == 400 and "ofertas vigentes hoy" in r.json()["error"]
    inactiva = tienda_de_pruebas(api, "Cerrada", activa=False)
    r = api.get("/api/carnets/validar", params={"cedula": "8-123-456"}, headers=caja_de(api, inactiva))
    assert r.status_code == 400 and "no está activa" in r.json()["error"]
    admin = entrar(api)
    assert api.get("/api/carnets/validar", params={"cedula": "8-123-456", "comercio_id": 999},
                   headers=admin).status_code == 400


# --- sesión de administrador ---------------------------------------------------------------------

def test_contrasena_cifrada():
    guardada = cifrar_contrasena("secreta")
    assert "secreta" not in guardada
    assert verificar_contrasena("secreta", guardada) and not verificar_contrasena("otra", guardada)
    assert not verificar_contrasena("secreta", "texto-plano")


def test_token_firmado_y_con_vencimiento():
    token, _ = crear_token(1, "admin", "clave", 60)
    assert leer_token(token, "clave")["sub"] == 1
    assert leer_token(token, "otra-clave") is None
    assert leer_token(token[:-2] + "xx", "clave") is None
    vencido, _ = crear_token(1, "admin", "clave", -1)
    assert leer_token(vencido, "clave") is None


def test_admin_inicial_creado_sin_contrasena_en_claro(api):
    with api.app.state.sesiones() as sesion:
        admin = sesion.scalars(select(Usuario)).one()
    assert admin.usuario == "admin" and admin.rol == "admin" and admin.contrasena.startswith("scrypt$")


def test_login_y_reportes_solo_para_admin(api):
    assert api.get("/api/reportes").status_code == 401
    assert api.get("/api/reportes", headers={"Authorization": "Bearer inventado"}).status_code == 401
    malo = api.post("/api/auth/login", json={"usuario": "admin", "contrasena": "incorrecta"})
    assert malo.status_code == 401 and "token" not in malo.json()
    assert api.post("/api/auth/login", json={"usuario": "nadie", "contrasena": "x"}).status_code == 401

    r = api.post("/api/auth/login", json={"usuario": "Admin", "contrasena": "actitud2026"})
    assert r.status_code == 200
    sesion = r.json()
    assert sesion["usuario"]["rol"] == "admin" and sesion["expiraEn"] > time.time()
    encabezados = {"Authorization": f"Bearer {sesion['token']}"}
    assert api.get("/api/auth/sesion", headers=encabezados).json()["usuario"] == "admin"
    assert api.get("/api/reportes", headers=encabezados).status_code == 200


def test_usuario_desactivado_pierde_la_sesion(api):
    token = api.post("/api/auth/login", json={"usuario": "admin", "contrasena": "actitud2026"}).json()["token"]
    with api.app.state.sesiones.begin() as sesion:
        sesion.scalars(select(Usuario)).one().activo = False
    assert api.get("/api/reportes", headers={"Authorization": f"Bearer {token}"}).status_code == 401
