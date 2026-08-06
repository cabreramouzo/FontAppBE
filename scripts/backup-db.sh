#!/usr/bin/env bash
#
# Backup de la BD de producción (Neon Postgres 18) al disco local.
#
# La cadena de conexión NUNCA se guarda en el repo. Se toma de:
#   1) la variable de entorno FONTAPP_DB_URL, o
#   2) el fichero ~/.config/fontapp/neon_url  (una sola línea, chmod 600).
# Debe incluir ?sslmode=require (Neon exige TLS).
#
# El cliente pg_dump debe ser >= la versión del servidor (Neon = 18). Usa el
# binario postgresql@18 si está instalado; si no, cae a la imagen Docker postgres:18.
#
# Uso manual:   ./scripts/backup-db.sh
# Programación semanal: ver DEPLOY.md (launchd en macOS).
#
set -euo pipefail

PG_DUMP="${PG_DUMP:-/opt/homebrew/opt/postgresql@18/bin/pg_dump}"
BACKUP_DIR="${FONTAPP_BACKUP_DIR:-$HOME/Backups/fontapp}"   # evita carpetas sincronizadas (iCloud)
KEEP="${FONTAPP_BACKUP_KEEP:-8}"                            # cuántos backups conservar

# --- Resolver la URL de la BD (sin dejarla en el repo) ---
DB_URL="${FONTAPP_DB_URL:-}"
if [ -z "$DB_URL" ] && [ -f "$HOME/.config/fontapp/neon_url" ]; then
  DB_URL="$(tr -d '\r\n' < "$HOME/.config/fontapp/neon_url")"
fi
if [ -z "$DB_URL" ]; then
  echo "ERROR: define FONTAPP_DB_URL o crea ~/.config/fontapp/neon_url (chmod 600)." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/fontapp-$STAMP.dump"

echo "[$(date '+%F %T')] Backup → $OUT"

# --- Volcar (formato custom -Fc: comprimido y restaurable con pg_restore) ---
if [ -x "$PG_DUMP" ]; then
  "$PG_DUMP" "$DB_URL" -Fc -f "$OUT"
elif command -v docker >/dev/null 2>&1; then
  echo "  (sin pg_dump 18 local; usando la imagen docker postgres:18)"
  docker run --rm postgres:18 pg_dump "$DB_URL" -Fc > "$OUT"
else
  echo "ERROR: falta pg_dump 18 (brew install postgresql@18) o Docker." >&2
  rm -f "$OUT"
  exit 1
fi

chmod 600 "$OUT"   # contiene emails + hashes de contraseña

# --- Retención: conserva los KEEP más recientes, borra el resto ---
ls -1t "$BACKUP_DIR"/fontapp-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while IFS= read -r old; do
  echo "  purga backup antiguo: $(basename "$old")"
  rm -f "$old"
done

echo "[$(date '+%F %T')] OK. Backups actuales en $BACKUP_DIR:"
ls -lh "$BACKUP_DIR"/fontapp-*.dump
