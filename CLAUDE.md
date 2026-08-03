# FontAppBE

App para localizar **fuentes de agua** cercanas por geolocalización ("font" = fuente,
no tipografía), con usuarios, incidencias y reseñas de estado (estrellas / estado del agua / foto).
El contrato real de la API está en [docs/api.md](docs/api.md); el brief original en [definitions.md](definitions.md).

## Stack
- **Backend:** Swift 6.3 · Vapor 4 · Fluent + PostgreSQL · SwiftPM (sin proyecto Xcode).
- **Web:** Vite + React 19 + TypeScript en `web/` (Leaflet + markercluster para el mapa).
  UI con **MUI (Material Design)** — tema en `web/src/theme/` (`ThemeModeContext` fija `data-theme` en `<html>` y alimenta el `ThemeProvider` de MUI; claro/oscuro/sistema). Los popups del mapa siguen siendo HTML imperativo.
  i18n propio sin dependencias en `web/src/i18n/` (CA por defecto + ES, selector en la barra, detecta navegador y persiste en `localStorage`).

## Comandos
- Build / tests backend: `swift build` · `swift test` (los tests de integración usan la DB `fontapp_test`).
- Postgres local: `brew services start postgresql@16` (binarios en `/opt/homebrew/opt/postgresql@16/bin`,
  keg-only; rol `vapor`, DB `fontapp` — ver `env.development`). Alternativa: `docker compose up db -d`.
- Migrar: `swift run App migrate --yes` · revertir: `--revert --yes`.
- Sembrar: `swift run App seed [--force] [--demo]` (fuentes reales del Moianès; `--demo` añade usuarios+reseñas).
  Con la BD ya poblada (p. ej. tras `import-fonts`), `seed --demo` NO reinserta fuentes: solo añade
  reseñas de ejemplo sobre las fuentes existentes de la zona del Moianès (bbox), sin tocar el resto.
- Servidor: `swift run App serve` (`127.0.0.1:8080`). Cargar entorno: `export $(cat env.development | xargs)`.
- Web (dev): `cd web && npm run dev` (proxy `/api` y `/uploads` → backend).
- Imagen Docker del backend: `docker build -t fontappbe .` (probada; ver [DEPLOY.md](DEPLOY.md)).

## Estructura
- `Sources/App/configure.swift` — DB (soporta `DATABASE_URL`), CORS, migraciones, arranque.
- `Sources/App/routes.swift` — registro de `RouteCollection`s.
- `Sources/App/Models/` — modelos Fluent (`User`, `UserToken`, `Font`, `FontReport`, `FontComment`).
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

## Pendiente / deuda
- `R2ImageStorage` (Soto) compila pero **sin probar** contra un bucket real (necesita credenciales `R2_*`); en local usa disco.
- Correo (`MailSender`): en dev `LogMailSender` (solo loguea); en prod `ResendMailSender` si hay `RESEND_API_KEY` + `MAIL_FROM` (requiere dominio propio con SPF/DKIM/DMARC). Sin probar contra Resend real.
- Compresión de imágenes: en el cliente (canvas). El borrado del fichero al eliminar fuente/reseña es best-effort (`try?`).
- Moderación básica: rol `is_admin` (borra contenido de cualquiera; edita/borra fuentes solo creador o admin),
  denuncias de contenido (`content_flags`) con vista de moderación en el perfil del admin.
- Rate-limit en `/auth/*` (en memoria, por IP) y limpieza periódica de tokens caducados (cada 6 h).
  A escala multi-instancia el rate-limit debería ir a Redis.
- Ubicación de registro (`GeoLocator`): al crear cuenta se deduce país/región/ciudad de la IP
  (solo estadística; nunca se guarda la IP). Noop en dev; en prod `IPAPIGeoLocator` (ip-api.com,
  **tercero**, uso no comercial) con `GEOIP_ENABLED=true`. Alternativa futura: BD local MaxMind
  GeoLite2 (`.mmdb`) → sin llamada externa por registro y la IP no sale del servidor. Ver `docs/api.md`.

## No hacer
- No commitear `.build/`, secrets ni `env.*` (salvo `env.development`).
- No poner el proyecto en iCloud Drive (rompe builds y satura la sincronización).
- No añadir dependencias sin justificarlo en el PR.
