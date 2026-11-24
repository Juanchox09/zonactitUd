# Instrumentos de investigación

> **Objetivo específico 2 del anteproyecto:** *Determinar el perfil y volumen de la población estudiantil del Campus Central de la UTP con potencial de beneficiarse del sistema propuesto, mediante encuestas aplicadas a estudiantes y entrevistas con representantes del área de marketing de Altaplaza Mall.*
>
> **Cronograma:** actividad 2, "Aplicación de encuesta a estudiantes del Campus Central UTP y análisis de resultados", en las semanas 1 y 2.
>
> **Contenido de este documento:**
> - Instrumento A: encuesta a estudiantes.
> - Instrumento B: guía de entrevista a mercadeo de Altaplaza Mall.
> - Instrumento C: cuestionario de satisfacción para las pruebas del prototipo (objetivo 6).

---

## Instrumento A: Encuesta a estudiantes del Campus Central UTP

### A.1 Ficha técnica

| Elemento | Definición |
|---|---|
| Población | Estudiantes activos del Campus Central de la UTP: N ≈ 4,300, primer semestre de 2026, según la Secretaría General |
| Tipo de muestreo | No probabilístico por conveniencia, con cuotas por facultad para que ninguna quede sin representación |
| Tamaño de muestra | **n = 353** para un 95 % de confianza y un 5 % de error, con p = 0.5 y corrección por población finita. Mínimo aceptable: **n = 204**, con 95 % de confianza y 6.5 % de error |
| Modalidad | Formulario en línea (Google Forms o Microsoft Forms con la cuenta @utp.ac.pa), difundido por QR en el campus y en grupos de estudiantes |
| Duración estimada | 5 a 7 minutos |
| Anonimato | No se piden nombre, cédula ni correo. Solo datos agregables |
| Filtro | Solo continúan quienes declaran estar matriculados este semestre en el Campus Central |

**Cálculo de la muestra**

Fórmula para población finita: n = N·Z²·p·q / (e²·(N−1) + Z²·p·q)

Con N = 4,300, Z = 1.96, p = q = 0.5 y e = 0.05:

n = 4,300 × 3.8416 × 0.25 / (0.0025 × 4,299 + 0.9604) = 4,129.72 / 11.7079 ≈ **353**

### A.2 Texto de presentación (consentimiento)

> Hola. Esta encuesta es parte del trabajo de graduación "Sistema de validación digital mediante código QR del carnet estudiantil de la UTP para la gestión de descuentos en Altaplaza Mall" (Lic. en Desarrollo de Software, FISC). Es anónima: no pedimos tu nombre, cédula ni correo, y las respuestas se analizan solo de forma agrupada. Toma unos 5 minutos y es voluntaria; puedes dejarla en cualquier momento. Al continuar aceptas participar.
>
> ☐ Acepto participar

### A.3 Preguntas

**Sección 1: Filtro y perfil**

1. ¿Estás matriculado(a) este semestre en el Campus Central (Víctor Levi Sasso) de la UTP?
   ○ Sí ○ No → *fin de la encuesta*
2. ¿En qué facultad estudias?
   ○ Ingeniería Civil ○ Ingeniería Eléctrica ○ Ingeniería Industrial ○ Ingeniería Mecánica ○ Ingeniería de Sistemas Computacionales ○ Ciencias y Tecnología
3. ¿En qué año de la carrera estás?
   ○ 1.º ○ 2.º ○ 3.º ○ 4.º ○ 5.º o más
4. ¿Cuál es tu rango de edad?
   ○ 17–19 ○ 20–22 ○ 23–25 ○ 26–29 ○ 30 o más
5. ¿En qué jornada asistes principalmente?
   ○ Mañana ○ Tarde ○ Noche ○ Mixta

**Sección 2: Relación con Altaplaza Mall (volumen potencial)**

6. ¿Con qué frecuencia visitas Altaplaza Mall?
   ○ Nunca ○ Menos de una vez al mes ○ 1 a 3 veces al mes ○ 1 vez por semana ○ Más de una vez por semana
7. ¿En qué días sueles ir? *(selección múltiple)*
   ☐ Lunes a jueves ☐ Viernes ☐ Sábado ☐ Domingo
8. ¿En qué horario sueles ir?
   ○ Antes de las 12:00 ○ 12:00–15:00 ○ 15:00–18:00 ○ Después de las 18:00
9. ¿Para qué vas principalmente? *(selección múltiple)*
   ☐ Comer ☐ Comprar ropa o calzado ☐ Entretenimiento ☐ Estudiar o reunirme ☐ Servicios (banco, óptica, etc.) ☐ Otro: ____
10. En una visita típica, ¿cuánto gastas aproximadamente?
    ○ Menos de B/. 5 ○ B/. 5–15 ○ B/. 15–30 ○ B/. 30–60 ○ Más de B/. 60

**Sección 3: Conocimiento y uso del programa ACTITUD (brechas)**

11. ¿Conoces el programa ACTITUD de Altaplaza Mall?
    ○ Sí, y lo he usado ○ Sí, pero nunca lo he usado ○ No lo conocía → *pasa a la pregunta 15*
12. ¿Tienes la tarjeta física ACTITUD?
    ○ Sí ○ La tuve pero la perdí o se dañó ○ No
13. ¿Alguna vez un comercio te pidió verificar que eres estudiante activo (además de la tarjeta)?
    ○ Siempre ○ A veces ○ Nunca
14. ¿Conoces a alguien que use el beneficio sin ser estudiante activo (egresado, retirado o con una tarjeta prestada)?
    ○ Sí ○ No ○ Prefiero no responder
15. ¿Qué te impide o te impediría usar el programa? *(selección múltiple)*
    ☐ No sabía que existía ☐ Trámite para obtener la tarjeta ☐ Olvido la tarjeta ☐ Los comercios no me interesan ☐ Los descuentos son bajos ☐ El personal no lo conoce o no lo aplica ☐ Otro: ____

**Sección 4: Carnet digital y propuesta (aceptación)**

16. ¿Tienes activo el carnet digital de la UTP con código QR en tu celular?
    ○ Sí ○ No, pero sé cómo obtenerlo ○ No sabía que existía
17. ¿Qué tan dispuesto(a) estarías a mostrar el QR de tu carnet digital para recibir el descuento, en lugar de una tarjeta física?
    *(1 = nada dispuesto, 5 = totalmente dispuesto)* ① ② ③ ④ ⑤
18. Indica qué tan de acuerdo estás *(1 = totalmente en desacuerdo, 5 = totalmente de acuerdo)*:

    | Afirmación | 1 | 2 | 3 | 4 | 5 |
    |---|---|---|---|---|---|
    | a. Validar con el QR del carnet sería más rápido que con una tarjeta física | ○ | ○ | ○ | ○ | ○ |
    | b. Es justo que el descuento sea solo para estudiantes activos | ○ | ○ | ○ | ○ | ○ |
    | c. Me sentiría cómodo(a) si el sistema solo confirma que estoy activo, sin guardar mi cédula | ○ | ○ | ○ | ○ | ○ |
    | d. Usaría más el programa si no tuviera que cargar otra tarjeta | ○ | ○ | ○ | ○ | ○ |

19. ¿Qué te preocuparía de validar con el QR? *(selección múltiple)*
    ☐ Privacidad de mis datos ☐ Que no haya señal o internet ☐ Batería del celular ☐ Que el cajero no sepa usarlo ☐ Nada ☐ Otro: ____
20. ¿Qué tipo de beneficio te motivaría más? *(ordena del 1 al 4)*
    ___ Porcentaje de descuento en comida ___ 2x1 ___ Descuentos en ropa y tecnología ___ Entretenimiento
21. Comentario o sugerencia (opcional): ____________________

### A.4 Relación de cada pregunta con el objetivo

| Lo que se busca | Preguntas | Indicador para el Capítulo I y el Capítulo III |
|---|---|---|
| Perfil | 2–5 | Distribución por facultad, año, edad y jornada |
| Volumen potencial | 6–10 | % que visita el mall al menos una vez al mes × N ≈ estudiantes potenciales; gasto típico |
| Brechas del proceso actual | 11–15 | % que conoce el programa o lo usa; % sin tarjeta; frecuencia de verificación; percepción de uso indebido |
| Aceptación de la solución | 16–19 | % con carnet digital activo; disposición media (P17); acuerdo con las afirmaciones (P18) |
| Diseño de la oferta | 20 | Preferencia de tipo de beneficio (insumo para los comercios) |

### A.5 Plan de análisis

1. **Depuración:** se eliminan las respuestas que no pasan el filtro (P1 = No) y los duplicados evidentes.
2. **Estadística descriptiva:** frecuencias y porcentajes por pregunta; media y desviación estándar en las escalas 1–5.
3. **Estimación del volumen potencial:** proporción que visita el mall al menos una vez al mes (P6) × 4,300, con su intervalo de confianza del 95 %.
4. **Cruces:** facultad × frecuencia de visita; uso de ACTITUD × tenencia de tarjeta; carnet digital × disposición.
5. **Presentación:** tablas y gráficos de barras en el Capítulo I (brechas) y en el Capítulo III (requisitos), con la exportación del formulario como anexo.

---

## Instrumento B: Guía de entrevista semiestructurada a mercadeo de Altaplaza Mall

### B.1 Ficha técnica

| Elemento | Definición |
|---|---|
| Participantes | Coordinación de Proyectos y equipo de Mercadeo y Comunicaciones de Altaplaza Mall (contactos del Anexo C) |
| Modalidad | Presencial o videollamada, de 30 a 45 minutos. Se graba solo con autorización expresa |
| Registro | Notas y, si se autoriza, grabación. Se transcribe y se envía al entrevistado para que la valide |
| Consentimiento | Se explica el objetivo académico; la información se usa solo para el trabajo de graduación |

### B.2 Preguntas

**Bloque 1: El programa hoy**

1. ¿Cuándo y con qué propósito nació ACTITUD? ¿Qué área lo administra?
2. ¿Cómo obtiene un estudiante la tarjeta ACTITUD? ¿Qué requisitos se le piden? ¿Quién la emite y cuánto cuesta producirla?
3. ¿Cuántas tarjetas se han emitido, aproximadamente? ¿Tienen vencimiento?
4. ¿Qué universidades participan? ¿Qué proporción de estudiantes estiman que es de la UTP?

**Bloque 2: Validación en el punto de venta (brechas)**

5. ¿Qué instrucciones reciben los comercios para aplicar el descuento? ¿Se les capacita?
6. ¿Se exige el carnet universitario además de la tarjeta? ¿Cómo verifica el cajero que el estudiante sigue activo?
7. ¿Han detectado o recibido reportes de uso indebido, como tarjetas prestadas, egresados o tarjetas duplicadas? ¿Con qué frecuencia?
8. ¿Qué pasa cuando un estudiante pierde la tarjeta?
9. ¿Los comercios registran de alguna forma los descuentos aplicados? ¿Se los reportan al mall?

**Bloque 3: Información y gestión**

10. En el correo indicaron que no manejan información de consumo del segmento universitario. ¿Qué datos les gustaría tener: cantidad de estudiantes, horarios, comercios más usados, monto de descuento entregado?
11. ¿Cómo se decide qué comercios participan y qué descuento ofrecen? ¿Con qué frecuencia cambian las ofertas?
12. ¿Cómo comunican hoy las ofertas vigentes, sus días y sus restricciones a comercios y estudiantes?

**Bloque 4: Propuesta**

13. *(Se muestra el prototipo: validación con QR y panel.)* ¿Qué le parece validar con el QR del carnet digital de la UTP en lugar de la tarjeta física?
14. ¿Qué funciones del panel serían más útiles para el mall? ¿Y para los comercios?
15. ¿Qué preocupaciones tendrían: costo, capacitación, privacidad de datos, conectividad en las tiendas?
16. ¿Estarían dispuestos a participar en una prueba piloto con algunos comercios?

### B.3 Análisis

Se hace un análisis de contenido por categorías: proceso actual, brechas detectadas, necesidades de información, aceptación y riesgos. Las citas textuales relevantes se incorporan al Capítulo I, en las secciones 1.2.1 y 1.2.3.

---

## Instrumento C: Cuestionario de satisfacción para las pruebas del prototipo

> **Objetivo específico 6:** *"…midiendo tiempos de respuesta, tasa de validaciones exitosas y nivel de satisfacción…"*.
>
> Los tiempos y la tasa de éxito los mide el propio sistema (pestaña **Panel → Validación**). La satisfacción se mide con este cuestionario al final de cada sesión de prueba.

Se usa la **System Usability Scale (SUS)**, Brooke (1996): 10 ítems con escala de 1 a 5 (1 = totalmente en desacuerdo, 5 = totalmente de acuerdo). Es un instrumento estándar, corto y comparable entre estudios.

| # | Afirmación |
|---|---|
| 1 | Creo que me gustaría usar este sistema con frecuencia. |
| 2 | Encontré el sistema innecesariamente complejo. |
| 3 | Pensé que el sistema era fácil de usar. |
| 4 | Creo que necesitaría el apoyo de una persona técnica para poder usar este sistema. |
| 5 | Encontré que las funciones del sistema estaban bien integradas. |
| 6 | Pensé que había demasiada inconsistencia en el sistema. |
| 7 | Imagino que la mayoría de las personas aprendería a usar este sistema muy rápido. |
| 8 | Encontré el sistema muy incómodo de usar. |
| 9 | Me sentí muy seguro(a) usando el sistema. |
| 10 | Necesité aprender muchas cosas antes de poder empezar a usar el sistema. |

**Cálculo**

- En los ítems impares se resta 1 a la respuesta.
- En los ítems pares, el aporte es 5 menos la respuesta.
- Se suman los 10 aportes y se multiplica por 2.5, lo que da un puntaje de 0 a 100.
- Interpretación habitual: ≥ 68 está por encima del promedio; ≥ 80.3 es excelente.

**Preguntas adicionales por rol**

- **Cajero o personal del comercio** (1–5):
  - "El resultado (activo o inactivo y el descuento) fue claro".
  - "Validar fue más rápido que revisar una tarjeta física".
- **Estudiante** (1–5):
  - "Me sentí cómodo(a) mostrando el QR de mi carnet".
  - "El proceso fue rápido".
- **Administrador o comercio en el panel** (1–5):
  - "Pude publicar y configurar una oferta sin ayuda".
  - "Las métricas me sirven para tomar decisiones".
- **Pregunta abierta para todos:** "¿Qué cambiarías?"

El protocolo completo de las pruebas está en `docs/tesis/04-plan-de-pruebas-de-campo.md`.
