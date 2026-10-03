# Clients: web, iOS and Android

How the server tells its clients apart, what it measures per client, and what each
client must send. Written 3 October 2026, with the iOS beta, so Android finds it ready.

## The header

Every request from a FontApp client carries:

```
X-FontApp-Client: <platform>/<version>
```

| Client | Example | Where it is set |
|---|---|---|
| Web | `web/0.1.0` | `web/src/api/client.ts` (`safeFetch`, from `__APP_VERSION__`) |
| iOS | `ios/1.0 (212)` (marketing version, build) | `FontAppiOS` `API/APIClient.swift` (`APIClient.clientID`) |
| Android | `android/1.0 (5)` (versionName, versionCode) | to do: every request, the same way |

- `platform` is one of `web`, `ios`, `android`; anything else is `unknown`.
- iOS builds from before the header are still recognised by URLSession's user agent
  (`FontApp/<build> CFNetwork/…`). Android must send the header from its first build.
- **CORS:** the header is in `allowedHeaders` (`configure.swift`). A web client header that
  is not listed there makes the browser refuse the request at the preflight; that is how
  the web's queued contributions (`X-FontApp-Queued-Offline`) were silently blocked from
  17 August to 3 October 2026. `testPreflightAllowsTheHeadersTheWebSends` guards both.

Parsed by `ClientInfo` in `Sources/App/Middleware/ClientActivity.swift`; available in any
handler as `req.fontAppClient` (not `req.client`, which is Vapor's HTTP client).

## What is measured

The native apps have to prove that people come back and contribute from them (FA-09 in
`docs/producto-crecimiento-2026-09.md`), not that they were installed.

- `ClientActivityMiddleware` writes one row in `client_days` per **signed-in** person, UTC
  day and platform: the version, and whether they **contributed** that day from it (a
  successful write under `/fonts` or `/images`, favourites excluded).
- Anonymous requests leave nothing: there is no stable identity, and inventing one (IP,
  fingerprint) is what this project does not do. Installs and anonymous use come from App
  Store Connect / Play Console.
- At most one write per person, day and platform per process (plus one when they first
  contribute); a failed write never fails the request. Rows older than 180 days are
  deleted, as the other analytics tables are.
- One person who uses the web and iOS counts in both platforms.

`GET /admin/analytics/clients?days=30|180` (admin): per platform, `people`,
`contributors`, `returning` (active on at least two different days in the period: the
"second outing") and `today`.

Not built yet: showing it in the web admin panel next to the campaign table.

## Push per platform

| Platform | Transport | Where |
|---|---|---|
| Web | Web Push (VAPID) | `push_subscriptions`, `Push/` |
| iOS | APNs, token per device, sandbox or production said by the app | `apns_devices`, `Push/APNs.swift` |
| Android | **FCM**, to do | see below |

`PushCopy` and the push-vs-bell rule are shared: a system notification only for what can
change what you are about to do.

## Android checklist

When the Android client starts, the server side needs:

1. **The header** `X-FontApp-Client: android/<versionName> (<versionCode>)` on every request.
   Nothing else on the server: `android` is already a platform here and in the admin
   summary.
2. **Google sign-in:** an OAuth client of type Android (package name + SHA-1 of the
   signing key, debug and release) and its ID accepted by `/auth/google` beside the web and
   iOS ones (`AuthController`, list of client-ID keys) → `GOOGLE_ANDROID_CLIENT_ID`.
3. **Push:** an FCM sender (HTTP v1 with a service-account key, `FCM_SERVICE_ACCOUNT` as a
   Fly secret), a device-token table or a platform column on the APNs one, and the same
   `PushCopy`.
4. **App Links:** `web/public/.well-known/assetlinks.json` with the package name and the
   signing certificate's SHA-256, for `fontapp.net/fonts/*` and `/users/*` (the same paths
   as `apple-app-site-association`).
5. **Passkeys:** Credential Manager uses the same `assetlinks.json`
   (`delegate_permission/common.get_login_creds`); RP ID stays `fontapp.net`.
6. **Data licence and rate limits** apply as they do to iOS: nothing to add.

New Fly secrets go in `docs/fly-secrets.md`.
