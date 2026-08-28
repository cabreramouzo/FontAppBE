#!/usr/bin/env python3
"""Compacta un volcado de Overpass de núcleos de población a lo que necesita la app.

El volcado crudo son 4,3 MB de metadatos de OSM (id, versión, changeset, todos los tags)
y de eso solo hacen falta cuatro campos. El resultado sí se versiona —es pequeño, estable
y es la entrada de `import-places`—; el crudo no, igual que el resto de descargas de OSM
(ver .gitignore).

    python3 scripts/nuclis-osm.py nuclis-es-osm-crudo.json nuclis-es.json

Los datos son de OpenStreetMap (ODbL), la misma fuente que la mayoría de las fuentes.
"""
import json
import sys

TIPOS = {"city", "town", "village"}


def main(entrada: str, salida: str) -> None:
    crudo = json.load(open(entrada))
    fuera = []
    for e in crudo.get("elements", []):
        t = e.get("tags", {})
        nombre = t.get("name")
        if not nombre or t.get("place") not in TIPOS:
            continue
        if "lat" not in e or "lon" not in e:
            continue
        fuera.append({
            "n": nombre,
            # Cinco decimales son ~1 m: de sobra para el centro de un pueblo, y recorta
            # el fichero a la mitad frente a los quince que trae el volcado.
            "la": round(e["lat"], 5),
            "lo": round(e["lon"], 5),
            "t": t["place"],
        })
    fuera.sort(key=lambda x: (x["n"], x["la"]))
    json.dump(fuera, open(salida, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"{len(fuera)} núcleos → {salida}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
