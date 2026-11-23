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

    @property
    def origenes_cors(self) -> list[str]:
        return [o.strip() for o in self.cors_origin.split(",") if o.strip()]


@lru_cache
def leer_configuracion() -> Configuracion:
    return Configuracion()
