# Tesis · ActitUd: validación digital del carnet UTP

Sistema de validación digital del carnet estudiantil con código QR para la gestión de descuentos en los comercios afiliados de Altaplaza Mall (programa ActitUd).

```
App de escaneo (React) ──▶ API ActitUd (Python/FastAPI) ──OAuth2──▶ API Estado de Estudiante UTP (mock)
                                  │                                        │
                                  ▼                                        ▼
                           MySQL · base actitud                    MySQL · base utp_mock
                           (validaciones; luego comercios,          (estudiantes simulados)
                            descuentos, usuarios)
```

La API ActitUd **nunca lee estudiantes directamente**: siempre los consulta por HTTP a la API de la UTP, igual que hará con la API real de la DITIC. Hoy esa API es un mock que guarda sus estudiantes en MySQL. Cuando llegue la API real, basta con cambiar `UTP_API_URL` y las credenciales.

| Carpeta | Contenido | Tecnología |
|---------|-----------|------------|
| [`api/`](api/) | API REST ActitUd | Python 3.12, FastAPI, SQLAlchemy, MySQL, OpenCV |
| [`mock-utp/`](mock-utp/) | Mock de la API de Estado de Estudiante UTP | Python 3.12 (biblioteca estándar + PyMySQL) |
| [`db/init/`](db/init/) | Creación de bases, usuarios y estudiantes simulados | MySQL 8.4 |
| [`frontend/`](frontend/) | App de escaneo QR / cédula | Vite, React 19, TypeScript |
| [`postman/`](postman/) | Colección de pruebas de la API | Postman |
| [`api-estudiante-mock/`](api-estudiante-mock/) | Contrato provisional de la API UTP (no se modifica) | OpenAPI |
| `backend/` | Primera versión en Node.js. **Reemplazada por `api/`**, se eliminará | — |

## Levantar todo en local

Requisitos: Docker Desktop y Node.js 24 (solo para el frontend). Python no hace falta instalarlo: corre dentro de Docker.

```bash
# Terminal 1: MySQL + mock UTP + API (la primera vez tarda unos minutos)
docker compose up --build

# Terminal 2: frontend en http://localhost:5173
cd frontend
npm install
echo VITE_API_URL=/api > .env
npm run dev
```

| Servicio | URL |
|----------|-----|
| App | http://localhost:5173 |
| API ActitUd | http://localhost:4000/api |
| Documentación interactiva de la API (Swagger) | http://localhost:4000/docs |
| Mock API UTP | http://localhost:8090/api/v1 |
| Adminer (ver y editar las tablas) | http://localhost:8081 |
| MySQL | `localhost:3306` |

Para detener: `Ctrl+C` en la terminal 1, o `docker compose down`. Los datos de MySQL se conservan. `docker compose down -v` los borra y la próxima vez se vuelven a cargar los estudiantes iniciales.

## Estudiantes simulados

Están en la tabla **`utp_mock.estudiantes`**. Los cambios se aplican al instante, sin reiniciar nada.

**Con Adminer:** entra a http://localhost:8081 con sistema `MySQL`, servidor `mysql`, usuario `utp_mock`, contraseña `utp_mock_local` y base `utp_mock`. Abre `estudiantes` y elige «Nuevo registro».

**Con SQL:**

```bash
docker compose exec mysql mysql -uutp_mock -putp_mock_local --default-character-set=utf8mb4 utp_mock \
  -e "INSERT INTO estudiantes (cedula, nombre, activo, sede, facultad, carrera) VALUES
      ('9-876-5432', 'PEDRO PABLO GÓMEZ', TRUE, 'Centro Regional de Veraguas',
       'Facultad de Ingeniería Eléctrica', 'Licenciatura en Ingeniería Electromecánica')"
```

| Columna | Obligatoria | Notas |
|---------|-------------|-------|
| `cedula` | sí | normalizada, sin ceros a la izquierda (`8-123-456`); no se repite |
| `nombre` | sí | se muestra en mayúsculas |
| `activo` | sí | `TRUE` = matriculado en el periodo vigente |
| `sede`, `facultad`, `carrera` | no | |
| `periodo_anio`, `periodo_semestre` | no | por defecto 2026 y 2; semestre 3 = verano |

Las cédulas `8-500-500` (sistema caído) y `8-600-600` (tarda 6 s) están reservadas para probar errores.

**QR de los estudiantes** (formato del carné UTP: Base64 de `<cedula>@utp.ac.pa`), generados con la librería `qrcode`:

```bash
docker compose run --rm -v ./frontend/demo-qr:/salida mock-utp python generar_qr.py
```

## API

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/api/carnets/validar?cedula=8-123-456` | por cédula |
| GET | `/api/carnets/validar?qr=<contenido del QR>` | por QR leído con la cámara del navegador |
| POST | `/api/carnets/validar-imagen` (campo `imagen`) | por foto del QR; se lee con **OpenCV** en el servidor |
| GET | `/api/salud` | estado de la API y de la base |
| GET | `/api/comercios` | comercios afiliados y sus descuentos *(propuesta de reportería)* |
| POST | `/api/canjes` | registra un descuento aplicado, solo si el estudiante está activo *(propuesta)* |
| GET | `/api/reportes?dias=30` | indicadores, horarios, tiendas, facultades, tipos de descuento y alertas *(propuesta)* |

| Respuesta | Significado |
|-----------|-------------|
| `200` + `Titular` | estudiante encontrado, `ACTIVO` o `INACTIVO` |
| `400` + `{ "error" }` | parámetro faltante, formato inválido o QR ilegible |
| `404` + `{ "error" }` | no existe el estudiante |
| `429` + `{ "error" }` | más de 30 consultas por minuto desde la misma IP |
| `503` + `{ "error" }` | **no se pudo verificar**: API UTP caída, lenta (más de 5 s), saturada o con credenciales rechazadas. Nunca se informa como inactivo |

Reglas que respeta la integración con la API UTP:

- El token OAuth2 se reutiliza hasta 60 s antes de vencer. Si la API responde 401, se pide uno nuevo y se reintenta una sola vez.
- Timeout de 5 s por solicitud.
- Límite propio de 55 consultas por minuto, por debajo de las 60 que permite la UTP.
- Caché de 30 s para no repetir la misma consulta. Con el mock está desactivada.

Privacidad:

- La bitácora `validaciones` guarda solo el tipo de consulta, el resultado y la hora; nunca la cédula ni el QR.
- Los logs no muestran cédulas.
- Las respuestas llevan `Cache-Control: no-store`.
- El usuario de base `actitud` no tiene permisos sobre `utp_mock`.

## Pruebas

```bash
docker compose run --rm --no-deps api pytest -q    # 69 pruebas: identificadores, cliente UTP, endpoints, OpenCV, reportería
```

Las pruebas levantan el mismo mock de `mock-utp/servidor.py` con estudiantes en memoria y usan SQLite en memoria, así que no necesitan MySQL.

**Postman:** importa `postman/ActitUd.postman_collection.json`. Con `docker compose up` corriendo, usa «Run collection» para ejecutar todas las pruebas.

## Reportería (propuesta)

Prototipo en la rama `dev_juan`: horarios de uso, tiendas con más descuentos, uso por facultad en proporción a la matrícula, tipos de descuento, ahorro entregado y alertas de posible fraude, sin guardar cédulas. Detalle en [`docs/propuesta-reporteria.md`](docs/propuesta-reporteria.md).

```bash
docker compose exec api python -m scripts.sembrar_reporteria --reiniciar   # datos simulados
# App → pestaña "Reportes"
```

## Pendiente (según el anteproyecto)

- [ ] Comercios afiliados, descuentos y usuarios (cajero / administrador) en MySQL
- [ ] Inicio de sesión en la app de escaneo y registro del descuento aplicado
- [ ] Panel administrativo web: gestión de comercios y ofertas (las métricas están en la propuesta de reportería)
- [ ] App instalable en el celular (PWA)
- [ ] Quitar del frontend los colaboradores, egresados y la búsqueda por código de carnet; el alcance es solo estudiantes
- [ ] Eliminar `backend/` (Node.js)
- [ ] Repositorio en GitHub
- [ ] Despliegue en la nube (AWS/GCP)
