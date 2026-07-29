# Despliegue de FontAppBE

La app son **tres piezas** que se despliegan por separado:

1. **Backend** (Vapor) — contenedor Docker (ver `Dockerfile`).
2. **PostgreSQL** — base de datos gestionada (Fly Postgres, Railway, Render, Neon, Supabase…).
3. **Web** (`web/`) — build estático (Cloudflare Pages, Netlify, Vercel…).

## Backend

Imagen lista para construir:

```bash
docker build -t fontappbe .
```

### Variables de entorno (producción)

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `DATABASE_URL` | sí* | Cadena de conexión Postgres (`postgres://user:pass@host:5432/db`). |
| `DATABASE_HOST` / `_PORT` / `_USERNAME` / `_PASSWORD` / `_NAME` | sí* | Alternativa a `DATABASE_URL` (variables sueltas). |
| `WEB_ORIGIN` | recomendada | Origen(es) del web permitidos por CORS, separados por comas (p. ej. `https://fontapp.com`). Si no se define, CORS permite todo (solo dev). |
| `AUTO_MIGRATE` | opcional | `true` → migra la BD al arrancar. Útil en un solo contenedor. |
| `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | opcional | Si están **las cinco**, las imágenes se suben a Cloudflare R2; si no, a disco local. `R2_PUBLIC_URL` es la base pública del bucket (p. ej. `https://pub-xxxx.r2.dev`). |

\* Usa **o** `DATABASE_URL` **o** las variables sueltas. En `--env production` las credenciales son obligatorias (la app falla al arrancar si faltan).

El contenedor arranca con `serve --env production` (ver `CMD` del `Dockerfile`).

### Migraciones

- Opción A: `AUTO_MIGRATE=true` (migra en el primer boot).
- Opción B (recomendada en equipo): un release step que ejecute
  `./App migrate --yes --env production` antes de arrancar el servidor.

### Datos iniciales (opcional)

`./App seed --env production` inserta las 67 fuentes reales del Moianès (OSM, ODbL).
**No** ejecutes `seed --demo` en producción (crea usuarios y reseñas de ejemplo).

### Imágenes subidas

El almacenamiento es **pluggable** (`ImageStorage`): si defines las variables `R2_*`,
las imágenes van a **Cloudflare R2** (recomendado: sobrevive a redeploys, escala, sin coste de egress);
si no, se guardan en **disco local** (`/app/Public/uploads`).

- **R2 (recomendado):** crea un bucket, hazlo público, y define las cinco `R2_*`. ⚠️ El código
  compila pero **no está probado contra un bucket real** — verifícalo con tus credenciales.
- **Disco local:** solo con un **volumen persistente** montado en `/app/Public/uploads` y 1 instancia
  (el disco de muchos PaaS es efímero → perderías las fotos al redesplegar).

Las imágenes se **comprimen en el cliente** (redimensionado + JPEG) antes de subir, y se
**borran del almacén** al eliminar la fuente/reseña.

## Web

Build con la URL del backend:

```bash
cd web
VITE_API_URL=https://api.tu-dominio.com npm run build   # genera web/dist
```

Sube `web/dist` al hosting estático. En Cloudflare Pages / Netlify define `VITE_API_URL`
como variable de entorno de build (ver `web/.env.example`).

## Checklist antes de abrir al público

- [ ] `WEB_ORIGIN` restringido al dominio real del web.
- [ ] HTTPS + dominio (lo suele dar la plataforma).
- [ ] Imágenes: R2 configurado (`R2_*`) **y probado**, o volumen persistente para `/uploads`.
- [ ] Backups automáticos de la BD.
- [ ] Rate-limit en `/auth/login` *(pendiente)*.
- [ ] Limpieza de tokens caducados *(pendiente)*.
- [ ] Aviso legal / privacidad (GDPR) y atribución de datos OSM (ODbL).
- [ ] CI que corra `swift test` y `npm run build`.
