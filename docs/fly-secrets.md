# Fly secrets and settings (app `fontapp`)

Every key the production backend reads, where it lives, what it is for, and what breaks
without it. **Names only: never a value here.** Checked against `fly secrets list -a
fontapp` and the code (`grep -rhoE 'Environment\.get\("[A-Z0-9_]+"\)' Sources`) on
3 October 2026. When you add, remove or rename a key, update this file in the same change.

- See them: `fly secrets list -a fontapp` (names and digests, never values).
- Set one: `fly secrets set NAME='…' -a fontapp` (restarts the machines).
- Non-secret switches live in `fly.toml` under `[env]`, not in secrets.
- Setup steps for each provider (Resend, Google, Apple, R2…) are in `DEPLOY.md`.

## Set in Fly secrets (26)

| Key | Group | What it does | Without it |
|---|---|---|---|
| `DATABASE_URL` | Core | Postgres connection string. | The app does not start in production. |
| `WEB_ORIGIN` | Core | Web origin(s) for CORS and for links in emails, comma-separated. | CORS allows everything; email links break. |
| `APP_SECRET` | Core | HMAC key for the weekly-digest unsubscribe links. Generate with `openssl rand -hex 32`. Moving providers: copy it, or old links stop working. | A random key per process: links die on every restart (logged at boot). |
| `GEOIP_ENABLED` | Core | `true` → country/region from the IP at sign-up (statistics only; the IP is never stored). Also in `fly.toml [env]`; it is not a secret, the duplicate is harmless. | No regional statistics. |
| `R2_ENDPOINT` | Photos | Cloudflare R2 S3 endpoint. | Any of the five missing → photos go to local disk, which Fly loses on redeploy. |
| `R2_ACCESS_KEY_ID` | Photos | R2 access key. | As above. |
| `R2_SECRET_ACCESS_KEY` | Photos | R2 secret key. | As above. |
| `R2_BUCKET` | Photos | Bucket name. | As above. |
| `R2_PUBLIC_URL` | Photos | Public base URL of the bucket. | As above. |
| `RESEND_API_KEY` | Email | Resend API key (sending). | No email is sent (welcome, digest, password reset): only logged. |
| `MAIL_FROM` | Email | Sender, e.g. `FontApp <no-reply@send.fontapp.net>`. Required with the key. | As above. |
| `MAIL_REPLY_TO` | Email | Reply-to mailbox. | Replies go to the no-reply sender. |
| `GOOGLE_CLIENT_ID` | Sign-in | OAuth client of type *Web application* (public). Must match the web's `VITE_GOOGLE_CLIENT_ID`. | No Google sign-in on the web. |
| `GOOGLE_IOS_CLIENT_ID` | Sign-in | OAuth client of type *iOS*, bundle `net.fontapp.FontApp` (public). `/auth/google` accepts tokens from this one and the web one. | No Google sign-in in the iOS app. |
| `APPLE_SIGNIN_KEY_ID` | Sign-in | Key ID of the Sign in with Apple `.p8`. | Deleting an account does not revoke its Apple access (logged at boot); App Store rule 5.1.1(v) expects it. |
| `APPLE_SIGNIN_KEY` | Sign-in | The Sign in with Apple `.p8` (PEM). | As above. |
| `APNS_KEY_ID` | Push iOS | Key ID of the APNs `.p8`. | Any of the three missing → no push to iOS (said at boot). |
| `APNS_TEAM_ID` | Push iOS | Apple team ID. Also used for Sign in with Apple when `APPLE_TEAM_ID` is not set. | As above. |
| `APNS_KEY` | Push iOS | The APNs `.p8` (PEM). One key serves sandbox (Xcode builds) and production (TestFlight, App Store); each device says which it is. | As above. |
| `APNS_TOPIC` | Push iOS | Bundle ID. Optional, defaults to `net.fontapp.FontApp`; not a secret. | Default is used. |
| `VAPID_PUBLIC_KEY` | Push web | Web Push key pair, public half (the web reads it from the API). | No Web Push. Changing the pair invalidates every web subscription. |
| `VAPID_PRIVATE_KEY` | Push web | Private half. | As above. |
| `VAPID_SUBJECT` | Push web | Contact for push services (`mailto:` or URL). | As above. |
| `GAMIFICATION_WORKER` | Game | `true` → scores contributions in the background, seconds after they happen. | Scoring only by the `gamification-sync` cron. |
| `GAMIFICATION_CAPABILITIES` | Game | `true` → turns on capabilities earned with drops (`docs/gamificacion.md`). | No capabilities granted. |
| `GAMIFICATION_EPOCH` | Game | Date from which points are final; capabilities that need final points wait for it. | Those capabilities stay off. |

## Read by the code, not set (defaults apply)

| Key | Default | When to set it |
|---|---|---|
| `AUTO_MIGRATE` | — | In `fly.toml [env]` (`true`): migrate at boot. |
| `DATABASE_HOST`, `_PORT`, `_USERNAME`, `_PASSWORD`, `_NAME` | — | Only instead of `DATABASE_URL`. |
| `APPLE_CLIENT_ID` | `net.fontapp.FontApp` | If Sign in with Apple ever uses another client (e.g. a web Services ID). |
| `APPLE_TEAM_ID` | `APNS_TEAM_ID` | If the Sign in with Apple key belongs to another team. |
| `PASSKEY_RP_ID` | `fontapp.net` | Never lightly: changing it invalidates every passkey. |
| `PASSKEY_ORIGIN` | `https://fontapp.net` | If the web moves origin. |
| `EDGE_SECRET` | — | When Cloudflare sits in front of Fly and injects it, so the real client IP is trusted (`Utils/ClientIP.swift`). Without it `Fly-Client-IP` is used. |
| `BADGES_UNLOCK_ALL_USERS` | — | Testing only: unlocks the listed badges for everyone. Never in production. |

## Android, when it comes

Expected new keys, so they get the same treatment: an FCM service account
(`FCM_SERVICE_ACCOUNT`, JSON, secret) and project ID for push, and the Android OAuth client
(`GOOGLE_ANDROID_CLIENT_ID`, public) accepted by `/auth/google` beside the web and iOS ones.
Plan them in `docs/clients.md`.
