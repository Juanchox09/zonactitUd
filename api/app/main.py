"""API REST de ActitUd: validación del carnet estudiantil UTP para descuentos en Altaplaza Mall.

El estado académico siempre se consulta a la API de Estado de Estudiante de la UTP
(hoy el mock de mock-utp/). Esta API no guarda datos de estudiantes.
"""
from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, File, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException

from .cliente_utp import ClienteUtp, ErrorNoVerificado, ErrorSolicitud, EstudianteUtp, MENSAJE_QR_INVALIDO
from .config import Configuracion, leer_configuracion
from .db import Validacion, crear_motor, preparar_base
from .identificadores import cedula_de_token_qr, cedula_valida
from .limite import LimitePorIp
from .qr_imagen import TAMANO_MAXIMO, leer_qr

log = logging.getLogger("actitud")

Criterio = Literal["cedula", "qr", "imagen"]


class Periodo(BaseModel):
    anio: int
    semestre: int


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


class Salud(BaseModel):
    estado: Literal["ok"]
    baseDatos: Literal["ok", "error"]
    validacionesRegistradas: int | None


def _error(codigo: int, mensaje: str, encabezados: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse({"error": mensaje}, status_code=codigo, headers=encabezados)


def crear_app(config: Configuracion | None = None, *, cliente: ClienteUtp | None = None,
              sesiones: sessionmaker[Session] | None = None) -> FastAPI:
    config = config or leer_configuracion()

    @asynccontextmanager
    async def ciclo_de_vida(app: FastAPI):
        app.state.sesiones = sesiones or preparar_base(crear_motor(config.database_url))
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
                       allow_headers=["Content-Type"])
    limite = LimitePorIp(config.rate_limit_max)

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
        return _error(exc.status_code, mensaje)

    @app.exception_handler(RequestValidationError)
    async def error_validacion(_request: Request, _exc: RequestValidationError):
        return _error(400, "Parámetros no válidos.")

    def registrar(criterio: Criterio, resultado: str) -> None:
        try:
            with app.state.sesiones.begin() as sesion:
                sesion.add(Validacion(criterio=criterio, resultado=resultado))
        except Exception:  # la bitácora nunca debe impedir responder al comercio
            log.exception("No se pudo registrar la validación en la bitácora.")

    def consultar(criterio: Criterio, tipo: Literal["cedula", "qr"], valor: str) -> JSONResponse | Titular:
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
        return titular

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
            return consultar("cedula", "cedula", valor)
        valor = qr.strip()
        if not valor:
            return _error(400, "El código QR está vacío.")
        return consultar("qr", "qr", valor)

    @app.post("/api/carnets/validar-imagen", response_model=Titular, response_model_exclude_none=True,
              responses=respuestas, tags=["validación"],
              summary="Valida un carnet a partir de una foto de su código QR (OpenCV)")
    async def validar_imagen(request: Request, imagen: UploadFile = File(...)):
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
            return await run_in_threadpool(consultar, "imagen", "qr", texto)
        if cedula := cedula_valida(texto):
            return await run_in_threadpool(consultar, "imagen", "cedula", cedula)
        return _error(400, MENSAJE_QR_INVALIDO)

    return app


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
# httpx registra cada URL consultada, y la ruta de la API UTP lleva la cédula.
logging.getLogger("httpx").setLevel(logging.WARNING)
app = crear_app()
