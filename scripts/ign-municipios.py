#!/usr/bin/env python3
"""Convierte los recintos municipales del IGN a un GeoJSON compacto.

    python3 scripts/ign-municipios.py <carpeta_shp> [<carpeta_shp> ...] municipios-es.geojson

Lee el shapefile **sin dependencias**: aquí no hay GDAL ni `pyshp`, y el formato `.shp` es
binario pero sencillo (cabecera de 100 bytes y registros de polígono con sus anillos), y el
`.dbf` de al lado trae los nombres. Instalar GDAL para esto habría sido meter 300 MB de
dependencia para leer dos formatos documentados.

## Lo que hace y por qué

- **Se queda con el nombre y el código INE** (`NAMEUNIT`, `NATCODE`). Lo demás del `.dbf`
  son URLs de INSPIRE y códigos NUTS que aquí no sirven.
- **Simplifica** con Douglas-Peucker. El original son 64 MB y esto acaba versionado en el
  repo: la tolerancia por defecto son ~55 m, que en un límite municipal es invisible para
  lo que se usa —decidir en qué municipio cae una fuente— y recorta el fichero un orden de
  magnitud.
- **No reproyecta**, y conviene saber por qué no hace falta: el `.prj` dice `EPSG:4258`
  (ETRS89 en grados), que frente a WGS84 difiere en centímetros. Si algún día el IGN
  publicara en UTM habría que reproyectar, y el síntoma de no hacerlo sería que **ninguna**
  fuente encuentra municipio, sin ningún error por medio.

Datos © Instituto Geográfico Nacional (CC BY 4.0).
"""
import json
import os
import struct
import sys

# ~55 m. Más fino no cambia a qué municipio pertenece una fuente; más grueso empieza a
# comerse penínsulas pequeñas y a mover la raya lo suficiente para notarse.
TOLERANCIA = 0.0005


def campos_dbf(f):
    _, _, _, _, n, hdr, rec = struct.unpack('<BBBBIHH', f.read(12))
    f.read(20)
    campos = []
    while True:
        b = f.read(32)
        if b[0:1] in (b'\r', b''):
            break
        campos.append((b[:11].split(b'\x00')[0].decode('latin-1'), b[16]))
    return n, hdr, rec, campos


def lee_dbf(ruta):
    """Los atributos, en el mismo orden que las geometrías del .shp.

    La codificación la dice el `.cpg` de al lado —aquí, UTF-8—. Dando por hecho Latin-1
    salían «Salvaterra de MiÃ±o» y «PuigcerdÃ », y eso **no falla**: el fichero se genera,
    el municipio se asigna y solo se ve mirando los nombres. Se vio comparando las fuentes
    que el IGN coloca en municipios de frontera.
    """
    cpg = ruta[:-4] + '.cpg'
    codificacion = 'latin-1'
    if os.path.exists(cpg):
        declarada = open(cpg).read().strip().lower().replace('-', '')
        if declarada in ('utf8', 'utf_8'):
            codificacion = 'utf-8'
    with open(ruta, 'rb') as f:
        n, hdr, rec, campos = campos_dbf(f)
        f.seek(hdr)
        filas = []
        for _ in range(n):
            raw = f.read(rec)
            if len(raw) < rec:
                break
            off, fila = 1, {}
            for nombre, largo in campos:
                fila[nombre] = raw[off:off + largo].decode(codificacion, 'replace').strip()
                off += largo
            filas.append(fila)
        return filas


def lee_shp(ruta):
    """Los anillos de cada registro. Solo polígonos (tipo 5), que es lo que hay aquí."""
    with open(ruta, 'rb') as f:
        f.seek(100)  # cabecera
        formas = []
        while True:
            cab = f.read(8)
            if len(cab) < 8:
                break
            _, largo = struct.unpack('>II', cab)
            datos = f.read(largo * 2)
            tipo = struct.unpack('<I', datos[:4])[0]
            if tipo != 5:
                formas.append([])
                continue
            n_partes, n_puntos = struct.unpack('<II', datos[36:44])
            partes = struct.unpack(f'<{n_partes}I', datos[44:44 + 4 * n_partes])
            base = 44 + 4 * n_partes
            xy = struct.unpack(f'<{2 * n_puntos}d', datos[base:base + 16 * n_puntos])
            anillos = []
            for i, ini in enumerate(partes):
                fin = partes[i + 1] if i + 1 < n_partes else n_puntos
                anillos.append([(xy[2 * j], xy[2 * j + 1]) for j in range(ini, fin)])
            formas.append(anillos)
        return formas


def simplifica(puntos, tol):
    """Douglas-Peucker iterativo: recursivo se desborda la pila con anillos de costa.

    **Ojo con los anillos cerrados**, que es lo que hay aquí: el primer punto y el último
    son el mismo, así que la cuerda entre los extremos mide cero y la distancia
    punto-recta da cero para todos. Sin tratarlo, cada municipio se queda en dos puntos y
    se descarta entero — y no falla nada: sale un fichero de 42 bytes. Cuando los extremos
    coinciden se mide la distancia **al punto**, que es lo que corresponde.
    """
    if len(puntos) < 3:
        return puntos
    guardar = [False] * len(puntos)
    guardar[0] = guardar[-1] = True
    pila = [(0, len(puntos) - 1)]
    while pila:
        ini, fin = pila.pop()
        if fin <= ini + 1:
            continue
        ax, ay = puntos[ini]
        bx, by = puntos[fin]
        dx, dy = bx - ax, by - ay
        norma = (dx * dx + dy * dy) ** 0.5
        peor, idx = 0.0, ini
        for k in range(ini + 1, fin):
            px, py = puntos[k]
            if norma < 1e-12:
                d = ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
            else:
                d = abs(dy * px - dx * py + bx * ay - by * ax) / norma
            if d > peor:
                peor, idx = d, k
        if peor > tol:
            guardar[idx] = True
            pila.append((ini, idx))
            pila.append((idx, fin))
    return [p for p, g in zip(puntos, guardar) if g]


def main(carpetas, salida):
    features = []
    for carpeta in carpetas:
        base = None
        for f in os.listdir(carpeta):
            if f.endswith('.shp'):
                base = os.path.join(carpeta, f[:-4])
        if not base:
            print(f'  aviso: sin .shp en {carpeta}', file=sys.stderr)
            continue
        atributos = lee_dbf(base + '.dbf')
        formas = lee_shp(base + '.shp')
        print(f'  {os.path.basename(base)}: {len(formas)} recintos')
        for props, anillos in zip(atributos, formas):
            nombre = props.get('NAMEUNIT', '').strip()
            if not nombre or not anillos:
                continue
            simplificados = []
            for anillo in anillos:
                s = simplifica(anillo, TOLERANCIA)
                # Un anillo con menos de cuatro puntos ya no encierra nada: se cae solo al
                # simplificar una isla diminuta, y dejarlo rompería el point-in-polygon.
                if len(s) >= 4:
                    simplificados.append([[round(x, 5), round(y, 5)] for x, y in s])
            if not simplificados:
                continue
            features.append({
                'type': 'Feature',
                'properties': {'name': nombre, 'ine': props.get('NATCODE', '')[-5:]},
                # Cada anillo como su propio polígono: aquí no se distingue exterior de
                # agujero, y para «¿cae este punto dentro?» un agujero de un enclave es un
                # caso tan raro que no compensa la complejidad de resolverlo mal.
                'geometry': {'type': 'MultiPolygon',
                             'coordinates': [[a] for a in simplificados]},
            })
    json.dump({'type': 'FeatureCollection', 'features': features},
              open(salida, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'{len(features)} municipios → {salida}')


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1:-1], sys.argv[-1])
