#!/usr/bin/env python3
"""Prepara las insignias (de nivel y de familia) para la web.

Las imágenes salen del generador a ~1250 px y ~2 MB cada una. Diez de esas son
19 MB de assets para algo que se ve a 120 px: hay que escalarlas y comprimirlas
antes de que entren al repositorio.

    python3 scripts/prepara-insignias.py ~/Downloads/nivel_gota.png drop
    python3 scripts/prepara-insignias.py ~/Downloads/badge-pionner.png pioneer
    python3 scripts/prepara-insignias.py ~/Downloads/*.png          # por nombre

Sin dependencias fuera de Pillow (`pip install pillow`), porque en esta máquina no
hay pngquant ni ImageMagick.

Salida: `web/public/levels/<clave>.png` para los diez niveles y
`web/public/badges/<clave>.png` para las familias, 320 px y paleta de 256
colores. Se sirve desde `public/` y no desde `src/assets/` a propósito: así se
descarga **solo la insignia que toca** en vez de empaquetar el megabyte entero.
Como `public/` no lleva hash en el nombre, quien las pinta les añade `?v=N` — si
algún día se redibuja una, hay que subir esa versión o el service worker seguirá
sirviendo la vieja.

Ojo con las familias que **no** son `unique`: tienen bronce, plata y oro, y una
sola imagen no puede representar los tres grados. Por eso las de tres escalones
siguen con icono coloreado (`BadgeIcon`) y aquí solo entran, de momento, las de
grado único.
"""
# El python3 del sistema es el 3.9 y ahí `str | None` en una firma revienta al
# importar el módulo, no al llamarlo.
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
NIVELES = RAIZ / "web" / "public" / "levels"
FAMILIAS_DIR = RAIZ / "web" / "public" / "badges"
LADO = 320

# Las diez claves, en orden. Son las mismas de `ContributionScore.levels`.
CLAVES = ["drop", "spring", "brook", "torrent", "stream",
          "river", "waterfall", "reservoir", "lake", "aquifer"]

# Las familias de `ContributionScore.badgeFamilies` que ya tienen dibujo.
#
# Las de bronce/plata/oro comparten **el mismo dibujo en los tres grados**, y el grado lo
# lleva el aro de color que les pone `BadgeArt`. La alternativa —tres ficheros por
# familia— son 24 imágenes que hay que redibujar cada vez que se toque el estilo.
FAMILIAS = ["pioneer", "discoverer", "firstLight", "sentinel", "cartographer", "drySeason",
            "incidents", "farAway", "offline", "fourSeasons", "counties",
            "guardianLocal", "waterRecovered", "routes", "verifier", "fountainRescued",
            "international", "consistency", "reunion", "teamwork", "incidentResolved"]

# Las especiales de `SpecialBadges.catalogue`. Van a la misma carpeta que las familias
# —el cliente las pide igual, por clave— pero se listan aparte porque no salen de
# `badgeFamilies` y buscarlas ahí cuando falte alguna sería perder el rato.
#
# Éstas sí pueden tener dibujo propio sin discusión: no tienen bronce/plata/oro, así que
# una imagen es exactamente lo que hace falta.
ESPECIALES = ["catalonia", "betatester"]

# Para poder pasar los ficheros tal como los escupe el generador.
ALIAS = {
    "gota": "drop", "manantial": "spring", "arroyo": "brook",
    "torrente": "torrent", "riachuelo": "stream", "rio": "river",
    "río": "river", "cascada": "waterfall", "embalse": "reservoir",
    "lago": "lake", "acuifero": "aquifer", "acuífero": "aquifer",
    # El generador escupe el nombre a veces en inglés, a veces en castellano y a veces
    # con una errata. Se aceptan los tres para no tener que renombrar a mano.
    "pionero": "pioneer", "pionera": "pioneer", "pionner": "pioneer",
    "centinel": "sentinel", "centinela": "sentinel",
    "estiaje": "drySeason", "dryseason": "drySeason",
    "photographer": "firstLight", "firstlight": "firstLight", "primeraluz": "firstLight",
    "descubridor": "discoverer", "cartografo": "cartographer", "cartógrafo": "cartographer",
    "comarcas": "counties", "counties": "counties",
    "incidence": "incidents", "incidencia": "incidents", "incidents": "incidents",
    # El generador lo llamó «farway»; la familia es `farAway`.
    "farway": "farAway", "faraway": "farAway", "outside": "farAway", "lejos": "farAway",
    "cuatroestaciones": "fourSeasons", "fourseasons": "fourSeasons",
    # La insignia se dibujó como «catalunya» y la clave del catálogo es `catalonia`
    # (el resto de claves están en inglés). Se acepta el nombre del dibujo para no
    # tener que renombrar a mano cada vez que se rehaga.
    "catalunya": "catalonia", "cataluña": "catalonia", "catalonia": "catalonia",
    "betatester": "betatester", "beta": "betatester",
}


def destino_de(clave: str) -> Path:
    return NIVELES if clave in CLAVES else FAMILIAS_DIR


def conocidas() -> list[str]:
    return CLAVES + FAMILIAS + ESPECIALES


def clave_de(ruta: Path) -> str | None:
    tallo = ruta.stem.lower()
    for prefijo in ("nivel_", "nivel-", "badge_", "badge-", "insignia_", "insignia-"):
        tallo = tallo.replace(prefijo, "")
    if tallo in conocidas():
        return tallo
    # Las claves en camelCase (`guardianLocal`, `waterRecovered`) no sobreviven al
    # `.lower()` de arriba. Se comparan de nuevo sin distinguir mayúsculas, o reprocesar
    # una insignia ya guardada —que es como se llama el fichero— falla sin motivo.
    for clave in conocidas():
        if clave.lower() == tallo:
            return clave
    return ALIAS.get(tallo)


def recorta_fondo(img: Image.Image) -> Image.Image:
    """Vuelve transparente el fondo blanco, si lo tiene.

    El generador a veces devuelve la insignia sobre un blanco opaco y a veces con
    alfa. Sobre el tema oscuro, la opaca sale como un **recuadro blanco** alrededor
    del escudo, que es de lo primero que se ve.

    Es un relleno por inundación **desde el borde**, no un «haz transparente todo lo
    blanco»: dentro del dibujo hay blancos legítimos —las nubes del acuífero, la
    espuma de la cascada, los brillos del agua— y un filtro por color les haría
    agujeros. Inundando desde fuera, lo cerrado por el escudo no se toca.
    """
    if img.getchannel("A").getextrema()[0] < 250:
        return img  # ya trae transparencia: no hay nada que recortar

    ancho, alto = img.size
    pix = img.load()

    def es_fondo(p: tuple[int, int, int, int]) -> bool:
        r, g, b, _ = p
        # Casi blanco y casi gris: el fondo del generador es 251-253 en los tres canales.
        return min(r, g, b) >= 232 and max(r, g, b) - min(r, g, b) <= 14

    visto = bytearray(ancho * alto)
    pila = []
    for x in range(ancho):
        for y in (0, alto - 1):
            pila.append((x, y))
    for y in range(alto):
        for x in (0, ancho - 1):
            pila.append((x, y))

    while pila:
        x, y = pila.pop()
        if x < 0 or y < 0 or x >= ancho or y >= alto:
            continue
        i = y * ancho + x
        if visto[i]:
            continue
        if not es_fondo(pix[x, y]):
            continue
        visto[i] = 1
        pila += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]

    borrados = sum(visto)
    if borrados == 0:
        return img
    for y in range(alto):
        fila = y * ancho
        for x in range(ancho):
            if visto[fila + x]:
                r, g, b, _ = pix[x, y]
                pix[x, y] = (r, g, b, 0)
    return img


def prepara(origen: Path, clave: str) -> None:
    img = Image.open(origen).convert("RGBA")
    # El recorte va ANTES de reducir: al escalar con LANCZOS, el canal alfa se
    # suaviza con el resto y el borde del escudo queda limpio. Recortando después,
    # sobre 320 px, se queda un halo blanco de un píxel.
    img = recorta_fondo(img)
    img.thumbnail((LADO, LADO), Image.LANCZOS)

    # Cuantizar a 256 colores baja el peso a menos de la mitad y en un dibujo con
    # degradados suaves no se nota a este tamaño. `method=2` (mediancut) conserva
    # mejor los metales que el algoritmo por defecto.
    plano = img.convert("RGB").quantize(colors=255, method=2)
    plano = plano.convert("RGBA")
    # `quantize` se come el canal alfa, así que se vuelve a poner el original: sin
    # esto la insignia sale con un cuadrado negro alrededor.
    plano.putalpha(img.getchannel("A"))

    destino = destino_de(clave)
    destino.mkdir(parents=True, exist_ok=True)
    salida = destino / f"{clave}.png"
    plano.save(salida, "PNG", optimize=True)
    antes = origen.stat().st_size / 1024
    despues = salida.stat().st_size / 1024
    print(f"  {clave:10s} {antes:8.0f} KB → {despues:6.0f} KB   {salida.relative_to(RAIZ)}")


def main(args: list[str]) -> int:
    if not args:
        print(__doc__)
        return 1

    # Forma `<fichero> <clave>` o solo ficheros, deduciendo la clave del nombre.
    parejas: list[tuple[Path, str]] = []
    if len(args) == 2 and (args[1] in CLAVES or args[1] in FAMILIAS):
        parejas.append((Path(args[0]).expanduser(), args[1]))
    else:
        for a in args:
            ruta = Path(a).expanduser()
            clave = clave_de(ruta)
            if clave is None:
                print(f"  ! {ruta.name}: no sé qué insignia es. "
                      f"Pásalo como «{ruta.name} <clave>» o renómbralo a una de: "
                      f"{', '.join(CLAVES + FAMILIAS)}")
                continue
            parejas.append((ruta, clave))

    if not parejas:
        return 1
    for origen, clave in parejas:
        if not origen.exists():
            print(f"  ! no existe: {origen}")
            continue
        prepara(origen, clave)

    hechas = sorted(p.stem for p in NIVELES.glob("*.png")) if NIVELES.exists() else []
    faltan = [c for c in CLAVES if c not in hechas]
    print(f"\nNiveles {len(hechas)}/10.", "Faltan: " + ", ".join(faltan) if faltan else "Completo.")
    print("Recuerda añadir la clave a LEVEL_BADGES o BADGE_ART en web/src/lib/levelBadges.ts.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
