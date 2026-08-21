#!/usr/bin/env python3
"""Recorta el GeoJSON de fronteras de Natural Earth a unos pocos países.

`populate-regions` necesita polígonos de la primera división administrativa. El fichero
global de Natural Earth (`ne_10m_admin_1_states_provinces`) son **40 MB y 4.596 regiones**
del mundo entero, y subirlo a la máquina de producción para clasificar dos países es
tirar ancho de banda y tiempo.

Pero el motivo de fondo no es el tamaño, es la **seguridad**: `populate-regions` escribe
en `fonts.country`/`fonts.region` de todo lo que caiga dentro de un polígono, y con
`--fallback-nearest` también de lo que caiga cerca. Con un fichero recortado a los países
que estás importando, el comando **no puede tocar nada más** aunque te equivoques de
opción. Es la misma idea que `--dry-run` en otros sitios: acotar el daño posible antes de
lanzar, no después.

    python3 scripts/fronteras-subset.py ne_10m_admin_1_states_provinces.geojson \
        salida.geojson Sweden Finland

## Åland, y por qué este script existe en vez de un `jq` de una línea

Natural Earth **no trae Åland como región de Finlandia**: le da país propio
(`admin: "Aland"`) y lo parte en sus 11 municipios. Las dos cosas están mal para nosotros:

  · `country = "Aland"` inventa un país que no está en `lib/countries.ts` ni en ningún
    sitio, y aparecería como una octava columna en `/zones`.
  · `region = "Mariehamn"` es un **municipio**, y `fonts.region` ya mezcla tres
    profundidades (provincias en España, distritos en Portugal, départements en Francia).
    Añadir una cuarta, y encima solo en un trozo de un país, empeora justo lo que ya duele.

Åland es la región FI-01 de Finlandia, del mismo nivel que las otras 18. Así que los 11
municipios se fusionan en un MultiPolygon y se reetiquetan. Sin esto, las fuentes de las
islas se quedan **sin región** (medido: 8 de las 1.089 finlandesas), y son justamente las
de la parte sueco-parlante de Finlandia.

Si algún día se importa otro país con una autonomía insular tratada así, va en `ARREGLOS`.
"""
import argparse
import json

# Territorios que Natural Earth trata como país propio y en realidad son una región de
# otro. Clave: el `admin` del fichero. Valor: (país de verdad, nombre de la región, ISO).
ARREGLOS = {
    'Aland': ('Finland', 'Åland', 'FI-01'),
}


def poligonos(feature):
    """Los anillos de un Feature, venga como Polygon o como MultiPolygon."""
    g = feature['geometry']
    if g['type'] == 'Polygon':
        return [g['coordinates']]
    if g['type'] == 'MultiPolygon':
        return list(g['coordinates'])
    return []


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('entrada', help='GeoJSON global de Natural Earth admin-1')
    ap.add_argument('salida')
    ap.add_argument('paises', nargs='+', help='Nombres tal y como los escribe Natural Earth')
    args = ap.parse_args()

    datos = json.load(open(args.entrada, encoding='utf-8'))
    quiero = set(args.paises)

    salen = [f for f in datos['features'] if f['properties'].get('admin') in quiero]

    for admin, (pais, region, iso) in ARREGLOS.items():
        if pais not in quiero:
            continue
        trozos = [f for f in datos['features'] if f['properties'].get('admin') == admin]
        if not trozos:
            continue
        coords = [p for f in trozos for p in poligonos(f)]
        salen.append({
            'type': 'Feature',
            'properties': {'admin': pais, 'name': region, 'iso_3166_2': iso,
                           'type_en': 'Region'},
            'geometry': {'type': 'MultiPolygon', 'coordinates': coords},
        })
        print(f'  {admin}: {len(trozos)} trozos fusionados en {pais} / {region}')

    json.dump({'type': 'FeatureCollection', 'features': salen},
              open(args.salida, 'w', encoding='utf-8'))

    for pais in sorted(quiero):
        n = sum(1 for f in salen if f['properties']['admin'] == pais)
        print(f'  {pais}: {n} regiones')
    print(f'{len(salen)} regiones -> {args.salida}')


if __name__ == '__main__':
    main()
