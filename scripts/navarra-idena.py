#!/usr/bin/env python3
"""Prepara las capas de IDENA (Navarra) para `import-geojson`.

Entra el GeoJSON que sale de `shp-a-geojson.py` y sale otro filtrado y con los nombres
limpios. Va aparte del conversor porque el conversor es genérico y esto es propio de este
origen: qué filas no son fuentes y cómo abrevian los topónimos.

    navarra-idena.py manantiales <entrada.geojson> <salida.geojson>

## Qué se descarta, y por qué

- `IDTIPO = Regata`: una regata es un arroyo. Es la misma regla por la que el importador de
  OSM descarta el `natural=spring` pelado — un punto de agua no es un sitio donde llenar.
- `APROXIMADA = 1`: el propio origen dice que no sabe dónde está. En una app que te guía los
  últimos doscientos metros, eso es peor que no tener el punto.
- Sin `MANANTIAL`: sin topónimo, `import-geojson` los llamaría «Font» a todos, que es
  exactamente el relleno que `clear-placeholder-names` vino a borrar.

## Los nombres

Vienen EN MAYÚSCULAS y abreviados: «FTE.PATA DE BUEY». `--titlecase` del importador arregla
las mayúsculas pero no el resto, y deja «Fte.pata de Buey», que no es un topónimo
presentable. Aquí se despega el punto y se desarrolla «FTE», que son las dos únicas
abreviaturas frecuentes y sin ambigüedad. **`S.` se deja como está**: puede ser San o Santa
y no hay forma de saberlo desde el fichero — inventarlo sería peor que la abreviatura.
"""
import json, re, sys, collections

def limpia(nombre: str) -> str:
    n = ' '.join(nombre.split())
    n = re.sub(r'\.(?=\S)', '. ', n)            # FTE.BOJ -> FTE. BOJ
    n = re.sub(r'(?i)\bFTE\.?\s+', 'FUENTE ', n)  # FTE. BOJ -> FUENTE BOJ
    return ' '.join(n.split())

def manantiales(entrada, salida):
    fs = json.load(open(entrada, encoding='utf-8'))['features']
    razones = collections.Counter()
    buenos = []
    for f in fs:
        p = f['properties']
        if p.get('IDTIPO') == 'Regata':          razones['regata'] += 1; continue
        if str(p.get('APROXIMADA')) == '1.0':    razones['ubicación aproximada'] += 1; continue
        if not (p.get('MANANTIAL') or '').strip(): razones['sin topónimo'] += 1; continue
        p['MANANTIAL'] = limpia(p['MANANTIAL'])
        buenos.append(f)
    json.dump({'type': 'FeatureCollection', 'features': buenos},
              open(salida, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'{entrada}: {len(fs)} → {len(buenos)}')
    for k, v in razones.most_common():
        print(f'  descartados por {k}: {v}')
    print('  tipos:', dict(collections.Counter(f['properties']['IDTIPO'] for f in buenos)))
    print('  muestra:', [f['properties']['MANANTIAL'] for f in buenos[:6]])

if __name__ == '__main__':
    if len(sys.argv) != 4 or sys.argv[1] != 'manantiales':
        sys.exit(__doc__)
    manantiales(sys.argv[2], sys.argv[3])
