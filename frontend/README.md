# Frontend · Validación de Carnet

Aplicación web para validar si un carnet está **activo** o **inactivo**, leyendo su **código QR** (cámara o imagen) o ingresando el **número de cédula**.

Stack: Vite + React 19 + TypeScript · lectura de QR con [`html5-qrcode`](https://github.com/mebjas/html5-qrcode).

## Ejecutar

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # pruebas unitarias (vitest)
npm run build      # verificación de tipos + build de producción en dist/
npm run qr:demo    # genera QR de prueba en demo-qr/
```

> La cámara solo funciona en `localhost` o con HTTPS. Para probar desde el celular en la misma red, usa un túnel HTTPS o `vite --https`.

## Modo demostración vs. API real

Sin configuración, la app funciona en **modo demostración** con los titulares ficticios de `src/services/datos-demo.json`.

Para conectarla al backend, crea `.env` a partir de `.env.example`:

```
VITE_API_URL=/api                      # backend local (../backend) a través del proxy de Vite
VITE_API_URL=https://mi-backend/api    # backend desplegado
```

### Contrato esperado del backend

```
GET {VITE_API_URL}/carnets/validar?cedula=8-123-456
GET {VITE_API_URL}/carnets/validar?carnet=2023-00451
GET {VITE_API_URL}/carnets/validar?qr=<contenido del QR del carné UTP>
```

| Respuesta | Significado |
|-----------|-------------|
| `200` + JSON `Titular` | carnet encontrado (activo o inactivo) |
| `404` | no existe carnet asociado |
| otro (`400`, `429`, `503`) | se muestra el mensaje `{ "error" }` del backend; `503` = no se pudo verificar |

```json
{
  "nombre": "María Fernanda Ríos Batista",
  "cedula": "8-123-456",
  "carnet": "2023-00451",
  "tipo": "Estudiante",
  "unidad": "Facultad de Ingeniería de Sistemas Computacionales",
  "programa": "Licenciatura en Ingeniería de Software",
  "estado": "ACTIVO",
  "vigenteHasta": "2027-03-31",
  "fuente": "local"
}
```

Cuando el estado sale de la API de la UTP no vienen `carnet` ni `vigenteHasta`; en su lugar vienen `periodo` (`{ "anio": 2026, "semestre": 2 }`) y `sede`, y la tarjeta muestra el periodo académico. Detalle completo en [`backend/README.md`](../backend/README.md).

`tipo`: `Estudiante` | `Colaborador` | `Egresado` · `estado`: `ACTIVO` | `INACTIVO`.
El backend decide el estado; el frontend solo lo muestra.

## Contenido del QR

El lector acepta cualquiera de estos formatos (ver `src/utils/qr.ts`):

| Formato | Ejemplo |
|---------|---------|
| Carné UTP | Base64 de `<cedula>@utp.ac.pa`, p. ej. `OC0xMjMtNDU2QHV0cC5hYy5wYQ==`. Se envía sin modificar al backend |
| JSON | `{"carnet":"2023-00451"}` o `{"cedula":"8-123-456"}` |
| URL con parámetro | `https://dominio/validar?cedula=8-123-456` |
| URL con código al final | `https://dominio/carnet/2023-00451` |
| Texto plano | `8-123-456` o `2023-00451` |

**Recomendación:** que el QR del carnet contenga solo el código del carnet (o una URL firmada), no la cédula, para no exponer datos personales a cualquiera que lo escanee.

## Estructura

```
src/
├── App.tsx                    # orquesta modos, consulta e historial
├── types.ts                   # Titular, Criterio, ResultadoValidacion
├── components/
│   ├── EscanerQr.tsx          # cámara + subir imagen
│   ├── FormularioCedula.tsx   # ingreso y validación de formato
│   ├── Resultado.tsx          # tarjeta ACTIVO / INACTIVO / No registrado / error
│   ├── Historial.tsx          # últimas validaciones (solo en memoria)
│   ├── AvisoDemo.tsx
│   └── Iconos.tsx
├── services/
│   ├── validacion.ts          # servicio demo o API según VITE_API_URL
│   └── datos-demo.json
└── utils/
    ├── cedula.ts              # formatos de cédula panameña
    ├── qr.ts                  # interpretación del contenido del QR
    └── formato.ts
```

El historial vive solo en memoria y se borra al recargar la página: no se guardan datos personales en el navegador.
