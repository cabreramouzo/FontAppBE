#!/usr/bin/env python3
"""
Genera un cartell per poble a partir de `cartell-a5.html`, cadascun amb el seu codi
(`fontapp.net/?p=castellcir`). Així saps quin cartell ha portat cada usuari: al panell
d'administració, secció "D'on venen (cartells)".

Per defecte genera el cartell A5 original, que gasta poca tinta. `--marketing` genera una
variant independent del mateix disseny amb la il·lustració de FontApp a la capçalera.
`--mini` genera un full A4 amb SIS targetes idèntiques (2×3) per retallar: text mínim, QR
gran i poca tinta, pensat per repartir a mà i posar als parabrises en trobades de la FEEC.
Cap opció sobreescriu els cartells de les altres (cada una té la seva carpeta).

Ús:
    pip3 install segno
    python3 flyer/genera-cartells.py castellcir moia lestany calders
    python3 flyer/genera-cartells.py --marketing castellcir moia
    python3 flyer/genera-cartells.py --mini feec        # 6 targetes A4 amb ?p=feec

Deixa els originals a `flyer/pobles/cartell-<codi>.html` i els de màrqueting a
`flyer/pobles-marketing/cartell-<codi>.html`. Per convertir-los a PDF, sense
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
import base64
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
PLANTILLA_MARKETING = ARREL / "cartell-a5-marketing.html"
PLANTILLA_MINI = ARREL / "cartell-mini.html"
IMATGE_MARKETING = ARREL.parent / "web" / "public" / "welcome.jpg"
SORTIDA = ARREL / "pobles"
SORTIDA_MARKETING = ARREL / "pobles-marketing"
SORTIDA_MINI = ARREL / "pobles-mini"


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


def imatge_data_uri(ruta: pathlib.Path) -> str:
    """Incrusta la imatge perquè l'HTML es pugui enviar tot sol a la impremta."""
    if not ruta.is_file():
        sys.exit(f"No trobo la imatge de la variant de màrqueting: {ruta}")
    return "data:image/jpeg;base64," + base64.b64encode(ruta.read_bytes()).decode("ascii")


def genera(codi: str, marketing: bool = False, mini: bool = False) -> pathlib.Path:
    # El full mini fa servir una ruta curta (`fontapp.net/cartell-mini` → `?p=cartell-mini`,
    # a web/public/_redirects) en comptes del paràmetre llarg: el QR queda net i, si de cas,
    # l'adreça es pot teclejar. La resta de cartells segueixen amb `?p=<codi>`.
    url = f"{BASE}/cartell-mini" if mini else f"{BASE}/?p={codi}"
    plantilla_fitxer = PLANTILLA_MINI if mini else (PLANTILLA_MARKETING if marketing else PLANTILLA)
    plantilla = plantilla_fitxer.read_text(encoding="utf-8")

    # 1) Substitueix el QR. El cartell A5 en té un; el full mini en té SIS (una targeta per
    #    retallar), i totes duen el mateix codi, així que aquí es reemplacen tots
    #    (`count=0`) i no només el primer.
    nou_qr = qr_svg(url)
    plantilla = re.sub(
        r'<svg xmlns="http://www\.w3\.org/2000/svg" viewBox="0 0 290 290">.*?</svg>',
        lambda _: nou_qr,
        plantilla,
        count=0 if mini else 1,
        flags=re.S,
    )
    if marketing:
        plantilla = plantilla.replace("{{IMATGE_FONTAPP}}", imatge_data_uri(IMATGE_MARKETING))
    # L'adreça escrita es queda en `fontapp.net`, SENSE el codi. El codi només viatja
    # dins del QR: `fontapp.net/?p=castelltercol` és massa llarg per teclejar-lo bé, i qui
    # el copia malament acaba a una pàgina que no existeix. Es perd l'atribució de qui
    # escriu l'adreça a mà — assumit: són molt pocs comparats amb els que escanegen.

    sortida = SORTIDA_MINI if mini else (SORTIDA_MARKETING if marketing else SORTIDA)
    sortida.mkdir(exist_ok=True)
    desti = sortida / ("cartell-mini.html" if mini else f"cartell-{codi}.html")
    desti.write_text(plantilla, encoding="utf-8")
    return desti


if __name__ == "__main__":
    arguments = sys.argv[1:]
    marketing = "--marketing" in arguments
    mini = "--mini" in arguments
    desconegudes = [a for a in arguments if a.startswith("--") and a not in ("--marketing", "--mini")]
    if desconegudes:
        sys.exit(f"Opció desconeguda: {desconegudes[0]}")
    if marketing and mini:
        sys.exit("--marketing i --mini són dissenys diferents: fes-los en dues passades.")
    # El full mini és una peça única de campanya `cartell-mini` (no per poble): no cal codi.
    if mini:
        desti = genera("cartell-mini", mini=True)
        print(f"  ✓ {desti.relative_to(ARREL.parent)}  →  {BASE}/cartell-mini")
        sys.exit(0)
    codis = [c.strip().lower() for c in arguments if not c.startswith("--") and c.strip()]
    if not codis:
        sys.exit(
            "Digues els codis dels pobles. Exemple:\n"
            "  python3 flyer/genera-cartells.py castellcir moia\n"
            "  python3 flyer/genera-cartells.py --marketing castellcir moia\n"
            "  python3 flyer/genera-cartells.py --mini        # 6 targetes A4 (cartell-mini)"
        )
    for codi in codis:
        # Mateixa neteja que fa el servidor: només lletres, números i guions.
        net = re.sub(r"[^a-z0-9_-]", "", codi)
        if not net:
            print(f"  ✗ «{codi}» no té cap caràcter vàlid, el salto")
            continue
        print(f"  ✓ {genera(net, marketing, mini).relative_to(ARREL.parent)}  →  {BASE}/?p={net}")
