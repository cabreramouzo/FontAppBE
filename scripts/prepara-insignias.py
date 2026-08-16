#!/usr/bin/env python3
"""Prepara las insignias de nivel para la web.

Las imágenes salen del generador a ~1250 px y ~2 MB cada una. Diez de esas son
19 MB de assets para algo que se ve a 120 px: hay que escalarlas y comprimirlas
antes de que entren al repositorio.

    python3 scripts/prepara-insignias.py ~/Downloads/nivel_gota.png drop
    python3 scripts/prepara-insignias.py ~/Downloads/*.png          # por nombre

Sin dependencias fuera de Pillow (`pip install pillow`), porque en esta máquina no
hay pngquant ni ImageMagick.

Salida: `web/public/levels/<clave>.png`, 320 px y paleta de 256 colores. Se sirve
desde `public/` y no desde `src/assets/` a propósito: así se descarga **solo la
insignia del nivel que toca** en vez de empaquetar el megabyte entero. Como
`public/` no lleva hash en el nombre, `LevelBadge` le añade `?v=N` — si algún día
se redibuja una, hay que subir esa versión o el service worker seguirá sirviendo
la vieja.
"""
# El python3 del sistema es el 3.9 y ahí `str | None` en una firma revienta al
# importar el módulo, no al llamarlo.
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "web" / "public" / "levels"
LADO = 320

# Las diez claves, en orden. Son las mismas de `ContributionScore.levels`.
CLAVES = ["drop", "spring", "brook", "torrent", "stream",
          "river", "waterfall", "reservoir", "lake", "aquifer"]

# Para poder pasar los ficheros tal como los escupe el generador.
ALIAS = {
    "gota": "drop", "manantial": "spring", "arroyo": "brook",
    "torrente": "torrent", "riachuelo": "stream", "rio": "river",
    "río": "river", "cascada": "waterfall", "embalse": "reservoir",
    "lago": "lake", "acuifero": "aquifer", "acuífero": "aquifer",
}


def clave_de(ruta: Path) -> str | None:
    tallo = ruta.stem.lower().replace("nivel_", "").replace("nivel-", "")
    if tallo in CLAVES:
        return tallo
    return ALIAS.get(tallo)


def prepara(origen: Path, clave: str) -> None:
    img = Image.open(origen).convert("RGBA")
    img.thumbnail((LADO, LADO), Image.LANCZOS)

    # Cuantizar a 256 colores baja el peso a menos de la mitad y en un dibujo con
    # degradados suaves no se nota a este tamaño. `method=2` (mediancut) conserva
    # mejor los metales que el algoritmo por defecto.
    plano = img.convert("RGB").quantize(colors=255, method=2)
    plano = plano.convert("RGBA")
    # `quantize` se come el canal alfa, así que se vuelve a poner el original: sin
    # esto la insignia sale con un cuadrado negro alrededor.
    plano.putalpha(img.getchannel("A"))

    DESTINO.mkdir(parents=True, exist_ok=True)
    salida = DESTINO / f"{clave}.png"
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
    if len(args) == 2 and args[1] in CLAVES:
        parejas.append((Path(args[0]).expanduser(), args[1]))
    else:
        for a in args:
            ruta = Path(a).expanduser()
            clave = clave_de(ruta)
            if clave is None:
                print(f"  ! {ruta.name}: no sé de qué nivel es. "
                      f"Pásalo como «{ruta.name} <clave>» o renómbralo a una de: "
                      f"{', '.join(CLAVES)}")
                continue
            parejas.append((ruta, clave))

    if not parejas:
        return 1
    for origen, clave in parejas:
        if not origen.exists():
            print(f"  ! no existe: {origen}")
            continue
        prepara(origen, clave)

    hechas = sorted(p.stem for p in DESTINO.glob("*.png")) if DESTINO.exists() else []
    faltan = [c for c in CLAVES if c not in hechas]
    print(f"\nHechas {len(hechas)}/10.", "Faltan: " + ", ".join(faltan) if faltan else "Completo.")
    print("Recuerda añadir la clave a LEVEL_BADGES en web/src/lib/levelBadges.ts.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
