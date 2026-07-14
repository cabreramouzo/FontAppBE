# FontAppBE

Backend REST de una app para localizar **fuentes de agua** cercanas por geolocalización
("font" = fuente, no tipografía), con usuarios, reportes de problemas y comentarios.
La spec de endpoints está en [definitions.md](definitions.md).

## Stack
- Swift 6.3 · Vapor 4 · Fluent + PostgreSQL · SwiftPM (sin proyecto Xcode).

## Comandos
- Build: `swift build`
- Tests: `swift test`
- Levantar Postgres local: `docker compose up db -d`
- Migrar: `swift run App migrate --yes` · revertir: `swift run App migrate --revert --yes`
- Arrancar servidor: `swift run App serve` (por defecto `127.0.0.1:8080`)
- Cargar entorno local: `export $(cat env.development | xargs)` antes de `swift run`

## Estructura
- `Sources/App/configure.swift` — DB, migraciones, arranque.
- `Sources/App/routes.swift` — registro de `RouteCollection`s.
- `Sources/App/Models/` — modelos Fluent (`User`, `Font`, `FontReport`, `FontComment`).
- `Sources/App/Migrations/` — una migración por modelo.
- `Sources/App/Controllers/` — un `RouteCollection` por recurso.
- `Sources/App/Utils/Geo.swift` — haversine para `/fonts/near`.
- `Tests/AppTests/` — tests con XCTVapor.

## Convenciones
- Todo `async/await`; nada de `EventLoopFuture` en código nuevo.
- Un `RouteCollection` por recurso, registrado en `routes.swift`.
- Config sensible (DB, secrets) sólo vía `Environment.get(...)`, nunca hardcodeada.
- Entrada/salida vía DTOs `Content` cuando difieran del modelo.
- Cercanía (`/fonts/near`): bounding box + haversine. A escala → PostGIS + índice GiST.

## Pendiente (no implementado aún)
- Controllers de reportes y comentarios (`/fonts/:id/report`, `/fonts/:id/comments`);
  los modelos + migraciones ya existen.
- Login/sesión: `User` ya guarda `passwordHash` (bcrypt) y tiene `verify(password:)`,
  pero falta el endpoint de autenticación.
- Nota: `definitions.md` mezcla `/fonts` y `/fuentes`; el código estandariza en `/fonts`.

## No hacer
- No commitear `.build/`, secrets ni `env.*` (salvo `env.development`).
- No poner el proyecto en iCloud Drive (rompe builds y satura la sincronización).
- No añadir dependencias sin justificarlo en el PR.
