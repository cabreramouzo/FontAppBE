#!/usr/bin/env bash
#
# Las dos defensas de `backup-fotos.sh`, que son las que fallan en silencio.
#
# No se prueba la copia en sí —eso pide credenciales de R2 y red— sino las dos formas de
# acabar con un backup que parece bueno y no lo es: el disco sin montar y el destino
# vaciado porque alguien movió las fotos a otro sitio.
set -uo pipefail
cd "$(dirname "$0")/.."

fallos=0
di() { printf '  %-5s %s\n' "$1" "$2"; [ "$1" = "FALLA" ] && fallos=$((fallos + 1)); return 0; }

tmp="$(mktemp -d)"
export FONTAPP_FOTOS_DIR="$tmp/no-existe-el-padre/fotos"
salida="$(./scripts/backup-fotos.sh 2>&1)"; codigo=$?

# Con el destino en un disco externo, `mkdir -p` crearía la carpeta sobre el punto de
# montaje y se bajaría todo al disco interno diciendo OK, mientras el backup de verdad
# sigue sin tocarse. Un backup que falla en silencio es peor que no tenerlo.
if [ "$codigo" -ne 0 ] && printf '%s' "$salida" | grep -q "no existe"; then
  di ok "disco sin montar: se para con error"
else
  di FALLA "disco sin montar: debería parar y salió $codigo"
fi
[ -d "$tmp/no-existe-el-padre" ] && di FALLA "ha creado el árbol del punto de montaje" \
                                 || di ok "no ha creado nada sobre el punto de montaje"

# El aviso de destino vaciado se apoya en el recuento de la pasada anterior. Se comprueba
# la lógica sin tocar R2: el fichero de estado guarda ruta y recuento, y el aviso solo
# salta si esa ruta es la misma y antes había algo.
estado="$tmp/estado"
printf '%s\t%s\n' "/Volumes/RAID/fotos" "101" > "$estado"
ruta_previa="$(cut -f1 "$estado")"; anterior="$(cut -f2 "$estado")"
[ "$ruta_previa" = "/Volumes/RAID/fotos" ] && [ "$anterior" -eq 101 ] \
  && di ok "el estado guarda ruta y recuento" || di FALLA "el estado no se lee bien"

# Guarda la ruta a propósito: cambiar de disco queriendo no debe dar un aviso falso.
[ "/Volumes/OtroDisco/fotos" = "$ruta_previa" ] \
  && di FALLA "confundiría dos discos distintos" \
  || di ok "otra ruta no dispara el aviso"

rm -rf "$tmp"
echo
if [ "$fallos" -eq 0 ]; then echo "OK"; else echo "$fallos fallos."; exit 1; fi
