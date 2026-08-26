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
#        R2_ENDPOINT=https://<account>.eu.r2.cloudflarestorage.com
#        R2_ACCESS_KEY_ID=xxxxxxxx
#        R2_SECRET_ACCESS_KEY=xxxxxxxx
#        R2_BUCKET=xxxxxxxx
#
#   Son **las cuatro mismas variables que usa el backend**, y a propósito: es un solo
#   formato que recordar y se copian del mismo sitio.
#
#   **`R2_ENDPOINT` se copia, no se construye.** La primera versión de este script lo
#   componía como `https://<account_id>.r2.cloudflarestorage.com`, que es lo que sale en
#   cualquier ejemplo, y daba 403 en todo — hasta en leer un objeto suelto. El bucket de
#   FontApp tiene **jurisdicción europea**, así que su endpoint lleva un `.eu.` en medio
#   (`https://<account>.eu.r2.cloudflarestorage.com`) y el otro host es otra cuenta a
#   efectos prácticos. Deducir un valor que ya existe configurado es la forma de perder
#   justo el detalle que no sabías que estaba ahí.
#
#   Se sacan del panel de Cloudflare → R2 (el endpoint sale en la propia página del
#   bucket) y de *Manage API tokens*. **No se pueden leer de Fly**: allí los secretos solo
#   se escriben, no se recuperan.
#
# Uso manual:   ./scripts/backup-fotos.sh
# Programación semanal: mismo launchd que `backup-db.sh` (ver DEPLOY.md).
#
set -euo pipefail

BACKUP_DIR="${FONTAPP_FOTOS_DIR:-$HOME/Backups/fontapp-fotos}"   # evita carpetas sincronizadas (iCloud)

# **No muevas las fotos de aquí a otro sitio: apunta esto a ese otro sitio.**
#
# Si vacías el destino, la siguiente pasada se vuelve a bajar el bucket entero y te queda
# el backup partido en dos —lo viejo donde lo moviste, sin verificar, y una copia nueva
# aquí—, con el log diciendo OK. Con `FONTAPP_FOTOS_DIR=/Volumes/TuRAID/fontapp-fotos` la
# copia es incremental contra el RAID y el `check` semanal comprueba **ese** disco, que es
# justo lo que quieres vigilar.

# --- Resolver credenciales (sin dejarlas en el repo) ---
if [ -f "$HOME/.config/fontapp/r2.env" ]; then
  # shellcheck disable=SC1090
  set -a; . "$HOME/.config/fontapp/r2.env"; set +a
fi
falta=""
for v in R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
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

# `mkdir` a secas y NO `mkdir -p`, a propósito: solo se crea el último directorio, nunca
# el árbol entero. Con el destino en un disco externo, `mkdir -p` lo crearía **vacío sobre
# el punto de montaje** si el disco no está conectado, y entonces todo sale bien — se baja
# el bucket al disco interno, el checksum cuadra consigo mismo y el log dice OK mientras el
# backup de verdad no se ha tocado. Un backup que falla en silencio es peor que no tenerlo.
if [ ! -d "$BACKUP_DIR" ]; then
  padre="$(dirname "$BACKUP_DIR")"
  if [ ! -d "$padre" ]; then
    echo "ERROR: no existe $padre." >&2
    echo "Si el destino está en un disco externo, compruébalo: parece que no está montado." >&2
    exit 1
  fi
  mkdir "$BACKUP_DIR"
fi

antes="$(find "$BACKUP_DIR" -type f ! -name '.*' | wc -l | tr -d ' ')"

# Cuántas había la última vez. Vive FUERA del espejo del bucket, junto a las credenciales,
# por lo mismo que el log: lo que hay en `$BACKUP_DIR` tiene que poder subirse tal cual a
# R2 el día que haya que restaurar.
#
# Contar los ficheros presentes no basta para detectar el caso que importa. Si alguien
# **mueve** las fotos a otro disco, el directorio queda a cero y eso es idéntico a una
# primera ejecución: se baja el bucket entero, el checksum cuadra y el log dice OK,
# mientras el backup de verdad se ha quedado huérfano en otro sitio y sin verificar. La
# única forma de distinguirlo es acordarse de lo que había.
ESTADO="$HOME/.config/fontapp/fotos-ultimo-recuento"
anterior=0
if [ -f "$ESTADO" ]; then
  # Se guarda con la ruta: cambiar de disco a propósito no debe dar un aviso falso.
  ruta_previa="$(cut -f1 "$ESTADO")"
  [ "$ruta_previa" = "$BACKUP_DIR" ] && anterior="$(cut -f2 "$ESTADO")"
fi
if [ "$anterior" -gt 0 ] && [ "$antes" -eq 0 ]; then
  echo "AVISO: la última vez había $anterior ficheros en $BACKUP_DIR y ahora está vacío." >&2
  echo "       Si has movido las fotos a otro disco, NO las muevas: apunta el backup allí" >&2
  echo "       con FONTAPP_FOTOS_DIR. Si no, el backup queda partido en dos y solo se" >&2
  echo "       verifica la mitad nueva." >&2
fi

# `copy` y **NO `sync`**, y esto es la decisión importante de todo el script.
#
# `sync` deja el destino igual que el origen, así que borraría de tu disco lo que ya no
# esté en R2 — o sea que un borrado accidental en producción se propagaría al backup en la
# siguiente pasada, que es exactamente contra lo que existe un backup. Con `copy` el
# destino solo crece: lo que llega se copia, lo que desaparece del origen se queda aquí.
#
# El coste asumido es que el disco acumula fotos borradas a propósito (una retirada por
# moderación, por ejemplo). Con 43,5 MB en total, ese coste no existe todavía.
R2() {
  RCLONE_CONFIG="" rclone "$@" \
    --s3-provider Cloudflare \
    --s3-endpoint "$R2_ENDPOINT" \
    --s3-region auto \
    --s3-access-key-id "$R2_ACCESS_KEY_ID" \
    --s3-secret-access-key "$R2_SECRET_ACCESS_KEY" \
    --s3-no-check-bucket
}

echo "[$(date '+%F %T')] Backup de fotos → $BACKUP_DIR"
# Sin `--progress`: esto acaba en un log de launchd, y allí la barra de progreso escribe
# una línea de miles de caracteres con todos los porcentajes pegados. `--stats 30s` deja
# una línea de vez en cuando, que es lo que sirve para saber que una copia larga avanza.
R2 copy --stats-one-line --stats 30s ":s3:${R2_BUCKET}" "$BACKUP_DIR"

# Comprobar lo copiado, porque un backup que no se verifica no es un backup: compara los
# checksums de los dos lados. Sin esto, un fichero truncado o una copia a medias se
# descubre el día que hace falta restaurar, que es el peor día posible.
echo "[$(date '+%F %T')] Verificando checksums…"
if ! R2 check ":s3:${R2_BUCKET}" "$BACKUP_DIR" --one-way 2>&1 | tail -3; then
  echo "ERROR: la verificación ha encontrado diferencias. NO des este backup por bueno." >&2
  exit 1
fi

ficheros="$(find "$BACKUP_DIR" -type f ! -name '.*' | wc -l | tr -d ' ')"
peso="$(du -sh "$BACKUP_DIR" | cut -f1)"
nuevas=$((ficheros - antes))
echo "[$(date '+%F %T')] OK. $ficheros ficheros ($nuevas nuevas) · $peso en $BACKUP_DIR"

# Bajarse el bucket entero cuando ya había un backup significa que el destino se vació:
# alguien movió las fotos, o el disco de siempre no era el que estaba montado. No es un
# error —la copia es correcta— pero hay que verlo en el log y no dentro de seis meses.
mkdir -p "$(dirname "$ESTADO")"
printf '%s\t%s\n' "$BACKUP_DIR" "$ficheros" > "$ESTADO"

# Aviso de cuota: el plan gratuito de R2 son 10 GB de almacenamiento. Que lo diga el script
# evita tener que acordarse de mirarlo, que es como se descubren estas cosas tarde.
kb="$(du -sk "$BACKUP_DIR" | cut -f1)"
if [ "$kb" -gt 8388608 ]; then
  echo "AVISO: pasas de 8 GB. El plan gratuito de R2 llega a 10 GB; comprueba la factura." >&2
fi
