# Gamificación de FontApp

> Documento de trabajo · agosto de 2026
> Versión en catalán al final: [Pla de gamificació](#pla-de-gamificació-ca)

## Pagar por información, no por actividad

Un plan de gamificación para una base de datos que ya tiene decenas de miles de fuentes
y casi ningún dato humano dentro. El diseño entero sale de esa asimetría.

---

## 1. De dónde partimos

Muestra aleatoria de **49 fuentes reales de producción** en la Catalunya central,
consultadas una a una contra la API el 16 de agosto de 2026:

| Campo | Cobertura |
|---|---|
| Con fotografía | **0 / 49 — 0 %** |
| Con descripción escrita por alguien | 2 / 49 — 4 % |
| Con potabilidad indicada | 4 / 49 — 8 % |
| Creadas por un usuario | 0 / 49 |
| Con región asignada | 49 / 49 — 100 % |

Y las dos «descripciones escritas» de la muestra decían las dos `Manantial (OpenStreetMap)`,
generadas por el importador. En la práctica, **cero contenido humano**.

Esto no es un fracaso: es el resultado esperado de haber importado OSM y el WFS de la ACA.
Pero cambia radicalmente qué tiene que comprar la gamificación. No hace falta más cobertura
geográfica — hay de sobra. Hace falta **la capa que ningún importador puede dar**: si sale
agua hoy, si se puede beber, qué cara tiene, y dónde está exactamente.

La buena noticia es la última cifra: `fonts.region` ya está poblada en producción. Las
clasificaciones por zona se pueden hacer desde el primer día sin trabajo previo.

> **Detalle que salía en la primera tabla de clasificación:** las regiones venían con el
> exónimo castellano y a nivel de provincia — la muestra daba `Barcelona` y `Gerona`, no
> «Girona» ni «Catalunya». En una app con el catalán por defecto, «Gerona» en una cabecera
> se ve. **Resuelto antes de publicar la fase 5**, que es el momento en que había que
> hacerlo: se migraron los nombres a catalán en producción. Cambiarlos después habría sido
> migrar datos ya publicados.

---

## 2. El principio

> Los puntos se pagan por el **valor informativo marginal** de la aportación, no por el
> esfuerzo ni por el número de acciones.
>
> Una reseña de una fuente que nadie ha visitado en un año vale mucho. La misma reseña, de
> la misma fuente, tres días después de que otro haya pasado, no vale casi nada — porque no
> dice nada que no supiéramos.

Casi toda la gamificación que se ve por ahí fuera paga por actividad: tantos puntos por
comentario, tantos por foto. Eso funciona cuando lo que quieres es volumen. Aquí el volumen
ya lo tienes y el problema es otro — tienes *una foto por cada mil fuentes*. Pagar plano por
reseña haría que la gente reseñara las cuatro fuentes de su pueblo una vez por semana, que
es exactamente lo que no necesitas.

Tres corolarios que atraviesan todo el documento:

- **La frescura es la mercancía.** «¿Hay agua?» es una pregunta sobre hoy, no sobre 2024.
- **El hueco vale más que lo lleno.** El primero de cualquier cosa —foto, estado,
  potabilidad— cobra prima.
- **Nada se cobra si no es comprobable.** Sin GPS cerca o sin que nadie lo confirme, los
  puntos quedan pendientes.

---

## 3. La moneda: gotas

**Gotas** (CA *gotes*, EN *drops*). Una sola moneda, sin mercados ni monedas premium. Se
ganan colaborando y no se gastan en nada: son un marcador de contribución, no una economía.

Los valores de abajo son la escala relativa, que es la única parte que importa. Los números
absolutos se pueden reescalar el día que se quiera.

### Baremo base

| Aportación | Por qué vale lo que vale | Gotas |
|---|---|---:|
| **Primera foto** de una fuente que no tenía | Es el hueco más grande que hay, y es irrepetible: solo se puede hacer una vez por fuente. | 120 |
| **Fuente nueva** que no existía | Amplía el mapa. Alto, pero no el más alto: ya hay decenas de miles de fuentes y ninguna foto. | 100 |
| **Primera reseña** de una fuente nunca visitada | Convierte un punto importado en una fuente verificada por una persona. | 80 |
| **Reubicar** una fuente (aceptada) | Bajo arbolado el GPS se va decenas de metros; una fuente mal situada no se encuentra. | 60 |
| **Reseña de actualización** | Escalada por antigüedad de la última — ver la curva de frescura. | 5–70 |
| **Completar la ficha** (potabilidad, tipo, descripción real) | Por campo que pasa de vacío a lleno. No se paga dos veces el mismo campo. | 25 |
| **Incidencia** (fuente seca, rota, desaparecida) | Una noticia negativa es tan útil como una positiva, y nadie la da por gusto. | 40 |
| **Confirmar** la reseña de otro | Barato de hacer y barato de pagar, pero convierte un testimonio en dos. | 10 |
| **Sustituir una foto** existente por una mejor | Mejora marginal, y tiene riesgo de guerra de ediciones. | 15 |
| Guardar una fuente en favoritos | Es para ti, no para el común. No se paga. | 0 |
| Registrarse, abrir la app, tener racha | No aporta ningún dato. No se paga. | 0 |

### Multiplicadores

Se aplican sobre el baremo base y se pueden acumular hasta un techo de **×2,16**.

| Condición | Razón | Factor |
|---|---|---:|
| Fuente a >20 km de cualquier fuente reseñada | Los desiertos de datos no se cubren solos; alguien tiene que ir expresamente. | ×1,25 |
| Estado del agua en julio o agosto | Es cuando las fuentes se secan y cuando más gente las busca. | ×1,15 |
| Fuente marcada como «dudosa» por una incidencia abierta | Dirige a la gente hacia lo que está en disputa. | ×1,5 |
| La fuente ya tiene 3+ reseñas frescas | Reducir, no premiar: no hace falta un cuarto testimonio de la misma semana. | ×0,2 |

**Los dos primeros se recortaron después de medirlos, y esa es la lección de la fase 1.**
Con >10 km y ×1,5, el desierto saltaba en el **46 %** de las aportaciones: en comarca rural,
diez kilómetros sin una fuente reseñada es lo normal, no la excepción. Con junio–septiembre
y ×1,4, el estiaje saltaba en el **79 %** de los estados de agua, porque cuatro meses de
verano cubren casi toda la actividad de una app en la que se sale a caminar.

Un multiplicador que se aplica a cuatro de cada cinco aportaciones no es un multiplicador:
es el baremo base disfrazado, con la desventaja de que nadie entiende por qué su reseña
vale 112 en vez de 80. Un bonus solo significa algo si **la mayoría de las veces no está**.
Hay un test (`testCircumstanceMultipliersStayModest`) que impide que vuelvan a crecer sin
que alguien lo decida a propósito.

> Un candidato mejor que cualquiera de los dos sería la **altitud** (>1 500 m): es objetivo,
> correlaciona con esfuerzo real y —lo importante— dispara poco. Está pendiente de tener una
> fuente de datos de elevación; no se puede calcular con lo que hay guardado hoy.

---

## 4. La curva de frescura

El núcleo del sistema. Una reseña de actualización vale en función del tiempo transcurrido
desde la última: cuanto más olvidada esté la fuente, más vale volver.

| Días desde la última reseña | Gotas |
|---|---:|
| 0 – 7 | 5 |
| 8 – 30 | 15 |
| 31 – 90 | 35 |
| 91 – 180 | 50 |
| 181 – 365 | 60 |
| > 365 (o nunca) | 70 |

La curva es plana en los extremos a propósito. A la izquierda, para no pagar el pisoteo
repetido de un mismo grupo de habituales. A la derecha, porque a partir del año el dato está
igual de caducado tanto si hace trece meses como si hace cuarenta.

El mismo reloj alimenta un **indicador de frescura** en la ficha de cada fuente —verificada
esta semana / este mes / hace tiempo / nunca— que es útil por sí solo, aunque nadie mire
nunca los puntos. Esta es la prueba de si la gamificación está bien planteada: **las señales
que genera tienen que servir a quien pasa de ella.**

---

## 5. Verificación: qué cuenta como «he estado allí»

La app ya tiene la posición continua y el filtro anti-temblor. Una reseña hecha **a menos de
100 m de la fuente** se marca como *verificada in situ* y cobra entera; hecha desde casa,
cobra un tercio y no cuenta para las insignias de campo.

No es una barrera antifraude perfecta —el GPS se puede falsear— y no hace falta que lo sea.
Es una distinción honesta entre «he ido» y «lo he oído decir», que es información que el
lector quiere ver igualmente.

Si el permiso de posición no está dado, no se pide: la reseña se acepta sin el sello. Vale
más perder el sello que lanzar un diálogo de permisos a bocajarro, que es el criterio que ya
sigue el mapa al abrirse.

---

## 6. Insignias

Las familias apuntan a huecos reales de los datos. Dentro de cada familia hay
tres escalones: bronce · plata · oro. Los umbrales son para calibrar con datos reales; los de
aquí son el punto de partida.

> **Nombres en masculino genérico.** Empezaron escritos en femenino sin que nadie lo
> decidiera a propósito — quedó así por inercia de cómo se fue redactando la primera
> insignia, y las siguientes copiaron el género. Se pasaron a la forma masculina genérica
> del castellano y el catalán (Descubridor, Cartógrafo, Pionero); Centinela y el resto ya
> eran epicenos y no cambian. En euskera e inglés no hacía falta tocar nada: ninguno de los
> dos marca género en estos sustantivos.
>
> **Pendiente de decidir, no implementado:** un desplegable de sexo/género en el perfil que
> adapte el nombre de la insignia a quien la gana, en vez de un genérico fijo para todos. Es
> más trabajo del que parece — no son dos formas, son cinco idiomas × la insignia, y euskera
> no tiene el problema que se le pediría resolver. Se deja anotado aquí para no perder la
> idea, no para hacerlo ya.

| Familia | Qué mide | Umbrales | Nota |
|---|---|---|---|
| **Descubridor** | Fuentes nuevas que no existían en el mapa | 10 · 50 · 200 | Oro: también hace falta que 20 hayan sido confirmadas por otro |
| **Primera luz** | Primeras fotos de fuentes que no tenían ninguna | 5 · 25 · 100 | Es la insignia que ataca el 0 % |
| **Centinela** | Reseñas de actualización sobre fuentes olvidadas desde hace 6 meses o más | 15 · 60 · 250 | Solo cuentan las verificadas in situ |
| **Cartógrafo** | Reubicaciones y correcciones de ficha que sobreviven sin ser revertidas | 10 · 40 · 150 | Una reversión resta; es la única insignia que puede bajar |
| **Comarcas** | Fuentes aportadas en zonas administrativas distintas | 3 · 8 · 20 regiones | Recompensa moverse, no acumular en el mismo pueblo |
| **Estiaje** | Estados de agua registrados en plena sequía, entre junio y septiembre | 10 · 40 · 120 | Se reinicia cada verano: es estacional a propósito |
| **Las cuatro estaciones** | Fuentes que has reseñado en las cuatro estaciones | 1 · 3 · 10 fuentes | Umbrales bajos porque el precio lo pone el calendario |
| **Vigía** | Incidencias comunicadas | 3 · 15 · 50 | Premia dar malas noticias útiles |
| **Lejanía** | Aportaciones en zonas remotas | 10 · 40 · 150 | Usa el multiplicador de desierto |
| **Sin cobertura** | Aportaciones creadas desde la bandeja offline | 1 · 10 · 40 | No añade gotas extra |
| **Guardián local** | Fuentes distintas cuya última reseña reciente es tuya | 5 · 20 · 75 | Mide mantenimiento, no volumen |
| **Agua recuperada** | Fuentes distintas que confirmas `flowing` después de `dry` | 1 · 5 · 20 | Los dos estados deben estar liquidados |
| **Ruta de fuentes** | Jornadas con al menos tres fuentes distintas reseñadas | 3 · 10 · 30 rutas | Repetir una fuente no infla la ruta |
| **Verificador** | Confirmaciones independientes de reseñas ajenas | 10 · 50 · 200 | No cuentan autoconfirmaciones |
| **Fuente rescatada** | Fuentes completas a las que aportaste un dato que faltaba | 5 · 20 · 75 | Foto, descripción, tipo y potabilidad |
| **Explorador internacional** | Países distintos con aportaciones liquidadas | 2 · 5 · 10 países | Cada país cuenta una vez |
| **Constancia** | Días UTC distintos con aportaciones liquidadas | 7 · 30 · 100 días | Un día intenso sigue siendo un día |
| **Reencuentro** | Reseñas tras más de un año sin actualizaciones | 1 · 10 · 40 | Exige una actualización anterior |
| **Trabajo en equipo** | Fuentes ajenas atendidas durante sus primeros 30 días | 5 · 25 · 100 | Cada fuente cuenta una vez |
| **Incidencia resuelta** | Incidencias propias seguidas de un estado `flowing` | 1 · 5 · 20 | La recuperación debe estar liquidada |

**Las cuatro estaciones es la mejor insignia del conjunto y la única que no se puede
acelerar.** Cuesta doce meses reales pase lo que pase: ni aportando más, ni saliendo más
lejos, ni dedicándole un fin de semana entero. Y premia exactamente lo que la curva de
frescura quiere —volver a la misma fuente cuando ha pasado tiempo— en vez de premiar el
volumen, que es lo que premian casi todas las demás.

Es por fuente y no por persona: cuatro visitas a cuatro sitios distintos, una por estación,
no la consiguen. Se cuenta sobre la fecha en que ocurrió la reseña y no sobre la de
liquidación, o una reseña del 20 de marzo liquidada el 23 cambiaría de estación sola.

### Insignia de un solo tiro

- **Pionero** — la primera persona que reseña una fuente importada. Una vez por fuente, para
  siempre; queda escrito en la ficha.

Ninguna insignia por registrarse, por abrir la app ni por completar el perfil. Regalarlas al
principio para que «enganchen» enseña que no valen nada.

---

## 7. Niveles, y a dónde llevan

Diez niveles con nombres del vocabulario del agua: **la misma agua haciéndose más grande**,
de una gota al acuífero que alimenta todas las fuentes del mapa. Lo que los hace valer algo
no es el nombre: es que **abren capacidades reales de mantenimiento** del mapa. La
gamificación es, a la vez, la *vía de entrada a la moderación* — que es la pieza que el
proyecto ya tiene pendiente con el modelo de administradores por zona.

| # | Nivel | Gotas | Qué desbloquea |
|---:|---|---:|---|
| 1 | Gota | 0 | Aportar: fuentes, reseñas, fotos, incidencias. |
| 2 | Manantial | 100 | — (el primer ascenso llega en una o dos aportaciones, para que se vea que existe) |
| 3 | Arroyo | 350 | Confirmar reseñas ajenas. Proponer duplicados para fusionar. |
| 4 | Torrente | 800 | — |
| 5 | Riachuelo | 1 700 | Reubicar fuentes que no has creado sin pasar por revisión. |
| 6 | Río | 3 500 | — |
| 7 | Cascada | 7 000 | Marcar fuentes como desaparecidas. Las ediciones no hacen cola. |
| 8 | Embalse | 14 000 | — |
| 9 | Lago | 28 000 | — |
| 10 | Acuífero | 60 000 | Candidatura a moderar su región, a propuesta de un admin. |

Eran cinco y se llegaba al tercero en una semana: medido sobre el usuario más activo,
2 853 gotas y nivel 3 de 5 con 31 aportaciones. Un nivel alto alcanzado pronto deja de
motivar, y con la escalera corta el resto del recorrido era una recta sin nada.

Los cortes **doblan de peldaño en peldaño** a partir del tercero. Un factor constante hace
que subir cueste siempre «el doble de lo que llevas», que es la única forma de que el
escalón 9 signifique para quien está ahí lo mismo que el 3 para quien está abajo. Los dos
primeros van más juntos a propósito.

No todos los peldaños abren algo, y está bien: si cada nivel desbloqueara una capacidad,
o hay diez capacidades que repartir —no las hay— o se acaban inventando permisos de
adorno. Los intermedios son ritmo.

> **El nivel viaja como clave, no como nombre.** El backend manda `river` y el rótulo lo
> traduce el navegador. Cada idioma usa **su** palabra para la ranura, no una traducción
> del castellano: la ranura *stream* es `Riera` en catalán y `Regato` en gallego. Durante
> la fase 3 se mandaba el nombre ya hecho y un usuario con la app en euskera leía «Arroyo».

> **Los permisos que abren los niveles son permisos de verdad.** Ninguno de ellos se debe
> poder conseguir solo acumulando acciones baratas: todas las puertas de arriba exigen
> también un mínimo de aportaciones *verificadas in situ* y ninguna reversión reciente. Si
> no, el camino a «marcar fuentes como desaparecidas» es confirmar trescientas reseñas desde
> el sofá.

---

## 8. Misiones: convertir el hueco en un paseo

La pieza con más recorrido de todo el plan, y la que mejor aprovecha lo que la app ya hace
bien. El mapa sabe dónde estás y sabe qué fuentes de alrededor están vacías. Con eso se puede
proponer una **ruta**, no una tarea.

- **Ruta ciega** (semanal) — «Seis fuentes sin ninguna foto en 4 km a tu alrededor.» Se
  dibuja en el mapa y se va tachando. Ataca directamente el 0 % de fotos, y es una excusa
  para salir a caminar, que es lo que la gente ya hace con la app.
- **Ronda de verano** (estacional) — «Cinco fuentes que nadie comprueba desde abril.» Sale en
  junio y se cierra en septiembre. Es cuando la información caduca más rápido y cuando más se
  consulta.
- **Reto de comarca** (colectivo) — «El Moianès está al 12 % de fuentes con foto. ¿Llegamos
  al 25 % antes de Navidad?» No compite nadie contra nadie: la barra es de todos. Es la única
  forma de participar que no excluye a quien no quiere jugar.

Las misiones se generan solas con consultas que ya existen —proximidad por bounding box y
haversine, y el filtro por zona— y caducan. Una misión que no caduca es una lista de tareas, y
una lista de tareas da pereza.

---

## 9. La mitad que no compite

A mucha gente los rankings le dan reparo, y en una app de colaboración ciudadana espantarlos
sale carísimo. Todo el sistema tiene que tener una lectura no competitiva:

- **Impacto personal** — «tus fotos se han visto 1 240 veces», «mantienes 12 fuentes al día».
  Es más motivador que un puesto en una tabla, y es cierto.
- **Cobertura por zona** — barras de progreso por comarca. La unidad es el territorio, no la
  persona.
- **Rankings mensuales y regionales**, nunca globales de todos los tiempos. Un ranking
  histórico global lo gana para siempre quien llegó primero y vive donde hay densidad; nadie
  más juega.
- **Salirse** — un interruptor en el perfil que oculta puntos, niveles y tablas sin dejar de
  contar las aportaciones. Quien lo activa sigue saliendo en las barras colectivas.

El resumen semanal por correo ya existe y es el canal natural: «esta semana tu pueblo ha
pasado del 12 % al 15 % de fuentes con foto» es mejor correo que «has hecho 340 puntos».

---

## 10. Contra el fraude

Poner puntos sobre un mapa abierto invita a inflarlo. El proyecto ya tiene límites por IP,
denuncias y roles; falta atarles los puntos.

- **Las gotas no se cobran al momento: se liquidan a las 72 horas.** Es la pieza central. Si
  en esa ventana la aportación se revierte, se denuncia o se borra, no llega a pagar nunca.
  Evita el grueso del problema sin tener que detectar nada.
- **No te puedes confirmar a ti misma**, ni confirmar dos veces la misma fuente, ni confirmar
  reseñas de quien confirma las tuyas por encima de un umbral.
- **Rendimientos decrecientes por fuente**: la segunda aportación tuya a la misma fuente en un
  mes vale una fracción.
- **Techo de 4 000 gotas por persona y día de aportación**; lo que se pasa no cobra. El
  número sale de los datos: la mejor jornada real medida son 1 256 gotas en 8 aportaciones,
  así que deja tres veces ese margen. Se cuenta por el día en que se aportó y no por el día
  en que se cobra, porque un techo que se puede agotar y esperar a mañana no disuade de nada
  —el guion también sabe esperar— y porque con el día de cobro el volcado del histórico se
  estrangula solo (medido: 109 de 274 aportaciones se quedaban haciendo cola).
- **Una foto retirada resta** lo que cobró. Sin esto, subir basura sale gratis.
- Los límites por hora que ya hay —10 imágenes, 30 fuentes, 40 reseñas— son el suelo. La
  gamificación no los debe tocar.

---

## 11. Qué no haría

Vale la pena dejarlo escrito, porque son cosas que aparecen solas en la segunda reunión.

**Rachas diarias.** Una racha premia aparecer, no aportar. En una app que depende de salir a
caminar, la racha diaria empuja a inventarse una reseña un martes por la noche para no
perderla — ruido pagado con tus propios puntos. Si se quiere cadencia, que sea **mensual** y
que solo cuente si el mes trae alguna aportación verificada in situ.

**Ranking global de todos los tiempos.** Lo gana quien llegó primero y vive en una zona densa,
y se queda congelado. Mensual y por región se puede ganar, y por tanto se juega.

**Puntos por reseñar sin haber ido.** Barato de hacer y sin valor informativo. Se puede dejar
escribir —no toda reseña hecha de memoria es falsa— pero cobrando un tercio y sin sello de
verificación.

**Monedas, tiendas, cosméticos.** Añade una economía entera que mantener a cambio de nada. La
recompensa aquí es que el mapa de tu pueblo esté bien y que se sepa quién lo ha puesto.

**Insignias por registrarse o completar el perfil.** Enseña el primer día que las insignias se
regalan. Después ninguna significa ya nada.

---

## 12. Cómo desplegarlo

El orden importa porque hay una oportunidad que solo se tiene una vez: **todo el historial se
puede puntuar hacia atrás**. Las tablas de ahora ya guardan quién, qué y cuándo — fuentes con
`created_by` y `created_at`, reseñas, confirmaciones, incidencias, ediciones con su antes y
después. El día que se abra, nadie empieza en cero.

**Fase 1 — Calculadora, sin escribir nada.** ✅ *Implementada:*
`swift run App score-contributions`. Recorre el historial y escupe puntos e insignias por
usuario. Nada en la interfaz, ninguna tabla nueva. Sirve para **calibrar el baremo con datos
reales** antes de comprometerse con ningún número, y contesta la pregunta que decide todo lo
demás: ¿cuánta gente tendría algo el día 1?

**Fase 2 — Registro de eventos y liquidación.** ✅ *Implementada:*
`swift run App gamification-sync`. Tabla `contribution_events` con su estado —pendiente,
liquidada, anulada— y la ventana de 72 horas. Fuente única de verdad; los puntos son la suma
de lo liquidado. Ver el apéndice de abajo.

**Fase 3 — Visible en el perfil, y nada más.** ✅ *Implementada:* `GET /gamification/me` y la
tarjeta en `/me`. Gotas, nivel, insignias e impacto personal. Sin rankings todavía. Una
semana así enseña si la gente lo entiende sin explicaciones. El interruptor para ocultarlo
está debajo de la tarjeta.

**Fase 4 — Frescura en la ficha y misiones en el mapa.** ✅ *Implementada:* el chip de
frescura bajo el nombre de cada fuente y el panel de rutas (`GET /missions`) desde el botón
de rutas del mapa. La frescura es útil aunque la gamificación se cancele: se hizo primero
por eso.

**Fase 5 — Zona: barras colectivas y ranking mensual.** ✅ *Implementada:* `GET /zones` y
`GET /zones/ranking`, la página `/zones` y el bloque de cobertura en el resumen semanal.
El nombre de las regiones ya está resuelto: se pasaron a catalán en producción («Gerona» →
«Girona», «Lérida» → «Lleida»). Ver el apéndice de abajo.

**Fase 6 — Niveles con permisos.** ✅ *Implementada, y apagada por defecto:*
`Capabilities` + `GAMIFICATION_CAPABILITIES`. El último a propósito: dar permisos
automáticos antes de ver cómo se comporta la gente es como se rompe un mapa abierto — así
que hacen falta **dos decisiones explícitas** para que exista alguna capacidad. Se abre una
sola, la reubicación. Ver el apéndice de abajo.

---

## 13. Decisiones pendientes

- ~~**Nombres de región.**~~ **Resuelto:** provincia en catalán. Se migraron en producción con
  un `UPDATE` («Gerona» → «Girona», «Lérida» → «Lleida»; Barcelona y Tarragona ya coincidían).
  Ojo: `populate-regions` lee los nombres del GeoJSON de fronteras, así que volver a pasarlo
  con un fichero que traiga los exónimos castellanos **deshace la migración** y parte cada
  zona en dos filas del ranking. Antes de reejecutarlo, comprobar qué trae el dataset.
- ~~**Hasta dónde llega el seudónimo.**~~ **Resuelto para la tabla del mes:** sale el
  `@username`, que es lo mismo que ya firma cada reseña en la ficha de una fuente — la tabla
  dice estrictamente *menos*, porque agrupa por comarca en vez de decir en qué fuente exacta
  estuviste. Y `gamification_opt_out` saca de la tabla sin dejar de contar en las barras.
- **Hasta dónde llega el seudónimo (lo que queda).** Un ranking público enseña quién aporta y desde dónde. Ya
  existen `name_public` y `email_public`; hará falta el equivalente para los puntos, y decidir
  el valor por defecto.
- **Los 100 m de verificación.** ¿Son suficientes bajo arbolado, donde el GPS se va? Quizá
  valen más 150.
- **Si se hace algo.** La fase 1 no es irreversible: da los números para decidir con datos y no
  compromete nada.

---

## Apéndice: la calculadora (fase 1)

```bash
swift run App score-contributions                 # tabla de todos los usuarios
swift run App score-contributions --user miguel   # desglose de una persona
swift run App score-contributions --detail        # cada aportación, línea a línea
swift run App score-contributions --json          # para volcarlo a una hoja de cálculo
```

Es **solo lectura**: no escribe nada en la base de datos, ni siquiera con `--detail`. Se puede
lanzar contra producción sin miedo.

Lo que el comando **no puede saber, y por qué**:

- **Quién puso la foto de una fuente.** `fonts.image` no guarda autor. Se atribuye a la reseña
  con foto más antigua de esa fuente, y a las ediciones que cambiaron el campo `image`
  (`FontInfoSnapshot` sí lo guarda). Las fotos puestas antes de que el snapshot llevara
  `image` quedan sin dueño y no las cobra nadie.
- **Si una reseña se hizo en la fuente o desde casa.** No se guarda la posición del autor al
  reseñar. El comando lo asume todo como no verificado, así que el multiplicador de
  verificación no se aplica en la fase 1 y las cifras salen **conservadoras**.
- **Si una edición fue revertida.** Se detecta por el historial de `FontEdit`, pero solo
  aproximadamente: se cuenta como revertida la edición cuya siguiente edición sobre la misma
  fuente devuelve el valor anterior.

Parte de eso lo arregla la fase 2. Los números de la fase 1 son para calibrar, no para
publicar.

---

## Apéndice: el registro (fase 2)

```bash
swift run App gamification-sync              # registra lo nuevo y liquida lo maduro
swift run App gamification-sync --dry-run    # dice qué haría, sin escribir nada
swift run App gamification-sync --user marc  # además, el marcador de una persona
```

Pensado para un cron frecuente (cada 15 min o cada hora). Es **idempotente**: pasarlo dos
veces seguidas no cambia nada la segunda vez, así que no pasa nada si se solapa con otra
ejecución o si se lanza de más.

### Tres decisiones que conviene entender

**Las gotas quedan congeladas.** `gotes` se guarda con el valor que tenía el baremo el día
que se registró la aportación. Si mañana se decide que una primera foto vale 150, quien la
puso ayer no ve cambiar su marcador de golpe — que es exactamente lo que erosiona la
confianza en un sistema de puntos. Para reescalar el histórico a propósito hay que vaciar la
tabla y volver a sincronizar; es una decisión consciente, no un efecto secundario.

**Se sincroniza, no se escribe desde los controladores.** Sería más inmediato registrar el
evento dentro del `create` de cada controlador, pero eso mete la gamificación en el camino
crítico de guardar una fuente: si el registro falla o tarda, el usuario pierde su aportación
por culpa de un contador. Un barrido periódico no puede romper nada aguas arriba y se puede
volver a pasar entero. El precio es que una aportación tarda hasta un ciclo en aparecer, y
con una ventana de liquidación de 72 horas ese retraso no lo nota nadie.

**Nada se borra, se anula.** Una aportación que desaparece o que se denuncia pasa a `void`
con el motivo escrito, y la fila se queda. Un registro del que se borran filas no sirve para
auditar nada, que es la mitad de su razón de ser.

### Estados

| Estado | Qué significa |
|---|---|
| `pending` | Dentro de la ventana de 72 h. Se enseña como «en camino», no suma al marcador. |
| `settled` | Cobrada. La suma de estas es la puntuación. |
| `void` | Anulada, con motivo: revertida, borrada, denunciada, o por encima del techo diario. |

---

## Apéndice: frescura y rutas (fase 4)

### El chip de frescura

Bajo el nombre de cada fuente, siempre visible: «comprobada esta semana / este mes / hace
tiempo que nadie pasa / **nadie la ha comprobado nunca**». Los cortes son los mismos que usa
la curva del baremo (7 y 30 días), para que lo que el usuario ve y lo que el sistema paga
cuenten la misma historia.

Hasta ahora solo había un aviso cuando el estado pasaba de 30 días. El caso mayoritario —las
fuentes importadas que nadie ha comprobado— no decía nada, y un hueco en blanco se lee como
«no hay problema», que es lo contrario de lo que sabemos.

«Nunca» va en gris y no en rojo a propósito: no es un fallo de la fuente, es una tarea
pendiente nuestra, y pintar de rojo media Catalunya convierte el mapa en una alarma que se
deja de mirar.

### Las rutas (`GET /missions?lat=&long=&km=`)

Lectura pública con límite de 120/h, como `/activity`: son datos de fuentes que ya se ven
uno a uno; lo que aporta esto es el orden.

Devuelve dos rutas de hasta **6 paradas** en **4 km** por defecto:

- **Ruta ciega** — fuentes sin ninguna foto. Ataca directamente el 0 % medido.
- **Ronda de comprobación** — fuentes con foto que nadie mira desde hace más de 6 meses.

No se solapan: una parada que ya sale en la ruta ciega no se repite en la ronda. Repetirla
haría que ninguna de las dos pareciera seria.

**Las paradas van por distancia, no por lo que valen.** Es la decisión que hace que esto sea
una ruta y no una lista de tareas: ordenadas por puntos, la primera está a 300 m y la
segunda a 3 km, y nadie la hace. Por lo mismo son 6 y no 20, y 4 km y no 15: una vuelta que
no cabe en una tarde no se empieza.

En la interfaz es un botón de rutas en la columna del mapa (no una brújula: ya hay una para
volver al norte) que abre un panel. Tocar una parada centra el mapa en ella; el chevron abre
su ficha. La posición solo se pide sola si el permiso ya estaba dado, igual que hace el mapa
al abrirse.

### Recuento en segundo plano (`GAMIFICATION_WORKER=true`)

Con el cron solo, una aportación tarda hasta un ciclo en aparecer. Con el trabajador
activado tarda **unos segundos**, y sin que ningún controlador sepa que la gamificación
existe.

La forma obvia de conseguirlo sería llamar al contador desde el `create` de cada
controlador. Eso hace dos cosas malas: mete la gamificación en el camino crítico de guardar
una fuente —si el contador falla o tarda, el usuario pierde su aportación por culpa de un
marcador— y ensucia seis controladores con una responsabilidad que no es suya.

En vez de eso la gamificación **se suscribe** a los cambios con un middleware de modelo de
Fluent. Lo único que ocurre dentro de la petición es marcar un booleano en memoria; medido,
crear una fuente sigue tardando 39 ms. El recuento lo hace después un bucle en segundo
plano: mira cada 20 s si hay algo nuevo, y si no lo hay no hace nada. Cada media hora pasa
igualmente, porque la liquidación de las 72 h ocurre por el paso del tiempo y no porque
alguien aporte.

Añadir un modelo puntuable es una línea en `GamificationWorker.start`. El middleware no
mira *qué* cambió: decidir si algo puntúa es trabajo de `ContributionScore`, y duplicar aquí
ese criterio sería garantizar que los dos se desincronizan.

Con varias instancias, cada una tendría su bucle. El barrido es idempotente, así que
solaparse no corrompe nada, pero sería recorrer el historial dos veces cada pocos minutos —
y eso sí se nota. Por eso se toma antes un cerrojo de Postgres (`pg_try_advisory_lock`): la
que no lo consigue se va sin hacer nada.

El cron sigue valiendo y no estorba: son el mismo código.

### La fecha de corte (`GAMIFICATION_EPOCH`)

Mientras se calibra el baremo hace falta poder recalcularlo todo. Eso es aceptable con
cuatro usuarios y deja de serlo en cuanto alguien se ha fijado en su marcador: ver que tus
puntos bajan de un día para otro sin haber hecho nada es la forma más rápida de que a nadie
le importen.

`GAMIFICATION_EPOCH=AAAA-MM-DD` marca la línea:

- **Antes**, todo es provisional. `gamification-sync --rescore` borra y reconstruye con el
  baremo de hoy.
- **A partir de la fecha**, intocable. `--rescore` se niega a borrarlo y lo dice.

Sin definir, todo es provisional — que es el estado correcto hasta que se decida.

Cuidado con lo que **no** congela: si una reseña se borra o se denuncia, su aportación se
anula igual, esté al lado que esté de la línea. La fecha protege del baremo, no de que el
contenido desaparezca. Es la distinción que hace que la promesa sea sostenible: «tus puntos
no cambian porque cambiemos de idea» sí; «tus puntos no cambian nunca» no, porque entonces
borrar una reseña saldría gratis.

```bash
swift run App gamification-sync --rescore          # pregunta antes
swift run App gamification-sync --rescore --yes
```

---

## Apéndice: el perfil (fase 3)

`GET /gamification/me` (token propio) y la tarjeta en `/me`. No hay endpoint para ver los
puntos de otra persona: mientras no haya rankings no hace falta, y no publicar lo que no
hace falta evita decidir hoy cuánto de esto es público, que es una de las decisiones
pendientes.

**El orden de lectura está elegido.** Primero el impacto sobre el mapa, después los puntos.
«17 fuentes tienen foto gracias a ti» dice algo verdadero del mundo; «11.124 gotas» solo
dice algo del contador. Quien no quiera jugar se queda con lo primero y no ha perdido nada.

Las tres cifras de impacto son sobre el mapa, no sobre la persona: fuentes con foto gracias
a ti, fuentes que mantienes al día (aquellas cuya reseña más reciente es tuya y tiene menos
de 6 meses) y fuentes que has puesto en el mapa. La segunda es la que mejor describe a un
colaborador habitual, y no se puede inflar reseñando mucho la misma tarde.

**No se pinta nada** si el usuario la tiene apagada (204) ni si todavía no ha aportado nada:
un marcador a cero el primer día no motiva, avisa de que vas último.

**Solo cuenta lo liquidado.** Lo pendiente sale aparte, como «N en camino» con su
explicación. Enseñar una insignia que luego se retira porque la aportación se anuló es peor
que no enseñarla.

Mientras no haya fecha de corte, la tarjeta avisa de que las cifras pueden cambiar.

### El interruptor

`users.gamification_opt_out`, apagado por defecto —visible— porque una función que nadie
descubre no sirve de nada. Quien lo enciende deja de ver marcador, nivel e insignias, pero
**sus aportaciones se siguen contando** y seguirá sumando a las barras colectivas por
comarca, que son del territorio y no de nadie.

Vive **debajo** de la tarjeta y fuera de ella: «ocultar las gotas» antes de haber visto
ninguna no significa nada, y si estuviera dentro, apagarlo escondería también la forma de
volver a encenderlo.

### Por qué la sincronización no duplica

Cada aportación tiene una identidad estable —tabla de origen, fila y, cuando una misma fila
genera varias (una edición que completa tres campos), cuál de ellas— con un índice único
detrás. `detail` va `NOT NULL` con defecto `''` a propósito: en Postgres dos `NULL` se
consideran distintos, así que con una columna nullable el índice único no habría impedido
nada.

---

## Apéndice: las zonas (fase 5)

`GET /zones` (cobertura de todas las zonas), `GET /zones/ranking?region=&month=` (la tabla
del mes) y la página `/zones`. Públicas y con caché en memoria de 5 minutos: son
agregaciones sobre las tablas grandes y el resultado no cambia de un minuto a otro.

**El orden de la página es la mitad del diseño.** Primero las barras de la comarca, después
la tabla, y la tabla **plegada**: hay que ir a buscarla. A mucha gente los rankings le dan
reparo, y en una app de colaboración ciudadana espantarlos sale carísimo; quien no quiera
competir se lleva igualmente lo que ha venido a ver, porque la barra es del territorio y no
de nadie.

**El ranking es mensual, y eso es lo que lo hace jugable.** Uno histórico global lo gana
para siempre quien llegó primero y vive donde hay densidad; a partir de ahí nadie más juega.
Cada mes empieza de cero, así que entrar hoy es entrar a tiempo. Un mes ilegible se contesta
con un 400 en vez de servir el mes en curso: si se pide agosto y devolvemos septiembre sin
decir nada, el fallo aparece como datos raros y no como un error.

**Quien ha apagado la gamificación no sale en la tabla, pero sigue contando en las barras.**
El interruptor del perfil dice que oculta puntos y tablas; si apagarlo te dejara igualmente
en una tabla pública, no estaría diciendo la verdad. Las barras son otra cosa: son del
territorio. Hay un test que fija las dos mitades de esta regla a la vez.

El `@username` de la tabla es lo mismo que ya firma cada reseña en la ficha de una fuente.
La tabla dice estrictamente **menos** que la ficha, porque agrupa por comarca en vez de
decir en qué fuente exacta estuviste.

Las fuentes sin `region` se quedan fuera en vez de agruparse en un «sin zona»: una barra de
progreso sobre un cajón de sastre no mide nada, y el cajón sería el más grande de la lista
mientras `populate-regions` no haya pasado por todas.

### Dos detalles que solo se ven ejecutándolo

El carril por defecto de la barra de MUI es el color primario aclarado, un azul bastante
saturado. Con los porcentajes reales —del 0 al 2 %— **la barra vacía se leía como una barra
llena**, que es exactamente lo contrario de lo que dice el dato. Carril neutro y relleno
azul. Y al revés: un 0,4 % redondea a 0 y la barra desaparece del todo, que se lee como
«esta comarca no existe»; se le deja un hilo visible mientras haya algo.

La consulta agrupa los comentarios **antes** de unirlos a las fuentes. Sin eso, `COUNT(*)`
cuenta una vez por reseña y una fuente muy comentada infla el total de su comarca: la barra
diría «12 fuentes» habiendo 3. Hay un test con cuatro reseñas sobre la misma fuente.

### En el correo semanal

Un bloque con la barra de «con foto» de tu zona, dibujada con dos celdas de tabla y anchos
en porcentaje porque los clientes de correo no pintan `<meter>` ni anchos calculados por
CSS. «Cómo va tu comarca» es mejor correo que «has hecho 340 puntos».

Tu zona es **donde más has aportado**, no la del registro: mucha gente se registró desde el
sofá de una ciudad y aporta en otra comarca.

Dos cosas que el bloque **no** hace, a propósito:

- **No promete «has pasado del 12 % al 15 %».** No se guarda la fecha en que cada fuente
  ganó su foto, así que la variación semanal habría que inventársela. Se dice el número de
  hoy y cuántas faltan, que además es lo accionable.
- **No justifica por sí solo el envío.** La cobertura se mueve de mes en mes, no de semana
  en semana, y un correo semanal cuya única novedad es un número que no ha cambiado es
  exactamente el correo que se aprende a ignorar. Viaja de acompañante cuando ya hay algo
  que contar.

---

## Apéndice: los permisos (fase 6)

`Capabilities` decide qué abre un nivel; `FontController` lo aplica; `GET /gamification/me`
lo devuelve en `grant` para que la interfaz pueda reflejarlo.

### Todo está apagado por defecto, y hacen falta dos llaves

Desplegar esta fase **no cambia nada por sí sola**. Para que exista alguna capacidad hacen
falta dos decisiones explícitas del administrador:

1. `GAMIFICATION_CAPABILITIES=true`, el interruptor.
2. `GAMIFICATION_EPOCH` puesta **y pasada**, o sea, puntos definitivos.

La segunda no es burocracia. Mientras los puntos son provisionales, `gamification-sync
--rescore` puede reescribir el histórico entero: es exactamente lo que pasó al recalibrar
los multiplicadores. Conceder permiso de escritura sobre puntos que mañana pueden bajar
significa que alguien tiene una capacidad hoy y la pierde por la noche sin haber hecho nada
mal, y **un permiso que aparece y desaparece solo no es un permiso: es un error
intermitente**. «Los puntos ya no se mueven» es la precondición de «los puntos dan poder».

### Las gotas no bastan

| Requisito | Por qué |
|---|---|
| Gotas del nivel | La puerta nominal. |
| **8 días distintos** con aportación liquidada | Es la mitad menos vistosa y la más importante: sin esto, el camino a «mover el pin de cualquiera» es una tarde intensa. Se cuentan **días** y no aportaciones porque las aportaciones se apilan en una sesión y los días no. |
| Ninguna anulación por mala conducta en 90 días | Contenido denunciado o borrado. |

Pasarse del **techo diario** no cuenta como mancha: es haber aportado mucho un día, no haber
hecho nada malo, y castigarlo con la pérdida de permisos sería absurdo.

Un solo requisito que falle deja todo cerrado —son puertas, no una media— y el motivo viaja
en `grant.blockedBy`, porque «te faltan 300 gotas» es un mensaje útil y «no puedes» no lo es.

Quien ha apagado la gamificación no recibe nada: darle poderes por un contador que ha pedido
no tener sería contradecir el interruptor. Un admin las tiene todas por su rol, encendido el
sistema o no.

### Solo se abre una capacidad, y es la aburrida

**Reubicar una fuente que no creaste** (nivel 5, *Riachuelo*). Es la que más falta hace y la
menos peligrosa: las ~6.700 fuentes importadas no tienen creador, así que hoy solo un admin
puede corregirles el pin — el mismo callejón sin salida que ya tenía la primera foto — y un
movimiento queda en `FontInfoSnapshot` con lat/long, o sea que es **reversible** desde el
panel.

Lo que deliberadamente **no** se abre:

- **Sustituir una foto existente.** Invita a la guerra de ediciones, que es un problema
  social y no se arregla con un umbral.
- **Borrar una fuente.** No se deshace. Nada irreversible debería colgar de un contador.

### Tres cosas de la tabla de niveles que no se implementaron, y por qué

- *«Confirmar reseñas ajenas»* (nivel 3): **ya lo puede hacer todo el mundo**. Ponerle un
  nivel sería quitar una función que existe, no dar una nueva.
- *«Las ediciones no hacen cola»* (nivel 7): **no hay cola de ediciones**. La edición es
  abierta estilo wiki y el historial es posterior. No se puede saltar lo que no existe.
- *«Marcar fuentes como desaparecidas»* (nivel 7): **la acción no existe** todavía. Lo que
  hay desde la fase de estados es el testimonio `gone` en una reseña, que es la prueba en la
  que apoyarla el día que se haga, no la decisión.

Escribirlas en el plan fue barato; comprobar cuáles describían algo real, no. Queda una sola
capacidad y está bien que así sea: el plan decía que los permisos de los niveles tenían que
ser permisos de verdad.

### Lo que sigue pendiente

El plan pedía además un mínimo de aportaciones **verificadas in situ**, y eso **no se puede
calcular**: no se guarda la posición de quien reseña, así que hoy todo cuenta como no
verificado. Los 8 días distintos son el sustituto, y es más débil. Guardar la posición es un
cambio de esquema con implicaciones de privacidad que merece decidirse aparte.

Y el nivel 10 como *candidata a moderadora de su región* sigue siendo una propuesta que hace
un humano, no un automatismo. Eso es a propósito.

---

## Apéndice: sacarlo a la calle (fase 7)

Toda la gamificación descrita hasta aquí tiene un problema que no es de diseño sino de
sitio: **vive detrás de `/me`, y casi nadie entra a su perfil**. Diez niveles, ocho
familias de insignias y una vitrina entera que la mayoría de la gente no va a ver nunca.
Un sistema de reconocimiento que nadie mira no reconoce nada.

La fase 7 no añade nada que ganar. Mueve lo que ya se gana a donde la gente ya está.

### El pionero en la ficha de la fuente

`FontDetailPage` enseña quién fue el primero en reseñar una fuente, justo debajo de quién
la creó, con el escudo de la insignia al lado. Es el «mayor» de Foursquare: un
reconocimiento **público, concreto y ligado a un sitio**, que es lo que hace que alguien
quiera ser el primero en llegar a la siguiente.

Dos reglas que no son cosméticas:

- El escudo solo aparece cuando la insignia **se ha ganado de verdad**, es decir en
  fuentes sin creador (`font.creator == null`), que es exactamente la condición que cobra
  `ContributionScore`. Si se pintara siempre, sería un adorno, y un adorno con forma de
  premio devalúa el premio.
- Si el pionero y el creador son la misma persona, **la línea no sale**. Quien añade una
  fuente suele reseñarla en el mismo gesto; decirlo dos veces seguidas con dos rótulos
  distintos parece un error de la app.

El pionero se calcula en el cliente, sobre las reseñas ya cargadas (la más antigua por
`createdAt`), y no se pide al servidor: el dato ya está en la respuesta y añadir un campo
sería pedir dos veces lo mismo. Se deriva por fecha y no por la posición en el array, o
un cambio de orden en el backend movería la insignia sin que nadie tocara nada.

### El pulso, en novedades

`Pulse` (backend) + `PulseStrip` (web) → tira sobre el mosaico de `/activity`: quién ha
subido de nivel en los últimos 7 días y a quién le falta poco. `GET /activity/pulse`,
pública, caché de 5 min, dentro del límite de 120/h de `/activity`.

**En `/activity` y no en una `/competition` propia.** Una página aparte tendría el mismo
problema que la vitrina —existir sin que nadie pase por delante— y obligaría a resolver
otra vez el mezclado por fechas que este feed ya resuelve. La gente ya entra a novedades.

**Tira aparte y no eventos mezclados en la rejilla**, que era la otra opción y parecía la
más elegante. No lo es: cada pieza de la rejilla lleva a una ficha de fuente, y un
ascenso de nivel no tiene fuente. Además `separaRepetidas` se apoya en el `fontID` para
no pegar dos novedades de la misma fuente; meter ascensos dentro obligaría a inventarles
un `fontID` falso a cada uno.

Detalles que costaron una decisión cada uno:

- **El corte va sobre `occurred_at`, no sobre `settled_at`.** Parece lo natural mirar
  cuándo se liquidó, pero `settled_at` se rellena cuando pasa la sincronización: el día
  que se importe el histórico, años de aportaciones quedarían liquidadas a la vez y la
  app anunciaría que el censo entero acaba de subir de nivel.
- **«A punto» se mide dentro del tramo, no sobre el umbral absoluto.** Con
  `total / siguiente.from`, cualquiera de la mitad alta de la escalera saldría al 90 %
  para siempre: entre Lago (28.000) y Acuífero (60.000) hay un salto enorme, y quien
  acaba de llegar a Lago no está a punto de nada. Hay un test que fija esto.
- **El corte del 75 % es el número a calibrar** cuando haya datos de verdad. Al 90 % el
  que sale ya iba a subir esa semana y el aviso no cambia nada; por debajo del 70 % la
  lista se llena de gente a la que le faltan meses.
- **Quien acaba de subir no sale además como aspirante** del siguiente peldaño: sería la
  misma persona dos veces en la misma tira, y la noticia es el ascenso.
- **Global, no por zona**, a diferencia del resto de la página. El nivel sale del total de
  gotas de toda la vida y en toda la geografía; recortarlo a una comarca daría un «subió
  de nivel» que no cuadra con el nivel que se ve en el perfil de esa misma persona.
- **Cinco filas visibles por lista, hasta 20 detrás de «ver más».** En un pueblo tranquilo
  la lista entera cabe en cinco y el botón no llega a aparecer; en una ciudad con
  movimiento, sin corte la tira empujaría el mosaico de novedades fuera de la pantalla, que
  es justamente lo que se viene a ver. El servidor manda las 20 de una vez (`Pulse.limit`),
  así que desplegar no cuesta otra petición. Las dos listas se abren **por separado**: son
  cosas distintas y hay poca razón para que abrir una obligue a abrir la otra.
- **Si no hay nada que contar, no se pinta nada.** Ni título ni caja vacía: una sección
  permanentemente vacía enseña a saltársela, y las primeras semanas lo normal es que no
  haya ascensos.
- Respeta `gamification_opt_out` y `anonymized_at`, igual que el ranking mensual.

**No lleva insignias todavía, y no es un olvido.** El nivel sale de una suma (`SUM(gotes)`)
y se calcula para todo el mundo en una consulta; las insignias salen de recuentos por
familia —fuentes creadas, primeras fotos, estaciones distintas por fuente— que hoy solo se
saben usuario a usuario. Sacarlas aquí es recorrer el censo entero cada cinco minutos.
Cuando el recuento viva en su propia tabla, entran.

**Tampoco es un ranking**, y eso sí es una decisión. `ZoneStats.ranking` ya existe, es
mensual, y lo es precisamente para que entrar hoy sea entrar a tiempo. Un «top» global en
la portada desharía esa decisión por la puerta de atrás.

### Insignias dibujadas

`scripts/prepara-insignias.py` acepta ahora, además de los diez niveles, insignias de
familia (`web/public/badges/<clave>.png`, registro `BADGE_ART`). Solo pueden entrar las de
**grado único**: las de bronce/plata/oro son el mismo dibujo en tres metales, tres
ficheros por familia, y esa biblioteca no se mantiene sola — ésas siguen con el icono
coloreado de `BadgeIcon`, donde el grado lo lleva el color. Hoy solo está dibujada
`pioneer`.

---
---

<a id="pla-de-gamificació-ca"></a>

# Gamificació de FontApp (CA)

> Document de treball · agost de 2026
> Versió en castellà a dalt.

## Pagar per informació, no per activitat

Un pla de gamificació per a una base de dades que ja té desenes de milers de fonts i gairebé
cap dada humana a dins. El disseny sencer surt d'aquesta asimetria.

---

## 1. D'on partim

Mostra aleatòria de **49 fonts reals de producció** a la Catalunya central, consultades una a
una contra l'API el 16 d'agost de 2026:

| Camp | Cobertura |
|---|---|
| Amb fotografia | **0 / 49 — 0 %** |
| Amb descripció escrita per algú | 2 / 49 — 4 % |
| Amb potabilitat indicada | 4 / 49 — 8 % |
| Creades per un usuari | 0 / 49 |
| Amb regió assignada | 49 / 49 — 100 % |

I les dues «descripcions escrites» de la mostra deien totes dues `Manantial (OpenStreetMap)`,
generades per l'importador. A la pràctica, **zero contingut humà**.

Això no és un fracàs: és el resultat esperat d'haver importat OSM i el WFS de l'ACA. Però
canvia radicalment què ha de comprar la gamificació. No cal més cobertura geogràfica — n'hi ha
de sobres. Cal **la capa que cap importador pot donar**: si en surt aigua avui, si es pot
beure, quina cara fa, i on és exactament.

La bona notícia és la darrera xifra: `fonts.region` ja està poblada en producció. Les
classificacions per zona es poden fer des del primer dia sense feina prèvia.

> **Detall que sortirà a la primera taula de classificació:** les regions vénen amb l'exònim
> castellà i a nivell de província — la mostra dóna `Barcelona` i `Gerona`, no «Girona» ni
> «Catalunya». En una app amb el català per defecte, «Gerona» en una capçalera es veurà. Val
> la pena decidir-ho *abans* de publicar rànquings per zona, no després.

---

## 2. El principi

> Els punts es paguen pel **valor informatiu marginal** de l'aportació, no per l'esforç ni pel
> nombre d'accions.
>
> Una ressenya d'una font que ningú ha visitat en un any val molt. La mateixa ressenya, de la
> mateixa font, tres dies després que un altre hi hagi passat, no val gairebé res — perquè no
> diu res que no sabéssim.

Gairebé tota la gamificació que es veu per aquí fora paga per activitat: tants punts per
comentari, tants per foto. Això funciona quan el que vols és volum. Aquí el volum ja el tens i
el problema és un altre — tens *una foto per cada mil fonts*. Pagar pla per ressenya faria que
la gent ressenyés les quatre fonts del seu poble un cop per setmana, que és exactament el que
no necessites.

Tres corol·laris que travessen tot el document:

- **La frescor és la mercaderia.** «Hi ha aigua?» és una pregunta sobre avui, no sobre 2024.
- **El buit val més que el ple.** El primer de qualsevol cosa —foto, estat, potabilitat—
  cobra prima.
- **Res no es cobra si no és comprovable.** Sense GPS a prop o sense que ningú ho confirmi,
  els punts queden pendents.

---

## 3. La moneda: gotes

**Gotes** (ES *gotas*, EN *drops*). Una sola moneda, sense mercats ni monedes premium. Es
guanyen col·laborant i no es gasten en res: són un marcador de contribució, no una economia.

### Barem base

| Aportació | Per què val el que val | Gotes |
|---|---|---:|
| **Primera foto** d'una font que no en tenia | És el buit més gran que hi ha, i és irrepetible: només es pot fer una vegada per font. | 120 |
| **Font nova** que no existia | Amplia el mapa. Alt, però no el més alt: ja hi ha desenes de milers de fonts i cap foto. | 100 |
| **Primera ressenya** d'una font mai visitada | Converteix un punt importat en una font verificada per una persona. | 80 |
| **Reubicar** una font (acceptada) | Sota arbrat el GPS se'n va desenes de metres; una font mal situada no es troba. | 60 |
| **Ressenya d'actualització** | Escalada per antiguitat de l'última — vegeu la corba de frescor. | 5–70 |
| **Completar la fitxa** (potabilitat, tipus, descripció real) | Per camp que passa de buit a ple. No es paga dues vegades el mateix camp. | 25 |
| **Incidència** (font seca, trencada, desapareguda) | Una notícia negativa és tan útil com una de positiva, i ningú la dóna per gust. | 40 |
| **Confirmar** la ressenya d'algú altre | Barat de fer i barat de pagar, però converteix un testimoni en dos. | 10 |
| **Substituir una foto** existent per una de millor | Millora marginal, i té risc de guerra d'edicions. | 15 |
| Desar una font a preferits | És per a tu, no per al comú. No es paga. | 0 |
| Registrar-se, obrir l'app, tenir ratxa | No aporta cap dada. No es paga. | 0 |

### Multiplicadors

S'apliquen sobre el barem base i es poden acumular fins a un sostre de **×2,16**.

| Condició | Raó | Factor |
|---|---|---:|
| Font a >20 km de qualsevol font ressenyada | Els deserts de dades no es cobreixen sols; algú hi ha d'anar expressament. | ×1,25 |
| Estat d'aigua al juliol o a l'agost | És quan les fonts s'assequen i quan més gent les busca. | ×1,15 |
| Font marcada com a «dubtosa» per una incidència oberta | Dirigeix la gent cap a allò que està en disputa. | ×1,5 |
| La font ja té 3+ ressenyes fresques | Reduir, no premiar: no cal un quart testimoni de la mateixa setmana. | ×0,2 |

**Els dos primers es van retallar després de mesurar-los, i aquesta és la lliçó de la fase
1.** Amb >10 km i ×1,5, el desert saltava al **46 %** de les aportacions; amb juny–setembre
i ×1,4, l'estiatge saltava al **79 %** dels estats d'aigua. Un multiplicador que s'aplica a
quatre de cada cinc aportacions no és un multiplicador: és el barem base disfressat. Un
bonus només significa alguna cosa si **la major part de les vegades no hi és**.

---

## 4. La corba de frescor

| Dies des de l'última ressenya | Gotes |
|---|---:|
| 0 – 7 | 5 |
| 8 – 30 | 15 |
| 31 – 90 | 35 |
| 91 – 180 | 50 |
| 181 – 365 | 60 |
| > 365 (o mai) | 70 |

La corba és plana als extrems a propòsit. A l'esquerra, per no pagar el trepig repetit d'un
mateix grup d'habituals. A la dreta, perquè a partir de l'any la dada és igual de caducada
tant si fa tretze mesos com si en fa quaranta.

El mateix rellotge alimenta un **indicador de frescor** a la fitxa de cada font —verificada
aquesta setmana / aquest mes / fa temps / mai— que és útil per si sol, encara que ningú miri
mai els punts. Aquesta és la prova de si la gamificació està ben plantejada: **els senyals que
genera han de servir a qui passa d'ella.**

---

## 5. Verificació: què compta com a «hi he estat»

L'app ja té la posició contínua i el filtre anti-tremolor. Una ressenya feta **a menys de
100 m de la font** es marca com a *verificada in situ* i cobra sencera; feta des de casa,
cobra un terç i no compta per a les insignies de camp.

No és una barrera antifrau perfecta —el GPS es pot falsejar— i no cal que ho sigui. És una
distinció honesta entre «hi he anat» i «ho he sentit a dir», que és informació que el lector
vol veure igualment.

Si el permís de posició no està donat, no es demana: la ressenya s'accepta sense el segell.
Val més perdre el segell que llançar un diàleg de permisos a boca de canó, que és el criteri
que ja segueix el mapa en obrir-se.

---

## 6. Insignies

> **Noms en masculí genèric.** Van començar escrits en femení sense que ningú ho decidís a
> propòsit; es van passar a la forma masculina genèrica (Descobridor, Cartògraf, Pioner).
> **Pendent de decidir, no implementat:** un desplegable de gènere al perfil que adapti el
> nom. Veure la nota en castellà, a la secció 6, per al detall complet.

| Família | Què mesura | Llindars | Nota |
|---|---|---|---|
| **Descobridor** | Fonts noves que no existien al mapa | 10 · 50 · 200 | Or: també cal que 20 hagin estat confirmades per algú altre |
| **Primera llum** | Primeres fotos de fonts que no en tenien cap | 5 · 25 · 100 | És la insígnia que ataca el 0 % |
| **Sentinella** | Ressenyes d'actualització sobre fonts oblidades des de fa 6 mesos o més | 15 · 60 · 250 | Només compten les verificades in situ |
| **Cartògraf** | Reubicacions i correccions de fitxa que sobreviuen sense ser revertides | 10 · 40 · 150 | Una reversió resta; és l'única insígnia que pot baixar |
| **Comarques** | Fonts aportades en zones administratives diferents | 3 · 8 · 20 regions | Recompensa moure's, no acumular al mateix poble |
| **Les quatre estacions** | Fonts que has ressenyat a les quatre estacions | 1 · 3 · 10 fonts | Llindars baixos perquè el preu el posa el calendari |
| **Vigia** | Incidències comunicades | 3 · 15 · 50 | Premia donar males notícies útils |
| **Llunyania** | Aportacions en zones remotes | 10 · 40 · 150 | Usa el multiplicador de desert |
| **Sense cobertura** | Aportacions creades des de la safata offline | 1 · 10 · 40 | No afegeix gotes extra |
| **Guardià local** | Fonts diferents l'última ressenya recent de les quals és teva | 5 · 20 · 75 | Mesura manteniment, no volum |
| **Aigua recuperada** | Fonts diferents que confirmes `flowing` després de `dry` | 1 · 5 · 20 | Els dos estats han d'estar liquidats |
| **Ruta de fonts** | Jornades amb almenys tres fonts diferents ressenyades | 3 · 10 · 30 rutes | Repetir una font no infla la ruta |
| **Verificador** | Confirmacions independents de ressenyes alienes | 10 · 50 · 200 | No compten autoconfirmacions |
| **Font rescatada** | Fonts completes a les quals vas aportar una dada que faltava | 5 · 20 · 75 | Foto, descripció, tipus i potabilitat |
| **Explorador internacional** | Països diferents amb aportacions liquidades | 2 · 5 · 10 països | Cada país compta un cop |
| **Constància** | Dies UTC diferents amb aportacions liquidades | 7 · 30 · 100 dies | Un dia intens continua sent un dia |
| **Retrobament** | Ressenyes després de més d'un any sense actualitzacions | 1 · 10 · 40 | Exigeix una actualització anterior |
| **Treball en equip** | Fonts alienes ateses durant els primers 30 dies | 5 · 25 · 100 | Cada font compta un cop |
| **Incidència resolta** | Incidències pròpies seguides d'un estat `flowing` | 1 · 5 · 20 | La recuperació ha d'estar liquidada |
| **Estiatge** | Estats d'aigua registrats en plena secada, entre juny i setembre | 10 · 40 · 120 | Es reinicia cada estiu: és estacional a posta |

### Insígnia d'un sol tret

- **Pioner** — la primera persona que ressenya una font importada. Un cop per font, per
  sempre; queda escrit a la fitxa.

Cap insígnia per registrar-se, per obrir l'app ni per completar el perfil. Regalar-ne al
principi perquè «enganxin» ensenya que no valen res.

---

## 7. Nivells, i on porten

Deu nivells amb noms del vocabulari de l'aigua: **la mateixa aigua fent-se més gran**, d'una
gota a l'aqüífer que alimenta totes les fonts del mapa.

> **Fase 7 — treure-ho al carrer.** Tot això vivia darrere de `/me`, i gairebé ningú entra
> al seu perfil. Ara el **pioner** de cada font surt a la seva fitxa (amb l'escudet, i
> només quan la insígnia s'ha guanyat de debò) i hi ha una tira a `/activity` amb qui ha
> pujat de nivell aquesta setmana i a qui li falta poc. No és un rànquing: el rànquing és
> el mensual per comarca, i ho és a posta. El detall complet, a l'apèndix de la fase 7 de
> la versió en castellà.

| # | Nivell | Gotes | Què desbloqueja |
|---:|---|---:|---|
| 1 | Gota | 0 | Aportar: fonts, ressenyes, fotos, incidències. |
| 2 | Deu | 100 | — (el primer ascens arriba en una o dues aportacions, perquè es vegi que hi és) |
| 3 | Rierol | 350 | Confirmar ressenyes d'altri. Proposar duplicats per fusionar. |
| 4 | Torrent | 800 | — |
| 5 | Riera | 1 700 | Reubicar fonts que no has creat sense passar per revisió. |
| 6 | Riu | 3 500 | — |
| 7 | Cascada | 7 000 | Marcar fonts com a desaparegudes. Les edicions no fan cua. |
| 8 | Pantà | 14 000 | — |
| 9 | Llac | 28 000 | — |
| 10 | Aqüífer | 60 000 | Candidata a moderadora de la seva regió, a proposta d'un admin. |

N'eren cinc i s'arribava al tercer en una setmana: mesurat sobre l'usuari més actiu, 2 853
gotes i nivell 3 de 5 amb 31 aportacions. Un nivell alt assolit aviat deixa de motivar.

Els talls **dobles d'esglaó en esglaó** a partir del tercer, perquè pujar costi sempre «el
doble del que portes». No tots obren res, i està bé: si cada nivell desbloquegés una
capacitat, s'acabarien inventant permisos de fira. Els intermedis són ritme.

> **El nivell viatja com a clau, no com a nom.** El backend envia `river` i el rètol el
> tradueix el navegador. Cada idioma fa servir **la seva** paraula per a la ranura, no una
> traducció del castellà.

> **Els permisos que obren els nivells són permisos de veritat.** Cap d'ells no s'ha de poder
> aconseguir només acumulant accions barates: totes les portes de dalt exigeixen també un
> mínim d'aportacions *verificades in situ* i cap reversió recent. Si no, el camí a «marcar
> fonts com a desaparegudes» és confirmar tres-centes ressenyes des del sofà.

---

## 8. Missions: convertir el forat en una passejada

- **Ruta cega** (setmanal) — «Sis fonts sense cap foto en 4 km al teu voltant.» Es dibuixa al
  mapa i es va ratllant. Ataca directament el 0 % de fotos, i és una excusa per sortir a
  caminar, que és el que la gent ja fa amb l'app.
- **Ronda d'estiu** (estacional) — «Cinc fonts que ningú comprova des de l'abril.» Surt al juny
  i es tanca al setembre. És quan la informació caduca més ràpid i quan més se la consulta.
- **Repte de comarca** (col·lectiu) — «El Moianès és al 12 % de fonts amb foto. Arribem al 25 %
  abans de Nadal?» No competeix ningú contra ningú: la barra és de tots. És l'única forma de
  participar que no exclou qui no vol jugar.

Les missions es generen soles amb consultes que ja existeixen —proximitat per bounding box i
haversine, i el filtre per zona— i cadueixen. Una missió que no cadueix és una llista de
tasques, i una llista de tasques fa mandra.

---

## 9. La meitat que no competeix

- **Impacte personal** — «les teves fotos s'han vist 1 240 vegades», «mantens 12 fonts al
  dia». És més motivador que un lloc en una taula, i és cert.
- **Cobertura per zona** — barres de progrés per comarca. La unitat és el territori, no la
  persona.
- **Rànquings mensuals i regionals**, mai globals de tots els temps. Un rànquing històric
  global el guanya per sempre qui va arribar primer i viu on hi ha densitat; ningú més hi
  juga.
- **Sortir-ne** — un interruptor al perfil que amaga punts, nivells i taules sense deixar de
  comptar les aportacions. Qui l'activa segueix sortint a les barres col·lectives.

El resum setmanal per correu ja existeix i és el canal natural: «aquesta setmana el teu poble
ha passat del 12 % al 15 % de fonts amb foto» és millor correu que «has fet 340 punts».

---

## 10. Contra el frau

- **Les gotes no es cobren al moment: es liquiden a les 72 hores.** És la peça central. Si en
  aquesta finestra l'aportació es reverteix, es denuncia o s'esborra, no arriba a pagar mai.
  Evita el gruix del problema sense haver de detectar res.
- **No et pots confirmar a tu mateixa**, ni confirmar dues vegades la mateixa font, ni
  confirmar ressenyes de qui confirma les teves per damunt d'un llindar.
- **Rendiments decreixents per font**: la segona aportació teva a la mateixa font en un mes val
  una fracció.
- **Sostre de 4 000 gotes per persona i dia d'aportació**; el que se'n passa no cobra. El
  número surt de les dades: la millor jornada real mesurada són 1 256 gotes en 8 aportacions,
  o sigui tres vegades de marge. Es compta pel dia en què es va aportar i no pel dia en què es
  cobra, perquè un sostre que es pot esgotar i esperar a demà no dissuadeix de res.
- **Una foto retirada resta** el que va cobrar. Sense això, pujar brossa surt gratis.
- Els límits per hora que ja hi ha —10 imatges, 30 fonts, 40 ressenyes— són el terra. La
  gamificació no els ha de tocar.

---

## 11. Què no faria

**Ratxes diàries.** Una ratxa premia aparèixer, no aportar. En una app que depèn de sortir a
caminar, la ratxa diària empeny a inventar-se una ressenya un dimarts a la nit per no
perdre-la — soroll pagat amb els teus propis punts. Si es vol cadència, que sigui **mensual** i
que només compti si el mes duu alguna aportació verificada in situ.

**Rànquing global de tots els temps.** El guanya qui va arribar primer i viu en una zona densa,
i es queda congelat. Mensual i per regió es pot guanyar, i per tant es juga.

**Punts per ressenyar sense haver-hi anat.** Barat de fer i sense valor informatiu. Es pot
deixar escriure —no tota ressenya feta de memòria és falsa— però cobrant un terç i sense segell
de verificació.

**Monedes, botigues, cosmètics.** Afegeix una economia sencera per mantenir a canvi de res. La
recompensa aquí és que el mapa del teu poble estigui bé i que se sàpiga qui l'hi ha posat.

**Insignies per registrar-se o completar el perfil.** Ensenya el primer dia que les insignies
es regalen. Després cap ja no significa res.

---

## 12. Com desplegar-ho

**Fase 1 — Calculadora, sense escriure res.** ✅ *Implementada:*
`swift run App score-contributions`. Recorre l'historial i escup punts i insignies per usuari.
Res a la interfície, cap taula nova. Serveix per **calibrar el barem amb dades reals** abans de
comprometre's amb cap número, i contesta la pregunta que decideix tota la resta: quanta gent
tindria alguna cosa el dia 1?

**Fase 2 — Registre d'esdeveniments i liquidació.** ✅ *Implementada:*
`swift run App gamification-sync`. Taula `contribution_events` amb el seu estat —pendent,
liquidada, anul·lada— i la finestra de 72 hores. Font única de veritat; els punts són la suma
del que s'ha liquidat.

**Fase 3 — Visible al perfil, i prou.** ✅ *Implementada:* `GET /gamification/me` i la
targeta a `/me`. Gotes, nivell, insignies i impacte personal. Sense rànquings encara.
L'interruptor per amagar-ho és sota la targeta.

**Fase 4 — Frescor a la fitxa i missions al mapa.** ✅ *Implementada:* el xip de frescor
sota el nom de cada font i el panell de rutes (`GET /missions`) des del botó de rutes del
mapa. La frescor és útil encara que la gamificació es cancel·li: es va fer primer per això.

**Fase 5 — Zona: barres col·lectives i rànquing mensual.** ✅ *Implementada:* `GET /zones` i
`GET /zones/ranking`, la pàgina `/zones` i el bloc de cobertura al resum setmanal. El nom
de les regions ja està resolt: es van passar al català a producció.

**Fase 6 — Nivells amb permisos.** ✅ *Implementada i apagada per defecte:* `Capabilities`
+ `GAMIFICATION_CAPABILITIES`. S'obre una sola capacitat, la reubicació. Les capacitats de manteniment, lligades al model
d'administradors per regió. L'últim a propòsit: donar permisos automàtics abans de veure com es
comporta la gent és com es trenca un mapa obert.

---

## 13. Decisions pendents

- **Noms de regió.** Província amb exònim castellà («Gerona»), província en català, o comunitat
  autònoma? Afecta rànquings, barres i insignies de comarca, i canviar-ho després és migrar
  dades.
- **Fins on arriba el pseudònim.** Un rànquing públic ensenya qui aporta i des d'on. Ja hi ha
  `name_public` i `email_public`; caldrà l'equivalent per als punts, i decidir el valor per
  defecte.
- **Els 100 m de verificació.** És prou sota arbrat, on el GPS se'n va? Potser val més 150.
- **Si es fa gens.** La fase 1 no és irreversible: dóna els números per decidir amb dades i no
  compromet res.
