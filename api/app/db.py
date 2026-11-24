"""Base de datos de ActitUd (MySQL). Los estudiantes NO están aquí: se consultan a la API de la UTP.

Para la reportería se guardan los canjes con datos agregables (facultad, sede, carrera, comercio,
descuento, hora) y un identificador ANÓNIMO del estudiante: un HMAC de la cédula con una clave
secreta. La cédula nunca se guarda.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    create_engine,
    func,
    inspect,
    text,
)
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker


class Base(DeclarativeBase):
    pass


class Validacion(Base):
    """Bitácora de consultas, para métricas y para evaluar el prototipo.
    Nunca guarda la cédula ni el QR consultado."""

    __tablename__ = "validaciones"
    __table_args__ = (
        CheckConstraint("criterio IN ('cedula', 'qr', 'imagen')", name="ck_validaciones_criterio"),
        CheckConstraint("resultado IN ('ACTIVO', 'INACTIVO', 'NO_ENCONTRADO', 'NO_VERIFICADO')",
                        name="ck_validaciones_resultado"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    criterio: Mapped[str] = mapped_column(String(10))
    resultado: Mapped[str] = mapped_column(String(15), index=True)
    # Tiempo total de respuesta de la API, incluida la consulta a la UTP (objetivo 6: tiempos de respuesta).
    tiempo_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Tienda desde la que se validó, si se eligió una (métricas por comercio).
    comercio_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    consultado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


class Comercio(Base):
    """Tienda afiliada al programa ActitUd."""

    __tablename__ = "comercios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(80), unique=True)
    categoria: Mapped[str] = mapped_column(String(40), index=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)

    descuentos: Mapped[list[Descuento]] = relationship(back_populates="comercio", order_by="Descuento.id")


class Descuento(Base):
    """Oferta de un comercio. Tipos como los filtros del sitio de ActitUd: 10 %, 15 %, 30 %, 2x1, otros.

    Al validar se aplica el descuento PRINCIPAL que esté vigente ese día; si el principal no aplica,
    el primer descuento vigente (menor id)."""

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
    principal: Mapped[bool] = mapped_column(Boolean, default=False)
    # Vigencia y días, como en el arte de ActitUd ("válidos hasta el 31 de diciembre de 2026, de lunes a viernes").
    vigente_desde: Mapped[date | None] = mapped_column(Date, nullable=True)
    vigente_hasta: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Días en que aplica: 0 = lunes … 6 = domingo. "01234" = lunes a viernes.
    dias_semana: Mapped[str] = mapped_column(String(7), default="0123456")
    condiciones: Mapped[str | None] = mapped_column(String(300), nullable=True)

    comercio: Mapped[Comercio] = relationship(back_populates="descuentos")

    def aplica_el(self, dia: date) -> bool:
        """Activo, dentro de su vigencia y en uno de sus días de la semana."""
        return (self.activo
                and (self.vigente_desde is None or dia >= self.vigente_desde)
                and (self.vigente_hasta is None or dia <= self.vigente_hasta)
                and str(dia.weekday()) in (self.dias_semana or "0123456"))


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


class Usuario(Base):
    """Usuarios del panel. admin = administración de ActitUd (todo); comercio = personal de una tienda
    afiliada (solo sus ofertas y sus métricas)."""

    __tablename__ = "usuarios"
    __table_args__ = (CheckConstraint("rol IN ('admin', 'comercio')", name="ck_usuarios_rol_v2"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario: Mapped[str] = mapped_column(String(40), unique=True)
    nombre: Mapped[str] = mapped_column(String(80))
    contrasena: Mapped[str] = mapped_column(String(200), comment="scrypt con sal; nunca la contraseña")
    rol: Mapped[str] = mapped_column(String(10), default="admin")
    comercio_id: Mapped[int | None] = mapped_column(ForeignKey("comercios.id"), nullable=True, index=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class MatriculaFacultad(Base):
    """Estudiantes matriculados por facultad, para comparar facultades de distinto tamaño
    (canjes por cada 100 estudiantes). En el prototipo son cifras simuladas."""

    __tablename__ = "matricula_facultades"

    facultad: Mapped[str] = mapped_column(String(120), primary_key=True)
    estudiantes: Mapped[int] = mapped_column(Integer)


def crear_motor(url: str) -> Engine:
    return create_engine(url, pool_pre_ping=True, pool_recycle=3600)


# Columnas agregadas después de la primera versión: create_all no altera tablas que ya existen.
COLUMNAS_NUEVAS = {
    "validaciones": {"tiempo_ms": "INTEGER NULL", "comercio_id": "INTEGER NULL"},
    "descuentos": {"principal": "BOOLEAN NOT NULL DEFAULT 0", "vigente_desde": "DATE NULL",
                   "vigente_hasta": "DATE NULL", "dias_semana": "VARCHAR(7) NOT NULL DEFAULT '0123456'",
                   "condiciones": "VARCHAR(300) NULL"},
    "usuarios": {"comercio_id": "INTEGER NULL"},
}


def migrar(motor: Engine) -> None:
    """Agrega las columnas nuevas a una base creada con una versión anterior, sin perder datos."""
    inspector = inspect(motor)
    with motor.begin() as conexion:
        for tabla, columnas in COLUMNAS_NUEVAS.items():
            if not inspector.has_table(tabla):
                continue
            existentes = {c["name"] for c in inspector.get_columns(tabla)}
            for nombre, definicion in columnas.items():
                if nombre not in existentes:
                    conexion.execute(text(f"ALTER TABLE {tabla} ADD COLUMN {nombre} {definicion}"))
        if motor.dialect.name == "mysql" and inspector.has_table("usuarios"):
            # La primera versión solo admitía el rol admin.
            if "ck_usuarios_rol" in {c["name"] for c in inspector.get_check_constraints("usuarios")}:
                conexion.execute(text("ALTER TABLE usuarios DROP CHECK ck_usuarios_rol"))
                conexion.execute(text(
                    "ALTER TABLE usuarios ADD CONSTRAINT ck_usuarios_rol_v2 CHECK (rol IN ('admin', 'comercio'))"))


def preparar_base(motor: Engine) -> sessionmaker[Session]:
    migrar(motor)
    Base.metadata.create_all(motor)
    return sessionmaker(motor, expire_on_commit=False)
