"""Gestión de usuarios y permisos de tienda (objetivo 5): cajero = solo valida; administrador = gestiona su tienda."""
from tests.test_panel_comercio import entrar, oferta, tienda_con_usuario

CLAVE = "clave-segura"


def crear(api, tienda: int, headers: dict, usuario: str, permiso: str, ruta: str = "admin"):
    url = (f"/api/admin/comercios/{tienda}/usuarios" if ruta == "admin"
           else f"/api/panel/comercios/{tienda}/usuarios")
    return api.post(url, json={"usuario": usuario, "nombre": f"Persona {usuario}", "contrasena": CLAVE,
                               "permiso": permiso}, headers=headers)


def id_de(api, tienda: int, headers: dict, usuario: str) -> int:
    return next(u["id"] for u in api.get(f"/api/panel/comercios/{tienda}/usuarios", headers=headers).json()
                if u["usuario"] == usuario)


def test_la_sesion_informa_el_permiso_y_registra_el_acceso(api):
    tienda, admin, gerente = tienda_con_usuario(api)
    assert crear(api, tienda, admin, "caja1", "cajero").status_code == 201
    assert api.get("/api/auth/sesion", headers=gerente).json()["permiso"] == "administrador"
    r = api.post("/api/auth/login", json={"usuario": "caja1", "contrasena": CLAVE})
    assert r.status_code == 200 and r.json()["usuario"]["permiso"] == "cajero"
    assert r.json()["usuario"]["comercio"] == "Bonage"
    assert api.get("/api/auth/sesion", headers=admin).json()["permiso"] is None
    usuarios = {u["usuario"]: u for u in api.get("/api/admin/usuarios", headers=admin).json()}
    assert usuarios["caja1"]["ultimoAcceso"] and usuarios["caja1"]["comercio"] == "Bonage"
    assert "contrasena" not in usuarios["caja1"]


def test_el_cajero_solo_valida(api):
    tienda, admin, _ = tienda_con_usuario(api)
    crear(api, tienda, admin, "caja1", "cajero")
    cajero = entrar(api, "caja1", CLAVE)
    assert api.get(f"/api/panel/comercios/{tienda}", headers=cajero).status_code == 403
    assert api.post(f"/api/panel/comercios/{tienda}/descuentos", json=oferta(), headers=cajero).status_code == 403
    assert api.get(f"/api/panel/comercios/{tienda}/metricas", headers=cajero).status_code == 403
    assert api.get(f"/api/panel/comercios/{tienda}/usuarios", headers=cajero).status_code == 403
    assert api.get("/api/reportes", headers=cajero).status_code == 403
    assert api.get("/api/admin/usuarios", headers=cajero).status_code == 403
    r = api.get(f"/api/panel/comercios/{tienda}", headers=cajero)
    assert "caja" in r.json()["error"]


def test_el_administrador_de_tienda_gestiona_solo_a_sus_cajeros(api):
    tienda, admin, gerente = tienda_con_usuario(api)
    otra = api.post("/api/admin/comercios", json={"nombre": "Leonisa", "categoria": "Shopping"}, headers=admin).json()["id"]
    crear(api, otra, admin, "ajeno", "cajero")
    # Crea cajeros, pero no administradores.
    assert crear(api, tienda, gerente, "caja1", "cajero", ruta="panel").status_code == 201
    assert crear(api, tienda, gerente, "jefe2", "administrador", ruta="panel").status_code == 403
    assert crear(api, otra, gerente, "caja9", "cajero", ruta="panel").status_code == 403
    cajero_id = id_de(api, tienda, gerente, "caja1")
    yo = id_de(api, tienda, gerente, "bonage")
    url = f"/api/panel/comercios/{tienda}/usuarios"
    # Cambia nombre, contraseña y estado del cajero; no su permiso.
    assert api.patch(f"{url}/{cajero_id}", json={"nombre": "Caja del frente"}, headers=gerente).status_code == 200
    assert api.patch(f"{url}/{cajero_id}", json={"permiso": "administrador"}, headers=gerente).status_code == 403
    assert api.patch(f"{url}/{cajero_id}", json={"contrasena": "otra-clave-1"}, headers=gerente).status_code == 200
    assert api.post("/api/auth/login", json={"usuario": "caja1", "contrasena": "otra-clave-1"}).status_code == 200
    assert api.patch(f"{url}/{cajero_id}", json={"activo": False}, headers=gerente).status_code == 200
    assert api.post("/api/auth/login", json={"usuario": "caja1", "contrasena": "otra-clave-1"}).status_code == 401
    # No puede tocarse a sí mismo ni a usuarios de otra tienda.
    assert api.patch(f"{url}/{yo}", json={"activo": False}, headers=gerente).status_code == 403
    ajeno = next(u["id"] for u in api.get("/api/admin/usuarios", headers=admin).json() if u["usuario"] == "ajeno")
    assert api.patch(f"{url}/{ajeno}", json={"activo": False}, headers=gerente).status_code == 404
    assert api.delete(f"{url}/{cajero_id}", headers=gerente).status_code == 204
    assert [u["usuario"] for u in api.get(url, headers=gerente).json()] == ["bonage"]


def test_el_admin_cambia_permisos_y_elimina_usuarios(api):
    tienda, admin, _ = tienda_con_usuario(api)
    crear(api, tienda, admin, "caja1", "cajero")
    cajero_id = id_de(api, tienda, admin, "caja1")
    cajero = entrar(api, "caja1", CLAVE)
    assert api.get(f"/api/panel/comercios/{tienda}", headers=cajero).status_code == 403
    r = api.patch(f"/api/admin/usuarios/{cajero_id}", json={"permiso": "administrador"}, headers=admin)
    assert r.status_code == 200
    # El permiso se lee de la base en cada pedido: aplica sin volver a iniciar sesión.
    assert api.get(f"/api/panel/comercios/{tienda}", headers=cajero).status_code == 200
    assert api.delete(f"/api/admin/usuarios/{cajero_id}", headers=admin).status_code == 204
    assert api.get(f"/api/panel/comercios/{tienda}", headers=cajero).status_code == 401
    admin_id = next(u["id"] for u in api.get("/api/admin/usuarios", headers=admin).json() if u["rol"] == "admin")
    assert api.delete(f"/api/admin/usuarios/{admin_id}", headers=admin).status_code == 404
