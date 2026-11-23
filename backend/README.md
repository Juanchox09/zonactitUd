# Backend · API de validación de carnet

API que responde si un carnet está **activo** o **inactivo**, consultado por **cédula**, **código de carnet** o **QR del carné UTP**. Es el servidor que consume el [frontend](../frontend/).

Stack: Node.js 24 (ejecuta TypeScript directamente, sin compilar) + [Fastify](https://fastify.dev) + SQLite integrado en Node (`node:sqlite`).

## Origen de los datos

| `ORIGEN` | Estudiantes | Colaboradores y egresados |
|----------|-------------|---------------------------|
| `local` (por defecto) | base SQLite | base SQLite |
| `utp` | [API de Estado de Estudiante UTP](../api-estudiante-mock/) | base SQLite |

Con `ORIGEN=utp`, el backend es el único que habla con la API de la UTP: guarda las credenciales OAuth2 (nunca llegan al navegador), obtiene el token y lo reutiliza durante su vigencia, y traduce las respuestas al formato que espera el frontend.

```
frontend ──GET /api/carnets/validar──▶ backend ──Bearer token──▶ API UTP
                                          └──▶ SQLite (colaboradores, egresados, bitácora)
```

## Ejecutar

```bash
npm install
npm run db:seed     # crea data/carnets.db y carga los titulares de prueba
npm test            # pruebas (node:test), incluida la integración con el mock UTP
npm run typecheck   # verificación de tipos
```

**Con la base local:**

```bash
npm run dev         # http://localhost:4000
```

**Con la API UTP simulada** (dos terminales):

```bash
npm run mock:utp    # mock de la API UTP en http://localhost:8090/api/v1
npm run dev:utp     # backend con ORIGEN=utp (usa .env.mock-utp)
```

`mock-utp/servidor.ts` implementa el mismo contrato que `../api-estudiante-mock/mock_server.py`, sin necesitar Python. Además agrega el escenario de 6 s que sugiere el documento (cédula `8-600-600`) para probar el timeout, y una latencia opcional (`MOCK_LATENCIA_MS=150-400`).

### Agregar estudiantes al mock

Los estudiantes del mock están en **`mock-utp/estudiantes.json`**. Para agregar uno, copia un bloque, cambia los datos y guarda. **No hace falta reiniciar nada**: el mock lee el archivo en cada consulta.

```json
{
  "cedula": "9-876-5432",
  "nombre": "PEDRO PABLO GÓMEZ",
  "activo": true,
  "sede": "Centro Regional de Veraguas",
  "facultad": "Facultad de Ingeniería Eléctrica",
  "carrera": "Licenciatura en Ingeniería Electromecánica",
  "periodo": { "anio": 2026, "semestre": 2 }
}
```

| Campo | Obligatorio | Notas |
|-------|-------------|-------|
| `cedula` | sí | con guiones; no puede repetirse |
| `nombre` | sí | se muestra en mayúsculas |
| `activo` | sí | `true` (matriculado) o `false` |
| `sede`, `facultad`, `carrera` | no | |
| `periodo` | no | por defecto `{ "anio": 2026, "semestre": 2 }`; semestre `3` = verano |

- Separa los bloques con coma y no dejes una coma después del último.
- Si el archivo queda mal escrito, la terminal del mock muestra el error y sigue usando los datos anteriores hasta que lo corrijas.
- Para tener los QR de los nuevos estudiantes, corre `npm run qr:demo` en `frontend/`; se crean en `frontend/demo-qr/utp-*.png`.

Las cédulas `8-500-500` (sistema caído) y `8-600-600` (tarda 6 s) están reservadas para probar errores.

Para que el frontend use este backend en vez del modo demostración, en `frontend/.env`:

```
VITE_API_URL=/api
```

Vite reenvía `/api` a `http://127.0.0.1:4000` (ver `frontend/vite.config.ts`).

## Endpoints

### `GET /api/carnets/validar`

Recibe **exactamente uno** de estos parámetros:

```
GET /api/carnets/validar?cedula=8-123-456
GET /api/carnets/validar?carnet=2023-00451
GET /api/carnets/validar?qr=OC0xMjMtNDU2QHV0cC5hYy5wYQ%3D%3D
```

`qr` es el contenido del QR del carné UTP **sin modificar** (Base64 de `"<cedula>@<sufijo>"`). Con `ORIGEN=utp` se envía tal cual a `POST /estudiantes/validar-carne`; con `ORIGEN=local` se decodifica y se busca la cédula.

| Respuesta | Significado |
|-----------|-------------|
| `200` + `Titular` | carnet encontrado (activo o inactivo) |
| `400` + `{ "error" }` | parámetro faltante o repetido, formato no válido, QR que no se puede decodificar |
| `404` + `{ "error" }` | no existe carnet asociado |
| `429` + `{ "error" }` | se superó el límite de consultas por minuto de esta IP |
| `503` + `{ "error" }` | **no se pudo verificar**: API UTP caída, timeout, saturada o con credenciales rechazadas. Puede incluir `Retry-After` |

```json
{
  "nombre": "ANA MARÍA PÉREZ GÓMEZ",
  "cedula": "8-123-456",
  "tipo": "Estudiante",
  "unidad": "Facultad de Ingeniería de Sistemas Computacionales",
  "programa": "Licenciatura en Ingeniería de Software",
  "sede": "Campus Víctor Levi Sasso",
  "estado": "ACTIVO",
  "periodo": { "anio": 2026, "semestre": 2 },
  "fuente": "utp"
}
```

| Campo | Local | API UTP |
|-------|-------|---------|
| `carnet` | sí | solo si se consultó por código de carnet |
| `vigenteHasta` | sí | — |
| `periodo` | — | sí |
| `sede` | — | sí |
| `motivo` | si es inactivo | `No matriculado en el periodo vigente` si es inactivo |

Los campos opcionales se omiten cuando no aplican. La cédula se normaliza (`08-0123-00456` → `8-123-456`) y el código de carnet se pasa a mayúsculas.

### `GET /api/salud`

```json
{ "estado": "ok", "origen": "utp", "titularesLocales": 4 }
```

## Reglas de negocio

- **El backend decide el estado.**
  - Local: un registro `ACTIVO` cuyo `vigenteHasta` ya pasó se informa `INACTIVO` (`Carnet vencido`).
  - UTP: `activo: false` es `INACTIVO`, no un error. Los errores 500 y 503, el 429 y el timeout de 5 s se informan como **503 «no se pudo verificar»**, nunca como inactivo (recomendación del contrato UTP).
- **Búsqueda por código con `ORIGEN=utp`.** La API UTP no busca por código de carnet. Si el código pertenece a un estudiante en la base local, su estado se confirma en la API UTP con su cédula.
- **Cuidado del cupo de la API UTP** (60 solicitudes por minuto por cliente, y todo el sistema es un solo cliente):
  - Límite propio de `UTP_LIMITE_POR_MINUTO`, por defecto 55.
  - Caché en memoria de `UTP_CACHE_SEGUNDOS`, por defecto 30, para no repetir la misma consulta, por ejemplo el mismo QR escaneado dos veces.
- **Token OAuth2.** Se reutiliza hasta 60 s antes de vencer. Si la API responde 401, se pide un token nuevo y se reintenta una sola vez. Las consultas simultáneas comparten la misma solicitud de token.
- **Privacidad.**
  - Las respuestas llevan `Cache-Control: no-store`.
  - Los logs registran la ruta sin la cadena de consulta, es decir, sin cédulas ni tokens QR.
  - La bitácora `validaciones` guarda el tipo de criterio, la fuente y el resultado. Nunca guarda el valor consultado.
- **Anti-enumeración.** Hay un límite por IP (`RATE_LIMIT_MAX`, por defecto 30 por minuto). CORS solo admite los orígenes de `CORS_ORIGIN` y el método `GET`.

## Configuración

Copia `.env.example` a `.env`. Todas las variables tienen valor por defecto, salvo las credenciales UTP cuando `ORIGEN=utp`.

| Variable | Por defecto | Uso |
|----------|-------------|-----|
| `PORT` | `4000` | puerto de la API |
| `HOST` | `0.0.0.0` | interfaz de escucha |
| `DB_PATH` | `data/carnets.db` | archivo SQLite |
| `CORS_ORIGIN` | `http://localhost:5173` | orígenes permitidos, separados por coma |
| `RATE_LIMIT_MAX` | `30` | consultas por minuto por IP |
| `ZONA_HORARIA` | `America/Panama` | para decidir si un carnet local ya venció |
| `LOG_LEVEL` | `info` | nivel de log de Fastify |
| `ORIGEN` | `local` | `local` o `utp` |
| `UTP_API_URL` | `http://localhost:8090/api/v1` | URL base de la API UTP |
| `UTP_CLIENT_ID` / `UTP_CLIENT_SECRET` | — | credenciales OAuth2 (obligatorias con `ORIGEN=utp`) |
| `UTP_TIMEOUT_MS` | `5000` | timeout por solicitud a la API UTP |
| `UTP_LIMITE_POR_MINUTO` | `55` | límite propio de solicitudes a la API UTP |
| `UTP_CACHE_SEGUNDOS` | `30` | reutilización de respuestas (`0` = sin caché) |

Cuando la AIG entregue la API definitiva, basta con cambiar `UTP_API_URL` y las credenciales. Si cambian nombres de rutas o campos (el contrato lo advierte), el único archivo a tocar es `src/origen-utp.ts`.

## Cargar datos locales

`npm run db:seed -- ruta/archivo.json` importa un arreglo JSON con el formato `Titular` local (con `carnet` y `vigenteHasta`). Por ejemplo, la planilla de colaboradores. Cada registro se valida y, si el código ya existe, se actualiza. Si un registro es inválido, no se importa nada.

## Base de datos

```
titulares     id, cedula (única), carnet (único), nombre, tipo, unidad, programa,
              estado, vigente_hasta, motivo, actualizado_en
validaciones  id, criterio (cedula|carnet|qr), fuente (local|utp),
              resultado (ACTIVO|INACTIVO|NO_ENCONTRADO|NO_VERIFICADO), titular_id, consultado_en
```

El esquema se crea y migra automáticamente al iniciar (`src/db.ts`, versión en `PRAGMA user_version`).

## Estructura

```
src/
├── server.ts           # arranque: configuración, origen de datos, escucha
├── app.ts              # Fastify: CORS, límite por IP, rutas /api, traducción de errores
├── config.ts           # variables de entorno
├── origen.ts           # interfaz OrigenDatos, errores, origen local
├── origen-utp.ts       # cliente de la API UTP (token, timeout, cupo, caché) y origen UTP
├── db.ts               # conexión SQLite, esquema y migraciones
├── repositorio.ts      # consultas, bitácora, importación y validación de registros
├── estado.ts           # regla de vigencia de registros locales
├── identificadores.ts  # cédula, código de carnet y token QR (igual que el frontend)
└── tipos.ts            # Titular, Criterio
mock-utp/servidor.ts    # mock de la API UTP en Node
scripts/sembrar.ts      # importación de titulares desde JSON
data/titulares-demo.json
test/api.test.ts        # origen local, validaciones, límites, migración
test/utp.test.ts        # integración con el mock UTP: token, 401, 503, timeout, caché, cupo
```

> `identificadores.ts` replica las reglas de `frontend/src/utils/cedula.ts` y `qr.ts`. Si cambias una, cambia la otra.
