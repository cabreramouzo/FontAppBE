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
| `RESEND_API_KEY` | opcional | API key de [Resend](https://resend.com). Junto con `MAIL_FROM` activa el envío real de correo (reset de contraseña); si falta, en dev solo se loguea (`LogMailSender`). |
| `MAIL_FROM` | opcional | Remitente de los correos, p. ej. `FontApp <no-reply@send.fontapp.net>`. Obligatoria junto con `RESEND_API_KEY`. |
| `MAIL_REPLY_TO` | opcional | Dirección de respuesta (p. ej. `admin@fontapp.net`), para enviar desde un no-reply pero recibir las respuestas en un buzón real. |
| `GEOIP_ENABLED` | opcional | `true` → deduce país/región de la IP al registrarse (solo estadística; nunca se guarda la IP). Noop si no se define. |

\* Usa **o** `DATABASE_URL` **o** las variables sueltas. En `--env production` las credenciales son obligatorias (la app falla al arrancar si faltan).

El contenedor arranca con `serve --env production` (ver `CMD` del `Dockerfile`).

### Migraciones

- Opción A: `AUTO_MIGRATE=true` (migra en el primer boot).
- Opción B (recomendada en equipo): un release step que ejecute
  `./App migrate --yes --env production` antes de arrancar el servidor.

### Datos iniciales (opcional)

`./App seed --env production` inserta las 67 fuentes reales del Moianès (OSM, ODbL).
**No** ejecutes `seed --demo` en producción (crea usuarios y reseñas de ejemplo).

Para cargar el dataset de fuentes del **ICGC/ACA** (GeoJSON exportado), usa `import-geojson`
con dedupe por distancia (fusiona topónimos y evita duplicados de lo ya sembrado):

```bash
# En local, contra la BD de PROD (no uses env.development, que apunta a la BD local):
DATABASE_URL='postgresql://USER:PASSWORD@HOST/neondb?sslmode=require' \
  swift run App import-geojson fonts_icgc.geojson --name-field Toponim --dedupe 50
```

Verifica el recuento con el cliente psql **v18** (Neon corre Postgres 18):
`SELECT count(*) FROM fonts WHERE description = '© ICGC/ACA';`

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

## Correo

Dos caras separadas (no confundir):

- **Enviar** (transaccional, desde la app: reset de contraseña) → **Resend**.
- **Recibir** contacto humano en `admin@fontapp.net` → **iCloud+** (Custom Email Domain).

El envío es **pluggable** (`MailSender`): en dev, `LogMailSender` solo loguea el enlace;
en prod, `ResendMailSender` si están `RESEND_API_KEY` + `MAIL_FROM` (opcional `MAIL_REPLY_TO`).

### Envío con Resend (subdominio `send.fontapp.net`)

Se usa un **subdominio de envío** para no chocar con los registros de correo de iCloud en el
dominio raíz (SPF solo admite una política por dominio) y aislar la reputación.

1. Resend → **Add Domain** = `send.fontapp.net`.
2. Añade en Cloudflare (DNS **only**, nube gris) los registros que da Resend: **MX** (return-path),
   **TXT SPF** (`v=spf1 include:_spf.resend.com ~all`), **DKIM** y opcional **DMARC**.
3. Crea una **API key** (Sending) y ponla como secret:
   ```bash
   fly secrets set \
     RESEND_API_KEY='re_...' \
     MAIL_FROM='FontApp <no-reply@send.fontapp.net>' \
     MAIL_REPLY_TO='admin@fontapp.net' -a fontapp
   ```
4. Entregabilidad: el correo lleva versión **texto plano** (multipart). Añade un **DMARC**
   (`_dmarc.send.fontapp.net` → `v=DMARC1; p=none; rua=mailto:admin@fontapp.net`). Un dominio de
   envío nuevo no tiene reputación → algún spam inicial es normal y mejora con el tiempo.

### Buzón humano con iCloud+ (`admin@fontapp.net`)

iCloud+ incluye **Custom Email Domain** (buzón real: recibir y enviar). Ojo: un dominio solo puede
tener **un** juego de MX, así que **no** actives a la vez el Email Routing de Cloudflare sobre el raíz.
Configura el dominio en iCloud, y añade en Cloudflare los **MX/SPF/DKIM de iCloud** (DNS only).
Como iCloud va en el raíz y Resend en `send.`, **no hay conflicto de SPF**.

## Web

Build con la URL del backend:

```bash
cd web
VITE_API_URL=https://api.tu-dominio.com npm run build   # genera web/dist
```

Sube `web/dist` al hosting estático. En Cloudflare Pages / Netlify define `VITE_API_URL`
como variable de entorno de build (ver `web/.env.example`).

## Despliegue en Fly.io (paso a paso)

Requisitos: `brew install flyctl` y `fly auth signup` (o `fly auth login`). El `fly.toml` ya está en el repo.

### 1. Backend + Postgres
```bash
git push                          # sube los últimos commits a GitHub

fly launch --no-deploy            # detecta Dockerfile + fly.toml; nombre único + región (mad)
fly postgres create               # Postgres gestionado (o durante el launch)
fly postgres attach <nombre-pg>   # inyecta DATABASE_URL como secret automáticamente
```
Si el arranque falla por TLS (BD **interna** de Fly), fuerza sin TLS:
```bash
fly secrets set DATABASE_URL="postgres://usuario:pass@host:5432/db?sslmode=disable"
```

> **En producción se usa Neon** (Postgres gestionado, externo a Fly), no la BD interna de Fly.
> En ese caso **sí** hace falta TLS: el `DATABASE_URL` de Neon lleva **`?sslmode=require`**
> (`SQLPostgresConfiguration(url:)` lo respeta). Ponlo como secret y **no** lo pegues en claro:
> ```bash
> fly secrets set DATABASE_URL='postgresql://USER:PASSWORD@HOST/neondb?sslmode=require' -a fontapp
> ```

### 2. R2 + secrets
En Cloudflare: crea un **bucket R2**, hazlo **público** (URL `pub-xxxx.r2.dev`) y un **token de API**
(Object Read & Write) → obtienes access key, secret y el endpoint. Luego:
```bash
fly secrets set \
  R2_ENDPOINT="https://<accountid>.r2.cloudflarestorage.com" \
  R2_ACCESS_KEY_ID="..." R2_SECRET_ACCESS_KEY="..." \
  R2_BUCKET="fontapp-images" R2_PUBLIC_URL="https://pub-xxxx.r2.dev"
```

### 3. Desplegar y comprobar
```bash
fly deploy
fly open      # https://<tu-app>.fly.dev  (prueba /health)
fly logs      # arranque + migraciones (AUTO_MIGRATE)
```
Sembrar las fuentes reales una vez (**nunca `--demo` en producción**):
```bash
fly ssh console --command "/app/App seed"
```

### 4. Web (Cloudflare Pages) + cerrar el CORS
En Cloudflare Pages → conectar el repo de GitHub:
- **Root directory:** `web` · **Build:** `npm run build` · **Output:** `dist`
- **Variable de entorno:** `VITE_API_URL = https://<tu-app>.fly.dev`

Cuando tengas la URL de la web, ciérrale el CORS al backend:
```bash
fly secrets set WEB_ORIGIN="https://xxx.pages.dev"
```

#### Dominio propio (`fontapp.net`)
1. Cloudflare Pages → proyecto `fontapp-web` → **Custom domains** → añade `fontapp.net`
   (y opcionalmente `www.fontapp.net`). Como el dominio está en la misma cuenta de
   Cloudflare, crea los registros DNS y provisiona el TLS automáticamente.
2. Actualiza el CORS del backend con el dominio real, **canónico primero** (ese primer
   valor es también la base del enlace del email de reset):
   ```bash
   fly secrets set WEB_ORIGIN="https://fontapp.net,https://www.fontapp.net"
   ```
3. `VITE_API_URL` **no cambia** (`https://fontapp.fly.dev`); el backend sigue en fly.dev.
   (Opcional futuro: `api.fontapp.net` como dominio del backend.)

No requiere cambios de código: el frontend no hardcodea su dominio y `WEB_ORIGIN` admite
varios orígenes separados por comas.

## Despliegue automático (CI/CD) — push a `main`

Configurado en `.github/workflows/ci.yml`. Al hacer **push a `main`**:

1. Job **`backend`** — corre `swift test` (contenedor `swift:6.3-noble` + Postgres de servicio).
   Debe ir alineado con el `Dockerfile` (`FROM swift:6.3-noble`): si sube la versión de Swift,
   **actualiza los dos sitios a la vez**.
2. Job **`web`** — `npm ci` + `npm run build`.
3. Job **`deploy-backend`** — si `backend` y `web` pasan, ejecuta `flyctl deploy --remote-only`.
   Necesita el secret **`FLY_API_TOKEN`** en GitHub (Settings → Secrets → Actions). El token de Fly
   incluye el prefijo literal `FlyV1 ` (con el espacio) — guárdalo entero. Genéralo con
   `fly tokens create deploy -a fontapp`; si se filtra, revócalo con `fly tokens revoke`.
4. **Web (Cloudflare Pages)** se redespliega solo por su **integración con GitHub** (no va por el
   Action): cada push a `main` dispara un build de Pages con `VITE_API_URL` ya configurada.

Así, un `git push` a `main` despliega **backend (Fly) + web (Pages)**. Las migraciones nuevas se
aplican solas en el arranque gracias a `AUTO_MIGRATE=true`.

### Cuánto tarda (push → cambios visibles)

El ciclo completo son **~15-30 min**, y casi todo es el **build de la imagen Swift**, no la migración:

| Fase | Qué pasa | Tiempo aprox. |
|------|----------|---------------|
| Jobs `backend` + `web` | `swift test` (compila Swift en contenedor) + `npm build` | ~3-8 min |
| `deploy-backend` → `flyctl deploy` | **Build remoto de la imagen Docker (Swift)** — el cuello de botella | **~10-20 min** |
| Release + boot | Arranca la máquina; `AUTO_MIGRATE` aplica las migraciones pendientes | **segundos** |

> Ojo: "los tests están verdes" **no** significa "ya está desplegado". Los tests son los jobs
> `backend`/`web`; el `deploy-backend` (con el build de la imagen) corre **después** y es lo lento.
> La **migración en sí es instantánea**; si una tabla nueva "no existe" justo tras el push, es que
> el build aún no ha terminado, no que la migración tarde.

### Cómo saber que ya está en vivo

Dos señales fiables (no adivines por el reloj):

1. **GitHub → Actions**: espera a que el job **`deploy-backend`** se ponga **verde** (no solo los tests).
2. **`curl` a un endpoint del cambio nuevo.** Devuelve el código HTTP sin cuerpo:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://fontapp.fly.dev/health
   # o, para verificar una ruta nueva concreta (ejemplo: feedback):
   curl -s -o /dev/null -w "%{http_code}\n" -X POST https://fontapp.fly.dev/feedback \
     -H 'Content-Type: application/json' -d '{"message":"deploy check"}'
   ```
   - **404** → sigue el **código viejo** (el deploy aún no ha aplicado).
   - **500 / error de BD** → código nuevo pero **falta la migración** (fuérzala:
     `fly ssh console -a fontapp -C "/app/App migrate --yes"`).
   - **2xx** (p. ej. `204`) → desplegado **y** migrado. ✅

## Backups de la base de datos

La BD es lo irreemplazable (fuentes, reseñas, cuentas aportadas por los usuarios). Estrategia:

1. **PITR del proveedor (Neon):** recuperación a un punto en el tiempo dentro de la ventana de
   retención (en el plan gratuito es corta, ~24 h; ver *Settings → History retention* y subirla
   si el plan lo permite). Cubre "ups" recientes, pero **vive en el mismo proveedor**.
2. **Copia independiente (off-provider):** `pg_dump` periódico a un bucket **privado** (R2/B2).
   Regla 3-2-1. Recomendado **diario**; retención p. ej. 7 diarios + 4 semanales.

> ⚠️ **Versión del cliente `pg_dump`.** `pg_dump` solo vuelca servidores de versión **≤ la suya**.
> Neon corre Postgres **18**, así que el cliente debe ser **≥ 18**. Con el de Homebrew 16 falla con
> `server version mismatch`. Instala el 18 (es *keg-only*, no pisa el 16 de dev) y úsalo por ruta:
>
> ```bash
> brew install postgresql@18
> /opt/homebrew/opt/postgresql@18/bin/pg_dump "$NEON_URL" -Fc -f fontapp-$(date +%Y%m%d).dump
> # restaurar:
> /opt/homebrew/opt/postgresql@18/bin/pg_restore -d "$URL_DESTINO" fontapp-YYYYMMDD.dump
> ```
>
> Alternativa sin instalar nada: `docker run --rm postgres:18 pg_dump "$NEON_URL" -Fc > backup.dump`.
> El `.dump` lleva **emails y hashes** → guárdalo en sitio **privado**, nunca en git ni bucket público.
> La URL de Neon suele necesitar `?sslmode=require`.

### Backup automático a disco local (`scripts/backup-db.sh`)

Script versionado que vuelca la BD de Neon al disco, con rotación. **No** guarda la cadena de
conexión (la lee de env o de un fichero privado). Elige pg_dump 18 local o, si no está, la imagen
Docker `postgres:18`.

**1. Configura la URL de la BD** (una vez), en un fichero privado fuera del repo:
```bash
mkdir -p ~/.config/fontapp
printf '%s' 'postgresql://USER:PASSWORD@HOST/neondb?sslmode=require' > ~/.config/fontapp/neon_url
chmod 600 ~/.config/fontapp/neon_url
```
(Alternativa: exportar `FONTAPP_DB_URL` en tu shell.) Variables opcionales: `FONTAPP_BACKUP_DIR`
(por defecto `~/Backups/fontapp`) y `FONTAPP_BACKUP_KEEP` (por defecto 8).

**2. Pruébalo a mano:**
```bash
./scripts/backup-db.sh
```

**3. Prográmalo semanal con launchd** (macOS; se recupera si el Mac estaba dormido, a diferencia de
cron). Crea `~/Library/LaunchAgents/net.fontapp.backup.plist` (usa **rutas absolutas**, launchd no
expande `~`; cambia `USER` y `RUTA_AL_REPO`):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>net.fontapp.backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Users/USER/RUTA_AL_REPO/scripts/backup-db.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Weekday</key><integer>0</integer><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>/Users/USER/Backups/fontapp/backup.log</string>
  <key>StandardErrorPath</key><string>/Users/USER/Backups/fontapp/backup.log</string>
</dict></plist>
```
Cárgalo (y para actualizarlo, `unload` antes):
```bash
launchctl load ~/Library/LaunchAgents/net.fontapp.backup.plist
launchctl start net.fontapp.backup   # ejecución inmediata de prueba
```
`Weekday 0` = domingo, a las 10:00. Revisa el log en `~/Backups/fontapp/backup.log`.

**Restaurar** un dump:
```bash
/opt/homebrew/opt/postgresql@18/bin/pg_restore -d "$URL_DESTINO" ~/Backups/fontapp/fontapp-YYYYMMDD-HHMMSS.dump
```

> Esto es **una** copia en tu disco (empezar). Para 3-2-1 real, más adelante añade una **off-site**
> (subir el `.dump` a un bucket **privado** R2/B2, o un Action programado). El `.dump` lleva emails y
> hashes → mantenlo en sitio privado, **nunca** en git ni carpeta sincronizada/pública.

## Checklist antes de abrir al público

- [x] `WEB_ORIGIN` restringido al dominio real del web.
- [x] HTTPS + dominio (lo suele dar la plataforma).
- [x] Imágenes: R2 configurado (`R2_*`) **y probado**, o volumen persistente para `/uploads`.
- [ ] Backups de la BD (script `scripts/backup-db.sh` + launchd semanal; ver *Backups*. Off-site 3-2-1 pendiente).
- [x] Rate-limit en `/auth/login` y `/auth/*` (en memoria, por IP; `RateLimitMiddleware`).
- [x] Limpieza de tokens caducados (tarea periódica cada 6 h en `configure.swift`).
- [x] Aviso legal / privacidad (GDPR) y atribución de datos OSM (ODbL) e ICGC/ACA.
- [x] CI que corra `swift test` y `npm run build` (`.github/workflows/ci.yml`).
- [x] Correo de reset con dominio propio (Resend + SPF/DKIM); **pendiente** el DMARC y vigilar el spam.
