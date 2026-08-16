# FontApp

App para localizar **fuentes de agua** cercanas por geolocalización, con estado del agua,
reseñas (estrellas / foto) e incidencias. Monorepo:

- **Backend** REST: Swift · Vapor 4 · Fluent + PostgreSQL (raíz del repo).
- **Web**: Vite + React + TypeScript con Leaflet (`web/`).

> La app se abre en **http://localhost:5173** (la web). El backend en `http://127.0.0.1:8080`
> es **solo la API** — abrir esa URL en el navegador solo muestra el mensaje de estado, no la app.

## Requisitos
- Swift 6.3 · Node 20+ · PostgreSQL 16

## Puesta en marcha (local)

Necesitas **tres cosas corriendo**: Postgres, el backend y la web.

### 1. Base de datos (PostgreSQL)
PostgreSQL 16 vía Homebrew (keg-only; los binarios no están en el PATH):

```bash
brew services start postgresql@16
```

**Solo la primera vez** — crear el rol y la base de datos que espera `env.development`:

```bash
PGBIN=/opt/homebrew/opt/postgresql@16/bin
"$PGBIN/psql" -d postgres -c "CREATE ROLE vapor WITH LOGIN PASSWORD 'vapor' CREATEDB;"
"$PGBIN/psql" -d postgres -c "CREATE DATABASE fontapp OWNER vapor;"
```

### 2. Backend (API)
Desde la raíz del repo:

```bash
export $(cat env.development | xargs)   # carga DATABASE_* del entorno local
swift run App migrate --yes             # solo la primera vez / tras nuevas migraciones
swift run App serve                     # http://127.0.0.1:8080
```

### 3. Web
Desde `web/`:

```bash
cd web
npm install        # solo la primera vez
npm run dev        # http://localhost:5173
```

Abre **http://localhost:5173**. La web hace proxy de `/api` y `/uploads` al backend.

### Datos de ejemplo (recomendado)
Fuentes reales del Moianès + usuarios y reseñas de ejemplo:

```bash
export $(cat env.development | xargs)
swift run App seed --force --demo       # usuarios demo con contraseña: demo12345
```

Para que una o varias cuentas de demostración vean todas las insignias desbloqueadas,
sin alterar sus aportaciones ni sus gotas, arranca el backend con sus nombres separados
por comas:

```bash
BADGES_UNLOCK_ALL_USERS=demo,alice swift run App serve
```

## Verlo desde el móvil (misma wifi)
Expón la web y el backend a la red local:

```bash
export $(cat env.development | xargs) && swift run App serve --hostname 0.0.0.0
cd web && npm run dev -- --host         # abre http://<IP-de-tu-Mac>:5173 en el móvil
```
⚠️ El botón **"Cerca de mí"** no funcionará por IP: la geolocalización requiere HTTPS
(o `localhost`). Para probarla en el móvil usa un túnel HTTPS (p. ej. `cloudflared tunnel --url http://localhost:5173`).

## Tests
```bash
swift test          # backend (usa la BD fontapp_test)
cd web && npm run build   # typecheck + build del frontend
```

## Documentación
- [CLAUDE.md](CLAUDE.md) — guía del proyecto (stack, comandos, convenciones).
- [docs/api.md](docs/api.md) — contrato de la API.
- [DEPLOY.md](DEPLOY.md) — despliegue en producción (Docker, variables de entorno, R2).
- [web/README.md](web/README.md) — detalles del frontend.
