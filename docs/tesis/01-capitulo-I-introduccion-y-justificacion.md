# Capítulo I: Introducción y Justificación

> **Objetivo específico 1 del anteproyecto:** *Analizar el funcionamiento actual del programa "ACTITUD" de Altaplaza Mall, identificando las brechas y limitaciones de los mecanismos de validación vigentes que permiten el uso indebido de los beneficios estudiantiles.*
>
> **Cómo leer este borrador:** el texto se apoya solo en lo que dice el anteproyecto y sus anexos: el correo de Altaplaza Mall del 8 de mayo de 2026 y el arte oficial de beneficios ACTITUD. Las marcas **[COMPLETAR]** señalan los datos que salen del trabajo de campo (entrevista con marketing y encuesta a estudiantes). Ese contenido no se puede inventar.

---

## 1.1 Antecedentes y contexto del programa "ACTITUD"

El Centro Comercial Altaplaza Mall, ubicado en Vía Centenario, Ciudad de Panamá, tiene un programa propio llamado **"ACTITUD"**. El equipo de mercadeo del mall lo define así: es *"el programa juvenil de AltaPlaza Mall creado para conectar con una nueva generación a través de experiencias, entretenimiento, beneficios y actividades diseñadas especialmente para jóvenes universitarios"*. Lo presenta como una comunidad que reúne música, deporte, tendencias y experiencias, por medio de eventos especiales, activaciones, fiestas temáticas y beneficios exclusivos. Así lo describe el correo de Altaplaza Mall del 8 de mayo de 2026 (Anexo C).

El componente comercial del programa es un conjunto de **descuentos exclusivos para estudiantes universitarios** en los establecimientos afiliados. Según el arte oficial "¡Conoce nuestros beneficios y descuentos!" que entregó el mall (Anexo D), la oferta vigente se organiza en tres categorías:

| Categoría | Establecimientos | Beneficios típicos |
|---|---|---|
| Shopping | 19 | Del 10 % al 25 %; casos especiales como 70 % en paquetes de depilación láser o B/. 500 de descuento en el abono inicial de un vehículo |
| Restaurantes | 10 | 10 % y 15 % |
| Entretenimiento | 2 | 10 % en carrera de adultos (de lunes a jueves); recarga duplicada de lunes a miércoles con recarga mínima de B/. 15.00 |
| **Total** | **31** | |

El mismo arte fija las condiciones de uso comunes a todos los beneficios:

- **Quién:** el descuento aplica solo a estudiantes universitarios del programa ACTITUD, que deben mostrar su carnet para validar la información.
- **Sobre qué:** aplica sobre mercancía a precio regular. No aplica con otras promociones, descuentos especiales ni descuentos de jubilados, ni sobre alianzas con otros comercios, gift cards o mercancía en área de sale.
- **Transferencia:** los descuentos no son transferibles.
- **Canales excluidos:** no aplican a domicilio, por call center, por agregadores (Pedidos Ya, Glovo, etc.) ni en reservas de cumpleaños.
- **Vigencia:** son válidos de lunes a viernes, hasta el 31 de diciembre de 2026, salvo las excepciones indicadas para cada comercio.

**Relación con la UTP.** El Campus Central de la Universidad Tecnológica de Panamá (UTP) está en las inmediaciones del mall. Según la Secretaría General, concentra una matrícula activa estimada en unos **4,300 estudiantes** para el primer semestre de 2026. Esa población es el segmento natural del programa. Sin embargo, no existe una alianza formal entre Altaplaza Mall y la UTP que permita verificar si quien pide el beneficio es de verdad un estudiante activo.

En las comunicaciones con el equipo de mercadeo de Altaplaza Mall y con la Dirección de Tecnologías de Información y Comunicación (DITIC) de la UTP, ambas partes autorizaron explorar el proyecto. También confirmaron el interés común en vincular el carnet estudiantil digital de la UTP con el programa ACTITUD, aprovechando el código QR que el carnet institucional ya incluye.

## 1.2 Situación actual de la gestión de beneficios

### 1.2.1 Mecanismo de validación vigente

Hoy el acceso a los beneficios se gestiona con una **tarjeta física ACTITUD** que se entrega al estudiante universitario. El flujo en el punto de venta es este:

1. El estudiante presenta la tarjeta física y, según las condiciones del arte, su carnet universitario.
2. El personal del comercio revisa visualmente la tarjeta y el carnet.
3. Si los acepta, aplica el porcentaje que le corresponde a su comercio.
4. **[COMPLETAR con la entrevista a mercadeo]:**
   - si el comercio deja algún registro del descuento aplicado;
   - cómo se reporta al mall;
   - quién emite y renueva las tarjetas;
   - cuántas tarjetas hay emitidas.

### 1.2.2 Información que el programa no genera

Ante la pregunta del investigador, el mall respondió que **no maneja información sobre el comportamiento de consumo del segmento universitario** (Anexo C). Esta respuesta es en sí misma un hallazgo. El mecanismo actual no produce datos para saber:

- cuántos estudiantes usan el programa;
- en qué comercios lo usan, en qué horarios y con qué frecuencia;
- cuánto descuento se entrega.

Sin esos datos, el mall no puede evaluar el retorno del programa ni negociar con los comercios a partir de evidencia.

### 1.2.3 Análisis de brechas

| Necesidad del programa | Cómo se cubre hoy | Brecha | Consecuencia |
|---|---|---|---|
| Confirmar que quien presenta el beneficio es su titular | El nombre se escribe a mano en la tarjeta | No hay verificación de identidad | La tarjeta se puede ceder o usar por terceros |
| Confirmar que el portador sigue siendo estudiante | No hay consulta a ningún registro académico | No se valida el estatus académico | Quien se retiró, fue suspendido o se graduó sigue usando el beneficio |
| Invalidar una tarjeta perdida o transferida | No existe un mecanismo | El documento físico es vulnerable | El beneficio queda abierto de forma indefinida |
| Aplicar las condiciones del arte (días, vigencia, no transferible) | Depende del criterio del cajero | No hay control automático | Aplicación inconsistente entre comercios |
| Medir el uso del programa | No se registra | No hay trazabilidad | No hay datos de consumo (lo confirmó el propio mall) |
| Costo de operación | Producción y gestión de tarjetas | Costo recurrente | Gasto que no aporta control |

## 1.3 Justificación del proyecto

Estas brechas tienen una raíz común: **el beneficio no está vinculado al estatus académico real del estudiante**. Una tarjeta física dice quién *fue* estudiante cuando se la entregaron, no quién *lo es hoy*.

La UTP ya emite un **carnet estudiantil digital con código QR**, que es un documento de identidad oficial controlado por la universidad. Usar ese QR como llave de validación permite resolver las brechas de la sección anterior:

1. **Identidad:** el QR pertenece al carnet institucional del estudiante. La consulta devuelve su nombre para que el cajero lo compare con la persona que tiene delante.
2. **Estatus académico en tiempo real:** cada validación consulta a la UTP si el estudiante está matriculado en el periodo vigente. Un estudiante inactivo es rechazado de inmediato.
3. **Invalidación inmediata:** cuando el estudiante pierde la condición de activo, el beneficio deja de aplicar automáticamente, sin recoger ninguna tarjeta.
4. **Reglas del programa aplicadas por el sistema:** el descuento que corresponde a cada comercio, los días en que aplica y su vigencia se configuran una vez y se aplican igual en todos los puntos de venta.
5. **Trazabilidad con privacidad:** cada descuento aplicado queda registrado con datos agregables (comercio, hora, facultad) y un identificador anónimo del estudiante. Esto genera las métricas que hoy no existen, sin guardar la cédula.
6. **Menos costos:** desaparece la producción y la gestión de tarjetas físicas.

Para la UTP, el proyecto ofrece una alianza tecnológica verificable que da valor añadido a su carnet digital. Para Altaplaza Mall, ofrece control sobre su programa y datos para gestionarlo. Para los comercios, ofrece la confianza de que el descuento llega a quien corresponde. Y para los estudiantes, ofrece un proceso más rápido con un documento que ya llevan en el celular.

## 1.4 Alcance del proyecto

Se desarrolla un **prototipo funcional** con tres componentes, según los objetivos específicos 3, 4 y 5:

| Componente | Qué hace | Objetivo del anteproyecto |
|---|---|---|
| Aplicación de validación (web, usable desde el celular del cajero) | Escanea el QR del carnet (o recibe la cédula o una foto del QR), consulta el estatus en tiempo real y confirma el descuento que corresponde al comercio | Objetivo 4 |
| Panel administrativo | Para los comercios: gestionar sus ofertas, configurar sus descuentos (valor, días, vigencia, oferta principal) y ver sus métricas. Para la administración del mall: reportes del programa, reporte de validación y gestión de comercios y usuarios | Objetivo 5 |
| API REST | Lógica de validación integrada con la API de Estado de Estudiante de la UTP mediante OAuth2. En el prototipo la UTP se simula con datos ficticios | Objetivos 3 y 4 |

Herramientas, según el anteproyecto:

- Python (FastAPI, qrcode y OpenCV) para el backend.
- MySQL para la base de datos.
- Postman para probar y documentar la API.
- GitHub para el control de versiones.

La interfaz se construyó con React. El detalle técnico está en el documento de arquitectura (`docs/tesis/03-arquitectura-y-lineamientos.md`).

## 1.5 Limitaciones y delimitaciones del estudio

**Delimitaciones (decisiones de alcance):**

- **Población:** estudiantes activos del Campus Central de la UTP, con carnet vigente y matrícula en el semestre en curso. La población secundaria son los 31 comercios afiliados al programa ACTITUD.
- **Espacio:** el Campus Central de la UTP y el Centro Comercial Altaplaza Mall.
- **Tiempo:** el cronograma de 6 semanas del anteproyecto, durante 2026.
- **Funcionalidad:** el prototipo valida el estatus y registra el descuento aplicado. No procesa pagos ni se integra con los puntos de venta (cajas) de los comercios.

**Limitaciones (restricciones externas):**

- **Datos simulados:** no existe todavía un acuerdo formal con la UTP para acceder a datos reales. El prototipo usa una API simulada que respeta el contrato de la API de Estado de Estudiante: mismas rutas, autenticación OAuth2 y respuestas. Pasar a la API real de la DITIC requiere cambiar la URL y las credenciales, además de la aprobación institucional.
- **Datos de consumo:** el mall no maneja información de consumo del segmento universitario, así que no hay línea base cuantitativa del uso actual del programa.
- **Evaluación:** las pruebas con usuarios son de un prototipo en un entorno controlado. No equivalen a un despliegue en producción.
- **Marco legal:** el tratamiento de datos personales de estudiantes debe ajustarse a la Ley 81 de 2019 sobre protección de datos personales en Panamá y a su reglamentación. En un despliegue real eso exige formalizar acuerdos entre la UTP y el mall (ver Capítulo II y el documento de lineamientos).

---

*Anexos citados:*

- *C: correo de Altaplaza Mall del 8 de mayo de 2026.*
- *D: arte oficial de beneficios ACTITUD.*

*En el anteproyecto ambos aparecen en las páginas 17 y 18.*
