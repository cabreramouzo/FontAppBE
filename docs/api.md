# FontAppBE — Contrato de API

Contrato **real** de la API (reflejo del código en `Sources/App`). Para el brief
original de negocio ver [../definitions.md](../definitions.md); este documento es
la referencia para implementar el frontend.

- **Base URL (dev):** `http://127.0.0.1:8080`
- **Formato:** JSON. Fechas en ISO-8601 UTC (`2026-07-14T20:10:43Z`).
- **CORS:** habilitado (`Access-Control-Allow-Origin: *` en dev).
- **Errores:** siempre `{ "error": true, "reason": "<texto>" }` con el status HTTP correspondiente.

## Autenticación

Token **Bearer** respaldado en BD.

1. `POST /auth/login` con **Basic auth** (`Authorization: Basic base64(username:password)`) → devuelve un `token`.
2. En las rutas protegidas (🔒), enviar `Authorization: Bearer <token>`.
3. `POST /auth/logout` revoca el token. TTL por defecto: 30 días.

| Ruta | 🔒 | Descripción |
|------|----|-------------|
| `POST /auth/login` | Basic | Emite un token |
| `GET /auth/me` | Bearer | Usuario autenticado (incluye `email`) |
| `GET /auth/me/fonts` | Bearer | Fuentes creadas por el usuario |
| `GET /auth/me/comments` | Bearer | Reseñas del usuario (con `fontName`) |
| `POST /auth/logout` | Bearer | Revoca el token usado |
| `POST /auth/forgot-password` | — | `{email}` → siempre 200 `{ok, devLink}` (no enumera; `devLink` solo fuera de producción) |
| `POST /auth/reset-password` | — | `{token, password≥8}` → 200; invalida el token y cierra sesiones. 400 si no es válido/caducó |

**`LoginResponse`** (200 de `/auth/login`):
```json
{
  "token": "oq9oSVYfFWcRheTe/PLMEjrSZKObGK9qgk/z6F9vUFk=",
  "expiresAt": "2026-08-13T19:57:25Z",
  "user": { "id": "uuid", "name": "Ada", "username": "ada" }
}
```
Login con credenciales inválidas → **401**.

## Modelos de respuesta

```jsonc
// Font
{ "id": "uuid", "name": "string", "latitude": 40.4, "longitude": -3.7,
  "image": "url|null", "description": "string|null", "createdAt": "iso8601" }

// FontSummary  (Font + último estado; lo devuelven los listados del mapa)
{ ...campos de Font,
  "lastWaterStatus": "flowing|trickle|dry|unknown|null",
  "lastUpdate": "iso8601|null" }

// UserResponse  (nunca incluye passwordHash; `email` solo en respuestas propias
//                — login/me/registro/edición —, nunca en `GET /users/:id`)
{ "id": "uuid", "name": "string", "username": "string", "email": "string|null" }

// ReportResponse
{ "id": "uuid", "fontID": "uuid", "userID": "uuid|null", "username": "string|null",
  "message": "string", "createdAt": "iso8601" }

// CommentResponse  (= actualización de estado / reseña)
{ "id": "uuid", "fontID": "uuid", "userID": "uuid|null", "username": "string|null",
  "body": "string", "rating": "1-5|null",
  "waterStatus": "flowing|trickle|dry|unknown|null",
  "image": "url|null", "createdAt": "iso8601" }
```

`waterStatus` (estado del agua): `flowing` (sale agua), `trickle` (poca), `dry` (seca), `unknown`.

## Users

| Método | Ruta | 🔒 | Cuerpo | Éxito | Errores |
|--------|------|----|--------|-------|---------|
| POST | `/users` | — | `{name, username≥3, email, password≥8}` | 201 `UserResponse` | 400, 409 (username/email en uso) |
| GET | `/users/:id` | — | — | 200 `UserResponse` (sin email) | 404 |
| PUT | `/users/:id` | Bearer | `{name, username, email, password?}` | 200 `UserResponse` | 400, 401, 403 (no eres tú), 404, 409 |
| DELETE | `/users/:id` | Bearer | — | 204 | 401, 403, 404 |

`PUT`/`DELETE` son **self-only**: solo sobre tu propia cuenta (si no, 403).

## Fonts (fuentes de agua)

| Método | Ruta | 🔒 | Cuerpo / Query | Éxito | Errores |
|--------|------|----|----------------|-------|---------|
| GET | `/fonts?page=&per=` | — | query de paginación | 200 `Page<Font>` | — |
| GET | `/fonts/near?lat=&long=&quantity=` | — | `lat`,`long` req.; `quantity` opc. (máx 100, def 10) | 200 `[FontSummary]` (por distancia) | 400 |
| GET | `/fonts/near/download?...` | — | igual que `near` | 200 `[FontSummary]` | 400 |
| GET | `/fonts/in-bounds?minLat=&maxLat=&minLong=&maxLong=` | — | bounding box (para el mapa) | 200 `[FontSummary]` | 400 |
| GET | `/fonts/:id` | — | — | 200 `Font` | 404 |
| POST | `/fonts` | Bearer | `{name, latitude[-90,90], longitude[-180,180], image?, description?}` | 201 `Font` | 400, 401 |
| PUT | `/fonts/:id` | Bearer | igual que POST | 200 `Font` | 400, 401, 404 |
| DELETE | `/fonts/:id` | Bearer | — | 204 | 401, 404 |

**`Page<Font>`** (paginación de Fluent):
```json
{ "items": [ /* Font */ ],
  "metadata": { "total": 4, "per": 2, "page": 1 } }
```

## Reports (incidencias sobre una fuente)

| Método | Ruta | 🔒 | Cuerpo | Éxito | Errores |
|--------|------|----|--------|-------|---------|
| GET | `/fonts/:id/report` | — | — | 200 `[ReportResponse]` (recientes primero) | 404 (fuente) |
| POST | `/fonts/:id/report` | Bearer | `{message (1–1000)}` | 201 `ReportResponse` | 400, 401, 404 |
| DELETE | `/fonts/:id/report/:reportID` | Bearer | — | 204 | 401, 403 (no es tuya), 404 |

## Comments (actualizaciones de estado / reseñas)

Cada comentario es una **actualización del estado actual** de la fuente: texto y,
opcionalmente, `rating` (1-5), `waterStatus` y `image`. El más reciente es el estado vigente.

| Método | Ruta | 🔒 | Cuerpo | Éxito | Errores |
|--------|------|----|--------|-------|---------|
| GET | `/fonts/:id/comments` | — | — | 200 `[CommentResponse]` (recientes primero) | 404 (fuente) |
| POST | `/fonts/:id/comments` | Bearer | `{body (1–2000), rating?(1-5), waterStatus?, image?}` | 201 `CommentResponse` | 400, 401, 404 |
| PUT | `/fonts/:id/comments/:commentID` | Bearer | igual que POST | 200 `CommentResponse` | 400, 401, 403 (no es tuya), 404 |
| DELETE | `/fonts/:id/comments/:commentID` | Bearer | — | 204 | 401, 403 (no es tuya), 404 |
| POST | `/fonts/:id/comments/:commentID/confirm` | Bearer | — | 200 `CommentResponse` | 401, 404 |
| DELETE | `/fonts/:id/comments/:commentID/confirm` | Bearer | — | 200 `CommentResponse` | 401, 404 |

`CommentResponse` incluye `confirmations` (nº de 👍 "sigue igual"), `confirmedByMe`
(si el usuario autenticado ya confirmó) y `lastConfirmedAt`. Confirmar es idempotente
(un usuario, una vez por comentario) y **no crea un comentario**: solo suma al contador
y refresca la frescura del estado. El `GET /comments` acepta Bearer opcional para
rellenar `confirmedByMe`.

## Images

Subida de imágenes al disco local; devuelve la URL relativa a usar como campo `image` de una fuente.

| Método | Ruta | 🔒 | Cuerpo | Éxito | Errores |
|--------|------|----|--------|-------|---------|
| POST | `/images` | Bearer | `multipart/form-data`, campo `file` (jpg/png/webp, ≤8 MB) | 200 `{ "url": "/uploads/<uuid>.<ext>" }` | 401, 415 |

Las imágenes subidas se sirven como estáticos en `GET /uploads/<archivo>`.

## Datos de ejemplo (dev)

`swift run App seed [--force]` inserta ~67 fuentes **reales** de la comarca del
**Moianès** (datos de OpenStreetMap, licencia ODbL) para maquetar el frontend.

## Pendiente (no implementado)

- Almacenamiento de imágenes en producción (hoy es disco local, no escala): migrar a S3/similar.
- Limpieza de tokens expirados y rate-limit en el login.
- Paginación en reports/comments si una fuente acumula muchos.
