"""Reportería (propuesta): cálculo de indicadores, mínimo por grupo, alertas y endpoints."""
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.db import Canje, Comercio, Descuento, MatriculaFacultad
from app.reportes import FilaCanje, calcular, detectar_alertas, etiqueta_descuento, identificador_anonimo

HOY = date(2026, 11, 20)  # viernes


def fila(estudiante="a", comercio="Café", categoria="Comida", tipo="porcentaje", porcentaje=10, facultad="FISC",
         carrera="Software", cuando=datetime(2026, 11, 20, 12, 30), monto=None):
    descuento = (monto * porcentaje / 100).quantize(Decimal("0.01")) if monto is not None else None
    return FilaCanje(cuando, comercio, categoria, tipo, porcentaje, estudiante, facultad, carrera, monto, descuento)


def test_identificador_anonimo_es_estable_y_no_contiene_la_cedula():
    a = identificador_anonimo("8-123-456", "clave")
    assert a == identificador_anonimo("8-123-456", "clave")
    assert a != identificador_anonimo("8-123-456", "otra-clave")
    assert "8-123-456" not in a and len(a) == 64


def test_etiquetas_de_descuento_como_el_sitio_de_actitud():
    assert [etiqueta_descuento(t, p) for t, p in [("porcentaje", 10), ("porcentaje", 15), ("porcentaje", 30),
                                                  ("2x1", 50), ("porcentaje", 20), ("otro", 20)]] == \
        ["10 %", "15 %", "30 %", "2x1", "Otros", "Otros"]


def test_resumen():
    filas = [fila("a", monto=Decimal("10.00")), fila("a", porcentaje=30), fila("b", tipo="2x1", porcentaje=50,
                                                                               monto=Decimal("20.00"))]
    r = calcular(filas, [fila("x")], ["ACTIVO"] * 4 + ["INACTIVO", "NO_ENCONTRADO", "NO_VERIFICADO"], {}, HOY, HOY)
    res = r["resumen"]
    assert res["canjes"] == 3 and res["canjesAnterior"] == 1 and res["variacionCanjes"] == 200.0
    assert res["estudiantesUnicos"] == 2
    assert res["recurrencia"] == 50.0  # "a" canjeó 2 veces
    assert res["descuentoPromedio"] == 30.0  # (10 + 30 + 50) / 3
    assert res["ahorroTotal"] == 11.0  # 1.00 + 10.00
    assert res["ticketPromedio"] == 15.0
    assert res["conversion"] == 75.0  # 3 canjes / 4 validaciones activas
    assert res["tasaRechazo"] == 33.3  # 2 de 6 (sin contar la no verificada)


def test_mapa_de_calor_y_pico():
    filas = [fila(cuando=datetime(2026, 11, 20, 12, m)) for m in range(3)] + [fila(cuando=datetime(2026, 11, 16, 9))]
    r = calcular(filas, [], [], {}, HOY - timedelta(days=6), HOY)
    assert r["horario"]["matriz"][4][12] == 3  # viernes a las 12
    assert r["horario"]["matriz"][0][9] == 1  # lunes a las 9
    assert r["horario"]["pico"] == {"dia": "Viernes", "hora": 12, "canjes": 3}
    assert len(r["porDia"]) == 7 and r["porDia"][-1] == {"fecha": "2026-11-20", "canjes": 3}


def test_grupos_pequenos_se_juntan_en_otros():
    grandes = [fila(f"e{i}", facultad="FISC") for i in range(5)]
    pequenas = [fila("p1", facultad="FCT", carrera="Forestal"), fila("p2", facultad="FIM", carrera="Aeronáutica")]
    r = calcular(grandes + pequenas, [], [], {"FISC": 100, "FCT": 50}, HOY, HOY, minimo_grupo=5)
    nombres = [g["nombre"] for g in r["facultades"]]
    assert nombres == ["FISC", "Otras facultades"]
    assert r["facultades"][0]["porCada100"] == 5.0
    assert r["facultades"][1] == {"nombre": "Otras facultades", "canjes": 2, "estudiantes": 2, "agrupado": True,
                                  "matricula": None, "porCada100": None}
    assert "Forestal" not in [c["nombre"] for c in r["carreras"]]


def test_ranking_de_tiendas_y_tipos():
    filas = [fila(comercio="Cine", categoria="Entretenimiento", tipo="2x1", porcentaje=50)] * 3 + [fila()]
    r = calcular(filas, [], [], {}, HOY, HOY)
    assert [t["nombre"] for t in r["tiendas"]] == ["Cine", "Café"]
    assert {d["tipo"]: d["canjes"] for d in r["descuentos"]} == {"10 %": 1, "15 %": 0, "30 %": 0, "2x1": 3, "Otros": 0}


def test_alertas():
    base = datetime(2026, 11, 20, 13, 0)
    filas = [fila("s", "Café", cuando=base), fila("s", "Cine", cuando=base + timedelta(minutes=4)),
             fila("n", "Café", cuando=base), fila("n", "Cine", cuando=base + timedelta(hours=2))]
    filas += [fila("r", "Pizza", cuando=base + timedelta(minutes=i * 30)) for i in range(4)]
    alertas = detectar_alertas(filas)
    tipos = sorted(a["tipo"] for a in alertas)
    assert tipos == ["repetido", "simultaneo"]
    assert all("8-" not in a["detalle"] for a in alertas)


# --- endpoints ---------------------------------------------------------------------------------

def preparar_comercio(api) -> tuple[int, int]:
    with api.app.state.sesiones.begin() as sesion:
        comercio = Comercio(nombre="Café Campus", categoria="Comida")
        comercio.descuentos = [Descuento(tipo="porcentaje", porcentaje=15, descripcion="15 % en bebidas")]
        sesion.add(comercio)
        sesion.add(MatriculaFacultad(facultad="Facultad de Ingeniería de Sistemas Computacionales", estudiantes=1000))
        sesion.flush()
        return comercio.id, comercio.descuentos[0].id


def caja(api, comercio: int) -> dict:
    from .conftest import caja_de
    return caja_de(api, comercio)


def test_comercios(api):
    preparar_comercio(api)
    datos = api.get("/api/comercios").json()
    assert datos[0]["nombre"] == "Café Campus" and datos[0]["descuentos"][0]["porcentaje"] == 15


def test_canje_de_estudiante_activo(api):
    comercio, descuento = preparar_comercio(api)
    r = api.post("/api/canjes", json={"comercio_id": comercio, "descuento_id": descuento, "cedula": "8-123-456",
                                      "monto_compra": "12.50"}, headers=caja(api, comercio))
    assert r.status_code == 201, r.text
    assert r.json()["montoDescuento"] == 1.88
    with api.app.state.sesiones() as sesion:
        canje = sesion.scalars(select(Canje)).one()
    assert canje.facultad == "Facultad de Ingeniería de Sistemas Computacionales"
    assert canje.estudiante != "8-123-456" and len(canje.estudiante) == 64


def test_canje_por_qr(api):
    comercio, descuento = preparar_comercio(api)
    r = api.post("/api/canjes", json={"comercio_id": comercio, "descuento_id": descuento,
                                      "qr": "OC0xMjMtNDU2QHV0cC5hYy5wYQ=="}, headers=caja(api, comercio))
    assert r.status_code == 201


def test_canje_rechazado_si_esta_inactivo_o_no_existe(api):
    comercio, descuento = preparar_comercio(api)
    h = caja(api, comercio)
    r = api.post("/api/canjes", json={"comercio_id": comercio, "descuento_id": descuento, "cedula": "8-234-567"}, headers=h)
    assert r.status_code == 409
    r = api.post("/api/canjes", json={"comercio_id": comercio, "descuento_id": descuento, "cedula": "8-999-999"}, headers=h)
    assert r.status_code == 404
    with api.app.state.sesiones() as sesion:
        assert sesion.scalars(select(Canje)).all() == []


def test_canje_con_descuento_de_otro_comercio(api):
    comercio, descuento = preparar_comercio(api)
    h = caja(api, comercio)
    # El personal de tienda no registra canjes a nombre de otra tienda.
    r = api.post("/api/canjes", json={"comercio_id": comercio + 99, "descuento_id": descuento, "cedula": "8-123-456"}, headers=h)
    assert r.status_code == 403
    admin = {"Authorization": "Bearer " + api.post("/api/auth/login", json={"usuario": "admin", "contrasena": "actitud2026"}).json()["token"]}
    r = api.post("/api/canjes", json={"comercio_id": comercio + 99, "descuento_id": descuento, "cedula": "8-123-456"}, headers=admin)
    assert r.status_code == 400


def test_reportes_endpoint(api):
    comercio, descuento = preparar_comercio(api)
    h = caja(api, comercio)
    api.get("/api/carnets/validar", params={"cedula": "8-123-456"}, headers=h)
    api.post("/api/canjes", json={"comercio_id": comercio, "descuento_id": descuento, "cedula": "8-123-456"}, headers=h)
    assert api.get("/api/reportes", params={"dias": 7}).status_code == 401  # sin sesión
    token = api.post("/api/auth/login", json={"usuario": "admin", "contrasena": "actitud2026"}).json()["token"]
    encabezados = {"Authorization": f"Bearer {token}"}
    r = api.get("/api/reportes", params={"dias": 7}, headers=encabezados)
    assert r.status_code == 200
    datos = r.json()
    assert datos["resumen"]["canjes"] == 1
    assert datos["tiendas"][0]["nombre"] == "Café Campus"
    assert len(datos["porDia"]) == 7
    # Un solo estudiante: su facultad queda oculta bajo "Otras facultades".
    assert datos["facultades"][0]["nombre"] == "Otras facultades"
    assert api.get("/api/reportes", params={"dias": 0}, headers=encabezados).status_code == 400
