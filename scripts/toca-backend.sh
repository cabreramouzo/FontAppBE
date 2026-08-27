#!/usr/bin/env bash
#
# ¿Este cambio toca al backend, o es solo front y documentación?
#
# Vive aquí y no dentro del YAML de CI para poder **probarlo**: la lógica decide si se
# despliega, y equivocarse hacia «no despliegues» es un fallo que no se ve — todo sale en
# verde y producción se queda vieja. `scripts/toca-backend.test.sh` la comprueba contra
# commits reales de este repo.
#
# Uso: toca-backend.sh <sha-antes> <sha-ahora>   →  imprime «true» o «false»
#
# La regla va por EXCLUSIÓN y no por inclusión: se despliega salvo que TODO lo tocado sea
# de front o documentación. Con una lista de rutas de backend, el día que alguien añada una
# carpeta nueva y no se acuerde de apuntarla aquí, dejaría de desplegarse sin que nada
# fallara. Al revés el fallo es barato: se despliega de más.
set -uo pipefail

antes="${1:-}"
ahora="${2:-HEAD}"

# Ante la duda, TODO. Una rama nueva trae el sha a ceros y un force-push puede dejar uno
# que ya no existe; en los dos casos no hay comparación posible.
if [ -z "$antes" ] || [ "$antes" = "0000000000000000000000000000000000000000" ] \
   || ! git cat-file -e "$antes^{commit}" 2>/dev/null; then
  echo "true"
  exit 0
fi

ficheros=$(git diff --name-only "$antes" "$ahora")
# `|| true` porque grep sale con 1 cuando no casa nada, y aquí eso es un resultado válido
# (todo era de front), no un error.
relevantes=$(printf '%s\n' "$ficheros" | grep -Ev '^(web/|flyer/|docs/)|\.md$' || true)
[ -z "$relevantes" ] && echo "false" || echo "true"
