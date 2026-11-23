"""Base de datos de ActitUd (MySQL). Los estudiantes NO están aquí: se consultan a la API de la UTP."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, String, create_engine, func
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


class Validacion(Base):
    """Bitácora de consultas, para métricas. Nunca guarda la cédula ni el QR consultado."""

    __tablename__ = "validaciones"
    __table_args__ = (
        CheckConstraint("criterio IN ('cedula', 'qr', 'imagen')", name="ck_validaciones_criterio"),
        CheckConstraint("resultado IN ('ACTIVO', 'INACTIVO', 'NO_ENCONTRADO', 'NO_VERIFICADO')",
                        name="ck_validaciones_resultado"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    criterio: Mapped[str] = mapped_column(String(10))
    resultado: Mapped[str] = mapped_column(String(15), index=True)
    consultado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


def crear_motor(url: str) -> Engine:
    return create_engine(url, pool_pre_ping=True, pool_recycle=3600)


def preparar_base(motor: Engine) -> sessionmaker[Session]:
    Base.metadata.create_all(motor)
    return sessionmaker(motor, expire_on_commit=False)
