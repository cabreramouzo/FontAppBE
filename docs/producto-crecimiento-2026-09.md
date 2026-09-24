# FontApp: producto, retención y crecimiento

Fecha: 23 de septiembre de 2026. Horizonte: 12 semanas. Recursos: una persona, 4–6 horas semanales y hasta 150 €/mes. Documento de trabajo interno: contiene métricas agregadas del proyecto, no material para publicar como campaña.

## 1. Decisión recomendada

Concentrar los próximos tres meses en demostrar que FontApp es útil en varias salidas consecutivas dentro de una zona pequeña. El producto ya dispone de mapa, GPX, uso sin cobertura, favoritos, avisos, comprobación rápida, misiones, insignias, páginas por localidad e informes municipales. La oportunidad principal es conectar esas capacidades con una necesidad recurrente y mantener información reciente allí donde se consigue atraer usuarios.

Propuesta de valor: **«Antes de salir, consulta dónde hay fuentes y qué se sabe de su estado. Al pasar, actualízalo en segundos».**

La disponibilidad de agua, la antigüedad del aviso y la potabilidad deben permanecer diferenciadas. No prometer agua garantizada ni convertir un aviso de caudal en una afirmación sanitaria.

Priorizar senderistas, corredores de montaña y ciclistas que repiten salidas en la misma comarca, con personas locales que conocen sus fuentes. La persona que encuentra una fuente durante un viaje y no vuelve también puede haber tenido una experiencia satisfactoria: no todo uso debe convertirse en un hábito semanal.

## 2. Evidencia y límites

Revisión de código y documentación del backend y frontend, inspección de la interfaz local en formato móvil, y lectura offline del dump `fontapp-20260920-090005.dump`. El dump se extrajo como flujo de datos con pg_restore, sin restaurarlo ni consultar Neon. Se analizaron agregados; no se incluyen identidades, correos, credenciales ni ubicaciones personales.

Las cifras describen el backup del 20 de septiembre, no una consulta actual de producción. Algunas mejoras recientes de UI son posteriores. No se han realizado entrevistas, una prueba en iPhone físico, ni una auditoría de Search Console o entregabilidad del correo.

| Señal | Resultado | Interpretación admisible |
|---|---:|---|
| Fuentes visibles | 168.832 | Gran cobertura de inventario; no implica información reciente |
| Fuentes con algún estado conocido en una reseña, alguna vez | 198, aproximadamente 0,12 % | La actualización comunitaria está concentrada; no son 198 fuentes que tengan agua ahora |
| Fuentes con ese tipo de aviso o confirmación desde el 21 de agosto | 144 | Aproximación a actividad reciente; no reproduce toda la lógica de confianza |
| Cuentas sin rol administrativo | 59 | Base pequeña y joven |
| Cuentas sin rol administrativo que han aportado alguna vez | 30 | Hay voluntad de contribuir |
| De ellas, con aportaciones en al menos dos fechas | 8 | Repetición observable, no una tasa de retención por cohortes |
| Cuentas sin rol administrativo con favoritos | 7 | La utilidad de guardar aún tiene poco alcance |
| Cuentas sin rol administrativo con suscripción push | 1 | No basar el crecimiento inmediato en push |
| Reseñas de cuentas sin rol administrativo | 219, de 26 autores | Un autor concentra 72; dependencia de pocas personas |

«Aportar» incluye creación, reseña, confirmación, edición, reporte o foto. No sumamos esas filas como acciones independientes para evaluar productividad: una interacción puede generar varias filas. Los roles tampoco permiten identificar todo posible uso de prueba del equipo.

Entre el 7 y el 19 de septiembre, días completos posteriores a una anomalía de tráfico del día 6:

- 227 de 378 sesiones con plataforma identificada corresponden a iOS, aproximadamente el 60 %. Esto orienta las pruebas móviles, no mide personas únicas.
- 56 sesiones intentaron geolocalizarse desde la primera bienvenida; 20 registraron denegación y 36 éxito. Puede haber permisos previos del sistema o navegador: no equivale a 20 personas que decidieron rechazar FontApp.
- El botón GPX aparece en 10 sesiones, offline en 8 y misiones en 6. Señal para investigar descubrimiento; no prueba desinterés ni compara prestaciones con exposiciones equivalentes.
- Las sesiones se identifican por pestaña; no deben llamarse usuarios ni usarse para calcular retención individual. No se han excluido completamente pruebas internas o tráfico automatizado.

La atribución de campañas muestra cuentas aportadoras procedentes de WhatsApp, LinkedIn y Twitter, entre otros. No permite ordenar canales por conversión: las visitas registradas comienzan el 2 de septiembre y las altas el 6 de agosto; por ejemplo, LinkedIn tiene más altas atribuidas que visitas registradas. No calcular porcentajes mezclando esas ventanas.

## 3. Qué puede impedir que una persona vuelva

### A. Encontrar un punto no equivale a resolver la salida

La cobertura importada ayuda a descubrir fuentes, pero con pocos avisos recientes el usuario sigue sin saber cuánto puede fiarse del dato. El efecto de comunidad es local: diez personas en la misma zona se ayudan entre sí mucho más que diez repartidas por todo el país.

Castellcir, Castellterçol y Moià suman 93 fuentes visibles, 29 con algún estado conocido y 23 con un aviso o confirmación desde el 21 de agosto. Es una hipótesis razonable para un piloto, especialmente si existen contactos personales allí. Seleccionar 30–40 fuentes de dos o tres recorridos habituales; no asumir el mantenimiento de toda la comarca.

**Cambio sustancial:** presentar y mantener conjuntos útiles para salidas reales, con estado, fecha e incertidumbre visibles. La métrica de cobertura relevante será la del conjunto piloto, no el porcentaje de todo el inventario mundial.

### B. La primera visita pide atención antes de entregar utilidad

Los diálogos de introducción, primera fuente, bienvenida tras el registro e instalación están coordinados para no solaparse, pero aún pueden interrumpir sucesivamente. Login, registro y enlaces a fuentes no figuran entre las rutas silenciosas. Entrar desde una fuente compartida y tener que atravesar una presentación rompe la intención original.

**Propuesta:** entrada directa al contenido compartido; ayuda contextual después de una acción útil. En el mapa, ofrecer buscar una localidad junto a usar la ubicación. La búsqueda manual ya existe: debe ser una alternativa visible en ese momento, no otra función nueva. Pedir instalar tras guardar una fuente o utilizar una ruta, en lugar de hacerlo solo por haber abierto varias sesiones.

Validar con cinco personas: abrir un enlace, encontrar el estado y su fecha, buscar una localidad sin GPS y guardar una fuente. Objetivo orientativo: cuatro de cinco completan la primera tarea en menos de un minuto sin ayuda.

### C. Hay intenciones que no sobreviven al inicio de sesión

1. **Guardar desde la bienvenida:** `FirstFountainWelcome.tsx`, función `guarda`, solo llama a setFavorite si ya existe usuario. En caso contrario cierra la bienvenida y navega al login sin conservar allí la acción concreta de guardar esa fuente. Además, se silencian errores de guardado.
2. **Ruta como invitado:** `routeMemory.ts` separa el almacenamiento de invitado y cuenta; `RouteWaterPage` cambia de ámbito al iniciar sesión. Una ruta preparada como invitado puede dejar de aparecer al entrar en la cuenta.

**Propuesta:** conservar intención y destino específicos, completar el favorito después del login y confirmar el resultado. Para GPX, ofrecer conservar esa ruta en la cuenta actual; no mezclar automáticamente datos de distintas cuentas del dispositivo. Mantener borradores y el retorno tras la verificación cuando sea necesaria.

Son arreglos de continuidad con impacto directo: el usuario no debería pagar el coste de registrarse y perder lo que estaba haciendo.

### D. Una ausencia de información puede presentarse como sequedad

`firstFountain.ts` devuelve `dry` cuando hay alguna fuente próxima, pero ninguna cumple los criterios de agua ni de fuente sin comprobar. Eso también puede ocurrir con avisos antiguos de agua o estados inciertos. La bienvenida utiliza entonces una frase que afirma que las fuentes constan secas.

**Propuesta prioritaria:** separar «sin información reciente suficiente» de «último aviso: seca». Reservar la afirmación de sequedad para evidencia correspondiente. Probar el caso de fuente con aviso antiguo de agua, además de seca, averiada y desconocida. Es una cuestión de confianza del producto, no solo de redacción.

### E. El retorno está pensado principalmente para quien ya aporta

`WeeklyDigest.swift` construye las fuentes relevantes a partir de las creadas y comentadas. Si ese conjunto está vacío devuelve el resumen sin contenido; los favoritos no entran en esa selección. Una persona puede guardar fuentes para sus salidas y quedar fuera de esa utilidad recurrente. Tener la preferencia activada tampoco prueba que el correo se haya ejecutado, entregado o leído.

**Propuesta:** ampliar el resumen existente con cambios relevantes en favoritos y, después, una zona seguida explícitamente. Enviar únicamente cuando haya novedades útiles. Ejemplos: nueva comprobación de una fuente guardada, cambio de estado o una fuente de interés incorporada a la zona. Verificar primero programación, entrega y baja del correo existente.

Las notificaciones de favoritos ya cubren ciertas incidencias; estudiar más adelante avisar de recuperación de agua cuando cambia realmente el estado. No enviar un aviso por cada reseña equivalente.

### F. Las capacidades prácticas son poco evidentes para un recién llegado

La vista móvil expone varias herramientas como iconos; «Añadir fuente» es más explícito que algunas acciones de consulta. GPX, offline y planificación son activos importantes que exigen descubrir cómo entrar.

**Propuesta:** probar una entrada comprensible como «Agua en mi ruta» y explicar el resultado antes del término GPX. Reorganizar un acceso existente; no sumar más botones flotantes. Mantener visible la consulta sin cuenta. Tras una primera utilización, facilitar volver a la última ruta o a los favoritos desde las superficies actuales.

No construir un navegador completo: FontApp ya puede complementar la aplicación donde el usuario prepara sus recorridos. La búsqueda de puntos de interés es una capacidad habitual de herramientas como [OsmAnd](https://osmand.net/docs/user/search/search-poi/); la diferenciación propuesta es la información comunitaria reciente sobre fuentes concretas.

## 4. Prioridades de producto

| Orden | Entrega | Resultado esperado | Comprobación |
|---|---|---|---|
| P0 | Corregir «sin información» frente a «seca» | Evitar conclusiones falsas | Casos de estados y antigüedades |
| P0 | Recuperar favorito y ruta tras autenticar | Cumplir la intención que motivó el registro | Recorrido completo invitado → cuenta → resultado |
| P1 | Entrada sin interrupciones a fuente compartida y alternativa manual al GPS | Mostrar utilidad antes de pedir permisos | Cinco sesiones observadas |
| P1 | Incluir favoritos en el resumen existente | Dar motivo de retorno al lector | Selección correcta, entrega y enlace al contenido |
| P1 | Hacer comprensible «Agua en mi ruta» | Descubrir una utilidad repetible | Prueba observada con un GPX real |
| P2 | Zona seguida y acceso a última salida | Reducir preparación en visitas sucesivas | Necesidad confirmada en el piloto |
| P2 | Reconocimiento de mantenimiento y cambios relevantes | Repartir las comprobaciones | Más autores recurrentes y menos dependencia de uno |

Los P2 son hipótesis, no compromisos para las doce semanas. Si los arreglos P0 consumen la capacidad disponible, aplazar mejoras amplias y mantener el piloto pequeño.

La gamificación ya existe. Dar visibilidad a mantener información útil y a una meta colectiva local, usando misiones y reconocimientos existentes, antes de añadir más puntos o clasificaciones. No inventar cifras de personas ayudadas si no se pueden medir. Evitar recompensar volumen de reseñas que incentive duplicados.

## 5. Cómo debería funcionar el retorno

**Antes de salir:** consultar una zona o GPX, entender la fecha de los avisos, guardar fuentes y preparar el uso sin cobertura cuando proceda.

**Durante la salida:** abrir la fuente, confirmar un estado o actualizarlo con pocos pasos; la foto es opcional. Aprovechar los flujos rápidos y la cola offline existentes.

**Después:** mostrar que la aportación actualizó información concreta. Ofrecer seguir esa fuente si tiene sentido. No obligar a compartir ni a competir.

**En la próxima salida:** acceso fácil a ruta/favoritos y un resumen si algo relevante cambió. Medir repetición por salidas y por mes; abrir a diario no es el objetivo.

El consumidor que no aporta también merece una experiencia completa. La actualización es una oportunidad contextual, no un peaje para consultar.

## 6. Captación: una zona y pocos canales

### Canal principal: dos grupos locales

Seleccionar unas doce entidades o grupos relevantes, conversar con cinco y conseguir dos pruebas de salida. Son objetivos de actividad, no una predicción de resultados. La [FEEC dispone de un directorio de entidades](https://www.feec.cat/qui-som/entitats/) para identificar grupos; personalizar contactos y utilizar sus vías públicas. Proponer probar una salida concreta, no una difusión masiva genérica.

Oferta: preparar las fuentes de un recorrido del grupo, mostrar el estado y las dudas, y pedir que quienes pasen actualicen unas pocas. Después devolver al grupo un resultado útil: qué se ha comprobado y qué sigue pendiente. Cada club necesita una persona de contacto voluntaria; el fundador no debe acabar comprobándolo todo.

WhatsApp puede ser el medio de distribución dentro del grupo si su responsable lo acepta. Enlace directo a localidad o fuente, una sola llamada a la acción y un código de campaña por colaboración. No añadir personas a listas ni enviar recordatorios individuales sin acuerdo.

### Canal físico: QR contextual con permiso

Probar pocos puntos: un establecimiento colaborador, oficina de turismo o tablón del club. Un QR debe responder una pregunta del lugar y llevar a ese contenido, no a una portada genérica. No pegar material en fuentes o mobiliario sin autorización.

La red de [Refill](https://www.refill.org.uk/refill-stations) ilustra cómo los colaboradores físicos y su señalización pueden servir de distribución. En FontApp es una hipótesis que hay que medir por uso y aportaciones, no por cantidad de adhesivos.

### SEO local: dos o tres páginas realmente útiles

Ya existen páginas de localidad, metadatos sociales, canonical y sitemap. Mejorar inicialmente dos o tres páginas con contexto del lugar, fuentes destacadas, fotos propias, fecha de comprobación y enlaces a recorridos cuando proceda. No generar miles de textos genéricos.

La función de Cloudflare revisada modifica metadatos, pero no prerenderiza el contenido principal. Esto no demuestra que Google no indexe las páginas: [Google documenta que renderiza JavaScript](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics). Comprobar HTML renderizado, indexación, consultas y clics en Search Console antes de acometer una migración de renderizado.

[Castellterçol publica recorridos turísticos](https://www.castelltersol.cat/turisme/rutes): sirve para explorar una colaboración local y conectar contenido útil, no implica un acuerdo existente ni autoriza copiar material.

### Colaboradores y comunicación

Enric/Encos es un candidato natural que ya has planteado. Proponer colaboración concreta: contrastar unas fuentes de una zona, reconocer la procedencia y facilitar actualizaciones. Acordar cualquier reutilización de contenido; importar más puntos por sí solo no resuelve la recurrencia.

Usar los informes y páginas municipales existentes para una conversación con una oficina local. No construir otro panel antes de que exista una necesidad real. El objetivo inmediato es colaboración y distribución; cualquier oferta institucional posterior debe basarse en necesidades validadas.

Una pieza útil por semana, reutilizada en el canal donde estén los participantes: una fuente comprobada, un cambio de estado o una salida documentada. LinkedIn puede servir para contar un caso de colaboración, pero los datos actuales no justifican tratarlo como canal ganador de retención. Prensa local después de tener un caso concreto con participantes y resultados contrastables.

## 7. Plan de doce semanas

Las 4–6 horas semanales incluyen producto y marketing. A una media de cinco horas, el total es unas 60 horas; las estimaciones se revisan al cerrar el alcance técnico.

| Periodo | Trabajo principal | Entregable y criterio |
|---|---|---|
| Semanas 1–2 | Correcciones P0 más pequeñas, cinco pruebas de uso, escoger piloto | Intenciones conservadas; incertidumbre correcta; lista de 30–40 fuentes |
| Semanas 3–4 | Completar P0, contactar grupos y preparar primera salida | Cinco conversaciones intentadas/completadas según respuesta; al menos un grupo dispuesto a probar |
| Semanas 5–6 | Primera salida, observar uso, resolver el bloqueo más frecuente | Comprobaciones de participantes; explicación documentada de abandonos |
| Semanas 7–8 | Segunda salida y mejora de retorno elegida | Comprobar quién vuelve; favorito/resumen o acceso a ruta según necesidad observada |
| Semanas 9–10 | Incorporar segundo grupo, mejorar páginas locales y probar QR | Captación atribuible al contenido concreto, sin expandir aún la geografía |
| Semanas 11–12 | Comparar cohortes maduras, entrevistar repetidores y no repetidores | Decidir mantener, ampliar a una zona vecina o corregir la propuesta |

Distribución orientativa de las 60 horas: 16 producto y validación, 16 conversaciones y seguimiento, 12 piloto y coordinación, 8 contenido reutilizable, 4 SEO local y 4 medición. Si una salida consume más tiempo, sustituye otras tareas de esa semana; no se añade por encima del presupuesto. Elegir una sola mejora P1 relevante para el piloto si no cabe más.

| Presupuesto máximo | Mes 1 | Mes 2 | Mes 3 |
|---|---:|---:|---:|
| Impresión y material local | 30 € | 30 € | 20 € |
| Desplazamientos/demostraciones | 40 € | 40 € | 40 € |
| Prueba publicitaria condicionada | 0 € | 0 € | 40 € |
| Reserva sin obligación de gastar | 80 € | 80 € | 50 € |
| Total techo | 150 € | 150 € | 150 € |

No hacen falta nuevas herramientas de marketing de pago. La publicidad del tercer mes solo se prueba si hay personas externas que repiten y se conoce la experiencia a la que llevarlas. Si no, ese dinero queda sin gastar. No pagar por reseña ni perseguir instalaciones como fin.

## 8. Cuadro de mando y reglas de decisión

Actualizar semanalmente una tabla sencilla; reutilizar datos propios y backups para evitar consultas pesadas repetidas a producción.

| Indicador | Definición | Meta orientativa del piloto |
|---|---|---|
| Cobertura reciente | Fuentes seleccionadas con estado conocido registrado o confirmado en los últimos 30 días / selección fija | 70 % de 30–40 fuentes al final; informar también tipo y fecha de evidencia |
| Primeros colaboradores | Nuevas personas externas con una aportación válida | 15 durante el piloto |
| Segunda aportación | Personas que aportan otra fecha dentro de 28 días de su primera aportación | 5 entre las primeras 15, una vez todas tengan ventana completa |
| Reutilización para consultar | Participantes que confirman haber usado FontApp en otra salida; complementar con eventos consentidos disponibles | Evidencia de al menos 5 casos y su motivo |
| Activación de consulta | Consulta de detalle seguida de guardar, utilizar indicaciones o completar preparación GPX | Establecer línea base antes de fijar porcentaje |
| Diversidad | Autores recurrentes y concentración de comprobaciones | Que el mantenimiento no recaiga únicamente en fundador y un colaborador |

Son criterios de aprendizaje y continuidad, no previsiones ni significación estadística. Si solo entran cinco colaboradores, analizar esos cinco y no publicar porcentajes grandilocuentes.

Para contribuciones, usar timestamps del servidor y excluir roles administrativos; revisar manualmente qué cuentas pertenecen al equipo. Para consultas anónimas, los eventos actuales no prueban retorno de una persona. No introducir huellas digitales ni identificadores persistentes solo para rellenar el cuadro de mando. Si se amplía instrumentación, respetar el modelo de privacidad y la lista de eventos permitidos existentes.

No sumar clics del carrusel, visitas e instalaciones como éxito. Tampoco utilizar `last_seen` como retención D7/D28. La instalación en iOS tiene limitaciones de observación; no convertir eventos disponibles en una cifra completa de instalaciones.

**Decisiones al final:**

- Si hay repetición y mantener el conjunto es viable, ampliar a una zona contigua o un tercer grupo.
- Si llegan personas pero no resuelven la primera tarea, corregir activación antes de aumentar difusión.
- Si usan la app pero no aportan, conservar ese valor y probar la petición de comprobación en contexto; no endurecer el acceso.
- Si aportan una vez pero no vuelven, entrevistar y revisar relevancia del lugar, siguientes salidas y utilidad de favoritos/resumen.
- Si no aparecen señales de repetición, no activar anuncios ni ampliar importaciones para maquillar crecimiento.

## 9. Investigación ligera

Cinco sesiones iniciales de 20–25 minutos y conversaciones posteriores con repetidores y personas que no volvieron. Preguntar por conducta real:

1. ¿Cómo preparaste tu última salida y cómo decidiste dónde encontrar agua?
2. Abre este enlace y dime qué sabes del estado de la fuente y qué no sabes.
3. Encuentra una fuente en otra localidad sin compartir ubicación.
4. Guarda la que utilizarías y vuelve a encontrarla después de acceder a tu cuenta.
5. Tras la siguiente salida: ¿abriste FontApp? ¿En qué momento? Si no, ¿qué utilizaste y por qué?

No sustituir observación por «¿te gustaría una app nativa?» o «¿usarías esta función?». Las respuestas a una encuesta de interés no equivalen a recurrencia.

## 10. Mensajes de campaña listos para adaptar

**Propuesta a un club, borrador no enviado:**

> Hola, soy [nombre], creador de FontApp. Permite consultar fuentes y los avisos de quienes han pasado por ellas. Estoy probando el proyecto en [zona] y me gustaría preparar las fuentes de una de vuestras salidas. La idea es que os resulte útil antes de salir y que, al pasar, quien quiera pueda actualizar su estado. ¿Os encajaría probarlo en una salida y contarme qué os ha servido y qué falta?

**QR de una fuente:** «¿Sale agua hoy? Consulta el último aviso y actualízalo si acabas de pasar». Enlace a la fuente correspondiente.

**Publicación de una salida:** «Antes de salir por [zona], revisa las fuentes del recorrido y la fecha de sus últimos avisos. Si pasas por una, tu comprobación ayuda a preparar la siguiente salida». Añadir datos reales y fotos autorizadas, sin prometer disponibilidad.

**Versión catalana breve:** «Abans de sortir, consulta les fonts i els darrers avisos. Quan hi passis, actualitza'n l'estat».

**Caso institucional:** «En [periodo], [número real] participantes han actualizado [número real] fuentes de [zona]. Estas son las que aún necesitan una comprobación». Publicarlo solo después de disponer de esos resultados.

Asignar códigos distintos por colaboración y soporte, por ejemplo `club-moianes-oct26` y `qr-castellcir-f1`, mediante el mecanismo de campañas existente. Son ejemplos de etiquetas, no campañas creadas. Mantener ventanas temporales comparables al evaluar resultados.

## 11. Qué aplazar

App nativa como apuesta principal; feed social generalista; nuevas clasificaciones; cobertura masiva de más países; motor completo de navegación; publicidad amplia; múltiples redes con contenido distinto; nuevos paneles municipales; monetización que limite el acceso básico al agua. Ninguno resuelve por sí mismo la utilidad de la segunda salida.

## 12. Trazabilidad técnica

Rutas relativas al repositorio, consultadas para este análisis:

- `web/src/components/FirstFountainWelcome.tsx`: selección de primera fuente, permisos y guardado.
- `web/src/lib/firstFountain.ts`: clasificación de bienvenida.
- `web/src/lib/quietRoutes.ts`: exclusiones de interrupciones.
- `web/src/lib/routeMemory.ts` y `web/src/pages/RouteWaterPage.tsx`: persistencia GPX por ámbito.
- `Sources/App/Mail/WeeklyDigest.swift`: selección del contenido de correo.
- `web/src/pages/PlacePage.tsx` y `web/functions/places/[slug].ts`: localidad y metadatos.
- `docs/monetizacion.md`, `docs/ayuntamientos.md` y `CLAUDE.md`: decisiones y capacidades existentes. Algunas cifras históricas o propuestas han quedado superadas por la implementación actual.

Este documento no implementa cambios funcionales, no crea campañas, no contacta a terceros y no verifica despliegues. Las fricciones de código deben convertirse en tareas con validación del recorrido correspondiente antes de atribuirles un impacto cuantificado.

## 13. Backlog para retomar la implementación

Estado actualizado: **FA-01 y FA-02 implementadas y validadas localmente; resto pendiente**. El análisis está terminado; las campañas no han comenzado. Antes de abordar una tarea, contrastar el código actual con el hallazgo, porque puede haber cambiado desde la auditoría. Las reglas técnicas y los comandos de validación siguen teniendo su única fuente de verdad en `CLAUDE.md`.

### FA-01 · P0 · No confundir incertidumbre con sequedad

Implementada el 23/09/2026. Validación: build web, tests y paridad de traducciones. Pendiente de despliegue. La bienvenida es neutra y muestra el estado individual y su fecha; no infiere sequedad para toda la zona.

- [x] Revisar `web/src/lib/firstFountain.ts` y su consumo en `FirstFountainWelcome.tsx`.
- **Resultado:** la bienvenida describe la evidencia disponible, sin deducir sequedad de la ausencia de un aviso reciente de agua.
- **Aceptación:** un aviso antiguo de agua, un estado desconocido y evidencia insuficiente no producen la afirmación «las fuentes constan secas». Un aviso de sequedad se comunica como tal, con su antigüedad. Una avería conserva su significado propio. En zonas con estados mezclados no se generaliza un estado al conjunto.
- **Validación:** casos de agua reciente, agua antigua, seca, averiada, desconocida y mezcla de fuentes; textos coherentes en los ocho idiomas. No cambiar por accidente la lógica de confianza del mapa ni equiparar caudal con potabilidad.
- **Dependencias:** ninguna. Primer cambio recomendado.

### FA-02 · P0 · Completar el favorito después de autenticar

Implementada el 23/09/2026. Intención de favorito por pestaña, con nonce, caducidad de diez minutos y consumo único; limpieza al salir de la cuenta. Aplica a bienvenida y ficha. El retorno usa el login/registro existente; éxito visible y errores recuperables desde el botón de favorito. Validación: tests de consumo, caducidad, destino, URL compartida y logout; build web y traducciones. Pendientes prueba manual de proveedores de login en dispositivos y despliegue.

- [x] Revisar `guarda()` en `FirstFountainWelcome.tsx` y el mecanismo existente de retorno tras login/registro.
- **Resultado:** «guardar» conserva la fuente concreta y se completa al terminar la autenticación, mostrando el resultado real.
- **Aceptación:** funciona con sesión iniciada, login y registro; recargar o repetir el retorno no duplica efectos; cancelar el acceso no anuncia un guardado; un error se comunica y permite reintentar. No queda una intención antigua que se aplique inadvertidamente a otra cuenta.
- **Validación:** recorrido invitado → guardar → autenticar → favorito visible; repetir con fallo de red y cancelación. Preservar el retorno de reseñas y cualquier verificación requerida.
- **Dependencias:** ninguna; reutilizar los mecanismos de navegación existentes.

### FA-03 · P0 · Conservar una ruta de invitado al acceder

- [ ] Revisar `web/src/lib/routeMemory.ts` y `web/src/pages/RouteWaterPage.tsx`.
- **Resultado:** la ruta preparada antes de acceder puede conservarse explícitamente para la cuenta actual.
- **Aceptación:** pedir la decisión cuando corresponda; no sobrescribir silenciosamente una ruta existente; rechazar la transferencia conserva la separación entre cuentas. Cerrar sesión y entrar en otra cuenta no expone ni transfiere rutas de la anterior. La recarga mantiene el resultado elegido.
- **Validación:** invitado con GPX → login, cuenta con ruta previa, cancelación, recarga y cambio de cuenta. Mantener el tratamiento local del GPX; esta tarea no añade sincronización en servidor.
- **Dependencias:** ninguna; coordinar con FA-02 si se comparte infraestructura de continuidad.

### FA-04 · P1 · Primera visita centrada en la tarea

Implementada el 23/09/2026: login/registro, fichas, localidades y GPX sin interrupciones; retirada la introducción automática; búsqueda manual accesible desde la primera bienvenida incluso tras denegar ubicación. Instalación tras un favorito guardado con éxito, con el descarte mensual existente. Validación: build web y tests de rutas e instalación. Pendientes cinco sesiones observadas y prueba física; despliegue por confirmar.

- [ ] Revisar `quietRoutes.ts`, `IntroDialog`, `FirstFountainWelcome`, `WelcomeDialog` e `InstallPrompt`.
- **Resultado:** un enlace compartido abre su contenido sin una cadena de presentaciones; login y registro permiten terminar su tarea. Buscar localidad es una alternativa visible a geolocalizarse.
- **Aceptación:** entrada nueva a una fuente, retorno de login y enlace con intención de reseña mantienen su destino; denegar GPS permite continuar por búsqueda manual. Se conserva la coordinación de diálogos. La instalación se ofrece tras una acción útil definida, respetando cierre y preferencias, sin repetirse en cada navegación.
- **Decisión al comenzar:** elegir la acción concreta que habilita la invitación de instalación, por ejemplo guardar una fuente o preparar una ruta; no introducir varios disparadores sin comprobar su interacción.
- **Validación:** móvil y escritorio, sesión nueva y recurrente, permisos concedidos/denegados y cinco pruebas observadas del primer uso.
- **Dependencias:** FA-02/03 para que los recorridos sugeridos no pierdan intención.

### FA-05 · P1 · Favoritos en el resumen semanal

Implementada el 24/09/2026: favoritas sumadas a creadas/reseñadas sin duplicados; selección de fuentes y novedades cercanas limitada a visibles; texto del correo actualizado en los idiomas existentes. Validación: 281 tests backend, incluidos favorito sin aportaciones, semana sin novedades, eliminación, solapamiento, ocultación y retirada. Se conserva el envío y la baja existentes. Pendientes entrega real y despliegue; no se enviaron correos de prueba a usuarios.

- [ ] Ampliar la selección relevante en `Sources/App/Mail/WeeklyDigest.swift`, reutilizando el envío existente.
- **Resultado:** quien solo tiene favoritos puede recibir cambios útiles de esas fuentes.
- **Aceptación:** favoritos, fuentes creadas y comentadas se deduplican; retirar un favorito deja de incluirlo por ese motivo; se respetan visibilidad, preferencias y baja. No enviar un correo sin novedades relevantes ni repetir avisos equivalentes. No añadir un segundo sistema de envíos.
- **Validación:** usuario con solo favoritos, solapamiento con fuentes propias, sin novedades, favorito eliminado y fuente no visible; vista previa/dry-run y pruebas backend apropiadas. Confirmar programación y entregabilidad como una comprobación separada: la preferencia activada no demuestra entrega.
- **Dependencias:** FA-02 recomendable antes de promover el flujo. Seguir zonas queda fuera de esta entrega.

### FA-06 · P1 · Descubrir «Agua en mi ruta»

- [ ] Revisar el acceso existente a GPX desde el mapa y `RouteWaterPage`.
- **Resultado:** el usuario entiende qué obtiene antes de necesitar conocer el término GPX.
- **Aceptación:** acceso identificable en móvil, explicación breve del resultado y continuidad con importación, estado y uso offline existentes. Mantener consulta como invitado; no añadir otro botón flotante ni un motor de navegación.
- **Validación:** preparar una salida con un GPX real y observar dónde se atascan cinco personas; comprobar que no empeoran los controles actuales del mapa.
- **Dependencias:** FA-03 antes de promover registro durante la preparación.

### FA-07 · P2 · Retorno personal y reconocimiento

- [ ] Validar en el piloto si falta acceso a la última salida, seguimiento de zona, aviso de recuperación de agua o reconocimiento de mantenimiento.
- **Estado:** hipótesis por separar en tareas pequeñas después de las entrevistas; no implementar todas por defecto.
- **Aceptación para pasar a desarrollo:** problema observado, público concreto, superficie existente donde resolverlo, frecuencia de comunicación y criterio medible definidos. Reutilizar favoritos, misiones y gamificación; no inventar impacto ni premiar duplicados.
- **Dependencias:** resultados del piloto y FA-05 para evitar sistemas de avisos redundantes.

### FA-08 · Validación y marketing · Ejecutar el piloto

- [ ] Confirmar zona y seleccionar un conjunto fijo de 30–40 fuentes en dos o tres recorridos.
- [ ] Realizar cinco sesiones de uso y registrar problemas observados, diferenciándolos de preferencias declaradas.
- [ ] Identificar doce grupos candidatos, intentar cinco conversaciones y conseguir dos pruebas de salida como objetivos orientativos.
- [ ] Preparar dos o tres páginas locales útiles y pocos QR contextuales con permiso; verificar primero los datos de indexación disponibles.
- [ ] Medir semanalmente cobertura reciente, nuevos colaboradores y segunda aportación con ventanas completas según la sección 8.
- [ ] Al final de doce semanas decidir continuidad o cambio de enfoque; no activar publicidad antes de observar repetición externa.
- **Dependencias:** P0 resueltos antes de ampliar captación. Borradores y presupuesto en secciones 6–10. Documentar no equivale a haber contactado, publicado o gastado.

### Orden de trabajo y cierre

Primera entrega: FA-01. Segunda: FA-02. Tercera: FA-03. Después, observar el primer uso y elegir FA-04, FA-05 o FA-06 según el bloqueo más relevante del piloto y el tiempo disponible. FA-07 permanece en investigación. El alcance de marketing sigue limitado a 4–6 horas semanales y hasta 150 €/mes, incluyendo trabajo de producto.

Al completar cada tarea, actualizar aquí su estado, fecha, archivos afectados, validación realizada y referencia al commit/PR si existe. Diferenciar **implementado**, **validado** y **desplegado**; no marcar producción sin comprobarla. Mantener las cifras del análisis como fotografía histórica del backup, no sustituirlas por métricas locales de demo.

Petición sugerida para retomar: «Lee CLAUDE.md y la sección 13 de docs/producto-crecimiento-2026-09.md. Implementa FA-01 y valida sus criterios de aceptación. Actualiza el estado de esa tarea sin abordar las demás».

## 14. Apps para iOS y Android: alternativas y coste con IA

Ampliación del 23 de septiembre de 2026. La recomendación anterior de aplazar una app nativa era una decisión de prioridad, no una evaluación técnica completa. Esta sección incorpora esa evaluación. **No se ha elegido tecnología ni comenzado una app.** Las horas son estimaciones propias de planificación para FontApp, no presupuestos de proveedores ni resultados medidos de productividad de IA.

### 14.1. Qué valor aportaría al producto

Una app distribuida por tiendas puede facilitar la instalación a quien no conoce las PWA, mantener FontApp presente en su dispositivo y ofrecer mejor integración con archivos GPX, cámara, enlaces, almacenamiento y notificaciones. La mejora debe demostrarse con una salida real: preparar contenido, consultarlo sin cobertura y enviar una comprobación sin perderla.

No atribuir todas esas funciones exclusivamente a lo nativo: FontApp ya tiene cámara/fotos, GPX, offline y push web. En iOS, Web Push está disponible para aplicaciones web añadidas a la pantalla de inicio desde iOS 16.4; requiere una solicitud de permiso vinculada a una interacción. La fricción de instalación es una diferencia real, pero «la PWA no tiene notificaciones en iPhone» sería incorrecto. [Documentación de WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

Beneficios a comprobar:

- Instalación y reapertura más comprensibles para el público del piloto.
- Abrir un GPX desde Archivos u otra app con menos pasos y conservarlo después de cerrar FontApp.
- Almacenamiento y colas de subida controlados por la aplicación, con estado explícito y recuperación ante cierres.
- Mejor experiencia de gestos, mapa, accesibilidad y permisos si se implementa y prueba adecuadamente.
- Integraciones futuras como widgets o avisos durante una salida, solo si hay necesidad observada.

Una app no actualiza las fuentes por sí sola, no garantiza permisos, no obtiene usuarios automáticamente por aparecer en una tienda y no asegura trabajo continuo en segundo plano. No justificar la inversión únicamente por la encuesta de interés. Las 227 sesiones iOS de 378 con plataforma identificada orientan a probar primero en iPhone, pero no representan 227 usuarios ni demanda demostrada de descarga.

### 14.2. Comparación tecnológica aplicada a FontApp

| Alternativa | Reutilización real | Ventajas | Inconvenientes y encaje |
|---|---|---|---|
| Mantener React web/PWA | Toda la base actual | Una entrega, acceso inmediato por enlace, SEO y coste incremental bajo | Instalación menos evidente; límites del navegador. Mejor opción inmediata para validar recurrencia |
| React web + Capacitor | Mucha UI MUI, lógica y Leaflet; adaptadores para capacidades del dispositivo | Menor reescritura, tiendas y acceso a APIs nativas mediante plugins | Interfaz en WebView; no se vuelve nativa por empaquetarla. Revisar mapas, teclado, permisos, auth, almacenamiento y ciclo de vida. Primera opción a experimentar si el objetivo es distribución e integración ligera |
| React Native + Expo | TypeScript puro, reglas, contratos API y textos tras desacoplarlos del navegador | Base móvil compartida, componentes nativos, continuidad con conocimientos React | Rehacer UI, navegación y mapa; mantener también la web. Mejor candidato si se necesita una experiencia móvil propia sostenida |
| Flutter | Backend/API, diseños y contenido conceptual; poca reutilización directa de código TS/UI | Una base móvil en Dart y gran control visual | Reescritura del frontend, nuevo ecosistema y plugins. Viable técnicamente, menor ventaja para este repositorio salvo experiencia previa fuerte en Flutter |
| Swift/SwiftUI para iOS + Kotlin/Compose para Android | Backend/API y especificación funcional; dos clientes nuevos | Acceso directo a cada plataforma y control fino de integración | Dos implementaciones y sus pruebas, además de la web. Mayor coste para una sola persona; reservar para necesidades específicas que las otras vías no resuelvan |

React web y React Native no son intercambiables: [React DOM no está soportado en React Native](https://react.dev/reference/react-dom), que ofrece sus [propios componentes](https://reactnative.dev/docs/components-and-apis). MUI y React-Leaflet dependen de la web actual; un mapa dentro de una WebView es una decisión híbrida explícita, no una conversión a mapa nativo.

[Capacitor](https://capacitorjs.com/docs) permite incorporar un runtime nativo a una aplicación web. No requiere cambiar a Ionic UI. [Flutter](https://docs.flutter.dev/platform-integration) permite compartir una base entre plataformas, pero integraciones concretas pueden requerir [código específico por plataforma](https://docs.flutter.dev/platform-integration/platform-channels). Que el backend use Swift no convierte sus controladores Vapor en pantallas SwiftUI; compartir modelos exige diseñar y mantener esa separación.

### 14.3. Alcance que se está estimando

**MVP móvil para ambas plataformas:** mapa y búsqueda, detalle/estado/fotos, login, favoritos, reseña con foto, importación básica de GPX, lectura de fuentes/ruta guardadas offline, cola persistente de aportaciones, enlaces a fichas, avisos relevantes, localización de textos existentes, ajustes esenciales y eliminación de cuenta. Incluye integración backend necesaria, pruebas físicas, preparación de las dos tiendas y una ronda de correcciones de revisión; la aprobación no se garantiza.

No incluye paridad de toda la web: administración, paneles municipales y funcionalidades avanzadas pueden seguir en web con navegación clara. Tampoco incluye navegación giro a giro, grabación GPS continua, relojes, widgets, pagos ni descarga de grandes regiones de cartografía. **Guardar fuentes y una ruta offline no equivale a descargar el mapa base.**

Supuestos: API actual aprovechable, diseño existente, Mac e iPhone disponibles, Android físico disponible o prestado, una persona capaz de revisar el código generado y uso habitual de IA. Las cifras con IA ya incluyen supervisión, depuración, pruebas y publicación; no son horas de generación automática.

| Alternativa | Prueba técnica con IA, desechable | MVP con IA: horas humanas totales | Referencia sin IA, mismo alcance | Mantenimiento adicional estimado/mes |
|---|---:|---:|---:|---:|
| PWA: mejorar instalación y recorridos existentes | 4–8 h | 20–50 h de mejora incremental, no MVP nuevo | 30–75 h | 1–3 h para esas mejoras |
| Capacitor | 8–16 h | 80–160 h | 120–240 h | 4–8 h |
| React Native + Expo | 16–30 h | 180–320 h | 260–480 h | 6–12 h |
| Flutter | 20–40 h | 220–380 h | 320–560 h | 6–12 h |
| SwiftUI + Kotlin/Compose | 24–48 h para una primera plataforma | 340–600 h para ambas | 480–900 h | 10–20 h |

La prueba técnica está incluida en el total si se aprovecha; no sumarla dos veces. La fila PWA tiene alcance distinto y representa la alternativa de invertir en el producto actual. El mantenimiento móvil es adicional al backend y web, sin grandes funciones nuevas; una actualización problemática de SDK puede excederlo. La inexperiencia con una tecnología o una API móvil insuficiente puede llevar más allá del rango.

A **5 horas semanales dedicadas únicamente a móvil**, los MVP equivalen aproximadamente a 16–32 semanas para Capacitor, 36–64 para React Native, 44–76 para Flutter y 68–120 para dos clientes nativos. Si esas mismas horas también cubren marketing y mantenimiento, se tarda más. Una demo de pocos días no es equivalente al MVP descrito.

Desglose orientativo de un caso React Native de 240 horas: 20 arquitectura y experimento de mapa, 55 pantallas/mapa/búsqueda, 35 autenticación y enlaces, 50 fotos/GPX/almacenamiento/cola offline, 20 avisos y adaptación backend, 60 pruebas físicas/accesibilidad/publicación/correcciones. Reestimar cada bloque tras el experimento: es donde se decide si el esfuerzo real compensa.

### 14.4. Qué abarata la IA y qué permanece

La IA puede acelerar scaffolding, cliente API, componentes repetitivos, adaptación de textos, casos de prueba y diagnóstico de errores. También puede ayudar a extraer funciones TypeScript puras compartidas entre React web y React Native.

No asumir un porcentaje universal de ahorro. Los rangos anteriores son escenarios: el ahorro se concentra en código repetitivo, no en decidir el producto ni en validar sobre dispositivos. Seguirán siendo necesarios:

- Probar permisos concedidos y denegados, red intermitente, app terminada, sesión expirada y reenvío sin duplicados.
- Revisar tokens, almacenamiento seguro, OAuth y asociaciones de enlaces; no trasladar mecánicamente el login web.
- Validar consumo de batería, memoria, desplazamiento del mapa y subida de imágenes.
- Resolver certificados, compilaciones, fichas, privacidad, revisión y cambios futuros de SDK.
- Comprender y poder mantener las dependencias elegidas por la IA. Una solución que solo funciona en el simulador no está terminada.

Medir durante la prueba técnica horas humanas, iteraciones, defectos y partes reutilizables. Esa medición debe sustituir estos rangos antes de comprometer el MVP.

### 14.5. Dinero: separar desembolso y tiempo propio

| Concepto | Previsión |
|---|---|
| Apple Developer Program | 99 USD/año; importe local e impuestos según inscripción |
| Google Play Console | 25 USD de alta, pago único |
| Herramienta de IA | Si ya está contratada y cabe en sus límites, coste incremental posible de 0 €. Reservar 20–100 €/mes adicionales solo si hace falta; es una provisión, no una tarifa consultada |
| Compilación/CI | Presupuestar 0–40 €/mes como escenario inicial: compilar localmente evita comprar un servicio, pero consume tiempo. Comprobar las tarifas del servicio elegido antes de contratar |
| Android físico | 0 € si disponible/prestado; reserva orientativa de 150–300 € si hay que comprarlo, pendiente de selección |
| Mapas, imágenes y backend | Mantener costes actuales más consumo nuevo. Seleccionar proveedor y medir solicitudes/almacenamiento antes de estimar mapas offline; no asumir coste cero a cualquier escala |

Fuentes de las cuotas: [Apple](https://developer.apple.com/help/account/membership/program-enrollment) y [Google Play](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en). Son 124 USD nominales el primer año si se abren ambas cuentas; no convertir automáticamente esa cifra a euros ni sumarla como si las monedas fueran iguales. Hardware, impuestos, IA y servicios van aparte. No se han adquirido cuentas ni contratado servicios.

Ejemplo económico, **no presupuesto de un freelance**: si valoras tu tiempo en 30 €/h, Capacitor representa 2.400–4.800 €, React Native 5.400–9.600 €, Flutter 6.600–11.400 € y dos clientes nativos 10.200–18.000 € de tiempo, más desembolsos. La IA puede hacer asequible escribir la app sin contratar un equipo, pero no elimina ese coste de oportunidad.

Con el techo de 150 €/mes, cuotas amortizadas y un uso moderado de herramientas pueden encajar; compras de dispositivos o inscripción pueden concentrar gasto en un mes. El mayor conflicto es de horas: incluso el mínimo de Capacitor supera las 60 horas del plan de tres meses. Financiar una app con ese tiempo desplaza parte del piloto y del mantenimiento.

### 14.6. Riesgos técnicos específicos y publicación

**Cartografía:** en React Native/Flutter/nativo hay que seleccionar motor, agrupación de puntos y proveedor; comprobar densidad, rotación, estilos y comportamiento offline con datos representativos. Evitar descargar todo el inventario. Los datos abiertos de OSM no implican permiso para descargar masivamente las teselas públicas: [la política de tile.openstreetmap.org prohíbe prefetch y descarga masiva](https://operations.osmfoundation.org/policies/tiles/). Un mapa descargable necesita una solución compatible y su presupuesto.

**Offline:** el service worker y la cola IndexedDB de la PWA no son automáticamente la solución de una app nativa. En Capacitor hay que comprobar su funcionamiento real y decidir qué sustituir por almacenamiento/plugin; en otros clientes se implementa persistencia móvil. Validar idempotencia con el backend, fallos parciales, sesión caducada y migraciones. No prometer sincronización permanente con la app cerrada.

**Auth y notificaciones:** conservar cuentas existentes; revisar retorno OAuth, enlaces universales/App Links y almacenamiento de credenciales. Los tokens Web Push actuales no se reutilizan como tokens móviles; prever registro por dispositivo y entrega APNs/FCM o intermediario, conservando preferencias. Expo exige development builds para probar push; Expo Go no basta. [Documentación de Expo](https://docs.expo.dev/push-notifications/what-you-need-to-know/).

**Tiendas:** una WebView que solo reempaqueta la web puede encontrar objeciones por funcionalidad mínima; Capacitor no está prohibido por sí mismo. Revisar funcionalidad, moderación del contenido de usuarios, eliminación de cuenta y declaraciones de privacidad. Al mantener Google Login, evaluar los requisitos de la sección 4.8; Sign in with Apple es una opción habitual para cumplirlos, no afirmar que el login por correo basta en todos los casos. [Directrices oficiales de Apple](https://developer.apple.com/app-store/review/guidelines/).

En nuevas cuentas personales de Google Play creadas después del 13 de noviembre de 2023 se exige una prueba cerrada con al menos 12 testers inscritos continuamente durante 14 días antes de solicitar acceso a producción. Este plazo de calendario y conseguir testers no desaparecen con IA. [Requisitos de Google](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en). Verificar requisitos vigentes al publicar; las condiciones pueden cambiar.

### 14.7. Recomendación y tarea FA-09

**Recomendación actual:** conservar la web/PWA como entrada pública y SEO. Resolver primero los P0. Si el piloto muestra fricción repetida de instalación o integración con el dispositivo, explorar Capacitor durante 8–16 horas. Si el problema exige una experiencia móvil propia, cartografía avanzada o integraciones difíciles de resolver bien en WebView, evaluar React Native + Expo como primera alternativa de reescritura. Flutter es razonable con experiencia o un colaborador que lo domine; dos clientes nativos completos tienen el peor encaje actual con el tiempo disponible.

No iniciar Capacitor como paso obligatorio hacia React Native: son apuestas alternativas. El experimento debe indicar si quedarse con la primera, elegir la segunda o mantener la PWA.

### FA-09 · Investigación pendiente · Decidir si una app móvil merece inversión

- [ ] Entrevistar a participantes recurrentes: registrar tareas concretas bloqueadas por la PWA y observar la instalación, no solo preguntar si prefieren una app.
- [ ] Elegir un único beneficio móvil a demostrar y el alcance mínimo de la sección 14.3 que resulta imprescindible.
- [ ] Hacer un experimento Capacitor acotado a 8–16 horas, si la necesidad es compatible: mapa real, login, abrir GPX/ficha, persistir una aportación offline y recuperarla. Probar iPhone y Android físicos; no desarrollar en paralelo otras alternativas completas.
- [ ] Documentar lo reutilizable, problemas de WebView/plugins, horas consumidas y estimación revisada. Si fracasa por una limitación concreta, justificar una prueba React Native en vez de reescribir por preferencia.
- [ ] Reclutar voluntarios del piloto para una beta; probar reutilización en una segunda salida y ausencia de pérdida/duplicación de aportaciones. Separar intención declarada, instalación y uso real.
- [ ] Decidir continuar solo con beneficio observado, presupuesto de desarrollo, capacidad mensual de mantenimiento y responsable disponibles. Como criterio inicial de aprendizaje: cinco participantes que prueben una segunda salida y expliquen una mejora concreta frente a la PWA; no es una prueba estadística ni promesa de conversión.

Dependencias: FA-01/02/03 y señales del piloto FA-08. Estado: **documentado, no iniciado**. Entregable: decisión escrita entre PWA, Capacitor o nuevo cliente, con mediciones y costes actualizados. No convertir la encuesta existente ni una demo generada con IA en autorización para asumir meses de desarrollo.
