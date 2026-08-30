# Monetización de FontApp

Este documento reúne las vías posibles para financiar FontApp sin convertir el acceso
al agua en un producto, introducir publicidad invasiva ni vender datos personales. No es
un compromiso de implementación: es un mapa de opciones y de cómo validarlas.

## Principios

1. **Buscar y consultar fuentes seguirá siendo gratuito.** El estado, la ubicación y la
   información necesaria para encontrar agua son el núcleo del servicio.
2. **Los datos no se venden para perfilar personas.** No se monetizan ubicaciones,
   identidades, historiales de navegación ni intención de donar.
3. **Pagar no permite alterar la verdad del mapa.** Un patrocinador no puede cambiar la
   potabilidad, el estado, la confianza ni el orden de los resultados.
4. **La comunidad aporta datos; el producto de pago aporta servicio.** Lo cobrable es la
   gestión, normalización, soporte, automatización, histórico, informes o garantías de
   disponibilidad, no apropiarse de las contribuciones públicas.
5. **Cada modelo se valida antes de construirlo.** Primero entrevistas o una oferta
   manual; después software. No se crea un panel complejo para descubrir al final que
   nadie tiene presupuesto o capacidad de contratarlo.

## Resumen y prioridad

| Vía | Cliente | Potencial | Esfuerzo | Prioridad |
| --- | --- | ---: | ---: | ---: |
| FontApp Pro territorial | Administraciones y gestores | Alto | Medio | 1 |
| Donaciones y membresía | Usuarios y comunidad | Medio | Bajo | 1 |
| Servicios de datos | Administraciones y organizaciones | Medio/alto | Medio | 2 |
| API profesional | Apps y empresas | Alto | Alto | 2 |
| Patrocinios de campañas | Empresas y asociaciones | Medio | Medio | 2 |
| Funciones premium | Excursionistas frecuentes | Medio | Alto | 3 |
| Subvenciones | Instituciones y fundaciones | Variable | Medio/alto | Continua |
| Merchandising | Comunidad | Bajo | Medio | Baja |

El orden recomendado es empezar con donaciones —ya disponibles— y validar un producto
territorial hablando con entidades. La API y el premium de consumo solo compensan cuando
existe demanda demostrada.

## 1. Donaciones y membresía

FontApp ya dispone de apoyo recurrente mediante Aixeta y de donación puntual mediante
Stripe. La mejora no consiste en añadir más proveedores, sino en explicar mejor el
impacto y medir el embudo completo.

Posible propuesta:

- 3 €/mes: ayuda a mantener la infraestructura.
- 5 €/mes: ayuda a financiar verificaciones y expansión territorial.
- 10 €/mes: ayuda a sostener desarrollo y aplicaciones nativas.
- Importe libre o aportación puntual para quien no quiera una suscripción.

Las cantidades son hipótesis para probar, no precios definitivos. Se puede reconocer a
los miembros de forma opcional con una página de agradecimientos, acceso anticipado a
betas o un distintivo discreto. Ningún reconocimiento debe dar autoridad sobre los datos
ni ventajas en la gamificación.

Qué medir:

- Visitas a `/support` desde el corazón y desde el pie.
- Clics en cada modalidad de pago.
- Checkout iniciado y donación completada, de forma agregada.
- Conversión puntual frente a recurrente.
- Permanencia de las aportaciones recurrentes y cancelaciones.
- Mensajes y posiciones que generan conversión sin degradar la experiencia.

No interpretar un clic como una donación ni la ausencia de clic como falta de interés. La
confirmación de pago debe venir del proveedor mediante webhook, no del regreso del
navegador.

Como referencia, [Organic Maps](https://organicmaps.app/donate/) mantiene gratuita y sin
publicidad una aplicación cartográfica y comunica las aportaciones recurrentes como la
forma de sostener servidores y desarrollo a largo plazo.

## 2. FontApp Pro territorial

El cliente natural no es quien necesita beber, sino quien mantiene o supervisa las
fuentes de un territorio: ayuntamientos, diputaciones, parques naturales, entidades de
salud, empresas públicas de agua y asociaciones excursionistas.

Un primer producto podría incluir:

- Inventario territorial con permisos propios.
- Fuentes sin revisar desde hace 30, 90 o 365 días.
- Incidencias abiertas y seguimiento de resolución.
- Estado, confianza, potabilidad, fotos y documentos.
- Alertas de cambios relevantes.
- Exportación CSV o GeoJSON.
- Informe mensual en PDF.
- Campañas de verificación para brigadas o ciudadanía.
- Identidad institucional verificada para comunicaciones públicas.

La vista pública no cambia. El pago cubre herramientas de gestión, automatización,
soporte e informes.

### Validación antes de implementarlo

1. Entrevistar al menos a tres entidades de tamaños distintos.
2. Enseñar un prototipo o informe preparado manualmente con sus datos.
3. Preguntar quién lo usaría, con qué frecuencia y de qué partida saldría el gasto.
4. Ejecutar un piloto acotado a un territorio y una temporada.
5. Cobrar el segundo piloto antes de construir un panel general.

No se debe fijar una tarifa hasta entender el proceso de contratación. Puede haber un
plan anual pequeño, uno territorial mayor y servicios iniciales de inventario o limpieza,
pero los importes deben salir de las entrevistas y no de una tabla inventada.

El plan detallado de esta vía —qué se puede vender hoy medido contra los datos reales,
en qué orden construirlo y qué no hacer— está en [docs/ayuntamientos.md](ayuntamientos.md).

## 3. Servicios de datos y consultoría

Mientras el producto institucional madura, FontApp puede ofrecer trabajos con alcance y
precio cerrados:

- Importación y normalización de inventarios existentes.
- Detección y revisión de duplicados.
- Clasificación territorial y control de calidad.
- Mapa público personalizado para una entidad.
- Campaña ciudadana de verificación.
- Informe de cobertura, frescura y fiabilidad.
- Integración con los sistemas del cliente.

Es menos escalable que una suscripción, pero permite aprender qué necesitan realmente las
entidades y financiar el desarrollo del producto reutilizable.

## 4. API profesional y exportaciones

Una API de pago podría servir a aplicaciones de senderismo, ciclismo, turismo, carreras,
alojamientos rurales o gestión territorial.

El valor comercial no sería esconder los datos públicos, sino ofrecer:

- Contrato estable y documentación.
- Claves, cuotas y panel de consumo.
- SLA y soporte.
- Webhooks de cambios.
- Exportaciones programadas.
- Datos normalizados, deduplicados y enriquecidos.
- Índice de confianza e histórico.
- Cobertura por territorio y control de frescura.

Antes de ofrecerla hay que separar con claridad datos de OpenStreetMap, datos de otras
administraciones y aportaciones propias, y revisar las obligaciones de atribución y de
base derivada de la licencia ODbL. Cobrar acceso o servicio no elimina esas obligaciones.

La primera validación puede ser una exportación manual para un cliente real. No hace falta
construir claves, facturación y límites hasta que alguien necesite consumirla de forma
recurrente.

## 5. Patrocinios territoriales y de campañas

Una empresa, refugio, asociación o comercio puede financiar un objetivo concreto:

- Revisar las fuentes de una ruta o parque.
- Fotografiar un territorio.
- Actualizar una zona antes del verano.
- Importar y limpiar una nueva región.
- Financiar traducciones o una funcionalidad pública.

El reconocimiento debe aparecer en la campaña, el informe o una página de agradecimiento,
no como resultado patrocinado en el mapa. Reglas mínimas:

- Etiqueta explícita de patrocinio.
- Sin seguimiento publicitario.
- Sin acceso a datos personales.
- Sin influencia sobre el contenido o la confianza.
- Fecha de inicio y fin y objetivo verificable.

## 6. FontApp Pro para usuarios

Una suscripción puede tener sentido especialmente para ciclistas, senderistas y personas
que planifican rutas. La frontera del producto debe ser clara: FontApp cobra por ahorrar
trabajo en la planificación y ofrecer comodidad avanzada, nunca por encontrar agua o
conocer su estado.

Propuesta de posicionamiento:

> FontApp siempre será gratuito para encontrar y compartir fuentes. Pro ayuda a
> planificar rutas, trabajar sin cobertura y evitar kilómetros sin agua.

### Lo que continúa gratuito

- Consultar todas las fuentes, su estado, potabilidad, confianza, fotos y reseñas.
- Añadir fuentes, fotos, reseñas y confirmaciones.
- Navegación básica, búsqueda, favoritos y gamificación.
- Consultar la información necesaria para encontrar agua con seguridad.
- Una prueba limitada del análisis de rutas, para que se pueda evaluar su utilidad antes
  de pagar.

### Funciones candidatas para Pro

- Importación y almacenamiento de rutas GPX sin límite práctico.
- Fuentes dentro de un corredor configurable de 100 m, 500 m, 1 km u otra distancia.
- Cálculo del tramo más largo de la ruta sin una fuente fiable.
- Rutas y colecciones privadas sincronizadas entre dispositivos.
- Exportación de un GPX enriquecido con las fuentes como waypoints.
- Descarga de mapas, rutas y fuentes para trabajar sin cobertura.
- Alertas cuando cambia el estado de una fuente guardada o situada en una ruta.
- Filtros avanzados por potabilidad, funcionamiento reciente, confianza y presencia de
  fotografías.
- Historial completo de fuentes visitadas, rutas y búsquedas.
- Estadísticas personales de planificación y contribuciones.

### Precio que se puede validar

Como hipótesis inicial, no como tarifa definitiva:

- 2,49 EUR al mes.
- 19,99 EUR al año, destacado como opción principal.
- 14,99 EUR al año como precio fundador para los primeros usuarios.
- Prueba gratuita de 14 días, sin restringir nunca el mapa público.

El plan anual encaja mejor con un uso estacional: una persona puede planificar muchas
rutas en verano y muy pocas en invierno. Se debería medir activación, conversión,
renovación y cancelación antes de crear más planes.

### Cobro desde la PWA

Mientras FontApp sea una web/PWA y no una aplicación distribuida por la App Store, puede
contratarse Pro directamente mediante Stripe Checkout y Billing, sin implementar compras
in-app. Stripe alojaría el formulario de pago y el Customer Portal permitiría cambiar o
cancelar la suscripción; FontApp no almacenaría datos de tarjetas.

El estado de la suscripción debe confirmarse mediante webhooks de Stripe y persistirse en
el backend. No se debe desbloquear Pro basándose únicamente en la URL de retorno del
navegador. Los identificadores de producto y precio serán distintos en test y producción
y se configurarán mediante variables de entorno.

Si en el futuro se publica una aplicación nativa en una tienda, habrá que revisar las
reglas vigentes de esa tienda antes de reutilizar este flujo de compra. El derecho a Pro
puede vivir en la cuenta y sincronizarse entre plataformas, pero el método permitido para
contratarlo puede variar.

### MVP recomendado

No se deberían construir todas las funciones a la vez. La primera versión puede contener:

1. Importación y almacenamiento de rutas.
2. Corredor configurable alrededor del track.
3. Tramo más largo sin agua.
4. Exportación GPX enriquecida con fuentes.
5. Un único plan anual fundador.

Antes de cobrar se puede mostrar una pantalla explicativa al terminar un análisis y medir
cuántas personas consultan el detalle de Pro. El paywall debe aparecer después de haber
mostrado valor, no antes de que la persona vea qué fuentes hay en su ruta.

### Riesgos y límites

- Construir demasiado para una base todavía pequeña de usuarios recurrentes.
- Convertir una funcionalidad de seguridad o acceso al agua en una barrera de pago.
- Incrementar el soporte de sincronización, pagos, renovaciones y recuperación de cuenta.
- Fragmentar la experiencia entre web y futuras aplicaciones nativas.
- Confundir datos comunitarios con contenido propietario. Se cobra el análisis, la
  automatización y el servicio, no la mera existencia de los puntos del mapa.

## 6.1 FontApp Pro para organizaciones

La suscripción individual puede validar el interés, pero el mayor potencial económico
está probablemente en organizaciones: ayuntamientos, parques naturales, clubes ciclistas
y excursionistas, organizadores de carreras, campings y alojamientos rurales.

Una oferta organizativa podría incluir:

- Panel de fuentes de un territorio o conjunto de rutas.
- Avisos de averías y seguimiento de incidencias.
- Exportación CSV y GeoJSON e informes periódicos.
- Estadísticas agregadas de cobertura, actividad y frescura.
- Moderadores territoriales e identidad institucional verificada.
- Página pública personalizada e integración con la web de la entidad.
- API, webhooks o sincronización con sus sistemas internos.

Como hipótesis para entrevistas se puede explorar un rango de 19 a 79 EUR al mes, o una
cuota anual equivalente, según territorio, soporte e integraciones. No debe publicarse
como tarifa cerrada antes de conocer los procesos de contratación y ejecutar pilotos.
Una sola organización puede aportar ingresos equivalentes a muchas suscripciones
individuales sin degradar la experiencia pública.

## 7. Subvenciones y financiación institucional

FontApp encaja en convocatorias relacionadas con datos abiertos, acceso al agua,
adaptación al calor, turismo sostenible, salud pública, territorio rural, participación
ciudadana y software libre.

Pueden financiar una expansión geográfica, accesibilidad, aplicaciones nativas, trabajo
de campo o interoperabilidad. No deben ser la única fuente de ingresos: son lentas,
irregulares y suelen financiar proyectos concretos, no mantenimiento indefinido.

Conviene mantener preparado:

- Memoria breve del problema y del impacto.
- Cifras verificables de cobertura, actividad y frescura.
- Presupuesto por hitos.
- Política de privacidad y gobernanza de datos.
- Cartas de interés de entidades usuarias.

## 8. Merchandising y campañas colectivas

Camisetas, botellas o pegatinas pueden reforzar comunidad, pero normalmente dejan poco
margen y añaden logística. Es una herramienta de difusión o una campaña puntual, no una
prioridad de negocio. Una preventa evita comprar stock sin demanda.

## Modelos que se descartan

- Publicidad programática o anuncios sobre el mapa.
- Venta de ubicaciones, perfiles o historiales de usuarios.
- Cobrar por localizar una fuente o conocer su estado básico.
- Resultados patrocinados que alteren proximidad o confianza.
- Permitir que un patrocinador declare potabilidad o cierre incidencias.
- Vender como propios datos cuya licencia exige atribución o compartir derivados.
- Crear varios planes y pasarelas antes de validar una sola propuesta.

## Hoja de ruta recomendada

### Fase 1 — medir y explicar

- Completar el embudo agregado de Stripe mediante webhook de pago completado.
- Mostrar de forma concreta qué costes o mejoras financian las aportaciones.
- Probar importes y mensajes sin interrumpir el uso del mapa.
- Preparar una página de una sola hoja para FontApp Pro.

### Fase 2 — vender antes de automatizar

- Entrevistar entidades.
- Preparar manualmente un informe territorial.
- Conseguir un piloto y definir sus criterios de éxito.
- Ofrecer una primera exportación profesional a un integrador.

### Fase 3 — convertir lo repetido en producto

- Construir únicamente las funciones que se hayan repetido en pilotos.
- Definir soporte, permisos, auditoría y facturación.
- Publicar condiciones, licencias y límites de responsabilidad.

### Fase 4 — explorar consumo premium

- Usar la demanda observada de PWA, iOS y Android para priorizar plataforma.
- Validar qué funciones avanzadas generan intención real de pago.
- Lanzar un único plan pequeño antes de crear una escalera de precios.

## Cuadro de decisión

Cada experimento debe registrar:

| Pregunta | Ejemplo de evidencia |
| --- | --- |
| ¿Existe un problema frecuente? | Entrevistas y uso repetido, no solo opiniones |
| ¿Quién decide y quién paga? | Cargo, entidad y partida presupuestaria |
| ¿Pagarían ahora? | Piloto o carta de intención con condiciones concretas |
| ¿Cuánto cuesta servirlo? | Desarrollo, soporte, infraestructura y administración |
| ¿Daña la misión? | Acceso básico, independencia del dato y privacidad intactos |
| ¿Se puede repetir? | La solución sirve a más de un cliente sin rehacerla |

La dirección recomendada es **FontApp gratuito para las personas y FontApp Pro para
quienes gestionan territorios**, apoyado por donaciones recurrentes y servicios de datos
mientras se valida el producto institucional.
