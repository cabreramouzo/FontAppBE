# FontAppBE

App para localizar **fuentes de agua** cercanas por geolocalización ("font" = fuente,
no tipografía), con usuarios, incidencias y reseñas de estado (estrellas / estado del agua / foto).
El contrato real de la API está en [docs/api.md](docs/api.md); el brief original en [definitions.md](definitions.md).
Las opciones y principios para financiar el proyecto están en [docs/monetizacion.md](docs/monetizacion.md);
el plan de la vía territorial —la vista para ayuntamientos— en [docs/ayuntamientos.md](docs/ayuntamientos.md).

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
- Tests de los scripts de shell: `./scripts/toca-backend.test.sh` (a quién despliega CI) y
  `./scripts/backup-fotos.test.sh` (las dos defensas del backup). No hay runner de bash en
  el repo y no hace falta: son dos ficheros que se ejecutan y salen con código ≠ 0.
  El de CI se prueba **contra los commits reales del historial** y no con casos inventados,
  porque el fallo que evita es de clasificación —qué cuenta como «solo front»— y los
  commits de verdad traen las mezclas que a nadie se le ocurren al inventar (front más
  CLAUDE.md, backend más traducciones, un push con varios encima).
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
- Informe de un municipio: `swift run App municipal-report <ine|nombre> [--out dir] [--dry-run]`
  (resumen + CSV + GeoJSON + JSON). Es el **paso 2 de la validación** del producto
  territorial, no un panel: ver [docs/ayuntamientos.md](docs/ayuntamientos.md). Con un
  nombre ambiguo **no elige**, lista los códigos INE y para — elegir por su cuenta sería
  darle a un ayuntamiento el inventario de otro. Y sus cifras **en local mienten**:
  `seed --demo` deja Moià con un 91,8 % comprobado cuando producción va por el 0,2 %.
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
    **Se ve como `/me`**: los mismos títulos con icono (`TituloDeSeccion`), las mismas
    filas (`FilaDeFuente`: emoji del tipo + municipio) y el mismo rayado. El bloque del
    nivel se queda **sin icono**, igual que «Tu aportación», porque tiene el escudo
    dibujado justo debajo. Y de paso sus dos listas pasan por `ListaConTope`, que **no
    tenían tope ninguno**: pintaban las 83 reseñas de una cuenta activa de una sentada —
    el mismo fallo que ya se corrigió en el perfil propio, y aquí peor, porque esta
    página la abre gente que no es esa persona.
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
  Desde el panel de moderación son **1 día o 7** (`?days=`), y 1 va primero y relleno
  porque es el caso normal: alguien delante de un pueblo con quince fuentes por apuntar
  necesita terminar hoy, y siete días es conceder mucho más de lo que se pidió. Sin el
  parámetro siguen siendo 7, para que un cliente sin actualizar conceda lo que promete su
  botón. Cualquier otra duración se rechaza — sin eso, un `?days=3650` daba diez años.
  **No es «hasta medianoche»** aunque suene mejor: el servidor va en UTC y esta base va de
  Chile a Italia, así que la medianoche de aquí corta la tarde en Santiago y regala dos
  horas en Roma. Un día es un día en cualquier huso, y además es exactamente la ventana
  del cupo que levanta, que ya son 24 h móviles.
  **Y el aviso va en los dos sentidos.** Al pulsar «estoy on fire», los administradores
  reciben campana y push (`OnFireNotifier`, enganchado en
  `UserController.requestSourceLimitExemption`): es el aviso **más perecedero** de la app
  —quien lo pulsa está en la calle, ahora, con fuentes por apuntar— y antes la solicitud
  caía en el panel de moderación y se quedaba hasta que a alguien se le ocurría mirar. El
  push lleva **cuántas fuentes lleva hoy**, que es el dato con el que se decide, y va
  directo a `/admin/moderation`, que es donde se concede. No hace falta controlar
  repeticiones: la ruta ya devuelve 204 sin guardar nada si esa persona tiene una solicitud
  abierta. Nunca a quien lo pide, aunque sea admin.
  **Y se avisa a quien lo pidió** (`SourceLimitNotifier`, campana + push desde el
  panel y desde la consola). Antes se concedía y por su lado **no cambiaba nada visible**:
  o lo volvía a pedir, o dejaba de intentarlo creyendo que le habían dicho que no. El
  aviso lleva **la fecha en ISO** y no una frase — el servidor no sabe qué hora es para ti,
  y el navegador sí. Hay test de las dos mitades.
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
- **Los mensajes de commit van en inglés**, siempre, aunque el resto del repositorio
  —código, comentarios, CLAUDE.md y esta misma línea— esté en catalán o castellano. El
  historial es lo único de aquí que se lee desde fuera: en un `git log`, un `blame`, una
  PR o un informe de fallo. Lo demás lo lee quien ya está dentro del proyecto.
  El cuerpo también, no solo el asunto: es donde está el porqué, que es la parte que se
  consulta meses después. Y sigue valiendo la regla de siempre —qué se midió, qué se
  descartó y por qué—; lo que cambia es el idioma, no la exigencia.
  Ojo: **los commits anteriores a esta línea están en castellano** y no se reescriben.
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

## Objetivos táctiles: 44 px en móvil, y vive en el tema

- La guía de Apple fija **44 pt** como mínimo para cualquier cosa que se toque, y los
  **tamaños por defecto de MUI están por debajo**. Medido a 375 px recorriendo la app: el
  menú de los tres puntos a **34**, los botones pequeños a **31**, los chips pulsables a
  **32**, los interruptores a **38**, las filas del ranking de zonas a **36** y los FAB del
  mapa a **40**. No era ningún componente mal puesto: era el tema.
- Por eso el arreglo vive en `theme/MuiProvider.tsx` (`objetivosTactiles`) y no pantalla
  por pantalla: `MuiIconButton`, `MuiButton`, `MuiFab`, `MuiSwitch`, `MuiCardActionArea`,
  `MuiListItemButton` y los `MuiChip` **pulsables**. Repartido por las pantallas habría que
  acordarse en cada botón nuevo, y el que se olvide no rompe nada — solo deja un objetivo
  que falla una de cada cinco veces con el pulgar en marcha.
- **Solo hasta `sm`.** En escritorio el ratón apunta fino y estirarlo todo a 44 hincharía
  interfaces densas (el ranking son cien filas) por un problema que allí no existe. Mismo
  corte que el resto de la app.
- **Los chips NO pulsables se quedan como están**: son etiquetas —el estado del agua en las
  tarjetas de novedades, el `beta` del logotipo— y agrandarlas no ayuda a nadie. La
  distinción la da `MuiChip-clickable`, que MUI ya marca.
- **Los pines del mapa eran el peor caso** y son el objetivo más pulsado de la app: 26×38.
  Ahora llevan margen transparente hasta 44×44 (`statusMarker.ts`) y **el dibujo no cambia**
  — pines más gordos taparían el mapa y en una ciudad se solaparían hasta hacerlo ilegible.
  El margen va **arriba** y no abajo: la punta tiene que seguir clavada en el punto, y de
  paso la zona crece hacia donde viene el pulgar. Precio asumido: en zonas densas las zonas
  sensibles vecinas se solapan y gana la de encima, que es mejor que fallar el toque.
- Lo que el tema **no** alcanza y hay que hacer a mano: los `Box component="button"`, que
  no pasan por `MuiButton` (la vitrina de insignias y el «verlas todas» de las listas). Si
  se añade otro, hay que acordarse.
- **Y 44 no se aplica a ciegas: lo estético también cuenta.** La primera pasada lo metió en
  todo y rompió tres sitios, reportados con capturas:
  · el distintivo **EQUIPO** de la cabecera se convirtió en un bloque morado enorme. Se
    sale de la regla **a propósito** (`'&&': { minHeight: 22 }` en `StaffBadge`): es una
    etiqueta de estado cuyo clic es un atajo, y la guía pide 44 para lo que se pulsa, no
    para lo que se lee.
  · los **interruptores** se deformaron: estirar el `root` de `MuiSwitch` no agranda la
    zona sensible, agranda la caja, y el dibujo vive dentro del acolchado. Ahora llevan la
    forma «estilo iOS» que propone la documentación de MUI (pista de 46×28, pulgar de 24) y
    **el objetivo de 44 lo pone la fila** (`MuiFormControlLabel`), que es lo que se toca de
    verdad y lo que hacen los ajustes de un teléfono.
    Y ojo con `size="small"`: es **otra variante** de MUI con sus propias medidas, y el
    estilo del tema solo viste la normal — los tres interruptores de los grupos de avisos
    se quedaron con el pulgar descuadrado respecto a los de arriba. Se les quitó: la
    jerarquía la marca la indentación, no el tamaño. Si se añade un `Switch` nuevo, sin
    variante.
  · los **chips de insignia del marcador** quedaron con las filas separadísimas, y es el
    mismo error visto desde el otro lado: el envoltorio pulsable (`Abrible`) subía a 44
    mientras la píldora se quedaba en 24, así que cada fila arrastraba **20 px muertos** y
    ocho insignias ocupaban 200 px de aire. Con un escudo redondo eso está bien —el dibujo
    se centra y la zona sensible crece sin verse—; con una píldora ancha no. Se sale de la
    regla por la puerta de `StaffBadge`: es una **etiqueta cuyo clic es un atajo**, y el
    mismo visor se abre desde «ver toda la colección» y desde `/me/badges`, los dos con
    objetivos de sobra. Medido: las filas pasan de **50 a 30 px**. Solo afecta al
    `redondo={false}`, que lo usa un único sitio.
  · la **casilla de la lista del GPX** se descuadró: iba dentro de un flex con
    `alignItems: baseline` y `flexWrap`, así que al pasar el nombre de la fuente a la línea
    siguiente se quedaba sola arriba. Ahora es una columna aparte centrada, y el kilómetro
    y el nombre envuelven juntos sin arrastrarla.
- Comprobado midiendo en siete rutas —mapa, `/me`, `/me/badges`, ajustes, novedades, zonas
  y GPX—: **cero controles por debajo de 44**.

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
- **`html` y `body` NO pueden llevar `height: 100%`.** Lo llevaban desde que la app era
  solo el mapa y ninguna página se desplazaba («se comporta como una app», decía el
  comentario). Hoy casi todas se desplazan, y entonces esa regla fija el documento a **un
  viewport exacto** con el contenido midiendo mucho más — medido en producción en
  `/zones`: html y body a **812 px** con **67.998 px** de contenido. Blink lo tolera;
  **WebKit no**: ancla ahí los `position: fixed`, así que la tab bar viaja con el
  contenido al hacer scroll y sube hasta media pantalla. Reportado desde un iPhone.
  El alto de pantalla lo pone `.app` con `min-height: 100dvh`, que es su sitio; html y
  body se quedan en `min-height: 100%` para cubrir las páginas cortas.
  Ojo al buscarlo: **en Chrome no se reproduce**, la barra se queda clavada con la regla
  mala puesta. Por eso `scripts/layout-css.test.ts` va sobre el CSS y no sobre la
  posición: una comprobación de posición pasaría en verde con el fallo dentro.
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
- **Los controles del mapa van arriba del todo también en móvil**, a la altura del
  buscador y no debajo. Bajaban 90 px para esquivar la barra de búsqueda a lo ancho, y esa
  barra ya no existe: desde que buscar es una pantalla entera, en móvil solo queda un
  círculo de 48 px a la izquierda. Los dos comparten la franja sin tocarse — medido a
  375 px: el buscador ocupa 12–60 y los botones 315–363, y la columna arranca **78 px más
  arriba**. En escritorio no cambia nada (píldora a la izquierda, controles a la derecha).
  Ojo al medirlo en el navegador: al cambiar el tamaño de la ventana **`useMediaQuery` no
  se reevalúa** en el panel de vista previa, así que el buscador se queda en su forma de
  escritorio y parece que los dos se solapan. Hay que **recargar** después de cambiar el
  tamaño; sin eso la medida dice lo contrario de lo que pasa en un móvil de verdad.
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
- **Y el tramo seco se dice DOS veces**, porque la primera cifra es optimista. La original
  cuenta todas las fuentes del corredor —incluidas las que no ha comprobado nadie nunca, que
  en esta base son casi todas, y las que constan **secas**—; la segunda solo las que pasan
  `constaAgua` (sale agua, es reciente y tiene respaldo). La diferencia no es cosmética:
  medido con una ruta de 14 km por Barcelona, «2,0 km» pasa a **«14,2 km», el recorrido
  entero**, con 167 fuentes por el camino y ninguna comprobada. Ésa es la cifra que decide
  si llevas un bidón o dos. Solo se pinta si de verdad cambia algo.
- **La subida más larga sin agua** (`subidaEntre` + `tramosSecos`): cinco kilómetros en
  llano y cinco cuesta arriba no son lo mismo, y el perfil ya lo enseña pero solo a quien
  sabe leerlo. Se busca por **desnivel** y no por longitud, así que casi nunca es el mismo
  tramo. Suma el positivo acumulado y **no** la resta de los extremos —un tramo que sube,
  baja y vuelve a subir se pedalea entero— e interpola los extremos, porque un hueco empieza
  donde hay una fuente y eso casi nunca cae en un vértice del perfil. Se calla sin altitudes
  en el GPX y por debajo de 100 m, que es un repecho y no una subida.
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
- **Al recorrer el perfil, el mapa marca el mismo punto** (`lib/routeScrub.ts`), como
  Wikiloc. Lo pidió el autor con una captura, y cierra el hueco entre las dos vistas: el
  perfil dice a qué altura estás y el mapa dónde, pero hasta ahora había que adivinar la
  correspondencia.
  **El kilómetro viaja por un módulo con suscripción y NO por el estado de la página.**
  Recorrer el perfil dispara decenas de eventos por segundo, y subiéndolo al padre común
  se repintaría también la lista de fuentes —más de cien filas con sus chips— en cada uno.
  Es el mismo argumento por el que `lib/asks.ts` vive en un módulo. Medido con un
  `MutationObserver` sobre las dos zonas durante 31 movimientos: **0 mutaciones en la
  lista y 1.686 en el mapa**.
  Se publica el kilómetro de **la marca** y no el del dedo: sobre una fuente la marca se
  imanta a ella, y si el mapa siguiera al dedo las dos marcas del mismo sitio estarían en
  puntos distintos. Y se publica desde un efecto y no desde el manejador, porque
  `fuenteCerca` se calcula durante el render — avisando antes se enviaría el imantado del
  movimiento anterior, el mismo render de retraso que ya obligó a rehacer la marca.
  `coordenadaEnKm` **interpola** entre los dos vértices que rodean el kilómetro en vez de
  saltar al más cercano: un GPX simplificado tiene los vértices a cientos de metros y el
  punto del mapa avanzaría a saltos mientras el del perfil va suave. Usa el mismo
  haversine que `largoKm`, o los dos puntos se irían separando a lo largo del recorrido.
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
  enlace a una fuente concreta.
- **La última vista se guarda en los DOS almacenes, y significan cosas distintas**
  (`vistaAlAbrir` en `lib/mapView.ts`, con tests). `sessionStorage` es **estado de
  navegación**: existe porque venías del detalle o de una búsqueda, y por eso desactiva la
  ubicación automática. `localStorage` es solo el **respaldo al abrir en frío** y no dice
  nada de tu intención. Antes solo estaba el primero, que muere al cerrar la app, así que
  cada apertura caía en `DEFAULT_CENTER` — **Madrid a zoom 5**. Lo tapaba la ubicación
  automática, pero en iOS el permiso de ubicación de una web **caduca cada 24 h**, así que
  ahí ese respaldo no existe y el mapa aparecía en Madrid todas las mañanas; reportado por
  alguien con la PWA instalada. Confundir los dos es el error fácil y es **silencioso**: si
  el respaldo contara como «venías de otro sitio», la ubicación automática no volvería a
  ejecutarse nunca más tras la primera visita. Hay test de las dos mitades, verificado
  rompiéndolo. El mapa te sigue hasta que tocas el mapa: arrastrar o
  hacer zoom desengancha el seguimiento; el botón «centrar en mí» lo vuelve a activar.
- **Con una pulsación larga sobre el mapa se añade una fuente ahí** (`LongPressToAdd`).
  Es el gesto que cualquiera espera de un mapa y, sobre todo, **quita pasos de la única
  acción que importa**: con el botón hay que pulsarlo, esperar a que el pin caiga donde
  decida el algoritmo y arrastrarlo hasta el sitio.
  **Manda sobre el GPS a propósito**: `newFontPosition` pone el pin en tu posición si el
  centro está a menos de 250 m —y hace bien, porque el caso normal es estar delante— pero
  una pulsación larga es la intención más explícita que existe. El aviso de distancia del
  formulario sigue saliendo, que es lo que protege de colocar una fuente a diez kilómetros.
  **Se detecta a mano y no con `contextmenu`**: Leaflet solo convierte la pulsación larga
  en ese evento en **Safari móvil** (su `tapHold`), así que en Android Chrome no llegaría
  nunca y encima saldría el menú del navegador. Con `touchstart`/`touchend` va igual en los
  dos. En escritorio se usa el botón derecho, que sí es `contextmenu`.
  **El pin se ve medio segundo antes de que salga el formulario**
  (`ESPERA_ANTES_DEL_FORMULARIO_MS`). Se probaron dos segundos y se hacen largos en cada
  alta —el gesto ya ha costado otro medio segundo de pulsación—; con medio basta para
  verlo caer. Y el pin es **el mismo azul** que una fuente sin comprobar
  (`statusIcon(null)`), que es lo que va a ser: con el marcador por defecto de Leaflet
  salía un pin de otro estilo y la fuente que estabas creando parecía de otra cosa. Esto se pidió al principio, se resolvió de otra
  manera —desplazando el mapa— y se volvió a reportar: en móvil el formulario **tapa el
  73 % del mapa** (medido: 509 px de 699 a 375×812), así que asomar el pin por la franja
  que queda no basta para registrar dónde ha caído. El pin cae **al instante**, con su
  vibración; lo que espera es el formulario, y esos dos segundos son el único momento en
  que se ve el punto exacto sin nada delante. El temporizador vive en una `ref` y se
  limpia al desmontar: salir del mapa dentro de esos dos segundos no debe abrir un
  formulario sobre otra pantalla.
  **Y el mapa se desplaza para que el pin se vea** (`AsomaElPin`), que es lo de después: el formulario sale de
  abajo y tapaba el punto que acabas de tocar, justo cuando más falta hace verlo. Se
  propuso enseñar el pin dos segundos y luego el formulario, y hace lo mismo peor —dos
  segundos de espera en cada alta y al final el pin vuelve a estar tapado—; desplazando, se
  queda visible todo el rato. Es la cuenta de `FocusOn` con la lista de cercanas. Solo la
  primera vez: si moviera el mapa en cada toque, afinar la posición sería imposible.
  Dos cosas que se pagan si se tocan, las dos descubiertas midiendo y no leyendo: la espera
  para medir el formulario es un **`setTimeout` y no `requestAnimationFrame`** —los
  navegadores congelan los fotogramas con la pestaña oculta y el desplazamiento no llegaba
  a ocurrir—, y el desplazamiento va **sin animación**, porque la de Leaflet también va por
  fotogramas y se quedaba a medias (medido: 3 px de los 480 que tocaban).
  Medio segundo, 12 px de tolerancia, cancela si el mapa se mueve, no se dispara sobre pines
  ni controles, y vibra al completarse — sin ese toque el gesto termina sin señal hasta que
  aparece el formulario y se duda de si ha funcionado. Comprobado en el navegador con
  eventos táctiles: 700 ms abren el formulario en el punto tocado, un arrastre de 40 px no,
  un toque a 573 px deja el pin en 95 —por encima del formulario, que empieza en 189— y uno
  a 90 px no mueve el mapa.
- **El botón de añadir se pinta SIN sesión**, y sin sesión lleva a entrar. Estaba detrás
  de `user &&`, así que a quien no ha entrado no le salía **nada**: ni el botón ni una
  explicación. Medido: **438 sesiones anónimas contra 48 cuentas**, o sea que la acción
  principal de la app era invisible en nueve de cada diez visitas — incluida la de quien
  escanea el QR de un cartel, ve que falta la fuente de su plaza y no puede ni enterarse
  de que eso se hace aquí. La regla ya estaba escrita dos veces y a este botón no se le
  había aplicado: los chips de la lista del GPX se dicen sin sesión «en vez de no pintar
  nada», y «una pestaña que da 401 no es una pestaña».
  La **pulsación larga se queda detrás de `user`**: un gesto oculto que te saca a una
  pantalla de acceso es peor que no tenerlo, y encima se dispara sin querer.
  Lleva su propio evento (`map_add_font_signed_out`, en la lista cerrada y traducido en
  los ocho idiomas): sin separarlo no habría forma de saber si esto trae cuentas nuevas
  o solo clics que rebotan.
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

- **La tarjeta ya no es pulsable, y el enlace bajó al final.** Todo el globo fue un enlace
  durante un tiempo, con un botón dentro como señal: tenía sentido cuando esa era la única
  acción y el botón medía 142×40 px sobre un mapa en movimiento. Con los chips de estado
  dentro dejó de tenerlo, por tres razones:
  · el objetivo pequeño ya está resuelto —el enlace ocupa el ancho y 48 px de alto—, así
    que la razón original desapareció;
  · había **controles dentro de un control**, que es lo que la guía de Apple dice que no se
    haga: apuntar a «poca agua» y fallar por dos milímetros no fallaba el chip, **te sacaba
    del mapa**, que es el peor error posible porque pierdes el contexto;
  · y la jerarquía decía lo contrario de lo que quiere la app: lo más llamativo era un botón
    relleno que lleva a **leer**, cuando lo que hace falta es que la gente **cuente**.
  Ahora el orden se lee solo: qué es → cómo está → dime cómo está ahora → ver más.
  Comprobado midiendo: tocar el nombre de la fuente no navega, el enlace del final sí, y
  los tres objetivos (aspa, chips, enlace) miden 48 px.
  **Lo que NO pasó**, y lo predije mal: no se ahorró espacio. El globo pasó de 227 a 236 px
  porque el enlace sigue ocupando una fila de 48 —tiene que seguir siendo un objetivo de
  pulgar—. Lo que se gana es lo otro, no altura.
- Va como `<a>` de verdad y no como un `<div>` con `onclick`, para que sigan funcionando el
  teclado, «abrir en pestaña nueva» y los lectores de pantalla.
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

## Reseñar desde el globo del mapa, en un toque

- Tres chips —**sale agua, poca, seca**— dentro del globo, debajo de la tarjeta. Es el
  camino más corto entre estar delante de una fuente y contarlo: antes había que tocar el
  pin, tocar el globo, esperar la ficha y buscar el botón. Con 116 reseñas sobre 160.738
  fuentes, acortar esto es lo único que mueve la aguja.
- **Los mismos tres de siempre**, y por las mismas razones que el atajo de la foto y los de
  la lista de la ruta: `unknown` no dice nada viniendo de alguien que está delante, y
  `gone` es el estado más caro —dos testimonios retiran la fuente del mapa— así que no
  puede estar a un toque en un globo que se abre sin querer.
- Van **fuera del `<a>`** de la tarjeta: un botón dentro de un enlace no es HTML válido, y
  además el clic de la tarjeta se los comería.
- **Un solo escuchador delegado en el contenedor del mapa, en captura y parando la
  propagación.** Enganchado al elemento del globo, el clic **sí publicaba** —comprobado en
  la base: tres reseñas `flowing` sin texto— pero el globo **se cerraba en el mismo gesto**,
  porque `L.DomEvent.disableClickPropagation` no impidió que el clic llegara al mapa y
  `cerrarAMano` lo cerrara. Desde fuera parecía que no hacía nada: la confirmación se
  escribía en un nodo ya desprendido. Delegando se para el evento antes de que llegue a
  nadie, y el id de la fuente viaja en el HTML (`data-font`) en vez de en una clausura.
- **Se puede deshacer durante 10 segundos**, y no es un adorno: un toque de más aquí no es
  inocuo. Una reseña cambia el color del pin para todo el mundo, refresca la frescura, paga
  gotas y —si dice que sale agua— **cierra sola las incidencias abiertas** de esa fuente. Y
  los chips están dentro de un globo que se abre al rozar un pin, con objetivos de unos
  50 px. Poder deshacer convierte un error irreversible en uno recuperable, que sale más
  barato que agrandar los objetivos o pedir confirmación en cada toque. Pasado el plazo
  queda como cualquier otra reseña y se borra desde la ficha.
- El botón de deshacer **repitió el mismo fallo** que la delegación vino a arreglar: como no
  lleva `data-estado`, el clic se escapaba al mapa y cerraba el globo —la reseña sí se
  borraba, pero el mensaje se escribía en un nodo ya desprendido—. El manejador delegado
  atiende ahora **cualquier botón del bloque**, y el id de la reseña recién creada viaja en
  el `dataset` en vez de en una clausura.
- El pin **cambia de color al momento** (`setIcon`): sin eso hay que esperar a que el mapa
  se recargue solo para ver que ha servido de algo. Al deshacer vuelve al color anterior,
  que viaja en `data-antes` por la misma razón que el id.
- Sin cobertura va a la bandeja de salida, como el resto de reseñas. Sin sesión no se
  pintan los chips: no hay nada que hacer si no puedes aportar.

### Tocar el chip que ya consta es CONFIRMAR, no repetir

- Los tres chips solo sabían **crear reseñas**. Así que tocar «sale agua» sobre una fuente
  que ya lo dice desde hace una hora publicaba un parte repetido en vez de respaldar el que
  había — que es literalmente lo que significa el botón «sigue igual» de la ficha. Lo
  reportó el autor: «perdemos la verificación por parte de otro usuario constantemente».
- **Medido antes de tocar nada, y la magnitud desmiente la mitad de la alarma:** 123 reseñas
  con estado sobre **119 fuentes distintas**, de 21 personas. Solo **4** fuentes tienen más
  de un parte en toda la historia y solo 4 reseñas siguieron a otra (3 en menos de 24 h).
  Enfrente, **36 confirmaciones**, 30 sobre la reseña de otra persona: la gente sí confirma
  **cuando se le ofrece**, y desde el mapa no se le ofrecía nunca. Y una reseña de **otra**
  persona ya daba `verified` por `recentStatusReporters > 1`, así que la corroboración no se
  estaba perdiendo. El cuello de botella real no es qué pasa en la segunda visita: es que
  **no hay segunda visita**. Este cambio es preventivo y barato, no un agujero sangrando.
- **La decisión vive en el SERVIDOR** (`confirmIfUnchanged` en `CreateCommentDTO`), y esto
  es lo importante del diseño. El cliente manda **la intención**, no la decisión, y el
  servidor la resuelve al recibirla. Se hizo primero al revés —decidiendo en el globo, con
  `lastCommentID`/`lastReportAt` publicados en el resumen del mapa— y estaba mal por tres
  cosas, las tres medidas o comprobadas:
  · **sin cobertura no se comportaba igual**, que es de donde salió la pregunta. La bandeja
    de salida no sabía confirmar, así que se encolaba una reseña. Ahora se encola la misma
    intención y `sw.js` **no ha tenido que aprender nada**: reenvía `{...item.data}` tal
    cual (hay test de que reenvía incluso campos que no conoce);
  · guardar la **decisión ya tomada** habría sido peor que no hacer nada: una cola que se
    vacía tres días después colgaría tu «sigue igual» de un parte que puede estar **superado
    o borrado**, y si el nuevo dice lo contrario estarías respaldando el desactualizado;
  · y decidir en el cliente obligaba a repetir la regla en `sw.js`, que es **un espejo de la
    cola y no puede importar de `src/`**.
- Y costaba lo suyo: los dos campos del resumen medían **65 B por fuente**, o sea **191 KB
  por carga de mapa** sobre los 925 KB que ya pesa una vista de 3.000 — un 21 % más de
  payload en todo el mapa para una decisión que afecta a 4 fuentes de 119. Con el servidor
  decidiendo no hace falta ni un campo nuevo ni una consulta extra: ya tiene el parte
  delante.
- **Las cuatro condiciones del swap**, cada una tapando un agujero distinto
  (`confirmacionEnLugarDeParte`): solo estado —**sin texto, nota ni foto**, porque
  convertir en un pulgar lo que alguien escribió tira lo más caro que aporta—, **el mismo
  estado** —decir otra cosa es un desacuerdo y tiene que quedar como parte propio o
  `confidenceOf` no ve la contradicción—, **de otra persona**, y **reciente**.
- Lo de «otra persona» no es solo que confirmarte a ti mismo no dé respaldo: confirmar el
  parte propio tiene una **espera de 24 h** (ver `confirm`), así que dentro de ese día el
  atajo acabaría devolviendo un **403 a alguien que está delante de la fuente** y no
  publicaría nada. Repetir tu propio parte al menos refresca la fecha, que es cierto.
- **El corte de 7 días sale del baremo, no del diseño** (`ContributionScore
  .quickConfirmDays`). `freshness` es plana en `case ..<8: return 5`: dentro de la primera
  semana repetir paga **5 gotas** y confirmar **10**, así que confirmar es a la vez la mejor
  señal y lo mejor pagado. A partir del octavo día la curva sube hasta 70 por una fuente
  olvidada, y seguir cambiando la reseña por una confirmación **degradaría la aportación que
  más paga la app**. Hay un test que compara la constante **contra la propia curva**, no
  contra un número escrito: si alguien mueve la rodilla, salta.
- Responde **200 y no 201** —no se ha creado nada— y el cuerpo es **el parte respaldado**,
  con `confirmedInstead: true`. Su `id` es el que el globo usa para deshacer.
- **Se dice con otras palabras** (`popup.confirmedThanks`): «gracias, ya lo saben los demás»
  sobre una confirmación parece que has publicado un parte nuevo. Y **el pin no cambia de
  color**, porque el estado es el mismo; lo que cambia es la confianza.
- Deshacer sirve para las dos cosas: el mismo botón borra la reseña o retira el «sigue
  igual» según lo que haya en el `dataset`. Desde fuera es el mismo gesto.
- Sin la bandera todo se comporta como siempre, así que **un cliente sin actualizar publica
  lo que siempre publicó**. Hay test.
- Analítica: `map_quick_confirm`, en la lista cerrada del servidor y con su rótulo en los
  ocho idiomas. Y de paso se tradujo `err.confirm.tooSoon`, que llegaba en castellano a
  todo el mundo desde el botón de la ficha.
- Aviso al tocar `CreateCommentDTO`: el campo nuevo rompió **6 llamadas** en los tests y el
  compilador las cazó todas. Es justo lo que se perdió aquella vez que dos tests publicaban
  con un diccionario suelto — por eso el DTO no lleva un init con valores por defecto, que
  habría hecho «cómodo» añadir campos sin enterarse.

### Y después del toque, la foto

- El atajo hace más probable que la reseña llegue **sin texto y sin foto**, y la
  preocupación era razonable. Lo que dicen los datos de producción es que **la reseña rica
  ya era minoría antes de que el atajo existiera**: de 122 reseñas, **122 llevan estado
  (100 %)**, 47 valoración (39 %), **39 texto (32 %)** y **21 foto (17 %)**, con una media
  de 51 caracteres. Lo escaso es la señal, no la riqueza — así que la salida no es
  entorpecer el camino corto, sino **encadenar** el paso siguiente cuando lo importante ya
  está guardado.
- Se pide **la foto y no el texto**, que es el orden de utilidad para quien va a desviarse
  tres kilómetros: estado → foto → valoración → texto. Y **solo si la fuente no tiene
  ninguna** (64.150 de 64.295): sustituir una que ya existe no es de cualquiera e invita a
  la guerra de ediciones — la misma asimetría de siempre. Viaja en `data-sinfoto`, por lo
  mismo que el id: en el HTML y no en una clausura.
- **Con la cifra delante**, leída de `/gamification/scale`. Y aquí se vio pagar la regla de
  no escribir ni una cifra en el cliente: al probarlo, el rótulo salió **«+80 gotas»** y no
  las 120 que se habrían escrito a mano — la primera foto y la primera reseña
  intercambiaron sus valores el 19/08/2026. Sin el baremo cacheado el rótulo va **sin
  cifra**, nunca con una inventada.
- **Tercer control en el globo, tercera vez con la misma trampa.** La etiqueta de la foto
  necesita `stopPropagation` —si no, el clic llega al mapa, `cerrarAMano` cierra el globo y
  el `change` se dispara sobre un `<input>` ya desprendido, o sea que la foto no llega y no
  falla nada visible— pero **no** `preventDefault`, que es lo único que abre la cámara. Por
  eso el manejador delegado atiende `button` **y** `.popup-photo`, y solo a los botones les
  quita el comportamiento por defecto.
- `prepararFoto` va **fuera del `try` y una sola vez**: prepararla otra vez en la rama de
  la bandeja de salida la encolaría **sin EXIF**, que es lo único que después no se puede
  recuperar. Y sin cobertura se encola igual (`kind: 'photo'`), que es donde más se está
  delante de una fuente sin foto.
- Analítica: `map_quick_review` y `map_quick_photo`. Ojo, `map_quick_review` **se llamaba
  desde el cliente desde el primer día y no se guardaba ni una fila**: no estaba en la
  lista cerrada del servidor, que lo descarta en silencio. Es exactamente lo que avisa
  «añadir un evento exige incorporarlo a la lista cerrada»; sin las dos mitades no hay
  forma de saber si el atajo trae reseñas nuevas o solo mueve de sitio las de siempre.
- **Los objetivos del globo van a 48 px**, medido y no a ojo. Estaban a 24 el aspa de
  cerrar y a 40 los chips y «Ver detalle»: por debajo de los **44 pt** que pide la guía de
  Apple y de los **48** que esta app ya usa en todo lo que se toca con el pulgar (hojas del
  mapa, filas del buscador, barra de guardar). Del aspa crece **la zona sensible, no el
  dibujo** —el glifo se queda en 18 px, centrado—, que es justo la distinción que hace esa
  guía: el objetivo táctil no tiene por qué verse.
  Ojo con el selector: `.leaflet-container a.leaflet-popup-close-button` tiene **la misma
  especificidad que el de Leaflet**, cuya hoja se inyecta después por venir de un trozo
  diferido, así que el ancho seguía en 24 mientras el resto de la regla sí se aplicaba —lo
  que despista mucho al depurarlo—. Hace falta meter `.leaflet-popup` por medio. Misma
  trampa que la del color del globo en modo oscuro.

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
- **Y en la ficha se recorta a 300 caracteres con «ver más»** (`TextoLargo`). La mayoría
  son una línea, pero las buenas de verdad —de dónde nace el agua, cómo se llega, qué hay
  al lado— pasan de **600**, y esas empujaban hacia abajo lo que la ficha tiene que
  contestar primero: cómo está el agua. Solo se recorta si sobran más de 60 caracteres:
  cortar un texto de 310 para esconder diez cuesta un botón y un toque para ganar media
  línea.
  · **Se corta por el último espacio**, no por el carácter 300: `TextoRico` convierte en
    enlaces las direcciones que encuentra, así que un corte a mitad de una URL dejaría un
    enlace roto **y pulsable** apuntando a otro sitio. Por espacios no se parte ningún
    trozo, porque una URL nunca lleva uno dentro.
  · **Una vez desplegado no se vuelve a plegar**, como hace iOS. La razón es de lectura:
    quien pulsa «ver más» ha dicho que quiere leer, y un «ver menos» **mueve la página
    bajo el dedo** justo al terminar el párrafo y te deja en un sitio que no reconoces.
    Dicho con precisión, porque se preguntó: la guía de Apple **no exige** que sea de un
    solo sentido; lo que pide es que el contenido no salte ni se reorganice bajo el
    lector, y que la expansión no tenga vuelta es cómo lo cumplen sus propias apps.
  · **Lo mismo en las reseñas**, por lo mismo: una larga empuja las siguientes fuera de la
    pantalla en la ficha, y en los perfiles convierte una fila de una lista en media
    página. En las tarjetas de **novedades no** se toca: allí ya se recorta por líneas con
    CSS (`WebkitLineClamp`), que es lo que le toca a una tarjeta cuyo trabajo es llevar a
    la ficha, no dejarte leer allí. En los dos perfiles el cuerpo se pintaba además en
    texto plano; ahora pasa por `TextoRico` como en la ficha, así que las menciones también
    enlazan.
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

## Los ajustes son una pantalla por tema

- `/me/settings` es un **índice** y cada tema tiene su pantalla (`/me/settings/account`,
  `privacy`, `notifications`, `contribution`, `storage`), como los ajustes de un teléfono.
  Medido antes y después en un móvil de 375×812: la página única eran **2.139 px (2,6
  pantallas)**; el índice son **846 px (1,04)** y ninguna subpantalla pasa de una.
- **La causa no era el número de interruptores sino su texto.** Son unos diez, pero cada
  uno arrastra dos o tres líneas de explicación —y ese texto es bueno, dice lo que cuesta
  cada decisión—; todo seguido convertía una lista de seis cosas en un muro. Partido, cada
  pantalla tiene sitio para explicarse.
- **Cada fila del índice enseña su estado** («@usuario», «Nombre visible», «Resumen
  semanal», «32,2 kB»), y eso no es adorno: un índice que solo son seis enlaces es **peor**
  que la página larga, porque añade un toque y no contesta nada. Con el estado se responde
  de un vistazo y solo entras a lo que vas a cambiar. El resumen de privacidad nombra **lo
  que se ve**, no cuántos interruptores hay encendidos: la pregunta que se trae ahí es «¿qué
  ven los demás de mí?».
- **La zona de peligro se queda en el índice**, no dentro de ninguna subpantalla: no es un
  tema sino una acción, y borrar la cuenta tiene que poder encontrarse sin explorar.
- **Las passkeys van dentro de «Tu cuenta»**: son lo mismo que el nombre de usuario —cómo
  entras— y solas no daban para una pantalla.
- **El guardado vive en `useAjustes` y no en cada pantalla** (`pages/settings/comun.tsx`).
  `PUT /users/:id` manda el perfil **entero**, así que guardar un interruptor obliga a
  reenviar todos los demás campos; con una copia de esa lista en cada pantalla, el día que
  se añada una preferencia habría que acordarse en cinco sitios — y el que se olvide **no
  falla**: pisa el valor guardado con el que llevaba por defecto. Es el mismo fallo
  silencioso que ya evitaba `savePrivacy` cuando todo estaba junto.
- En escritorio es el mismo índice de momento. Si algún día queda vacío, la salida es
  columna de secciones a la izquierda y contenido a la derecha, como los Ajustes del Mac —
  y eso es trabajo aparte, no un `if` más.

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
- **Lo que abre tu nivel va plegado** («Tu nivel abre 7 cosas», con lo que viene después
  dentro). En el nivel 6 son seis chips, uno por línea porque el texto es largo, más las
  dos líneas de «más adelante abrirás»: **252 px medidos** de permisos en medio de un
  marcador que existe para decir cuántas gotas llevas. Y es información que se consulta
  **una vez, al subir de nivel**, no en cada visita al perfil. El recuento del rótulo
  conserva lo único que hay que ver de un vistazo —que abre algo y cuánto—; la explicación
  completa sigue en `/gamification`, que es donde están también las condiciones.
  El rótulo dice **«acciones»**, no «cosas» —relleno—, ni «capacidades» —la palabra del
  código, que suena a ficha técnica—, ni **«poderes»**, que se lee mejor como premio pero
  contradice la regla que ordena la escalera: un nivel abre poder **sobre el mapa** y nunca
  sobre la gente. «Permisos» es peor todavía: es el vocabulario de los roles y la
  moderación, el mismo eje de autoridad sobre personas que estas capacidades evitan a
  propósito. Lo que hay debajo son literalmente acciones sobre una fuente.
- **Los cuatro títulos llevan icono** (`TituloDeSeccion`): escudo, **estrella**, chincheta
  con un más y **bocadillo**. Solo lo tenía «fuentes que dependen de ti», así que en una
  página de cuatro bloques uno parecía de otra familia. No es adorno: en una pantalla
  larga el icono es lo que permite volver a encontrar una sección **sin leer**, la misma
  razón por la que las filas llevan el emoji del tipo. La estrella es la misma con la que
  se marca una fuente en su ficha y la chincheta la misma del botón de añadir, para que
  el rótulo y el gesto se reconozcan. «Tu aportación» se queda **sin** icono a propósito:
  lleva el escudo del nivel dibujado justo debajo y competirían.
- **Las filas dicen algo, y van rayadas** (`FilaDeFuente` + el rayado de `ListaConTope`).
  Favoritas y «fuentes que has añadido» eran **un nombre por fila y nada más**: un muro de
  texto donde no se distingue una fila de la siguiente y no hay con qué elegir.
  · El icono es **el tipo de punto** (`SOURCE_EMOJI`, el mismo vocabulario del globo y de
    la lista del GPX), y está casi siempre: medido sobre la importación real, **211 de
    80.345 fuentes** no llevan tipo (0,26 %). Sin él se pinta una gota neutra, que no
    afirma nada.
  · La segunda línea es **el municipio**, no el tipo escrito: el emoji ya dice la clase, y
    lo que falta para reconocer una fuente en una lista es **dónde** está — lo mismo que ya
    hacen los resultados del buscador. Fuera de España `municipality` es nulo y cae en la
    demarcación; sin ninguno de los dos, la fila se queda en una línea. Nunca se inventa
    un sitio.
  · **Lo que NO se hace: la miniatura de la foto.** Es lo primero que apetece y es peor por
    dos cifras: **64.150 de 64.295 fuentes no tienen ninguna**, así que casi todas las
    filas enseñarían un hueco, y solo hay **un tamaño** por foto (~386 KB de media), o sea
    ~2 MB para pintar seis cuadrados de 40 px. Ver «Peso de las fotos»: el día que existan
    miniaturas se puede reconsiderar.
  · **En «fuentes que dependen de ti» sale además el estado que dijiste tú.** Es el dato
    que caduca —de eso va la lista entera— y no salía: la fila decía cuándo pasaste, pero
    no qué contaste. Sale de la **misma consulta**, que ya une `fonts` por el nombre y ya
    trae la reseña más reciente con el `DISTINCT ON`: `f.source` y `ultima.water_status`
    son dos columnas más y cero coste.
  · Y en esa lista **se quitó un aviso de los dos**: estaban «toca volver» a la derecha y
    «vale 70 gotas» debajo, que dicen lo mismo (90 días y 30). Con los dos, la fila medía
    **129 px** y el chip de la derecha le robaba el ancho al nombre, que se partía en dos
    líneas; ahora **85**. Se queda el de las gotas, que es el que **varía** y por tanto
    ordena; lo binario ya lo dice la negrita del nombre.
  · El **rayado sustituye a los separadores** y vive en `ListaConTope`, no en cada lista:
    con filas de una línea y una raya de 1 px, seis favoritas se leen como un párrafo.
    Se raya el propio `<li>` para que valga igual en las listas que se pulsan y en la de
    reseñas, que no. Ojo con el color: el rayado usa `action.hover`, **el mismo** que MUI
    da al pasar por encima, así que el hover sube a `action.selected` — sin eso la mitad
    de las filas pierden la respuesta al dedo, que en móvil es la única señal de que la
    fila se pulsa.
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
- **Y el mapa ya no esconde las no potables por defecto** (`hideNonPotable`, antes
  `showNonPotable`). Estaba al revés: había que activar un filtro para verlas, así que al
  marcar una fuente como no potable **desaparecía delante de quien la acababa de marcar**.
  Reportado por quien lo sufrió varias veces, y el daño no es solo el susto: la fuente
  sigue existiendo, así que la siguiente persona —o la misma— la vuelve a añadir y queda
  un **duplicado**, que es de lo que peor se limpia aquí.
  Además, esconderlas era discutible de por sí: una fuente no potable sigue siendo un
  punto útil —para el perro, para mojarse la cabeza, para saber que **ésa** no vale y no
  volver a mirarla— y en un mapa que existe para decir la verdad sobre el agua, borrar lo
  que alguien acaba de contar castiga justo la aportación que más cuesta.
  **El valor guardado viejo no se migra a propósito**: para casi todo el mundo no era una
  elección sino el valor por defecto, y traducirlo dejaría el arreglo sin efecto justo
  para quien ya tiene filtros guardados, que es quien lo reportó. Comprobado con un
  `sessionStorage` del esquema antiguo: el chip sale apagado y se ven todas.
  Las claves de i18n **sí** se renombran (`map.hideNonPotable`), al revés que de costumbre:
  el texto cambia igual en los ocho idiomas y una clave que diga «include» sobre un chip
  que esconde es una trampa para el siguiente que edite el diccionario.
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
- **Otras IDE oficiales, y lo que se aprendió buscándolas:** ninguna otra agencia
  autonómica hace lo que la ACA. Solo hay datos **municipales** y, como excepción,
  **IDENA (Navarra)**. Y **la cantidad no es el motivo**: medido antes de importar, en
  València teníamos 937 contra sus 832, en Málaga 381 contra 350 y en Navarra 4.433 contra
  169 — OSM ya cubre mejor **la ciudad**, que es donde publican los ayuntamientos. La ACA
  fue distinta porque era montaña. Lo que aportan es **nombre**: Málaga dio **10 altas y
  326 renombrados**. Navarra (capa geológica de manantiales) dio 8.051 altas porque ahí sí
  hay monte. Runbook completo en DEPLOY.md.
  · `scripts/shp-a-geojson.py` convierte shapefiles de puntos a GeoJSON y reproyecta de
    UTM (las IDE publican en EPSG:25830), sin dependencias. Solo puntos: con otra
    geometría se planta en vez de inventarse un centroide.
    La reproyección se verificó contra el municipio que declara cada punto —11 de 14 caen
    en el que dicen y los otros 3 a menos de 1,2 km de un límite—, porque un error de
    proyección **no da excepción**: da coordenadas plausibles en otro sitio.
  · `scripts/navarra-idena.py` filtra lo que no es una fuente: `Regata` (73, es un arroyo),
    `APROXIMADA=1` (328, el propio origen dice que no sabe dónde está — en una app que te
    guía los últimos metros eso es peor que no tenerlo) y las que no traen topónimo (449,
    si no se llamarían «Font» todas).
  · **Cuidado con el nombre que trae cada capa.** La de «Fuentes públicas» de Navarra pone
    en `FUENTE` **dónde está** —«Escuela», «Cementerio», «Frontón»—, no cómo se llama; con
    `--dedupe` habría **pisado** nombres buenos con esos rellenos, así que **no se
    importó**. Los de Málaga también son ubicaciones pero **específicas** («Plaza de la
    Inmaculada»), que para una fuente urbana sí dicen algo.
  · **Los `populate-*` del final no son opcionales**: `import-geojson` deja `country`,
    `region` y `municipality` **nulos**, así que sin ellos lo importado no cuenta en
    `/zones`, no sale con su sitio en el buscador ni aparece en la página de su municipio.
    Se olvidó en Navarra y se vio comprobando: 8.138 sin demarcación, y 27 después.
  · `--titlecase` conserva los **ordinales romanos**: los inventarios numeran así los
    manantiales de un mismo paraje y salían «Peña Ii» y «Chokoa i», que no es un topónimo
    sino una errata — **1.909 de 8.473** en Navarra. La `i` sola se queda en minúscula a
    propósito: es conjunción catalana («Sant Pere i Sant Pau»), y romper todos los
    topónimos del ICGC por un manantial suelto sería mal negocio. Hay test de las dos
    mitades.
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

## La página de un municipio (`/municipalities/:ine`)

- «Fuentes de Castellcir»: el inventario de un municipio, **público y sin sesión**. Es el
  primer esquema del producto territorial de [docs/ayuntamientos.md](docs/ayuntamientos.md);
  lo que enseña ya se ve en el mapa, y la mayoría de los datos son de OpenStreetMap (ODbL)
  y del ICGC/ACA, así que ponerle una puerta sería cerrar datos abiertos que no son
  nuestros. Lo cobrable es lo otro —avisos, histórico, campañas—, y no se construye hasta
  que haya quien lo pague.
- **La consulta vive en `MunicipalReport` y la comparten dos llamadores**: el comando
  `municipal-report`, que escribe el informe que se enseña en una reunión, y
  `GET /municipalities/:ine`, que pinta la página. Dos consultas parecidas se separan al
  primer arreglo, y aquí eso significaría que el PDF que firma alguien y la página que ese
  alguien abre en el móvil dan cifras distintas. Mismo motivo que `ContributionLedger.sync()`.
- **Va por código INE y no por nombre**: hay municipios que se llaman igual en provincias
  distintas. Con nombre (`GET /municipalities?name=`) se devuelve **la lista de
  candidatos**, nunca uno elegido a dedo — sería enseñarle a alguien el inventario de otro
  pueblo con el rótulo del suyo. El comando hace lo mismo y se planta.
- El orden de la página **es el mensaje**: resumen operativo → prioridades → mapa →
  inventario filtrable. «Con agua» y «sin agua» solo usan partes de los últimos **90
  días**; «requiere revisión» significa nunca comprobada o más de un año. Las prioridades
  ordenan incidencias, falta de agua reciente y antigüedad, pero **no son órdenes de
  trabajo**: responsables, SLA y estados internos esperan al primer piloto.
- En escritorio el mapa se carga de entrada y comparte la primera pantalla con las
  prioridades; en móvil sigue bajo demanda para no cargar Leaflet (~300 KB) antes de que
  haga falta. Los filtros afectan a la lista **y a los puntos del mapa**, para que ambos
  cuenten la misma historia. La página incluye búsqueda, un CTA municipal e
  impresión/«guardar como PDF» mediante `window.print()`.
- Descarga de CSV y GeoJSON **compuesta en el navegador** con lo que la página ya pidió,
  igual que el GPX: cero coste de servidor y ninguna ruta nueva. La atribución va **dentro
  del fichero**, porque un GeoJSON se reenvía suelto por correo sin la página que lo
  explicaba.
- **No se enlaza desde la navegación** todavía, y no es un descuido: es una dirección que
  se manda por correo mientras se valida. Esconderla no hace falta —no hay nada privado—;
  prometer una sección que aún no existe, sí sobra.
- **El mapa recorta el municipio y apaga lo demás** (`MunicipalityMap`, cargado a demanda
  tras un botón: Leaflet son ~300 KB y esta página se lee entera sin él). Es el efecto del
  mapa del Meteocat y se hace **sin capa nueva**: un polígono que cubre el mundo con el
  municipio como **agujero**, relleno de gris. Leaflet dibuja agujeros pasando
  `[exterior, hueco1, hueco2…]`. No es decoración: la página dice «las fuentes de
  Castellcir» y sin el recorte no hay forma de saber dónde acaba Castellcir.
  · El polígono sale de `municipal_boundaries`, cargada por `import-municipal-boundaries`
    desde **el mismo fichero del IGN** que usó `populate-municipalities` para clasificar
    las fuentes. Con otro polígono habría fuentes pintadas fuera de su municipio y no se
    sabría cuál de las dos cosas está mal. Comprobado con Castellcir: **las 26 caen
    dentro**.
  · El contorno va en **su propia ruta** (`/municipalities/:ine/boundary`, caché de un
    año) y no dentro del informe: el informe cambia cada vez que alguien reseña y el
    contorno no cambia nunca, así que juntos cada visita arrastraría dos kilobytes de
    polígono que ya estaban en el navegador.
  · `@Field` con `[[[[Double]]]]` **no funciona** aunque la columna sea `.json`:
    PostgresNIO ve un array de Postgres e intenta `DOUBLE PRECISION[]`, y revienta en
    ejecución pese a compilar. Va envuelto en una estructura (`Contorno`).
  · La máscara lleva `interactive={false}` —si captura los clics no se puede arrastrar el
    mapa por fuera— y `fillRule: 'evenodd'`, porque Castellcir tiene **dos** polígonos y
    sin eso los agujeros se anulan entre sí.
  · Y el mapa necesita `Encuadre`: montado dentro de un `lazy`, Leaflet se crea con el
    contenedor a 0×0 y `fitBounds` se va al **zoom máximo** —sale un bosque—. Se arregla
    con `invalidateSize()` + `fitBounds` en un `setTimeout` (no `requestAnimationFrame`,
    por lo mismo que `AsomaElPin`).
  · **Debajo va la leyenda de los colores, y solo con lo que hay** en ese municipio: una
    leyenda fija de seis filas para un pueblo con tres colores obliga a buscar cuál sirve y
    promete estados que allí no existen — misma regla que los chips de «lo que falta» y que
    `WorthChip`. Lleva el recuento de cada color, así que se comprueba sola: en Castellcir
    suma 26. El azul va el último y con **su propio rótulo**, «sin comprobar nunca»: en el
    mapa grande ese color se rotula «desconocido» porque allí no se puede distinguir, pero
    aquí sí se sabe, y usar la misma palabra para el azul y para el gris de quien pasó y no
    supo decirlo sería confundir dos cosas distintas a propósito.
    Ojo con la mayúscula inicial: se pone con `::first-letter` y no con `capitalize` —que
    la pondría en cada palabra— y **solo funciona sobre una caja de bloque**; en un `<span>`
    inline la regla se ignora sin fallar.
- **Etiquetas propias** (`functions/municipalities/[ine].ts`), con `/municipalities/`
  apuntado en `CON_METADATOS_PROPIOS` — sin eso el middleware las pisa **después** y no se
  ve leyendo el código, solo sirviendo la página. Comprobado con `wrangler pages dev`:
  «Fonts de Castellcir · FontApp». La descripción dice **cuántas hay y cuántas ha
  comprobado alguien**: ése es el enlace que se manda a un ayuntamiento, y prometer «26
  fuentes» para que al abrir no haya ninguna comprobada es empezar por el peor sitio.
  Usa siempre la tarjeta genérica del idioma y **no** la foto de una fuente: la página va
  del municipio entero, y una foto de las veintiséis lo representaría por sorteo.
- **El municipio se recalcula solo al mover el pin** (`Municipalities.refresh`, desde
  `inheritZone` al crear y desde `update` al reubicar). Antes no: una fuente movida se
  quedaba con el municipio viejo y una nueva nacía sin ninguno hasta que se lanzara
  `populate-municipalities` con el fichero de 13 MB. El comentario de `inheritZone` decía
  que resolver contra las fronteras de verdad obligaría a llevar ese GeoJSON en el
  contenedor, y **dejó de ser cierto** cuando los contornos entraron en la base para
  dibujar el mapa: ahora es una consulta por caja (`min_/max_`) más un point-in-polygon
  sobre uno o dos candidatos.
  · Usa **la misma función** que `populate-municipalities` (`dentro`): con dos
    implementaciones, el municipio que se dibuja y el que se guarda podrían discrepar en
    un borde y no habría forma de saber cuál miente.
  · Fuera de todo contorno queda **nulo**, no el anterior. Comprobado moviendo una fuente
    de Castellcir a Moià (se recalcula) y de ahí a Madrid, sin contorno cargado (se
    limpia).
  · País y demarcación se siguen **heredando** del vecino y el municipio se **calcula**:
    heredar el municipio sería dar una respuesta exacta desde una aproximación, y el
    vecino más cercano puede estar al otro lado del límite.
- **El municipio no se edita a mano, y no debe poder.** No es un campo que alguien
  rellena: es el resultado de meter unas coordenadas en un polígono del IGN. Una caja de
  texto ahí crearía fuentes que dicen «Moià» pintadas dentro de Castellcir, contradiciendo
  a `/zones`, al ranking y a la página del municipio. Cuando está mal es porque el pin
  está mal, y eso ya se corrige moviéndolo. Para quien no puede moverlo, la ficha técnica
  lleva un **«¿algo no cuadra?»** que abre la caja de comentarios con el texto empezado —
  un **comentario y no una incidencia**, porque no hay nada roto en la fuente. Que lleve a
  otro sitio de la página es lo contrario del caso del hueco de la foto: allí la intención
  era «tengo una foto» y se respondía con un formulario de reseña; aquí la intención **es**
  escribir.
  Ojo: el estado del borrador y su `ref` van **arriba con el resto de hooks**. Puestos
  junto a donde se usan quedan debajo de la salida temprana y cambia el número de hooks
  entre el render de carga y el de la ficha — «Rendered more hooks than during the
  previous render» y la pantalla entera al error boundary. Ya estaba escrito aquí por el
  `useMediaQuery` y volvió a pasar.
- Ojo con `CoverageBar`: pinta el porcentaje **tal cual se lo pasan** (en `/zones` se lo da
  el servidor ya redondeado). Aquí se calcula en el cliente, y sin redondear salía
  «73.07692307692308 %».

## Carteles / campañas
- Cartel A5 en catalán en `flyer/` (HTML editable + PDF). `flyer/genera-cartells.py <codis>`
  genera una copia por pueblo con su QR y su código (`fontapp.net/?p=castellcir`).
- `flyer/genera-cartells.py --marketing <codis>` genera una variante A5 independiente,
  rehecha desde cero, con `web/public/welcome.jpg` a sangre en la parte superior y el
  contenido sobre blanco debajo. Sale en
  `flyer/pobles-marketing/`, separada del cartel original: el modo
  sin opción sigue siendo siempre el de bajo consumo de tinta y nunca se sobrescribe.
  La imagen se incrusta como data URI para que el HTML siga siendo un único archivo.
  `flyer/a-pdf.py --marketing <codis>` la convierte y valida igual que la original.
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
- **El paso de despliegue reintenta una vez, y solo una.** El builder remoto de Fly falla
  de vez en cuando **antes de construir nada** («timed out connecting to machine»,
  «failed to list workers», «authentication handshake failed: EOF»); pasó el 31/08/2026.
  Cuando ocurre **no se rompe producción** —la release anterior se queda sirviendo, y se
  comprobó que la app seguía dando 200—, así que lo único que se pierde es el despliegue,
  y hasta que alguien mira el rojo y lo relanza a mano puede pasar un día. Reintentar es
  seguro porque un `deploy` que ya publicó no encuentra nada que cambiar. **Uno** y no
  tres: un fallo de verdad —Dockerfile roto, health check que no pasa— falla las dos veces
  y el job sigue saliendo en rojo, que es lo que no se puede perder; con más reintentos,
  reconocerlo costaría una hora.
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
  como enlace al perfil (`AuthorLine.tsx`), avisa por correo y **por notificación del
  sistema**. El push **no** lleva la regla de `isAround` que sí lleva el correo: aquélla
  existe porque cada envío cuesta dinero, y un push no cuesta nada. Y una mención pasa el
  filtro de «¿cambia lo que voy a hacer?» sin discusión — alguien te está hablando a ti, no
  contando algo del mundo. La regla del servidor y la
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
- **`Cerca de ti` se pide con las coordenadas REDONDEADAS** (`lib/casilla.ts`), no con las
  del GPS. El service worker cachea por URL exacta, así que mandando las crudas cada
  petición tenía una URL nueva y sin cobertura **no acertaba nunca** — no era «si has
  mirado la zona antes», era que no funcionaba. El mapa ya decidía *cuándo* repedir por
  casilla de tres decimales (~111 m) pero pedía con las crudas: la clave y las coordenadas
  salen ahora de la misma función, que es donde estaba el fallo. Misma regla que
  `/activity`, y de paso dos personas en el mismo sitio comparten respuesta.
  El precio, medido: de las 25 más cercanas, **24 coinciden** con las de la posición exacta
  y baila la última, que es la del borde de la lista. Y la lista **se reordena en el
  cliente** por la distancia de verdad, porque cada fila pinta la suya y con hasta 100 m de
  desfase podrían salir 210 m encima de 205 m.
  **No se aplica dentro de `nearbyFonts`**: esa misma ruta la usa el aviso de «ya hay una
  fuente a menos de 25 m» al crear una, y ahí redondear a 100 m lo dejaría inservible.
- **La caja del mapa se redondea HACIA FUERA a una rejilla** (`lib/cajaMapa.ts`). Iba en
  flotantes completos y con el tamaño exacto en píxeles, así que un solo píxel de
  diferencia era otra URL — y la altura cambia sola: la franja de avisos que aparece, la
  barra del navegador que se pliega. Ésa era la explicación del «maté la app y el mapa
  salía en blanco». Visto en el log de red: dos vistas casi iguales daban
  `minLat=41.74528497321025` y `minLat=41.74533300268318`; ahora las dos dan
  `minLat=41.745300&…&width=1120&height=770`, idénticas.
  **Hacia fuera y no al más cercano**: la caja pedida tiene que **cubrir** lo que se ve, o
  aparecería una franja del mapa sin fuentes sin que fallara ninguna petición — un fallo
  silencioso. El precio es pedir de más, acotado a un paso por lado y con test que lo fija.
  **La rejilla se mide en píxeles y no en grados** (`PASO_PX` = 128, media tesela): un paso
  fijo en grados sería enorme de cerca y ridículo de lejos, y derivándolo del zoom la celda
  mide siempre lo mismo en pantalla, así que la proporción que se pide de más no depende ni
  del zoom ni del tamaño de la ventana.
  Y `width`/`height` se cuantizan a múltiplos de **70**, que es la celda con la que
  `mapItems` calcula sus columnas (`ceil(width / 70)`): así el servidor obtiene exactamente
  las mismas columnas que con el ancho real y la respuesta no cambia. Si allí cambia ese
  número esto no se rompe, solo deja de ser una equivalencia exacta.
- **Hay un caché FIJADO** (`fontapp-pinned-v1` + `lib/fijarOffline.ts`) del que no se borra
  nada para hacer sitio, y que se consulta **antes** que los demás. Sin él, preparar una
  zona no sirve de nada: el recorte va por orden de llegada, así que guardas lo de tu ruta
  el viernes, el sábado miras otra comarca por curiosidad y lo que preparaste ya no está.
  Al revalidar con red se reescribe **en el mismo caché donde estaba**: si una respuesta
  fijada se refrescara en el normal, el descarte se la llevaría igual y fijar no habría
  servido para nada. Hay test de esa mitad, que es la que se olvida.
  Hoy lo usa un solo sitio y a propósito: al importar un GPX se fija la respuesta de las
  fuentes de ese recorrido. Quien sube una ruta lo hace en casa con red y la necesita en el
  monte sin ella, es **una** respuesta y son sus datos, así que se hace solo. No promete
  nada nuevo — deja de ser una lotería.
- **Una foto que no carga NO deja el icono roto del navegador** (`ZoomableImage`). Sin
  cobertura pasa constantemente: una foto solo queda guardada si alguien la vio antes, así
  que en una zona guardada casi ninguna lo está — y el icono roto parece que la app esté
  estropeada. Ahora sale un hueco que dice **por qué**, distinguiendo «no la tienes
  guardada» (sin red) de «no se ha podido cargar» (con red), y se reintenta sola con el
  evento `online` — con una `key` que cambia, porque el navegador no reintenta una imagen
  que ya falló.
  El hueco **no se parece al de «esta fuente no tiene foto»** a propósito: ese invita a
  poner una, y aquí la fuente sí tiene — solo que no en este móvil. Confundirlos llevaría a
  subir una foto repetida creyendo que falta.
  Va en `ZoomableImage`, por donde pasan las tres: portada, reseñas y galería.
  Aviso al probarlo: las imágenes llevan `loading="lazy"`, así que **si el panel del
  navegador está colapsado no se piden nunca** y parece que el arreglo no funciona. Hay que
  forzar `loading='eager'` o tener la ventana con alto de verdad.
- **Las fotos tienen su propio caché** (`fontapp-photos-v1`). Compartían los 300 huecos con
  las respuestas de la API, o sea que mover el mapa unas decenas de veces echaba todas las
  fotos guardadas y mirar fotos echaba las respuestas del mapa: dos cosas con ritmos
  completamente distintos peleando por el mismo sitio. Y el recorte de la API solo se
  disparaba **al pedir una foto**, así que entre foto y foto crecía sin tope.
  Al sacarlas **no se sube la versión de `fontapp-api-v3`**: no ha cambiado ningún formato
  y subirla tiraría lo guardado de todo el mundo justo en el cambio que existe para
  conservarlo mejor. Lo cazó `sw-routing.test.ts`, que está escrito para eso.
- **Guardar una zona para andar sin cobertura** (`lib/zonaOffline.ts` puro +
  `lib/zonaAlmacen.ts` en IndexedDB + `ZonaOfflineSheet`). Es para el excursionista: sale
  el sábado a un valle que no conoce, no tiene GPX que subir y pierde la cobertura al
  meterse. El ciclista ya lo tenía por otro lado —al importar su recorrido se le fijan sus
  fuentes— porque él sí sabe el viernes por dónde va a ir.
  **No basta con el caché del service worker**, y por eso esto es otra cosa: aquel va por
  URL exacta y `Cerca de ti` se pide con tu casilla de ~111 m, así que cubrir 10 km serían
  miles de peticiones para trocear la misma lista. Aquí se guarda **el dato una vez** y la
  lista de cercanas se calcula en el móvil, que es lo mismo que hace el servidor: ordenar
  por distancia. Cuando `/fonts/near` falla, `MapPage` cae a la zona guardada.
  **Solo los datos, no el mapa**, y se dice en pantalla. Medido: 110 fuentes de 10×10 km
  ocupan **42 KB**. Y no es una carencia disimulada — la lista de cercanas y la flecha de
  los últimos metros no pintan una sola tesela, o sea que lo que la app viene a contestar
  se contesta sin mapa. Las teselas son servidores ajenos y gratuitos y merecen su propia
  conversación.
  **En IndexedDB y no en `localStorage`**, por lo mismo que la ruta recordada: ahí está la
  bandeja de salida con aportaciones sin enviar, que es lo único que no se puede perder.
  `cercanasEn` devuelve **vacío si estás fuera de la caja guardada**. Con la zona de Girona
  guardada y el móvil en Cádiz saldrían las de Girona ordenadas por distancia, todas a 900
  km: parece que funciona, y eso es peor que no enseñar nada. Hay test.
  Y guardar una zona **sin ninguna fuente avisa en vez de decir «0 guardadas» en verde** —
  pasa con el mapa muy cerca, y te irías al monte creyendo que la llevas. Salió probándolo.
  **Las fotos son un SEGUNDO paso, con la cifra delante.** Se guardan aparte porque son dos
  órdenes de magnitud distintos —110 fuentes son 42 KB y sus fotos pueden ser megas— y sobre
  todo porque el número **no se puede saber antes** de pedir la lista: hay que traer las
  fuentes para contar cuántas tienen foto, así que preguntar antes sería preguntar a ciegas.
  El orden importa: los datos se guardan siempre y al momento, que es lo que hace falta en
  el monte; las fotos se ofrecen después («Guardar también las 30 fotos, unos 14,3 MB») y si
  dice que no, no se ha perdido nada. La estimación sale de los **489 KB de media medidos en
  producción** y se dice que es estimación; al terminar se enseña el tamaño real. Van al
  caché **fijado**, así que además dejan de pedirse al servidor: son backup y caché a la vez.
  En producción salen de otro origen (`pub-….r2.dev`) y ese bucket no expone CORS: se
  descargan como `no-cors` y se guardan como respuestas `opaque`. Cache Storage puede
  servirlas después a `<img>`, pero no leer su cuerpo; en ese caso el resultado enseña el
  número real guardado y omite los MB, nunca afirma «0,0 MB». El test de fijado tiene que
  usar una respuesta opaca: un doble que siempre devuelve `ok: true` no reproduce R2.
  El botón es un **quinto FAB** en una columna que ya iba justa, y se paga a sabiendas: en
  la hoja «Filtros» sería repetir el error del GPX —un cajón cuyo rótulo dice otra cosa— y
  en la de GPX tampoco, porque ese botón dice «GPX» con letras y esto no lo es.
- **La zona guardada la usan las TRES pantallas, no solo la lista.** Al probarlo en el
  monte salió que funcionaba a medias: las cercanas sí caían a la zona, pero el mapa se
  quedaba vacío y entrar en una fuente daba «sin conexión» y una pantalla en blanco —con
  la fuente guardada en el móvil, que es justo la situación para la que se guarda—. Ahora
  `loadBounds` cae a `enCaja` y la ficha a `fuenteDe`.
  La ficha dice que viene del móvil (`offline.fromZone`): sin ese aviso, una ficha sin
  reseñas parece una fuente que **nadie ha comprobado nunca**, que es lo contrario de lo
  que pasa — no se sabe, porque las reseñas no se guardan.
  Y **se reintenta al volver la red** (`window.addEventListener('online')`): antes la
  pantalla se quedaba en «sin conexión» para siempre aunque el móvil ya tuviera cobertura,
  y no había forma de recargar sin salir y volver a entrar.
- **El aviso de sin cobertura se encoge a un chip a los 10 segundos** (`PendingUploads`).
  La tarjeta grande está bien la primera vez, pero en el monte se pasa la excursión entera
  sin cobertura y colgada del borde de arriba deja de informar y pasa a estorbar. Se encoge
  en vez de desaparecer porque el estado sigue siendo cierto y explica por qué el mapa va
  raro, y el temporizador **se rearma en cada corte**, no solo el primero. Solo cuando no
  hay nada pendiente: «tienes 3 aportaciones sin enviar» no es un detalle de contexto y no
  se encoge nunca.
- **Las teselas del mapa también se guardan** (`lib/teselas.ts` + tope y caducidad en
  `sw.js`), y son dos cosas distintas:
  · **El caché normal pasó de 700 a 3.000 teselas, con caducidad de 30 días.** Guardar
    mapa es lo más barato que hay —un mapa cambia unas pocas veces al año y pedirlo otra
    vez cuesta una petición a un servidor de voluntarios—, y con 700 mirar otra comarca un
    rato dejaba la tuya fuera. 3.000 a ~6 KB de media son unos 18 MB. La caducidad va por
    **una sola marca** (`TILE_STAMP`) y vacía el caché entero: una respuesta de otro
    dominio llega `opaque`, así que no se le puede leer la fecha, y un índice aparte sería
    una segunda verdad que se desincroniza. Ojo con la trampa que ya estuvo puesta: la
    marca es la entrada **más antigua**, así que el LRU se la llevaba la primera y la
    caducidad no se disparaba nunca — `trimCache` la excluye y hay test.
    Sin marca **no se borra nada**: el caché que ya tiene la gente no la lleva, y tirárselo
    sería castigar justo a quien lleva la app instalada desde antes.
  · **Al guardar una zona se ofrece guardar el mapa**, tercer paso tras los datos y las
    fotos, con el número de teselas y los MB delante. Va al caché **fijado**, así que ni lo
    descarta el LRU ni lo caduca la marca. Se guarda lo que estás viendo y **dos niveles de
    zoom más** (`teselasDe`, `niveles = 2`): uno más cuesta cuatro veces y el tercero
    dieciséis. Medido: una vista de móvil a z14 son **13 teselas**, Barcelona a z15 son 84.
    De la capa **que estés usando** — guardar OSM a quien camina con el topográfico del IGN
    es guardar un mapa que no va a mirar.
  · **Lo que NO se hace: descargar corredores ni comarcas enteras.** Una comarca de z12 a
    z16 son unas 15.000 peticiones a servidores ajenos y gratuitos, y la política de
    teselas de OSM prohíbe expresamente la descarga masiva de áreas. Si algún día hace
    falta de verdad, el camino honesto es pagar un proveedor (MapTiler, Protomaps), no
    exprimir el de voluntarios.
  · `urlDeTesela` fija el subdominio (`a`) **a propósito**: si bailara sería otra clave de
    caché y no acertaría nunca, el mismo fallo que las coordenadas sin redondear. Y la
    fórmula de la fila es Mercator y **no** es simétrica con la de la columna: copiar la de
    la longitud es el error clásico y da un mapa desplazado que solo se nota lejos del
    ecuador. Hay test de las dos, verificados rompiéndolos.
- **Vaciar lo guardado, desde los ajustes** (`lib/almacen.ts` + `EspacioEnElMovil.tsx` en
  `/me/settings`, mensajes `medir`/`vaciar` del service worker). El caché **fijado** no lo
  recorta el LRU ni lo caduca la marca —a propósito, para eso existe—, así que era lo único
  de la app que crecía **sin techo y sin puerta de salida**: quien guardara varias zonas con
  sus fotos y su mapa no podía recuperar ese espacio salvo desinstalando. Antes de fijar
  teselas y fotos eran kilobytes y no se notaba; ahora son decenas de MB por zona.
  · La lista de lo vaciable es una **lista blanca en el service worker** (`VACIABLES`), no
    el nombre que llegue en el mensaje. Fuera quedan el **shell** —vaciarlo dejaría la app
    sin arrancar sin cobertura, justo lo contrario de lo que hace esta pantalla— y la
    **bandeja de salida**, que ni siquiera es un caché: son aportaciones **sin enviar**, lo
    único aquí que no se puede recuperar de ninguna manera. Hay test de que ningún nombre
    (`shell`, el nombre real del caché, `../shell`) se cuela.
  · **Los tamaños los formatea `Intl`** (`lib/tamanos.ts`, `formateaTamano`), no los
    diccionarios. Salía todo en MB, así que la cuota se leía «39186.8 MB libres», que no
    significa nada; y el punto decimal tampoco era el nuestro. `style: 'unit'` pone el
    separador **y** el nombre de la unidad, y de paso acierta con el francés, donde son
    «Mo» y «Go» — escribirla en los ocho diccionarios habría sido una lista paralela que se
    separa del corte de unidad a la primera. El corte va en **1.024** y baja a **kB** por
    debajo del mega, o una instalación recién hecha diría «0,0 MB» y parecería rota. Vive
    en un fichero aparte de `almacen.ts` por lo mismo que `lib/apiError.ts` se separó de
    `api/client.ts`: aquel toca `navigator` y no se puede importar desde un test de Node.
    Ojo al escribir los tests: `Intl` separa cifra y unidad con un **espacio fino no
    separable** (U+202F en francés) y escribe «kB» en minúscula. Las dos cosas son
    correctas y lo que se ajusta es el esperado, no el código.
  · «Libres» era falso y ahora dice **«disponibles»**: `quota - usage` es lo que el
    navegador le deja guardar a esta app, no el espacio libre del teléfono.
  · **El total sale de `navigator.storage.estimate()` y NO de sumar los cuerpos**: sumarlos
    obligaría a leer hasta 3.000 teselas para pintar una cifra. El precio es que es del
    origen entero y aproximado, así que se enseña **una sola cifra** y nunca repartida por
    filas — decir «las fotos ocupan 14 MB» con este dato sería inventárselo. Si el navegador
    no lo da (Safari lo ha ocultado en algunas versiones), la línea no se pinta.
  · Las filas van de más a menos deliberado: primero lo que la persona guardó a propósito
    (la zona, que vive en IndexedDB y se borra por su camino, y lo fijado) y después lo que
    se llenó solo (mapa navegado, fotos vistas, respuestas). Lo segundo se vacía sin
    ceremonia porque se repone con la siguiente visita.
  · La marca de fecha de las teselas **no se cuenta** como tesela: no es una y no se le
    enseña a nadie. Hay test.
- **Lo que sigue sin cumplirse del cartel:** el mapa **fuera de la zona guardada y de sus
  dos niveles de zoom**. Alejarse mucho o acercarse demasiado sigue dando casillas en
  blanco, y se dice en pantalla en vez de dejar que se descubra en el monte.
- **La pantalla de «sin conexión» del service worker es una página de verdad, no un
  `<h1>`.** Era literalmente `new Response('<h1>Sense connexió</h1>')`: catalán a la
  fuerza, fuente serif del navegador y **sin una línea de JavaScript**, así que al volver
  la cobertura se quedaba ahí para siempre — no había nadie escuchando. Se reportó desde el
  monte con una captura y parecía un fallo de la app. Ahora va traducida a los ocho idiomas
  (elegidos con `navigator.language`, que es lo único que el SW tiene a mano: no ve
  `localStorage`), con estilos que siguen el tema, botón de reintentar y recarga sola con
  `online` y `visibilitychange`.
  Sale **al navegar**, y por eso aparecía al entrar en una fuente: el popup del mapa es un
  `<a href>` de verdad, así que tocarlo es una navegación completa y no un cambio de ruta
  de React.
  Tres causas de que faltara el shell, arregladas: solo se miraba la clave `/index.html` y
  no también `/`; `precargaShell` corría **únicamente en `install`**, así que una
  instalación con la red a medias dejaba la app sin shell para siempre (ahora se repone en
  `activate`); y `staleWhileRevalidate` devolvía `undefined` sin red ni caché, que desde
  `respondWith` es un fallo opaco y no un error de red limpio — y de eso depende que
  `isOffline` acierte y la ficha caiga a la zona guardada.
- **Las pantallas que sirven sin red se bajan de antemano** (`lib/precargaRutas.ts`). Un
  trozo `lazy()` solo entra en el caché **la primera vez que se abre esa pantalla**, así
  que quien guardaba una zona, se iba al monte y tocaba una fuente se encontraba con que el
  trozo de la ficha nunca se había pedido. Se precargan la **ficha** (sale de la zona
  guardada y lleva la flecha de los últimos metros) y **Agua en mi ruta** (recorrido en
  `localStorage`, fuentes fijadas), 4 s después del arranque y solo con red. El mapa no
  hace falta —es la pantalla de inicio—, y las demás no funcionan sin servidor: precargarlas
  sería gastar los datos de alguien para que le salga un error más bonito.
  Ojo al comprobarlo: **en desarrollo no se ve**, porque Vite ya tiene esos módulos en su
  grafo y el `import()` no pide nada. Hay que medirlo sobre el build (`vite preview`), donde
  se ve el trozo con su huella bajándose a los 4,5 s.
- **«Sin cobertura» y «la app se ha actualizado» dan el MISMO error**, porque en los dos
  casos el trozo no llega — «failed to fetch dynamically imported module». Y piden lo
  contrario: con un despliegue nuevo hay que recargar, y sin red recargar te deja sin ni
  siquiera lo que tenías en pantalla. `esFalloPorFaltaDeRed` los separa mirando
  `navigator.onLine`, que miente en un sentido inofensivo (puede decir «sí» con una wifi sin
  salida, y entonces se trata como despliegue, que es lo de antes) pero nunca dice «no»
  teniendo red. Sin esto, la app decía «se ha actualizado, recarga para seguir» en pleno
  modo avión: reportado con una captura.
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

## Municipio exacto (`fonts.municipality`, límites del IGN)

- `region` **no es el municipio** —son provincias, distritos o départements—, y hasta ahora
  el buscador tenía que decir «Barcelona» donde la persona esperaba «Moià». Ahora hay
  columna, sale de los **recintos municipales del IGN** por point-in-polygon
  (`populate-municipalities`) y **no se adivina nada**: o el punto cae dentro del polígono
  o no cae.
- **Por qué no vale «el pueblo más cercano»**, que era la alternativa barata y estuvo a
  punto de hacerse: medido sobre 2.000 fuentes catalanas, la distancia al núcleo más
  próximo tiene mediana de **1,64 km**, p90 de 4,55 y máximo de 16,9, y **una de cada
  cuatro está a más de 3 km**. Escribir «Moià» para una fuente a nueve kilómetros es
  inventarse un dato — y una vez en una columna se propaga al buscador, a `/zones` y al
  ranking.
- Resultado medido: **52.310 de 52.336 fuentes españolas (100 %)**. Fuera de España queda
  nulo, que significa «no lo sabemos» y no «ninguno».
- **Corrige el país de rebote.** Fuentes que Natural Earth ponía en Francia o Portugal caen
  dentro de Irun, Hondarribia, Puigcerdà o Salvaterra de Miño: son españolas y el borde de
  Natural Earth estaba mal (ya sabíamos que falla 1,9 km de mediana). El municipio es el
  dato más fiable que tenemos de la zona de una fuente.
- Se guarda también el **código INE**: hay 19 nombres de municipio repetidos en España y el
  nombre no sirve para cruzar con nada.
- El fichero de límites **no se versiona** (12 MB con la precisión necesaria); se regenera
  con `scripts/ign-municipios.py` desde la descarga del CNIG. Runbook en DEPLOY.md.
- Dos fallos **silenciosos** que ya están resueltos en el script y conviene no reintroducir:
  el `.dbf` viene en **UTF-8** y su `.cpg` lo dice —leyéndolo como Latin-1 salen
  «Salvaterra de MiÃ±o» y «PuigcerdÃ », y el fichero se genera igual—; y Douglas-Peucker
  sobre un **anillo cerrado** da distancia cero para todos los puntos, así que cada
  municipio se quedaba en dos puntos y se descartaba entero, con un GeoJSON de 42 bytes
  como único síntoma.

## Páginas por pueblo (`Place` + `/places/:slug`)

- «Fonts a Moià». Es el único canal que sigue trayendo gente **cuando dejas de empujar**:
  nadie busca el nombre de una fuente suelta —por eso el sitemap de fichas solo puede
  ofrecer 553, las que ha tocado alguien— pero «fonts Moià» sí se busca. Medido: de 8.790
  núcleos de España, **6.568 tienen alguna fuente cerca y 4.436 tienen tres o más**, que es
  el corte para entrar en el sitemap. De 553 URLs indexables a casi 5.000.
- **No hay columna de municipio, y no se ha creado.** `fonts.region` es admin-1
  (provincias) y una columna `municipality` costaría un fichero de **límites municipales**,
  una migración y reprocesar 160.738 puntos en cada importación. La página pregunta al
  revés —**qué fuentes hay cerca de este pueblo**— que es además lo que trae a quien busca.
  Que una fuente entre dos pueblos salga en las dos páginas no es un error: es cierto en
  las dos.
- Los núcleos salen de OpenStreetMap (`place=city|town|village`), la misma fuente que las
  fuentes y la misma licencia. `scripts/nuclis-osm.py` compacta el volcado de Overpass a
  `nuclis-es.json` (539 KB, versionado como las fronteras); `import-places` lo carga, y de
  paso **cuenta las fuentes del radio** y hereda país y demarcación de las de alrededor
  (`mode()`), con el mismo criterio de vecino más cercano que `inheritZone`.
- El radio depende del tipo —6 km una ciudad, 4 una villa, 3 un pueblo— porque el punto de
  OSM es el centro y una ciudad se extiende kilómetros. No es una frontera, es «cerca de».
- El slug se desempata con **las coordenadas** y no con un contador: 86 nombres se repiten
  («El Campillo» hay tres) y un contador depende del orden del fichero, así que la
  siguiente importación podría intercambiar dos pueblos y dejar dos URLs publicadas
  apuntando al sitio equivocado.
- **`font_count` decide si la página existe.** Un pueblo sin fuentes no tiene nada que
  enseñar, y publicar páginas vacías no es neutro: le dice a Google que el sitio está lleno
  de relleno. Es el mismo argumento que ya filtra las fichas en `SitemapController`.
- La página enlaza **los seis pueblos más cercanos** con fuentes, y eso no es adorno: sin
  enlaces entre ellas, miles de páginas cuelgan solo del sitemap y se rastrean mal. Ojo:
  ordenar esos vecinos por número de fuentes daba Granollers y Castellar del Vallès como
  «vecinos» de Moià —los mayores de la caja, a 28 km—; van por distancia.
- **Cada página escribe sus propias etiquetas** (`functions/places/[slug].ts`), igual que
  las fichas: un rastreador no ejecuta React, así que sin esto las 4.436 páginas comparten
  `<title>`, descripción y `og:url` — para Google, 4.436 copias de la portada, que es peor
  que no tenerlas.
  **Y hubo que sacarlas del middleware.** `_middleware.ts` envuelve a las funciones de
  ruta, así que lo que escriben se pisa **después**; solo se apartaba de `/fonts/`. Con
  `/places/` fuera de esa lista, la función se ejecutaba bien y el título seguía siendo el
  genérico. No se ve leyendo el código —compila y corre—: se vio sirviendo la página con
  `wrangler pages dev` y mirando el `<title>`. Ahora la lista es `CON_METADATOS_PROPIOS` y
  la siguiente ruta con etiquetas propias tiene que apuntarse ahí.
  El `noindex` de los pueblos con menos de tres fuentes usa **el mismo corte** que el
  sitemap: ofrecer en el sitemap lo que no quieres indexado es mandar señales
  contradictorias.
  Ojo con la foto de la tarjeta: se descartan los **SVG**, que los scrapers no pintan —una
  tarjeta con un SVG sale sin imagen, peor que la genérica.
- Dice **cuántas están comprobadas**, aunque casi siempre sea ninguna. Es lo que convierte
  la página en una invitación a aportar en vez de en una promesa que no se sostiene.

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
- **No todo se pusha, y ese es el diseño** (`Change.urgente`). El criterio es uno: *¿cambia
  lo que voy a hacer?* Se seca, se rompe, ya no está, la esconden o alguien abre una
  incidencia → notificación del sistema, que es el desvío de tres kilómetros que esta app
  existe para evitar. **Sale agua → solo campana**, y ahí está el grueso del volumen:
  `flowing` es con diferencia la reseña más común y que una fuente que ya funcionaba siga
  funcionando no exige nada de ti. «Resuelta» tampoco… **salvo para quien la abrió**
  (`tambienPushA`, con los autores que devuelve ahora `autoResolve`): se molestó en avisar
  y eso cierra su propio bucle. Una app se silencia **una vez** y no se vuelve, así que
  cada aviso que llega tiene que haber valido la pena.
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

## Notificaciones push (`Push/` + `lib/push.ts`)

- Los mismos cuatro avisos de `FontWatchNotifier` salen además como **notificación del
  sistema**. Es lo que le faltaba a la campana para servir de algo: la campana solo la ve
  quien ya ha abierto la app, y de una fuente que se seca hay que enterarse **sin** abrir
  nada. No cuesta dinero por envío, así que no lleva la regla de `isAround` de las
  menciones por correo.
- **El protocolo va escrito a mano y sin dependencias nuevas** (`Push/WebPush.swift`,
  RFC 8291 + 8188; `Push/Vapid.swift` para el JWT ES256). `swift-crypto` ya trae P-256,
  HKDF y AES-GCM. Son ~120 líneas de criptografía estándar y meter una dependencia sin
  mantenimiento para eso era peor negocio.
- **Por qué hay que cifrar, y no vale un push vacío:** lo simple sería mandar un aviso sin
  cuerpo y que el service worker pidiera los avisos al servidor. No puede: el token de
  sesión vive en `localStorage` y un service worker no lo ve, y con la app cerrada no hay
  ninguna pestaña a la que preguntárselo. O el texto viaja dentro del push, o no hay texto.
- **El texto lo pone el SERVIDOR** (`PushCopy`, ocho idiomas), al revés que la campana. No
  es una incoherencia: un push lo pinta el sistema en la pantalla de bloqueo, donde no hay
  diccionarios ni forma de saber qué idioma elegiste. Se usa `users.lang`, el mismo trato
  que ya tienen los correos. Las dos cosas se guardan: la campana con su código —que se
  traduce al idioma que leas *ahora*— y el push con su frase congelada.
- Tres trampas del cifrado que **fallan en silencio** y por eso tienen test:
  · el delimitador **`0x02`** del último registro (sin él el navegador descifra bien y
    **descarta** el mensaje: en el servidor todo parece correcto y no llega nada);
  · el `info` del primer HKDF lleva **las dos claves públicas**, que es lo que ata el
    mensaje a esa suscripción;
  · la firma ES256 es **r||s en crudo** y no el DER de `derRepresentation` — con DER el
    servicio responde 401 sin decir cuál de las dos cosas está mal.
  Se prueba **descifrando lo que ciframos** con la clave privada del navegador de mentira,
  que es justo lo que hace un móvil. Verificado rompiendo las tres.
- El `aud` del JWT es **el origen del endpoint**, no el nuestro: es lo que impide que un
  token capturado sirva para empujar avisos por otro servicio. Se firma uno por destino.
- `push_subscriptions` **sí** es una tabla propia, al revés que seguir una fuente: no es
  una relación con una fuente, es **un aparato**. El endpoint es la identidad (índice
  único) y al resuscribirse se **actualiza** en vez de insertar — un navegador puede rotar
  sus claves conservando el endpoint, y con dos filas una ya no descifraría. Un **404 o
  410** del servicio significa que esa suscripción ya no existe y se borra en el momento.
- **La ruta va con `UserToken.authenticator()`, no con `User.authenticator()`.** El
  segundo es autenticación **básica** (usuario y contraseña), así que ignora el `Bearer`
  que manda la app y `guardMiddleware` contesta **401 a todo el mundo**. Compila, se lee
  igual de bien que el correcto y llegó a producción: los tests que había eran del cifrado
  y de los textos, y **ninguno tocaba la ruta**. Ahora hay uno que se suscribe con el token
  de sesión de verdad. Todas las demás rutas del proyecto ya usaban el bueno.
- **El permiso se pide dentro del gesto y sin nada de red por delante.** Safari exige que
  `requestPermission()` salga de la pulsación, y un `await` a `/push/key` por delante puede
  consumir esa activación y hacer que el diálogo **se rechace solo, sin llegar a verse**.
  Por eso la clave pública se pide **al montar** la pantalla. En iOS no es un detalle: el
  permiso se pide una vez en la vida y, denegado, no hay forma de volver a preguntar.
- **`POST /push/test` se manda un aviso a uno mismo** (botón en ajustes, solo con los
  avisos ya encendidos). Sin él, probar esto exige una segunda cuenta y una reseña real, y
  cuando no llega nada no se puede separar «no funciona el push» de «nadie ha reseñado».
  El destinatario es la propia sesión, así que no sirve para molestar a nadie.
- **Qué avisos, en tres grupos y no uno por evento** (`AddPushPrefsToUser`:
  `push_font_updates`, `push_mentions`, `push_admin`). Un interruptor por cada cosa que
  puede pasar serían nueve casillas que nadie lee y que hay que ampliar cada vez que se
  añade un aviso. Se agrupan por **lo que significan para quien los recibe**: hechos de una
  fuente que sigues, alguien que te habla, y lo de administración —este último solo se
  pinta a quien de verdad lo recibe—. Nacen encendidos, como `mention_emails`: el permiso
  del navegador ya es una puerta explícita, y esto es para afinar, no para volver a pedir
  permiso. **Solo aparecen con el push ya encendido**: preguntar qué tipos quieres antes de
  que hayas dicho que sí es pedir dos decisiones para nada.
  **Apagar un grupo silencia la notificación del sistema, NUNCA la campana** — que es el
  registro de lo que pasó y no interrumpe a nadie. Hay test, y cruzar las dos cosas es el
  error fácil. Lo único que no pasa por aquí es que se te haya ampliado el cupo: es la
  respuesta a algo que pediste tú, y silenciar la contestación a tu propia solicitud no es
  una preferencia razonable.
- El interruptor de ajustes (`AvisosDelSistema`) es **del aparato y no de la cuenta**: el
  permiso lo concede el navegador, y quien los quiere en el móvil no ha dicho nada de su
  portátil. Por eso no pasa por `savePrivacy`.
- Los tres estados que no son «encendido» **se explican**: en **iOS solo existe con la app
  instalada** en la pantalla de inicio (en una pestaña de Safari `PushManager` ni está);
  **denegado no se puede volver a pedir nunca** desde la web, hay que ir a los ajustes del
  navegador; y **sin claves en el servidor no se pide ningún permiso** — gastar el único
  «permitir» de alguien para nada es lo peor que se puede hacer aquí.
- Todos los avisos de una misma fuente comparten `tag`, así que el nuevo **sustituye** al
  anterior. Volver de una excursión con nueve notificaciones de la misma font es la forma
  más rápida de que te silencien. Agrupar por tiempo sigue pendiente.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`, generadas con
  `swift run App vapid-keys`. **Cambiar la pública invalida todas las suscripciones a la
  vez y sin error visible.** Runbook en DEPLOY.md.

## La cola de salida tiene dueño, y tiene salida

- **Cada aportación encolada se apunta con QUIÉN la guardó** (`userID` en `outbox.ts`), y
  solo se envía si la sesión puesta es la misma. Sin eso se publicaba **con la cuenta que
  hubiera al enviar**, no con la que la escribió: reseñar una fuente sin cobertura con la
  cuenta de administrador, darse cuenta, entrar con la propia… y la de antes seguía en la
  cola esperando a salir firmada por quien no era. Le pasó al autor de la app. Desde fuera
  no se ve nada raro: la reseña aparece con el nombre equivocado y ya está.
- Las de otra cuenta **se quedan esperando, no se descartan**: son aportaciones sin enviar
  y volverán a salir solas cuando esa persona entre otra vez. Mismo trato que el historial
  de búsquedas y la ruta recordada. Las guardadas **antes** de esto no llevan dueño y se
  envían como siempre — bloquearlas sería tirar aportaciones reales de gente que no ha
  hecho nada raro, y no hay forma de saber de quién eran.
- **La marca de «en vuelo» dura 2 minutos y no se soltaba al interrumpirse.** Existe para
  que la página y el service worker no manden lo mismo dos veces, pero si el envío se corta
  a media —un cierre de sesión, cerrar la app— el elemento se quedaba marcado y durante dos
  minutos «enviar ahora» **lo saltaba en silencio** y contestaba «no se han podido
  sincronizar». Se pulsa otra vez y lo mismo: ése era el bucle que se reportó, y desde
  fuera no se distingue de un fallo de red. Ahora el envío manual (`flushOutbox(true)`)
  ignora la marca, y cerrar sesión suelta las que hubiera. El riesgo aceptado es mandar dos
  veces si el service worker estuviera enviando ese mismo elemento en ese instante, que es
  mucho más raro que el callejón sin salida que evita.
- **Y ahora se pueden tirar** (`descartaPendientes`, enlace en `PendingUploads`). No había
  ninguna salida: lo que no puede salir —de otra cuenta, ya publicado a mano, o rechazado
  de una forma que la cola toma por transitoria— se reintentaba **para siempre**, con el
  aviso clavado arriba y un «enviar ahora» que no terminaba nunca. Se pregunta antes,
  porque esto sí borra de verdad: son datos que solo existen en ese móvil. Va en texto
  pequeño y no como botón principal —la salida tiene que existir, no invitar— y **debajo
  del texto**, no entre el texto y el botón de la derecha: ahí quedaba embutido entre dos
  cosas y encogía la columna del mensaje, que es lo que hay que leer. La tarjeta crece un
  poco y se acepta.
- Y si **todas** las pendientes son de otra cuenta, **no se ofrece «enviar ahora»**: el
  vaciado las salta a propósito, así que sería otro botón que se pulsa y no pasa nada —
  exactamente el pecado que esto vino a arreglar.
- El aviso **dice cuál de los tres problemas es**. «No se han podido sincronizar» sobre una
  cola que es de otra cuenta manda a mirar la cobertura, que no tiene nada que ver.

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

## Qué versión lleva cada uno (`MoreMenu`, al final)

- Al final del menú de los tres puntos: `v0.1.0 · 27/08 11:59`. **Van las dos cosas a
  propósito.** El número sale de `package.json` y lo subes tú: dice *qué release es*. La
  fecha la pone el build y dice *si esta persona tiene el despliegue de hace un rato o el
  de ayer*, que es la pregunta de verdad cuando alguien reporta algo — en una tarde de
  quince commits el número solo no distingue nada.
- **Al tocarlo copia el identificador completo** (`FontApp v0.1.0 · <commit>-<epoch>`).
  Quien reporta un fallo por WhatsApp lo pega y se acabó el «¿tú qué versión tienes?».
  Ese identificador es el `__BUILD_ID__` que ya existía para `AppUpdatePrompt`; aquí solo
  se enseña.
- Va al final y en `caption`: no es una acción, es un dato que solo se busca cuando algo
  va mal.
- Al subir la versión se toca **`package.json` y nada más**: `vite.config.ts` la lee de
  ahí y la inyecta como `__APP_VERSION__`. Se lee con `readFileSync` y no con un `import`
  de JSON porque con `module: NodeNext` eso pide un import attribute y no compila.

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

## La caja de la ficha es de comentarios; la incidencia se marca

- Era la **única caja de la ficha que no pedía nada más** —ni estado del agua, ni
  valoración, ni foto—, así que se convirtió en el camino de menos resistencia para decir
  cualquier cosa. Entraban comentarios de organización («¿podrías añadir una foto
  @usuario?») que nadie va a resolver nunca, y se quedaban abiertos **inflando el recuento
  de incidencias abiertas** — el mismo que se le enseña a un ayuntamiento en
  `/municipalities/:ine`. Basta con que una de las «incidencias abiertas» sea una petición
  de foto para que ese informe deje de creerse entero.
- Ahora `font_reports` lleva `is_incident` y **solo lo marcado** entra en la cola, cuenta
  como avería abierta, **sale en novedades**, paga gotas, avisa con push y se puede
  resolver. Lo de novedades es la otra mitad de lo mismo: un comentario de organización no
  tiene por qué tener protagonismo en la portada.
- **La columna nace a `true` y el DTO a `false`**, y no es una incoherencia: lo ya escrito
  entró cuando la caja se llamaba «incidencia» y tiene que conservar su significado; de
  aquí en adelante marcarla es un gesto explícito o volveríamos a donde estábamos. Un
  cliente sin actualizar publica comentarios, que es el fallo barato.
- **La tabla y el modelo NO se renombran.** `FontReport` con un `isIncident` al lado no
  engaña a nadie, y renombrar en trece ficheros no arregla nada que no arregle la bandera.
  Misma regla que `guard.showAll` o `FontFavorite`.
- **Marcar y desmarcar**: `PATCH /fonts/:id/report/:reportID/incident`, autor sobre lo
  suyo y moderador+ sobre lo ajeno. **No se abre por nivel**, al revés que cerrar una
  incidencia: decidir si el aviso de otro es una avería es criterio sobre una persona y no
  sobre el mapa, que es la línea que ordena toda la escalera de capacidades.
  Desmarcar **borra el cierre**: «resuelta» no significa nada sobre un comentario, y si se
  volviera a marcar aparecería cerrada sin que nadie la haya arreglado.
- Un comentario **no se puede resolver** (400 `report.notAnIncident`) y la ficha no pinta
  el botón: ofrecer una acción que solo sabe dar error es lo que esta app no hace.
- **Tipo de incidencia** (`IncidentKind`: `broken` · `dry` · `dirty` · `access` ·
  **`other`**), preguntado **solo cuando ya has dicho que es una incidencia**. `other`
  existe porque sin él la gente mete lo que sea en la categoría que más se le parece y la
  clasificación deja de valer — el mismo problema que la bandera viene a arreglar, un
  nivel más abajo.
- **`/admin/reports`** (solo admin) lista todo lo escrito con su interruptor en cada fila.
  Existe porque la marca llegó **después que los datos**: hay que poder repasarlos de una
  sentada, y ficha por ficha eso es imposible. Escribe por la **misma ruta** que la ficha,
  no por una de administración aparte — dos puertas con reglas distintas para lo mismo es
  como se acaba teniendo dos comportamientos.
- Hay test de las dos mitades (`testCommentIsNotAnIncidentUntilItIsMarked`), **verificado
  rompiéndolo**: con el `create` volviendo a marcar por defecto, sale en rojo.
- **Aviso al tocar el DTO de un endpoint: el compilador no cubre los tests que publican con
  un diccionario suelto.** Añadir `isIncident` rompió la construcción de `CreateReportDTO`
  en cuatro tests y eso se vio al compilar; otros dos publicaban `["message": …]`, que
  encaja con cualquier cosa, así que compilaron y **llegaron a CI en rojo** creando
  comentarios donde el test esperaba una incidencia. Los dos ya pasan por el DTO. La
  lección de siempre y van dos veces: **la suite entera antes de subir**, no la filtrada,
  justo cuando se cambia el significado por defecto de algo.

## Confianza del estado de una fuente

- Es una categoría explicable, no una puntuación opaca: **confirmada**, **informe
  reciente**, **datos contradictorios**, **información antigua** o **sin comprobar**.
- La ventana de actualidad es de 30 días. Una confirmación («sigue igual») refresca el
  último parte. Para quedar confirmada hace falta una confirmación independiente o dos
  autores identificados distintos con partes recientes.
- **El autor SÍ puede confirmar su propia reseña, pasado un día, y solo cuenta como
  fecha.** Antes estaba prohibido del todo (403) y la regla estaba mal puesta por los dos
  lados: **no frenaba la trampa** —publicar una reseña nueva cada día diciendo lo mismo
  siempre se ha podido, así que el 403 no cerraba ninguna puerta— y **sí frenaba el caso
  normal**: la fuente de tu pueblo, reseñada hace trece días, por la que vuelves a pasar.
  Reportado por el autor de la app.
  Lo que se separa son dos cosas que el código mezclaba: **corroboración** (¿alguien más lo
  dice?) y **actualidad** (¿de cuándo es el dato?). La propia no suma respaldo —y sigue sin
  sumarlo, así que una fuente no llega a «confirmada» a base de repetirse— pero sí refresca
  la fecha, que es lo que hace falta saber antes de desviarse tres kilómetros.
  Ojo: quitar solo el 403 **no habría hecho nada visible**. Las autoconfirmaciones se
  ignoraban también para `last_at`, tanto en `FontSummary` como en
  `FontCommentController.confirmations`, así que el botón habría existido sin efecto. El
  cambio de verdad es ése: `quantity` sigue filtrando y `last_at` ya no.
  La espera es de **24 h** desde la reseña *y* desde la última confirmación propia, y se
  **refresca la fila** en vez de acumular. `confirmedByMe` caduca con ella, así que el
  botón vuelve solo — el cliente no cambió. Las autoconfirmaciones siguen **sin puntuar**
  (`ContributionScore` ya las descartaba y lo dice en sus avisos).
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
