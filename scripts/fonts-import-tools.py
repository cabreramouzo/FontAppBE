#!/usr/bin/env python3
"""
Herramientas para preparar una importación masiva de fuentes (p. ej. el WFS de la ACA).

Responden a las tres preguntas que salen siempre al importar un dataset ajeno:

  1. ¿Qué puntos NO son fuentes de beber?          → `filtra`
  2. ¿A qué distancia deja de haber duplicados?    → `llindar`
  3. De las que el dedupe descarta, ¿cuáles eran   → `rescata`
     fuentes distintas de verdad?

No necesita dependencias: solo Python 3. Los datos existentes se le pasan en CSV,
que se saca de la base de datos con:

    psql "$DATABASE_URL" -tAc \\
      "COPY (SELECT latitude, longitude, name FROM fonts) TO STDOUT WITH CSV" > fonts.csv

Ejemplos de uso completos en DEPLOY.md, sección "Fuentes oficiales de la ACA".
"""
import argparse
import collections
import csv
import difflib
import json
import math
import re
import sys
import unicodedata

# Prefijos de nombre que delatan algo que NO es una fuente de la que beber. Se filtra
# por el nombre y no por el campo de uso del agua (`TIPUSUS` en la ACA): ese describe
# el aprovechamiento administrativo, no lo que hay allí — "Font Vella" consta como
# industrial por la embotelladora y es una fuente perfectamente real.
NO_ES_FUENTE = re.compile(
    r'^(BASSA|BASSES|ESTANY|ESTANYOL|LLACUNA|POU|POUS|POU-|MINA|GORG|SALT'
    r'|CAPTACIÓ|CAPTACIO|PRESA|TORRENT|SURGÈNCIA|SURGENCIA)\b'
)

# Palabras sin valor para comparar topónimos ("Font de la Roca" ≡ "Roca").
VACIAS = {"font", "fonts", "fontica", "de", "del", "dels", "la", "les", "el", "els",
          "d", "l", "o", "en", "des", "na", "ca", "can", "sa"}


def sin_acentos(texto):
    t = unicodedata.normalize('NFKD', texto.lower())
    return ''.join(c for c in t if not unicodedata.combining(c))


def palabras(nombre):
    limpio = re.sub(r"[^a-z0-9 ]", " ", sin_acentos(nombre))
    return [w for w in limpio.split() if w not in VACIAS]


def metros(lat1, lon1, lat2, lon2):
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return 6371000 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def carga_geojson(ruta, campo_nombre):
    """Devuelve [(nombre, lat, lon, propiedades)]. Acepta Point y MultiPoint."""
    datos = json.load(open(ruta, encoding='utf-8'))
    puntos = []
    for f in datos.get('features', []):
        geom = f.get('geometry') or {}
        props = f.get('properties') or {}
        nombre = str(props.get(campo_nombre) or '').strip()
        if geom.get('type') == 'Point':
            pares = [geom['coordinates']]
        elif geom.get('type') == 'MultiPoint':
            pares = geom['coordinates']
        else:
            continue
        for par in pares:
            if len(par) >= 2:
                puntos.append((nombre, par[1], par[0], props))
    return puntos


def carga_existentes(ruta_csv):
    """Índice espacial casero: celdas de 0,01° (~1 km) para no comparar todo con todo."""
    rejilla = collections.defaultdict(list)
    total = 0
    with open(ruta_csv, encoding='utf-8') as fh:
        for fila in csv.reader(fh):
            if len(fila) < 3:
                continue
            lat, lon, nombre = float(fila[0]), float(fila[1]), fila[2]
            rejilla[(round(lat, 2), round(lon, 2))].append((lat, lon, nombre))
            total += 1
    return rejilla, total


def mas_cercana(rejilla, lat, lon):
    """(distancia_en_metros, nombre) de la fuente existente más próxima."""
    mejor, cual = float('inf'), None
    for dlat in (-0.01, 0, 0.01):
        for dlon in (-0.01, 0, 0.01):
            for elat, elon, enombre in rejilla.get((round(lat + dlat, 2), round(lon + dlon, 2)), []):
                d = metros(lat, lon, elat, elon)
                if d < mejor:
                    mejor, cual = d, enombre
    return mejor, cual


def mismo_nombre(a, b):
    """¿Comparten al menos la mitad de las palabras con contenido?"""
    A, B = set(palabras(a)), set(palabras(b))
    if not A or not B:
        return False
    return len(A & B) / min(len(A), len(B)) >= 0.5


# --------------------------------------------------------------------------- filtra

def cmd_filtra(args):
    datos = json.load(open(args.geojson, encoding='utf-8'))
    fuera = collections.Counter()
    buenas = []
    for f in datos['features']:
        nombre = str((f.get('properties') or {}).get(args.name_field) or '').upper()
        m = NO_ES_FUENTE.match(nombre)
        if m:
            fuera[m.group(1)] += 1
        else:
            buenas.append(f)
    json.dump({'type': 'FeatureCollection', 'features': buenas},
              open(args.salida, 'w', encoding='utf-8'))
    print(f"{len(datos['features'])} → se quedan {len(buenas)} · se descartan {sum(fuera.values())}")
    for palabra, n in fuera.most_common():
        print(f"   {palabra:<12} {n}")
    print(f"→ {args.salida}")


# -------------------------------------------------------------------------- llindar

def cmd_llindar(args):
    """Histograma de distancias + cuántas comparten nombre. Justifica el --dedupe.

    OJO: hay que ejecutarlo ANTES de importar. Después, cada punto del origen se
    encuentra a sí mismo a 0 m y el histograma solo dice que la importación funcionó.
    """
    rejilla, total = carga_existentes(args.fonts_csv)
    puntos = carga_geojson(args.geojson, args.name_field)
    print(f"{len(puntos)} puntos del origen contra {total} fuentes existentes\n")

    tramos = [(0, 10), (10, 20), (20, 25), (25, 30), (30, 40), (40, 50),
              (50, 60), (60, 80), (80, 100), (100, 150), (150, 300), (300, 10 ** 9)]
    medidos = []
    for nombre, lat, lon, _ in puntos:
        d, vecina = mas_cercana(rejilla, lat, lon)
        medidos.append((d, nombre, vecina))

    print(f"{'distancia':>12}  {'puntos':>7}  {'mismo nombre':>13}")
    for lo, hi in tramos:
        sel = [m for m in medidos if lo <= m[0] < hi]
        if not sel:
            continue
        iguales = sum(1 for _, n, v in sel if v and mismo_nombre(n, v))
        etiqueta = f"{lo}–{hi} m" if hi < 10 ** 9 else f">{lo} m"
        pct = f"{100 * iguales / len(sel):.0f}%"
        print(f"{etiqueta:>12}  {len(sel):>7}  {pct:>13}  {'█' * round(len(sel) / 40)}")

    print("\nCómo leerlo: donde el porcentaje de nombres coincidentes se desploma es donde")
    print("dejan de ser duplicados y empiezan a ser fuentes vecinas distintas. El --dedupe")
    print("va justo ahí. Un pico alto pegado a 0 m con cola larga es normal: la cola es el")
    print("desacuerdo de coordenadas entre los dos orígenes, NO fuentes distintas.")


# -------------------------------------------------------------------------- rescata

def cmd_rescata(args):
    """Candidatas a ser fuentes DISTINTAS dentro de la banda que el dedupe descarta."""
    rejilla, _ = carga_existentes(args.fonts_csv)
    candidatas = []
    for nombre, lat, lon, props in carga_geojson(args.geojson, args.name_field):
        d, vecina = mas_cercana(rejilla, lat, lon)
        if not (args.min <= d < args.max) or not vecina:
            continue
        A, B = palabras(nombre), palabras(vecina)
        if not A or not B:
            continue
        # Nombre-código del inventario, sin topónimo aprovechable.
        if re.search(r'\d{3}', nombre) or len(" ".join(A)) < 4:
            continue
        # Comparten una palabra larga → alias o variante ortográfica, no una fuente nueva.
        if set(w for w in A if len(w) > 4) & set(w for w in B if len(w) > 4):
            continue
        # La propia fuente de datos dice que va asociada a otra cosa.
        if re.search(r'ASSOCIADA|BASSA|MINA|POU', nombre.upper()):
            continue
        parecido = difflib.SequenceMatcher(None, " ".join(A), " ".join(B)).ratio()
        candidatas.append((parecido, d, nombre, vecina, lat, lon, props))

    # Cuanto MENOS se parecen los nombres, más probable que sean dos fuentes distintas.
    candidatas.sort(key=lambda c: c[0])
    vistas, unicas = set(), []
    for c in candidatas:
        clave = (round(c[4], 5), round(c[5], 5))
        if clave in vistas:   # el propio origen trae puntos repetidos
            continue
        vistas.add(clave)
        unicas.append(c)
    elegidas = unicas[:args.limit]

    print(f"{len(candidatas)} candidatas → {len(unicas)} sin repetir → {len(elegidas)} elegidas")
    if elegidas:
        print(f"parecido de nombre: {elegidas[0][0]:.2f} (nada que ver) … {elegidas[-1][0]:.2f}\n")
    for i, (par, d, nombre, vecina, lat, lon, props) in enumerate(elegidas, 1):
        lugar = props.get('MUNICIPI') or props.get('municipi') or ''
        print(f"{i:>3}. {nombre[:44]:<44} {d:>3.0f} m ← «{vecina[:28]}»  {lugar}")
        if args.enlaces:
            print(f"     https://www.google.com/maps?q={lat},{lon}&t=k")

    if args.salida:
        json.dump({'type': 'FeatureCollection', 'features': [
            {'type': 'Feature',
             'geometry': {'type': 'Point', 'coordinates': [lon, lat]},
             'properties': {args.name_field: nombre}}
            for _, _, nombre, _, lat, lon, _ in elegidas]},
            open(args.salida, 'w', encoding='utf-8'))
        print(f"\n→ {args.salida}")
        print("Impórtalo con --dedupe 20: lo justo para quitar los repetidos del propio")
        print("fichero, sin volver a descartar las vecinas que acabamos de rescatar.")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)

    f = sub.add_parser('filtra', help='Quita del GeoJSON lo que no son fuentes de beber')
    f.add_argument('geojson')
    f.add_argument('salida')
    f.add_argument('--name-field', default='NOM')
    f.set_defaults(func=cmd_filtra)

    l = sub.add_parser('llindar', help='Histograma de distancias: en qué metro poner el --dedupe (ejecutar ANTES de importar)')
    l.add_argument('geojson')
    l.add_argument('fonts_csv')
    l.add_argument('--name-field', default='NOM')
    l.set_defaults(func=cmd_llindar)

    r = sub.add_parser('rescata', help='Vecinas que sí eran fuentes distintas')
    r.add_argument('geojson')
    r.add_argument('fonts_csv')
    r.add_argument('--name-field', default='NOM')
    r.add_argument('--min', type=float, default=25, help='banda inferior en metros (def. 25)')
    r.add_argument('--max', type=float, default=50, help='banda superior en metros (def. 50)')
    r.add_argument('--limit', type=int, default=50)
    r.add_argument('--salida', help='GeoJSON de salida con las elegidas')
    r.add_argument('--enlaces', action='store_true', help='añade enlace al satélite de cada una')
    r.set_defaults(func=cmd_rescata)

    args = ap.parse_args()
    args.func(args)


if __name__ == '__main__':
    sys.exit(main())
