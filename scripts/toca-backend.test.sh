#!/usr/bin/env bash
#
# Comprueba la decisión de desplegar contra COMMITS REALES de este repo.
#
# Se prueba contra el historial de verdad y no con ficheros inventados porque el fallo que
# esto evita es de clasificación: qué cuenta como «solo front». Los commits reales traen
# las mezclas que a nadie se le ocurren al inventar casos (front + CLAUDE.md, backend +
# traducciones, un push con varios commits encima).
set -uo pipefail
cd "$(dirname "$0")/.."

fallos=0
comprueba() { # <esperado> <antes> <ahora> <qué es>
  local got
  got=$(./scripts/toca-backend.sh "$2" "$3")
  if [ "$got" = "$1" ]; then
    printf '  ok    %-46s → %s\n' "$4" "$got"
  else
    printf '  FALLA %-46s → %s (esperaba %s)\n' "$4" "$got" "$1"
    fallos=$((fallos + 1))
  fi
}

# El esperado se calcula aparte, mirando los ficheros del commit: si la regla y la
# comprobación salieran del mismo sitio, el test no diría nada.
esperado_de() {
  local sha="$1" hay
  hay=$(git show --name-only --format= "$sha" | grep -Ev '^(web/|flyer/|docs/)|\.md$|^$' | head -1)
  [ -n "$hay" ] && echo true || echo false
}

echo "commits reales:"
for sha in $(git log --format=%h -25); do
  # Solo los que tocan algo; los merges vacíos no dicen nada.
  git show --name-only --format= "$sha" | grep -q . || continue
  comprueba "$(esperado_de "$sha")" "$sha~1" "$sha" "$(git log -1 --format=%s "$sha" | cut -c1-44)"
done

echo "casos límite:"
comprueba true "0000000000000000000000000000000000000000" HEAD "rama nueva (sha a ceros)"
comprueba true "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" HEAD "force-push (sha inexistente)"
comprueba true "" HEAD "sin punto de comparación"

echo
if [ "$fallos" -eq 0 ]; then
  echo "OK: la decisión de desplegar es correcta en todos los casos."
else
  echo "$fallos casos mal clasificados."
  exit 1
fi
