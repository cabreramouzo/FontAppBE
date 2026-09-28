#!/bin/bash
UA="FontApp import (miguelangelcabrera1@hotmail.com)"
EP="https://overpass-api.de/api/interpreter"
# ISO:NombreArchivo
COUNTRIES="AR:argentina PE:peru CO:colombia EC:ecuador BO:bolivia PY:paraguay UY:uruguay VE:venezuela GT:guatemala SV:elsalvador HN:honduras NI:nicaragua CR:costarica PA:panama DO:dominicana"
for pair in $COUNTRIES; do
  iso="${pair%%:*}"; name="${pair##*:}"
  q="[out:json][timeout:300];
area[\"ISO3166-1\"=\"$iso\"][admin_level=2]->.a;
(
  node[\"amenity\"=\"drinking_water\"](area.a);
  node[\"natural\"=\"spring\"][\"drinking_water\"](area.a);
  node[\"man_made\"=\"water_tap\"](area.a);
);
out body;"
  code=$(curl -sS -A "$UA" --data-urlencode "data=$q" "$EP" -o "${name}-osm-crudo.json" -w "%{http_code}")
  raw=$(grep -o '"type": *"node"' "${name}-osm-crudo.json" | wc -l | tr -d ' ')
  echo "[$iso $name] http=$code crudos=$raw"
  sleep 8   # cortesía con el servidor público
done
echo "=== DESCARGA COMPLETA ==="
