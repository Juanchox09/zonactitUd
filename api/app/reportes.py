"""Cálculo de la reportería del programa ActitUd (propuesta).

Todo se calcula sobre datos agregables: nunca hay cédulas ni nombres. Los grupos con menos de
`minimo_grupo` estudiantes se juntan en "Otros", para que nadie pueda deducir quién es el único
estudiante de cierta carrera que compró en cierta tienda.

El cálculo se hace en Python sobre las filas del periodo: es portable (MySQL en producción,
SQLite en las pruebas) y suficiente para un mall. Con años de datos, se reemplaza por una tabla
de resumen diario calculada cada noche (ver docs/propuesta-reporteria.md).
"""
from __future__ import annotations

import hashlib
import hmac
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Iterable

PANAMA = timezone(timedelta(hours=-5))  # sin horario de verano


def ahora_panama() -> datetime:
    """Hora local de Panamá sin zona (así se guarda en la base), sin depender de la zona del servidor."""
    return datetime.now(PANAMA).replace(tzinfo=None, microsecond=0)


DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
VENTANA_SIMULTANEO = timedelta(minutes=10)
MAXIMO_CANJES_DIA_COMERCIO = 3


def identificador_anonimo(cedula: str, clave: str) -> str:
    """HMAC-SHA256 de la cédula: permite contar estudiantes únicos sin guardar la cédula."""
    return hmac.new(clave.encode(), cedula.encode(), hashlib.sha256).hexdigest()


def etiqueta_descuento(tipo: str, porcentaje: int) -> str:
    if tipo == "2x1":
        return "2x1"
    if tipo == "porcentaje" and porcentaje in (10, 15, 30):
        return f"{porcentaje} %"
    return "Otros"


@dataclass(frozen=True)
class FilaCanje:
    creado_en: datetime
    comercio: str
    categoria: str
    tipo_descuento: str
    porcentaje: int
    estudiante: str
    facultad: str
    carrera: str | None
    monto_compra: Decimal | None
    monto_descuento: Decimal | None


def _pct(parte: float, total: float) -> float | None:
    return round(parte / total * 100, 1) if total else None


def _variacion(actual: float, anterior: float) -> float | None:
    return round((actual - anterior) / anterior * 100, 1) if anterior else None


def _con_minimo(grupos: dict[str, set[str]], conteos: Counter, minimo: int, nombre_otros: str) -> list[dict]:
    """Ordena por canjes y junta en "Otros" los grupos con menos de `minimo` estudiantes."""
    visibles, otros_est, otros_canjes = [], set(), 0
    for nombre, estudiantes in grupos.items():
        if len(estudiantes) >= minimo:
            visibles.append({"nombre": nombre, "canjes": conteos[nombre], "estudiantes": len(estudiantes)})
        else:
            otros_est |= estudiantes
            otros_canjes += conteos[nombre]
    visibles.sort(key=lambda g: (-g["canjes"], g["nombre"]))
    if otros_canjes:
        visibles.append({"nombre": nombre_otros, "canjes": otros_canjes, "estudiantes": len(otros_est), "agrupado": True})
    return visibles


def calcular(
    filas: list[FilaCanje],
    filas_anteriores: list[FilaCanje],
    validaciones: Iterable[str],
    matricula: dict[str, int],
    desde: date,
    hasta: date,
    minimo_grupo: int = 5,
) -> dict:
    """Reporte del periodo [desde, hasta] (ambos incluidos)."""
    estudiantes = Counter(f.estudiante for f in filas)
    unicos = len(estudiantes)
    con_monto = [f for f in filas if f.monto_compra is not None]
    resultados = Counter(validaciones)
    validas = sum(n for r, n in resultados.items() if r != "NO_VERIFICADO")
    rechazos = resultados["INACTIVO"] + resultados["NO_ENCONTRADO"]
    ahorro = sum((f.monto_descuento or Decimal(0)) for f in filas)

    resumen = {
        "canjes": len(filas),
        "canjesAnterior": len(filas_anteriores),
        "variacionCanjes": _variacion(len(filas), len(filas_anteriores)),
        "estudiantesUnicos": unicos,
        "estudiantesAnterior": len({f.estudiante for f in filas_anteriores}),
        "recurrencia": _pct(sum(1 for n in estudiantes.values() if n >= 2), unicos),
        "canjesPorEstudiante": round(len(filas) / unicos, 2) if unicos else None,
        "descuentoPromedio": round(sum(f.porcentaje for f in filas) / len(filas), 1) if filas else None,
        "ahorroTotal": float(ahorro),
        "ticketPromedio": round(float(sum(f.monto_compra for f in con_monto)) / len(con_monto), 2) if con_monto else None,
        "canjesConMonto": len(con_monto),
        "validaciones": sum(resultados.values()),
        "conversion": _pct(len(filas), resultados["ACTIVO"]),
        "tasaRechazo": _pct(rechazos, validas),
        "noVerificadas": resultados["NO_VERIFICADO"],
    }

    # Tendencia diaria (con ceros en los días sin canjes)
    por_fecha = Counter(f.creado_en.date() for f in filas)
    dias = (hasta - desde).days + 1
    por_dia = [{"fecha": (d := desde + timedelta(days=i)).isoformat(), "canjes": por_fecha[d]} for i in range(dias)]

    # Mapa de calor: día de la semana × hora
    horario = [[0] * 24 for _ in DIAS]
    for f in filas:
        horario[f.creado_en.weekday()][f.creado_en.hour] += 1
    pico = max(((d, h) for d in range(7) for h in range(24)), key=lambda p: horario[p[0]][p[1]], default=None)

    # Tiendas
    tiendas: dict[str, dict] = {}
    for f in filas:
        t = tiendas.setdefault(f.comercio, {"nombre": f.comercio, "categoria": f.categoria, "canjes": 0,
                                            "_est": set(), "_pct": 0, "ahorro": Decimal(0)})
        t["canjes"] += 1
        t["_est"].add(f.estudiante)
        t["_pct"] += f.porcentaje
        t["ahorro"] += f.monto_descuento or Decimal(0)
    lista_tiendas = sorted(
        ({"nombre": t["nombre"], "categoria": t["categoria"], "canjes": t["canjes"], "estudiantes": len(t["_est"]),
          "descuentoPromedio": round(t["_pct"] / t["canjes"], 1), "ahorro": float(t["ahorro"])} for t in tiendas.values()),
        key=lambda t: (-t["canjes"], t["nombre"]))

    categorias = Counter(f.categoria for f in filas)

    # Facultades: proporcional a la matrícula, con mínimo de estudiantes por grupo
    est_facultad: dict[str, set[str]] = defaultdict(set)
    for f in filas:
        est_facultad[f.facultad].add(f.estudiante)
    facultades = _con_minimo(est_facultad, Counter(f.facultad for f in filas), minimo_grupo, "Otras facultades")
    for g in facultades:
        total = matricula.get(g["nombre"])
        g["matricula"] = total
        g["porCada100"] = round(g["estudiantes"] / total * 100, 1) if total and not g.get("agrupado") else None

    est_carrera: dict[str, set[str]] = defaultdict(set)
    for f in filas:
        est_carrera[f.carrera or "Sin carrera"].add(f.estudiante)
    carreras = _con_minimo(est_carrera, Counter(f.carrera or "Sin carrera" for f in filas), minimo_grupo, "Otras carreras")

    # Tipos de descuento, en el orden de los filtros del sitio de ActitUd
    orden = ["10 %", "15 %", "30 %", "2x1", "Otros"]
    por_tipo: dict[str, dict] = {e: {"tipo": e, "canjes": 0, "_est": set()} for e in orden}
    for f in filas:
        g = por_tipo[etiqueta_descuento(f.tipo_descuento, f.porcentaje)]
        g["canjes"] += 1
        g["_est"].add(f.estudiante)
    descuentos = [{"tipo": g["tipo"], "canjes": g["canjes"], "estudiantes": len(g["_est"]),
                   "participacion": _pct(g["canjes"], len(filas))} for g in por_tipo.values()]

    return {
        "periodo": {"desde": desde.isoformat(), "hasta": hasta.isoformat(), "dias": dias},
        "resumen": resumen,
        "porDia": por_dia,
        "horario": {"dias": DIAS, "matriz": horario,
                    "pico": {"dia": DIAS[pico[0]], "hora": pico[1], "canjes": horario[pico[0]][pico[1]]}
                    if pico and horario[pico[0]][pico[1]] else None},
        "tiendas": lista_tiendas,
        "categorias": [{"nombre": c, "canjes": n} for c, n in categorias.most_common()],
        "facultades": facultades,
        "carreras": carreras[:10],
        "descuentos": descuentos,
        "alertas": detectar_alertas(filas),
        "minimoGrupo": minimo_grupo,
    }


@dataclass(frozen=True)
class FilaValidacion:
    consultado_en: datetime
    criterio: str
    resultado: str
    tiempo_ms: int | None
    comercio: str | None


RESULTADOS = ["ACTIVO", "INACTIVO", "NO_ENCONTRADO", "NO_VERIFICADO"]
TRAMOS_MS = [(0, 250, "< 250 ms"), (250, 500, "250–500 ms"), (500, 1000, "0,5–1 s"),
             (1000, 2000, "1–2 s"), (2000, 5000, "2–5 s"), (5000, None, "≥ 5 s")]


def percentil(valores: list[int], p: float) -> int | None:
    """Percentil por rango más cercano (valores ordenados)."""
    if not valores:
        return None
    indice = max(0, min(len(valores) - 1, int(-(-p * len(valores) // 100)) - 1))
    return valores[indice]


def _tiempos(filas: Iterable[FilaValidacion], meta_ms: int) -> dict:
    ms = sorted(f.tiempo_ms for f in filas if f.tiempo_ms is not None)
    return {
        "medidas": len(ms),
        "promedio": round(sum(ms) / len(ms)) if ms else None,
        "mediana": percentil(ms, 50),
        "p90": percentil(ms, 90),
        "p95": percentil(ms, 95),
        "minimo": ms[0] if ms else None,
        "maximo": ms[-1] if ms else None,
        "dentroMeta": _pct(sum(1 for t in ms if t <= meta_ms), len(ms)),
    }


def calcular_validacion(filas: list[FilaValidacion], desde: date, hasta: date, meta_ms: int = 2000) -> dict:
    """Reporte de validación (objetivo 6 del anteproyecto): tasa de validaciones exitosas y tiempos de respuesta.

    Exitosa = el sistema dio una respuesta definitiva (ACTIVO, INACTIVO o NO_ENCONTRADO).
    Fallida = NO_VERIFICADO: la API de la UTP no respondió a tiempo o dio error; no se pudo decidir."""
    resultados = Counter(f.resultado for f in filas)
    total = len(filas)
    exitosas = total - resultados["NO_VERIFICADO"]

    por_fecha: dict[date, list[FilaValidacion]] = defaultdict(list)
    for f in filas:
        por_fecha[f.consultado_en.date()].append(f)
    dias = (hasta - desde).days + 1
    por_dia = []
    for i in range(dias):
        d = desde + timedelta(days=i)
        lista = por_fecha.get(d, [])
        ms = sorted(f.tiempo_ms for f in lista if f.tiempo_ms is not None)
        por_dia.append({"fecha": d.isoformat(), "total": len(lista),
                        "exitosas": sum(1 for f in lista if f.resultado != "NO_VERIFICADO"),
                        "activos": sum(1 for f in lista if f.resultado == "ACTIVO"),
                        "medianaMs": percentil(ms, 50)})

    def grupo(clave) -> list[dict]:
        grupos: dict[str, list[FilaValidacion]] = defaultdict(list)
        for f in filas:
            grupos[clave(f)].append(f)
        salida = []
        for nombre, lista in grupos.items():
            ok = sum(1 for f in lista if f.resultado != "NO_VERIFICADO")
            ms = sorted(f.tiempo_ms for f in lista if f.tiempo_ms is not None)
            salida.append({"nombre": nombre, "total": len(lista), "exitosas": ok, "tasaExito": _pct(ok, len(lista)),
                           "activos": sum(1 for f in lista if f.resultado == "ACTIVO"),
                           "medianaMs": percentil(ms, 50), "p95Ms": percentil(ms, 95)})
        return sorted(salida, key=lambda g: (-g["total"], g["nombre"]))

    medidas = [f.tiempo_ms for f in filas if f.tiempo_ms is not None]
    tramos = [{"tramo": etiqueta,
               "validaciones": sum(1 for t in medidas if t >= minimo and (maximo is None or t < maximo))}
              for minimo, maximo, etiqueta in TRAMOS_MS]
    nombres_criterio = {"cedula": "Cédula escrita", "qr": "Escaneo QR", "imagen": "Foto del QR"}

    return {
        "periodo": {"desde": desde.isoformat(), "hasta": hasta.isoformat(), "dias": dias},
        "metaMs": meta_ms,
        "resumen": {
            "total": total,
            "exitosas": exitosas,
            "tasaExito": _pct(exitosas, total),
            "activos": resultados["ACTIVO"],
            "tasaActivos": _pct(resultados["ACTIVO"], exitosas),
            "noVerificadas": resultados["NO_VERIFICADO"],
        },
        "resultados": [{"resultado": r, "validaciones": resultados[r], "participacion": _pct(resultados[r], total)}
                       for r in RESULTADOS],
        "tiempos": _tiempos(filas, meta_ms),
        "tiemposExitosas": _tiempos([f for f in filas if f.resultado != "NO_VERIFICADO"], meta_ms),
        "tramos": tramos,
        "porDia": por_dia,
        "porCriterio": [{**g, "nombre": nombres_criterio.get(g["nombre"], g["nombre"])}
                        for g in grupo(lambda f: f.criterio)],
        "porComercio": grupo(lambda f: f.comercio or "Sin tienda elegida"),
    }


def detectar_alertas(filas: list[FilaCanje]) -> list[dict]:
    """Patrones que merecen revisión. No acusan: el personal del mall decide."""
    alertas = []
    por_estudiante: dict[str, list[FilaCanje]] = defaultdict(list)
    for f in sorted(filas, key=lambda f: f.creado_en):
        por_estudiante[f.estudiante].append(f)

    for estudiante, lista in por_estudiante.items():
        alias = f"Estudiante #{estudiante[:6]}"
        # Mismo carnet en dos tiendas distintas en pocos minutos: posible carnet prestado o QR copiado.
        for a, b in zip(lista, lista[1:]):
            if a.comercio != b.comercio and b.creado_en - a.creado_en <= VENTANA_SIMULTANEO:
                minutos = int((b.creado_en - a.creado_en).total_seconds() // 60)
                alertas.append({"tipo": "simultaneo", "fecha": b.creado_en.isoformat(timespec="minutes"),
                                "estudiante": alias,
                                "detalle": f"Canjeó en {a.comercio} y en {b.comercio} con {minutos} min de diferencia."})
        # Muchos canjes el mismo día en el mismo comercio.
        por_dia_comercio = Counter((f.creado_en.date(), f.comercio) for f in lista)
        for (dia, comercio), n in por_dia_comercio.items():
            if n > MAXIMO_CANJES_DIA_COMERCIO:
                alertas.append({"tipo": "repetido", "fecha": dia.isoformat(), "estudiante": alias,
                                "detalle": f"{n} canjes el mismo día en {comercio}."})
    alertas.sort(key=lambda a: a["fecha"], reverse=True)
    return alertas[:50]
