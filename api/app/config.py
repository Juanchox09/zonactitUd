from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Configuracion(BaseSettings):
    """Variables de entorno (o archivo .env). Ver .env.example."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "mysql+pymysql://actitud:actitud_local@localhost:3306/actitud?charset=utf8mb4"
    cors_origin: str = "http://localhost:5173"
    rate_limit_max: int = 30

    utp_api_url: str = "http://localhost:8090/api/v1"
    utp_client_id: str = "carnet-qr-tesis"
    utp_client_secret: str = "mock-secret"
    utp_timeout_s: float = 5.0
    utp_limite_por_minuto: int = 55
    utp_cache_segundos: int = 30

    # Clave para el identificador anónimo del estudiante (HMAC de la cédula). En producción, una clave
    # larga y secreta: si se cambia, los mismos estudiantes cuentan como nuevos.
    clave_anonimizacion: str = "solo-para-desarrollo-cambiar-en-produccion"
    # Ningún reporte muestra grupos con menos estudiantes que este número (se agrupan en "Otros").
    minimo_grupo: int = 5

    # Inicio de sesión del panel administrativo. Si no existe el usuario ADMIN_USUARIO, se crea al arrancar
    # con ADMIN_CONTRASENA. En producción: cambiar ambas claves y la contraseña.
    clave_sesion: str = "solo-para-desarrollo-cambiar-en-produccion-sesion"
    sesion_horas: int = 8
    admin_usuario: str = "admin"
    admin_contrasena: str = "actitud2026"
    admin_nombre: str = "Administración Altaplaza"
    # Un mismo estudiante validado de nuevo en la misma tienda dentro de esta ventana no cuenta como otro canje.
    ventana_canje_min: int = 10

    @property
    def origenes_cors(self) -> list[str]:
        return [o.strip() for o in self.cors_origin.split(",") if o.strip()]


@lru_cache
def leer_configuracion() -> Configuracion:
    return Configuracion()
