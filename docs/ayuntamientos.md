# Una vista para ayuntamientos

Plan y lluvia de ideas para el producto territorial que [docs/monetizacion.md](monetizacion.md)
lista como prioridad 1 («FontApp Pro territorial»). No es un compromiso de implementación:
es qué se puede vender de verdad, en qué orden construirlo y qué no hacer.

Este documento existe ahora y no antes porque **cambió un dato**: desde
`populate-municipalities`, cada fuente española sabe en qué municipio está y con qué
código INE. Sin esa columna, «una vista para el ayuntamiento de Moià» era una consulta
por caja o por cercanía, o sea una aproximación; con ella es una pregunta exacta.

## 1. Qué tenemos de verdad, medido

Lo que se puede enseñar mañana por la mañana, sin escribir producto:

| Dato | Cifra | De dónde sale |
| --- | ---: | --- |
| Municipios con alguna fuente | **5.551** | `fonts.municipality`, límites del IGN |
| Fuentes clasificadas por municipio | **53.207** | ídem, con `municipality_ine` |
| Mediana de fuentes por municipio | **3** | |
| Municipios con ≥ 10 fuentes | **1.197** | |
| Municipios con ≥ 20 | **527** | |
| Municipios con ≥ 50 | **129** | |
| Municipios con ≥ 100 | **48** | |
| Los mayores | Madrid 2.058 · Barcelona 1.880 · València 861 · Bilbao 526 | |

España tiene unos 8.100 municipios, así que **hay fuentes en dos de cada tres**. Y el
inventario no es una lista de nombres: son coordenadas, tipo de punto, potabilidad
declarada, origen del dato y licencia.

**Y lo que NO tenemos, que es la mitad de la conversación:** el estado. Medido en
producción el 30/08/2026, la base entera lleva **122 reseñas y 145 fuentes con foto**, o
sea del orden del **0,2 %** de cobertura. Un ayuntamiento que abra un panel hoy verá su
inventario completo y **cero** información sobre si mana. Eso obliga a una decisión de
honestidad comercial que ordena todo lo demás:

> No se vende «el estado de tus fuentes». Se vende **el inventario** que casi ninguno
> tiene, y **la manera de llenar el estado** con gente que ya está allí.

Vender lo segundo como si fuera lo primero es la forma más rápida de quemar el primer
piloto y el boca a boca del sector, que es pequeño y se llama por teléfono.

## 2. Lluvia de ideas, de más a menos maduro

### a) El informe municipal (hoy, sin producto)

Un PDF por municipio generado con un comando: cuántas fuentes hay, dónde, de qué tipo,
cuáles declaran potabilidad, cuántas ha comprobado alguien, cuáles llevan más de un año
sin que nadie pase, incidencias abiertas, y el inventario en CSV y GeoJSON.

Es **el paso 2 de la escalera de validación** que ya está escrita en `monetizacion.md`
(«enseñar un prototipo o informe preparado manualmente con sus datos») y no exige ni
panel, ni cuentas, ni permisos. Cuesta un comando y abre la puerta: es muy difícil que un
técnico de medio ambiente ignore un correo que le adjunta el inventario georreferenciado
de sus propias fuentes.

### b) La página pública del municipio (casi hecha)

`/places/:slug` ya existe, ya se indexa y ya trae gente. La versión municipal es la misma
página **cortada por el polígono real** en vez de por un radio, con el escudo o el nombre
del ayuntamiento si lo patrocina, y un enlace que ellos puedan poner en su web.

Para el ayuntamiento es comunicación —«el mapa de fuentes del pueblo»— y para FontApp es
tráfico y aportaciones. Es lo más barato de dar y lo que más ilusión hace en una reunión.

### c) La campaña de verificación

Lo que de verdad falta —el estado— lo puede llenar su gente: la brigada en su ruta
habitual, una asociación excursionista, un colegio, o los vecinos. FontApp ya tiene todo
lo que hace falta para eso y no lo tiene nadie más: reseña de un toque, bandeja de salida
sin cobertura, zona guardada, rutas propuestas y gamificación.

Se vende como **campaña con principio y final**: «en seis semanas, sus 87 fuentes
comprobadas», con seguimiento y un informe al cerrar. Es lo que convierte el 0,2 % en un
número presentable, y de paso mejora el mapa público — el cliente que paga trabaja para
todos, que es la mejor forma que tiene esto de sostenerse.

### d) El panel de gestión (lo que el cliente cree que quiere)

Inventario filtrable, frescura, incidencias abiertas con su seguimiento, alertas de
cambio, exportación, histórico. Es lo que sale en cualquier lista de funcionalidades y
es lo último que hay que construir, porque es lo único que **no se puede enseñar hasta
que existe** y lo que más caro sale mantener.

### e) Identidad institucional verificada

Que una reseña o una corrección lleve «Ajuntament de Moià» al lado. Vale para las dos
partes: a ellos les da voz oficial en el sitio donde la gente ya mira, y al mapa le da la
única fuente de estado que no depende de que pase un excursionista.

Es además la pieza que **más cuidado exige**: una firma institucional no puede convertirse
en autoridad sobre el dato ajeno. Firma lo que ella aporta, como todo el mundo.

### f) Sellar el inventario que ya tienen

Muchos ayuntamientos tienen una lista en un Excel, un PDF de 2013 o una capa de su GIS.
Importarla, cruzarla con lo que hay, resolver duplicados y devolvérsela normalizada es un
trabajo con alcance y precio cerrados, y es la vía que menos promete y más se cumple.
`import-geojson`, `dedupe-imported` y `fonts-import-tools.py` ya hacen el 80 %.

### g) Diputaciones y parques naturales, que es donde está el dinero

Un municipio de 3 fuentes no compra nada; una diputación compra para 300 municipios de
golpe, tiene partida y ya coordina cosas así. Lo mismo un parque natural o un consorcio
de agua. **El municipio es la unidad del producto, no necesariamente la del contrato.**

### h) Lo que se descarta de entrada

- **Publicidad** en el mapa o en la ficha. Rompe el principio 1 y el sitio deja de ser lo
  que es.
- **Cobrar por ver** las fuentes de un municipio, o esconder las de quien no paga.
- **Certificar potabilidad.** No la certificamos ni podemos; la app dice quién dijo qué y
  cuándo. Un ayuntamiento puede aportar su analítica como documento, que es justo para lo
  que existe `PhotoKind.document`.
- **Dejar que el pago cambie la verdad del mapa**: ni ocultar una fuente seca, ni subir la
  frescura, ni retirar una incidencia sin resolverla. Principio 3, y es innegociable.
- **Exclusividad territorial.** Los datos son ODbL; prometerla sería mentir.

## 3. Quién compra y cómo compra

- El interlocutor suele ser **medio ambiente, obras o parques y jardines**, no informática.
- En España, un ayuntamiento puede contratar servicios **sin licitación** por debajo del
  umbral del contrato menor (15.000 € sin IVA, LCSP art. 118). Eso **fija el orden de
  magnitud del primer producto**: cualquier cosa por encima entra en un procedimiento que
  dura meses y que un proyecto de una persona no puede sostener. Conviene confirmarlo con
  quien lleve la contratación de cada entidad, porque hay reglas internas más estrictas.
- El calendario manda: los presupuestos se cierran a finales de año y el gasto pequeño
  suele ejecutarse antes de verano — que además es cuando importa saber si una fuente mana.

## 4. La vista, en tres capas

Una sola pantalla no sirve para las tres cosas. Separadas por **quién las mira**:

1. **Pública, sin sesión** (`/places/:slug` municipal): el mapa del pueblo, cuántas
   fuentes hay, cuántas comprobadas y una invitación a contar. No cambia nada de lo que
   hoy ve cualquiera; solo lo agrupa por el municipio real.
2. **De gestión, con sesión** (`/admin/municipio/:ine` o similar): las mismas fuentes con
   lo que un gestor necesita —olvidadas, incidencias abiertas, sin foto, sin potabilidad
   declarada— y exportación. **Solo lectura al principio**: escribir exige decidir qué
   pasa cuando el ayuntamiento y un vecino dicen cosas distintas, y esa decisión no se
   toma antes del primer piloto.
3. **Informe**, que es la capa 2 congelada en un PDF con fecha. Es lo que se enseña en una
   reunión y lo que se archiva en un expediente, y por eso es la más importante de las
   tres aunque sea la menos vistosa.

Lo que la capa 2 tiene que contestar, y en este orden, porque es el orden en que se
trabaja: **qué tengo, qué está roto, qué no sé, y qué ha cambiado desde la última vez.**

## 5. El orden de construcción

1. **Comando `municipal-report <ine>`**: junta lo que ya está en la base y escribe
   JSON + CSV + GeoJSON. Sin PDF todavía. Un día de trabajo y ya se puede llamar a
   alguien.
2. **Tres entrevistas** con entidades de tamaños distintos, informe en la mano. Preguntar
   qué harían con esto, quién lo abriría, cada cuánto, y de qué partida saldría.
3. **La página pública municipal**, que es barata y sirve igual sin cliente: agrupa por
   `municipality_ine` en vez de por radio.
4. **Un piloto**, acotado a un municipio y una temporada, con campaña de verificación. El
   primero puede ser gratis; **el segundo se cobra o no hay producto**.
5. **El panel**, solo si de los pasos 2 y 4 sale que hace falta y que alguien lo pagaría.

## 6. Qué falta en los datos antes de prometer nada

- **Fuera de España no hay municipio.** `populate-municipalities` usa los recintos del
  IGN, así que Portugal, Francia, Italia, Andorra y Chile están a nulo. Es la mitad del
  mapa y el producto no existe allí hasta que haya límites equivalentes.
- **Siete nombres de municipio comparten nombre con otro de INE distinto** en la base
  actual: el código INE es la clave y el nombre es solo el rótulo, igual que pasa con
  `fonts.country` y Natural Earth.
- **26 fuentes españolas se quedaron sin municipio** (52.310 de 52.336). Son bordes y
  costa; hay que decir «no clasificada» y no colgarla del municipio de al lado.
- **`region` contradice al municipio en 502 de 52.463 fuentes** (medido). Los dos primeros
  dígitos del código INE **son la provincia**, así que se puede comprobar sin ningún dato
  nuevo: «Arnes, INE 43018» es Tarragona y la columna dice «Teruel». Es el error conocido
  de los polígonos de Natural Earth, y ahora que el municipio sale en la ficha se ve.
  Arreglarlo con una tabla de 52 provincias es barato y **mejora `/zones` y el ranking a
  la vez**; hacerlo es requisito para poner una demarcación en un informe que firma un
  ayuntamiento. Mientras tanto, la ficha calla la demarcación cuando hay municipio.
- **El estado está casi vacío**, que es el punto 1 de este documento y la razón de que el
  primer producto sea el inventario y la campaña, y no el cuadro de mandos.

## 7. Cómo sabremos si esto funciona

- Reuniones conseguidas por informe enviado. Si un inventario georreferenciado gratis no
  abre una puerta, un panel tampoco la va a abrir.
- Que en la entrevista aparezca **una partida** y un nombre de quien firma, no solo
  interés.
- En un piloto: fuentes comprobadas por semana, cuánta gente distinta participa, y cuántas
  siguen frescas **tres meses después** de terminar la campaña. Lo tercero es lo que
  distingue un servicio de un fuego artificial.
- Y la pregunta que hay que hacerse en voz alta cada vez: **¿esto mejora el mapa para
  todos?** Si una vía de ingreso no deja el mapa mejor que antes, es la vía equivocada
  para este proyecto.
