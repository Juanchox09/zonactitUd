"""API REST de ActitUd: validación del carnet estudiantil UTP para descuentos en Altaplaza Mall.

El estado académico siempre se consulta a la API de Estado de Estudiante de la UTP
(hoy el mock de mock-utp/). Esta API no guarda datos de estudiantes.
"""
from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Literal

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator, model_validator
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
from .reportes import FilaCanje, FilaValidacion, ahora_panama, calcular, calcular_validacion, identificador_anonimo
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
    rol: Literal["admin", "comercio"]
    # Solo para el rol comercio: la tienda que administra.
    comercioId: int | None = None
    comercio: str | None = None


class DatosDescuento(BaseModel):
    """Oferta que el comercio publica en el programa. 2x1 equivale a 50 % para los promedios."""
    tipo: Literal["porcentaje", "2x1", "otro"]
    porcentaje: int = Field(..., ge=1, le=100)
    descripcion: str = Field(..., min_length=3, max_length=120)
    activo: bool = True
    principal: bool = False
    vigenteDesde: date | None = None
    vigenteHasta: date | None = None
    diasSemana: str = Field("0123456", pattern=r"^[0-6]{1,7}$", description="0 = lunes … 6 = domingo")
    condiciones: str | None = Field(None, max_length=300)

    @field_validator("descripcion", "condiciones")
    @classmethod
    def sin_espacios_sobrantes(cls, valor: str | None) -> str | None:
        return (" ".join(valor.split()) or None) if valor is not None else None

    @model_validator(mode="after")
    def coherente(self) -> DatosDescuento:
        if not self.descripcion or len(self.descripcion) < 3:
            raise ValueError("Descripción vacía.")
        if self.vigenteDesde and self.vigenteHasta and self.vigenteHasta < self.vigenteDesde:
            raise ValueError("La vigencia termina antes de empezar.")
        if self.tipo == "2x1":
            self.porcentaje = 50
        self.diasSemana = "".join(sorted(set(self.diasSemana)))
        return self


class DatosComercio(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=80)
    categoria: str = Field(..., min_length=2, max_length=40)
    activo: bool = True


class DatosUsuarioComercio(BaseModel):
    usuario: str = Field(..., pattern=r"^[A-Za-z0-9._-]{3,40}$")
    nombre: str = Field(..., min_length=2, max_length=80)
    contrasena: str = Field(..., min_length=8, max_length=200)


class CambioUsuario(BaseModel):
    activo: bool | None = None
    contrasena: str | None = Field(None, min_length=8, max_length=200)


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
    app.add_middleware(CORSMiddleware, allow_origins=config.origenes_cors, allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
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
    async def error_validacion(_request: Request, exc: RequestValidationError):
        # Las reglas de negocio de los formularios del panel (p. ej. vigencia al revés) se explican tal cual.
        for detalle in exc.errors():
            if detalle.get("type") == "value_error":
                return _error(400, str(detalle.get("msg", "")).removeprefix("Value error, "))
        return _error(400, "Parámetros no válidos.")

    def registrar(criterio: Criterio, resultado: str, inicio: float, comercio_id: int | None = None) -> None:
        """Bitácora de la validación con su tiempo total de respuesta (para el reporte de validación)."""
        try:
            tiempo_ms = round((time.perf_counter() - inicio) * 1000)
            with app.state.sesiones.begin() as sesion:
                sesion.add(Validacion(criterio=criterio, resultado=resultado, tiempo_ms=tiempo_ms,
                                      comercio_id=comercio_id, consultado_en=ahora_panama()))
        except Exception:  # la bitácora nunca debe impedir responder al comercio
            log.exception("No se pudo registrar la validación en la bitácora.")

    def descuento_principal(comercio_id: int) -> Descuento | None:
        """El descuento que se aplica al validar en esa tienda hoy: el principal si está vigente hoy;
        si no, la primera oferta vigente hoy (activa, dentro de sus fechas y en sus días)."""
        hoy = ahora_panama().date()
        with app.state.sesiones() as sesion:
            comercio = sesion.get(Comercio, comercio_id)
            if not comercio or not comercio.activo:
                return None
            vigentes = [d for d in comercio.descuentos if d.aplica_el(hoy)]
            descuento = next((d for d in vigentes if d.principal), vigentes[0] if vigentes else None)
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
                  comercio_id: int | None = None, inicio: float | None = None) -> JSONResponse | Titular:
        inicio = inicio or time.perf_counter()
        descuento = None
        if comercio_id is not None:
            descuento = descuento_principal(comercio_id)
            if descuento is None:
                return _error(400, "La tienda no existe, no está activa o no tiene descuentos vigentes hoy.")
        cliente: ClienteUtp = app.state.cliente
        try:
            estudiante = cliente.consultar_por_cedula(valor) if tipo == "cedula" else cliente.validar_carne(valor)
        except ErrorSolicitud as error:
            return _error(400, str(error))
        except ErrorNoVerificado as error:
            registrar(criterio, "NO_VERIFICADO", inicio, comercio_id)
            encabezados = {"Retry-After": str(error.reintentar_en)} if error.reintentar_en else None
            return _error(503, str(error), encabezados)
        if estudiante is None:
            registrar(criterio, "NO_ENCONTRADO", inicio, comercio_id)
            return _error(404, "No existe un estudiante asociado a ese carnet.")
        titular = Titular.desde_utp(estudiante)
        if descuento is not None and estudiante.activo:
            try:
                canje, repetido = guardar_canje(estudiante, descuento)
                titular.descuento = DescuentoAplicado(
                    canjeId=canje.id, comercio=descuento.comercio.nombre, descripcion=descuento.descripcion,
                    tipo=descuento.tipo, porcentaje=descuento.porcentaje, yaRegistrado=repetido)
            except Exception:  # el estado del estudiante igual se informa al comercio
                log.exception("No se pudo registrar el canje.")
        registrar(criterio, titular.estado, inicio, comercio_id)
        return titular

    def usuario_actual(request: Request) -> Usuario:
        encabezado = request.headers.get("Authorization", "")
        datos = leer_token(encabezado[7:], config.clave_sesion) if encabezado.startswith("Bearer ") else None
        if datos is None:
            raise HTTPException(401, "Inicia sesión para continuar.", headers={"WWW-Authenticate": "Bearer"})
        with app.state.sesiones() as sesion:
            usuario = sesion.get(Usuario, datos.get("sub"))
        if not usuario or not usuario.activo:
            raise HTTPException(401, "La sesión ya no es válida.", headers={"WWW-Authenticate": "Bearer"})
        return usuario

    def solo_admin(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
        if usuario.rol != "admin":
            raise HTTPException(403, "Solo un administrador puede ver los reportes.")
        return usuario

    def autorizar_comercio(comercio_id: int, usuario: Usuario) -> None:
        """El admin gestiona cualquier tienda; un usuario de comercio, solo la suya."""
        if usuario.rol != "admin" and usuario.comercio_id != comercio_id:
            raise HTTPException(403, "Solo puedes gestionar tu propia tienda.")

    def usuario_sesion(usuario: Usuario) -> UsuarioSesion:
        nombre_comercio = None
        if usuario.comercio_id:
            with app.state.sesiones() as sesion:
                comercio = sesion.get(Comercio, usuario.comercio_id)
                nombre_comercio = comercio.nombre if comercio else None
        return UsuarioSesion(usuario=usuario.usuario, nombre=usuario.nombre, rol=usuario.rol,
                             comercioId=usuario.comercio_id, comercio=nombre_comercio)

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
        inicio = time.perf_counter()  # el tiempo incluye leer el QR de la foto
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
            return await run_in_threadpool(consultar, "imagen", "qr", texto, comercio_id, inicio)
        if cedula := cedula_valida(texto):
            return await run_in_threadpool(consultar, "imagen", "cedula", cedula, comercio_id, inicio)
        return _error(400, MENSAJE_QR_INVALIDO)

    # ------------------------------------------------------------------------------------------------
    # Reportería (propuesta, rama dev_juan). Al validar con comercio_id, el canje se registra solo.
    # /reportes exige sesión de administrador. Pendiente: login de cajero para tomar la tienda de la sesión.

    @app.get("/api/comercios", tags=["reportería"], summary="Comercios afiliados y sus descuentos activos")
    def comercios():
        """Solo tiendas con al menos una oferta vigente hoy; la que se aplica al validar va primero."""
        hoy = ahora_panama().date()
        with app.state.sesiones() as sesion:
            filas = sesion.scalars(select(Comercio).where(Comercio.activo).order_by(Comercio.nombre)).all()
            salida = []
            for c in filas:
                vigentes = sorted((d for d in c.descuentos if d.aplica_el(hoy)), key=lambda d: (not d.principal, d.id))
                if vigentes:
                    salida.append({"id": c.id, "nombre": c.nombre, "categoria": c.categoria,
                                   "descuentos": [{"id": d.id, "tipo": d.tipo, "porcentaje": d.porcentaje,
                                                   "descripcion": d.descripcion} for d in vigentes]})
            return salida

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
              tags=["sesión"], summary="Inicia sesión (administrador o comercio) y devuelve un token Bearer")
    def iniciar_sesion(request: Request, solicitud: SolicitudLogin):
        espera = limite_login.segundos_de_espera(request.client.host if request.client else "desconocida")
        if espera:
            return _error(429, f"Demasiados intentos. Espera {espera} s.", {"Retry-After": str(espera)})
        with app.state.sesiones() as sesion:
            usuario = sesion.scalar(select(Usuario).where(Usuario.usuario == solicitud.usuario.strip().lower()))
        # Se verifica igual con una huella falsa para no revelar por el tiempo de respuesta si el usuario existe.
        guardada = usuario.contrasena if usuario else "scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        if (not verificar_contrasena(solicitud.contrasena, guardada) or not usuario or not usuario.activo
                or (usuario.rol == "comercio" and not usuario.comercio_id)):
            log.warning("Inicio de sesión rechazado.")
            return _error(401, "Usuario o contraseña incorrectos.")
        token, vence = crear_token(usuario.id, usuario.rol, config.clave_sesion, config.sesion_horas * 3600)
        log.info("Inicio de sesión de «%s».", usuario.usuario)
        return Sesion(token=token, expiraEn=vence, usuario=usuario_sesion(usuario))

    @app.get("/api/auth/sesion", response_model=UsuarioSesion, responses={401: {"model": Error}}, tags=["sesión"],
             summary="Usuario de la sesión actual")
    def sesion_actual(usuario: Usuario = Depends(usuario_actual)):
        return usuario_sesion(usuario)

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

    def filas_validacion(desde: date, hasta: date, comercio_id: int | None = None) -> list[FilaValidacion]:
        with app.state.sesiones() as sesion:
            nombres = dict(sesion.execute(select(Comercio.id, Comercio.nombre)).all())
            consulta = select(Validacion).where(
                Validacion.consultado_en >= datetime.combine(desde, datetime.min.time()),
                Validacion.consultado_en < datetime.combine(hasta + timedelta(days=1), datetime.min.time()))
            if comercio_id is not None:
                consulta = consulta.where(Validacion.comercio_id == comercio_id)
            return [FilaValidacion(v.consultado_en, v.criterio, v.resultado, v.tiempo_ms, nombres.get(v.comercio_id))
                    for v in sesion.scalars(consulta)]

    @app.get("/api/reportes/validacion", tags=["reportería"], responses={401: {"model": Error}, 403: {"model": Error}},
             summary="Reporte de validación: tasa de validaciones exitosas y tiempos de respuesta (solo administradores)")
    def reporte_validacion(dias: int = Query(30, ge=1, le=366), _admin: Usuario = Depends(solo_admin)):
        hasta = ahora_panama().date()
        desde = hasta - timedelta(days=dias - 1)
        return calcular_validacion(filas_validacion(desde, hasta), desde, hasta, config.meta_respuesta_ms)

    # ------------------------------------------------------------------------------------------------
    # Panel del comercio (objetivo 5): cada tienda gestiona sus ofertas, configura sus descuentos y ve sus
    # métricas. El administrador puede hacer lo mismo con cualquier tienda.

    def descuento_json(d: Descuento, hoy: date) -> dict:
        return {"id": d.id, "tipo": d.tipo, "porcentaje": d.porcentaje, "descripcion": d.descripcion,
                "activo": d.activo, "principal": d.principal,
                "vigenteDesde": d.vigente_desde.isoformat() if d.vigente_desde else None,
                "vigenteHasta": d.vigente_hasta.isoformat() if d.vigente_hasta else None,
                "diasSemana": d.dias_semana, "condiciones": d.condiciones, "aplicaHoy": d.aplica_el(hoy)}

    def detalle_comercio(sesion: Session, comercio: Comercio) -> dict:
        hoy = ahora_panama().date()
        vigentes = [d for d in comercio.descuentos if d.aplica_el(hoy)]
        aplicado = next((d for d in vigentes if d.principal), vigentes[0] if vigentes else None)
        usuarios = sesion.scalars(select(Usuario).where(Usuario.comercio_id == comercio.id).order_by(Usuario.usuario)).all()
        return {"id": comercio.id, "nombre": comercio.nombre, "categoria": comercio.categoria, "activo": comercio.activo,
                "descuentos": [descuento_json(d, hoy) for d in comercio.descuentos],
                "descuentoHoy": aplicado.id if aplicado else None,
                "usuarios": [{"id": u.id, "usuario": u.usuario, "nombre": u.nombre, "activo": u.activo} for u in usuarios]}

    def comercio_o_404(sesion: Session, comercio_id: int) -> Comercio:
        comercio = sesion.get(Comercio, comercio_id)
        if not comercio:
            raise HTTPException(404, "La tienda no existe.")
        return comercio

    def aplicar_descuento(sesion: Session, descuento: Descuento, datos: DatosDescuento) -> None:
        descuento.tipo, descuento.porcentaje, descuento.descripcion = datos.tipo, datos.porcentaje, datos.descripcion
        descuento.activo, descuento.principal = datos.activo, datos.principal
        descuento.vigente_desde, descuento.vigente_hasta = datos.vigenteDesde, datos.vigenteHasta
        descuento.dias_semana, descuento.condiciones = datos.diasSemana, datos.condiciones
        sesion.add(descuento)
        sesion.flush()
        if datos.principal:  # solo un principal por tienda
            for otro in sesion.scalars(select(Descuento).where(Descuento.comercio_id == descuento.comercio_id,
                                                              Descuento.id != descuento.id, Descuento.principal)):
                otro.principal = False

    errores_panel = {401: {"model": Error}, 403: {"model": Error}, 404: {"model": Error}}

    @app.get("/api/panel/comercios/{comercio_id}", tags=["panel del comercio"], responses=errores_panel,
             summary="Tienda con todas sus ofertas (vigentes o no) y sus usuarios")
    def ver_comercio(comercio_id: int, usuario: Usuario = Depends(usuario_actual)):
        autorizar_comercio(comercio_id, usuario)
        with app.state.sesiones() as sesion:
            return detalle_comercio(sesion, comercio_o_404(sesion, comercio_id))

    @app.post("/api/panel/comercios/{comercio_id}/descuentos", status_code=201, tags=["panel del comercio"],
              responses=errores_panel, summary="Publica una oferta nueva de la tienda")
    def crear_descuento(comercio_id: int, datos: DatosDescuento, usuario: Usuario = Depends(usuario_actual)):
        autorizar_comercio(comercio_id, usuario)
        with app.state.sesiones.begin() as sesion:
            comercio = comercio_o_404(sesion, comercio_id)
            descuento = Descuento(comercio_id=comercio.id)
            aplicar_descuento(sesion, descuento, datos)
            log.info("«%s» creó la oferta %s en %s.", usuario.usuario, descuento.id, comercio.nombre)
            sesion.flush()
            sesion.refresh(comercio)
            return detalle_comercio(sesion, comercio)

    @app.put("/api/panel/comercios/{comercio_id}/descuentos/{descuento_id}", tags=["panel del comercio"],
             responses=errores_panel, summary="Modifica una oferta: valor, vigencia, días, principal, activa")
    def editar_descuento(comercio_id: int, descuento_id: int, datos: DatosDescuento,
                         usuario: Usuario = Depends(usuario_actual)):
        autorizar_comercio(comercio_id, usuario)
        with app.state.sesiones.begin() as sesion:
            comercio = comercio_o_404(sesion, comercio_id)
            descuento = sesion.get(Descuento, descuento_id)
            if not descuento or descuento.comercio_id != comercio_id:
                raise HTTPException(404, "La oferta no existe en esta tienda.")
            aplicar_descuento(sesion, descuento, datos)
            sesion.flush()
            sesion.refresh(comercio)
            return detalle_comercio(sesion, comercio)

    @app.delete("/api/panel/comercios/{comercio_id}/descuentos/{descuento_id}", status_code=204,
                tags=["panel del comercio"], responses={**errores_panel, 409: {"model": Error}},
                summary="Elimina una oferta que nunca se usó (si ya tiene canjes, se desactiva en su lugar)")
    def eliminar_descuento(comercio_id: int, descuento_id: int, usuario: Usuario = Depends(usuario_actual)):
        autorizar_comercio(comercio_id, usuario)
        with app.state.sesiones.begin() as sesion:
            descuento = sesion.get(Descuento, descuento_id)
            if not descuento or descuento.comercio_id != comercio_id:
                raise HTTPException(404, "La oferta no existe en esta tienda.")
            if sesion.scalar(select(func.count()).select_from(Canje).where(Canje.descuento_id == descuento_id)):
                raise HTTPException(409, "Esta oferta ya tiene descuentos aplicados: desactívala para conservar el historial.")
            sesion.delete(descuento)
        return Response(status_code=204)

    @app.get("/api/panel/comercios/{comercio_id}/metricas", tags=["panel del comercio"], responses=errores_panel,
             summary="Métricas básicas de uso de la tienda")
    def metricas_comercio(comercio_id: int, dias: int = Query(30, ge=1, le=366),
                          usuario: Usuario = Depends(usuario_actual)):
        autorizar_comercio(comercio_id, usuario)
        hasta = ahora_panama().date()
        desde = hasta - timedelta(days=dias - 1)
        desde_anterior = desde - timedelta(days=dias)
        with app.state.sesiones() as sesion:
            comercio_o_404(sesion, comercio_id)
            consulta = (select(Canje, Comercio.nombre, Comercio.categoria, Descuento.tipo, Descuento.descripcion)
                        .join(Comercio, Canje.comercio_id == Comercio.id)
                        .join(Descuento, Canje.descuento_id == Descuento.id)
                        .where(Canje.comercio_id == comercio_id,
                               Canje.creado_en >= datetime.combine(desde_anterior, datetime.min.time()),
                               Canje.creado_en < datetime.combine(hasta + timedelta(days=1), datetime.min.time())))
            actuales, anteriores, por_oferta = [], [], {}
            for canje, comercio, categoria, tipo, descripcion in sesion.execute(consulta):
                fila = FilaCanje(canje.creado_en, comercio, categoria, tipo, canje.porcentaje, canje.estudiante,
                                 canje.facultad, canje.carrera, canje.monto_compra, canje.monto_descuento)
                if canje.creado_en.date() >= desde:
                    actuales.append(fila)
                    oferta = por_oferta.setdefault(canje.descuento_id, {"descripcion": descripcion, "canjes": 0})
                    oferta["canjes"] += 1
                else:
                    anteriores.append(fila)
        filas_val = filas_validacion(desde, hasta, comercio_id)
        uso = calcular(actuales, anteriores, [f.resultado for f in filas_val], {}, desde, hasta, config.minimo_grupo)
        # Al comercio no se le muestran alertas por estudiante ni la comparación entre tiendas.
        for clave in ("alertas", "tiendas", "categorias"):
            uso.pop(clave, None)
        uso["ofertas"] = sorted(por_oferta.values(), key=lambda o: -o["canjes"])
        uso["validacion"] = calcular_validacion(filas_val, desde, hasta, config.meta_respuesta_ms)["resumen"]
        return uso

    # ------------------------------------------------------------------------------------------------
    # Administración de comercios afiliados y de sus usuarios (solo administradores).

    @app.get("/api/admin/comercios", tags=["administración"], responses=errores_panel,
             summary="Todas las tiendas (activas o no) con sus ofertas y usuarios")
    def listar_comercios_admin(_admin: Usuario = Depends(solo_admin)):
        with app.state.sesiones() as sesion:
            return [detalle_comercio(sesion, c) for c in sesion.scalars(select(Comercio).order_by(Comercio.nombre))]

    def nombre_libre(sesion: Session, nombre: str, excepto: int | None = None) -> None:
        otro = sesion.scalar(select(Comercio).where(func.lower(Comercio.nombre) == nombre.lower()))
        if otro and otro.id != excepto:
            raise HTTPException(409, "Ya existe una tienda con ese nombre.")

    @app.post("/api/admin/comercios", status_code=201, tags=["administración"],
              responses={**errores_panel, 409: {"model": Error}}, summary="Afilia una tienda nueva")
    def crear_comercio(datos: DatosComercio, admin: Usuario = Depends(solo_admin)):
        with app.state.sesiones.begin() as sesion:
            nombre, categoria = " ".join(datos.nombre.split()), " ".join(datos.categoria.split())
            nombre_libre(sesion, nombre)
            comercio = Comercio(nombre=nombre, categoria=categoria, activo=datos.activo)
            sesion.add(comercio)
            sesion.flush()
            log.info("«%s» afilió la tienda %s.", admin.usuario, comercio.id)
            return detalle_comercio(sesion, comercio)

    @app.put("/api/admin/comercios/{comercio_id}", tags=["administración"],
             responses={**errores_panel, 409: {"model": Error}}, summary="Cambia nombre, categoría o estado de una tienda")
    def editar_comercio(comercio_id: int, datos: DatosComercio, _admin: Usuario = Depends(solo_admin)):
        with app.state.sesiones.begin() as sesion:
            comercio = comercio_o_404(sesion, comercio_id)
            nombre = " ".join(datos.nombre.split())
            nombre_libre(sesion, nombre, excepto=comercio_id)
            comercio.nombre, comercio.categoria, comercio.activo = nombre, " ".join(datos.categoria.split()), datos.activo
            sesion.flush()
            return detalle_comercio(sesion, comercio)

    @app.post("/api/admin/comercios/{comercio_id}/usuarios", status_code=201, tags=["administración"],
              responses={**errores_panel, 409: {"model": Error}}, summary="Crea el usuario con el que la tienda entra a su panel")
    def crear_usuario_comercio(comercio_id: int, datos: DatosUsuarioComercio, admin: Usuario = Depends(solo_admin)):
        with app.state.sesiones.begin() as sesion:
            comercio = comercio_o_404(sesion, comercio_id)
            usuario = datos.usuario.strip().lower()
            if sesion.scalar(select(Usuario).where(Usuario.usuario == usuario)):
                raise HTTPException(409, "Ese nombre de usuario ya existe.")
            sesion.add(Usuario(usuario=usuario, nombre=" ".join(datos.nombre.split()), rol="comercio",
                               comercio_id=comercio.id, contrasena=cifrar_contrasena(datos.contrasena)))
            sesion.flush()
            log.info("«%s» creó un usuario para la tienda %s.", admin.usuario, comercio.id)
            return detalle_comercio(sesion, comercio)

    @app.patch("/api/admin/usuarios/{usuario_id}", tags=["administración"], responses=errores_panel,
               summary="Activa, desactiva o cambia la contraseña de un usuario de comercio")
    def cambiar_usuario(usuario_id: int, cambio: CambioUsuario, _admin: Usuario = Depends(solo_admin)):
        with app.state.sesiones.begin() as sesion:
            usuario = sesion.get(Usuario, usuario_id)
            if not usuario or usuario.rol != "comercio":
                raise HTTPException(404, "El usuario de comercio no existe.")
            if cambio.activo is not None:
                usuario.activo = cambio.activo
            if cambio.contrasena:
                usuario.contrasena = cifrar_contrasena(cambio.contrasena)
            sesion.flush()
            return detalle_comercio(sesion, comercio_o_404(sesion, usuario.comercio_id))

    return app


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
# httpx registra cada URL consultada, y la ruta de la API UTP lleva la cédula.
logging.getLogger("httpx").setLevel(logging.WARNING)
app = crear_app()
