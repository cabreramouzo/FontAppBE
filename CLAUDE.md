# FontAppBE

App para localizar **fuentes de agua** cercanas por geolocalización ("font" = fuente,
no tipografía), con usuarios, incidencias y reseñas de estado (estrellas / estado del agua / foto).
El contrato real de la API está en [docs/api.md](docs/api.md); el brief original en [definitions.md](definitions.md).

## Stack
- **Backend:** Swift 6.3 · Vapor 4 · Fluent + PostgreSQL · SwiftPM (sin proyecto Xcode).
- **Web:** Vite + React 19 + TypeScript en `web/` (Leaflet + markercluster para el mapa).

## Comandos
- Build / tests backend: `swift build` · `swift test` (los tests de integración usan la DB `fontapp_test`).
- Postgres local: `brew services start postgresql@16` (binarios en `/opt/homebrew/opt/postgresql@16/bin`,
  keg-only; rol `vapor`, DB `fontapp` — ver `env.development`). Alternativa: `docker compose up db -d`.
- Migrar: `swift run App migrate --yes` · revertir: `--revert --yes`.
- Sembrar: `swift run App seed [--force] [--demo]` (fuentes reales del Moianès; `--demo` añade usuarios+reseñas).
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
- Compresión de imágenes: en el cliente (canvas). El borrado del fichero al eliminar fuente/reseña es best-effort (`try?`).
- Sin rate-limit en `/auth/login` ni limpieza de tokens caducados.

## No hacer
- No commitear `.build/`, secrets ni `env.*` (salvo `env.development`).
- No poner el proyecto en iCloud Drive (rompe builds y satura la sincronización).
- No añadir dependencias sin justificarlo en el PR.
