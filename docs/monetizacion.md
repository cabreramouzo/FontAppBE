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

## 6. Funciones premium para usuarios

Solo tiene sentido cuando exista suficiente uso recurrente. El núcleo debe continuar
gratuito; se cobraría comodidad avanzada:

- Descarga completa de zonas para uso offline.
- Planificación de rutas pasando por fuentes fiables.
- Alertas avanzadas sobre favoritas o rutas.
- Colecciones privadas y sincronización entre dispositivos.
- Importación y exportación GPX.
- Capas especializadas o histórico ampliado.

Riesgos:

- Desarrollo y soporte en web, iOS y Android.
- Comisiones y reglas de las tiendas si se vende en apps nativas.
- Fragmentar el producto demasiado pronto.
- Colocar tras un muro algo que la comunidad considera parte esencial de FontApp.

Antes de construirlo se puede medir interés con una pantalla explicativa sin cobrar ni
prometer una fecha, y entrevistar a quienes seleccionen cada función.

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
