"""Panel del comercio (objetivo 5) y reporte de validación (objetivo 6) del anteproyecto."""
from datetime import date, timedelta

from app.reportes import FilaValidacion, ahora_panama, calcular_validacion, percentil


def entrar(api, usuario="admin", contrasena="actitud2026") -> dict:
    r = api.post("/api/auth/login", json={"usuario": usuario, "contrasena": contrasena})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def tienda_con_usuario(api, nombre="Bonage", usuario="bonage") -> tuple[int, dict, dict]:
    admin = entrar(api)
    r = api.post("/api/admin/comercios", json={"nombre": nombre, "categoria": "Shopping"}, headers=admin)
    assert r.status_code == 201, r.text
    tienda = r.json()["id"]
    r = api.post(f"/api/admin/comercios/{tienda}/usuarios",
                 json={"usuario": usuario, "nombre": "Caja 1", "contrasena": "clave-segura"}, headers=admin)
    assert r.status_code == 201, r.text
    return tienda, admin, entrar(api, usuario, "clave-segura")


def oferta(**cambios) -> dict:
    return {"tipo": "porcentaje", "porcentaje": 15, "descripcion": "15 % en mercancía a precio regular", **cambios}


def hoy() -> date:
    return ahora_panama().date()


# --- administración de comercios -----------------------------------------------------------------

def test_admin_afilia_tienda_y_crea_su_usuario(api):
    tienda, _, comercio = tienda_con_usuario(api)
    sesion = api.get("/api/auth/sesion", headers=comercio).json()
    assert sesion["rol"] == "comercio" and sesion["comercioId"] == tienda and sesion["comercio"] == "Bonage"


def test_nombre_de_tienda_y_usuario_no_se_repiten(api):
    _, admin, _ = tienda_con_usuario(api)
    assert api.post("/api/admin/comercios", json={"nombre": "bonage", "categoria": "Shopping"},
                    headers=admin).status_code == 409
    otra = api.post("/api/admin/comercios", json={"nombre": "Leonisa", "categoria": "Shopping"}, headers=admin).json()
    r = api.post(f"/api/admin/comercios/{otra['id']}/usuarios",
                 json={"usuario": "BONAGE", "nombre": "Caja 2", "contrasena": "clave-segura"}, headers=admin)
    assert r.status_code == 409


def test_usuario_de_comercio_desactivado_no_entra(api):
    tienda, admin, _ = tienda_con_usuario(api)
    usuario_id = api.get(f"/api/panel/comercios/{tienda}", headers=admin).json()["usuarios"][0]["id"]
    assert api.patch(f"/api/admin/usuarios/{usuario_id}", json={"activo": False}, headers=admin).status_code == 200
    assert api.post("/api/auth/login", json={"usuario": "bonage", "contrasena": "clave-segura"}).status_code == 401


# --- permisos --------------------------------------------------------------------------------------

def test_comercio_solo_ve_y_gestiona_su_tienda(api):
    tienda, admin, comercio = tienda_con_usuario(api)
    otra = api.post("/api/admin/comercios", json={"nombre": "Leonisa", "categoria": "Shopping"}, headers=admin).json()["id"]
    assert api.get(f"/api/panel/comercios/{tienda}", headers=comercio).status_code == 200
    assert api.get(f"/api/panel/comercios/{otra}", headers=comercio).status_code == 403
    assert api.post(f"/api/panel/comercios/{otra}/descuentos", json=oferta(), headers=comercio).status_code == 403
    assert api.get(f"/api/panel/comercios/{otra}/metricas", headers=comercio).status_code == 403
    # Lo del administrador tampoco
    assert api.get("/api/admin/comercios", headers=comercio).status_code == 403
    assert api.get("/api/reportes", headers=comercio).status_code == 403
    assert api.get("/api/reportes/validacion", headers=comercio).status_code == 403
    assert api.get(f"/api/panel/comercios/{tienda}").status_code == 401


# --- ofertas y configuración del descuento ---------------------------------------------------------

def test_comercio_publica_oferta_y_se_aplica_al_validar(api):
    tienda, _, comercio = tienda_con_usuario(api)
    r = api.post(f"/api/panel/comercios/{tienda}/descuentos", json=oferta(), headers=comercio)
    assert r.status_code == 201 and r.json()["descuentos"][0]["aplicaHoy"] is True
    validacion = api.get("/api/carnets/validar", params={"cedula": "8-123-456", "comercio_id": tienda}).json()
    assert validacion["descuento"]["porcentaje"] == 15


def test_el_descuento_principal_es_el_que_se_aplica(api):
    tienda, _, comercio = tienda_con_usuario(api)
    api.post(f"/api/panel/comercios/{tienda}/descuentos", json=oferta(), headers=comercio)
    detalle = api.post(f"/api/panel/comercios/{tienda}/descuentos",
                       json=oferta(porcentaje=25, descripcion="25 % en lentes", principal=True), headers=comercio).json()
    assert detalle["descuentoHoy"] == detalle["descuentos"][1]["id"]
    # Marcar otro como principal le quita la marca al anterior
    primero = detalle["descuentos"][0]
    detalle = api.put(f"/api/panel/comercios/{tienda}/descuentos/{primero['id']}",
                      json=oferta(principal=True), headers=comercio).json()
    assert [d["principal"] for d in detalle["descuentos"]] == [True, False]
    validacion = api.get("/api/carnets/validar", params={"cedula": "8-123-456", "comercio_id": tienda}).json()
    assert validacion["descuento"]["porcentaje"] == 15


def test_oferta_fuera_de_sus_dias_o_vencida_no_se_aplica(api):
    tienda, _, comercio = tienda_con_usuario(api)
    otros_dias = "".join(str(d) for d in range(7) if d != hoy().weekday())
    api.post(f"/api/panel/comercios/{tienda}/descuentos", json=oferta(diasSemana=otros_dias), headers=comercio)
    api.post(f"/api/panel/comercios/{tienda}/descuentos",
             json=oferta(descripcion="Vencida", vigenteHasta=(hoy() - timedelta(days=1)).isoformat()), headers=comercio)
    r = api.get("/api/carnets/validar", params={"cedula": "8-123-456", "comercio_id": tienda})
    assert r.status_code == 400 and "vigentes hoy" in r.json()["error"]
    assert all(c["id"] != tienda for c in api.get("/api/comercios").json())


def test_reglas_de_la_oferta(api):
    tienda, _, comercio = tienda_con_usuario(api)
    r = api.post(f"/api/panel/comercios/{tienda}/descuentos", json=oferta(tipo="2x1", porcentaje=10), headers=comercio)
    assert r.json()["descuentos"][0]["porcentaje"] == 50  # 2x1 equivale a 50 %
    r = api.post(f"/api/panel/comercios/{tienda}/descuentos",
                 json=oferta(vigenteDesde="2026-12-31", vigenteHasta="2026-01-01"), headers=comercio)
    assert r.status_code == 400 and "vigencia" in r.json()["error"]
    assert api.post(f"/api/panel/comercios/{tienda}/descuentos", json=oferta(porcentaje=0),
                    headers=comercio).status_code == 400
    assert api.post(f"/api/panel/comercios/{tienda}/descuentos", json=oferta(diasSemana="78"),
                    headers=comercio).status_code == 400


def test_oferta_usada_no_se_borra_se_desactiva(api):
    tienda, _, comercio = tienda_con_usuario(api)
    usada = api.post(f"/api/panel/comercios/{tienda}/descuentos", json=oferta(), headers=comercio).json()["descuentos"][0]
    api.get("/api/carnets/validar", params={"cedula": "8-123-456", "comercio_id": tienda})
    r = api.delete(f"/api/panel/comercios/{tienda}/descuentos/{usada['id']}", headers=comercio)
    assert r.status_code == 409
    nueva = api.post(f"/api/panel/comercios/{tienda}/descuentos", json=oferta(descripcion="Nueva"),
                     headers=comercio).json()["descuentos"][1]
    assert api.delete(f"/api/panel/comercios/{tienda}/descuentos/{nueva['id']}", headers=comercio).status_code == 204


# --- métricas del comercio ---------------------------------------------------------------------------

def test_metricas_del_comercio(api):
    tienda, _, comercio = tienda_con_usuario(api)
    api.post(f"/api/panel/comercios/{tienda}/descuentos", json=oferta(), headers=comercio)
    api.get("/api/carnets/validar", params={"cedula": "8-123-456", "comercio_id": tienda})
    api.get("/api/carnets/validar", params={"cedula": "8-234-567", "comercio_id": tienda})  # inactivo
    m = api.get(f"/api/panel/comercios/{tienda}/metricas", params={"dias": 7}, headers=comercio).json()
    assert m["resumen"]["canjes"] == 1 and m["resumen"]["estudiantesUnicos"] == 1
    assert m["ofertas"] == [{"descripcion": "15 % en mercancía a precio regular", "canjes": 1}]
    assert m["validacion"]["total"] == 2 and m["validacion"]["activos"] == 1
    assert "alertas" not in m and "tiendas" not in m


# --- reporte de validación ----------------------------------------------------------------------------

def test_reporte_de_validacion_mide_tiempos_y_tasa_de_exito(api):
    admin = entrar(api)
    api.get("/api/carnets/validar", params={"cedula": "8-123-456"})
    api.get("/api/carnets/validar", params={"cedula": "8-234-567"})
    api.get("/api/carnets/validar", params={"cedula": "8-999-999"})
    assert api.get("/api/reportes/validacion").status_code == 401
    r = api.get("/api/reportes/validacion", params={"dias": 7}, headers=admin).json()
    assert r["resumen"]["total"] == 3 and r["resumen"]["exitosas"] == 3 and r["resumen"]["tasaExito"] == 100.0
    assert r["resumen"]["activos"] == 1
    assert r["tiempos"]["medidas"] == 3 and r["tiempos"]["mediana"] is not None
    assert sum(t["validaciones"] for t in r["tramos"]) == 3
    assert r["porCriterio"][0]["nombre"] == "Cédula escrita"
    assert len(r["porDia"]) == 7


def test_calculo_del_reporte_de_validacion():
    dia = date(2026, 11, 24)
    from datetime import datetime
    filas = [FilaValidacion(datetime(2026, 11, 24, 10), "qr", "ACTIVO", 300, "Bonage"),
             FilaValidacion(datetime(2026, 11, 24, 11), "qr", "INACTIVO", 500, "Bonage"),
             FilaValidacion(datetime(2026, 11, 24, 12), "cedula", "NO_VERIFICADO", 5100, None),
             FilaValidacion(datetime(2026, 11, 24, 13), "qr", "ACTIVO", 900, "Bonage")]
    r = calcular_validacion(filas, dia, dia, meta_ms=2000)
    assert r["resumen"]["tasaExito"] == 75.0 and r["resumen"]["tasaActivos"] == 66.7
    assert r["tiempos"]["mediana"] == 500 and r["tiempos"]["maximo"] == 5100 and r["tiempos"]["dentroMeta"] == 75.0
    assert r["tiemposExitosas"]["maximo"] == 900
    assert [t["validaciones"] for t in r["tramos"]] == [0, 1, 2, 0, 0, 1]
    assert r["porComercio"][0] == {"nombre": "Bonage", "total": 3, "exitosas": 3, "tasaExito": 100.0, "activos": 2,
                                   "medianaMs": 500, "p95Ms": 900}
    assert percentil([], 50) is None and percentil([7], 95) == 7
