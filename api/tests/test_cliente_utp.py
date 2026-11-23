"""Cliente de la API UTP: token, reintento, credenciales, conexión, caché y cupo."""
import httpx
import pytest

from app.cliente_utp import ClienteUtp, ErrorNoVerificado

from .conftest import crear_cliente_utp

ESTUDIANTE = {"cedula": "8-123-456", "nombre": "ANA", "activo": True, "matriculado": True,
              "periodo": {"anio": 2026, "semestre": 2}, "consultado_en": "2026-11-16T14:30:00-05:00"}


class ApiFalsa:
    """Transporte httpx que registra las solicitudes y responde según la configuración."""

    def __init__(self, estado_consulta=200, estado_token=200):
        self.estado_consulta = estado_consulta
        self.estado_token = estado_token
        self.tokens_pedidos = 0
        self.consultas = 0
        self.transporte = httpx.MockTransport(self.responder)

    def responder(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/auth/token"):
            self.tokens_pedidos += 1
            if self.estado_token != 200:
                return httpx.Response(self.estado_token, json={"codigo": "NO_AUTENTICADO"})
            return httpx.Response(200, json={"access_token": f"t{self.tokens_pedidos}", "expires_in": 3600})
        self.consultas += 1
        estado = self.estado_consulta(self) if callable(self.estado_consulta) else self.estado_consulta
        return httpx.Response(estado, json=ESTUDIANTE if estado == 200 else {"codigo": "X", "mensaje": "x"})


def cliente(api: ApiFalsa, **opciones) -> ClienteUtp:
    return ClienteUtp("http://utp/api/v1", "id", "secreto", transporte=api.transporte,
                      cache_segundos=opciones.pop("cache_segundos", 0), **opciones)


def test_reutiliza_el_token():
    api = ApiFalsa()
    c = cliente(api)
    for _ in range(3):
        assert c.consultar_por_cedula("8-123-456").nombre == "ANA"
    assert api.tokens_pedidos == 1 and api.consultas == 3


def test_401_pide_token_nuevo_y_reintenta_una_vez():
    api = ApiFalsa(estado_consulta=lambda a: 401 if a.consultas == 1 else 200)
    assert cliente(api).consultar_por_cedula("8-123-456") is not None
    assert api.tokens_pedidos == 2 and api.consultas == 2


def test_401_persistente_no_entra_en_bucle():
    api = ApiFalsa(estado_consulta=401)
    with pytest.raises(ErrorNoVerificado, match="Avisa al administrador"):
        cliente(api).consultar_por_cedula("8-123-456")
    assert api.consultas == 2


def test_500_no_es_inactivo():
    with pytest.raises(ErrorNoVerificado, match="respondió con un error"):
        cliente(ApiFalsa(estado_consulta=500)).consultar_por_cedula("8-123-456")


def test_credenciales_rechazadas(url_mock):
    c = crear_cliente_utp(url_mock, client_secret="incorrecta")
    with pytest.raises(ErrorNoVerificado, match="no pudo autenticarse"):
        c.consultar_por_cedula("8-123-456")


def test_sin_conexion():
    c = crear_cliente_utp("http://127.0.0.1:1/api/v1")
    with pytest.raises(ErrorNoVerificado, match="No se pudo conectar"):
        c.consultar_por_cedula("8-123-456")


def test_cuerpo_fuera_de_contrato():
    def responder(request):
        if request.url.path.endswith("/auth/token"):
            return httpx.Response(200, json={"access_token": "t", "expires_in": 3600})
        return httpx.Response(200, json={"cedula": "8-123-456"})

    c = ClienteUtp("http://utp/api/v1", "id", "s", transporte=httpx.MockTransport(responder))
    with pytest.raises(ErrorNoVerificado, match="respuesta inesperada"):
        c.consultar_por_cedula("8-123-456")


def test_cache_evita_repetir_la_consulta():
    api = ApiFalsa()
    reloj = [0.0]
    c = cliente(api, cache_segundos=30, reloj=lambda: reloj[0])
    c.validar_carne("QR")
    c.validar_carne("QR")
    assert api.consultas == 1
    reloj[0] = 31
    c.validar_carne("QR")
    assert api.consultas == 2


def test_limite_propio_por_debajo_del_de_la_utp():
    api = ApiFalsa()
    reloj = [0.0]
    c = cliente(api, limite_por_minuto=2, reloj=lambda: reloj[0])
    c.consultar_por_cedula("8-1-1")
    c.consultar_por_cedula("8-1-2")
    with pytest.raises(ErrorNoVerificado) as error:
        c.consultar_por_cedula("8-1-3")
    assert error.value.reintentar_en == 60
    assert api.consultas == 2
    reloj[0] = 60
    c.consultar_por_cedula("8-1-3")
    assert api.consultas == 3
