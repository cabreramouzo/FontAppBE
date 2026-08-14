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
- `Tests/AppTests/` — XCTVapor (smoke + integración con DB).
- `web/` — frontend (mapa, detalle, auth, reseñas); ver `web/README.md`.

## Convenciones
- Todo `async/await`; nada de `EventLoopFuture` en código nuevo.
- Un `RouteCollection` por recurso, registrado en `routes.swift`.
- Config sensible sólo vía `Environment.get(...)`, nunca hardcodeada.
- Salida vía DTOs `Content` cuando difieran del modelo (nunca serializar `passwordHash`).
- Auth: token Bearer respaldado en BD (`UserToken`); escrituras protegidas, edición/borrado self-only.
- Cercanía: bounding box + haversine. A escala → PostGIS + índice GiST.

## Despliegue
- `Dockerfile` multi-stage (probado) + `.dockerignore`; CI en `.github/workflows/ci.yml`.
- Config por env: `DATABASE_URL` (o `DATABASE_*`), `WEB_ORIGIN` (CORS en prod), `AUTO_MIGRATE=true`.
- Web: build con `VITE_API_URL=<origen del backend>`. Guía completa: [DEPLOY.md](DEPLOY.md).

## Panel de administración
- Actividad reciente (`ActivityController` → `/activity`): fuentes, reseñas, incidencias
  y ediciones mezcladas por fecha, con filtro por zona. Solo admin; pensado para abrirse
  al público sin cambios (no expone nada que no esté ya en la ficha).
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
