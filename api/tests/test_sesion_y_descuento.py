"""Descuento de la tienda al validar y login de administrador para ver los reportes."""
import time

from sqlalchemy import select

from app.db import Canje, Comercio, Descuento, Usuario
from app.seguridad import cifrar_contrasena, crear_token, leer_token, verificar_contrasena

QR_ANA = "OC0xMjMtNDU2QHV0cC5hYy5wYQ=="


def crear_tienda(api, ofertas=(("porcentaje", 15, "15 % en bebidas"),), activa=True) -> int:
    with api.app.state.sesiones.begin() as sesion:
        comercio = Comercio(nombre="Café Campus", categoria="Comida", activo=activa)
        comercio.descuentos = [Descuento(tipo=t, porcentaje=p, descripcion=d) for t, p, d in ofertas]
        sesion.add(comercio)
        sesion.flush()
        return comercio.id


def canjes(api) -> list[Canje]:
    with api.app.state.sesiones() as sesion:
        return sesion.scalars(select(Canje)).all()


# --- descuento al validar ----------------------------------------------------------------------

def test_validacion_activa_guarda_el_porcentaje_de_la_tienda(api):
    tienda = crear_tienda(api)
    r = api.get("/api/carnets/validar", params={"cedula": "8-123-456", "comercio_id": tienda})
    assert r.status_code == 200, r.text
    descuento = r.json()["descuento"]
    assert descuento["comercio"] == "Café Campus" and descuento["porcentaje"] == 15
    assert descuento["yaRegistrado"] is False
    [canje] = canjes(api)
    assert canje.comercio_id == tienda and canje.porcentaje == 15 and canje.id == descuento["canjeId"]
    assert canje.facultad == "Facultad de Ingeniería de Sistemas Computacionales"
    assert "8-123-456" not in canje.estudiante


def test_por_qr_tambien_guarda_el_descuento(api):
    tienda = crear_tienda(api)
    r = api.get("/api/carnets/validar", params={"qr": QR_ANA, "comercio_id": tienda})
    assert r.json()["descuento"]["porcentaje"] == 15


def test_se_usa_el_descuento_principal_de_la_tienda(api):
    tienda = crear_tienda(api, ofertas=(("2x1", 50, "2x1 en combos"), ("porcentaje", 10, "10 % en el menú")))
    r = api.get("/api/carnets/validar", params={"cedula": "8-123-456", "comercio_id": tienda})
    assert r.json()["descuento"]["tipo"] == "2x1" and r.json()["descuento"]["porcentaje"] == 50


def test_validar_dos_veces_seguidas_no_duplica_el_canje(api):
    tienda = crear_tienda(api)
    api.get("/api/carnets/validar", params={"cedula": "8-123-456", "comercio_id": tienda})
    r = api.get("/api/carnets/validar", params={"qr": QR_ANA, "comercio_id": tienda})
    assert r.json()["descuento"]["yaRegistrado"] is True
    assert len(canjes(api)) == 1


def test_inactivo_o_no_encontrado_no_guarda_descuento(api):
    tienda = crear_tienda(api)
    r = api.get("/api/carnets/validar", params={"cedula": "8-234-567", "comercio_id": tienda})
    assert r.json()["estado"] == "INACTIVO" and "descuento" not in r.json()
    assert api.get("/api/carnets/validar", params={"cedula": "8-999-999", "comercio_id": tienda}).status_code == 404
    assert canjes(api) == []


def test_sin_tienda_no_registra_canje(api):
    r = api.get("/api/carnets/validar", params={"cedula": "8-123-456"})
    assert r.status_code == 200 and "descuento" not in r.json()
    assert canjes(api) == []


def test_tienda_inexistente_o_inactiva(api):
    assert api.get("/api/carnets/validar", params={"cedula": "8-123-456", "comercio_id": 999}).status_code == 400
    inactiva = crear_tienda(api, activa=False)
    assert api.get("/api/carnets/validar", params={"cedula": "8-123-456", "comercio_id": inactiva}).status_code == 400


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
