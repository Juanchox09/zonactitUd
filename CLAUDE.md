# Reglas de la tesis ActitUd

Fuente oficial: **anteproyecto "Sistema de validación digital mediante código QR del carnet estudiantil de la UTP para la gestión de descuentos y beneficios en establecimientos afiliados del Centro Comercial Altaplaza Mall"**.

- Autor: Juan González. Asesor: Prof. Kaiser Williams.
- Carrera: Lic. en Desarrollo de Software, FISC, Centro Regional de Panamá Oeste, 2026.

**Todo cambio o solicitud se ejecuta al pie de la letra de ese documento.** Si una petición se aparta de él, se avisa antes de implementarla y se propone la forma que sí cumple.

## 1. Antes de cualquier cambio: ubicarlo en el anteproyecto

Cada tarea debe responder a uno de estos objetivos específicos o a una actividad del cronograma. Se menciona cuál en la respuesta y en el mensaje de commit.

| # | Objetivo específico | Entregable en el repo |
|---|---|---|
| OE1 | Analizar el programa ACTITUD y las brechas de la validación actual | `docs/tesis/01-capitulo-I-introduccion-y-justificacion.md` |
| OE2 | Perfil y volumen de estudiantes (encuestas + entrevista a mercadeo de Altaplaza) | `docs/tesis/02-instrumentos-encuesta-y-entrevista.md` |
| OE3 | Arquitectura: componentes, modelo de datos, flujos de autenticación, lineamientos de seguridad y privacidad | `docs/tesis/03-arquitectura-y-lineamientos.md` |
| OE4 | Prototipo: escaneo QR + consulta de estatus en tiempo real + confirmación automática del descuento, con datos simulados | `frontend/` (validador), `api/`, `mock-utp/` |
| OE5 | Panel administrativo para que **los comercios** gestionen ofertas, configuren descuentos y vean métricas | `frontend/src/components/panel`, `/api/panel/*`, `/api/admin/*` |
| OE6 | Evaluar con usuarios: tiempos de respuesta, tasa de validaciones exitosas y satisfacción | Panel → Validación (`/api/reportes/validacion`), `docs/tesis/04-plan-de-pruebas-de-campo.md` |

Plan de contenido: capítulos I a VI y anexos (cronograma, herramientas, correo de Altaplaza). El cronograma tiene 6 semanas y 11 actividades.

Si una idea no encaja en ningún objetivo, se anota como "mejora futura" (Capítulo VI) en vez de construirla, salvo que el usuario insista.

## 2. Reglas del negocio (anexo: arte oficial ActitUd y correo de Altaplaza)

- El beneficio es **solo para estudiantes activos**: matriculados en el periodo vigente, según la UTP. Si la UTP no responde, el resultado es "no se pudo verificar", **nunca "inactivo"**, y no hay descuento.
- **Cada comercio tiene su descuento.** Al validar se aplica la oferta *principal* vigente ese día.
- Respetar **días** ("de lunes a viernes"; SK Karts de lunes a jueves; Crazy Park de lunes a miércoles), **vigencia** (hasta el 31/12/2026) y **condiciones** (precio regular, no acumulable, no transferible, no a domicilio ni agregadores, no en reservas de cumpleaños).
- Categorías oficiales: **Shopping, Restaurantes, Entretenimiento**. Comercios reales: `api/scripts/sembrar_reporteria.py` (`COMERCIOS_ACTITUD`).
- Población: estudiantes activos del Campus Central de la UTP (≈ 4,300, primer semestre de 2026). Población secundaria: los comercios afiliados.

## 3. Tecnología obligatoria (sección "Herramientas a utilizar")

- **Python** para el backend y la lógica de validación (FastAPI), con las librerías **qrcode** y **OpenCV**.
- **MySQL** para la base de datos: perfiles estudiantiles simulados, comercios, descuentos y registros de validación.
- **Postman**: toda ruta nueva o modificada se agrega a `postman/ActitUd.postman_collection.json`.
- **GitHub** para el control de versiones.
- **Lector QR** y **PowerPoint** para la defensa.
- El frontend (React) no está restringido por el documento.
- **No** reintroducir el backend viejo de Node (`backend/`).
- **No** dar a `api/` acceso directo a los estudiantes: siempre se consultan vía la API UTP (`mock-utp/` hoy, DITIC mañana).

## 4. Seguridad y privacidad (OE3, Ley 81 de 2019)

- Nunca guardar la cédula, el nombre ni el contenido del QR. Los canjes identifican al estudiante con un HMAC de la cédula.
- Reportes con k-anonimato: grupos de menos de 5 estudiantes van a "Otros".
- Un comercio solo accede a su tienda; solo el admin ve los reportes globales y gestiona comercios.
- Contraseñas con scrypt, sesiones con firma HMAC y vencimiento, secretos en variables de entorno, `Cache-Control: no-store`.
- Si un cambio toca datos personales, se actualiza la sección 7 de `03-arquitectura-y-lineamientos.md`.

## 5. Calidad antes de entregar

- **API:** `docker compose exec -T api python -m pytest -q` debe pasar completo, con pruebas nuevas para cada regla nueva.
- **Frontend:** `cd frontend && npx tsc --noEmit -p . && npm test`.
- **Visual:** revisar el cambio en el navegador (escritorio y 390 px) cuando cambie la interfaz.
- **Documentación:** si cambia el comportamiento, actualizar el documento del objetivo correspondiente en `docs/tesis/` y el `README.md`.
- **Datos:** no inventar datos de campo (resultados de la encuesta, de la entrevista o de las pruebas con usuarios). Donde falten, dejar **[COMPLETAR]** para que el autor los llene.

## 6. Git y autoría

- El repositorio es personal: <https://github.com/Juanchox09/zonactitUd>. Los commits usan el correo personal configurado con `git config --local` en este repo. **No cambiar la configuración global.**
- **El autor de los commits es Juan González. No agregar `Co-Authored-By: Claude` ni ninguna otra atribución a Claude.**
- Ramas:
  - `dev_juan` es la de trabajo.
  - `main` es la versión publicada en GitHub Pages.
  - **No fusionar `dev_juan` en `main` sin que el autor lo pida.**
- Hacer commit y push solo cuando el autor lo pida. Mensajes en español que indiquen el objetivo (p. ej. "OE5: …").

## 7. Comunicación

- Responder en español, en términos que el autor pueda llevar a la tesis y a la defensa.
- Al terminar una tarea, decir qué objetivo cubre, qué falta para cumplirlo completo y qué le toca hacer al autor (encuestas, entrevistas, pruebas con usuarios).
