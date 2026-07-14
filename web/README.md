# FontApp — Web (MVP)

Frontend web de FontApp: mapa de fuentes de agua, detalle con incidencias y
comentarios, y autenticación. Consume la API de FontAppBE (ver [../docs/api.md](../docs/api.md)).

## Stack
- Vite + React 19 + TypeScript
- Leaflet + react-leaflet (mapa, tiles de OpenStreetMap)
- React Router

## Desarrollo
Necesitas el backend corriendo en `http://127.0.0.1:8080` (Vite hace proxy de `/api`).

```bash
# 1) Backend (desde la raíz del repo)
export $(cat env.development | xargs)
swift run App serve            # y, si hace falta, swift run App seed

# 2) Frontend (desde web/)
npm install                    # solo la primera vez
npm run dev                    # http://localhost:5173
```

## Estructura
- `src/api/` — tipos del contrato y cliente `fetch` (token Bearer en localStorage).
- `src/auth/AuthContext.tsx` — estado de sesión (login/registro/logout).
- `src/pages/` — `MapPage` (mapa + bbox), `FontDetailPage` (incidencias/comentarios), `LoginPage`.
- `src/leafletSetup.ts` — fix de los iconos de marcador con bundler.

## Pendiente (siguientes pasos del MVP)
- Crear fuente desde el mapa (clic → formulario) y subir foto (`POST /images`).
- Botón "cerca de mí" con geolocalización del navegador (`/fonts/near`).
- Estados de carga/errores más pulidos.
