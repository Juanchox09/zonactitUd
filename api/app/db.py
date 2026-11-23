"""Base de datos de ActitUd (MySQL). Los estudiantes NO están aquí: se consultan a la API de la UTP.

Para la reportería (propuesta, rama dev_juan) se guardan los canjes con datos agregables
(facultad, sede, carrera, comercio, descuento, hora) y un identificador ANÓNIMO del estudiante:
un HMAC de la cédula con una clave secreta. La cédula nunca se guarda.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    create_engine,
    func,
)
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker


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


class Comercio(Base):
    """Tienda afiliada al programa ActitUd."""

    __tablename__ = "comercios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(80), unique=True)
    categoria: Mapped[str] = mapped_column(String(40), index=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)

    descuentos: Mapped[list[Descuento]] = relationship(back_populates="comercio")


class Descuento(Base):
    """Oferta de un comercio. Tipos como los filtros del sitio de ActitUd: 10 %, 15 %, 30 %, 2x1, otros."""

    __tablename__ = "descuentos"
    __table_args__ = (
        CheckConstraint("tipo IN ('porcentaje', '2x1', 'otro')", name="ck_descuentos_tipo"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    comercio_id: Mapped[int] = mapped_column(ForeignKey("comercios.id"), index=True)
    tipo: Mapped[str] = mapped_column(String(12))
    # Porcentaje equivalente para promediar: 10, 15, 30; 2x1 = 50; "otro" según la oferta.
    porcentaje: Mapped[int] = mapped_column(SmallInteger)
    descripcion: Mapped[str] = mapped_column(String(120))
    activo: Mapped[bool] = mapped_column(Boolean, default=True)

    comercio: Mapped[Comercio] = relationship(back_populates="descuentos")


class Canje(Base):
    """Un descuento aplicado a un estudiante activo. Sin cédula ni nombre."""

    __tablename__ = "canjes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    comercio_id: Mapped[int] = mapped_column(ForeignKey("comercios.id"), index=True)
    descuento_id: Mapped[int] = mapped_column(ForeignKey("descuentos.id"), index=True)
    estudiante: Mapped[str] = mapped_column(String(64), index=True, comment="HMAC-SHA256 de la cédula")
    facultad: Mapped[str] = mapped_column(String(120), index=True)
    sede: Mapped[str | None] = mapped_column(String(120), nullable=True)
    carrera: Mapped[str | None] = mapped_column(String(150), nullable=True)
    periodo_anio: Mapped[int] = mapped_column(SmallInteger)
    periodo_semestre: Mapped[int] = mapped_column(SmallInteger)
    porcentaje: Mapped[int] = mapped_column(SmallInteger)
    monto_compra: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    monto_descuento: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


class MatriculaFacultad(Base):
    """Estudiantes matriculados por facultad, para comparar facultades de distinto tamaño
    (canjes por cada 100 estudiantes). En el prototipo son cifras simuladas."""

    __tablename__ = "matricula_facultades"

    facultad: Mapped[str] = mapped_column(String(120), primary_key=True)
    estudiantes: Mapped[int] = mapped_column(Integer)


def crear_motor(url: str) -> Engine:
    return create_engine(url, pool_pre_ping=True, pool_recycle=3600)


def preparar_base(motor: Engine) -> sessionmaker[Session]:
    Base.metadata.create_all(motor)
    return sessionmaker(motor, expire_on_commit=False)
