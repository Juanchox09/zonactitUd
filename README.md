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
| [`docs/tesis/`](docs/tesis/) | Documentos de la tesis por objetivo: Capítulo I, encuesta y entrevista, arquitectura y lineamientos, plan de pruebas de campo | Markdown |
| [`CLAUDE.md`](CLAUDE.md) | Reglas para que todo cambio siga el anteproyecto al pie de la letra | — |
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

> **Validar exige iniciar sesión** (`Authorization: Bearer <token>`): cada validación registra la tienda y el descuento aplicado. El personal de tienda valida siempre en la suya (se toma de la sesión); el admin indica `comercio_id`. Sin sesión: 401.

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/api/carnets/validar?cedula=8-123-456` | por cédula; si el estudiante está activo, **registra automáticamente el descuento vigente hoy de la tienda** y lo devuelve en `descuento` |
| GET | `/api/carnets/validar?qr=<contenido del QR>` | por QR leído con la cámara del navegador |
| POST | `/api/carnets/validar-imagen` (campo `imagen`) | por foto del QR; se lee con **OpenCV** en el servidor |
| GET | `/api/validacion/tienda` | tienda de la sesión, sus ofertas disponibles hoy y la que se aplicará |
| GET | `/api/salud` | estado de la API y de la base |
| GET | `/api/comercios` | tiendas con al menos una oferta vigente hoy (selector del admin) |
| POST | `/api/canjes` | registra un descuento aplicado, solo si el estudiante está activo (con sesión) |
| POST | `/api/auth/login` | inicia sesión `{ usuario, contrasena }` (rol `admin` o `comercio`) y devuelve el token |
| GET | `/api/auth/sesion` | usuario de la sesión actual (y su tienda, si es de comercio) |
| GET | `/api/panel/comercios/{id}` | tienda, sus ofertas y usuarios. **Comercio: solo la suya; admin: cualquiera** |
| POST / PUT / DELETE | `/api/panel/comercios/{id}/descuentos[/{d}]` | publicar, editar (valor, días, vigencia, principal, activa) o eliminar ofertas |
| GET | `/api/panel/comercios/{id}/metricas?dias=30` | métricas básicas de la tienda |
| GET / POST / PUT | `/api/admin/comercios[/{id}]` | afiliar y editar tiendas. **Solo admin** |
| POST | `/api/admin/comercios/{id}/usuarios` | crear un usuario de la tienda con su permiso: `cajero` (solo valida) o `administrador` (gestiona la tienda). **Solo admin** |
| GET | `/api/admin/usuarios` | todos los usuarios, con tienda, permiso y último acceso. **Solo admin** |
| PATCH / DELETE | `/api/admin/usuarios/{id}` | cambiar nombre, permiso (`cajero` / `administrador`), contraseña o estado, o eliminar un usuario de tienda. **Solo admin** |
| GET / POST / PATCH / DELETE | `/api/panel/comercios/{id}/usuarios[/{u}]` | equipo de la tienda: el administrador de la tienda gestiona a sus **cajeros** |
| GET | `/api/reportes?dias=30` | uso del programa: horarios, tiendas, facultades, descuentos y alertas. **Solo admin** |
| GET | `/api/reportes/validacion?dias=30` | reporte de validación: tasa de validaciones exitosas y tiempos de respuesta (OE6). **Solo admin** |

| Respuesta | Significado |
|-----------|-------------|
| `200` + `Titular` | estudiante encontrado, `ACTIVO` o `INACTIVO` |
| `400` + `{ "error" }` | parámetro faltante, formato inválido o QR ilegible |
| `404` + `{ "error" }` | no existe el estudiante |
| `401` / `403` + `{ "error" }` | panel sin sesión o sesión vencida (401); rol sin permiso u otra tienda (403) |
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
docker compose run --rm --no-deps api pytest -q    # 100 pruebas: identificadores, cliente UTP, endpoints, OpenCV, reportería, descuento por tienda, sesiones, panel del comercio, permisos de usuario, reporte de validación
```

Las pruebas levantan el mismo mock de `mock-utp/servidor.py` con estudiantes en memoria y usan SQLite en memoria, así que no necesitan MySQL.

**Postman:** importa `postman/ActitUd.postman_collection.json`. Con `docker compose up` corriendo, usa «Run collection» para ejecutar todas las pruebas.

## Panel administrativo y reportería

En la app, pestaña **Panel** (`#/panel`). Según quién inicie sesión:

- **Administración (rol `admin`):** *Uso del programa*, *Validación* (tasa de validaciones exitosas, tiempo mediano, P90 y P95, % dentro de la meta de 2 s, por método y por tienda, exportable a CSV), *Comercios* (afiliar tiendas, activarlas y gestionar sus ofertas y usuarios) y *Usuarios* (todos los usuarios con su tienda, permiso y último acceso; crear, editar, cambiar permiso o contraseña, desactivar y eliminar).
- **Administrador de tienda (rol `comercio`, permiso `administrador`):** *Mis ofertas* (publicar, editar, activar, elegir la principal, días y vigencia), *Métricas* de su tienda y *Equipo* (crear y gestionar a sus cajeros).
- **Cajero (rol `comercio`, permiso `cajero`):** solo valida. Al iniciar sesión va directo al validador con su tienda fijada; no entra al panel.

Al iniciar sesión se confirma quién entró y con qué permiso, y la cabecera muestra al usuario con el botón para cerrar sesión.

Reportería del programa: horarios de uso, tiendas con más descuentos, uso por facultad en proporción a la matrícula, tipos de descuento, ahorro entregado y alertas de posible fraude, sin guardar cédulas. Detalle en [`docs/propuesta-reporteria.md`](docs/propuesta-reporteria.md).

```bash
docker compose exec api python -m scripts.sembrar_reporteria --reiniciar                  # 24 comercios reales de ActitUd + historial simulado
docker compose exec api python -m scripts.sembrar_reporteria --reiniciar --sin-historial  # solo comercios, para pruebas de campo
# App → pestaña "Panel" → usuario admin, contraseña actitud2026 (solo desarrollo)
```

**Descuento por tienda.** En el validador, el cajero elige su tienda (se recuerda en ese equipo). Cuando un estudiante sale **activo**, la API busca el descuento de esa tienda vigente ese día (la oferta marcada como principal; si no aplica, la primera oferta vigente), lo guarda como canje y la app muestra cuál aplicar, por ejemplo «2x1 en combos los martes». Si el mismo estudiante se vuelve a validar en la misma tienda antes de 10 minutos, no se duplica.

**Acceso de administrador.** Los reportes piden iniciar sesión. Al arrancar, la API crea el usuario `admin` (variables `ADMIN_USUARIO`, `ADMIN_CONTRASENA`) si no existe. La contraseña se guarda cifrada con scrypt y la sesión es un token firmado que vence en 8 horas (`SESION_HORAS`). En producción hay que cambiar `ADMIN_CONTRASENA`, `CLAVE_SESION` y `CLAVE_ANONIMIZACION`.

## Pendiente (según el anteproyecto)

- [x] Comercios afiliados, descuentos y usuarios (admin / comercio) en MySQL
- [x] Registro del descuento aplicado al validar en una tienda
- [x] Inicio de sesión para el panel (admin y comercio)
- [x] Sesión de la tienda: el validador toma la tienda del usuario
- [x] Panel del comercio: ofertas, configuración de descuentos (días, vigencia, principal) y métricas (OE5)
- [x] Reporte de validación: tiempos de respuesta y tasa de validaciones exitosas (OE6)
- [ ] Aplicar la encuesta y la entrevista (OE2) y las pruebas de campo con usuarios (OE6): ver `docs/tesis/`
- [ ] App instalable en el celular (PWA)
- [ ] Quitar del frontend los colaboradores, egresados y la búsqueda por código de carnet; el alcance es solo estudiantes
- [ ] Eliminar `backend/` (Node.js)
- [x] Repositorio en GitHub (versión de demostración en GitHub Pages)
- [ ] Despliegue en la nube: opcional, el anteproyecto vigente no lo exige
