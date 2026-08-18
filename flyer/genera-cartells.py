#!/usr/bin/env python3
"""
Genera un cartell per poble a partir de `cartell-a5.html`, cadascun amb el seu codi
(`fontapp.net/?p=castellcir`). Així saps quin cartell ha portat cada usuari: al panell
d'administració, secció "D'on venen (cartells)".

Ús:
    pip3 install segno
    python3 flyer/genera-cartells.py castellcir moia lestany calders

Deixa els fitxers a `flyer/pobles/cartell-<codi>.html`. Per convertir-los a PDF, sense
obrir el navegador ni tocar cap diàleg d'impressió:

    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\
      --headless --disable-gpu --no-pdf-header-footer \\
      --print-to-pdf=cartell-castelltercol.pdf \\
      "file://$PWD/flyer/pobles/cartell-castelltercol.html"

Comprova que cada cartell porta el SEU codi (l'adreça impresa és `fontapp.net` a
seques, així que el QR és l'única cosa que el duu):

    swiftc -O flyer/llegeix-qr.swift -o /tmp/llegeix-qr
    /tmp/llegeix-qr flyer/pobles/*.pdf

Comprova SEMPRE el PDF resultant: el cartell té l'alçada fixada a 210 mm i Chrome no
pagina, **retalla**. Si hi afegeixes una línia i el peu desapareix, el problema és aquest
i es resol traient espai a `ul.punts` (margin) o a `ul.punts li` (margin-bottom).
"""
import pathlib
import re
import sys

try:
    import segno
except ImportError:
    sys.exit("Falta la llibreria segno. Instal·la-la amb:  pip3 install segno")

BASE = "https://fontapp.net"
ARREL = pathlib.Path(__file__).parent
PLANTILLA = ARREL / "cartell-a5.html"
SORTIDA = ARREL / "pobles"


def qr_svg(url: str) -> str:
    """Dibuix del QR llest per encastar.

    segno escriu el <svg> amb `width`/`height` en píxels i SENSE `viewBox`. El cartell
    li dona la mida per CSS (30 mm), i sense `viewBox` el dibuix no s'escala: es queda
    a la mida original i el que sobra queda TALLAT. A més, cada URL té la seva llargada,
    i una de més llarga necessita un QR més gran (més mòduls), així que la mida no és
    sempre la mateixa. Per això li posem el `viewBox` amb la mida real d'aquest QR.
    """
    import io
    qr = segno.make(url, error="m")
    buf = io.BytesIO()
    qr.save(buf, kind="svg", scale=10, border=2, dark="#0f172a")
    svg = re.search(r"(<svg.*</svg>)", buf.getvalue().decode(), re.S).group(1)
    width, height = qr.symbol_size(scale=10, border=2)
    return re.sub(
        r"<svg[^>]*>",
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">',
        svg,
        count=1,
    )


def genera(codi: str) -> pathlib.Path:
    url = f"{BASE}/?p={codi}"
    plantilla = PLANTILLA.read_text(encoding="utf-8")

    # 1) Substitueix el QR (l'únic <svg> amb aquest viewBox dins del bloc del codi).
    nou_qr = qr_svg(url)
    plantilla = re.sub(
        r'<svg xmlns="http://www\.w3\.org/2000/svg" viewBox="0 0 290 290">.*?</svg>',
        lambda _: nou_qr,
        plantilla,
        count=1,
        flags=re.S,
    )
    # L'adreça escrita es queda en `fontapp.net`, SENSE el codi. El codi només viatja
    # dins del QR: `fontapp.net/?p=castelltercol` és massa llarg per teclejar-lo bé, i qui
    # el copia malament acaba a una pàgina que no existeix. Es perd l'atribució de qui
    # escriu l'adreça a mà — assumit: són molt pocs comparats amb els que escanegen.

    SORTIDA.mkdir(exist_ok=True)
    desti = SORTIDA / f"cartell-{codi}.html"
    desti.write_text(plantilla, encoding="utf-8")
    return desti


if __name__ == "__main__":
    codis = [c.strip().lower() for c in sys.argv[1:] if c.strip()]
    if not codis:
        sys.exit("Digues els codis dels pobles. Exemple:\n  python3 flyer/genera-cartells.py castellcir moia")
    for codi in codis:
        # Mateixa neteja que fa el servidor: només lletres, números i guions.
        net = re.sub(r"[^a-z0-9_-]", "", codi)
        if not net:
            print(f"  ✗ «{codi}» no té cap caràcter vàlid, el salto")
            continue
        print(f"  ✓ {genera(net).relative_to(ARREL.parent)}  →  {BASE}/?p={net}")
