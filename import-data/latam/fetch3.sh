#!/bin/bash
UA="FontApp import (miguelangelcabrera1@hotmail.com)"
EP="https://overpass-api.de/api/interpreter"
for pair in CU:cuba PR:puertorico BR:brasil; do
  iso="${pair%%:*}"; name="${pair##*:}"
  q="[out:json][timeout:900];
area[\"ISO3166-1\"=\"$iso\"][admin_level=2]->.a;
(
  node[\"amenity\"=\"drinking_water\"](area.a);
  node[\"natural\"=\"spring\"][\"drinking_water\"](area.a);
  node[\"man_made\"=\"water_tap\"](area.a);
);
out body;"
  for attempt in 1 2 3 4; do
    code=$(curl -sS -A "$UA" --data-urlencode "data=$q" "$EP" -o "${name}-osm-crudo.json" -w "%{http_code}")
    raw=$(grep -o '"type": *"node"' "${name}-osm-crudo.json" | wc -l | tr -d ' ')
    if [ "$code" = "200" ] && [ "$raw" -gt 0 ]; then break; fi
    echo "[$iso] intento $attempt http=$code raw=$raw, espera 30s…"; sleep 30
  done
  echo "[$iso $name] http=$code crudos=$raw"
  sleep 15
done
echo "=== FETCH3 COMPLETO ==="
