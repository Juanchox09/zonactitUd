"""Carga comercios, descuentos y meses de canjes SIMULADOS para demostrar la reportería.

Catálogo por defecto (--catalogo actitud): los comercios y descuentos REALES del arte oficial
"¡Conoce nuestros beneficios y descuentos!" de ActitUd (anexo del anteproyecto, válidos de lunes a
viernes hasta el 31/12/2026). Con --catalogo demo se usan tiendas ficticias.
Lo demás es ficticio: cédulas (aleatorias, solo se guarda su HMAC), cifras de matrícula y montos. Los patrones (horas pico, fines de semana, facultades que
prefieren ciertas tiendas, algunos casos sospechosos) imitan lo que se esperaría en un mall
junto al campus.

Uso (con docker compose levantado):
    docker compose exec api python -m scripts.sembrar_reporteria            # si la base está vacía
    docker compose exec api python -m scripts.sembrar_reporteria --reiniciar --dias 120
    # Antes de las pruebas de campo: solo comercios y ofertas, sin historial simulado
    docker compose exec api python -m scripts.sembrar_reporteria --reiniciar --sin-historial
"""
from __future__ import annotations

import argparse
import random
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import delete, func, select

from app.config import leer_configuracion
from app.db import Canje, Comercio, Descuento, MatriculaFacultad, Usuario, Validacion, crear_motor, preparar_base
from app.reportes import ahora_panama, identificador_anonimo

# Arte oficial ActitUd (anexo del anteproyecto). Se omiten los logos que no se leen con certeza en la
# copia del PDF: agregarlos desde Panel → Comercios con el arte original a la vista.
LUNES_A_VIERNES, LUNES_A_JUEVES, LUNES_A_MIERCOLES = "01234", "0123", "012"
VIGENCIA_ACTITUD = date(2026, 12, 31)
CONDICIONES_ACTITUD = ("Solo estudiantes universitarios del programa ActitUd con carnet válido. Sobre mercancía a precio "
                       "regular. No aplica con otras promociones, descuentos de jubilados, gift cards ni área de sale. "
                       "No transferible. No aplica a domicilio ni agregadores (Pedidos Ya, Glovo).")
# (nombre, categoría, [(tipo, porcentaje, descripción, días)], (monto mínimo, monto máximo) o None)
# "otro": porcentaje equivalente REFERENCIAL solo para los promedios de los reportes.
COMERCIOS_ACTITUD = [
    ("Bonage", "Shopping", [("porcentaje", 15, "15 % en mercancía a precio regular", LUNES_A_VIERNES)], (20, 90)),
    ("Oscar de la Renta", "Shopping", [("porcentaje", 15, "15 % en mercancía a precio regular", LUNES_A_VIERNES)], (40, 200)),
    ("Renato", "Shopping", [("porcentaje", 10, "10 % en mercancía a precio regular", LUNES_A_VIERNES)], (30, 150)),
    ("Vélez", "Shopping", [("porcentaje", 15, "15 % en mercancía a precio regular", LUNES_A_VIERNES)], (40, 180)),
    ("Leonisa", "Shopping", [("porcentaje", 10, "10 % en mercancía a precio regular", LUNES_A_VIERNES)], (15, 70)),
    ("Sunglass Hut", "Shopping", [("porcentaje", 25, "25 % en lentes (excepto marcas indicadas en tienda)", LUNES_A_VIERNES)], (80, 250)),
    ("Ashley", "Shopping", [("porcentaje", 10, "10 % en mercancía a precio regular", LUNES_A_VIERNES)], (100, 900)),
    ("Adidas", "Shopping", [("porcentaje", 10, "10 % en mercancía a precio regular", LUNES_A_VIERNES)], (30, 140)),
    ("Everlast", "Shopping", [("porcentaje", 10, "10 % en mercancía a precio regular", LUNES_A_VIERNES)], (20, 90)),
    ("Dongfeng", "Shopping", [("otro", 5, "B/. 500 de descuento en el abono inicial de un vehículo", LUNES_A_VIERNES)], None),
    ("Skinlaser", "Shopping", [("porcentaje", 70, "70 % en paquetes de depilación láser de diodo (8 sesiones)", LUNES_A_VIERNES)], (60, 300)),
    ("MAC", "Shopping", [("porcentaje", 10, "10 % en mercancía a precio regular", LUNES_A_VIERNES)], (20, 80)),
    ("Miniso", "Shopping", [("porcentaje", 10, "10 % en mercancía a precio regular", LUNES_A_VIERNES)], (5, 40)),
    ("Mac Store", "Shopping", [("porcentaje", 4, "4 % en hardware Apple (iPhone, iPad, Mac, Watch)", LUNES_A_VIERNES),
                               ("porcentaje", 10, "10 % en accesorios de terceros", LUNES_A_VIERNES)], (30, 1500)),
    ("6A Outdoor Adventure", "Shopping", [("porcentaje", 15, "15 % en marcas participantes a precio regular", LUNES_A_VIERNES)], (40, 180)),
    ("Amarantto", "Restaurantes", [("porcentaje", 10, "10 % en platos fuertes", LUNES_A_VIERNES)], (12, 35)),
    ("Segundo Muelle", "Restaurantes", [("porcentaje", 15, "15 % en el consumo", LUNES_A_VIERNES)], (15, 45)),
    ("Gelatiamo", "Restaurantes", [("porcentaje", 15, "15 % en el consumo", LUNES_A_VIERNES)], (4, 15)),
    ("Mercaito", "Restaurantes", [("porcentaje", 15, "15 % en el consumo", LUNES_A_VIERNES)], (8, 25)),
    ("México Lindo", "Restaurantes", [("porcentaje", 15, "15 % en el consumo", LUNES_A_VIERNES)], (10, 30)),
    ("Wings Army", "Restaurantes", [("porcentaje", 10, "10 % en el consumo", LUNES_A_VIERNES)], (10, 30)),
    ("Misawa", "Restaurantes", [("porcentaje", 15, "15 % en el consumo", LUNES_A_VIERNES)], (12, 35)),
    ("Crazy Park", "Entretenimiento", [("otro", 50, "Duplica tu recarga (mínimo B/. 15.00)", LUNES_A_MIERCOLES)], (15, 40)),
    ("SK Karts", "Entretenimiento", [("porcentaje", 10, "10 % en carrera de adultos (no aplica con otras promociones)", LUNES_A_JUEVES)], (20, 45)),
]

# Catálogo ficticio anterior (--catalogo demo).
COMERCIOS = [
    ("Café Campus", "Comida", [("porcentaje", 15, "15 % en bebidas")], (3, 9)),
    ("Burger Norte", "Comida", [("2x1", 50, "2x1 en combos los martes"), ("porcentaje", 10, "10 % en el menú")], (6, 15)),
    ("Sushi Go", "Comida", [("porcentaje", 15, "15 % en rolls")], (10, 28)),
    ("La Empanadería", "Comida", [("porcentaje", 10, "10 % en todo")], (3, 10)),
    ("Pizza Express", "Comida", [("2x1", 50, "2x1 en porciones")], (5, 14)),
    ("TecnoZona", "Tecnología", [("porcentaje", 10, "10 % en accesorios")], (15, 180)),
    ("Gamer Point", "Tecnología", [("porcentaje", 15, "15 % en periféricos")], (20, 150)),
    ("Urban Style", "Ropa y calzado", [("porcentaje", 30, "30 % en temporada"), ("porcentaje", 15, "15 % en todo")], (20, 90)),
    ("Sneaker Lab", "Ropa y calzado", [("porcentaje", 10, "10 % en calzado")], (45, 140)),
    ("CineMax", "Entretenimiento", [("2x1", 50, "2x1 en entradas de lunes a jueves")], (6, 14)),
    ("Bowling Zone", "Entretenimiento", [("porcentaje", 30, "30 % en líneas antes de las 5 p. m.")], (10, 30)),
    ("Libros & Más", "Librería y papelería", [("porcentaje", 15, "15 % en útiles"), ("otro", 20, "Tercer cuaderno gratis")], (5, 40)),
    ("FitStore", "Deportes", [("porcentaje", 10, "10 % en ropa deportiva")], (20, 80)),
    ("Óptica Visión", "Salud y belleza", [("porcentaje", 30, "30 % en monturas")], (60, 200)),
]

# Facultad → (matrícula simulada, sedes, carreras, preferencia por categoría)
FACULTADES = {
    "Facultad de Ingeniería de Sistemas Computacionales": (
        5200, ["Campus Víctor Levi Sasso"],
        ["Licenciatura en Ingeniería de Software", "Licenciatura en Ciberseguridad", "Licenciatura en Desarrollo de Software"],
        {"Tecnología": 3.0, "Comida": 1.2, "Restaurantes": 1.3}),
    "Facultad de Ingeniería Industrial": (
        4600, ["Campus Víctor Levi Sasso", "Centro Regional de Panamá Oeste"],
        ["Licenciatura en Ingeniería Industrial", "Licenciatura en Logística y Transporte"],
        {"Ropa y calzado": 1.6, "Shopping": 1.4}),
    "Facultad de Ingeniería Civil": (
        4100, ["Campus Víctor Levi Sasso", "Centro Regional de Chiriquí"],
        ["Licenciatura en Ingeniería Civil", "Licenciatura en Ingeniería Ambiental"],
        {"Deportes": 1.8, "Restaurantes": 1.2}),
    "Facultad de Ingeniería Eléctrica": (
        3300, ["Campus Víctor Levi Sasso"],
        ["Licenciatura en Ingeniería Electromecánica", "Licenciatura en Ingeniería Eléctrica y Electrónica"],
        {"Tecnología": 2.0}),
    "Facultad de Ingeniería Mecánica": (
        2800, ["Campus Víctor Levi Sasso"],
        ["Licenciatura en Ingeniería Mecánica", "Licenciatura en Ingeniería Aeronáutica"],
        {"Entretenimiento": 1.8}),
    "Facultad de Ciencias y Tecnología": (
        1700, ["Campus Víctor Levi Sasso"],
        ["Licenciatura en Comunicación Ejecutiva Bilingüe", "Licenciatura en Ingeniería Forestal"],
        {"Librería y papelería": 2.2, "Salud y belleza": 1.6, "Shopping": 1.3}),
}

# Peso por hora del día (10:00 a 21:00); picos de almuerzo y salida de clases.
HORAS = {10: 2, 11: 4, 12: 10, 13: 9, 14: 5, 15: 4, 16: 6, 17: 9, 18: 10, 19: 7, 20: 4, 21: 2}
HORAS_FIN_DE_SEMANA = {10: 2, 11: 4, 12: 6, 13: 7, 14: 8, 15: 9, 16: 9, 17: 8, 18: 6, 19: 5, 20: 3, 21: 2}
DIA_SEMANA = [0.9, 0.85, 0.95, 1.05, 1.35, 1.25, 0.6]  # lunes a domingo


def elegir(pesos: dict, azar: random.Random):
    return azar.choices(list(pesos), weights=list(pesos.values()))[0]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dias", type=int, default=120, help="días de historia (por defecto 120)")
    parser.add_argument("--reiniciar", action="store_true", help="borra comercios, descuentos y canjes antes de cargar")
    parser.add_argument("--semilla", type=int, default=2026)
    parser.add_argument("--catalogo", choices=["actitud", "demo"], default="actitud",
                        help="actitud = comercios reales del arte oficial (por defecto); demo = tiendas ficticias")
    parser.add_argument("--sin-historial", action="store_true",
                        help="solo comercios y ofertas, sin canjes ni validaciones simuladas (para pruebas de campo)")
    args = parser.parse_args()

    config = leer_configuracion()
    sesiones = preparar_base(crear_motor(config.database_url))
    azar = random.Random(args.semilla)

    with sesiones.begin() as sesion:
        if args.reiniciar:
            # Los usuarios de comercio apuntan a tiendas que se van a borrar; el administrador se conserva.
            sesion.execute(delete(Usuario).where(Usuario.rol == "comercio"))
            for modelo in (Canje, Descuento, Comercio, MatriculaFacultad, Validacion):
                sesion.execute(delete(modelo))
        elif sesion.scalar(select(func.count()).select_from(Comercio)):
            raise SystemExit("Ya hay comercios cargados. Usa --reiniciar para reemplazarlos.")

        comercios = []
        catalogo = COMERCIOS_ACTITUD if args.catalogo == "actitud" else [
            (n, c, [(t, p, d, "0123456") for t, p, d in o], m) for n, c, o, m in COMERCIOS]
        for nombre, categoria, ofertas, montos in catalogo:
            comercio = Comercio(nombre=nombre, categoria=categoria)
            comercio.descuentos = [
                Descuento(tipo=t, porcentaje=p, descripcion=d, dias_semana=dias, principal=(i == 0), activo=True,
                          vigente_hasta=VIGENCIA_ACTITUD if args.catalogo == "actitud" else None,
                          condiciones=CONDICIONES_ACTITUD if args.catalogo == "actitud" else None)
                for i, (t, p, d, dias) in enumerate(ofertas)]
            sesion.add(comercio)
            comercios.append((comercio, montos))
        for facultad, (matricula, *_resto) in FACULTADES.items():
            sesion.add(MatriculaFacultad(facultad=facultad, estudiantes=matricula))
        sesion.flush()
        if args.sin_historial:
            print(f"✔ {len(catalogo)} comercios ({args.catalogo}) sin historial: listo para las pruebas de campo.")
            return

        # Estudiantes simulados: unos pocos muy frecuentes, la mayoría ocasionales.
        nombres_fac = list(FACULTADES)
        pesos_fac = [FACULTADES[f][0] for f in nombres_fac]
        estudiantes = []
        for i in range(1400):
            facultad = azar.choices(nombres_fac, weights=pesos_fac)[0]
            _m, sedes, carreras, _pref = FACULTADES[facultad]
            cedula = f"{azar.randint(1, 13)}-{azar.randint(100, 999)}-{azar.randint(1000, 9999)}"
            estudiantes.append({"id": identificador_anonimo(cedula, config.clave_anonimizacion), "facultad": facultad,
                                "sede": azar.choice(sedes), "carrera": azar.choice(carreras),
                                "frecuencia": azar.paretovariate(1.6)})
        pesos_est = [e["frecuencia"] for e in estudiantes]

        hoy = ahora_panama().replace(hour=0, minute=0, second=0)
        total = 0
        validaciones: list = []  # momento de cada validación que terminó en canje
        for d in range(args.dias, -1, -1):
            dia = hoy - timedelta(days=d)
            # Semana de inicio de clases y cerca de quincena, más movimiento.
            temporada = 1.25 if dia.day in (15, 16, 30, 31, 1) else 1.0
            cantidad = int(azar.gauss(62, 8) * DIA_SEMANA[dia.weekday()] * temporada)
            horas = HORAS_FIN_DE_SEMANA if dia.weekday() >= 5 else HORAS
            for _ in range(max(cantidad, 0)):
                est = azar.choices(estudiantes, weights=pesos_est)[0]
                preferencias = FACULTADES[est["facultad"]][3]
                comercio, montos = azar.choices(comercios, weights=[preferencias.get(c.categoria, 1.0) for c, _ in comercios])[0]
                # Solo ofertas que aplican ese día (p. ej. ActitUd: de lunes a viernes).
                vigentes = [x for x in comercio.descuentos if x.aplica_el(dia.date())]
                if not vigentes:
                    continue
                descuento = azar.choice(vigentes)
                hora = elegir(horas, azar)
                momento = dia.replace(hour=hora, minute=azar.randint(0, 59), second=azar.randint(0, 59))
                if momento > ahora_panama():
                    continue
                monto = Decimal(str(round(azar.uniform(*montos), 2))) if montos and azar.random() < 0.7 else None
                sesion.add(Canje(comercio_id=comercio.id, descuento_id=descuento.id, estudiante=est["id"],
                                 facultad=est["facultad"], sede=est["sede"], carrera=est["carrera"],
                                 periodo_anio=2026, periodo_semestre=2, porcentaje=descuento.porcentaje,
                                 monto_compra=monto,
                                 monto_descuento=(monto * descuento.porcentaje / 100).quantize(Decimal("0.01")) if monto else None,
                                 creado_en=momento))
                total += 1
                validaciones.append(momento - timedelta(seconds=azar.randint(5, 40)))

        # Algunos casos sospechosos para la sección de alertas: mismo carnet en dos tiendas en minutos.
        for _ in range(7):
            est = azar.choice(estudiantes)
            momento = hoy - timedelta(days=azar.randint(0, 25)) + timedelta(hours=azar.randint(12, 19), minutes=azar.randint(0, 40))
            if momento > ahora_panama():
                momento -= timedelta(days=1)
            while momento.weekday() >= 5 and args.catalogo == "actitud":
                momento -= timedelta(days=1)
            (c1, _), (c2, _) = azar.sample([c for c in comercios if c[0].descuentos[0].aplica_el(momento.date())], 2)
            for comercio, desfase in ((c1, 0), (c2, azar.randint(2, 7))):
                desc = comercio.descuentos[0]
                sesion.add(Canje(comercio_id=comercio.id, descuento_id=desc.id, estudiante=est["id"], facultad=est["facultad"],
                                 sede=est["sede"], carrera=est["carrera"], periodo_anio=2026, periodo_semestre=2,
                                 porcentaje=desc.porcentaje, creado_en=momento + timedelta(minutes=desfase)))
                total += 1

        # Cada canje viene de una validación ACTIVO. Además: activos que no canjearon (~12 %), carnets
        # inactivos o no registrados (~9 %) y consultas sin respuesta de la UTP (~1 %).
        extra = {"ACTIVO": 0.12, "INACTIVO": 0.06, "NO_ENCONTRADO": 0.03, "NO_VERIFICADO": 0.01}
        filas_validacion = [("ACTIVO", m) for m in validaciones]
        for resultado, proporcion in extra.items():
            filas_validacion += [(resultado, azar.choice(validaciones) + timedelta(minutes=azar.randint(-90, 90)))
                                 for _ in range(int(len(validaciones) * proporcion))]
        sesion.add_all(Validacion(criterio="qr" if azar.random() < 0.75 else "cedula", resultado=r, consultado_en=m)
                       for r, m in filas_validacion if m <= ahora_panama())

    print(f"✔ {len(catalogo)} comercios ({args.catalogo}), {len(FACULTADES)} facultades y {total} canjes simulados en {args.dias + 1} días.")


if __name__ == "__main__":
    main()
