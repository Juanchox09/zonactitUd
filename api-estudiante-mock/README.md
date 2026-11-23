# API de Estado de Estudiante UTP: contrato de simulación

Contrato **provisional** para simular la consulta de "estudiante activo" mientras concluyen los trámites con la AIG. La API definitiva puede cambiar rutas o nombres de campos; el comportamiento (activo / inactivo / no encontrado) se mantendrá.

| Archivo | Uso |
|---|---|
| `openapi.yaml` | Contrato completo (OpenAPI 3.0). Importar en GhostMock si admite OpenAPI. |
| `mock-routes.json` | Las mismas reglas en una tabla neutral (método + ruta + condición → respuesta), por si GhostMock se configura a mano. |
| `mock_server.py` | Mock ejecutable sin dependencias: `python3 mock_server.py 8090` |

## 1. Endpoints y métodos

Base: `/api/v1`

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/token` | Obtiene token (OAuth2 `client_credentials`) |
| GET | `/estudiantes/{cedula}/estado` | Estado del estudiante por cédula |
| POST | `/estudiantes/validar-carne` | Recibe el contenido del QR del carné y devuelve el estado |

## 2. Request / response

**Consulta por cédula**
```http
GET /api/v1/estudiantes/8-123-456/estado
Authorization: Bearer mock-token-123
```
```json
{
  "cedula": "8-123-456",
  "nombre": "ANA MARÍA PÉREZ GÓMEZ",
  "activo": true,
  "matriculado": true,
  "sede": "Campus Víctor Levi Sasso",
  "facultad": "Facultad de Ingeniería de Sistemas Computacionales",
  "carrera": "Licenciatura en Ingeniería de Software",
  "periodo": { "anio": 2026, "semestre": 2 },
  "consultado_en": "2026-11-16T14:30:00-05:00"
}
```
Un estudiante que existe pero no está matriculado en el periodo vigente responde **200** con `"activo": false`, no con un error. La cédula admite ceros a la izquierda (`08-0123-00456` se normaliza a `8-123-456`).

**Validación por QR**: el QR del carné contiene Base64 de `"<cedula>@<sufijo>"`.
```http
POST /api/v1/estudiantes/validar-carne
Authorization: Bearer mock-token-123
Content-Type: application/json

{ "token_qr": "OC0xMjMtNDU2QHV0cC5hYy5wYQ==" }
```
Responde con el mismo cuerpo que la consulta por cédula.

**Datos de prueba (ficticios)**

| Cédula | Token QR | Resultado |
|---|---|---|
| `8-123-456` | `OC0xMjMtNDU2QHV0cC5hYy5wYQ==` | 200, activo |
| `8-234-567` | `OC0yMzQtNTY3QHV0cC5hYy5wYQ==` | 200, inactivo |
| `E-8-12345` | `RS04LTEyMzQ1QHV0cC5hYy5wYQ==` | 200, activo (extranjero) |
| `8-999-999` | — | 404 |
| `8-500-500` | — | 503 |
| `abc` | `zzz` | 400 |

## 3. Autenticación y headers

1. `POST /auth/token` con `Content-Type: application/x-www-form-urlencoded`:
   `grant_type=client_credentials&client_id=carnet-qr-tesis&client_secret=mock-secret`
2. Respuesta: `{"access_token":"mock-token-123","token_type":"Bearer","expires_in":3600,"scope":"estudiantes.estado:read"}`
3. En cada consulta: `Authorization: Bearer mock-token-123`.
   El token `mock-token-sin-permiso` sirve para probar el error 403.

Las respuestas usan `Content-Type: application/json; charset=utf-8`.

## 4. Códigos de estado y errores

Todos los errores usan el mismo formato:
```json
{ "codigo": "ESTUDIANTE_NO_ENCONTRADO", "mensaje": "No se encontró al estudiante.", "trace_id": "a1b2c3d4e5f6" }
```

| HTTP | `codigo` | Cuándo |
|---|---|---|
| 200 | — | Estudiante encontrado (revisar `activo`) |
| 400 | `CEDULA_INVALIDA` / `QR_INVALIDO` / `SOLICITUD_INVALIDA` | Formato incorrecto |
| 401 | `NO_AUTENTICADO` | Token ausente, inválido o expirado (incluye `WWW-Authenticate`) |
| 403 | `SIN_PERMISO` | Cliente sin scope `estudiantes.estado:read` |
| 404 | `ESTUDIANTE_NO_ENCONTRADO` | Cédula no registrada |
| 429 | `LIMITE_EXCEDIDO` | Más de 60 solicitudes/min (incluye `Retry-After`) |
| 500 | `ERROR_INTERNO` | Error no controlado |
| 503 | `ORIGEN_NO_DISPONIBLE` | Sistema de matrícula caído (incluye `Retry-After`) |

**Recomendación para el cliente:** tratar 503/500/timeout como "no se pudo verificar" y **no** como "inactivo". Usar un timeout de 5 s.

## 5. Configuración sugerida para GhostMock

- Puerto `8090`, prefijo `/api/v1`.
- Si GhostMock importa OpenAPI: cargar `openapi.yaml`. Los `examples` de cada respuesta están listos para devolverse.
- Si se configura por reglas: cargar las reglas de `mock-routes.json` **en orden**. Primero las de autenticación (403/401), luego las cédulas específicas y al final las reglas comodín (400 → 404).
- Latencia simulada sugerida: 150–400 ms. Agregar un escenario con 6 s para probar el timeout.
- Si GhostMock no está disponible, `mock_server.py` implementa exactamente este contrato.

**Probar rápido (con `mock_server.py`):**
```bash
python3 mock_server.py 8090
curl -s -X POST localhost:8090/api/v1/auth/token \
  -d 'grant_type=client_credentials&client_id=carnet-qr-tesis&client_secret=mock-secret'
curl -s -H 'Authorization: Bearer mock-token-123' \
  localhost:8090/api/v1/estudiantes/8-123-456/estado
```

## Nota sobre datos personales

El contrato devuelve solo los datos necesarios para validar el estado de estudiante. Datos sensibles como el tipo de sangre y el correo quedan fuera a propósito. Todos los nombres y cédulas de prueba son ficticios.
