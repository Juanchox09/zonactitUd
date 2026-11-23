# Propuesta: reportería del programa ActitUd

> **Estado:** propuesta con prototipo funcional en la rama `dev_juan`. No forma parte de `main`.
> Los datos que muestra el panel son **simulados** (`api/scripts/sembrar_reporteria.py`).

## Por qué

Validar el carnet resuelve la operación diaria. La reportería convierte cada validación en información para tomar decisiones, y es lo que justifica la alianza para las tres partes:

| Quién | Qué gana |
|---|---|
| **Altaplaza Mall (marketing)** | Saber cuándo, dónde y con qué descuentos compran los universitarios; medir campañas; cifras para comunicar el programa |
| **Comercios afiliados** | Conocer su público estudiantil, sus horas pico y cómo se comparan con su categoría |
| **UTP (DITIC y Bienestar Estudiantil)** | Medir el beneficio económico real para sus estudiantes, por facultad y carrera |

## Qué se registra en cada canje

Hoy la bitácora `validaciones` guarda solo el tipo de consulta, el resultado y la hora. La propuesta agrega la tabla `canjes`: el momento en que el cajero **aplica** el descuento.

| Dato | Origen | Uso |
|---|---|---|
| Fecha y hora (hora de Panamá) | servidor | horarios, días pico, temporadas |
| Comercio | sesión del cajero (cuando exista el login) | ranking de tiendas y categorías |
| Descuento aplicado y su porcentaje equivalente | lista de ofertas del comercio | tipos de descuento (10 %, 15 %, 30 %, 2x1, otros) |
| Facultad, sede, carrera y periodo | **respuesta de la API UTP** | uso por facultad y carrera |
| Monto de la compra (opcional) | lo escribe el cajero | ahorro entregado y ticket promedio |
| Identificador anónimo del estudiante | HMAC-SHA256 de la cédula con una clave secreta | estudiantes únicos y recurrencia, **sin guardar la cédula** |

La API de la UTP no entrega sexo, edad ni dirección, así que esos reportes no se ofrecen.

## Reportes del prototipo

| Sección | Pregunta que responde |
|---|---|
| **Indicadores** | ¿Cuántos descuentos se aplicaron, a cuántos estudiantes distintos, cuánto ahorraron, cuál fue el descuento y el ticket promedio, cuántos volvieron? |
| **Descuentos por día** | ¿Cómo evoluciona el uso? ¿Qué efecto tuvo una campaña o la quincena? |
| **Mapa de calor día × hora** | ¿A qué hora se usan los descuentos? ¿Dónde hay horas flojas para promociones? |
| **Tiendas con más descuentos** | ¿Qué comercios aprovechan más el programa? (exportable a CSV) |
| **Uso por facultad** | ¿Qué facultades usan más el programa **en proporción a su matrícula**? |
| **Tipos de descuento** | ¿El 2x1 atrae más que el 30 %? ¿El 10 % casi no se usa? |
| **Carreras** | ¿Qué carreras participan más? |
| **Alertas** | ¿Hay carnets usados en dos tiendas casi a la vez o canjes repetidos en exceso? |

Indicadores y cómo se calculan (`api/app/reportes.py`):

| Indicador | Cálculo |
|---|---|
| Descuentos aplicados | conteo de canjes; variación contra el periodo anterior de igual duración |
| Estudiantes únicos | identificadores anónimos distintos |
| Recurrencia | estudiantes con 2 o más canjes ÷ estudiantes únicos |
| Descuento promedio | promedio del porcentaje equivalente (2x1 = 50 %) |
| Ahorro entregado | suma de monto × porcentaje (solo canjes con monto) |
| Ticket promedio | promedio del monto de compra |
| Conversión | canjes ÷ validaciones con resultado activo |
| Rechazos | (inactivos + no registrados) ÷ validaciones con respuesta |
| Uso por facultad | estudiantes únicos ÷ matrícula de la facultad × 100 |

## Privacidad

- **La cédula nunca se guarda**, solo su HMAC. Sin la clave no se puede revertir, y cambiar la clave rompe la relación con los datos anteriores. Esto aplica el principio de minimización de la Ley 81 de 2019 de Protección de Datos Personales de Panamá.
- **Mínimo de 5 estudiantes por grupo** (`MINIMO_GRUPO`). Las facultades y carreras con menos se juntan en «Otras», para que nadie pueda deducir quién es el único estudiante de cierta carrera que compró en cierta tienda.
- **Solo reportes agregados.** No existe una pantalla de «qué compró tal estudiante». Las alertas muestran un alias (`Estudiante #a1b2c3`), no la identidad.
- **Permisos por rol** (cuando exista el login): cada comercio ve solo sus datos; Altaplaza ve todo; la UTP ve el uso por facultad, sin ventas de las tiendas.

## Escalabilidad

- El prototipo calcula los reportes en Python sobre las filas del periodo. Funciona igual en MySQL y en SQLite (pruebas) y alcanza para el volumen de un mall: unos 2 000 canjes al mes.
- Con años de datos, se agrega una tabla `resumen_diario` (comercio × facultad × tipo × día × hora) calculada cada noche. Los reportes leen el resumen y responden igual de rápido.
- Si el programa crece a otros malls o universidades, los resúmenes se pueden llevar a un almacén de datos o a Power BI o Metabase, sin tocar la app del cajero.

## Qué hay en la rama `dev_juan`

| Pieza | Archivo |
|---|---|
| Tablas `comercios`, `descuentos`, `canjes`, `matricula_facultades` | `api/app/db.py` |
| Cálculo de indicadores, mínimo por grupo y alertas | `api/app/reportes.py` |
| `GET /api/comercios`, `POST /api/canjes`, `GET /api/reportes?dias=30` | `api/app/main.py` |
| Generador de datos simulados (14 comercios, 6 facultades, ~120 días) | `api/scripts/sembrar_reporteria.py` |
| Pruebas | `api/tests/test_reportes.py` |
| Panel con gráficos, vista de tabla y exportación CSV | `frontend/src/components/reportes/` |

Probarlo:

```bash
docker compose up --build
docker compose exec api python -m scripts.sembrar_reporteria --reiniciar
# App → pestaña "Reportes"  (http://localhost:5173/#/reportes)
```

`POST /api/canjes` solo registra el canje si la API UTP confirma que el estudiante está **activo**: responde 409 si está inactivo y 404 si no existe.

## Pendiente para pasar de propuesta a producto

1. **Login de cajero y administrador.** Hoy `comercio_id` llega en la solicitud; debe salir de la sesión, y `/api/reportes` debe quedar solo para administradores.
2. **Paso «Aplicar descuento» en la app del cajero.** Tras un resultado activo, elegir la oferta y, opcionalmente, escribir el monto.
3. **Decisión con marketing de Altaplaza:** ¿se pide el monto de la compra? Agrega segundos a cada canje, pero sin él no hay ahorro entregado ni ticket promedio.
4. **Matrícula real por facultad**, que debe entregar la UTP. Hoy es simulada.
5. **Resumen semanal por correo** para marketing y **tabla de resumen diario** para cuando haya mucho volumen.
