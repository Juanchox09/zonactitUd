# Plan de pruebas de campo con usuarios representativos

> **Sí, son obligatorias en tu anteproyecto.** Aparecen en tres lugares:
> - **Objetivo específico 6:** *"Evaluar la efectividad del prototipo mediante pruebas de validación funcional con usuarios representativos, midiendo tiempos de respuesta, tasa de validaciones exitosas y nivel de satisfacción, como base para determinar la viabilidad de una implementación real."*
> - **Cronograma, actividad 8 (semana 5):** "Pruebas de validación con usuarios representativos y medición de indicadores".
> - **Capítulo V:** "Evaluación de la viabilidad técnica del prototipo mediante pruebas de validación funcional con usuarios representativos" y "Medición de tiempos de respuesta y tasa de validaciones exitosas durante las pruebas".
>
> Las pruebas automáticas (100 en `api/tests` y 23 en el frontend) **no las reemplazan**: demuestran que el código hace lo que debe, pero el objetivo 6 pide personas usando el sistema.

## 1. Objetivo de las pruebas

Medir, en condiciones representativas, tres indicadores:

| Indicador | Cómo se obtiene | Meta propuesta (justificarla en el Capítulo V) |
|---|---|---|
| Tiempo de respuesta | Automático: **Panel → Validación** (mediana, percentil 90 y 95, % dentro de la meta) | Mediana ≤ 2 s por validación; además, cronometrar el tiempo total en el mostrador |
| Tasa de validaciones exitosas | Automático: **Panel → Validación** (respuestas definitivas / total) | ≥ 95 % |
| Exactitud de la decisión | Comparando el resultado del sistema con el estado esperado del carnet de prueba | 100 % (ningún inactivo con descuento, ningún activo rechazado) |
| Nivel de satisfacción | Cuestionario SUS y preguntas por rol (Instrumento C) | SUS ≥ 68 |

## 2. Participantes

| Rol | Cantidad sugerida | Quiénes |
|---|---|---|
| Estudiantes | 10 a 15 | Estudiantes del Campus Central con el carnet digital, o con carnets de prueba generados por el sistema |
| Personal de comercio (cajero) | 3 a 5 | Personal de comercios afiliados que acepten participar o, si no es posible, personas en el rol de cajero |
| Comercio en el panel | 2 a 3 | Encargados de tienda: publicar y configurar una oferta y leer sus métricas |
| Administración del mall | 1 a 2 | Equipo de mercadeo: reportes y gestión de comercios |

> Con 5 usuarios por rol se detecta la mayoría de los problemas de usabilidad (Nielsen, 2000). Para el SUS, reunir al menos 12 cuestionarios en total.

## 3. Preparación (el día anterior)

1. **Dejar la base limpia** con los 24 comercios reales del arte ActitUd y sus ofertas (de lunes a viernes, hasta el 31/12/2026), **sin historial simulado**, para que las métricas reflejen solo la prueba:

   ```bash
   docker compose exec api python -m scripts.sembrar_reporteria --reiniciar --sin-historial
   ```

   Este comando borra los canjes, las validaciones y los usuarios de comercio anteriores; el administrador se conserva. Como las ofertas reales aplican de lunes a viernes, **la prueba debe hacerse un día hábil**.
2. **Carnets de prueba:** genera QR de estudiantes ficticios **activos e inactivos** con `mock-utp/generar_qr.py` e imprímelos o pásalos a celulares.
3. **Tiendas y usuarios:** en **Panel → Usuarios**, crea por cada tienda participante un usuario **administrador de tienda** (encargado) y uno o más **cajeros**, y verifica que cada tienda tenga una oferta vigente ese día.
4. **Red real:** levanta el sistema en una laptop o servidor accesible por Wi-Fi o datos desde los celulares. La cámara del celular exige HTTPS o `localhost`.
5. **Opcional, latencia realista:** levanta el mock con `MOCK_LATENCIA_MS=300` (o un valor similar) para simular la red hasta la UTP.

## 4. Escenarios (guion)

| # | Escenario | Rol | Resultado esperado |
|---|---|---|---|
| E1 | Escanear el QR de un estudiante **activo** | Cajero + estudiante | Pantalla verde, nombre del titular y descuento de la tienda; queda un canje registrado |
| E2 | Escanear el QR de un estudiante **inactivo** | Cajero + estudiante | Rechazo claro, sin descuento |
| E3 | Escanear un QR que no es de un carnet UTP | Cajero | Mensaje "no es un carnet UTP" |
| E4 | Escribir la cédula (el QR no se lee) | Cajero | Mismo resultado que el escaneo |
| E5 | Escanear dos veces seguidas el mismo carnet | Cajero | El segundo escaneo indica "ya registrado"; no se duplica el canje |
| E6 | Validar en una tienda sin oferta vigente hoy | Cajero | El validador avisa que la tienda no tiene ofertas vigentes hoy y no permite escanear |
| E6b | Intentar validar sin iniciar sesión | Cajero | La app pide iniciar sesión; no se puede escanear |
| E7 | Publicar una oferta nueva "de lunes a viernes, hasta el 31/12/2026" y marcarla como principal | Comercio (panel) | Aparece "Se aplica hoy" y la siguiente validación usa ese descuento |
| E8 | Desactivar una oferta y revisar las métricas de la tienda | Comercio (panel) | La oferta deja de aplicarse; las métricas muestran los canjes de la prueba |
| E9 | Revisar el reporte de validación y exportar el CSV | Admin | Indicadores de la sesión de prueba |
| E10 | *(Opcional)* Simular la caída de la UTP (detener `mock-utp`) | Cajero | "No se pudo verificar"; nunca "inactivo" |
| E11 | Iniciar sesión con un usuario de caja | Cajero | Confirma la sesión, va directo al validador con su tienda fijada y no puede abrir ofertas ni métricas |
| E12 | Crear un cajero nuevo, cambiarle la contraseña y desactivarlo | Comercio (panel) | El cajero entra con su contraseña; desactivado, ya no puede entrar |

En cada escenario, el observador registra: éxito sin ayuda, éxito con ayuda o fallo; el tiempo total en el mostrador (cronómetro: desde que el estudiante muestra el QR hasta que el cajero sabe qué hacer); y los comentarios del participante.

## 5. Hoja de registro del observador

| Participante | Rol | Escenario | ¿Sin ayuda? (S/A/F) | Tiempo en mostrador (s) | Resultado del sistema | ¿Correcto? | Observaciones |
|---|---|---|---|---|---|---|---|
| P01 | Cajero | E1 | | | | | |
| … | | | | | | | |

## 6. Evidencias para el Capítulo V

1. **CSV del reporte de validación** (Panel → Validación → Exportar CSV) del periodo de la prueba.
2. **Capturas de pantalla** de los escenarios y del panel.
3. **Hojas de registro** del observador y las **respuestas del SUS** (planilla con el cálculo).
4. **Fotos** de la sesión, solo con el consentimiento de los participantes.
5. **Análisis** a partir de los datos medidos:
   - promedio, mediana, P90 y P95 del tiempo de respuesta;
   - tasa de éxito y exactitud;
   - puntaje SUS medio con su desviación;
   - problemas encontrados y mejoras propuestas.

## 7. Criterio de viabilidad

El prototipo se considera **técnicamente viable** para una implementación real si en la prueba:

- la tasa de validaciones exitosas es ≥ 95 %;
- la exactitud de la decisión es del 100 %;
- la mediana del tiempo de respuesta es ≤ 2 s;
- el SUS medio es ≥ 68.

Si algún criterio no se cumple, el Capítulo V explica la causa y la mejora propuesta.

> Las metas son una propuesta del autor: confírmalas con el asesor antes de la prueba.
