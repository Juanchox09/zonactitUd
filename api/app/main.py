"""API REST de ActitUd: validación del carnet estudiantil UTP para descuentos en Altaplaza Mall.

El estado académico siempre se consulta a la API de Estado de Estudiante de la UTP
(hoy el mock de mock-utp/). Esta API no guarda datos de estudiantes.
"""
from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Literal

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException

from .cliente_utp import ClienteUtp, ErrorNoVerificado, ErrorSolicitud, EstudianteUtp, MENSAJE_QR_INVALIDO
from .config import Configuracion, leer_configuracion
from .db import Canje, Comercio, Descuento, MatriculaFacultad, Usuario, Validacion, crear_motor, preparar_base
from .identificadores import cedula_de_token_qr, cedula_valida
from .limite import LimitePorIp
from .qr_imagen import TAMANO_MAXIMO, leer_qr
from .reportes import FilaCanje, ahora_panama, calcular, identificador_anonimo
from .seguridad import cifrar_contrasena, crear_token, leer_token, verificar_contrasena

log = logging.getLogger("actitud")

Criterio = Literal["cedula", "qr", "imagen"]


class Periodo(BaseModel):
    anio: int
    semestre: int


class DescuentoAplicado(BaseModel):
    """Descuento que corresponde al estudiante activo en la tienda que validó. Ya quedó registrado."""
    canjeId: int
    comercio: str
    descripcion: str
    tipo: str
    porcentaje: int
    # True si el mismo estudiante ya se había validado en esta tienda hace pocos minutos (no se duplica).
    yaRegistrado: bool = False


class Titular(BaseModel):
    nombre: str
    cedula: str
    tipo: Literal["Estudiante"] = "Estudiante"
    unidad: str
    programa: str | None = None
    sede: str | None = None
    estado: Literal["ACTIVO", "INACTIVO"]
    periodo: Periodo
    motivo: str | None = None
    fuente: Literal["utp"] = "utp"
    descuento: DescuentoAplicado | None = None

    @classmethod
    def desde_utp(cls, e: EstudianteUtp) -> Titular:
        return cls(
            nombre=e.nombre,
            cedula=e.cedula,
            unidad=e.facultad or e.sede or "Universidad Tecnológica de Panamá",
            programa=e.carrera,
            sede=e.sede,
            # El contrato define activo = matriculado en el periodo vigente.
            estado="ACTIVO" if e.activo else "INACTIVO",
            periodo=Periodo(anio=e.periodo_anio, semestre=e.periodo_semestre),
            motivo=None if e.activo else "No matriculado en el periodo vigente",
        )


class Error(BaseModel):
    error: str


class SolicitudCanje(BaseModel):
    comercio_id: int
    descuento_id: int
    cedula: str | None = Field(None, max_length=30)
    qr: str | None = Field(None, max_length=512)
    monto_compra: Decimal | None = Field(None, gt=0, le=100_000, decimal_places=2)


class SolicitudLogin(BaseModel):
    usuario: str = Field(..., min_length=1, max_length=40)
    contrasena: str = Field(..., min_length=1, max_length=200)


class UsuarioSesion(BaseModel):
    usuario: str
    nombre: str
    rol: str


class Sesion(BaseModel):
    token: str
    expiraEn: int
    usuario: UsuarioSesion


class Salud(BaseModel):
    estado: Literal["ok"]
    baseDatos: Literal["ok", "error"]
    validacionesRegistradas: int | None


def _error(codigo: int, mensaje: str, encabezados: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse({"error": mensaje}, status_code=codigo, headers=encabezados)


def crear_app(config: Configuracion | None = None, *, cliente: ClienteUtp | None = None,
              sesiones: sessionmaker[Session] | None = None) -> FastAPI:
    config = config or leer_configuracion()

    def crear_admin_inicial(fabrica: sessionmaker[Session]) -> None:
        with fabrica.begin() as sesion:
            if not sesion.scalar(select(Usuario).where(Usuario.usuario == config.admin_usuario.strip().lower())):
                sesion.add(Usuario(usuario=config.admin_usuario.strip().lower(), nombre=config.admin_nombre, rol="admin",
                                   contrasena=cifrar_contrasena(config.admin_contrasena)))
                log.info("Se creó el usuario administrador inicial «%s».", config.admin_usuario)

    @asynccontextmanager
    async def ciclo_de_vida(app: FastAPI):
        app.state.sesiones = sesiones or preparar_base(crear_motor(config.database_url))
        crear_admin_inicial(app.state.sesiones)
        app.state.cliente = cliente or ClienteUtp(
            config.utp_api_url, config.utp_client_id, config.utp_client_secret,
            timeout_s=config.utp_timeout_s, limite_por_minuto=config.utp_limite_por_minuto,
            cache_segundos=config.utp_cache_segundos)
        log.info("API UTP: %s", config.utp_api_url)
        yield
        if cliente is None:
            app.state.cliente.cerrar()

    app = FastAPI(
        title="ActitUd · Validación de carnet UTP",
        version="1.0.0",
        description="Valida si el portador de un carnet UTP es estudiante activo, consultando la API de "
                    "Estado de Estudiante de la UTP. Programa de descuentos ActitUd de Altaplaza Mall.",
        lifespan=ciclo_de_vida,
    )
    app.add_middleware(CORSMiddleware, allow_origins=config.origenes_cors, allow_methods=["GET", "POST"],
                       allow_headers=["Content-Type", "Authorization"])
    limite = LimitePorIp(config.rate_limit_max)
    limite_login = LimitePorIp(10)  # intentos de inicio de sesión por minuto y por IP

    @app.middleware("http")
    async def privacidad_y_registro(request: Request, call_next):
        inicio = time.perf_counter()
        respuesta = await call_next(request)
        # Las respuestas contienen datos personales: que ningún proxy ni navegador las guarde.
        respuesta.headers["Cache-Control"] = "no-store"
        # Se registra la ruta SIN la cadena de consulta: ahí van cédulas y tokens QR.
        log.info("%s %s → %s (%.0f ms)", request.method, request.url.path, respuesta.status_code,
                 (time.perf_counter() - inicio) * 1000)
        return respuesta

    @app.exception_handler(StarletteHTTPException)
    async def error_http(_request: Request, exc: StarletteHTTPException):
        mensaje = "Ruta no encontrada." if exc.status_code == 404 else str(exc.detail)
        return _error(exc.status_code, mensaje, getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def error_validacion(_request: Request, _exc: RequestValidationError):
        return _error(400, "Parámetros no válidos.")

    def registrar(criterio: Criterio, resultado: str) -> None:
        try:
            with app.state.sesiones.begin() as sesion:
                sesion.add(Validacion(criterio=criterio, resultado=resultado))
        except Exception:  # la bitácora nunca debe impedir responder al comercio
            log.exception("No se pudo registrar la validación en la bitácora.")

    def descuento_principal(comercio_id: int) -> Descuento | None:
        """El descuento que se aplica al validar en esa tienda: su primera oferta activa."""
        with app.state.sesiones() as sesion:
            comercio = sesion.get(Comercio, comercio_id)
            if not comercio or not comercio.activo:
                return None
            descuento = next((d for d in comercio.descuentos if d.activo), None)
            if descuento:
                descuento.comercio  # carga el comercio antes de cerrar la sesión
            return descuento

    def guardar_canje(estudiante: EstudianteUtp, descuento: Descuento,
                      monto: Decimal | None = None) -> tuple[Canje, bool]:
        """Registra el descuento aplicado. Si el mismo estudiante ya se validó en esa tienda hace menos de
        VENTANA_CANJE_MIN minutos (p. ej. escanearon dos veces), devuelve ese canje en vez de duplicarlo."""
        anonimo = identificador_anonimo(estudiante.cedula, config.clave_anonimizacion)
        ahora = ahora_panama()
        with app.state.sesiones.begin() as sesion:
            previo = sesion.scalars(
                select(Canje).where(Canje.estudiante == anonimo, Canje.comercio_id == descuento.comercio_id,
                                    Canje.creado_en >= ahora - timedelta(minutes=config.ventana_canje_min))
                .order_by(Canje.creado_en.desc()).limit(1)).first()
            if previo:
                return previo, True
            monto_descuento = (monto * descuento.porcentaje / 100).quantize(Decimal("0.01")) if monto is not None else None
            canje = Canje(comercio_id=descuento.comercio_id, descuento_id=descuento.id, estudiante=anonimo,
                          facultad=estudiante.facultad or "Sin facultad", sede=estudiante.sede,
                          carrera=estudiante.carrera, periodo_anio=estudiante.periodo_anio,
                          periodo_semestre=estudiante.periodo_semestre, porcentaje=descuento.porcentaje,
                          monto_compra=monto, monto_descuento=monto_descuento, creado_en=ahora)
            sesion.add(canje)
            sesion.flush()
            return canje, False

    def consultar(criterio: Criterio, tipo: Literal["cedula", "qr"], valor: str,
                  comercio_id: int | None = None) -> JSONResponse | Titular:
        descuento = None
        if comercio_id is not None:
            descuento = descuento_principal(comercio_id)
            if descuento is None:
                return _error(400, "La tienda no existe, no está activa o no tiene descuentos activos.")
        cliente: ClienteUtp = app.state.cliente
        try:
            estudiante = cliente.consultar_por_cedula(valor) if tipo == "cedula" else cliente.validar_carne(valor)
        except ErrorSolicitud as error:
            return _error(400, str(error))
        except ErrorNoVerificado as error:
            registrar(criterio, "NO_VERIFICADO")
            encabezados = {"Retry-After": str(error.reintentar_en)} if error.reintentar_en else None
            return _error(503, str(error), encabezados)
        if estudiante is None:
            registrar(criterio, "NO_ENCONTRADO")
            return _error(404, "No existe un estudiante asociado a ese carnet.")
        titular = Titular.desde_utp(estudiante)
        registrar(criterio, titular.estado)
        if descuento is not None and estudiante.activo:
            try:
                canje, repetido = guardar_canje(estudiante, descuento)
                titular.descuento = DescuentoAplicado(
                    canjeId=canje.id, comercio=descuento.comercio.nombre, descripcion=descuento.descripcion,
                    tipo=descuento.tipo, porcentaje=descuento.porcentaje, yaRegistrado=repetido)
            except Exception:  # el estado del estudiante igual se informa al comercio
                log.exception("No se pudo registrar el canje.")
        return titular

    def usuario_actual(request: Request) -> Usuario:
        encabezado = request.headers.get("Authorization", "")
        datos = leer_token(encabezado[7:], config.clave_sesion) if encabezado.startswith("Bearer ") else None
        if datos is None:
            raise HTTPException(401, "Inicia sesión como administrador.", headers={"WWW-Authenticate": "Bearer"})
        with app.state.sesiones() as sesion:
            usuario = sesion.get(Usuario, datos.get("sub"))
        if not usuario or not usuario.activo:
            raise HTTPException(401, "La sesión ya no es válida.", headers={"WWW-Authenticate": "Bearer"})
        return usuario

    def solo_admin(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
        if usuario.rol != "admin":
            raise HTTPException(403, "Solo un administrador puede ver los reportes.")
        return usuario

    def limite_excedido(request: Request) -> JSONResponse | None:
        espera = limite.segundos_de_espera(request.client.host if request.client else "desconocida")
        if espera:
            return _error(429, f"Demasiadas consultas. Intenta de nuevo en {espera} s.", {"Retry-After": str(espera)})
        return None

    respuestas = {400: {"model": Error}, 404: {"model": Error}, 429: {"model": Error}, 503: {"model": Error}}

    @app.get("/api/salud", response_model=Salud, tags=["sistema"])
    def salud() -> Salud:
        try:
            with app.state.sesiones() as sesion:
                total = sesion.scalar(select(func.count()).select_from(Validacion))
            return Salud(estado="ok", baseDatos="ok", validacionesRegistradas=total)
        except Exception:
            log.exception("La base de datos no responde.")
            return Salud(estado="ok", baseDatos="error", validacionesRegistradas=None)

    @app.get("/api/carnets/validar", response_model=Titular, response_model_exclude_none=True,
             responses=respuestas, tags=["validación"],
             summary="Valida un carnet por cédula o por el contenido del QR del carné UTP")
    def validar(
        request: Request,
        cedula: str | None = Query(None, max_length=30, examples=["8-123-456"]),
        qr: str | None = Query(None, max_length=512, description="Contenido del QR sin modificar (Base64)",
                               examples=["OC0xMjMtNDU2QHV0cC5hYy5wYQ=="]),
        carnet: str | None = Query(None, max_length=40, include_in_schema=False),
        comercio_id: int | None = Query(None, ge=1, description="Tienda que valida. Si el estudiante está "
                                        "activo, se registra el descuento de esa tienda y se devuelve en `descuento`"),
    ):
        if carnet is not None:
            return _error(400, "La UTP no permite consultar por código de carnet. Usa la cédula o el QR del carné.")
        if (cedula is None) == (qr is None):
            return _error(400, "Indica exactamente uno de los parámetros: cedula o qr.")
        if bloqueo := limite_excedido(request):
            return bloqueo
        if cedula is not None:
            valor = cedula_valida(cedula)
            if not valor:
                return _error(400, "Formato de cédula no válido.")
            return consultar("cedula", "cedula", valor, comercio_id)
        valor = qr.strip()
        if not valor:
            return _error(400, "El código QR está vacío.")
        return consultar("qr", "qr", valor, comercio_id)

    @app.post("/api/carnets/validar-imagen", response_model=Titular, response_model_exclude_none=True,
              responses=respuestas, tags=["validación"],
              summary="Valida un carnet a partir de una foto de su código QR (OpenCV)")
    async def validar_imagen(request: Request, imagen: UploadFile = File(...),
                             comercio_id: int | None = Form(None, ge=1)):
        if bloqueo := limite_excedido(request):
            return bloqueo
        contenido = await imagen.read(TAMANO_MAXIMO + 1)
        if len(contenido) > TAMANO_MAXIMO:
            return _error(400, "La imagen supera los 5 MB.")
        try:
            texto = await run_in_threadpool(leer_qr, contenido)
        except ValueError as error:
            return _error(400, str(error))
        if not texto:
            return _error(400, "No se encontró un código QR legible en la imagen.")
        if cedula_de_token_qr(texto):
            return await run_in_threadpool(consultar, "imagen", "qr", texto, comercio_id)
        if cedula := cedula_valida(texto):
            return await run_in_threadpool(consultar, "imagen", "cedula", cedula, comercio_id)
        return _error(400, MENSAJE_QR_INVALIDO)

    # ------------------------------------------------------------------------------------------------
    # Reportería (propuesta, rama dev_juan). Al validar con comercio_id, el canje se registra solo.
    # /reportes exige sesión de administrador. Pendiente: login de cajero para tomar la tienda de la sesión.

    @app.get("/api/comercios", tags=["reportería"], summary="Comercios afiliados y sus descuentos activos")
    def comercios():
        with app.state.sesiones() as sesion:
            filas = sesion.scalars(select(Comercio).where(Comercio.activo).order_by(Comercio.nombre)).all()
            return [{"id": c.id, "nombre": c.nombre, "categoria": c.categoria,
                     "descuentos": [{"id": d.id, "tipo": d.tipo, "porcentaje": d.porcentaje,
                                     "descripcion": d.descripcion} for d in c.descuentos if d.activo]}
                    for c in filas]

    @app.post("/api/canjes", status_code=201, responses={**respuestas, 409: {"model": Error}}, tags=["reportería"],
              summary="Registra un descuento aplicado (solo si el estudiante está activo)")
    def registrar_canje(request: Request, solicitud: SolicitudCanje):
        if (solicitud.cedula is None) == (solicitud.qr is None):
            return _error(400, "Indica exactamente uno de los campos: cedula o qr.")
        if bloqueo := limite_excedido(request):
            return bloqueo
        with app.state.sesiones() as sesion:
            descuento = sesion.get(Descuento, solicitud.descuento_id)
            if not descuento or not descuento.activo or descuento.comercio_id != solicitud.comercio_id:
                return _error(400, "El descuento no pertenece a ese comercio o no está activo.")
        cliente: ClienteUtp = app.state.cliente
        try:
            if solicitud.cedula is not None:
                cedula = cedula_valida(solicitud.cedula)
                if not cedula:
                    return _error(400, "Formato de cédula no válido.")
                estudiante = cliente.consultar_por_cedula(cedula)
            else:
                estudiante = cliente.validar_carne(solicitud.qr.strip())
        except ErrorSolicitud as error:
            return _error(400, str(error))
        except ErrorNoVerificado as error:
            encabezados = {"Retry-After": str(error.reintentar_en)} if error.reintentar_en else None
            return _error(503, str(error), encabezados)
        if estudiante is None:
            return _error(404, "No existe un estudiante asociado a ese carnet.")
        if not estudiante.activo:
            return _error(409, "El estudiante no está activo: no se puede aplicar el descuento.")

        canje, repetido = guardar_canje(estudiante, descuento, solicitud.monto_compra)
        return JSONResponse({"id": canje.id, "descuento": descuento.descripcion, "porcentaje": canje.porcentaje,
                             "montoDescuento": float(canje.monto_descuento) if canje.monto_descuento is not None else None,
                             "yaRegistrado": repetido}, status_code=200 if repetido else 201)

    # ------------------------------------------------------------------------------------------------
    # Inicio de sesión del panel administrativo.

    @app.post("/api/auth/login", response_model=Sesion, responses={401: {"model": Error}, 429: {"model": Error}},
              tags=["sesión"], summary="Inicia sesión de administrador y devuelve un token Bearer")
    def iniciar_sesion(request: Request, solicitud: SolicitudLogin):
        espera = limite_login.segundos_de_espera(request.client.host if request.client else "desconocida")
        if espera:
            return _error(429, f"Demasiados intentos. Espera {espera} s.", {"Retry-After": str(espera)})
        with app.state.sesiones() as sesion:
            usuario = sesion.scalar(select(Usuario).where(Usuario.usuario == solicitud.usuario.strip().lower()))
        # Se verifica igual con una huella falsa para no revelar por el tiempo de respuesta si el usuario existe.
        guardada = usuario.contrasena if usuario else "scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        if not verificar_contrasena(solicitud.contrasena, guardada) or not usuario or not usuario.activo:
            log.warning("Inicio de sesión rechazado.")
            return _error(401, "Usuario o contraseña incorrectos.")
        token, vence = crear_token(usuario.id, usuario.rol, config.clave_sesion, config.sesion_horas * 3600)
        log.info("Inicio de sesión de «%s».", usuario.usuario)
        return Sesion(token=token, expiraEn=vence,
                      usuario=UsuarioSesion(usuario=usuario.usuario, nombre=usuario.nombre, rol=usuario.rol))

    @app.get("/api/auth/sesion", response_model=UsuarioSesion, responses={401: {"model": Error}}, tags=["sesión"],
             summary="Usuario de la sesión actual")
    def sesion_actual(usuario: Usuario = Depends(usuario_actual)):
        return UsuarioSesion(usuario=usuario.usuario, nombre=usuario.nombre, rol=usuario.rol)

    @app.get("/api/reportes", tags=["reportería"], responses={401: {"model": Error}, 403: {"model": Error}},
             summary="Reportes del programa para el panel administrativo (solo administradores)")
    def reportes(dias: int = Query(30, ge=1, le=366, description="Días hacia atrás, contando hoy"),
                 _admin: Usuario = Depends(solo_admin)):
        hasta = ahora_panama().date()
        desde = hasta - timedelta(days=dias - 1)
        desde_anterior = desde - timedelta(days=dias)
        with app.state.sesiones() as sesion:
            consulta = (select(Canje, Comercio.nombre, Comercio.categoria, Descuento.tipo)
                        .join(Comercio, Canje.comercio_id == Comercio.id)
                        .join(Descuento, Canje.descuento_id == Descuento.id)
                        .where(Canje.creado_en >= datetime.combine(desde_anterior, datetime.min.time()),
                               Canje.creado_en < datetime.combine(hasta + timedelta(days=1), datetime.min.time())))
            actuales, anteriores = [], []
            for canje, comercio, categoria, tipo in sesion.execute(consulta):
                fila = FilaCanje(canje.creado_en, comercio, categoria, tipo, canje.porcentaje, canje.estudiante,
                                 canje.facultad, canje.carrera, canje.monto_compra, canje.monto_descuento)
                (actuales if canje.creado_en.date() >= desde else anteriores).append(fila)
            validaciones = sesion.scalars(select(Validacion.resultado).where(
                Validacion.consultado_en >= datetime.combine(desde, datetime.min.time()))).all()
            matricula = {m.facultad: m.estudiantes for m in sesion.scalars(select(MatriculaFacultad))}
        return calcular(actuales, anteriores, validaciones, matricula, desde, hasta, config.minimo_grupo)

    return app


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
# httpx registra cada URL consultada, y la ruta de la API UTP lleva la cédula.
logging.getLogger("httpx").setLevel(logging.WARNING)
app = crear_app()
