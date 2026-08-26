#!/usr/bin/env bash
#
# Backup de las fotos de producción (Cloudflare R2) al disco local.
#
# Hermano de `backup-db.sh`, y hace falta por lo mismo: **R2 es una sola copia**. No hay
# versiones, no hay papelera, y un bucket borrado o una credencial filtrada se lo lleva
# todo. Y estas fotos son lo único de FontApp que no se puede reconstruir: las fuentes
# vuelven de OpenStreetMap y del ICGC, pero la foto de una fuente la hizo alguien que pasó
# por allí, y si se pierde hay que volver a andar hasta la fuente.
#
# Las credenciales NUNCA se guardan en el repo. Se toman de:
#   1) las variables de entorno R2_*, o
#   2) el fichero ~/.config/fontapp/r2.env  (chmod 600), con este contenido:
#
#        R2_ACCOUNT_ID=xxxxxxxx
#        R2_ACCESS_KEY_ID=xxxxxxxx
#        R2_SECRET_ACCESS_KEY=xxxxxxxx
#        R2_BUCKET=xxxxxxxx
#
#   Se sacan del panel de Cloudflare → R2 → Manage API tokens. **No se pueden leer de
#   Fly**: allí los secretos solo se escriben, no se recuperan.
#
# Uso manual:   ./scripts/backup-fotos.sh
# Programación semanal: mismo launchd que `backup-db.sh` (ver DEPLOY.md).
#
set -euo pipefail

BACKUP_DIR="${FONTAPP_FOTOS_DIR:-$HOME/Backups/fontapp-fotos}"   # evita carpetas sincronizadas (iCloud)

# --- Resolver credenciales (sin dejarlas en el repo) ---
if [ -f "$HOME/.config/fontapp/r2.env" ]; then
  # shellcheck disable=SC1090
  set -a; . "$HOME/.config/fontapp/r2.env"; set +a
fi
falta=""
for v in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
  [ -z "${!v:-}" ] && falta="$falta $v"
done
if [ -n "$falta" ]; then
  echo "ERROR: faltan credenciales:$falta" >&2
  echo "Define las variables o crea ~/.config/fontapp/r2.env (chmod 600). Ver la cabecera." >&2
  exit 1
fi

if ! command -v rclone >/dev/null 2>&1; then
  echo "ERROR: falta rclone. Instálalo con:  brew install rclone" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# `copy` y **NO `sync`**, y esto es la decisión importante de todo el script.
#
# `sync` deja el destino igual que el origen, así que borraría de tu disco lo que ya no
# esté en R2 — o sea que un borrado accidental en producción se propagaría al backup en la
# siguiente pasada, que es exactamente contra lo que existe un backup. Con `copy` el
# destino solo crece: lo que llega se copia, lo que desaparece del origen se queda aquí.
#
# El coste asumido es que el disco acumula fotos borradas a propósito (una retirada por
# moderación, por ejemplo). Con 43,5 MB en total, ese coste no existe todavía.
echo "[$(date '+%F %T')] Backup de fotos → $BACKUP_DIR"
RCLONE_CONFIG="" rclone copy \
  --s3-provider Cloudflare \
  --s3-endpoint "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --s3-access-key-id "$R2_ACCESS_KEY_ID" \
  --s3-secret-access-key "$R2_SECRET_ACCESS_KEY" \
  --s3-no-check-bucket \
  --progress --stats-one-line \
  ":s3:${R2_BUCKET}" "$BACKUP_DIR"

ficheros="$(find "$BACKUP_DIR" -type f ! -name '.*' | wc -l | tr -d ' ')"
peso="$(du -sh "$BACKUP_DIR" | cut -f1)"
echo "[$(date '+%F %T')] OK. $ficheros ficheros · $peso en $BACKUP_DIR"

# Aviso de cuota: el plan gratuito de R2 son 10 GB de almacenamiento. Que lo diga el script
# evita tener que acordarse de mirarlo, que es como se descubren estas cosas tarde.
kb="$(du -sk "$BACKUP_DIR" | cut -f1)"
if [ "$kb" -gt 8388608 ]; then
  echo "AVISO: pasas de 8 GB. El plan gratuito de R2 llega a 10 GB; comprueba la factura." >&2
fi
