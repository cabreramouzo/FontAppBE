# FontAppBE

App para localizar **fuentes de agua** cercanas por geolocalización ("font" = fuente,
no tipografía), con usuarios, incidencias y reseñas de estado (estrellas / estado del agua / foto).
El contrato real de la API está en [docs/api.md](docs/api.md); el brief original en [definitions.md](definitions.md).
Las opciones y principios para financiar el proyecto están en [docs/monetizacion.md](docs/monetizacion.md).

## Stack
- **Backend:** Swift 6.3 · Vapor 4 · Fluent + PostgreSQL · SwiftPM (sin proyecto Xcode).
- **Web:** Vite + React 19 + TypeScript en `web/` (Leaflet + markercluster para el mapa).
  UI con **MUI (Material Design)** — tema en `web/src/theme/` (`ThemeModeContext` fija `data-theme` en `<html>` y alimenta el `ThemeProvider` de MUI; claro/oscuro/sistema). Los popups del mapa siguen siendo HTML imperativo.
  PWA con service worker propio (`web/public/sw.js`): lecturas offline y **bandeja de salida**
  (`web/src/lib/outbox.ts`, IndexedDB) para crear fuentes/reseñas sin cobertura; se vacía sola al
  volver la red y, en Android, también con la app cerrada vía Background Sync (Safari/iOS no lo tiene).
  `PendingUploads` unifica el estado visible de conexión y cola: distingue sin conexión, guardado
  local, sincronización en curso, sesión caducada y confirmación temporal al terminar. El evento
  `fontapp:outbox-sync-state-changed` refleja tanto los reintentos manuales como los automáticos.
  i18n propio sin dependencias en `web/src/i18n/` (CA por defecto + ES, GL, EU, EN, FR,
  **PT-PT e IT**; selector en la barra, detecta navegador y persiste en `localStorage`). El
  portugués es europeo a propósito: Portugal ya forma parte de los datos. También están
  localizados en `pt` la página legal y los correos transaccionales/semanales.

## Comandos
- Build / tests backend: `swift build` · `swift test` (los tests de integración usan la DB `fontapp_test`).
- ¿Toca ya generar miniaturas? `node web/scripts/peso-fotos.mjs` (mide producción).
  Ver «Peso de las fotos» más abajo: la respuesta hoy es que no, y el script dice por qué.
- Traducciones: `npm --prefix web run check:i18n` comprueba que los ocho diccionarios
  llevan **las mismas claves**. Va dentro de `npm run build`, así que también corre en CI.
  Existe porque un diccionario incompleto **no rompe nada visible**: `t()` devuelve la
  clave cruda, así que solo se ve un `maint.retire` en mitad de un botón y solo en un
  idioma. Es script de Node y no un test porque `web/` no tiene runner, y montar uno para
  comparar cinco listas de cadenas costaba más que el problema.
- Postgres local: `brew services start postgresql@16` (binarios en `/opt/homebrew/opt/postgresql@16/bin`,
  keg-only; rol `vapor`, DB `fontapp` — ver `env.development`). Alternativa: `docker compose up db -d`.
- Migrar: `swift run App migrate --yes` · revertir: `--revert --yes`.
- Sembrar: `swift run App seed [--force] [--demo]` (fuentes reales del Moianès; `--demo` añade usuarios+reseñas).
  Con la BD ya poblada (p. ej. tras `import-fonts`), `seed --demo` NO reinserta fuentes: solo añade
  reseñas de ejemplo sobre las fuentes existentes de la zona del Moianès (bbox), sin tocar el resto.
- Importar/zonas: `import-fonts` (Overpass/OSM; los puntos sin topónimo se guardan con
  `name = NULL` y el cliente muestra «fuente sin nombre» en el idioma del lector; son **3 de
  cada 4**. **No deduplica**: solo tiene `--replace`, que borra la base entera,
  así que hay que medir el solape antes) · `import-geojson` (ICGC/ACA; acepta Point y
  MultiPoint, con `--dry-run` y `--titlecase`) ·
  `populate-regions <fronteras.geojson>` (rellena país/región offline por point-in-polygon).
- Resumen semanal por correo: `swift run App send-weekly-digest [--dry-run] [--user <username>]`
  (pensado para un cron semanal; ver DEPLOY.md). También a mano desde el panel de
  administración (solo owner): vista previa + enviar, con el mismo código (`WeeklyDigestSender`).
- Gamificación (plan completo en [docs/gamificacion.md](docs/gamificacion.md), ES + CA):
  - Fase 1, **solo lectura**: `swift run App score-contributions [--user <u>] [--detail] [--json]`.
    Puntúa el historial sin escribir nada; es la herramienta para calibrar el baremo.
  - Fase 2: `swift run App gamification-sync [--dry-run] [--user <u>]` — registra las
    aportaciones en `contribution_events` y liquida las que llevan 72 h sin incidencias.
    Idempotente. Las gotas quedan **congeladas** con el valor del baremo del día en que se
    registraron; para reescalar el histórico provisional, `--rescore`.
  - `GAMIFICATION_WORKER=true` activa el recuento en segundo plano: la gamificación se
    suscribe a los cambios con un **middleware de modelo** de Fluent, así que ningún
    controlador la menciona y crear una fuente no se entera (medido: 39 ms). Puntúa unos
    segundos después, fuera de la petición, con cerrojo de Postgres para que dos instancias
    no dupliquen el trabajo.
    El trabajador **no calcula nada propio**: llama a `ContributionLedger.sync()`, la misma
    función que el comando. Son dos formas de decidir cuándo se lanza una sola, y conviven.
    Y es **un temporizador de NIO dentro del proceso que sirve el HTTP** (igual que la
    limpieza de tokens de `configure.swift`), no un servicio aparte ni nada de Fly: del
    alojamiento solo necesita que el proceso siga vivo. `--rescore` no lo hace nunca.
    **En local está apagado** (`env.development` no lleva la variable), así que en
    desarrollo no cuenta nada hasta que lances `gamification-sync` a mano — despista mucho
    y parece que la gamificación está rota. Sus líneas de log son `info` y Vapor en release
    corta en `notice`: en Fly **no verás el aviso de arranque** aunque esté funcionando.
  - Fase 3: `GET /gamification/me` + tarjeta en `/me` (`GamificationCard.tsx`). Solo lo
    propio y solo lo liquidado; lo pendiente sale como «en camino». No se pinta si el
    usuario la apagó (`users.gamification_opt_out`, 204) ni si aún no ha aportado nada.
  - Fase 4: chip de frescura en la ficha (`FreshnessChip` + `lib/freshness.ts`; los cortes
    de 7 y 30 días son los mismos de la curva del baremo, a propósito) y rutas propuestas
    (`GET /missions?lat=&long=&km=`, pública con límite 120/h → `MissionsPanel` desde el
    botón de rutas del mapa). Dos rutas de 6 paradas en 4 km, **ordenadas por distancia y
    no por puntos**, y sin solaparse entre ellas.
  - Fase 5: zonas (`ZoneStats` + `ZoneController` → `GET /zones` y `/zones/ranking`,
    públicas con límite 120/h y caché de 5 min; página `/zones` y bloque en el correo
    semanal). Primero **las barras de la demarcación** y luego la tabla, plegada: la barra es
    del territorio y no de nadie. El ranking es **mensual** a propósito — uno histórico lo
    gana para siempre quien llegó primero. `gamification_opt_out` **saca de la tabla pero
    no de las barras**, y hay un test que fija las dos mitades de la regla.
    **Tu entorno** (`ZoneStats.local` → `GET /zones/local?lat=&long=` → `LocalGoalCard`,
    arriba del todo en `/zones`): la misma cobertura, pero sobre **las 30 fuentes más
    cercanas**. Existe porque la barra de una demarcación no se mueve nunca — «Barcelona:
    2 de 7.588 con foto» es verdad y no invita a nada— y sobre 30 una sola foto la sube un
    3 %, que la tarjeta dice en voz alta. Se corta por **recuento y no por radio**, y está
    medido: a 5 km hay 53 fuentes en Castellcir y 1.482 en el centro de Barcelona, así que
    un radio fijo daría un objetivo terminable en un sitio e imposible en el otro; con las
    30 más cercanas el radio se ajusta solo (0,6 km en Barcelona, 3,7 en Castellcir, 4,7
    en el Pirineo) y el denominador es el mismo en todas partes. **No añade ninguna fila a
    ninguna lista**: no es un municipio dentro de un directorio de municipios —eso pedía
    una columna nueva, un fichero de fronteras municipales y una lista de cientos de
    pueblos que nadie lee—, es una tarjeta calculada desde tus coordenadas y hay una, la
    tuya. Las coordenadas se redondean **y se consulta con las redondeadas** (misma regla
    que `/activity`), lo que de paso hace que los vecinos vean el mismo objetivo. Sale
    `contributors`, cuánta gente distinta ha reseñado alguna — solo cuántos, sin nombres,
    así que `gamification_opt_out` no aplica, igual que en las barras.
  - **Filtro por país en `/zones`** (`lib/countries.ts` + chips en `ZonesPage`): con
    Chile son 96 filas planas y cinco países, y la lista dejó de servir para mirar la
    tuya. **No hizo falta tocar el endpoint**: `ZoneStats.Coverage` ya llevaba `country`.
    Arranca en **tu país** —`ZoneStats.local` devuelve ahora `country`, el más repetido de
    tus 30 cercanas, y `LocalGoalCard` lo sube a la página con un `onCountry`; se reporta
    desde ahí y no con una segunda petición porque esa tarjeta ya tiene la posición y ya
    ha llamado—. **Tu elección explícita gana siempre** y se recuerda (`zones:country`):
    quien está en Francia mirando España a propósito no quiere que la página se lo deshaga
    en cada visita. El selector no se pinta con un solo país.
    Los nombres se traducen **por lista explícita** (`TRADUCIDOS`) y no con `t()` a pelo:
    `t()` devuelve la clave cruda si falta, así que el día que entre Alemania saldría
    «country.Germany» escrito en un chip; sin entrada, sale el nombre en bruto. Al importar
    un país nuevo hay que añadirlo ahí con sus siete traducciones.
    Ojo, `fonts.country` guarda **el nombre en inglés de Natural Earth** («Spain»,
    «France»): es clave, no rótulo.
  - **El mismo filtro en `/activity`**, y ahí sí hubo que tocar el servidor: esa ruta
    acota resolviendo la zona a **una lista de identificadores**, y eso vale para la
    cercanía y para una demarcación (la mayor son 7.588 fuentes) pero **no para un país**
    — España son 52.341, cuatro veces por visita dentro de un `IN (...)`. El país se
    aplica como **join** sobre `fonts` y no se materializa nunca: medido, `/activity`
    entero con `country=Spain` tarda 79 ms. De ahí `ActivityController.Ambito`, que
    distingue `.fuentes([UUID])` de `.pais(String)`.
    El `switch` está **copiado en las tres consultas** que cuelgan de una fuente, no
    factorizado: se intentó con un protocolo y Swift no deja declarar `$font` en uno. Es
    seguro porque el `switch` es exhaustivo — un caso nuevo rompe la compilación en los
    tres sitios en vez de dejar uno viejo callado.
    Ojo: el join **no** filtra por `Font.visible`, igual que no lo hace el camino de los
    identificadores. Es una carencia que ya estaba; arreglarla solo en esa rama daría
    resultados distintos según cómo hubieras filtrado.
  - **El país es una sola preferencia para las dos pantallas** (`paisRecordado` /
    `recuerdaPais` en `lib/countries.ts`): quien mira las zonas de Chile quiere las
    novedades de Chile, y decirlo dos veces convierte un acierto en una tarea. Vive en el
    módulo y no en una de las dos páginas para que la tercera que lo necesite no importe
    de la segunda.
    En novedades la lista sale de `PAISES` y **no** de los items cargados, al revés que
    las demarcaciones: sacándola de lo cargado, filtrar por un país dejaría en la lista
    solo ese y no habría forma de volver. Consecuencia asumida: un país importado y no
    apuntado en `PAISES` sale en `/zones` y no en el selector de novedades — misma regla
    que las traducciones, por eso van en el mismo fichero.
    Con «cerca de mí» el país no se usa: el recorte ya lo dan tus coordenadas.
  - El rótulo «POR DEMARCACIÓN» se quedó como está y **los chips subieron por encima**.
    Debajo parecía que el rótulo nombraba los chips —y entonces habría que llamarlo «por
    país»—, cuando lo que nombra es la lista de tarjetas, que son demarcaciones. El orden
    dice la verdad: eliges país y dentro ves sus demarcaciones. Renombrarlo habría
    deshecho lo de «Comarca ≠ provincia» más abajo.
  - El selector destapó que **el seed inventaba un país**: insertaba las 381 del Moianès
    como `España`/`Catalunya`, y las dos cosas estaban mal —`region` guarda admin-1, que en
    España son **provincias**, y `country` el nombre inglés—, así que toda base local tenía
    un país que en producción no existe y salían **dos chips llamados «España»**. Medido
    contra las importadas de esa misma caja: 1.123 son `Spain`/`Barcelona`. Corregido en
    `SeedCommand`. Es otra cara de la regla de siempre: ninguna cifra ni ninguna forma de
    los datos vale si sale de una base local sembrada.
  - Diez niveles (`ContributionScore.levels`), de `drop` a `aquifer`. El nivel y las
    insignias viajan como **clave**, no como nombre: el rótulo lo traduce el navegador.
  - Vitrina en `/me/badges` (`BadgesPage`): los diez niveles y las ocho familias,
    conseguidos o no; lo bloqueado va en **silueta gris con su progreso al lado** («3 de
    5» invita, «bloqueada» no). `GET /gamification/me` devuelve `levels` y `collection`
    para que la escalera y los umbrales existan **una sola vez** (`badgeFamilies`).
    Ojo: `tier` nulo se serializa **explícitamente** como `null` — el codificador de
    Swift omite los opcionales y en el cliente `undefined !== null` daba por conseguida
    toda insignia bloqueada.
  - Insignias de nivel: `web/public/levels/<clave>.png` (320 px, ~120 KB) vía
    `scripts/prepara-insignias.py`; `LevelBadge` las pinta **junto al** nombre, no en su
    lugar — el rótulo va dibujado dentro de la imagen y en castellano. `LEVEL_BADGES`
    (`lib/levelBadges.ts`) lista cuáles existen: sin entrada no se pide nada y el nivel
    sale solo con su nombre. Al redibujar una hay que subir `VERSION` de ese fichero.
  - Fase 6: capacidades por nivel (`Gamification/Capabilities.swift`). **Apagadas por
    defecto**: hacen falta `GAMIFICATION_CAPABILITIES=true` *y* `GAMIFICATION_EPOCH`
    pasada, porque conceder escritura sobre puntos que `--rescore` puede reescribir da
    permisos que desaparecen solos. Además de las gotas: 8 días distintos con aportación
    y ninguna anulación por mala conducta en 90 días (pasarse del techo diario no cuenta).
    Siete capacidades: `addSecondaryPhoto` (3), `resolveIncident` (3), `viewFontHistory`
    (4), `relocateAnyFont` (5), `markDuplicate` (5), `retireFont` (6) y `reviewEdit` (7).
    Los peldaños 8 y 9 están **vacíos a propósito**: no hace falta que cada nivel abra
    algo, y los dos últimos antes de la candidatura funcionan bien como recta final.
    **Esconder no es borrar** (`AddHiddenToFont`): `markDuplicate` apunta a la ficha buena
    y `retireFont` marca que ya no existe; ninguna de las dos borra, porque las dos son
    opinables, las toma alguien por nivel y tiene que haber vuelta atrás — y porque borrar
    se lleva por delante reseñas y fotos que siguen siendo ciertas. **Toda lectura pública
    que devuelva varias fuentes tiene que partir de `Font.visible(on:)`** (o de
    `Font.visibleSQL` en las consultas crudas): mapa, listado, cercanía, rutas y zonas. La
    ficha individual es la excepción a propósito — se llega por un enlace viejo y hay que
    poder ver **por qué** el punto no está, con `duplicateOf`/`retiredAt` en el DTO y un
    aviso arriba del todo. Retirar pide además `Capabilities.retireGoneReports` = 2
    testimonios `gone` de **personas distintas**: es la única acción que hace desaparecer
    un punto para todo el mundo y no debería ser la opinión de uno.
    **La regla que ordena la escalera:** las gotas miden kilómetros y ojos sobre el
    terreno, no criterio sobre personas, así que un nivel abre poder **sobre el mapa** y
    nunca **sobre la gente**. Es la misma razón por la que el nivel 10 es candidatura y no
    concesión. `deleteAnyPhoto` (7) y `revertAnyEdit` (8) existieron y **se retiraron** al
    revisar la escalera: cruzaban esa línea, la primera además **no era reversible**
    (borra el fichero) pese a que aquí decía que todas lo eran, y la segunda nunca tuvo
    puerta porque el historial de ediciones es de moderación. Sustituir una foto que ya
    existe y borrar una fuente tampoco se abren por nivel: la primera invita a la guerra
    de ediciones y la segunda no se deshace.
    `Capability.requiresDefinitivePoints` parte la regla de la época en dos: las que
    **destruyen o deshacen trabajo ajeno** (`deleteAnyPhoto`, `revertAnyEdit`,
    `relocateAnyFont`) la exigen; añadir una foto o cerrar una incidencia, no. Con la
    época sin poner, exigírselo a todas dejaba inservibles justo las nuevas.
    Nivel 10 = **candidatura** a moderar su región a propuesta de un admin, nunca
    concesión automática: moderar es poder sobre personas y no cuelga de un contador.
    Falta acotar `UserRole.moderator` por región — hoy modera todo el mapa.
  - Las incidencias **se cierran solas** (`FontReportController.autoResolve`) cuando llega
    una reseña `flowing` sobre esa fuente. El sistema ya lo deducía para pagar la insignia
    «Incidencia resuelta» y no hacía nada con ello: la ficha seguía avisando de una avería
    inexistente hasta que alguien pulsara un botón. Se cierra **al publicar** y no al
    liquidar a las 72 h, al revés que la insignia, porque aquí no se paga nada — se dice
    si hay agua, y eso caduca deprisa; si la reseña es falsa, cualquiera reabre. Queda
    **sin `resolver`**, y la ficha lo dice como «resuelta automáticamente» en vez de
    atribuírsela a quien pasó por allí. Vive en el controlador de reseñas y no en el
    barrido de gamificación: ningún controlador debe depender de que la gamificación esté
    encendida para decir la verdad sobre una fuente.
  - **Fuentes que cuidas** (`Gamification/Guardianship.swift` → `GET /gamification/guarded`
    → `GuardedFonts.tsx` en `/me`): aquellas cuya **última reseña es tuya**, las más
    olvidadas primero. El dato ya se calculaba para la insignia «Guardián local»; como
    relación explícita da lo que faltaba, un motivo **recurrente** de volver — lo que
    contaste caduca solo. Es a propósito el sustituto de una racha: una racha castiga a
    quien le llueve dos fines de semana y empuja a reseñas de paso, y esto no castiga
    nada. No es propiedad sino **relevo**: en cuanto otra persona reseña después, la
    fuente pasa a ser suya, y por eso no hay gesto de adoptar ni de soltar. Las escondidas
    no cuentan. **No** depende de `gamificationOptOut`: cuidar no es puntuar.
    El recordatorio (`StaleGuardedNotifier`, desde el trabajador) avisa por la **campana y
    no por correo** — un correo mensual diciendo «ve a dar una vuelta» es como te marcan
    como spam— y como mucho **una vez cada 30 días**, controlado mirando la propia tabla
    de avisos, sin columna nueva. El texto viaja como cifras (`"7|6|142"`) y lo compone el
    cliente: el servidor no sabe en qué idioma lees.
  - **Lo que paga comprobar una fuente, antes de ir** (`lib/worth.ts` + `WorthChip`, en la
    lista de cercanas y en las paradas de las rutas). La curva de frescura es lo mejor del
    baremo —una olvidada un año paga 70 gotas y una de ayer 5, catorce veces— y era
    invisible **justo al decidir a cuál ir**. Mismo truco que las motos de alquiler que
    pagan más por las lejanas: el incentivo solo funciona si se ve antes. Solo se pinta
    cuando de verdad paga de más (>30 días o nunca), o una etiqueta en todas no señalaría
    ninguna. Las cifras vienen de `/gamification/scale`, nunca escritas en el cliente.
  - Fase 7, sacarlo de `/me`: toda la gamificación vivía detrás del perfil y casi nadie
    entra ahí. Ahora el **pionero** (primero en reseñar) sale en la ficha de la fuente
    bajo el creador, con el escudo **solo si la insignia se ha ganado de verdad** (fuentes
    sin creador, misma condición que cobra `ContributionScore`) y sin la línea cuando
    pionero y creador coinciden. Y el **pulso** (`Gamification/Pulse.swift` →
    `GET /activity/pulse`, público, caché 5 min → `PulseStrip` sobre el mosaico de
    `/activity`): quién subió de nivel en 7 días y a quién le falta poco. Tira aparte y no
    mezclada en la rejilla porque un ascenso no tiene fuente y `separaRepetidas` se apoya
    en `fontID`. El corte va sobre `occurred_at` y **no** sobre `settled_at`, o al importar
    el histórico ascendería el censo entero a la vez; «a punto» se mide **dentro del
    tramo** (con el umbral absoluto, media escalera sale al 90 % para siempre). Global y
    no por zona: el nivel es del total de toda la vida. No es un ranking — ése es el
    mensual por demarcación, y lo es a posta. Sin insignias todavía: salen de recuentos por
    familia que hoy solo se saben usuario a usuario.
  - **Perfil público** (`/users/:id`): el nivel y las insignias **conseguidas**, con el
    visor a pantalla completa. La ruta resuelve **por username además de por UUID**, como
    el resto de `/users/:id`: solo aceptaba el UUID y `/users/oriol_t` daba 400 — la ficha
    de la fuente funcionaba porque allí se tiene el UUID del creador. Hay test.
    `GET /users/:id/badges` devuelve ahora también `level`
    (`null` **solo** si lo tiene apagado o la cuenta está anonimizada: con cero gotas el
    nivel es «Gota», porque la escalera empieza ahí y ahí está todo el mundo. Antes se
    callaba hasta la primera gota liquidada, y eso dejaba en blanco el perfil de quien
    acababa de aportar — sus gotas están **pendientes** 72 h). Solo lo ganado: sin la escalera,
    sin las bloqueadas, sin progresos y **sin gotas** — «Río» dice cuánto ha aportado
    alguien sin convertir su perfil en un contador, y lo que le falta por ganar es asunto
    suyo. `gamification_opt_out` lo apaga entero, como en todas partes.
  - **Insignias de la ficha** (`FontBadges.tsx`, al final de la fuente): las que se ganan
    **en esta fuente** y nada más — «Internacional» o «Constancia» salen del conjunto de
    lo que aportas y aquí no dirían nada. Cada línea nombra a quien se la llevó o invita
    a llevársela («todavía no tiene ni una foto»), que es la mitad interesante. Se calcula
    con lo que ya tiene la ficha, **sin endpoint nuevo**, y por eso se calla lo que no
    puede afirmar: Pionero no aparece si la fuente tiene creador (allí no se gana),
    Primera luz sale de la reseña con foto más antigua **o del creador si la fuente nació
    con foto** (la del formulario de crear no deja rastro: ni reseña ni edición, la columna
    nace puesta — se le escapaba el caso más normal, quien añade una fuente estando delante
    de ella), y Centinela solo sale **en juego** (más de 90
    días sin comprobar, el mismo corte de la curva que paga esa insignia) porque
    reconstruir quién la despertó en el pasado pide los huecos entre reseñas.
    Todos los escudos de la ficha abren el visor a pantalla completa, igual que en `/me`.
  - Ayuda del sistema (`GamificationHelpButton`, botón (?) junto al título de la tarjeta):
    qué paga y cuánto, multiplicadores, la curva de frescura, un ejemplo y las dos reglas
    (72 h y techo diario). El texto sale del que ya imprimía `score-contributions`, que
    era la mejor explicación y solo la veía quien usa la consola. **Ninguna cifra está
    escrita en el cliente**: vienen de `GET /gamification/scale` (pública, sin BD), porque
    el baremo se ha recalibrado varias veces y una ayuda que no cuadra con tu marcador es
    peor que no dar ninguna. Un test compara lo publicado contra la función real, tramo a
    tramo. Ojo otra vez con los opcionales: `fromDays` nulo («nunca reseñada») se serializa
    **explícitamente** como `null` — omitido, el cliente leía `undefined` y la pantalla se
    caía entera, el mismo fallo que ya tuvimos con `tier`.
  - **Página pública `/gamification`** (`GamificationPage.tsx`): la explicación completa,
    **sin sesión y sin BD** — se sirve entera de `GET /gamification/scale`, que ahora
    publica también `levels` y `families`. Existe porque el (?) colgaba de la tarjeta de
    `/me`, y esa tarjeta **no se pinta hasta que has aportado algo**: la única explicación
    del sistema estaba detrás de haberlo entendido ya. Se enlaza desde el pie, desde el
    (?) («Niveles e insignias») y desde la vitrina. El diálogo y la página comparten el
    texto del baremo (`ExplicacionBaremo`); duplicarlo garantizaba que la copia pública
    —la que lee quien no entiende nada— se quedara vieja. Las cifras siguen viniendo
    todas del servidor, umbrales incluidos, y el test las compara con las reales.
  - La celebración cubre también **subir de nivel** (mismo diálogo, «Has subido de
    nivel»): el ascenso va primero cuando coinciden, porque los dos salen de la misma
    aportación. Y lo que **abre** cada nivel se publica en `/gamification/scale`
    (`capabilities`, `capabilitiesEnabled`) y sale en `/gamification` y en la tarjeta de
    `/me` (`grant.upcoming`) — antes solo se nombraba lo ya concedido, y como el sistema
    está apagado por defecto, la escalera no llevaba visiblemente a ninguna parte. Cuando
    está apagado se dice, en vez de prometer un permiso que hoy no se concede.
  - **Celebración de insignia nueva** (`BadgeCelebration.tsx` + `Confetti.tsx` +
    `lib/badgeCelebration.ts`): «Gracias por contribuir» con la medalla en grande y
    confeti. **No salta al reseñar**, aunque sea ahí donde apetecería: las insignias solo
    cuentan aportaciones **liquidadas** y eso son 72 h, así que enseñarla al publicar y
    retirarla dos días después porque la reseña se anuló sería una promesa rota. Salta la
    primera vez que la app ve una insignia que antes no tenías — en la práctica, tu
    siguiente visita. Se compara contra una foto por usuario en `localStorage`
    (`badges:seen:<userID>` y `level:seen:<userID>`), sin
    estado en el servidor; por eso **la primera vez de cada usuario no celebra nada**, o quien ya tiene
    ocho se comería ocho fiestas el día del despliegue. Una comprobación por sesión, solo
    con buena conexión (`navigator.connection`: nada con ahorro de datos ni en 2g) y
    usando `GET /users/:id/badges`, que ya existía, es pública y va cacheada 5 min. Si
    caen varias a la vez se enseña **una** y se dice cuántas más hay. El confeti es un
    `<canvas>` de cien rectángulos, sin dependencia, y no se pinta con
    `prefers-reduced-motion` (el diálogo sí).
  - **Insignias especiales** (`Gamification/SpecialBadges.swift` + `BadgeAward`): las que
    son un **hecho** y no un contador. Se **conceden y se guardan**, al revés que las 21
    familias, que se derivan del recuento cada vez. La razón la impone «Betatester» —de
    las 100 primeras personas en llegar a 15 reseñas—: eso es una carrera, y recalcularla
    tras un `--rescore` movería una medalla ya enseñada de un perfil a otro. Consecuencias
    queridas: `--rescore` no las toca, **no se revocan** (borrar reseñas después no te
    quita haber llegado antes) y el cupo se agota de verdad. La idempotencia la da el
    índice único `(user_id, key)`, no una comprobación en Swift: dos instancias pueden
    barrer a la vez. Se reparten al **final** de `ContributionLedger.sync()`, cuando la
    liquidación de esa pasada ya está hecha.
    Las dos primeras: `catalonia` (aportación en las cuatro demarcaciones) y `betatester`
    (15 reseñas, cupo 100). Catalunya cuenta **solo lo que prueba que estuviste delante de
    la fuente** (`SpecialBadges.onSiteKinds`): crear, fotografiar, reseñar o dar una
    incidencia. **Fuera `fieldCompleted` y `relocation`** —rellenar un campo es edición
    wiki y mover el pin se hace con la ortofoto, las dos desde el sofá y sobre una fuente
    de Tarragona— y fuera `confirmation`, que es opinar sobre lo que dijo otro. Se dijo
    «cualquier aportación» y era correcto **contra** limitarlo a reseñas, pero con la lista
    entera la insignia decía una cosa y medía otra, y el más expuesto era quien tiene el
    panel de administración. Hay test. Ojo con `catalanRegions`:
    acepta **las dos grafías** porque producción dice «Girona/Lleida» y una base
    repoblada con Natural Earth dice «Gerona/Lérida».
    Catalunya lleva además una **consulta de rescate**: `fonts.region` no está siempre
    puesta —lo que el GeoJSON de fronteras no cubre se queda nulo, hoy 90 fuentes
    catalanas costeras o pegadas a un límite— y una aportación ahí no contaba para
    ninguna demarcación, así que se podía haber pisado las cuatro y no ganarla nunca sin
    forma de entender por qué. Se hereda de la fuente **clasificada** más cercana, hasta
    `rescueKm` = 5 km. Se descartó afinar el polígono con datos medidos: contra esas
    mismas 90 fuentes el borde de Natural Earth falla 1,9 km de mediana y hasta 11 km,
    y el vecino clasificado está a 1,0 km de mediana y 3,1 km como mucho — o sea que el
    vecino es **más preciso** que la frontera, no mete un fichero de datos en el repo y
    no crea una segunda verdad que contradiga a `/zones` y al ranking, que siguen leyendo
    la columna. Es el mismo criterio de `inheritZone`, aplicado tarde. Va en una consulta
    **aparte** y no en un `LEFT JOIN LATERAL` sobre la principal: así el coste está
    acotado a las fuentes sin zona dentro de la caja catalana.
    Viajan en la misma lista que las demás con `tier: "special"`, así que el perfil
    público y la celebración las cogen sin saber que existen. `/gamification/scale`
    publica el catálogo pero **no las plazas libres**: esa ruta no toca la BD a propósito.
  - Insignias de familia dibujadas: `web/public/badges/<clave>.png` (`BADGE_ART` +
    `BadgeArt.tsx`), mismo script que los niveles. Solo las de **grado único** — las de
    bronce/plata/oro serían tres ficheros por familia y siguen con icono coloreado.
  - `GAMIFICATION_EPOCH=AAAA-MM-DD`: fecha desde la que los puntos son **definitivos**.
    Antes de ella todo es provisional y `--rescore` lo reconstruye; a partir de ella se
    niega. No congela las anulaciones: borrar o denunciar una reseña anula igual, esté
    donde esté respecto a la línea.
- Roles: `swift run App set-role <username> <user|moderator|admin|owner>` (owner solo por CLI).
- Excepción temporal al cupo de 5 fuentes de una cuenta nueva:
  `swift run App set-source-limit-exemption <username> --days <0...30>`; `0` revoca.
  Solo salta ese cupo, no el rate limit de 30/h ni concede permisos. Runbook local/Fly,
  ver `DEPLOY.md` → «Excepción temporal para una cuenta colaboradora».
- Servidor: `swift run App serve` (`127.0.0.1:8080`). Cargar entorno: `export $(cat env.development | xargs)`.
- Web (dev): `cd web && npm run dev` (proxy `/api` y `/uploads` → backend).
- Imagen Docker del backend: `docker build -t fontappbe .` (probada; ver [DEPLOY.md](DEPLOY.md)).

## Estructura
- `Sources/App/configure.swift` — DB (soporta `DATABASE_URL`), CORS, migraciones, arranque.
- `Sources/App/routes.swift` — registro de `RouteCollection`s.
- `Sources/App/Models/` — modelos Fluent (`User`+`UserRole`, `UserToken`, `Font`, `FontReport`, `FontComment`, `FontFavorite`).
- `Sources/App/Migrations/` — una migración por cambio de esquema.
- `Sources/App/Controllers/` — un `RouteCollection` por recurso (User, Font, Report, Comment, Auth, Image).
- `Sources/App/Commands/SeedCommand.swift` · `Sources/App/Utils/Geo.swift` (haversine).
- `Sources/App/Storage/` — abstracción `ImageStorage` (disco local / Cloudflare R2 vía Soto).
- `Sources/App/Gamification/ContributionScore.swift` — baremo y cálculo de puntos/insignias
  sobre el historial. Puro y sin escrituras: el comando solo lo imprime.
- `Tests/AppTests/` — XCTVapor (smoke + integración con DB).
- `web/` — frontend (mapa, detalle, auth, reseñas); ver `web/README.md`.

## Convenciones
- Todo `async/await`; nada de `EventLoopFuture` en código nuevo.
- Un `RouteCollection` por recurso, registrado en `routes.swift`.
- Config sensible sólo vía `Environment.get(...)`, nunca hardcodeada.
- Salida vía DTOs `Content` cuando difieran del modelo (nunca serializar `passwordHash`).
  `Font` lleva su propio `encode(to:)` con la lista de campos públicos: Fluent serializa
  **todas** las columnas y `queued_offline` se estaba colando en cada `GET /fonts`. Al
  añadir una columna hay que decidir allí si sale. Lo fija `testFontJSONHidesInternalColumns`,
  que además comprueba que `creator` sigue saliendo como `{"id": null}` y no como `{}`.
- Auth: token Bearer respaldado en BD (`UserToken`); escrituras protegidas, edición/borrado self-only.
  Google Identity Services entra por `POST /auth/google`: JWTKit valida el ID token con las
  claves públicas de Google (caché de 1 h) y `auth_identities` conserva `(provider, subject)`,
  nunca el email como identidad estable. Solo Gmail/Workspace se enlaza automáticamente por
  correo a una cuenta previa; los dominios de terceros exigen entrar con contraseña para
  evitar apropiaciones. Config: `GOOGLE_CLIENT_ID` en backend y el mismo valor público como
  `VITE_GOOGLE_CLIENT_ID` durante el build web. No necesita client secret.
  Las passkeys se registran desde Ajustes y entran por `/auth/passkeys/*`. Los challenges
  aleatorios duran 5 minutos, viven en PostgreSQL y se consumen una sola vez; la credencial
  guarda clave pública y contador, nunca material privado. Swift WebAuthn valida challenge,
  RP ID, origen, presencia/verificación del usuario y firma. Defaults: `fontapp.net` +
  `https://fontapp.net` en producción, `localhost` + `http://localhost:5173` en desarrollo;
  se pueden fijar con `PASSKEY_RP_ID` y `PASSKEY_ORIGIN`.
- Cercanía: bounding box + haversine. A escala → PostGIS + índice GiST.

## Despliegue
- `Dockerfile` multi-stage (probado) + `.dockerignore`; CI en `.github/workflows/ci.yml`.
- Config por env: `DATABASE_URL` (o `DATABASE_*`), `WEB_ORIGIN` (CORS en prod), `AUTO_MIGRATE=true`,
  `GOOGLE_CLIENT_ID` (login Google).
- Web: build con `VITE_API_URL=<origen del backend>`. Guía completa: [DEPLOY.md](DEPLOY.md).

## Qué se puede sacar de FontApp, y qué se protege

- **La API de lectura del mapa es pública y siempre lo ha sido.** Medido en producción:
  `/fonts/in-bounds` devuelve hasta **3.000 fuentes por llamada** (925 KB, 3,1 s) y hay
  **89.228**; con unas **30 peticiones** se lleva cualquiera la base entera, ~27 MB. El
  botón de descargar GPX **no cambia nada** — compone el fichero en el navegador con lo que
  esa ruta ya daba, y encima topado en 500 waypoints, o sea el camino más lento posible.
- **Y la mayoría de esos datos no son nuestros para cerrarlos**: vienen de OpenStreetMap
  (ODbL) y del ICGC/ACA (CC BY 4.0). La ODbL es *share-alike*, así que una base derivada
  tiene que ofrecerse también bajo ODbL. Bloquear el acceso a lo que se usa gracias a esa
  licencia es una posición incómoda con la propia licencia.
- Lo que **sí** es de la casa es la capa que construye la gente: reseñas, estado del agua,
  fotos, frescura, pionero y creador. **Ahora está licenciada y dicho en la página legal**,
  en los siete idiomas: datos bajo **ODbL** y fotos bajo **CC BY-SA 4.0**, con atribución a
  «FontApp y sus colaboradores». Antes no había nada escrito, lo que dejaba las dos partes
  a ciegas: no se pueden reclamar condiciones que no se han publicado, y quien contribuye
  no sabía qué cedía.
  **Pendiente y necesario para que eso sea sólido:** decirlo también **en el momento de
  aportar** (registro y formulario de reseña). Un aviso legal que nadie ha visto al enviar
  es más débil que una casilla junto al botón.
- **El límite de 600/h por IP en las lecturas del mapa no protege de que te copien**, y
  conviene no venderlo como tal: cualquier tope que permita usar el mapa con normalidad
  permite también las treinta peticiones que hacen falta. Lo que evita es el **gasto** —un
  bucle desbocado o alguien martilleando sale caro en Fly y en Neon— y hasta ahora no había
  nada. Está calibrado midiendo: diez movimientos de mapa son **20 peticiones**, así que
  600/h son unas tres horas seguidas de uso intenso. Comprobado que corta en la 601 con
  `Retry-After`.
- **`GET /fonts` sirve para buscar, no para barrer.** Sin término era un catálogo paginado
  por nombre: 89.000 fuentes a 100 por página son **893 peticiones ordenadas**, sin repetir
  ni saltarse nada — el camino más cómodo para llevárselo todo. Ahora exige `search` y,
  además, **página ≤ 5**: pedir solo el término no cierra nada, porque `search=a` casa con
  casi cualquier nombre y paginando se vuelve a barrer la base con una letra. Quien busca
  de verdad no pasa de la segunda página; quien va por la cuarenta está barriendo. Los
  admins no tienen ninguno de los dos topes.
  El corte va en «hay término» y **no** en la ruta entera: cerrarla habría roto el buscador
  para quien no tiene cuenta, que es justo quien llega por un cartel. La ruta lleva el
  autenticador **sin** `guardMiddleware` para poder mirar si quien llama es admin sin dejar
  de ser pública. Hay test.
  Y sigue sin impedir la copia —`in-bounds` da 3.000 por llamada y tiene que seguir abierta
  porque la usa el mapa—: es cerrar la puerta de la calle sabiendo que la verja del jardín
  sigue abierta. No es seguridad, es no ponerlo fácil.
- Ojo: `RateLimitMiddleware` es **en memoria y por instancia**. Con más de una, el tope
  real se multiplica por el número de instancias.
- **Lo que NO se hace: fuentes falsas de control** para detectar copias. Envenenaría el
  mapa de gente real y contradice el principio que sostiene la app entera.
- **El motivo por el que una ficha está escondida ya no es público.** `moderation_state`
  sale como `visible`, `pending` o `hidden` a secas; el sufijo (`hidden_spam`,
  `hidden_fake`, `hidden_abuse`) es un veredicto de moderación **sobre el trabajo de una
  persona**, y `creator` también es público: juntos publicaban «a fulano le marcaron esto
  como spam». No lo usaba nadie — el aviso de la ficha solo distingue `pending` y el botón
  del moderador solo mira si es `visible`. Hay test.
  Que el **hecho** salga sí es a propósito: la ficha se alcanza por un enlace viejo y tiene
  que poder explicar por qué el punto no aparece.

## Analítica interna de apoyo
- `POST /analytics` acepta únicamente la lista cerrada de eventos de uso de
  `InteractionAnalyticsController`; el cliente genera un UUID por pestaña en `sessionStorage`.
  La tabla guarda evento, día, UUID aleatorio y número de clics: nunca usuario, IP, URL,
  user-agent ni dispositivo. A los 180 días las filas por sesión se compactan de forma
  atómica en totales diarios sin UUID; esos totales históricos no caducan.
- `GET /admin/analytics?days=30|180` (sin parámetro = todo el histórico) es solo admin y
  resume clics totales y sesiones anónimas aproximadas. Añadir un evento exige incorporarlo a la lista cerrada,
  traducir su rótulo en los siete idiomas y mantener actualizada la página legal.
- `support_heart` y `support_aixeta` tienen además un rastro separado por usuario cuando
  la petición lleva una sesión válida: primera/última fecha y contador, con retención de
  180 días y borrado explícito al anonimizar la cuenta (el FK también lleva cascade para
  un borrado físico). `/users/admin` lo expone solo al owner como
  «fecha o no consta». No se convierte «no consta» en una negativa: puede no haber visitado
  la pantalla o haber estado desconectado. El resto de la analítica continúa anónima.
- Los embudos del panel agrupan creación de fuente, reseña, búsqueda/selección, clusters
  y densidad del mapa, métodos de acceso, instalación PWA y bandeja offline. Cada etapa
  es un evento independiente dentro de la misma sesión anónima; las barras comparan
  sesiones del período, no personas ni una conversión causal perfecta. Nunca se guarda
  el texto buscado, coordenadas, filtros concretos, URL, dispositivo ni detalle del error.
- **Presencia de usuarios:** `POST /users/presence` actualiza `last_seen_at` para la propia
  sesión como máximo cada 2 minutos; el cliente lo llama al entrar, volver a primer plano
  y cada 5 minutos mientras está visible. `GET /users/stats/online` es solo admin y devuelve
  nombre + última actividad de los últimos 10 minutos. Es presencia aproximada, no WebSocket:
  una pestaña cerrada desaparece al vencer la ventana. Nunca guarda IP, página o dispositivo.
- **Retorno e inactividad:** `GET /users/stats/activity-ranking` muestra al admin las diez
  cuentas vistas más recientemente y las diez más antiguas o aún no observadas, usando el
  mismo `last_seen_at`. Un valor nulo significa «sin actividad registrada desde que existe
  la medición», no demuestra que la cuenta nunca iniciara sesión antes de desplegarla.
- **Plataforma anónima:** una vez por sesión de pestaña, el cliente clasifica localmente
  iOS/iPadOS, Android, otro móvil o escritorio y, por separado, PWA instalada o navegador.
  Solo manda esos dos eventos cerrados; nunca el user-agent, modelo, versión, resolución o
  usuario. El panel calcula porcentajes sobre sesiones dentro de cada una de las dos familias.

## Novedades (público) y panel
- Actividad reciente (`ActivityController` → `/activity`): fuentes, reseñas, incidencias
  y ediciones mezcladas por fecha, con filtro por zona. Las fuentes nuevas salen **solo si
  las puso una persona** (`created_by` no nulo) y solo si son visibles: al importar el
  Pirineo francés entraron 11.043 de golpe y se comieron la portada entera. Una importación
  no es actividad — mismo criterio que el sitemap. El correo semanal lleva el mismo filtro
  en «fuentes nuevas cerca», o se llena de altas firmadas por nadie. **Lectura pública** (`/activity`,
  `NewsPage.tsx`, con entrada desde el mapa): lo que sale ya se ve en la ficha de cada
  fuente. Las **ediciones** son la excepción y solo las ven los admins — el historial es
  de moderación y "quién editó qué" no está a la vista de nadie más. El ámbito entra en
  la clave de la caché, o la respuesta de un admin se serviría a un anónimo.
- Dos movimientos de la **misma fuente no salen pegados** (`separaRepetidas`): crear una
  fuente y reseñarla acto seguido da dos eventos con la misma hora, y por fecha caían
  juntos. El hueco y la ventana son 1 y 2 **porque están medidos**: separar más obliga a
  intercalar elementos más antiguos y desordena la portada (con hueco 3, tres inversiones
  de fecha y un salto atrás de 30 h; con 1, una y 17 h). Puede quedar una repetición al
  final, cuando ya solo restan movimientos de la misma fuente.
- Límite de 120/h por IP: es ruta pública y cara, y quien varíe las coordenadas falla la
  caché en cada intento.
- `/activity` lleva **caché en memoria** (`ActivityCache`, 60 s): son cuatro consultas
  por visita. Las coordenadas se redondean **y se consulta con las redondeadas**, o dos
  personas distintas se llevarían el resultado de la otra; el paso es proporcional al
  radio (`coordStep(forKm:)`), porque uno fijo de 5 km desvirtuaba los radios pequeños.
- La rejilla arranca en **«cerca de mí»**: `/activity` acepta `lat`/`long`/`km` (radio,
  40 km por defecto) además de `region`, y la cercanía manda si vienen las dos. Una
  portada global es casi inútil para quien vive lejos de donde se mueve la cosa. La
  posición solo se pide en silencio si el permiso ya estaba dado (`lib/quietPosition.ts`);
  el chip «cerca de mí» sí puede pedirlo, porque es un gesto del usuario.
- Zona vacía y 404 comparten ilustración (`DryFountain.tsx`, `public/dry-fountain.jpg`):
  una fuente seca explica el hueco mejor que un icono de error. En la zona vacía se
  invita a compartir la app (Web Share API, con copia al portapapeles de respaldo).
- Dos vistas de lo mismo: **rejilla** (`ActivityGrid.tsx`) para mirar y **lista**
  (`ActivityFeed.tsx`) para revisar. `/activity` devuelve `image`: la de la reseña si la
  trae (es la más reciente y la que ilustra lo que se cuenta), si no la de la fuente.
  Las tarjetas sin foto usan `welcome.jpg` oscurecida y con el encuadre variado por un
  hash del id — con el mismo recorte parecían tarjetas duplicadas.

## Navegación: tab bar en móvil, barra de arriba en escritorio

- **En móvil la navegación va abajo** (`TabBar.tsx`, `BottomNavigation` de MUI): Mapa ·
  Novedades · Zonas · Yo. Es lo que espera cualquiera que use un teléfono, y la barra de
  arriba había llegado al final de su cuerda — el aviso lo daban tres síntomas, no una
  opinión: se había apretado **dos veces**, con la campana quedaban **9 px** de margen a
  393 px, **Zonas estaba escondida** en pantallas estrechas (`xs: none`) y solo se llegaba
  desde el pie, y **Novedades necesitaba una animación** que hiciera zumbar su icono para
  que alguien descubriera que existía. Los tres eran la misma cosa: cuatro secciones
  peleando por el hueco a la derecha de un logotipo.
- **Solo en móvil.** En pantallas anchas la barra de arriba tiene sitio de sobra y una tab
  bar sería un préstamo del móvil que allí no significa nada; el mismo criterio que ya
  seguía `MoreMenu`.
- **En escritorio los iconos llevan su etiqueta traducida debajo.** No se depende de que
  alguien reconozca un globo, un periódico o el control de tema, y la sección activa
  conserva color y fondo. También se etiquetan Apoyar, notificaciones, tema e idioma; en
  móvil no se repiten arriba porque los destinos principales ya tienen nombre en la tab bar.
- **Lo que NO baja: la campana y el menú.** Las pestañas son los sitios donde se está, no
  las cosas que se hacen; un aviso no es un destino y un cajón de ajustes tampoco.
- La sección activa se decide **una sola vez** en `lib/navigation.ts`, para móvil y
  escritorio. Incluye la jerarquía: una ficha `/fonts/:id` sigue siendo «Mapa»;
  `/me/badges`, ajustes y gamificación siguen siendo «Yo»; y el acceso también marca
  «Yo» cuando se llega desde esa pestaña sin sesión. El elemento activo lleva color,
  fondo y `aria-current="page"`: orientación visual y accesible, no solo decoración.
  Support e instalar son acciones y no fingen ser pestañas. Sin sesión, «Yo» lleva a
  entrar: una pestaña que da 401 no es una pestaña.
- **El pie desaparece del mapa en móvil** y se queda en el resto de páginas. La atribución
  de OSM/ICGC es obligación de licencia y no se pierde: en el mapa la pinta Leaflet abajo a
  la derecha, y en las demás páginas sigue el pie entero.
- Dos medidas que hay que respetar al tocar esto, las dos en `index.css`:
  `--alto-barra` y `--bajo-el-mapa`. El mapa se dimensiona restándolas y los toasts se
  levantan con la segunda. Van en variables porque son **cinco sitios** y el que se olvide
  no se nota hasta tener el móvil en la mano.
- Y ojo con `--alto-barra`: **no son 56 px en todas partes**. El `Toolbar` de MUI pasa a 64
  desde `sm`, más 1 px de borde. Estaba escrito a mano como 56 y por eso en escritorio la
  página se pasaba **9 px** del alto de la ventana y el mapa salía con barra de
  desplazamiento. Venía de antes de la tab bar; se arregló al meter las variables.
- El hueco para que el pie no quede debajo de la barra va **dentro del pie**, no en `.app`:
  la altura del mapa ya descuenta la barra por su cuenta, y un acolchado en el contenedor
  se la restaría dos veces.
- **Los controles del mapa se abren como hojas en móvil** (`BottomSheet.tsx`, un `Drawer`
  de abajo): filtros y capas. Antes eran una columna de chips flotando sobre el mapa y un
  menú anclado al botón — las dos cosas tapan justo la zona que estás mirando y dejan
  objetivos de 36 px para el pulgar. En la hoja van a lo ancho y con **48 px** de alto.
- **En escritorio no cambia nada**: allí el ratón apunta fino, el chip flotante se ve junto
  al botón que lo abrió y una hoja a pantalla completa sería un préstamo del móvil. Mismo
  criterio que la tab bar y que `MoreMenu`.
- Los filtros se pintan desde **una sola función** (`filtros(donde)`), no copiados en las
  dos ramas: dos listas se separan al primer añadido y el que se olvide solo se nota en uno
  de los dos tamaños de pantalla. Lo único que cambia es la caja y el tamaño de los
  objetivos.
- El corte es `theme.breakpoints.down('sm')` en todos lados —tab bar, pie, cabecera,
  hojas—, así que la app entera cambia de forma a la vez y no por partes.
- La hoja pone el acolchado inferior con `env(safe-area-inset-bottom)` **más un respiro**:
  una hoja que termina justo en el indicador del iPhone se toca mal en la última fila.
  Está en `BottomSheet` y no en cada uso, para que la tercera hoja que se añada no tenga
  que acordarse.
- **Buscar en móvil es una pantalla entera** (`Dialog fullScreen` en `SearchBox`), como en
  Maps. El campo flotante con su lista en una tarjeta se quedaba en dos filas visibles: al
  teclear sube el teclado y se come media pantalla. A pantalla completa el teclado tapa lo
  que sobra y no lo que importa. En escritorio sigue siendo la píldora flotante con su
  desplegable. Los resultados se pintan desde **una sola función**, igual que los filtros;
  lo único que cambia es el alto de la fila (56 px con el pulgar, 36 con ratón).
- Dos detalles de esa pantalla que se pagan caros si se tocan: el foco va en
  `onEntered` de la transición —puesto antes, iOS no sube el teclado— y el campo va a
  **16 px o más**, o iOS hace zoom al enfocarlo y deja el mapa torcido al volver.
- **«Cerca de ti» también es una hoja en móvil.** Era una tarjeta lateral de 270 px que se
  quedaba a medias: ni deja ver el mapa —lo tapa por la derecha— ni se lee cómoda, y la
  flecha de ir a la ficha era un objetivo diminuto. En escritorio sigue siendo la tarjeta.
- **Los resultados de fuentes dicen dónde están.** Buscar «font» devolvía **seis filas
  seguidas llamadas «A Fonte»** sin nada que las distinga; en un desplegable pequeño se
  disimulaba, a pantalla completa es que no se puede elegir. La segunda línea lleva la
  **distancia** (solo si se sabe dónde estás) y la **demarcación**. Ojo: **no es el
  municipio** — no hay columna de municipio, `fonts.region` son provincias, distritos o
  départements (ver «Comarca ≠ provincia»), así que se dice lo que de verdad hay. Lo que
  falte no sale; nada se inventa.
- Y se ve el precio de venir de Natural Earth: sale «La Coruña» y «Orense», no «A Coruña»
  ni «Ourense». Es el mismo problema que ya obligó al diccionario de dos grafías de
  `catalanRegions`, ahora a la vista del usuario.
- **Apoyar el proyecto es una pantalla** (`/support`, `SupportPage.tsx`), a la que se llega
  por un **corazón en la barra de arriba solo en móvil** —el hueco que dejó libre la tab
  bar— y por el pie en todas partes. No es una pestaña porque no es un sitio donde se esté,
  y no es un icono en escritorio porque allí el pie ya lo enseña con su nombre escrito.
- **El orden de esa pantalla es el mensaje: primero invitar, después dinero.** Lo que le
  falta a esta app no son euros, son personas mirando fuentes; y decirlo en ese orden evita
  que se lea como un cepillo. El bloque de invitar va en tarjeta y con el botón grande; el
  de costes, debajo y en texto llano.
- Pero **el bloque de costes pide de verdad**, y esto se corrigió sobre la marcha: decía
  «Si quieres, ayuda con los costes» y «ninguna aportación es necesaria: la app funciona
  igual». Era cortés y desactivaba la petición — dar permiso para no dar es lo que hace
  casi todo el mundo. Ahora nombra el coste, dice que **crece con la app**, y pide lo que
  de verdad sirve: **algo recurrente**, con la cifra puesta (un café al mes, o doce de una
  vez al año). Un importe concreto se decide; «lo que quieras» se aplaza.
- **Tres bloques y en este orden: invitar, contar qué falla, pagar.** Los dos primeros no
  cuestan dinero y van en tarjeta; el tercero, debajo y en texto llano. Contar qué falla va
  antes que el dinero a propósito: en una app tan joven, un mensaje bien detallado rinde
  más que un café.
- El bloque de sugerencias **reutiliza `FeedbackButton`** con un `destacado` que solo
  cambia el disparador (grande y a lo ancho en vez de un botón de texto). El formulario, el
  envío y el agradecimiento son los mismos que los del pie: es lo que evita que las dos
  entradas se separen con el tiempo.
- El enlace que se comparte lleva **su código de campaña** (`/?p=amigos`), como los
  carteles: es lo único que puede decir si esta pantalla sirve para algo. No necesita
  entrada en `_redirects` —eso es solo para los enlaces cortos—, porque `?p=` en la raíz ya
  lo recoge `users.signup_source`.
- Compartir usa la **hoja del sistema** (`navigator.share`) con el portapapeles de
  respaldo, y **además** un botón directo de WhatsApp (`wa.me`): es por donde se mueve esto
  de verdad aquí y abre la app instalada sin pasar por la hoja.
- **La frase y el enlace van juntos en `text`, y NO se pasa `url`.** Con los dos campos
  por separado —que es lo natural y lo que había en los **tres** sitios que comparten—
  medio destino se queda solo con la dirección y tira la frase: llegaba un enlace pelado a
  un chat, que es lo que nadie abre. Dentro del texto no hay nada que descartar, y WhatsApp
  y compañía enlazan igual la dirección que encuentran (la tarjeta de vista previa la
  siguen poniendo las etiquetas `og:`).
- Por eso compartir vive en **un solo sitio**, `lib/share.ts` (`comparteTexto`), que usan
  la pantalla de apoyo, la ficha de una fuente y la invitación de la zona vacía. La regla
  **no se deduce leyendo el código**: `{ text, url }` parece lo correcto, compila, no da
  ningún error y falla solo en el móvil de otra persona. Se descubrió compartiendo la app
  y mirando lo que caía en el chat, que es un sitio donde no llega ningún test.
- `scripts/share.test.ts` la fija, y está comprobado que **rompe si alguien vuelve a
  separar los campos**. También cubre el respaldo del portapapeles, que tenía media forma
  del mismo fallo: en la ficha se copiaba solo la dirección, sin frase.
- Lo que se comparte **dice qué es**, no solo dónde está: la ficha manda «"nombre" en
  FontApp: cómo está el agua y cómo llegar», porque eso cae en un chat entre otras cosas y
  tiene que explicarse sin que nadie pulse.
- Y el mensaje va en **primera persona y cuenta qué resuelve**, no qué es: «mira qué
  utilidad acabo de encontrar… el estado de las fuentes de tu ruta o de tu pueblo». Lo pide
  el canal: eso cae en un chat entre otras cosas y compite con ellas. Dice **fuentes de
  agua** a propósito — «fuentes» a secas, sin contexto, es tipografía.
- El diálogo de donación del pie **se ha borrado**: decía menos (solo dinero) y tener el
  mismo contenido en dos sitios garantiza que uno se quede viejo.
- **Dos formas de pagar**: mecenatge recurrente en Aixeta (`fontapp.aixeta.cat`) y Bitcoin.
  El texto de arriba pide **lo que se repite**, así que ofrecer al lado un pago único era
  contradecirse en dos líneas.
- **Ko-fi se retiró el 19/08/2026**, al entrar Aixeta: dos botones que decían «invítame a
  un café» competían por ser lo mismo. La condición para quitarlo era que Aixeta sirviera a
  quien no es catalán —tiene página en catalán, castellano e inglés—, así que se cumplió.
  El enlace queda **escrito en un comentario** de `SupportPage.tsx`, no borrado: la razón
  puede caducar (si aparece gente que no puede pagar por Aixeta) y entonces volver a
  ponerlo es un minuto.
- El botón lleva debajo **«cada mes»** aunque ya no haya con qué compararlo: dice que es
  una suscripción *antes* de pulsar, que es lo mínimo si el botón lleva a pagar.
- **Pendiente dicho por el autor:** pago directo con Apple Pay vía Stripe, que iría en el
  bloque de costes junto a los demás.
- **La regla de fondo, que vale para lo que venga:** móvil y escritorio se diseñan en
  paralelo, no se escala uno al otro. El corte es siempre `breakpoints.down('sm')` y la
  forma cambia de verdad —hoja, pantalla, barra de abajo—, no solo de tamaño.

## «Agua en mi ruta»: importar un GPX (`lib/gpxImport.ts` + `/gpx`)

- Sueltas el GPX de tu recorrido y te dice qué fuentes hay por el camino, **en qué
  kilómetro**, a cuánto del trazado y qué sabemos de cada una. La pregunta que trae quien
  llega aquí no es «dónde hay fuentes» —eso ya lo contesta el mapa— sino «en cuál lleno el
  bidón», y eso solo se contesta con su recorrido delante.
- **El fichero no sale del dispositivo.** Un GPX es por dónde se mueve una persona y casi
  siempre empieza en su casa; no hay ninguna razón para que eso viaje a un servidor. Se lee
  en el navegador y al servidor solo se le pide la **caja** que envuelve el recorrido, que
  es lo mismo que ya se le pide al mover el mapa por esa zona. Se dice en pantalla **antes**
  de que suelte el fichero, que es cuando se lo pregunta.
- **Lector propio, no `DOMParser`**: `DOMParser` no existe en Node y con él nada de esto se
  podría probar sin una dependencia o un DOM de mentira. Se acota a `trkpt` y `rtept`, que
  son de lo más regular que hay en XML. Los `wpt` sueltos **se ignoran a propósito**: son
  marcas del usuario, no el trazado, y colarlos mete un punto en medio del Atlántico que
  desplaza todas las distancias (hay test, y caza la regresión).
- **La caja se ensancha con el corredor máximo, y esto era un fallo de verdad.** Sin margen
  se piden solo las fuentes que caen dentro del trazado, así que una fuente **al lado** de
  la ruta queda fuera de la caja y no se pide nunca. Con una ruta recta la caja tiene altura
  cero y no sale ni una; con una normal el fallo es peor porque es **silencioso** — dice «8
  fuentes» cuando eran doce. Se ensancha con el corredor mayor (1 km) y no con el elegido,
  así cambiar el desplegable no vuelve a preguntar al servidor.
- Se ordena **por kilómetro de ruta**, no por cercanía: quien mira esto decide dónde parar,
  y eso se decide en el orden en que se pedalea.
- El resumen separa lo confirmado de lo que **no ha comprobado nadie nunca**
  (`lib/confidence.ts`). En una base donde la mayoría de las fuentes no las ha visto nadie,
  un «12 fuentes» a secas es una promesa que el día que estés sediento no se sostiene.
- **La altitud que se enseña es la del RECORRIDO**, no la de la fuente. Se dijo al proponer
  esto que se podría decir «12 m por debajo» y **era falso**: `fonts` no guarda altitud, así
  que el desnivel hasta la fuente no se puede saber. Prometerlo habría sido inventar un dato.
- Cierra el círculo con la exportación: desde la misma pantalla se bajan **solo las de la
  ruta**, con su kilómetro y su desvío en la descripción del waypoint.
- **Y se elige cuáles se lleva uno** (`lib/routeSelection.ts` + casillas en la lista). Lo
  pidió quien la usa, después de probarla: *«al principio ya llevas agua de casa»*, así que
  las primeras del recorrido sobran, y *«en una ruta larga quizá hay demasiadas»*. Son la
  misma queja — 167 waypoints (medido con un recorrido de 14 km por Barcelona) es una
  pantalla ilegible en un aparato de manillar, y los que estorban son los que ya sabes que
  no vas a usar. «Solo a partir de aquí» resuelve el caso contado en **un** toque en vez de
  en 166.
- **Se guardan las EXCLUIDAS, no las elegidas.** Parece lo mismo y no lo es: al ensanchar el
  corredor aparecen fuentes nuevas, y guardando las elegidas nacerían fuera. Comprobado en
  el navegador: de 250 m a 1 km la lista pasó de 167 a 712 y las 80 descartadas siguieron
  descartadas, con las 545 nuevas dentro. Y «todas» es el conjunto vacío, así que quien no
  toque nada exporta lo de siempre.
- **Elegir no esconde nada**: la lista, el perfil, el mapa y el tramo seco siguen siendo el
  recorrido entero. El tramo seco es un hecho de la ruta y no de lo que hayas marcado, y por
  una fuente que descartes para el GPS sigues pasando, así que tienes que poder contar cómo
  estaba al volver.
- El corte de «solo a partir de aquí» va por **posición y no por kilómetro**: dos fuentes
  caen en el mismo km con un decimal —pasó de verdad, las filas 79 y 80 en el km 5,2— y
  comparar por número dejaría fuera la que has tocado.
- **Todo lo que no sea `claveDe` trabaja con `string[]`, no con objetos.** La primera versión
  le pasaba la lista de la pantalla tal cual, cuyo id no está arriba sino en `.fuente.id`:
  las casillas se marcaban y el contador seguía diciendo «167 de 167». Compilaba y parecía
  bien; se vio ejecutándolo. Con `string[]` en la firma ese error ya no compila, que es
  mejor que un test.
- El botón dice **cuántas** se lleva («Descargar 87 en GPX»), y si pasan de `MAX_WAYPOINTS`
  se avisa: `construyeGPX` recortaba en silencio y te ibas al monte creyendo que llevabas
  las 700.
- Ruta `/gpx` y no `/route`: en esta app «rutas» ya son las propuestas de gamificación, y
  dos cosas con el mismo nombre en la misma pantalla es confusión garantizada. El rótulo
  visible sí es «Agua en mi ruta».
- **Aviso sobre los tests, que aquí falló dos veces:** el de la caja pasaba el margen a mano
  (`cajaDe(ruta, 1000)`), así que probaba un valor que la pantalla no usa y **no habría
  cazado el fallo**; y el del corredor ponía la fuente al norte de un tramo este-oeste, o
  sea desplazada en latitud, donde el coseno de la longitud no interviene — pasaba igual con
  el coseno quitado. Los dos se arreglaron y **se verificaron rompiendo el código**. Un test
  que no falla al romper lo que dice cubrir no cubre nada.

## Lo que de verdad decide dónde llenas el bidón

- **El tramo más largo sin agua**, en una frase: «el más seco: 4,8 km, del km 3,5 al 8,3».
  No es cuántas fuentes hay ni dónde caen en el plano — es **dónde está el hueco**, y en la
  lista eso está enterrado: habría que leer diez líneas y restar kilómetros de cabeza.
- **Los dos extremos cuentan** (`tramoMasSeco`): el hueco de la salida a la primera fuente y
  el de la última al final son tramos secos como cualquiera, y el del final es el peor
  porque llegas cansado. Medir solo los huecos *entre* fuentes es el error fácil y deja
  fuera el caso que más importa. Hay test.
  Ojo con el arranque del bucle: empezar con «la ruta entera» como mejor candidato hace que
  nada pueda superarla, y la función devuelve siempre eso — que con cero fuentes es
  casualmente correcto y con fuentes es falso. Lo cazó el test a la primera.
- **Un perfil de altitud con las fuentes marcadas** (`RouteProfile`), no un mapa. Un
  ciclista lee un perfil de forma nativa y ahí se ve de un vistazo que «la subida de 8 km no
  tiene ninguna». En un plano eso se esconde: una ruta con lazos es un garabato y dos
  fuentes pegadas pueden estar a 20 km la una de la otra **sobre el recorrido**, que es la
  distancia que se pedalea. La altitud ya la leíamos del GPX y solo se usaba para una línea.
- **Sin `<ele>` no se dibuja una línea plana**: llano y desconocido no son lo mismo, y una
  recta diría «esto no tiene desnivel» sobre un puerto. `perfil()` devuelve vacío.
- Dos detalles del SVG: hay un **desnivel mínimo de 50 m** o una ruta casi llana sale como
  una sierra; y las gotas de las fuentes van **fuera del SVG**, posicionadas en porcentaje,
  porque con `preserveAspectRatio="none"` el lienzo se estira en horizontal y un `<circle>`
  saldría ovalado. Comprobado: 13×13 px, redondas.
- **Cada fila de la lista empieza por un emoji**: la gota si mana, el grifo tachado si está
  seca, el reloj de arena si hace mucho que nadie pasa. En veinte filas es lo único que se
  lee de un vistazo, y la pregunta que trae quien la mira es «¿en cuál lleno el bidón?».
- Y **«datos contradictorios» gana al último estado**. Antes la fila enseñaba el último
  parte y se callaba el conflicto, así que una fuente con partes recientes que se
  contradicen decía «sale agua» a secas — que es peor que no decir nada. Es la misma regla
  que ya aplica `confidenceOf`, que aquí no se estaba respetando.
- **Al recorrer el perfil con el dedo o el cursor** sale la altitud en ese punto, y sobre
  una fuente el **nombre** en vez de la altitud: es lo que se ha venido a mirar, y meter las
  tres cosas hace una etiqueta que no cabe en un móvil. El kilómetro se queda siempre,
  porque es lo que ordena la lista de abajo y permite encontrarla allí.
- **La marca se imanta a la fuente** cuando pasas cerca (un 1,5 % del largo, unos diez
  píxeles, lo que abarca un dedo). Es un porcentaje y no una distancia fija porque el perfil
  ocupa el mismo ancho siempre: en 100 km, 500 m son dos píxeles; en 5 km, taparían media
  ruta.
- Ese imán **sustituye a agrandar la gota de la fuente**, que fue lo primero que se probó y
  se pintaba **con un render de retraso**: movías el dedo, el nombre acertaba y la que
  crecía era la de la posición anterior; con un segundo movimiento de medio píxel se ponía
  al día. No se llegó a explicar por qué —el `sx` condicional de MUI sobre una lista— y la
  salida fue quitar la causa: **un solo elemento**, el de la marca, que siempre refleja el
  estado actual. De paso queda mejor, porque se engancha a la fuente en vez de quedarse al
  lado. Medido: con el dedo en el km 1,05 y en el 1,14 la marca se clava en el 1,11.
- El arrastre va con `touch-action: pan-y` y no `none`: con `none` el perfil se tragaría el
  desplazamiento vertical y la pantalla se quedaría enganchada en esa franja. Así el dedo a
  los lados recorre el perfil y hacia arriba sigue moviendo la página.
- La búsqueda del punto es por **bisección** (`puntoEnKm`): el dedo dispara muchos eventos
  por segundo sobre un perfil de miles de puntos, y recorrer la lista en cada uno se nota en
  un móvil. Hay test de que da lo mismo que buscar a lo bruto — que es lo que lo hace
  seguro, porque la bisección solo vale si los puntos vienen ordenados.
- **El mapa existe, y se carga a demanda** (`RouteMap` tras un `lazy()` y un botón).
  Contesta dos cosas que ni la lista ni el perfil pueden —si has subido el fichero correcto,
  y de qué lado del camino cae cada fuente— y no contesta bien la del tramo seco, por eso va
  el último. Leaflet ronda los 300 KB, treinta veces la página: esto se abre casi siempre en
  casa, así que el peso no es un veto, pero tampoco hay razón para que lo pague quien solo
  quiere la lista. Medido: la página se queda en 13,8 KB y Leaflet solo se descarga al
  pulsar el botón.

## Cerrar el círculo: contar cómo estaban al volver (`lib/routeMemory.ts`)

- La parte que convierte «Agua en mi ruta» en **datos** y no en una consulta. Quien más
  kilómetros hace es quien mejor puede decir si una fuente manaba, y hasta ahora no había
  ningún momento en que se le preguntara.
- **La ruta se recuerda al importarla**, en `localStorage` y separada por cuenta. Sin esto
  el círculo no se cierra: el GPX se sube **antes** de salir y lo que se vio se sabe
  **después**, así que contarlo obligaría a rebuscar el fichero en el móvil y subirlo otra
  vez. Nadie hace eso, y se perdería justo la información de quien acaba de estar delante.
- Al volver a abrir la pantalla, la ruta ya está puesta y cada fuente tiene **tres chips a
  un toque**. Publica una reseña **solo con el estado**, igual que el atajo de la foto en la
  ficha, y **sin `unknown` ni `gone`**: el primero no dice nada viniendo de quien ha pasado
  por allí, y «ya no está» es el estado más caro —dos testimonios retiran la fuente del
  mapa— así que no se pone a un toque en una lista de veinte.
- **Que se puede reseñar desde aquí hay que decirlo.** Los chips de cada fila en escritorio
  aún se deducen; en un móvil eran cuatro etiquetas pequeñas que parecen información y no
  botones. Ahora hay un aviso encima de la lista, **una vez** y no en cada fila —repetirlo
  veinte veces es ruido—, y **sin sesión también se dice**, en vez de no pintar nada: si los
  chips simplemente no salen, quien no ha entrado ni se entera de que esto existe.
- En móvil los chips van **rellenos y a 48 px**, la misma medida que las hojas del mapa y la
  barra de guardar. Y en **rejilla de dos columnas**: a 48 px de alto los cuatro se partían
  en tres líneas desiguales y cada fuente se comía media pantalla (189 px por fila). Dos
  detalles medidos que se pagan si se tocan: `minmax(0, 1fr)` y no `1fr` a secas, o cada
  columna crece hasta su contenido y salen desiguales (149 contra 131 px); y **sin el
  sangrado de 62 px**, que alinea con la columna del kilómetro pero en un teléfono es un
  tercio del ancho tirado justo donde hacen falta los objetivos grandes.
- En escritorio no cambia nada: pequeños, `outlined` y con el sangrado. Mismo corte
  `down('sm')` que el resto de la app.
- **Sin cobertura va a la bandeja de salida**, que es donde tiene que ir: el monte es
  exactamente donde sabes cómo estaba la fuente y no hay red.
- **El aviso es condicional y esto importa:** dice «si la has hecho, cuenta cómo estaban»,
  no «has pasado cerca de 8 fuentes». La app sabe que importaste un recorrido, **no** que
  saliste a hacerlo. Afirmarlo sería inventarse un hecho sobre el usuario, y la primera vez
  que se equivoque deja de creerse lo demás.
- «hace 0 días» no lo dice nadie: el mismo día tiene su propia frase.
- El tope de 4.000 puntos guardados no es por el tamaño del JSON sino por **con quién
  comparte** `localStorage`: la bandeja de salida guarda aportaciones **sin enviar**, que es
  lo único aquí que no se puede perder. Si no cabe, no se guarda y no se rompe nada.
- Al leer la ruta guardada se **validan los puntos**: un `lat` que sea texto no da error, da
  distancias absurdas mucho después, y entonces el fallo parece del cálculo y no del dato.
- Importar sin sesión y entrar después pierde la ruta, porque el ámbito cambia de
  `anonymous` a tu id. Es el precio de que en un móvil prestado no salga la ruta del otro,
  y es el mismo trato que el historial de búsquedas.

## Llevarse las fuentes al GPS (`lib/gpx.ts` + `ExportGpxButton`)

- Lo pidió el mismo ciclista de los últimos metros, y el detalle que lo decide es **dónde
  está cuando le hace falta**: planifica en Strava o Wikiloc y rueda con un Garmin en el
  manillar. No va a sacar el móvil en una bajada, así que una app de fuentes que solo
  existe en el teléfono no sirve en el momento en que hay sed. Por eso **exportar va antes
  que importar** un recorrido, aunque lo segundo sea más vistoso.
- **En el navegador, sin endpoint nuevo.** Las fuentes de la caja visible ya las sirve
  `/fonts/in-bounds`, que existía y es pública; el fichero se compone en el cliente. Cero
  coste de servidor y funciona sin cobertura con lo que el service worker tenga cacheado.
- **El tope de 500 waypoints no es nuestro, es de los aparatos.** Muchos Garmin admiten del
  orden de mil o dos mil en total y algunos truncan la importación **en silencio**; una
  vista de ciudad son 3.000 puntos. Cuando se recorta se quedan **las del centro de la
  vista**, que es lo que estabas mirando, y se dice cuántas de cuántas.
- `<sym>Drinking Water</sym>` es el nombre del símbolo de Garmin: es la diferencia entre
  ver gotas de agua en la pantalla del GPS o quinientas banderitas iguales.
- La descripción dice el tipo y el último estado con su fecha, y **si nadie ha pasado nunca
  lo dice**. Un waypoint que promete agua y no la tiene es peor que no llevarlo: ya te ha
  hecho desviarte.
- **El escapado XML no es cosmético**: un `&` sin escapar en un topónimo hace que el
  aparato rechace el fichero **entero**, no esa fuente. Los caracteres de control se quitan
  (en XML 1.0 no se pueden escapar) y **antes** de meter las entidades, o se comerían los
  `&amp;` recién escritos. Hay test de las dos mitades.
- Ojo con la trampa que costó una prueba: el botón recibe **el mapa**, no `map.getBounds()`.
  Pasando los límites, se calculan en el render y React no repinta al mover el mapa — te
  llevas la caja de la última vez que se pintó, que en la primera carga es antes de que el
  mapa tenga tamaño. Medido: `minLat` igual a `maxLat`, caja de altura cero, fichero vacío
  y **ningún error**. Lo que se mira al pulsar se lee al pulsar.
- **Lo del GPX vive en su propio botón** (el cuarto de la columna, con las letras `GPX`), y
  no dentro de las herramientas donde estuvo primero. El argumento de entonces —«la columna
  ya tiene tres y un mapa tapado por sus controles deja de ser un mapa»— era sobre el sitio,
  y el problema era otro: en móvil esa hoja se titula **«Filtros»**, así que «descargar las
  fuentes» y «agua en mi ruta» estaban guardadas en un cajón cuyo rótulo dice que son otra
  cosa. Nadie las encontraría, y quien las encontrara no sabría por qué están ahí.
- El botón dice **GPX con letras y no con un icono**: quien lleva un GPS en el manillar
  reconoce esas tres letras al instante, y quien no, con cualquier icono tendría que
  adivinar igual. La hoja se titula «Rutas y fuentes en GPX», que es lo que explica.
- **Todo lo que flote sobre el mapa necesita fondo opaco** (`sobreElMapaSx`). Un
  `variant="outlined"` de MUI es transparente, así que el texto compite con las teselas:
  los dos botones de GPX salieron ilegibles sobre el mar y el bosque mientras los chips de
  al lado se leían bien. La regla ya existía dentro de `chipSx` —«fondo OPACO para que se
  lea bien sobre el mapa»— y estaba encerrada ahí; ahora es una constante exportada para
  que el siguiente control la herede en vez de descubrirla otra vez.
  El `&&:hover` no es cosmético: sin él MUI pone un hover semitransparente y el problema
  vuelve **justo al ir a pulsar**.
  Y no es cuestión de daltonismo aunque salga en esa conversación: es **contraste**. Un
  fondo sólido lo arregla para todo el mundo, y de paso hace que el color deje de ser lo
  único que separa el control del fondo. Comprobado sobre satélite y en modo oscuro, que
  son los dos peores casos.
- Se retiró `GET /fonts/near/download`, que devolvía exactamente lo mismo que `near` y no
  la usaba nadie. Era un señuelo: una ruta llamada «download» que no descarga nada es lo
  primero que mira quien viene a hacer esto.
- El evento `map_export_gpx` se añadió a la lista cerrada de analítica con su rótulo en los
  siete idiomas, que es lo que exige añadir uno. Sin eso no hay forma de saber si esta
  apuesta se usa.

## Los últimos metros (`lib/approach.ts` + `FinalApproach`)

- **El problema no es el mapa, es llegar.** Lo contó un usuario que va en bici de montaña:
  «paso por un pueblo y no sé dónde está la fuente», «sé que en ese parque tiene que haber
  una y no la encuentro». El punto está bien puesto; lo que falla son los **últimos
  doscientos metros**, que es justo donde ninguna app de navegación ayuda — te llevan a una
  calle, y la fuente está detrás del quiosco, dentro del parque, donde no hay calle a la
  que llevarte.
- Las dos piezas ya existían y solo las usaba el mapa **para pintarte a ti**: la posición
  en vivo y la brújula del cono de orientación (`useHeading`). Aquí se usan al revés, para
  apuntar a la fuente. No hizo falta nada del servidor.
- Aparece **solo por debajo de 150 m**, arriba de la columna izquierda de la ficha. Más
  lejos una flecha en línea recta te manda contra un río, y una tarjeta permanente que casi
  nunca sirve se vuelve decorado que se deja de ver.
- **Y deja de apuntar cuando apuntar sería mentir.** Es lo que hace honesta la función: el
  corte de llegada **no es fijo**, sale del margen que declara el propio GPS
  (`coords.accuracy`). A 30 m con ±40 m de margen la flecha apunta al ruido — gira sola
  estando quieto y te manda en círculos, que es peor que no decir nada. Con ±6 m, esos
  mismos 30 m sí se apuntan. Hay test de las dos mitades.
- **El suelo bajó de 15 m a 5 m, y lo corrigió el terreno.** 15 salió de un razonamiento
  —«es el orden del error de un GPS de móvil»— y al probarlo andando resultó demasiado
  pronto: a 15 m de una fuente todavía no la has visto (es el ancho de una plaza) y la app
  ya decía «ya estás» y dejaba de apuntar. El fallo era poner **una suposición** como suelo
  por encima de un dato medido; con 5 el suelo casi nunca manda y decide `accuracy`, que es
  lo que el aparato dice de sí mismo **en ese momento** y bajo arbolado sí se dispara.
- **Al llegar, la tarjeta se pone verde** con una marca de verificación, como FindMy: eso
  convierte un dato que hay que leer en una señal que se ve con el móvil en la mano. El
  verde **no lleva el significado él solo** —el texto cambia a «ya estás» y la flecha
  desaparece—, así que es refuerzo y no información. Es justo la distinción por la que se
  descartó el verde/rojo en guardar y descartar: allí el color era lo único que separaba
  dos acciones, y eso se cae con daltonismo.
  Ojo: la marca de verificación es **solo** para la llegada. El mismo hueco lo ocupa un pin
  cuando se guía sin brújula, y ahí un «hecho» a 80 m sería mentira.
- En la fase de llegada el texto **manda a la foto** si la hay, y si no la hay pide una:
  ahí es donde la foto y la descripción («junto a la pista de petanca») hacen el trabajo
  que el sensor ya no puede. Es el mismo argumento por el que existe el hueco de la foto.
- Sin brújula fiable **no se pinta flecha**, solo la distancia y un botón para activarla
  — misma regla que el cono del punto azul, y el botón es además el gesto que iOS exige
  para conceder el sensor. `giro` se normaliza a 0–360: un ángulo negativo rota la flecha
  al revés en CSS y el test lo fija.
- El permiso de ubicación **no se pide al abrir**: solo se sigue en vivo a quien ya lo
  tenía concedido, igual que hace el mapa. Aquí sí con `enableHighAccuracy`, que es la
  única pantalla de la app que guía a alguien andando.
- La decisión vive en `lib/approach.ts`, pura y con tests, porque son todo casos límite que
  fallan en silencio. Verificados rompiéndolos: quitar la precisión del corte y dejar el
  giro sin normalizar salen los dos en rojo.

## Mapa y ubicación
- Seguimiento continuo con `watchPosition` (`MapPage`): el punto azul se actualiza solo
  mientras caminas. Filtro anti-temblor de 15 m (el GPS baila estando quieto), pausa con
  la pestaña en segundo plano, y la lista de cercanas solo recarga al cambiar de casilla
  de ~100 m — si no, sería una petición por latido del GPS.
- El marcador propio usa una caja de **28 px**, punto azul de **18 px**, borde blanco de
  3 px y halo del mismo diámetro. El anterior (22/14 px) se perdía entre carreteras y
  etiquetas en móvil; sigue siendo bastante menor que un pin de fuente para no confundirlos.
- Al abrir la app se ubica sola **si el permiso ya estaba concedido** (nunca lanza el
  diálogo del navegador a bocajarro) y **si no venías de una vista guardada** ni de un
  enlace a una fuente concreta. El mapa te sigue hasta que tocas el mapa: arrastrar o
  hacer zoom desengancha el seguimiento; el botón «centrar en mí» lo vuelve a activar.
- **Añadir respeta la intención del mapa.** Si el centro visible está a 250 m o menos
  del GPS, el pin nace en la persona: estar delante de la fuente sigue siendo el camino
  principal. Si ha buscado o desplazado el mapa más lejos, nace en el centro visible y
  nunca vuelve silenciosamente a la ubicación actual. El pin se puede mover en ambos
  casos. A distancia, el formulario dice cuántos kilómetros hay, pide revisar el punto e
  incentiva aportar una foto. Sin permiso de ubicación manda siempre el mapa.
  La decisión pura vive en `lib/newFontPlacement.ts` y tiene tests para los tres casos.
  No se reutiliza `moderation_state=pending` para marcar estas altas: ese estado significa
  cuarentena por denuncias y las oculta. Una futura verificación remota necesitará un
  estado propio y una acción real que pueda completarlo.

## Carga y agrupación del mapa

- El mapa usa `GET /fonts/map` con el bounding box y el tamaño en píxeles del viewport.
  Hasta 3.000 resultados devuelve todas las `FontSummary`; por encima, PostgreSQL agrupa
  **todas** las fuentes visibles en una cuadrícula de unos 70 px y devuelve centro y
  cantidad exacta por celda. No se debe volver a un `LIMIT` que deje zonas del mapa vacías.
- Los agregados del servidor se pintan fuera de `markercluster`: al tocarlos acercan el
  mapa y una petición posterior los sustituye por grupos más pequeños o fuentes reales.
  Hasta zoom 6 se representan como un mapa de calor Canvas (sin etiquetas que tapen el
  territorio); desde zoom 7 reaparecen como clusters compactos verde/amarillo/naranja y,
  cuando caben las fuentes reales, entra el `markercluster` de siempre.
  Las respuestas llevan un número de secuencia y un `AbortController`: una petición vieja
  no reemplaza una vista nueva **ni sigue consumiendo memoria en el servidor**. Esto no es
  una microoptimización: dejar vivas las cajas de cada zoom y lanzar además el fallback
  agotó los 512 MB de una máquina de producción. `/fonts/in-bounds` queda solo como
  compatibilidad durante despliegues o rollback; la web recurre a él exclusivamente si
  `/map` responde 404. Un timeout, cancelación o 5xx no puede duplicar la carga.
- El resumen de estado de esos marcadores se agrega **en PostgreSQL**
  (`Font.summaries`): una fila compacta por fuente con último parte, confirmaciones y
  conflicto/autores de los últimos 30 días. No se deben volver a materializar en Swift
  todas las reseñas históricas de hasta 3.000 fuentes; bajo varias peticiones concurrentes
  esos arrays fueron la segunda mitad del OOM. `OptimizeMapSummaries` mantiene el índice
  parcial `(font_id, created_at DESC)` de los comentarios que sí llevan estado.
- **Ojo con el orden: `WHERE id = ANY(...)` devuelve por índice —o sea por UUID— y NUNCA
  en el orden del array.** El camino de Fluent hacía `fonts.map { ... }` y lo conservaba
  sin decirlo; al pasar el resumen a SQL, `GET /fonts/near` empezó a devolver las fuentes
  correctas en orden arbitrario (medido: 7 de 7 zonas desordenadas, y en Barcelona la más
  cercana caía novena). No es cosmético — «Cerca de ti» pinta la distancia en cada fila y
  no reordena, así que la lista se leía como un error. `summaries` rehace el orden de
  quien llama; **no** se arregla con un `ORDER BY`, porque el criterio es de quien llama
  (distancia en `near`, `md5(id)` en `in-bounds`) y no de la consulta.
  El test que debía cubrirlo, `testNearSortsByDistance`, pedía **una sola fuente**: probaba
  qué fuente sale y no en qué orden salen varias, así que esto llegó a producción en verde.
- **Quien ya tiene los ids llama a `summaries(forIDs:)` y no carga los `Font`.** El mapa y
  `in-bounds` sacan los ids con su propia consulta; cargar después los modelos leía **las
  mismas filas por tercera vez** —ids, modelos, y otra vez dentro del resumen— para usar de
  ellos únicamente el id, dejando hasta 3.000 objetos de Fluent vivos por petición. En un
  cambio que existe para no quedarse sin RAM, eso contaba doble. Medido sobre 2.352
  fuentes: **825 ms → 350 ms** (`/fonts/map` y `/fonts/in-bounds`, cinco pasadas cada uno).
  `summaries(for:)` se queda para quien ya tiene los modelos (`near` los necesita para
  ordenar por distancia) y para el respaldo sin SQL crudo.

## El popup del mapa

- **Todo el popup es un enlace**, no solo el botón: se toca con el pulgar sobre un mapa en
  movimiento y el objetivo pequeño era el problema. El área pulsable pasó de 142×40 a
  150×93 px.
- Va como `<a>` de verdad y no como un `<div>` con `onclick`, para que sigan funcionando el
  teclado, «abrir en pestaña nueva» y los lectores de pantalla. El botón de dentro es un
  `<span>` —un enlace dentro de otro no es HTML válido— y se queda como **señal**: sin algo
  que parezca pulsable, nadie descubre que la tarjeta entera lo es.
- El botón imita a MUI a mano porque **Leaflet no monta React**: los valores salen del tema
  (radio 12, sin mayúsculas, peso 600) y el color de `--accent`, para no mantener un
  segundo azul. Dos trampas que solo se ven midiendo: Leaflet trae
  `.leaflet-container a { color: #0078A8 }` y gana a una clase suelta —el rótulo salía azul
  sobre azul, y el nombre de la fuente también—, y el texto va **oscuro** porque es lo que
  hace MUI (`getContrastText` ve este azul demasiado claro para blanco): 7,6:1 contra los
  2,8:1 del blanco.
- **El globo lo pinta Leaflet, y no seguía el tema.** `leaflet.css` lleva
  `background: white; color: #333` a fuego en `.leaflet-popup-content-wrapper`: era la
  única superficie de la app ajena al modo oscuro. No se notaba mientras el texto lo
  ponía Leaflet; al hacer que la tarjeta entera fuera un `<a>` con `color: var(--fg)`, en
  oscuro quedó #e5e7eb sobre blanco — **1,2:1**, y en pantalla solo se veía el botón azul
  flotando en un rectángulo blanco (medido en producción; el aspa de cerrar tampoco). Se
  reportó como «pasa en Chrome/Android y no en Safari» y **no era del navegador**: era el
  modo oscuro del móvil.
- Al arreglarlo, el selector va prefijado con `.leaflet-container` **a propósito**:
  `leaflet.css` se importa desde `MapPage`/`RelocateFont`, que son trozos de carga
  diferida, así que su `<link>` se inyecta *después* que `index.css` y con la misma
  especificidad ganaría Leaflet por orden de aparición. Regla general para cualquier
  cosa de Leaflet que se quiera redefinir aquí.
- **El popup se cerraba solo al segundo de abrirlo.** `ClusteredMarkers` reconstruye
  **todos** los marcadores cuando cambia la identidad del array de fuentes, y eso se
  lleva por delante el popup abierto. Sólo se reponía el de la fuente **enfocada**; el
  que abres tocando un pin —el caso normal— se perdía. Se juntaban tres cosas: `shown`
  se calculaba con un `.filter()` suelto, o sea **un array nuevo en cada render**, y el
  padre repinta con **cada posición del GPS** (unos segundos caminando); `loadBounds`
  reemplazaba el array en cada `moveend` aunque la respuesta fuera idéntica; y no había
  nada que repusiera el popup. Ahora: `useMemo`, misma referencia si la firma no cambia,
  y se repone lo que hubiera abierto.
- **Reponerlo no puede colgar de `popupclose`**: markercluster quita y repone marcadores
  al agrupar y desagrupar, así que ese evento salta sin que nadie haya cerrado nada —y
  eso es justo lo que hay que reponer, no olvidar. Solo cuentan los **dos cierres
  deliberados**: el aspa y tocar el mapa. Medido con un `MutationObserver` sobre el nodo
  del popup: antes, un arrastre mínimo daba «quitado 1, puesto 0»; ahora una
  reconstrucción de verdad (cambiar de idioma) da «quitado 2, puesto 2», y tras cerrarlo
  con el aspa una reconstrucción lo deja cerrado.
- Los botones flotantes del mapa (zoom, capas, rutas) son hijos de `.leaflet-container`,
  así que pulsarlos dispara el `click` del mapa y Leaflet cierra el popup. Es de siempre
  y queda así; si algún día molesta, la salida es `L.DomEvent.disableClickPropagation`
  sobre ese contenedor, no tocar la lógica de reponer.

## Capas del mapa
- Cinco capas elegibles (`web/src/lib/mapLayers.ts`, selector en `BaseLayers.tsx`, usado
  tanto en el mapa principal como en el de reubicar): OSM, OpenTopoMap, satélite de Esri
  y, solo para España, **ortofoto PNOA y topográfico MTN del IGN** (CC BY 4.0). La
  elección se recuerda en `localStorage`.
- El MTN del IGN **rotula las fuentes con su topónimo**, y la ortofoto del PNOA es la
  capa que permite colocar un pin bajo arbolado, donde el GPS falla. Fuera de España
  esas dos salen en blanco (marcadas «(ES)» en el nombre).
- Añadir una capa es añadir una entrada al registro. Son servidores ajenos y gratuitos:
  hay que atribuirlos y no abusar. Latencia medida: 0,14–0,24 s por tesela, todas.

## Girar el mapa y orientación
- El mapa **gira con dos dedos** (`leaflet-rotate`, en `MapPage`: `rotate` + `touchRotate`).
  Caminando se quiere el camino hacia arriba, no el norte. Un botón de brújula
  (`Compass.tsx`) devuelve el norte arriba; solo aparece si el mapa está girado.
- El plugin obliga a `fadeAnimation={false}`: rompe el bucle de opacidad del fundido de
  teselas de Leaflet 1.9 y se quedan a medio aparecer. Comprobado que los clústeres
  (markercluster) sobreviven al giro.
- El punto azul lleva **cono de orientación** (`useHeading.ts` + `MeMarker.tsx`): iOS da
  `webkitCompassHeading` y **exige pedir permiso desde un gesto** (lo hace el botón de la
  brújula); el resto dan `alpha`, que va al revés y solo vale si es `absolute`. Al ángulo
  se le resta el giro del mapa y se le suma `screen.orientation.angle`, o apunta torcido.
  Sin sensor fiable el cono no se pinta: mejor nada que una dirección inventada.

## Edición de fuentes
- Edición abierta estilo wiki para la **información** (nombre, descripción, tipo,
  potabilidad); la **ubicación** solo la toca el creador o un admin
  (`FontController.canManage`). Quien no puede, ve un aviso que le remite a las notas.
- **La primera foto la puede poner cualquiera** (`update` y `setPhotoFromComment`);
  sustituir una que ya existe sigue siendo del creador o admin. Sin esto las ~6.700
  fuentes importadas (sin `created_by`) no tendrían foto jamás: no hay a quién pedirla.
  La asimetría es el argumento — añadir donde no había nada solo puede mejorar la ficha.
  Queda en `FontInfoSnapshot.image`, así que es reversible desde el panel; al revertir
  solo se toca la foto si esa edición la cambió (`before.image != after.image`), o una
  edición antigua sin el campo borraría la foto actual.
- Reubicar: `RelocateFont.tsx` (mapa para tocar + «estoy en la fuente», que usa el GPS).
  Hace falta porque la ubicación original viene del GPS del móvil y bajo arbolado se va
  decenas de metros.
- Los movimientos quedan en `FontInfoSnapshot` (lat/long **opcionales**: las ediciones
  guardadas antes de esto no los tienen) y por tanto son reversibles desde el panel.

## La foto de la reseña es la foto de la fuente

- **El problema medido a ojo y confirmado leyendo el código:** la gente fotografía la
  fuente, la adjunta a la reseña —que es el único sitio donde se la piden— y la ficha se
  queda en blanco. La ficha de una fuente sin foto **no enseñaba nada**: ni un hueco, así
  que nadie podía deducir que faltaba algo. El botón «usar como foto principal» existía
  y lo podía pulsar cualquiera si la fuente no tenía foto, pero está **dentro de la
  tarjeta de la reseña y solo aparece después de publicar**, o sea en un sitio al que ya
  no se vuelve.
- Ahora, publicar una reseña con foto sobre una fuente **sin portada se la pone**
  (`CoverPhoto.adopt`, llamado desde `FontCommentController.create`). Se copia el objeto,
  así que borrar la reseña no deja la ficha sin foto.
- **Nunca sustituye.** Es la asimetría de siempre (`FontController.update`): añadir donde
  no había nada solo puede mejorar la ficha, tapar una foto buena con una mala no. Es
  justo lo que permite que esto sea automático — sustituir no podría serlo nunca. Hay
  test de las dos mitades.
- Deja **entrada en el historial de ediciones**, o la portada aparecería de la nada y no
  habría forma de revertirla desde el panel. El botón manual pasa ahora por la misma
  función, que antes no dejaba rastro.
- Va **en línea** y no en un `Task.detached` como los avisos, porque la respuesta tiene
  que poder decirlo: `CommentResponse.coverAdopted`. Pero un fallo de la copia **no cuesta
  la reseña** — se registra y se sigue. Y se dice en voz alta («tu foto ya es la de la
  fuente»): un cambio silencioso en la ficha de una fuente que no es tuya es lo que no
  queremos.
- El aviso al usuario va **antes** de elegir la foto («la que pongas será la suya»), no
  después de publicarla. Ahí estaba el agujero entero.
- **Poner la foto es una acción sola, no una reseña.** El hueco de la ficha es entero un
  `<label>` con el input de fichero dentro: pulsas donde sea y se abre la cámara; al
  elegir, se sube y ya está. La primera versión abría el formulario de reseña y **bajaba
  hasta él**, y estaba mal de raíz: pedirle el estado del agua y una valoración a quien
  solo ha dicho «tengo la foto», y encima moverle la página a otro sitio, que es lo último
  que espera. Se descartó entero, con su `useEffect`, su `ref` y su temporizador.
- Sube por `PUT /fonts/:id/photo`, que existe **aparte de `update`** para no reenviar
  nombre y coordenadas que nadie ha tocado —y no pisarlos con una copia vieja si alguien
  los ha corregido mientras tanto—. Misma asimetría de siempre: la primera la pone
  cualquiera, sustituir es del creador o de un admin. Deja rastro en el historial. Hay test.
- Sin cobertura va a la **bandeja de salida** (`kind: 'photo'`), como el alta y la reseña:
  delante de una fuente sin foto es justo donde peor se está de cobertura, y perderla ahí
  sería perder la única aportación posible desde ese sitio. Ojo, el service worker leía
  `item.data.image` a pelo y este tipo **no lleva `data`**: reventaba con un `TypeError`,
  que al no traer `status` se tomaba por fallo transitorio y reintentaba para siempre.
- El rótulo de dentro es solo **señal**, y sin sesión el hueco no es pulsable: no hay nada
  que hacer si no puedes aportar.
- **El hueco va discreto, y esto se corrigió sobre la marcha.** La primera versión llevaba
  borde de 2 px en el color de acción y era lo más llamativo de la ficha. Sale en **64.150
  de 64.295 fuentes**, o sea casi todas: eso convertía lo secundario en lo principal de
  casi toda la app y empujaba a poner foto en vez de contar si mana, que es a lo que la app
  viene. Ahora es una línea fina de una sola fila; «informar del estado» es el botón lleno.
- **Y después de la foto se pregunta el estado** (`preguntaEstado`): «Ya que estás, ¿cómo
  mana?» con los chips a un toque, que publica una reseña **solo con el estado** —el
  servidor ya lo acepta— sin texto ni valoración. Así el camino corto de la foto **lleva** a
  la reseña en vez de comérsela. Y es honesto: quien acaba de fotografiar la fuente está
  delante, que es el único momento en que esa pregunta se contesta sola.
  Los chips **no incluyen `unknown` ni `gone`**: el primero no tiene sentido estando allí, y
  «ya no está» a un toque justo después de fotografiarla es casi una contradicción y es
  además el estado más caro —dos testimonios de personas distintas permiten retirar la
  fuente del mapa—. Un atajo no debe llevar ahí; para eso está el formulario entero.
  Y el baremo se corrigió con ello (**19/08/2026**): primera reseña y primera foto
  **intercambiaron sus valores**, 120 y 80. Estaba al revés y empujaba justo al revés de lo
  que hace esta app —la foto ilustra, pero lo que evita un desvío de tres kilómetros es
  saber si mana hoy—. Se vio al hacer evidente el hueco de la foto: con el baremo antiguo,
  el atajo estaba mejor pagado que el trabajo. **Lo ya repartido se queda como está**: las
  gotas viajan congeladas con el valor del día en que se registraron, y esto no es un juego
  de vida o muerte. Del cambio solo hubo que tocar **una constante y la documentación**:
  `/gamification/scale` publica las cifras, el diálogo y la página pública las leen de ahí y
  la lista **se reordena sola** (va ordenada de más a menos). Que eso funcionara es la
  prueba de que valía la pena no escribir ni una cifra en el cliente.
- **Puntúa como siempre**, y hubo que arreglarlo para que fuera verdad. El baremo saca las
  aportaciones de foto de dos sitios: las reseñas con imagen y las **ediciones que cambian
  `image`**. La ruta directa deja una edición firmada, así que cobra «primera foto» (120) y
  cuenta para «Primera luz» — comprobado de punta a punta: cinco fotos por esa ruta dan la
  insignia en bronce, y el registro de la fase 2 apunta cinco `firstPhoto` y ningún
  `photoReplaced`.
- Pero la adopción desde una reseña deja **las dos huellas a la vez**, y firmando su
  edición la misma foto se cobraba **dos veces**: «primera foto» *más* «foto sustituida»,
  15 gotas de más (medido: 680 gotas donde tocaban 665). Por eso esa edición va **sin
  firmar** — el mérito ya lo lleva la reseña— y el escáner **descarta las ediciones de foto
  sin editor**: sin editor no hay a quién pagar, y si se colaran se llevarían el puesto 0
  cuando el reloj las pusiera un pelo antes que la reseña, dejando al autor con 15 gotas en
  vez de 120. Hay test de las dos mitades: la del endpoint va firmada, la de la adopción no.
- Los tests viven en `Tests/AppTests/PhotoScoringTests.swift` y **puntúan de verdad**
  (`ContributionScore.compute` sobre la base del test), no comprueban invariantes alrededor:
  el fallo dejaba la foto perfectamente puesta, así que ningún test de «¿está la foto?» lo
  habría visto. Dos avisos de cómo escribirlos:
  · Afirman **a quién** se le paga y no solo el tipo. La primera versión subía la foto con
    la misma cuenta que creó la fuente y pasaba por el camino equivocado: con la edición sin
    firmar, la regla de reserva del baremo se la atribuye igual al creador y el test no
    notaba nada. Ahora la sube una cuenta distinta, que además es el caso real —las
    importadas no tienen creador.
  · Se verificaron **rompiendo el código a propósito**. Volver a firmar la adopción y quitar
    la firma del endpoint salen en rojo; quitar el filtro de ediciones sin editor **no lo
    caza nadie**, y se deja escrito: ese filtro solo protege de un empate de reloj entre la
    reseña y su adopción, y en un test el orden es siempre el mismo.
- **Cuidado con la grieta que esto abrió mientras no se lance el retroactivo:** la ficha
  mira `fonts.image` y el baremo cuenta la foto esté donde esté. Una fuente cuya única foto
  vive en una reseña vieja se enseña como «todavía no tiene ninguna foto», invita a ponerla
  y luego paga **«foto sustituida» (15)** en vez de «primera foto» (120), porque para el
  baremo la primera fue la de la reseña. Le pasó al autor de la app en su primera prueba.
  No es un fallo del baremo —una foto es una foto, venga en reseña o en portada— sino la
  cola de las fuentes sin ascender, y `adopt-cover-photos` es lo que la cierra.
- Y una lección del intento fallido, por si vuelve: colgar un efecto secundario de una
  **transición** de estado falla siempre que el estado ya estaba donde lo quieres poner
  (`setUpdating(true)` estando ya a `true` no repinta, y pulsar no hacía nada).
- `swift run App adopt-cover-photos [--dry-run] [--limit n]` hace la pasada retroactiva:
  la reseña con foto **más antigua** de cada fuente sin portada. Salta las referencias que
  el almacén no sabe copiar (`/uploads/` en disco, `<base>/uploads/` en R2) — sin eso, en
  desarrollo salían 168 avisos por las fotos `/demo/*.svg` de `seed --demo`.
- **La cola real era de 4 fuentes**, medido en producción el 19/08/2026 sobre 70.975 sin
  portada. Se lanza con `fly ssh console -a fontapp -C "/app/App adopt-cover-photos"`
  (runbook en DEPLOY.md); en producción **no hay `swift run`**, solo el binario de `/app`.
- **Ojo al medir esto en local: `seed --demo` falsea la cuenta entera, y aquí invirtió la
  conclusión.** La primera medición dio «144 portadas y 168 fotos esperando» y era casi
  toda de fixtures `/demo/*.svg`: descontándolas quedaban 6 portadas y 2 fotos reales, y en
  producción eran 4. Se llegó a decir que el retroactivo «duplicaría la cobertura de fotos»
  cuando arregla cuatro fichas. Lo que resuelve el problema de verdad es la adopción
  automática de aquí en adelante, no la pasada. **Ninguna cifra de este repo vale si sale
  de una base local sembrada.**

## El campo de descripción

- Era de **una sola línea**, y con eso nadie escribe más de cuatro palabras: no se relee lo
  escrito, el cursor se va al final y corregir a mitad de frase es imposible. Es el único
  campo libre de la ficha —de dónde nace el agua, cómo llegar, qué hay al lado— o sea justo
  donde interesa que la gente se extienda.
- La solución es la que ya usaba **todo lo demás** de la app (reseñas, incidencias,
  sugerencias): `multiline` con `minRows` y `maxRows`. Crece a medida que escribes y se
  para en el techo, y a partir de ahí rueda por dentro. No es una decisión de diseño que se
  tomara distinta aquí: simplemente se quedó sin hacer.
- **Techos distintos a propósito:** 6 líneas en la ficha, **4** en el formulario de crear
  fuente. Ése flota sobre el mapa y crece **hacia arriba**.
- Y al mirarlo salió un fallo latente que no lo traía esto: `.panel` no tenía **ni techo ni
  desbordamiento**, así que en horizontal, o con el teclado abierto, el nombre y el botón
  de crear se salían por encima del mapa y no había forma de llegar a ellos. Ahora
  `max-height: calc(100% - 48px)` y `overflow-y: auto`. Dejar crecer la descripción sin eso
  lo habría vuelto fácil de encontrar.

## Fotos de una fuente
- La **portada** sigue en `fonts.image`, una columna. Las demás viven en `font_photos`
  (`CreateFontPhoto`) y se piden **solo al abrir «Otras fotos»** (`GET /fonts/:id/photos`
  → `FontGallery.tsx`). Ni siquiera hay contador en la ficha: saber cuántas hay costaría
  un `COUNT` por fuente en el mapa y el listado, que es justo el gasto que esto evita.
- Cada foto lleva **tipo** (`PhotoKind`): `fountain` · `document` · `context`. No es
  decoración — nació de un geólogo que aportó el informe de salubridad del agua, y un
  documento **nunca compite por la portada**. Los documentos se pintan aparte y con
  aviso: los aporta quien los tiene, la app no los certifica.
- **Quién puede subir**: `document`, cualquiera con sesión (quien tiene ese papel puede
  haberse registrado esta mañana; poner una puerta ahí cierra la aportación más valiosa).
  `fountain`/`context`, **nivel 3** (`Capabilities.addSecondaryPhoto`) y tope de 3 por
  persona y fuente — ahí el ruido son cinco veces el mismo ángulo.
- Por eso `Capability` distingue ahora `requiresDefinitivePoints`: `relocateAnyFont` lo
  exige (escritura destructiva sobre trabajo ajeno; perderla a media corrección es un
  error intermitente), añadir fotos no (aditivo y reversible). Con la época sin poner,
  exigírselo a las dos dejaba la segunda inservible. Hay test de las dos mitades.
- Borrar: quien la subió o un **moderador** — no el creador de la fuente; la ficha no es
  suya y no debería poder borrar el análisis que aportó otro. Denunciables desde el día
  uno (`content_flags` acepta `photo`).

## `/me` son dos páginas: lo tuyo y lo que se toca

- **Los ajustes viven en `/me/settings`** (`SettingsPage.tsx`), fuera del perfil. Antes
  salían en `/me` en **tres islas separadas por contenido** —privacidad y avisos arriba, el
  interruptor del nivel en medio, la zona de peligro al final— y esa alternancia, no la
  cantidad de información, es lo que se leía como caos.
- **Y el orden estaba del revés.** Abres tu perfil para ver lo tuyo, y lo primero eran
  446 px de interruptores que se tocan una vez en la vida. Medido con una cuenta con datos
  de verdad (21 favoritas, 12 fuentes, 8 reseñas): las favoritas no empezaban hasta
  **1.458 px** en escritorio y **1.613** en móvil.
- La regla del reparto es la misma que decide qué baja a la tab bar: **un sitio donde se
  está frente a una cosa que se hace.** En `/me` está lo tuyo; en `/me/settings`, lo que se
  toca (nombre, privacidad, avisos, compartir el nivel y borrar la cuenta).
- **El botón de ajustes va arriba, pegado a la identidad.** Si no se ve de entrada, partir
  la pantalla no arregla nada — esconde los ajustes.
- En la pantalla de ajustes el nombre y el usuario van **siempre editables, sin modo
  «editar»**: en una pantalla que existe para tocar cosas, un modo de edición es un paso de
  más. El botón de guardar está apagado mientras no cambies nada, y el aviso de lo que
  cuesta cambiar de nombre solo sale cuando de verdad lo has tocado.
- La ruta es `/me/settings` **en inglés**, como el resto de rutas de la app.
- **Las tres listas llevan tope** (`ListaConTope`, 6 filas y «verlas todas (N)»). No lo
  tenían y crecen para siempre: con 21 favoritas ya ocupaban 1.068 px, y entre las tres
  eran el **70 %** de lo que quedaba de página. Con 200, la página son 10.000 px.
- El componente **se extrajo, no se escribió**: `GuardedFonts` ya tenía ese mismo corte con
  su `slice` y su interruptor, así que había una copia a punto de multiplicarse por cuatro.
  Ahora los cuatro sitios pasan por él, y las claves `guard.showAll` / `guard.showLess` se
  reutilizan tal cual — el nombre se queda aunque ahora lo use más gente, como ya se hizo
  con `profile.usernameRules`.
- **Se descartaron pestañas** para Favoritas / Fuentes / Reseñas, que es lo primero que
  apetece: la pregunta que se trae a esta pantalla es «¿qué tengo yo aquí?» y eso se
  responde viendo las tres a la vez. Con pestañas se esconden dos tercios detrás de un
  clic. Y se descartó plegar las **secciones** en acordeón: un interruptor no se lee mejor
  plegado, y con dos abiertos la página vuelve a estar igual de larga.
- **Y dos columnas desde `md`** (1.180, igual que la ficha): a la izquierda **quién eres y
  qué estás haciendo** —identidad, accesos, marcador y fuentes que cuidas—, a la derecha
  **tus cosas** —favoritas, tus fuentes, tus reseñas—. La izquierda es el resumen y lo
  accionable; la derecha, el archivo. Con el marcador puesto quedan **1.465 y 1.374 px**,
  91 de diferencia.
- Aquí **no** hizo falta el truco de pintar algo en un hueco o en el otro que sí pide la
  ficha: el orden en que colapsa en móvil es exactamente el que la página ya tenía.
  Comprobado midiendo el orden de los títulos, no mirando — es el mismo fallo silencioso.
- Resultado medido de las tres cosas: **4.082 → 1.692 px** en escritorio (4,5 → 1,9
  pantallas) y **4.749 → 3.534** en móvil (5,8 → 4,4) **con más contenido que antes**, porque
  la cuenta con la que se midió al final ya tiene marcador de gamificación y la primera no.
- **Las cuatro secciones dicen qué relación son, y hablan de tú.** Eran tres cosas
  distintas con nombres que no las distinguían: «Mis fuentes» y «Mis fuentes favoritas»
  empezaban igual —la segunda se leía como un subconjunto de la primera— y «Fuentes que
  cuidas» sonaba todavía más a propiedad que las otras dos. Encima dos hablaban de *mí* y
  una de *ti*. Lo detectó el autor de la app preguntando cuál era la diferencia, que es la
  prueba de que el rótulo estaba mal.
  · «Fuentes que cuidas» → **«Fuentes que dependen de ti»**, y el resumen la define en las
    primeras palabras: «eres la última persona que comprobó N fuentes».
  · «Mis fuentes» → **«Fuentes que has añadido»** + «las que pusiste tú en el mapa».
  · «Mis fuentes favoritas» → **«Tus favoritas»** + «las que has marcado con la estrella;
    avisar de una incidencia también la marca» — eso último pasa desde que reportar sigue
    la fuente, y no se decía en ninguna parte.
  · Se descartó **«últimas fuentes reseñadas»**, que era la propuesta: chocaba con «Tus
    reseñas» justo al lado, y describía un orden que no es — la consulta va
    `ORDER BY last_at ASC`, la más olvidada primero. Y tampoco es «las que has reseñado»:
    una fuente **se cae de la lista** en cuanto otra persona reseña después de ti.
  · Las **claves no se renombran** (`profile.myFonts`, `guard.title`): renombrar en seis
    diccionarios no arregla nada, misma regla que con `profile.usernameRules`.
- Al tocar esas cadenas salieron **dos traducciones francesas rotas**: `guard.summaryStale`
  decía «Vous entretenez les fontaines {n}», colocando el número como si fuera un nombre, y
  `guard.checkedAgo` decía «tu l'as vérifié il y a quelques jours {d}» — mal construida y
  además tuteando donde el resto del francés trata de usted.
- Ojo al medir esto: **con el usuario de prueba vacío la pantalla no dice nada**. Hubo que
  darle 21 favoritas, 12 fuentes y 8 reseñas y lanzarle `gamification-sync` para ver la
  página real. Otra vez lo de siempre con las bases locales.

## El ancho lo decide el contenido, no la página

- **La regla:** una página se acota por lo que contiene. **Prosa 720** (más de ~75
  caracteres por línea se lee peor de forma medible: al saltar de renglón el ojo pierde la
  línea), **tarjetas y rejillas 1.040–1.200**, **formularios 360**. No hay un número global,
  y subir el de `.pad` sería empeorar las páginas de texto para arreglar las otras.
- El problema medido no era «la app es estrecha» sino que a páginas que **no son prosa** se
  les aplicaba la regla de la prosa. En un portátil de 1440: la ficha de fuente dejaba el
  **50 % exacto de la ventana en blanco** y aun así partía sus cinco botones de acción en
  dos filas; `/zones` apilaba 53 demarcaciones en una columna, **10.674 px de página
  (11,9 pantallas)**, con 540 px de blanco al lado de cada tarjeta.
- **`/zones` es ahora una rejilla** de 1.200 con `repeat(auto-fill, minmax(360px, 1fr))`:
  3 columnas en 1440, 2 en tablet, 1 en móvil, **4,4 pantallas**. Sin puntos de corte a
  mano, que envejecen en cuanto cambia el contenido de la tarjeta.
  · `auto-fill` y **no** `auto-fit`: con `auto-fit`, filtrar por un país de una sola
    demarcación estiraría esa tarjeta a los 1.200 px.
  · `alignItems: start`, o desplegar la tabla de una tarjeta estira a sus vecinas de fila
    (medido: 733 frente a 184).
  · El mínimo son **360 y no 320 porque está medido en euskera**, el idioma más largo: a
    325 px de tarjeta se partían 49 filas de cobertura. Un mínimo elegido en castellano
    deja la página rota en un idioma que nadie de aquí mira. De ahí también el `nowrap` de
    la cifra en `CoverageBar`: se partía como «3.641(e)tik 5 ·» / «% 0», y **un número
    partido no se lee**; quien cede es la etiqueta, que sí puede.
- **La ficha de fuente son dos columnas desde `md`** (1.180 de ancho): a la izquierda **lo
  que ES la fuente** —foto, tipo, potabilidad, cómo llegar, insignias—, a la derecha **lo
  que la gente ha contado** —estado, reseñas, incidencias—. De 2.244 px a 1.496, **un 33 %
  menos**. El corte no es estético sino de contenido, y cae por la línea por la que el
  código ya estaba partido. En móvil no cambia nada: una columna y 720.
- **Cuidado al partir una página en dos: el orden vertical de móvil cambia solo.** Al
  llevar `FontBadges` a la columna izquierda, en móvil las insignias pasaron a salir
  **antes** de las reseñas —lo contrario de lo que la ficha tenía decidido— porque una
  rejilla de dos columnas colapsa poniendo toda la primera antes que la segunda. Se pinta
  **una sola vez**, en un hueco o en el otro, según `useMediaQuery(up('md'))`: dos copias
  con `display:none` montan las dos. Se detectó **midiendo el orden de los títulos**, no
  mirando.
- Y ese `useMediaQuery` va **arriba con el resto de hooks**: más abajo hay una salida
  temprana (`if (!font) return …`) y colgarlo después cambia el número de hooks entre el
  render de carga y el de la ficha — «Rendered more hooks than during the previous
  render», y la pantalla entera al error boundary. Pasó.
- **La columna izquierda se queda pegada** (`sticky`, commit aparte por si no gusta): mide
  797 frente a los 1.205 de la derecha, así que sin esto las reseñas se leen contra una
  columna vacía; con esto, lo que era hueco es contexto —foto, cómo llegar y coordenadas
  siguen delante mientras lees—. Medido: se ancla a 81 px del borde y ahí se queda todo el
  scroll.
  · Lleva **tope de alto y scroll propio** (`maxHeight` + `overflowY: auto`), o una ficha
    alta se pega por arriba y su parte de abajo no hay forma de alcanzarla. Comprobado
    inyectando 900 px de contenido: se corta en 803, saca barra y el final sigue siendo
    alcanzable.
  · **No mientras se edita**: un formulario dentro de una caja con scroll propio se rellena
    fatal, y ahí la columna crece con el mapa de reubicar.
  · **`sticky` crea contexto de apilamiento, y eso rompió el visor de fotos.** El
    lightbox de `ZoomableImage` es `position: fixed` con `z-index: 2500` y aun así las
    reseñas de la columna de al lado se pintaban **encima de la foto ampliada**: dentro de
    un contexto de apilamiento no hay número que valga, el 2500 se resuelve ahí dentro y
    no puede subir por encima de los hermanos del ancestro. El arreglo es sacar el visor
    del árbol con `createPortal` a `document.body`, no tocar el `z-index`. Así queda
    inmune a cualquier contenedor futuro —un `transform` o una opacidad hacen lo mismo—.
    Vale la pena recordarlo antes de poner `sticky`, `transform` o `opacity` en cualquier
    contenedor que tenga dentro algo a pantalla completa.
  · Aviso al medirlo: **en local ninguna ficha es larga** —4 reseñas como mucho— así que el
    `sticky` casi no se aprecia y parece que no hace nada. Se probó alargando la columna
    derecha a mano. Otra cara de «ninguna cifra que salga de una base local sembrada vale».

## Guardar y descartar, anclados abajo en móvil

- **El botón de guardar caía fuera de la pantalla al editar una fuente**, y quien editaba
  no encontraba cómo confirmar. Medido nada más pulsar «editar», sin haber hecho scroll y
  con el mapa de reubicar presente (el caso del creador, y de cualquiera desde el nivel 5):
  el botón quedaba **223 px por debajo de la zona útil** en un iPhone de 812 px y **368 px**
  en un SE de 667. Sin el mapa de reubicar se salvaba por poco (686 px), que es justo lo que
  hace que el fallo parezca intermitente.
- Ahora la pareja va **anclada abajo en móvil**, levantada con `--bajo-el-mapa`: la barra
  termina exactamente donde empieza la tab bar (medido: 611 = 611). **Solo en móvil** — en
  escritorio se midió que se ven sin scroll y una barra fija allí sería un préstamo del
  móvil; el mismo corte `down('sm')` que el resto de la app.
- **La jerarquía la da el peso, no el color.** Se propuso verde para guardar y rojo para
  descartar y se descartó por tres razones: en esta app el **rojo ya significa «borrar, y
  no hay vuelta»** —si también significa «cancelar», deja de significar nada—; verde/rojo
  es justamente el par que se cae con daltonismo; y los **chips de potabilidad están dos
  dedos más arriba** usando ese mismo par para decir otra cosa. Guardar es el azul de
  acción de siempre, lleno y a lo ancho; descartar, un botón de texto.
- Donde el rojo **sí** está es en el diálogo de confirmación, porque ahí el gesto sí es
  irreversible.
- **Anclar «descartar» obliga a preguntar.** Antes estaba al final del formulario, o sea
  lejos; ahora está permanentemente a un toque del pulgar, y tirar lo escrito no puede
  costar un roce. Se pregunta **solo si se ha tocado algo** (`sucio`): un diálogo para
  confirmar que no pasa nada es ruido.
- Dos medidas que se pagan si se tocan: los botones van a **48 px** con el pulgar (los 37
  de serie de MUI son tamaño de ratón, y esta app ya usa 48 en las hojas del mapa), y el
  formulario lleva **72 px de acolchado abajo** — la barra mide 65 (48 + 16 + 1 de borde) y
  con 64 se quedaba 1 px corto, medido.

## Potabilidad: «no tratada» no es un matiz de «con condiciones»

- `Drinkable` tiene cuatro valores: `yes` · `no` · `conditional` · **`untreated`**. Los
  tres primeros son calcados del tag OSM `drinking_water`; el cuarto es nuestro y **el
  importador no lo escribe nunca** — OSM no lo dice, y deducirlo del tipo de punto sería
  inventar un dato que después nadie distingue del que puso alguien delante de la fuente.
- Lo pidió un usuario y tenía razón: *«a la font del Montnegre jo no puc dir si és potable
  o no; el que sí que és correcte és informar que l'aigua no és tractada»*. Es el caso de
  casi toda font de muntanya.
- **La opción que faltaba no era una cuarta casilla, era una afirmación.** Ya había cuatro
  —la otra es «— desconeguda —», o sea `null`— y se la lleva el **93,8 %** de la base
  (83,7 % en montaña y manantial). Pero eso es la AUSENCIA de dato, y lo que su vecino sí
  puede afirmar es un dato: nadie la trata. Por eso es un valor y no un hueco.
- **No se renombró `conditional`,** que era la salida barata y estaba propuesta. Tres
  razones: el importador lo escribe desde OSM, así que la próxima importación metería «no
  tratada» donde OSM dijo «conditional»; **significan cosas distintas** —`conditional` es
  una salvedad sobre CUÁNDO o CÓMO (hiérvela, solo en temporada) y `untreated` es de DÓNDE
  viene el agua, así que una fuente puede ser no tratada **y** estar declarada potable—; y
  habría cambiado el significado de las que ya lo tienen sin que nadie las tocara. Medido
  antes de decidir: `conditional` la llevan **5 de cada 5.100** (~70 en toda la base), así
  que el renombre era casi gratis en datos y aun así falso.
- No hizo falta migración: la columna es `.string`, no un enum de Postgres.
- **`untreated` NO cuenta como no potable** (`isNotPotable` sigue siendo `d === 'no'`).
  Esconderla del mapa vaciaría justo la zona a la que se va a andar. Hay test.
- El orden del desplegable es **de más a menos garantía** (`yes`, `untreated`,
  `conditional`, `no`) y no el de aparición: con cuatro opciones el orden ya es
  información, y enterrar `untreated` la dejaría sin usar siendo la que toca casi siempre.
- **Botón (?) con la leyenda** (`DrinkableHelpButton` en `WaterHelp.tsx`). Incluye
  «desconeguda» aunque no sea un valor de `Drinkable`: es justo la que hay que distinguir
  a mano de «no tractada» —nadie lo ha mirado, frente a sabemos que nadie la trata— y sin
  esa fila la ayuda explicaría todo menos lo que de verdad se confunde. Cierra con la nota
  de que **ninguna fuente natural tiene garantía sanitaria**, que es lo que dicen los
  rótulos de la ACA y lo que hace entender la etiqueta de golpe.
- Las dos leyendas —tipo de fuente y potabilidad— se pintan desde **una sola función**
  (`BotonLeyenda`), no copiadas: dos diálogos separados se separan de verdad al primer
  arreglo, y el que se olvide solo se nota en uno de los dos. Por eso el fichero pasó de
  `WaterTypeHelp.tsx` a `WaterHelp.tsx`.
- Los tests fijan el `rawValue` **porque es el contrato del cable**: quitar el caso rompe
  la compilación y se ve, pero cambiarlo por `not_treated` compila perfectamente y deja un
  400 en la única pantalla donde se usa. Verificado rompiéndolo a propósito: los dos salen
  en rojo. Es el mismo fallo que dio un binario sin recompilar durante el desarrollo.

## Datos de fuentes
- **`fonts.name` es solo el topónimo y admite `NULL`.** «Pilgrimskällan» se conserva tal
  cual en cualquier idioma; un punto sin `name` en OSM no recibe «Vattenpost», «Font» ni
  ningún otro relleno. El cliente usa `nombreFuente()` y muestra una ausencia explícita
  en el idioma del lector. La migración solo abre la columna; `clear-placeholder-names
  --dry-run` mide los rellenos históricos y el mismo comando sin el flag los vacía, solo
  en importadas (`created_by IS NULL`) y por coincidencia exacta.
- Al importar de OSM, un **`natural=spring` sin ningún otro tag no es una fuente**: se
  miraron diez al azar por satélite y son charcos o nacimientos de riachuelo (2.318 de
  5.357 en la caja de Occitània). Valen los que llevan nombre, captación o potabilidad.
  Y fuera siempre `access=no|private`, que son captaciones de abastecimiento. La consulta
  con los filtros está en DEPLOY.md.
- Dos orígenes: **OpenStreetMap** (`import-fonts`, ODbL) y el **WFS abierto de la ACA**
  (`AIGUA:AIGUA_FONTS`, ~10.000 fuentes de Catalunya con topónimo oficial; es la capa que
  alimentaba la desaparecida app CercaFonts del ICGC). **La ACA autorizó el uso**; se atribuye
  con `© ICGC/ACA`. Runbook completo en [DEPLOY.md](DEPLOY.md).
- El `--dedupe 50` del importador **está medido, no elegido a ojo**: en la banda 25–50 m el
  80 % de los puntos son la misma fuente registrada dos veces. Antes de bajarlo, lee el
  porqué en DEPLOY.md. Las vecinas que sí eran distintas (80) se rescataron a mano.
- `scripts/fonts-import-tools.py` (Python sin dependencias): `filtra` lo que no son fuentes
  de beber, `llindar` mide en qué metro poner el `--dedupe`, y `rescata` saca las vecinas
  que sí eran fuentes distintas. Sirve para cualquier dataset nuevo, no solo el de la ACA.

## Importar por partes, y el resbalón que lo justifica

- **Un lote grande se importa por trozos**, cada uno con su **nombre de fichero propio** en
  la máquina. Importando Italia (69.782) se encadenó `sftp put` y `import-fonts` en una
  línea reutilizando el mismo nombre: el `put` falló («remote file already exists», que no
  sobreescribe por seguridad) y **el import se ejecutó igual sobre el fichero anterior**.
  8.728 fuentes entraron dos veces. Son dos órdenes distintas y la segunda no se entera del
  fallo de la primera; encadenarlas con `&&` o comprobar la salida es lo mínimo.
- `dedupe-imported` limpia eso, y está acotado a lo único que es seguro borrar: **sin
  creador**, **coordenadas idénticas hasta el último decimal** (no un radio: dos fuentes a
  3 m son dos fuentes, y eso lo decide el `--dedupe` del importador), se queda **la más
  antigua**, y solo si **no tiene nada colgando** — ni reseñas, ni incidencias, ni fotos, ni
  favoritos, ni ediciones. Si alguien ya aportó algo sobre una copia, deja de ser un
  duplicado inerte y pasa a ser trabajo de una persona.
- **`psql` está en la imagen de producción** (`Dockerfile`). Sin él, arreglar un destrozo en
  los datos exige escribir un comando, compilarlo y desplegar — media hora y un despliegue
  para un `DELETE`. No amplía el acceso de nadie: quien puede hacer `fly ssh console` ya
  tiene el `DATABASE_URL` en el entorno del proceso. Los arreglos **repetibles** siguen
  siendo comandos del binario, que quedan en el repo y se prueban; `psql` es para lo
  irrepetible y lo urgente.
- Italia: **69.701 clasificadas** en 102 provincias. Natural Earth da **provincias y no las
  20 regiones** —el mismo desajuste que en España— y con las erratas de siempre («Crotene»
  por Crotone, «Oristrano» por Oristano) más nombres en otro idioma («Turin», «Bozen»,
  «Aoste»). El rescate por cercanía aquí **no necesita 10 km como en los nórdicos**: 894 se
  salvan en el primer kilómetro y después ya casi nada, porque no hay archipiélagos que
  cubrir, solo precisión de costa.

## Carteles / campañas
- Cartel A5 en catalán en `flyer/` (HTML editable + PDF). `flyer/genera-cartells.py <codis>`
  genera una copia por pueblo con su QR y su código (`fontapp.net/?p=castellcir`).
- El código va **solo dentro del QR**: la dirección impresa es `fontapp.net` a secas,
  porque `fontapp.net/?p=castelltercol` no lo teclea nadie bien. Como no hay red de
  seguridad, `flyer/llegeix-qr.swift` decodifica los PDF con **Vision** (framework del
  sistema, no la librería que los dibuja: comparar segno con segno no demuestra nada) y
  sale con código ≠ 0 si algún cartel no lleva su código.
- Ojo al editar el cartel: tiene la altura fijada a 210 mm y **Chrome no pagina, recorta**.
  Añadir una línea empuja el pie fuera de la página sin dar ningún error.
- Ese código se guarda en `users.signup_source` al registrarse (primera visita gana) y se
  agrupa en el panel de administración. Sirve para saber qué cartel/campaña funciona, que es
  justo lo que el geo-IP del registro NO puede decir (resuelve a la cabecera de demarcación).
- Para las redes hay **enlaces cortos** en `web/public/_redirects` (Cloudflare Pages):
  `/in`, `/ig`, `/wa`, `/yt` → `/?p=linkedin|instagram|whatsapp|youtube`. Añadir un canal es
  una línea ahí, y **tiene que ir antes del catch-all del SPA** (`/* /index.html 200`) o se
  la come. Son **302 a propósito**: un enlace ya publicado en un vídeo o un post no se puede
  cambiar, así que hay que poder reapuntarlo. El código que se guarda es el largo
  (`youtube`, no `yt`) para que la tabla del panel se lea sola.

## Pendiente / deuda
- **TODO — verificar el correo de registro antes de permitir aportaciones.** Añadir
  `users.email_verified_at` y tokens de verificación aleatorios, de un solo uso, almacenados
  con hash y con caducidad. El alta y el login deben seguir funcionando, pero una cuenta sin
  verificar solo podrá explorar y gestionar su sesión: no podrá crear/editar fuentes, subir
  fotos, reseñar, confirmar estados ni denunciar contenido. La pantalla debe explicar el
  bloqueo y permitir reenviar el mensaje con rate-limit para que no se convierta en un relay
  de correo. El enlace tendrá una página de éxito/error localizada y no iniciará sesión por
  sí solo. Google marcará el correo como verificado únicamente cuando el proveedor entregue
  `email_verified=true`; futuros proveedores deberán aplicar la misma regla. Al desplegar,
  las cuentas existentes se marcarán como verificadas para no bloquear aportaciones previas.
  Hay que cubrir token caducado/usado, cambio de email (vuelve a quedar sin verificar),
  reenvío, enumeración de cuentas y el caso de dos altas simultáneas. No confundirlo con el
  correo de bienvenida actual: ese envío no prueba que el buzón pertenezca al usuario.
- **La gamificación NO carga la base de fuentes entera.** `ContributionScore.compute`
  hacía `Font.query(on: db).all()`: medido en producción con `gamification-sync
  --dry-run`, **698 MB de pico** para puntuar 115 reseñas y 97 ediciones, porque cargaba
  las **160.738** fuentes como modelos de Fluent. Con el trabajador encendido eso es un
  temporizador **dentro del proceso que sirve el HTTP**, así que a los 30 s de cada
  arranque la máquina se quedaba sin memoria: arranca → barre → OOM → reinicia, un bucle
  que se alimenta solo y deja `/fonts/in-bounds` devolviendo 500. Ahora se cargan **solo
  las que participan** —las que tienen creador (55), las que tienen foto (69) y las
  referidas por reseñas, incidencias o ediciones—: medido en local, **357 MB → 32 MB**, y
  ya no crece con el tamaño de la base.
  Cuidado al tocar esa lista: `add(...)` **descarta en silencio** la aportación cuya
  fuente no esté cargada, así que quedarse corto no da ningún error, solo deja de pagar
  gotas. La forma de comprobarlo es `score-contributions --json` antes y después y
  comparar byte a byte; está verificado que la comparación caza quitar cualquiera de las
  tres cláusulas.
  **El techo que le queda, dicho en voz alta:** una fuente entra en ese conjunto en cuanto
  alguien la reseña, la edita o le pone foto, así que si esto crece mucho el `select`
  acabará trayendo casi toda la base otra vez. Lo que pasa es que para entonces el
  problema ya no será el `select` sino el diseño: `compute` **recalcula el historial
  entero en cada barrido**, y con decenas de miles de reseñas eso no se sostiene ni
  cargando cero fuentes de más.
  La salida no es «traer solo las tocadas hoy» a secas — eso hoy **anularía las gotas de
  todo el mundo**, porque `ContributionLedger.sync` da por desaparecido (y anula) todo lo
  registrado que el cálculo no devuelve, y `compute` no sabe devolver un resultado
  parcial. Para hacerlo incremental hay que tocar las dos piezas a la vez: que `compute`
  diga **qué ámbito ha mirado** y que `sync` limite su comprobación de desaparecidas a ese
  mismo ámbito. La señal para plantearlo es el volumen de reseñas y ediciones, no el de
  fuentes.
- `ImportGeoJSONCommand` tenía el mismo problema y **está arreglado**: cargaba todas las
  fuentes como modelos y comparaba con un barrido lineal por cada punto del fichero. Ahora
  pide cuatro columnas por SQL y las indexa en una rejilla de ~1,1 km. Medido sobre 80.139
  fuentes y 2.792 puntos: **351 MB y 52 s → 61 MB y 5 s**, con la salida idéntica.
  Ojo con la rejilla: el número de celdas que hay que mirar a los lados **se corrige por el
  coseno de la latitud**, porque un grado de longitud mide menos según subes. Sin eso, a 68°
  y con `--dedupe 2000` los 200 duplicados de una prueba entraban **todos** como fuentes
  nuevas. Está verificado rompiéndolo. Y `cercana` devuelve la vecina de **menor índice**
  a propósito: reproduce el `first(where:)` que había y mantiene la importación
  determinista.
- **La memoria de las máquinas vive en `fly.toml`, no en `fly scale memory`.** Ese comando
  cambia las máquinas en marcha pero **no escribe el fichero**, así que el siguiente
  despliegue lo deshace — lo avisa el propio flyctl al ejecutarlo, y es fácil no leerlo.
  Pasó: estaba en 1 GB, se perdió, y con 512 MB el proceso se mata solo bajo el tráfico
  normal del mapa («Out of memory: Killed process (App) anon-rss:408360kB»). El ciclo es
  reconocible — arranca, sirve unos 40 s, se le agota el pool de conexiones, falla el
  health check y el kernel la mata a los 60 s—; con las dos máquinas ahí dentro Fly no
  tiene a quién enrutar y las lecturas del mapa devuelven **500**. En la web eso se ve
  como «falla la carga del GPX», que es donde se reportó, y manda a buscar el problema al
  sitio equivocado.
- **CI solo despliega el backend si el backend cambia.** Antes `deploy-backend` solo miraba
  la rama, así que un commit de front desplegaba igual: 22 minutos medidos para no cambiar
  nada, un reinicio que se lleva el rate limit y las cachés en memoria, y —lo caro— volver
  a aplicar `fly.toml` y deshacer cualquier `fly scale` hecho a mano. El filtro va por
  **exclusión** (`web/`, `flyer/`, `docs/`, `*.md`): con una lista de rutas de backend, una
  carpeta nueva sin apuntar dejaría de desplegarse en silencio. Ante la duda —rama nueva,
  force-push— se despliega.
- `R2ImageStorage` (Soto) **está en producción y funcionando** (comprobado el 18/08/2026: las
  fotos se sirven desde `pub-….r2.dev` con 200 y los cinco secretos `R2_*` están puestos).
  En local sigue usando disco. Ojo, `fly.toml` **no monta ningún volumen**: si R2 se cayera
  a disco local, las fotos se perderían en cada despliegue.
- Correo (`MailSender`): en dev `LogMailSender` (solo loguea); en prod `ResendMailSender` si hay `RESEND_API_KEY` + `MAIL_FROM` (requiere dominio propio con SPF/DKIM/DMARC). Los tres secretos (`RESEND_API_KEY`,
  `MAIL_FROM`, `MAIL_REPLY_TO`) **están puestos en producción**; que un envío llegue de
  verdad sigue sin comprobarse desde aquí.
  Plantillas en `Sources/App/Mail/`: bienvenida al registrarse (`WelcomeEmail`), reset de
  contraseña (`ResetEmail`, en AuthController), resumen semanal (`WeeklyDigest` calcula los
  datos, `WeeklyDigestEmail` los pinta) y **aviso de mención** (`MentionEmail` +
  `MentionNotifier`). Todas localizadas en los idiomas con correo; los correos sin
  petición del usuario usan `users.lang`. La baja va firmada con `APP_SECRET`
  (`UnsubscribeToken`) para que funcione desde el buzón, sin sesión; `?k=mentions`
  distingue de qué te das de baja y **sin ese parámetro es el resumen**, porque los
  enlaces ya enviados no lo llevan y viven para siempre en el buzón de alguien.
  Cambiar un rol desde el panel envía además `RoleChangedEmail` en `users.lang`, tanto al
  promover como al devolver a `user`, pero no si se guarda el mismo rol. Es un aviso
  transaccional y no lleva baja: comunica un cambio de permisos de la cuenta. Se manda en
  segundo plano después de guardar; un fallo de Resend se registra, pero nunca revierte el
  rol ni hace que el panel afirme que el cambio falló cuando ya está aplicado. El correo
  enumera los permisos efectivos del rol; al cambiar el modelo de permisos hay que mantener
  sincronizada la lista localizada de `RoleChangedEmail`.
- **Campana** (`Notification` + `NotificationController` → `GET /notifications`,
  `POST /notifications/read`, `NotificationBell.tsx`): avisos dentro de la app, privados y
  sin caché. Guarda **el texto ya resuelto** y no una referencia a la reseña: un aviso es
  una foto de lo que pasó, y con una referencia media bandeja se quedaría en blanco al
  primer borrado. `GET` **no marca como leído** —la app lo pide en cada carga y se
  vaciaría la campana antes de mirarla—; se marca al abrir el panel. El cliente pregunta
  al cargar y al volver la pestaña al primer plano, **no cada X segundos**: un sondeo es
  el gasto que esto viene a evitar.
  De paso, `GET /notifications` anota `users.last_seen_at` (como mucho una escritura por
  hora, `User.seenThrottle`) y **eso decide si además va un correo**: quien ha pasado por
  aquí en 3 días (`User.aroundWindow`) ya lo tiene en la campana y no se le escribe. Tres
  días y no tres horas porque esta app se usa cuando sales al monte, no a diario.
  Ojo: `users.mention_emails` es del **correo**, no de la campana — colarlo en la consulta
  de destinatarios dejaba sin avisos a quien solo había pedido no recibir correos.
- El **nombre de usuario se puede corregir** desde `/me` (`PUT /users/:id` ya lo permitía
  desde siempre; lo que faltaba era el formulario, y quien se dejaba una errata al
  registrarse se quedaba con ella). La regla de caracteres es
  `Mentions.isMentionable` —la **misma** que reconoce las menciones, o se podrían crear
  nombres a los que nadie puede responder— y **solo se aplica cuando el nombre cambia**:
  exigirla siempre dejaría a las cuentas antiguas sin poder guardar ni un interruptor de
  su perfil por un campo que no han tocado. Hay test de las dos mitades. El aviso de la
  interfaz dice lo que cuesta: el enlace viejo al perfil deja de funcionar, las menciones
  ya escritas apuntan a donde ya no estás, y es el nombre con el que entras.
- **Sugerencias al escribir `@`** (`GET /mentions?q=` + `MentionInput.tsx` +
  `lib/mentions.ts`): dos letras abren una lista de nombres. Va **solo en las tres cajas
  donde una mención hace algo** —las dos de reseña y la de incidencia—; la descripción no,
  porque el servidor no avisa de esas y sugerir ahí sería ofrecer avisar a alguien a quien
  nadie va a avisar. Misma paridad de siempre.
  La ruta es `/mentions` y **no `/users/search`**: `/users/:id` resuelve también por
  nombre, y `search` es un nombre válido según `isMentionable`, así que se comería a quien
  se llamara así. **Pide sesión**: los nombres ya se ven sobre contenido, pero un listado
  que se recorre letra a letra hasta sacar el censo es otra cosa; y mencionar solo lo hace
  quien escribe, o sea quien tiene sesión. Devuelve **solo el nombre**.
  La detección vive en `lib/mentions.ts` con tests (`scripts/mentions.test.ts`) porque es
  lo único con casos límite y todos fallan en silencio: el `@` de un correo, el cursor a
  mitad de palabra, dos menciones en la misma frase. Lleva el mismo `(?<![\w@.])` que el
  parser y que el servidor.
  Ojo con el ratón: la lista se elige con `onMouseDown` y no con `onClick`, porque el clic
  llega **después** del `blur` que ya la ha cerrado — con `onClick` no se elige nunca.
- **Un nombre que no se puede mencionar ya no se puede crear.** El registro solo
  comprobaba `.count(3...)`, así que «josé maría» entraba: no era cosa de cuentas
  antiguas, era la puerta de entrada. Y el daño no es «no se le puede mencionar» sino que
  la mención **acierta a otro**: `names(in:)` corta en el primer carácter que no vale, así
  que `@josé maría` menciona a `jos`, enlaza a su perfil y, si existe, le avisa a él.
  Ahora `create` aplica `Mentions.isMentionable` siempre. Las cuentas ya creadas se quedan
  como están —el nombre es con el que entran— y se corrigen desde `/me`. Para saber
  cuántas hay: `SELECT count(*) FROM users WHERE username !~ '^[a-zA-Z0-9_.-]{3,30}$'`.
## Errores del servidor, en el idioma de quien lee (`AppError` + `err.*`)

- Todos los errores viajaban como una frase **en castellano** dentro de `reason`, y el
  cliente la enseñaba tal cual. La app se lee en siete idiomas: a un portugués con el
  correo repetido le llegaba «El correo ya está registrado» — y es un mensaje que hay que
  **entender para poder arreglar** lo que has hecho mal.
- `AppError(status, code, reason)` lleva **las dos cosas**: el código (`user.emailTaken`),
  que es lo que el cliente traduce, y la frase en castellano, que se queda para quien
  llame a la API a pelo — `curl`, un script, un log —, donde un código suelto no dice
  nada. El código es **contrato**: renombrarlo rompe a quien tenga una versión vieja
  cargada.
- Es **aditivo a propósito**: `code` es opcional, así que los `Abort` sin convertir siguen
  igual y el cliente cae en la frase del servidor. Con 86 sitios, eso es la diferencia
  entre hacerlo y no hacerlo. Hoy hay **28 convertidos**, los que alcanza un usuario
  normal; lo de administradores y las validaciones de API se quedaron fuera.
- **`CodedErrorMiddleware` sustituye al de Vapor, no se añade al lado.** Vapor mete su
  `ErrorMiddleware` por su cuenta y, al quedar **por dentro**, atrapa el error primero y
  lo convierte en respuesta: el nuestro no lo ve nunca y el `code` no sale. Se descubrió
  porque las respuestas seguían llegando sin él. Por eso `app.middleware = .init()` y se
  monta la pila entera, con **CORS por fuera de los errores** — sin eso, el navegador
  convierte un 409 legible en un fallo de CORS y el usuario no ve el motivo.
- En el cliente, `traduceCodigo` devuelve **`null`** cuando no hay traducción, y ese
  `null` es todo el diseño: `t()` devuelve la clave cruda si falta, así que un código
  nuevo —o uno viejo en un cliente sin actualizar— pintaría «err.user.emailTaken» dentro
  de un Alert. Misma regla que los nombres de país en `lib/countries.ts`.
- Los códigos de capacidad salen del **`rawValue` del propio enum**
  (`capability.retireFont`) y no escritos en los siete sitios que llaman: una lista
  paralela se separa del enum a la primera capacidad nueva.
- `ApiError` y `describeError` se movieron a `lib/apiError.ts`. No es orden por gusto:
  `api/client.ts` lee `import.meta.env` al cargarse y **no se puede importar desde un test
  de Node**, que es justo lo que hay que probar. `scripts/errors.test.ts` cubre las dos
  mitades — código conocido gana, código desconocido cae en la frase.
- Al convertir un error nuevo hay que añadir su clave `err.<código>` en los seis
  diccionarios. Si se olvida no se rompe nada visible, que es exactamente por qué conviene
  acordarse.

- La regla del nombre se comprueba **también en el cliente**, en el registro y en `/me`
  (`lib/username.ts`, con tests). No es defensa —el servidor ya lo rechaza— sino idioma y
  momento: **todos los `reason` de esta API están en castellano** y la app se lee en siete
  idiomas, así que un francés registrándose como «José» recibía la regla en un idioma que
  no es el suyo. Y llegaba **después** de enviar el formulario, o sea con todo que
  rellenar otra vez por una letra. Ahora la regla se ve siempre bajo el campo, traducida,
  y en rojo solo cuando de verdad está mal. El error del servidor queda de red de
  seguridad para quien llame a la API directamente.
  Reutiliza la clave `profile.usernameRules`, que ya existía en los siete idiomas; el
  nombre de la clave se queda aunque ahora también la use el registro, porque renombrarla
  en siete diccionarios no arregla nada.
  Pendiente y **más ancho que esto**: el resto de errores del servidor (correo repetido,
  usuario en uso) siguen llegando en castellano a todo el mundo. Se arregla devolviendo un
  código traducible, no frase a frase.
- **El nombre de usuario se busca sin distinguir mayúsculas** (`User.findByUsername`).
  Las dos mitades de una mención decían cosas distintas: `MentionNotifier` ya resolvía en
  minúsculas —`@sebas` avisa a `Sebas`— pero `/users/:id` comparaba exacto, así que el
  enlace que se pinta en el texto llevaba a un **404**: recibías el aviso y, al ir a
  mirar, tu propio perfil no existía. Medido en producción: `sebas` → 404 y `Sebas` → 200,
  y **4 de 15 autores recientes** llevan mayúsculas.
  La **unicidad también** es insensible ahora, o se podían crear `sebas` y `Sebas` y la
  búsqueda pasaba a ser ambigua (comprobado que hoy no hay ninguna pareja así).
  Va por `lower() = lower()` y **no** por `ILIKE`: los nombres admiten `_`, que en `LIKE`
  es un comodín de un carácter, así que `Dani_Ccir` habría casado con `DaniXCcir`.
- **Un nombre de usuario que es un correo burla `emailPublic`.** Esa preferencia nace
  apagada y el perfil oculta el campo `email` como debe… mientras el mismo correo está al
  lado como nombre, firmando cada reseña en público. Son **2 de 15** en producción. Las
  cuentas nuevas ya no pueden (`@` no está en el juego de caracteres), y a las que existen
  **no se las puede renombrar** —el nombre es con el que entran y `PUT /users/:id` es
  self-only—, así que lo único posible es avisarles: `ProfilePage` pinta un aviso si su
  nombre parece un correo, y otro distinto si no es mencionable por otra razón (espacios).
  Solo lo ve a quien le toca.
- **Menciones** (`Utils/Mentions.swift`): `@nombre` en una reseña o incidencia se pinta
  como enlace al perfil (`AuthorLine.tsx`) y avisa por correo. La regla del servidor y la
  del cliente tienen que decir lo mismo o se subraya a quien no se avisa; las dos llevan
  `(?<![\w@.])` para que `hola@fontapp.net` **no** sea una mención (hay test). Tope de 3
  por mensaje —sin él es un envío masivo gratis—, nunca a ti mismo, solo a quien lo tenga
  encendido (`users.mention_emails`, nace **a true**: un aviso que hay que activar antes
  no llega nunca) y en **su** idioma. Se lanza después de guardar y sin esperar: perder
  la reseña por no poder mandar un correo sería absurdo.
- Los mensajes del equipo van **firmados**: `CommentResponse.staff` / `ReportResponse.staff`
  llevan el rol solo si quien escribe no es `user`, y la ficha lo pinta con el violeta de
  `StaffBadge`. Es una exposición más estrecha que hacer público `UserResponse.role` —que
  se calla a propósito—: acompaña a un mensaje escrito en público, no responde «qué cargo
  tiene esta persona» sobre cualquiera.
  **La etiqueta dice «Equipo», no el rol** (`staff.tag`). Pintaba `role.<rol>`, así que en
  público salía «PROPIETARIO» en morado al lado de un aviso sobre una fuente: queda raro y
  además publica quién es el owner, que es justo lo que `UserResponse.role` se calla. Lo
  que este distintivo existe para decir es «esto lo firma alguien de FontApp», que es lo
  mismo que ya ponía su tooltip. `StaffTag` **no recibe el rol** y no lo deja en ningún
  `data-role`: no se filtra por el DOM lo que se ha quitado de la etiqueta. El chip de tu
  propia barra sí lo conserva ahí, porque esa barra solo la ve tu sesión. Los nombres de
  los roles siguen existiendo donde importan: la tabla de `RolesHelp` y el panel.
- **El service worker y el origen de la API.** El SW es un fichero estático de `public/`,
  así que Vite **no** lo procesa y no puede leer `VITE_API_URL`. Enrutaba la API con
  `pathname.startsWith('/api')`, que solo acierta en **desarrollo** (proxy de Vite en el
  mismo origen): en producción el backend está en `fontapp.fly.dev` y hay un `return` para
  todo lo ajeno, así que **no se cacheaba ni una respuesta** — comprobado en producción, el
  caché `fontapp-api-v2` ni existía. Sin cobertura la app abría y no tenía ni una fuente.
  Ahora el origen viaja en la URL de registro (`/sw.js?api=…`), que sobrevive a que el
  navegador mate y reviva el SW; un `postMessage` no, porque el dato viviría en memoria.
- **Nada autenticado se cachea**: la caché del SW la comparten todas las sesiones del
  navegador. Se mira la cabecera `Authorization` y no una lista de rutas — la lista ya se
  había quedado vieja (solo contemplaba `/gamification/me`, y `/notifications` se habría
  cacheado en cuanto el enrutado funcionara). La lista se mantiene como segunda barrera.
- **Teselas: todas las capas**, no solo OSM (`TILE_HOSTS`). Antes quien caminaba con el
  topográfico del IGN —el que rotula las fuentes con su topónimo— se quedaba sin mapa al
  perder cobertura. Al añadir una capa hay que tocar `mapLayers.ts` **y** `sw.js`, y el
  primero lo avisa.
- `scripts/sw-routing.test.ts` carga el `sw.js` con un `self` de mentira y le pregunta por
  sus decisiones. No registra nada —eso no se puede en un test— pero cubre justo donde
  estaba el fallo, que era lógica pura y nunca dio la cara.
- **Lo que sigue sin cumplirse del cartel:** un caché no descarga lo que no has mirado, así
  que «funciona sin cobertura» depende de haber pasado antes por la zona. Para prometerlo
  de verdad haría falta una **descarga de zona** explícita.
- **Service worker y redirecciones:** un SW no puede devolver una respuesta marcada como
  redirigida (WebKit: «Response served by service worker has redirections») y la marca
  sobrevive a la Cache API. `/index.html` responde **308 hacia `/`** en Cloudflare Pages,
  así que el `addAll` del precache dejaba el shell envenenado y la app fallaba al quedarse
  sin cobertura. Se pide `/` y se guarda bajo las dos claves; `sinRedirecciones()` limpia
  cualquier respuesta antes de cachearla o devolverla. **Al tocar el SW hay que subir la
  versión del caché** (`fontapp-shell-vN`) o los usuarios se quedan con lo viejo.
- Compresión de imágenes: en el cliente (canvas). El borrado del fichero al eliminar fuente/reseña es best-effort (`try?`).
- Roles jerárquicos (`users.role`, ver `UserRole`): `user` < `moderator` < `admin` < `owner`,
  comprobados por umbral (`user.canModerate`/`isAdmin`/`isOwner`). Moderador: modera contenido ajeno
  (reseñas, incidencias, denuncias `content_flags`); admin: gestiona fuentes y ve estadísticas; owner:
  asigna roles (`/users/staff`, `PUT /users/:id/role`). El `owner` solo se fija por CLI
  (`swift run App set-role <username> owner`), no desde la web. La columna `is_admin` queda como legacy.
- Rate-limit en `/auth/*` (en memoria, por IP) y limpieza periódica de tokens caducados (cada 6 h).
  Las fotos tienen una cuota aparte de **30/h por usuario autenticado**, coherente con las
  30 fuentes/h: un rechazo no prolonga la ventana y responde `Retry-After` con el tiempo
  real restante. Los demás límites siguen siendo por IP salvo que indiquen lo contrario.
  A escala multi-instancia el rate-limit debería ir a Redis.
- **Defensa antiabuso de fuentes:** crear se limita por usuario (30/h; cuentas de menos de
  una semana, 5/día), el nombre propio es opcional y rechaza enlaces, y se avisa si hay otra
  fuente a ≤25 m antes de aceptar una confirmación expresa. Una denuncia por usuario y fuente;
  tres usuarios distintos ponen la ficha en `moderation_state=pending` y la sacan de todas las
  lecturas públicas sin sancionar aún al autor. Moderador+ confirma spam/falsa/abuso o restaura;
  cada ocultación confirmada suma un aviso (2 → 7 días sin publicar, 3+ → 365 días). Owner puede
  levantar o fijar restricciones desde `/admin/users`. Todo cambio queda en
  `moderation_actions`; nunca se borra la ficha ni se mezclan abuso, duplicado y retirada física.
  Una restricción activa bloquea **todas** las aportaciones (alta/edición de fuente, fotos,
  reseñas, confirmaciones, incidencias, denuncias y capacidades por nivel), pero no borrar
  contenido propio ni deshacer acciones. Ocultar por abuso anula las `contribution_events`
  ligadas a la fuente, incluso si estaban liquidadas; restaurar repone su estado anterior
  usando `settled_at`. Una infracción confirmada sin restaurar bloquea además todas las
  capacidades por nivel durante 90 días desde la decisión de moderación.
- **La cola de moderación vive en `/admin/moderation`.** No pinta una fila por denuncia:
  agrupa `content_flags` por objetivo y enseña número de denunciantes, contenido, foto,
  fuente relacionada, coordenadas y el contexto mínimo del autor (antigüedad, avisos y
  restricción). Desde ahí se puede aprobar, ocultar una fuente de forma reversible, borrar
  una reseña/foto denunciada o —solo owner— restringir aportaciones siete días. Las rutas
  de escritura son las mismas de la ficha y `/admin/users`; la página no abre una segunda
  puerta con reglas distintas.
- La pestaña **«Cuentas nuevas» es vigilancia, no una acusación**: `GET
  /fonts/moderation/queue` devuelve como máximo 50 fuentes de los últimos siete días que
  se añadieron durante la primera semana de la cuenta. Solo visibles y nunca importadas.
  Aprobarlas no cambia el dato ni al usuario: registra `action=review` en la tabla
  `moderation_actions` que ya existía y deja de mostrarlas a todos los moderadores. Por
  eso esta mejora no lleva migración. El carril de denuncias permanece separado y es el
  único que puede poner automáticamente una fuente en cuarentena.
- Ubicación de registro (`GeoLocator`): al crear cuenta se deduce país/región/ciudad de la IP
  (solo estadística; nunca se guarda la IP). Noop en dev; en prod `IPAPIGeoLocator` (ip-api.com,
  **tercero**, uso no comercial) con `GEOIP_ENABLED=true`. Alternativa futura: BD local MaxMind
  GeoLite2 (`.mmdb`) → sin llamada externa por registro y la IP no sale del servidor. Ver `docs/api.md`.
- Zona de la fuente: `fonts.country` y `fonts.region` (migración `AddRegionToFont`, nullable) para
  funciones por zona (admins por región, filtros). **`region` NO es la primera división
  administrativa**, aunque aquí se dijo durante meses que sí: contiene lo que Natural Earth
  llame «admin-1» en cada país, y eso son cosas distintas. Medido en producción: 52
  regiones en España (**provincias**, las 50 + Ceuta y Melilla), 20 en Portugal
  (**distritos**), 4 en Francia (**départements**, no régions) y 7 en Andorra
  (**parròquies**). Tres profundidades mezcladas en una columna.
  La columna `admin1` guarda el **código ISO 3166-2**
  (`ES-CT`, `PT-11`, `FR-OCC`), *sin tocar* `region` —que es carga estructural: sale en el
  JSON público de `Font`, en `/zones`, en `/zones/ranking?region=`, en el correo semanal y
  en la insignia de Catalunya—. Un código y no un nombre por lo mismo que el resto de la
  gamificación, y porque el nombre ya nos costó el diccionario de dos grafías de
  `catalanRegions`. Se deriva **de `region` con una tabla estática** (`Admin1`: las 159
  combinaciones medidas en producción para siete países, dos grafías históricas locales
  y los 26 cantones suizos preparados antes de su importación) y no por point-in-polygon: una
  provincia está dentro de una comunidad por
  definición, no por dónde caiga un polígono, y usar geometría para una pregunta definitoria
  mete un error que no hace falta (el borde de Natural Earth falla 1,9 km de mediana).
  Sirve para **agrupar** `/zones`, para moderadores por región y para
  simplificar la insignia; **no** para las barras ni el ranking, que se quedan en provincia
  porque Catalunya son 15.675 fuentes y esa barra se mueve aún menos que la de Barcelona.
  Al **crear** una fuente se heredan de la fuente clasificada más cercana (≤55 km, en
  segundo plano; ver `FontController.inheritZone`): instantáneo y sin cargar fronteras en
  el servidor. Si en la zona no hay ninguna clasificada, quedan nulas (no se inventa nada).
  La autoridad sigue siendo `populate-regions`, que corrige los casos de frontera.
  Se pueblan **offline** con `populate-regions <fronteras.geojson>` (point-in-polygon contra Natural
  Earth admin-1 o GADM nivel 1; sin terceros). Distinto del `GeoLocator`, que es país por IP del
  registro, no por coordenadas del punto. `backfill-admin1` audita por defecto y **se
  niega a escribir si aparece una sola demarcación desconocida**; `--apply` escribe todo
  en una transacción. Pendiente: el modelo de permisos de moderadores por región.

## Texto escrito por la gente (`lib/richText.ts` + `TextoRico`)

- Descripciones, reseñas e incidencias pintan sus **direcciones web y sus `@menciones`**
  como enlaces. Un tokenizador puro (`tokeniza`) devuelve trozos y el componente hace
  elementos de React: **no se genera HTML en ningún punto**, así que no hay camino por el
  que un texto de usuario acabe siendo marcado.
- **No se gana por nivel, y se pensó.** La dirección ya se ve escrita, así que un candado
  ahí no impide copiarla — solo estorba a quien viene de buenas. Lo que mueve el spam de
  enlaces es el SEO, y eso lo corta `rel="nofollow ugc"`, no un nivel; para el abuso ya
  están las denuncias y los moderadores. Además haría que la misma frase se viera distinta
  según quién la escribe. Es coherente con la regla de la escalera: los niveles dan poder
  sobre el mapa, no sobre las personas.
- **La descripción NO lleva menciones** (`menciones={false}`): el servidor solo avisa de
  las de reseñas e incidencias, y subrayar a alguien a quien nadie va a avisar es justo lo
  que la paridad cliente/servidor existe para impedir.
- Que el esquema esté **dentro de la expresión regular** es la defensa: `javascript:` y
  `data:` no pueden coincidir. No es una comprobación posterior que se pueda olvidar.
- Los paréntesis se **cuentan**, no se recortan: `…/wiki/Fuente_(arquitectura)` termina en
  uno que sí es suyo y `(mira …/wiki/Font)` en uno que no. Y los enlaces se buscan **antes**
  que las menciones, o el `@algu` de `https://x.com/@algu` parte el enlace por la mitad.
- **`web/` ya tiene tests**: `npm test` → `node --test scripts/*.test.ts`, con el runner y
  el soporte de TypeScript **nativos de Node 24**, sin ninguna dependencia. Van dentro de
  `npm run build`, así que también corren en CI. Aquí sí valía la pena montar esto —lo que
  antes no— porque un parser tiene casos límite que se rompen en silencio.

## «Esta pantalla ha fallado» al desplegar (`lib/staleChunk.ts`)

- **El catch-all del SPA se tragaba los ficheros que faltan.** Con `/* /index.html 200` a
  secas, pedir `/assets/index-XXXXXXXX.js` devolvía **200 con el `index.html`** y
  `content-type: text/html` — medido en producción. El navegador recibe HTML donde esperaba
  un módulo, no lo puede interpretar, y la pantalla cae en la barrera de error.
- A quién le pasa: **a cualquier pestaña abierta desde antes del último despliegue**. Las
  páginas se cargan en trozos con huella en el nombre, y al desplegar esas huellas cambian.
  El síntoma es exactamente el que se reportó: «me sale muchas veces al cargar una página o
  al hacer clic en un botón», y con varios despliegues seguidos en una tarde le pasa a todo
  el mundo.
- **Y NO se arregla con una regla en `_redirects`.** Se intentó (`/assets/* → /404.html
  404`) y **tumbó producción entera**: Cloudflare Pages le da un significado especial al
  fichero `404.html` y lo sirve para cualquier ruta que no sea un fichero, **por delante
  del catch-all del SPA**. Medido: `/login`, `/gpx`, `/zones`, `/activity` y todas las
  fichas devolvían 404. La portada seguía bien, que es lo que hace que tarde en verse.
  Antes de eso, la misma regla con destino `/assets/:splat` se descartaba en silencio por
  bucle. Dos intentos, dos formas de fallar: el aviso está escrito en `_redirects`.
- La vista recordada del mapa se valida con `parseSavedMapView` antes de entregarla a
  Leaflet. Un JSON válido pero incompleto (`{}`), no finito o fuera de rango se descarta:
  de lo contrario Leaflet lanza al montar y solo la portada cae en `ErrorBoundary`.
- Lo que **sí** funciona es el lado del cliente, y es suficiente: reconoce el HTML servido
  como si fuera un módulo y recarga.
- Y no se pinta como un error de la pantalla, porque **no lo es**: es una versión caducada.
  Se recarga sola, y se coge por dos sitios: el `vite:preloadError`, que llega antes de que
  React lance, y la propia barrera como red de seguridad.
- **El tope no es «una recarga por pestaña», es una cada 30 s.** La primera versión permitía
  una sola y era demasiado estricto: quien deja la pestaña abierta un día entero pasa por
  varios despliegues, y a partir del segundo se le enseñaba el error en vez de recargar —le
  pasó al autor con el mapa. Lo que hay que evitar es el **bucle**, que reaparece al
  instante; recargar dos veces con horas de diferencia es lo correcto. La marca va en
  `sessionStorage`, que muere con la pestaña: en `localStorage` dejaría a esa persona sin
  poder recargar nunca más si el fallo fuera real.
- Cuando **no** se puede recargar (hace menos de 30 s que se hizo), la barrera enseña un
  mensaje distinto: «la aplicación se ha actualizado, recarga para seguir». Decir «esta
  pantalla ha fallado» ahí le echa la culpa a la página que la persona acaba de abrir y la
  manda a buscar el problema donde no está.
- **Se reconoce por el texto del error**, que es feo y es lo que hay: no existe un tipo para
  esto y cada navegador lo dice a su manera. Están cubiertas las tres formas conocidas, más
  el `Unexpected token '<'` que produce justamente el caso de Cloudflare. Hay test de que un
  error normal —un `undefined.algo`, un fallo de hooks— **no** se confunde: si se
  confundiera, un fallo real se taparía con una recarga y volvería a fallar.

## Compartir y buscadores (Cloudflare Pages Functions)

- La web es un SPA: **un** `index.html` para las 60.000 fichas, así que todas compartían
  `<title>`, `og:title`, `og:image` y un `og:url` fijo a la portada. El botón de compartir
  de la ficha ya existía (`navigator.share`), o sea que el canal estaba montado y roto por
  el otro extremo: mandabas una fuente por WhatsApp y salía una tarjeta genérica que
  además enlazaba a otro sitio.
- `web/functions/fonts/[id].ts` reescribe seis etiquetas del `<head>` al vuelo con
  `HTMLRewriter`. **No es SSR** — la página la sigue pintando React; esto es streaming y
  no cuesta nada. Reglas: si algo falla se devuelve la página tal cual (lo peor posible es
  volver a la tarjeta de antes) y las **escondidas llevan `noindex`** (una duplicada
  indexada compite con la buena y pierden las dos).
  Ojo: las `twitter:*` **ya existen** en `index.html`, así que se **reescriben**, no se
  añaden — con la etiqueta repetida los scrapers cogen la primera, que es la genérica. Y
  el `og:image:width/height` de 1200×630 se **quita** cuando la foto es de la fuente: la
  hizo alguien con el móvil y es vertical la mitad de las veces.
- **El idioma de una tarjeta viaja en la URL** (`?lang=ca|es|gl|eu|en|fr|pt|it`). Un scraper
  de WhatsApp no ejecuta React, no ve `localStorage` y su `Accept-Language` pertenece al
  robot, no a quien comparte. `web/functions/_middleware.ts` localiza la tarjeta genérica
  y la función de la ficha localiza sus textos de respaldo; si la fuente tiene foto, esa
  foto sigue mandando. `I18nContext` también respeta el parámetro al abrir el enlace.
- Hay ocho imágenes de 1200×630, `og-card-{idioma}.jpg`. Los accesos cortos `/waca`,
  `/waes`, `/wagl`, `/waeu`, `/waen`, `/wafr`, `/wapt` y `/wait` redirigen con 302 al idioma
  correspondiente y añaden `p=whatsapp`; el botón directo de WhatsApp usa esos accesos.
  Los demás botones comparten la URL concreta con `lang`, mediante `enlaceLocalizado`.
- `web/functions/sitemap.xml.ts` + `GET /sitemap/fonts` (`SitemapController`). Se genera al
  vuelo y no en el build: si no, cada foto nueva sería una página que Google no conoce
  hasta el siguiente `git push`. Va cacheado 1 h en el borde.
- **Qué se ofrece a indexar: lo que ha tocado una persona** (foto, reseña, `created_by` no
  nulo o alguna edición), y muy explícitamente **no** «lo que tiene descripción». Medido:
  de 9.935 fuentes con descripción, **9.692 son la atribución del importador** («© ICGC/ACA»,
  «Manantial (OpenStreetMap)»), la misma cadena miles de veces. Con la regla buena, 553.
  Hay test (`testSitemapOnlyListsFountainsAPersonHasTouched`) para que nadie vuelva a meter
  `description` en la condición.
- `web/public/robots.txt` es un fichero real: sin él, el catch-all del SPA devolvía el
  `index.html`. En Pages los estáticos ganan al catch-all, por eso no hay que tocar
  `_redirects`.
- Las funciones **se comprueban con `tsc`** (`tsconfig.functions.json` +
  `@cloudflare/workers-types`, solo tipos). Antes `tsc -b` solo miraba `src/` y esto habría
  ido a producción sin ninguna comprobación; el typecheck pescó seis errores a la primera.
  Usan `VITE_API_URL` —Pages expone las variables del panel también en ejecución—, así que
  no hay que configurar nada nuevo.

## EXIF de las fotos (`PhotoExif`, solo moderación)

- Al subir, el cliente lee del fichero **original** la fecha (`DateTimeOriginal`) y las
  coordenadas y las manda en campos aparte de `POST /images`. Aparte **porque la imagen ya
  no las lleva**: `compressImage` reencoda con canvas y eso borra todo el EXIF.
- `prepararFoto()` (`lib/image.ts`) es el único sitio donde se prepara una foto, y existe
  para que **el orden deje de ser una decisión**: leer el EXIF después de comprimir
  devuelve vacío, no da ningún error y solo se nota meses después.
- Una **tabla** (`photo_exif`) y no columnas: hay cuatro sitios de los que cuelga una foto
  y todos pasan por el mismo endpoint. Se indexa por el **UUID del nombre del fichero**,
  que es lo único estable entre el disco local y R2.
- La fecha viaja como **texto ISO**, no como `Date`: el decodificador multipart de Vapor no
  promete ninguna estrategia y enterarse en producción sería tarde. Hay test.
- **La fila se guarda siempre**, aunque venga toda vacía. Así «no hay fila» significa
  «subida antes de que esto existiera» y no se confunde con «no traía EXIF», que es **lo
  normal**: lo que pasa por mensajería llega limpio, las capturas no tienen y iOS lo quita
  al compartir. Hay test de esta mitad también.
- `GET /images/meta?ids=` es **solo admin** (403 al resto, incluso a quien subió la foto).
  En la interfaz, `PhotoExifNote` bajo cada foto. Enseña **la distancia a la fuente** y no
  las coordenadas: «a 12 m» se entiende de un vistazo y saca de la pantalla el dato
  personal que no hace falta.
- **Lo afirma el cliente y no se puede verificar** — cualquier editor reescribe el EXIF.
  Misma categoría que `queued_offline` y misma regla: orienta a una persona, **nunca anula
  puntos por sí solo**. No hay ningún automatismo leyendo esta tabla y no debe haberlo.
- La página legal lo dice en los siete idiomas. Decía «tu ubicación precisa **no se
  almacena**», y esto lo habría vuelto falso.

## «En camino»: el confeti y la vitrina contaban cosas distintas

- La felicitación usa `GET /gamification/badges/preview`, que cuenta **lo pendiente**
  (`provisionalBadges: true`) para poder celebrar en el momento de aportar y no tres días
  después. La vitrina y el perfil cuentan **solo lo liquidado**. Las dos tenían razón por
  separado, y juntas producían esto: confeti por una insignia y, al ir a mirarla, la misma
  insignia **en gris y con candado** durante 72 h. Le pasó al autor de la app y lo leyó
  como una avería — con razón.
- `BadgeSlot.pendingTier` lo arregla: `/gamification/me` marca las casillas que ya están
  ganadas contando lo pendiente, y la vitrina las pinta **en color, sin candado y con un
  chip «en camino»**. Nada se adelanta hacia fuera: el perfil público sigue enseñando solo
  lo liquidado.
- **Y el nivel igual** (`Profile.pendingLevel`): el mismo desajuste lo tenía el peldaño, y
  se quedó sin arreglar en la primera pasada. La felicitación celebraba «has subido de
  nivel» contando lo pendiente y la tarjeta seguía enseñando el nivel viejo hasta 72 h
  después. Ahora sale un chip «Río en camino» al lado del actual. Solo a quien es: el
  perfil público sigue diciendo el liquidado, y hay test de las dos mitades.
- Cuesta **dos pasadas** de `ContributionLedger.profile`. Se acepta a propósito: es una
  ruta autenticada y sobre los eventos de una sola persona, y fusionarlas obligaría a
  partir en dos el recuento dentro de `profile`, que es la función más delicada del
  sistema, para ahorrar una consulta que nadie nota.
- **Aviso de diseño, no de código**: `catalonia.png` y `regions.png` son casi el mismo
  dibujo —hexágono, marco dorado, rosa de los vientos, mapa— y `counties` se llama
  «Comarques», que es la palabra de las divisiones de Catalunya. A 150 px y con confeti
  delante, se confunden. Conviene redibujar una de las dos.

## Seguir una fuente (`FontWatchNotifier`)

- **Avisar de algo te pone la fuente en favoritas** (`FontFavorite.follow`, desde
  `FontReportController.create`). Sin esto, quien reporta un fallo **escribe al vacío**:
  los avisos van a quien la tiene en favoritas y reportar no lo hacía. Pasó de verdad —
  alguien avisó de que una fuente constaba como potable sin serlo, se le contestó en la
  propia ficha, no se enteró, y hubo que escribirle un correo a mano. Quien se molesta en
  avisar de que algo está mal es exactamente la persona a la que quieres poder responder.
  Solo al **crear**, sin duplicar, y con `try?`: perder la incidencia por no poder marcar
  una favorita sería absurdo. Ojo con lo que **no** hace: no recuerda que alguien la
  quitara a mano, así que reportar otra cosa la vuelve a marcar. Se acepta; para que
  dejara de pasar habría que guardar el «no la quiero», que hoy no existe.
- **Estrella amarilla, no marcapáginas, y «favoritas», no «guardar».** «Guardar» describía
  el gesto y no lo que significa; una estrella la entiende cualquiera sin leer el rótulo.
  Además ahora la marca pasa sola al reportar, y «se ha añadido a tus favoritas» se
  explica mejor que «se ha guardado». Son cinco cadenas en siete idiomas y un icono; la
  relación y el endpoint (`FontFavorite`, `/fonts/:id/favorite`) **no cambian de nombre**,
  que sería churn sin ganancia.


- **Guardar una fuente es seguirla.** No hay tabla de suscripciones: la relación ya
  existía (`FontFavorite`, el botón de la ficha y la lista de `/me`). Guardar una fuente y
  querer saber si se seca son la misma intención dicha dos veces; separarlas obligaría a
  elegir entre dos palabras para lo mismo. GitHub distingue *star* de *watch* porque un
  repo se mueve cada día — aquí una fuente cambia unas pocas veces al año. Si el volumen
  molesta algún día, la salida es un interruptor sobre la relación que ya hay, no una nueva.
- Avisa de: **reseña** (con el estado del agua si lo trae), **incidencia**, **incidencia
  resuelta** y **escondida** (duplicada o retirada). Esa última es la más importante: la
  fuente desaparece del mapa y quien la tenía apuntada para el domingo debe enterarse.
- **Nunca al que lo provoca.** Es la forma más rápida de que la campana se vuelva ruido, y
  hay test.
- El aviso guarda un **código** (`review:dry`, `report`, `hidden:retired`), no una frase:
  misma regla que `StaleGuardedNotifier`, el servidor no sabe en qué idioma lees. Lo
  compone `queHaPasado()` en `NotificationBell`, y un código desconocido cae en un genérico
  en vez de pintar la clave cruda — los avisos viejos sobreviven a un servidor nuevo.
- `FontReportController.autoResolve` devuelve ahora **si de verdad cerró algo**: «la
  incidencia se ha resuelto» sobre una fuente que no tenía ninguna no es una noticia.
- **Sin correo, a propósito**: cada envío cuesta y esto se dispara a menudo. El enganche
  está señalado con un solo bloque en `FontWatchNotifier`, con las cuatro cosas que faltan
  escritas allí (columna `watch_emails` naciendo a true, la regla de `isAround`, plantilla
  con `?k=watch` en `UnsubscribeToken`, y agrupar: cinco reseñas en una tarde son un correo
  y no cinco).

## Interrupciones (`lib/asks.ts`)

- **Como mucho un aviso a la vez.** Cada uno se escribió por su cuenta y ninguno sabía de
  los otros: en una primera visita se apilaban tres en seis segundos —presentación,
  «añádela a la pantalla de inicio» (3 s) y encuesta de la app nativa (6 s)— y en 393 px la
  encuesta **tapaba el segundo botón de la presentación**, que es la llamada a crear una
  cuenta. Justo lo que ve quien escanea el QR de un cartel.
- `useTurno(quién, listo)`: el componente calcula sus propias condiciones y la cola decide
  el turno por prioridad (`intro`/`welcome` → `badge` → `install` → `interest`). Al cerrarse
  uno entra el siguiente. Añadir un aviso mañana es una línea en `PRIORIDAD`, y por eso ya
  no puede volver a haber solapes por descuido.
- El orden **no es por urgencia técnica sino por lo que cada uno se ha ganado el derecho a
  interrumpir**: primero lo que explica qué es esto, luego el premio por algo que acabas de
  hacer, y al final los dos que piden un favor.
- Y hay puerta de entrada, no solo orden: **instalar** a partir de la 2ª visita y la
  **encuesta** a partir de la 3ª (`sesiones()`, contadas con `sessionStorage`). Nadie
  instala algo que ha visto una vez, y preguntarle a un desconocido si querría una app
  nativa es pedirle una opinión que aún no puede tener mientras le gastas el único momento
  en que te atendía.
- El estado vive en un módulo y no en un contexto: son cinco componentes en dos árboles
  (`App` y `Layout`) y un proveedor tendría que envolver los dos para nada más.

## «Qué hay de nuevo» (`lib/whatsNew.ts`)

- **Nuevo para ti, no nuevo en el calendario.** Lo natural es enseñar un «NUEVO» durante
  una semana desde el despliegue, y mide el tiempo equivocado: el del *release* y no el de
  la persona. Con un plazo fijo, a quien **instala hoy** le saldría «NUEVO» sobre tres
  cosas cuando para él la app **entera** es nueva —le señala lo accesorio antes que lo
  básico—, y a quien **lleva seis meses** y vuelve al octavo día no le sale nada siendo
  justo a quien había que avisar.
- Se guarda **qué versión de novedades ha leído** cada uno. `VERSION_NOVEDADES` se sube al
  añadir algo que merezca contarse y **no en cada despliegue**: si se subiera siempre, el
  aviso saldría por un arreglo de un margen y dejaría de creerse.
- **El diálogo solo se le enseña a quien ya usaba la app** (`sesiones() > 1`). A quien llega
  hoy no: tiene el de bienvenida, y contarle «novedades» de algo que nunca ha tenido es
  ruido. Ojo con el caso que parece un detalle y es el que hace que esto funcione la primera
  vez: **sin marca y con visitas previas, sí** — si no, nadie se comería el aviso nunca,
  porque al publicarlo nadie tiene marca todavía.
- **Va en la cola de `lib/asks`**, con `news` entre `badge` e `install`: detrás del premio
  —tapar una insignia recién ganada con un changelog es cambiar algo suyo por algo nuestro—
  y delante de los que piden un favor.
- **Los distintivos «nuevo» se encienden AL LEER el aviso, no antes**, y duran
  `SESIONES_CON_DISTINTIVO` visitas **suyas**. La primera versión lo hacía al revés y por
  eso **no los veía nadie**: quedaban detrás del modal y se apagaban en el mismo gesto que
  lo cerraba. Se descubrió probándolo entero — el diálogo salía perfecto y el distintivo no
  aparecía jamás. Repartidos así las dos piezas se complementan: el diálogo **cuenta** qué
  hay de nuevo y los distintivos **enseñan dónde está** las siguientes veces que entras.
- Se cuenta en sesiones y no en días por lo mismo de siempre: quien abre la app una vez al
  mes tiene tres aperturas para verlos, no tres días.
- Un distintivo cuya clave ya no está en `NOVEDADES` **no se pinta**: si no, sobreviviría
  al borrado de su novedad y se quedaría puesto para siempre.
- Los cambios en `localStorage` no repintan React, así que el distintivo aparece en la
  **siguiente** carga, no en la misma en que se cierra el diálogo. Encaja con el diseño y
  conviene saberlo antes de perseguirlo como un fallo.

## Onboarding inicial

- `WelcomeDialog` da una visión completa pero digerible en tres páginas controladas por
  la persona: encontrar y leer una fuente; confirmar/cambiar/añadir; uso sin cobertura y
  qué significan Gota y las gotas. Se puede omitir desde la primera página.
- Se descartó el experimento de popovers contextuales (**24/08/2026**): dependían de que
  existiera un pin o un botón concreto en el DOM. Con el mapa de densidad, clusters o una
  ficha aún cargando aparecían unas veces sí y otras no; además explicaban una acción sin
  permitir completarla allí mismo. Una ayuda contextual futura solo vale si nace de la
  acción que la persona acaba de iniciar y se completa en esa misma pantalla.
- La bienvenida aparece al crear una cuenta con contraseña y también cuando Google crea
  una (`LoginResponse.isNewUser`), pero nunca en posteriores inicios de sesión.

## Instalar la app (`lib/install.ts` + `/install`)

- **Los avisos de arriba no pueden ir en flujo.** `InstallPrompt` se pintaba entre la
  barra y `<main>` como una banda normal, y eso rompe el mapa: su alto es
  `100dvh - --alto-barra - --bajo-el-mapa`, una resta que da por hecho que ahí en medio
  no hay nada. Medido: metiendo esa banda, el fondo del mapa cae en 832 con la tab bar
  empezando en 756 —**76 px de mapa y sus botones tapados**— y la página desborda 20 px.
  Se vio en un iPhone ajeno, no aquí. Ahora son tarjetas flotantes bajo la barra: **tapan
  en vez de empujar**, que en una página con scroll cuesta el encabezado durante un rato.
- **En el mapa no tapan nada: los overlays de arriba bajan.** La franja publica su alto en
  `--alto-avisos` y lo suman el buscador, los controles y la tarjeta de cercanas, que es
  todo lo que cuelga del borde de arriba. Mismo trato que `--bajo-el-mapa` da a lo anclado
  abajo, y **quien añada otro overlay arriba tiene que sumarla**. Con la franja vacía vale
  `0px` y no se mueve nada.
- El alto **se mide, no se calcula**: son uno o dos avisos y cuántas líneas ocupa cada uno
  depende del idioma y del ancho. Cuelga del ciclo de React —el aviso entra, mide; se va,
  mide; cambia el texto, mide— más un `resize` para cuando el móvil gira.
- Se escribió primero con `ResizeObserver`, que es lo natural, y **se cambió porque no se
  pudo verificar**: en el navegador con el que se comprobó esto no entrega ni una llamada
  (medido aparte con un div que pasa de 10 a 50 px: cero disparos), porque su entrega va
  atada al ciclo de pintado. Igual en un móvil va perfecto, pero eso es justo lo que no se
  puede afirmar sin verlo, y el fallo sería **silencioso**: los avisos taparían los botones
  y no saltaría ningún error.
- **Cuidado: nada de `transition` en un `top` que salga de un `var()`.** Se puso para que
  los controles deslizaran en vez de saltar, y con la transición puesta el motor **no
  recalcula el valor** al cambiar la variable — medido: la variable llegaba al elemento con
  182 px y el `top` calculado se quedaba en 110, el anterior, o sea que los controles se
  quedaban debajo del aviso. Si algún día se quiere la animación, sobre `transform` y
  comprobada en un WebKit de verdad.
- **La posición vive en `FranjaDeAvisos` (`Avisos.tsx`) y no en cada aviso.** Son dos —el
  de instalar y el de aportaciones sin enviar (`PendingUploads`)— y **pueden coincidir**:
  el segundo no pasa por la cola de `lib/asks` porque no es una petición sino un estado, y
  decirte que algo tuyo está sin enviar no es opcional. Con `fixed` en cada uno se pintaban
  encima el uno del otro; como hijos de la franja se apilan solos y el que se añada mañana
  no tiene que acordarse de nada. El orden es de urgencia: primero lo tuyo sin enviar,
  después el que pide un favor. La caja (`TarjetaDeAviso`) también es compartida.
- Va **arriba y no abajo**, al revés que el resto de lo flotante de esta app, porque abajo
  ya están la tab bar, los toasts, la píldora de sin cobertura y la barra de Safari: en un
  iPhone serían tres bandas apiladas. Arriba es además donde el aviso ya estaba, así que
  nada cambia de sitio.
- Del mismo día y la misma familia: el Snackbar de `AppInterestBanner` **tapaba la tab bar
  entera**. MUI ancla los Snackbar a `bottom: 0` en pantallas estrechas y la tab bar llegó
  después. Se levanta con `--bajo-el-mapa`, que es la variable que existe justo para esto.
  **Cualquier cosa anclada abajo tiene que usarla.**
- **Un aviso que se ve una vez no enseña nada.** Observado sobre amigos y familia: lo
  cierran sin leerlo, y después no había ningún sitio donde volver a mirarlo. Por eso
  existe `/install` (`InstallPage.tsx`), permanente, enlazada desde el **pie** y desde el
  **cajón (⋮)**. El cajón no es redundante: en móvil el pie no se pinta en el mapa, que es
  justo donde está la gente. Ninguno de los dos aparece si ya está instalada.
  El aviso flotante se queda: interrumpe una vez, la página está siempre.
- La página enseña **primero el dispositivo en el que estás** y las otras plataformas
  plegadas —sirven para explicárselo a alguien por teléfono, que es el caso que trae aquí.
- **En el iPhone solo vale Safari**, y eso es una rama propia (`iosOtro`), no un matiz:
  Chrome y Firefox para iOS no traen «añadir a la pantalla de inicio», así que darles los
  pasos de Safari es mandarles a buscar un botón que no existe y que concluyan que la app
  está rota.
- Toda la detección vive en `lib/install.ts` y no repetida en los dos componentes:
  equivocarse aquí es caro y silencioso (ofrecer instalar a quien ya la tiene, dar pasos
  de Safari a quien está en Chrome) y una segunda copia se queda vieja sola.
- `plataforma()` pregunta por **Android antes que por iOS**. `esIOS()` lleva la heurística
  de iPadOS —«platform MacIntel + pantalla táctil»—, que un navegador con emulación de
  móvil cumple sin ser un iPad; se vio al probar esta página. Un iPad de verdad nunca lleva
  «Android» en la UA, así que el orden no quita ningún caso y elimina el error caro.
- El botón de instalación real solo existe en Chromium y **solo una vez**: `beforeinstallprompt`
  se consume al usarlo. Quien lo pida tiene que saber vivir sin él — cuando falta, quedan
  las instrucciones a mano, nunca las dos cosas a la vez.

## Actualizar una PWA suspendida (`AppUpdatePrompt`)

- Si una pantalla cae, `ErrorBoundary` limpia únicamente los cachés
  `fontapp-shell-*` antes de recargar. No borra autenticación, teselas, API offline ni
  la bandeja de salida. Esto recupera instalaciones cuyo bundle quedó obsoleto aunque
  una pestaña de incógnito funcione correctamente.

- iOS puede reanimar durante días el **mismo proceso y el mismo JavaScript** de una PWA.
  Que el service worker nuevo se instale no sustituye el código que ya está ejecutándose,
  y `sw.js` además no cambia en la mayoría de despliegues.
- Cada build genera por eso un identificador compartido: Vite lo incrusta como
  `__BUILD_ID__` y publica el mismo valor en `/version.json`. `_headers` marca ese fichero
  `no-store`; la petición lleva además una query única para atravesar cachés intermedias.
- `AppUpdatePrompt` lo consulta al arrancar y al volver del segundo plano (`visibilitychange`,
  `pageshow`, `focus` y recuperación de red), con un minuto mínimo entre comprobaciones.
  Si no coincide, aparece en `FranjaDeAvisos`, entre la bandeja pendiente y el aviso de
  instalación.
- **Nunca recarga sola.** Una actualización automática puede tirar un formulario o una
  foto todavía sin enviar. El usuario pulsa «Actualizar»; antes se pide al navegador que
  compruebe también el service worker y después se recarga la navegación, que es
  network-first. Cerrar el aviso solo lo calla para ese build mientras el componente siga
  montado: una apertura futura lo vuelve a ofrecer si sigue en la versión antigua.
- La comprobación está apagada en desarrollo. `version.json` solo existe en el build de
  producción y el aviso solo aparece en una **PWA instalada** (`display-mode: standalone`
  o el modo standalone de iOS), nunca en una pestaña normal. Antes de navegar verifica
  que el HTML y sus assets ya estén publicados; si la propagación no ha terminado,
  conserva la versión actual y permite reintentar en vez de dejar una pantalla blanca.

## El hueco de la tab bar en iOS (sin resolver, con sonda)

- **Síntoma reportado**: en el primer arranque de la app instalada en un iPhone queda una
  franja en blanco en la barra de abajo, y **se arregla al tocar otra pestaña**.
- **No se ha reproducido, y no se ha intentado adivinar.** Tres causas distintas dan
  exactamente el mismo síntoma: que `env(safe-area-inset-bottom)` valga 0 en el primer
  pintado y pase a 34 después; que la ventana mida de más durante la transición desde la
  pantalla de inicio, de modo que lo fijado abajo se coloque contra un alto que luego
  cambia; o que el inset esté bien y falle otra cosa. Se distinguen mirando **cuándo**
  cambia cada medida, no cuál es.
- El simulador **no sirve** para esto: no reporta los insets igual que un aparato real, y
  montarlo habría acabado sin poder afirmar nada — el mismo callejón que `ResizeObserver`
  en la franja de avisos.
- Por eso `SafeAreaProbe.tsx`: se enciende con `?debug=safearea`, **se queda encendida en
  `localStorage`** —la app instalada arranca siempre en `/` sin parámetros, así que un
  flag que solo viviera en la URL no llegaría nunca al arranque que hay que observar— y
  toma muestras en `t=0`, 300 ms, 1500 ms, **al primer toque** (el gesto que según el
  informe lo arregla) y al volver del segundo plano. Se apaga con `?debug=off`.
- Va en `position: fixed`, que no es un detalle: en flujo empujaría la página y falsearía
  justo lo que mide.
- Lo que hay que mirar es `huecoBajoLaBarra` (si no es 0, la barra no llega al borde) y
  `acolchadoDeLaBarra` comparado con `insetAbajo`: acolchado 0 con inset 34 significa que
  el `pb: env(...)` de `TabBar` no se aplicó a tiempo.
- **Antes que nada, `standalone`.** La primera medición llegó entera con `standalone=false`
  —tomada en una pestaña de Safari y no en la app instalada—, y en esa condición el fallo
  no existe: todo salía coherente y sin hueco. Se lee como «ya no pasa» cuando lo que
  pasa es que se mira el sitio equivocado. Por eso el panel ahora lo avisa en rojo y
  arriba del todo. En Safari los insets valen 0 con normalidad: su propia barra ocupa esa
  franja.

## Peso de las fotos (decisión aplazada, con disparador)

- Hay **un solo tamaño** por foto: `compressImage` a 1280 px y calidad 0,72. Esa misma
  imagen se usa para la ficha, la `og:image` de la tarjeta de WhatsApp **y** los mosaicos
  de 176 px de la rejilla de novedades y la galería.
- Se planteó generar una miniatura y se **descartó por ahora, midiendo**. El cálculo a ojo
  («385 KB para pintar 180 px») exageraba: medido sobre lo que de verdad se pinta, el
  desperdicio es **~3×**, no un orden de magnitud —`maxDim` es un techo y muchas fotos
  entran por debajo—, y **las 24 imágenes van con `loading="lazy"`**, así que los 6 MB del
  feed solo los paga quien lo recorre entero.
- **El disparador**: `node web/scripts/peso-fotos.mjs`. Más de **25 fotos distintas** en el
  feed por defecto o más de **8 MB** en total. Hoy: 16 fotos y 6,0 MB (media 386 KB).
  Crece solo si la tarjeta de entorno funciona y la gente empieza a subir fotos, que es
  justamente cuando compensa.
- **Qué hacer cuando toque**: la miniatura sale de `prepararFoto()` —único sitio por el que
  pasa una foto, así que las cinco rutas de subida la heredan— a ~320 px y se guarda como
  `<uuid>_t.jpg`. La rejilla y la galería la piden con respaldo `onError` a la grande, de
  modo que **las fotos viejas siguen funcionando sin migración ni columna nueva**.
- **A quién NO ayuda**, para no volver a discutirlo: el mapa (no carga fotos), la ficha
  (quiere la grande) y la `og:image` (también).
- Ojo al medirlo desde el navegador: R2 no manda `Timing-Allow-Origin`, así que
  `transferSize` sale **0** y parece que las fotos no pesan nada. Hay que ir por
  `Content-Length`, que es lo que hace el script.

## Comarca ≠ provincia (y `fonts.region` no es ninguna de las dos, siempre)

- **`fonts.region` no guarda comarcas.** Medido en producción: 52 valores en España
  (**provincias**, las 50 más Ceuta y Melilla), 20 en Portugal (distritos), 4 en Francia
  (départements) y 7 en Andorra (parròquies). En Catalunya hay **exactamente cuatro**
  valores. Catalunya tiene 42 comarques y en la base no hay ni una.
- La palabra «comarca» estaba en **7 cadenas de interfaz** y en 31 comentarios, incluida
  una que decía «sales del ranking de tu comarca» cuando el ranking es por provincia. Se
  ha sustituido por **«demarcación»** en todas partes, que es la palabra que ya usaba
  `/zones` y la única lo bastante neutra para cubrir provincia, distrito, département y
  parròquia a la vez — porque **no es un solo nivel administrativo**.
- La insignia pasó de `counties`/«Comarcas» a **`regions`/«Demarcaciones»**, clave incluida:
  dejar `counties` en el código era garantizar que alguien volviera a traducir «comarques».
  Su explicación lleva ahora un ejemplo («Barcelona, Bizkaia y Cádiz ya son tres»), que es
  lo que hace entender de golpe que no va de Catalunya.
- Renombrar la clave hace que quien ya la tuviera vea **una celebración más** (la vitrina
  compara por `familia:grado` en `localStorage`). Asumido: es cierta y son nueve personas.

## Confianza del estado de una fuente

- Es una categoría explicable, no una puntuación opaca: **confirmada**, **informe
  reciente**, **datos contradictorios**, **información antigua** o **sin comprobar**.
- La ventana de actualidad es de 30 días. Una confirmación («sigue igual») refresca el
  último parte. Para quedar confirmada hace falta una confirmación independiente o dos
  autores identificados distintos con partes recientes. El autor **no puede confirmar
  su propia reseña**: la API devuelve 403, el cliente no ofrece el botón y cualquier
  autoconfirmación histórica se ignora al contar apoyos y calcular frescura.
- `flowing` y `trickle` forman la familia «hay agua»; `dry`, `broken` y `gone`, la familia
  incompatible «no disponible». Si ambas aparecen recientemente, prevalece
  **contradictoria**, incluso aunque el último parte tenga apoyos.
- El backend resume la evidencia en `FontSummary`; la ficha reconstruye la misma regla
  con sus reseñas. Toda lógica vive en `web/src/lib/confidence.ts`.
- El mapa ofrece **Solo confirmadas**. El filtro excluye las recientes sin respaldo, las
  contradictorias, las antiguas y las nunca comprobadas.

## No hacer
- No commitear `.build/`, secrets ni `env.*` (salvo `env.development`).
- No poner el proyecto en iCloud Drive (rompe builds y satura la sincronización).
- No añadir dependencias sin justificarlo en el PR. (`leaflet-rotate`: sin mantenimiento
  desde 2023, pero es la única forma de girar Leaflet sin cambiar de motor de mapas.)
