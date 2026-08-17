# FontAppBE

App para localizar **fuentes de agua** cercanas por geolocalización ("font" = fuente,
no tipografía), con usuarios, incidencias y reseñas de estado (estrellas / estado del agua / foto).
El contrato real de la API está en [docs/api.md](docs/api.md); el brief original en [definitions.md](definitions.md).

## Stack
- **Backend:** Swift 6.3 · Vapor 4 · Fluent + PostgreSQL · SwiftPM (sin proyecto Xcode).
- **Web:** Vite + React 19 + TypeScript en `web/` (Leaflet + markercluster para el mapa).
  UI con **MUI (Material Design)** — tema en `web/src/theme/` (`ThemeModeContext` fija `data-theme` en `<html>` y alimenta el `ThemeProvider` de MUI; claro/oscuro/sistema). Los popups del mapa siguen siendo HTML imperativo.
  PWA con service worker propio (`web/public/sw.js`): lecturas offline y **bandeja de salida**
  (`web/src/lib/outbox.ts`, IndexedDB) para crear fuentes/reseñas sin cobertura; se vacía sola al
  volver la red y, en Android, también con la app cerrada vía Background Sync (Safari/iOS no lo tiene).
  i18n propio sin dependencias en `web/src/i18n/` (CA por defecto + ES, selector en la barra, detecta navegador y persiste en `localStorage`).

## Comandos
- Build / tests backend: `swift build` · `swift test` (los tests de integración usan la DB `fontapp_test`).
- Postgres local: `brew services start postgresql@16` (binarios en `/opt/homebrew/opt/postgresql@16/bin`,
  keg-only; rol `vapor`, DB `fontapp` — ver `env.development`). Alternativa: `docker compose up db -d`.
- Migrar: `swift run App migrate --yes` · revertir: `--revert --yes`.
- Sembrar: `swift run App seed [--force] [--demo]` (fuentes reales del Moianès; `--demo` añade usuarios+reseñas).
  Con la BD ya poblada (p. ej. tras `import-fonts`), `seed --demo` NO reinserta fuentes: solo añade
  reseñas de ejemplo sobre las fuentes existentes de la zona del Moianès (bbox), sin tocar el resto.
- Importar/zonas: `import-fonts` (Overpass/OSM) · `import-geojson` (ICGC/ACA; acepta Point y
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
    semanal). Primero **las barras de la comarca** y luego la tabla, plegada: la barra es
    del territorio y no de nadie. El ranking es **mensual** a propósito — uno histórico lo
    gana para siempre quien llegó primero. `gamification_opt_out` **saca de la tabla pero
    no de las barras**, y hay un test que fija las dos mitades de la regla.
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
    Cinco capacidades: `addSecondaryPhoto` (3), `resolveIncident` (6), `relocateAnyFont`
    (5), `deleteAnyPhoto` (7) y `revertAnyEdit` (8). Todas reversibles. Sustituir una foto
    que ya existe y borrar una fuente **no** se abren por nivel: la primera invita a la
    guerra de ediciones y la segunda no se deshace.
    `Capability.requiresDefinitivePoints` parte la regla de la época en dos: las que
    **destruyen o deshacen trabajo ajeno** (`deleteAnyPhoto`, `revertAnyEdit`,
    `relocateAnyFont`) la exigen; añadir una foto o cerrar una incidencia, no. Con la
    época sin poner, exigírselo a todas dejaba inservibles justo las nuevas.
    Nivel 10 = **candidatura** a moderar su región a propuesta de un admin, nunca
    concesión automática: moderar es poder sobre personas y no cuelga de un contador.
    Falta acotar `UserRole.moderator` por región — hoy modera todo el mapa.
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
    mensual por comarca, y lo es a posta. Sin insignias todavía: salen de recuentos por
    familia que hoy solo se saben usuario a usuario.
  - **Perfil público** (`/users/:id`): el nivel y las insignias **conseguidas**, con el
    visor a pantalla completa. La ruta resuelve **por username además de por UUID**, como
    el resto de `/users/:id`: solo aceptaba el UUID y `/users/oriol_t` daba 400 — la ficha
    de la fuente funcionaba porque allí se tiene el UUID del creador. Hay test.
    `GET /users/:id/badges` devuelve ahora también `level`
    (`null` si lo tiene apagado o si aún no ha aportado). Solo lo ganado: sin la escalera,
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
    siguiente visita. Se compara contra una foto en `localStorage` (`badges:seen`), sin
    estado en el servidor; por eso **la primera vez no celebra nada**, o quien ya tiene
    ocho se comería ocho fiestas el día del despliegue. Una comprobación por sesión, solo
    con buena conexión (`navigator.connection`: nada con ahorro de datos ni en 2g) y
    usando `GET /users/:id/badges`, que ya existía, es pública y va cacheada 5 min. Si
    caen varias a la vez se enseña **una** y se dice cuántas más hay. El confeti es un
    `<canvas>` de cien rectángulos, sin dependencia, y no se pinta con
    `prefers-reduced-motion` (el diálogo sí).
  - Insignias de familia dibujadas: `web/public/badges/<clave>.png` (`BADGE_ART` +
    `BadgeArt.tsx`), mismo script que los niveles. Solo las de **grado único** — las de
    bronce/plata/oro serían tres ficheros por familia y siguen con icono coloreado.
  - `GAMIFICATION_EPOCH=AAAA-MM-DD`: fecha desde la que los puntos son **definitivos**.
    Antes de ella todo es provisional y `--rescore` lo reconstruye; a partir de ella se
    niega. No congela las anulaciones: borrar o denunciar una reseña anula igual, esté
    donde esté respecto a la línea.
- Roles: `swift run App set-role <username> <user|moderator|admin|owner>` (owner solo por CLI).
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
- Cercanía: bounding box + haversine. A escala → PostGIS + índice GiST.

## Despliegue
- `Dockerfile` multi-stage (probado) + `.dockerignore`; CI en `.github/workflows/ci.yml`.
- Config por env: `DATABASE_URL` (o `DATABASE_*`), `WEB_ORIGIN` (CORS en prod), `AUTO_MIGRATE=true`.
- Web: build con `VITE_API_URL=<origen del backend>`. Guía completa: [DEPLOY.md](DEPLOY.md).

## Novedades (público) y panel
- Actividad reciente (`ActivityController` → `/activity`): fuentes, reseñas, incidencias
  y ediciones mezcladas por fecha, con filtro por zona. **Lectura pública** (`/activity`,
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

## Mapa y ubicación
- Seguimiento continuo con `watchPosition` (`MapPage`): el punto azul se actualiza solo
  mientras caminas. Filtro anti-temblor de 15 m (el GPS baila estando quieto), pausa con
  la pestaña en segundo plano, y la lista de cercanas solo recarga al cambiar de casilla
  de ~100 m — si no, sería una petición por latido del GPS.
- Al abrir la app se ubica sola **si el permiso ya estaba concedido** (nunca lanza el
  diálogo del navegador a bocajarro) y **si no venías de una vista guardada** ni de un
  enlace a una fuente concreta. El mapa te sigue hasta que tocas el mapa: arrastrar o
  hacer zoom desengancha el seguimiento; el botón «centrar en mí» lo vuelve a activar.

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

## Datos de fuentes
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

## Carteles / campañas
- Cartel A5 en catalán en `flyer/` (HTML editable + PDF). `flyer/genera-cartells.py <codis>`
  genera una copia por pueblo con su QR y su código (`fontapp.net/?p=castellcir`).
- Ese código se guarda en `users.signup_source` al registrarse (primera visita gana) y se
  agrupa en el panel de administración. Sirve para saber qué cartel/campaña funciona, que es
  justo lo que el geo-IP del registro NO puede decir (resuelve a la cabecera de comarca).

## Pendiente / deuda
- `R2ImageStorage` (Soto) compila pero **sin probar** contra un bucket real (necesita credenciales `R2_*`); en local usa disco.
- Correo (`MailSender`): en dev `LogMailSender` (solo loguea); en prod `ResendMailSender` si hay `RESEND_API_KEY` + `MAIL_FROM` (requiere dominio propio con SPF/DKIM/DMARC). Sin probar contra Resend real.
  Plantillas en `Sources/App/Mail/`: bienvenida al registrarse (`WelcomeEmail`), reset de
  contraseña (`ResetEmail`, en AuthController) y resumen semanal (`WeeklyDigest` calcula los
  datos, `WeeklyDigestEmail` los pinta). Todas localizadas en los 5 idiomas; los correos sin
  petición del usuario usan `users.lang`. La baja del resumen va firmada con `APP_SECRET`
  (`UnsubscribeToken`) para que funcione desde el buzón, sin sesión.
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
  A escala multi-instancia el rate-limit debería ir a Redis.
- Ubicación de registro (`GeoLocator`): al crear cuenta se deduce país/región/ciudad de la IP
  (solo estadística; nunca se guarda la IP). Noop en dev; en prod `IPAPIGeoLocator` (ip-api.com,
  **tercero**, uso no comercial) con `GEOIP_ENABLED=true`. Alternativa futura: BD local MaxMind
  GeoLite2 (`.mmdb`) → sin llamada externa por registro y la IP no sale del servidor. Ver `docs/api.md`.
- Zona de la fuente: `fonts.country` y `fonts.region` (migración `AddRegionToFont`, nullable) para
  funciones por zona (admins por región, filtros). `region` = **primera división administrativa**
  del país (comunidad autónoma en ES, région en FR, distrito en PT…), consistente en todo el mundo.
  Al **crear** una fuente se heredan de la fuente clasificada más cercana (≤55 km, en
  segundo plano; ver `FontController.inheritZone`): instantáneo y sin cargar fronteras en
  el servidor. Si en la zona no hay ninguna clasificada, quedan nulas (no se inventa nada).
  La autoridad sigue siendo `populate-regions`, que corrige los casos de frontera.
  Se pueblan **offline** con `populate-regions <fronteras.geojson>` (point-in-polygon contra Natural
  Earth admin-1 o GADM nivel 1; sin terceros). Distinto del `GeoLocator`, que es país por IP del
  registro, no por coordenadas del punto. **Pendiente:** poblarlas en producción y, más adelante,
  el modelo de permisos de "admins por región".

## No hacer
- No commitear `.build/`, secrets ni `env.*` (salvo `env.development`).
- No poner el proyecto en iCloud Drive (rompe builds y satura la sincronización).
- No añadir dependencias sin justificarlo en el PR. (`leaflet-rotate`: sin mantenimiento
  desde 2023, pero es la única forma de girar Leaflet sin cambiar de motor de mapas.)
