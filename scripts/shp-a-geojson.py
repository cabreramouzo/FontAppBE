#!/usr/bin/env python3
"""Convierte un shapefile de PUNTOS a GeoJSON, sin dependencias.

Existe porque las IDE autonómicas publican en shapefile y en UTM, y `import-geojson`
—que es lo que ya sabe importar la ACA— quiere GeoJSON en WGS84. Lo alternativo era
meter `pyproj`/`fiona` en el repo para leer dos ficheros al año.

Solo puntos: los tipos 1, 11 y 21 (Point, PointZ, PointM). Con otra geometría se planta
en vez de inventarse un centroide, que es lo que haría un conversor genérico y dejaría
una fuente en medio de un polígono.

Uso:
    shp-a-geojson.py <base.shp> [--epsg 25830|4326] [--out fichero.geojson]
"""
import json, struct, sys, math
from pathlib import Path

# --- DBF: solo lo que hace falta para leer los atributos de una capa de puntos --------

def lee_dbf(ruta):
    b = ruta.read_bytes()
    n_reg, cab, largo = struct.unpack('<IHH', b[4:12])
    campos = []
    off = 32
    while b[off] != 0x0D:
        nombre = b[off:off+11].split(b'\0')[0].decode('latin-1').strip()
        tipo = chr(b[off+11]); ancho = b[off+16]
        campos.append((nombre, tipo, ancho))
        off += 32
    # El .cpg diría la codificación, pero las IDE no siempre lo incluyen. Se prueba UTF-8
    # y se cae a latin-1: leer al revés no da ningún error, solo «MiÃ±o» meses después.
    cpg = ruta.with_suffix('.cpg')
    codif = cpg.read_text().strip() if cpg.exists() else None
    filas = []
    for i in range(n_reg):
        p = cab + i * largo
        if b[p:p+1] == b'*':      # registro borrado
            continue
        p += 1
        fila = {}
        for nombre, tipo, ancho in campos:
            crudo = b[p:p+ancho]; p += ancho
            v = decodifica(crudo, codif).strip()
            if tipo in 'NF':
                try: v = float(v) if v else None
                except ValueError: v = None
            fila[nombre] = v if v != '' else None
        filas.append(fila)
    return filas

def decodifica(crudo, codif):
    for c in ([codif] if codif else []) + ['utf-8', 'latin-1']:
        try: return crudo.decode(c)
        except (UnicodeDecodeError, LookupError): continue
    return crudo.decode('latin-1', 'replace')

# --- SHP: geometría ------------------------------------------------------------------

PUNTOS = {1: 'Point', 11: 'PointZ', 21: 'PointM'}

def lee_shp(ruta):
    b = ruta.read_bytes()
    total = struct.unpack('>i', b[24:28])[0] * 2
    tipo = struct.unpack('<i', b[32:36])[0]
    if tipo not in PUNTOS:
        sys.exit(f'{ruta.name}: tipo de geometría {tipo}, y esto solo convierte puntos')
    pts, off = [], 100
    while off < total:
        _, largo = struct.unpack('>ii', b[off:off+8])
        cuerpo = off + 8
        t = struct.unpack('<i', b[cuerpo:cuerpo+4])[0]
        if t == 0:                      # null shape: hueco legítimo del formato
            pts.append(None)
        else:
            x, y = struct.unpack('<dd', b[cuerpo+4:cuerpo+20])
            pts.append((x, y))
        off += 8 + largo * 2
    return pts

# --- UTM (ETRS89) → WGS84 ------------------------------------------------------------
# ETRS89 y WGS84 difieren menos de un metro en la península: por debajo del error del GPS
# que pone estos puntos, así que no se transforma el datum.

A, F = 6378137.0, 1 / 298.257222101   # GRS80
K0, FE = 0.9996, 500000.0

def utm_a_wgs84(x, y, zona, norte=True):
    e2 = F * (2 - F)
    ep2 = e2 / (1 - e2)
    m = (y - (0 if norte else 10_000_000)) / K0
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    mu = m / (A * (1 - e2/4 - 3*e2**2/64 - 5*e2**3/256))
    p1 = (mu + (3*e1/2 - 27*e1**3/32) * math.sin(2*mu)
             + (21*e1**2/16 - 55*e1**4/32) * math.sin(4*mu)
             + (151*e1**3/96) * math.sin(6*mu)
             + (1097*e1**4/512) * math.sin(8*mu))
    c1 = ep2 * math.cos(p1)**2
    t1 = math.tan(p1)**2
    n1 = A / math.sqrt(1 - e2 * math.sin(p1)**2)
    r1 = A * (1 - e2) / (1 - e2 * math.sin(p1)**2)**1.5
    d = (x - FE) / (n1 * K0)
    lat = p1 - (n1 * math.tan(p1) / r1) * (
        d**2/2 - (5 + 3*t1 + 10*c1 - 4*c1**2 - 9*ep2) * d**4/24
        + (61 + 90*t1 + 298*c1 + 45*t1**2 - 252*ep2 - 3*c1**2) * d**6/720)
    lon = (d - (1 + 2*t1 + c1) * d**3/6
             + (5 - 2*c1 + 28*t1 - 3*c1**2 + 8*ep2 + 24*t1**2) * d**5/120) / math.cos(p1)
    lon0 = math.radians(zona * 6 - 183)
    return math.degrees(lat), math.degrees(lon0 + lon)

def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    shp = Path(args[0])
    epsg = 25830
    salida = shp.with_suffix('.geojson')
    if '--epsg' in args: epsg = int(args[args.index('--epsg') + 1])
    if '--out' in args:  salida = Path(args[args.index('--out') + 1])

    pts = lee_shp(shp)
    atributos = lee_dbf(shp.with_suffix('.dbf'))
    if len(pts) != len(atributos):
        sys.exit(f'{len(pts)} geometrías y {len(atributos)} registros: el shapefile no cuadra')

    feats, fuera = [], 0
    for (p, props) in zip(pts, atributos):
        if p is None:
            fuera += 1; continue
        if epsg == 4326:
            lon, lat = p
        else:
            zona = epsg - 25800 if 25828 <= epsg <= 25838 else epsg - 32600
            lat, lon = utm_a_wgs84(p[0], p[1], zona)
        # Un error de proyección no da excepción, da coordenadas plausibles en otro sitio.
        # El continente es el mínimo que se puede comprobar aquí.
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            sys.exit(f'coordenada imposible tras reproyectar: {lat},{lon}')
        feats.append({'type': 'Feature',
                      'geometry': {'type': 'Point', 'coordinates': [round(lon, 7), round(lat, 7)]},
                      'properties': props})
    salida.write_text(json.dumps({'type': 'FeatureCollection', 'features': feats},
                                 ensure_ascii=False), encoding='utf-8')
    lats = [f['geometry']['coordinates'][1] for f in feats]
    lons = [f['geometry']['coordinates'][0] for f in feats]
    print(f'{salida}: {len(feats)} puntos' + (f' ({fuera} sin geometría)' if fuera else ''))
    print(f'  caja: lat {min(lats):.4f}..{max(lats):.4f}  lon {min(lons):.4f}..{max(lons):.4f}')
    print(f'  campos: {", ".join(list(feats[0]["properties"])[:12])}')

if __name__ == '__main__':
    main()
