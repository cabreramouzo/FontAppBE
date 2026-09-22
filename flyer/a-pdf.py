#!/usr/bin/env python3
"""
Converteix els cartells HTML a PDF llestos per a la impremta, i els comprova.

Ús:
    python3 flyer/a-pdf.py                      # tots (la plantilla i tots els pobles)
    python3 flyer/a-pdf.py castelltercol moia   # només aquests
    python3 flyer/a-pdf.py --marketing moia     # variant a color

Deixa cada PDF al costat del seu HTML. No cal obrir el navegador ni tocar cap diàleg
d'impressió: fa servir Chrome sense interfície.

Comprova tres coses de cada PDF, i totes tres han fallat alguna vegada:

  1. **Una sola pàgina i A5 exacte.** El cartell té l'alçada fixada a 210 mm i Chrome no
     pagina: **retalla**. Afegir una línia fa que el peu se'n vagi fora sense donar cap
     error i el PDF continua dient que té una pàgina.
  2. **Que el QR es llegeixi.**
  3. **Que porti el codi del poble** (`?p=castelltercol`). L'adreça impresa és
     `fontapp.net` a seques, així que el QR és l'única cosa que duu el codi: si surt
     malament, aquell poble deixa de comptar al panell i no hi ha cap altra manera
     d'adonar-se'n.

Les comprovacions 2 i 3 necessiten `swiftc` (ve amb les Command Line Tools). Si no hi és,
es fan igualment la 1 i s'avisa que les altres s'han saltat.

Surt amb codi ≠ 0 si algun cartell falla, per poder encadenar-lo:

    python3 flyer/genera-cartells.py moia && python3 flyer/a-pdf.py moia
"""
# Les anotacions com `pathlib.Path | None` són de Python 3.10, i el que ve amb macOS
# és el 3.9. Amb això s'avaluen mai i el script funciona amb el Python del sistema.
from __future__ import annotations

import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

ARREL = pathlib.Path(__file__).parent
POBLES = ARREL / "pobles"
POBLES_MARKETING = ARREL / "pobles-marketing"
POBLES_MINI = ARREL / "pobles-mini"
DECODIFICADOR = ARREL / "llegeix-qr.swift"

NAVEGADORS = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
]


def navegador() -> str:
    for ruta in NAVEGADORS:
        if pathlib.Path(ruta).is_file():
            return ruta
    for nom in ("chromium", "chromium-browser", "google-chrome", "chrome"):
        if trobat := shutil.which(nom):
            return trobat
    sys.exit("No trobo cap navegador basat en Chrome per generar el PDF.")


def a_pdf(html: pathlib.Path, chrome: str) -> pathlib.Path:
    pdf = html.with_suffix(".pdf")
    subprocess.run(
        [chrome, "--headless", "--disable-gpu", "--no-pdf-header-footer",
         f"--print-to-pdf={pdf}", html.resolve().as_uri()],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    return pdf


def mida(pdf: pathlib.Path) -> tuple[int, float, float]:
    """Pàgines i mida en mil·límetres, llegides del PDF mateix."""
    d = pdf.read_bytes()
    pagines = d.count(b"/Type /Page") - d.count(b"/Type /Pages")
    m = re.search(rb"/MediaBox \[([\d\.\s]+)\]", d)
    if not m:
        return pagines, 0, 0
    w, h = [float(x) for x in m.group(1).split()][2:]
    return pagines, w / 72 * 25.4, h / 72 * 25.4


def compila_decodificador() -> pathlib.Path | None:
    if not shutil.which("swiftc") or not DECODIFICADOR.is_file():
        return None
    desti = pathlib.Path(tempfile.gettempdir()) / "llegeix-qr"
    r = subprocess.run(["swiftc", "-O", str(DECODIFICADOR), "-o", str(desti)],
                       capture_output=True)
    return desti if r.returncode == 0 else None


def qr_de(pdf: pathlib.Path, eina: pathlib.Path) -> str | None:
    r = subprocess.run([str(eina), str(pdf)], capture_output=True, text=True)
    m = re.search(r"→ (\S+)", r.stdout)
    # El full mini porta SIS QR idèntics i el decodificador els llista separats per comes
    # (`url, url, …`); n'hi ha prou amb el primer, i sense la coma final.
    return m.group(1).split(",")[0] if m else None


def main() -> int:
    arguments = sys.argv[1:]
    marketing = "--marketing" in arguments
    mini = "--mini" in arguments
    desconegudes = [a for a in arguments if a.startswith("--") and a not in ("--marketing", "--mini")]
    if desconegudes:
        sys.exit(f"Opció desconeguda: {desconegudes[0]}")
    if marketing and mini:
        sys.exit("--marketing i --mini són dissenys diferents: fes-los en dues passades.")
    # El full mini és A4 (6 targetes); els altres, A5. La comprovació de mida ho fa servir.
    esperada = (210, 297) if mini else (148, 210)
    codis = [c.strip().lower() for c in arguments if not c.startswith("--") and c.strip()]
    carpeta = POBLES_MINI if mini else (POBLES_MARKETING if marketing else POBLES)
    if codis:
        htmls = [carpeta / f"cartell-{c}.html" for c in codis]
        if falten := [h for h in htmls if not h.is_file()]:
            noms = ", ".join(h.stem.replace("cartell-", "") for h in falten)
            sys.exit(f"No hi ha cartell per: {noms}\nGenera'l amb:  python3 flyer/genera-cartells.py {noms}")
    else:
        htmls = sorted(carpeta.glob("cartell-*.html"))
        if not marketing and not mini and (base := ARREL / "cartell-a5.html").is_file():
            htmls.insert(0, base)

    chrome = navegador()
    eina = compila_decodificador()
    if eina is None:
        print("⚠  Sense `swiftc`: no es comprovaran els QR, només la mida.\n")

    errors = 0
    for html in htmls:
        pdf = a_pdf(html, chrome)
        pagines, ample, alt = mida(pdf)
        problemes = []
        if pagines != 1:
            problemes.append(f"{pagines} pàgines (el contingut no hi cap: Chrome retalla, no pagina)")
        ew, eh = esperada
        if not (ew - 1 <= ample <= ew + 1 and eh - 1 <= alt <= eh + 1):
            problemes.append(f"{ample:.0f}×{alt:.0f} mm, hauria de ser {ew}×{eh}")

        codi = html.stem.replace("cartell-", "")
        destinacio = ""
        if eina is not None:
            url = qr_de(pdf, eina)
            if url is None:
                problemes.append("el QR no es llegeix")
            else:
                destinacio = f" → {url}"
                # La plantilla base porta el QR sense codi, i està bé. Els pobles i els
                # fulls mini sí que han de dur el seu ?p=codi.
                if html.parent in (POBLES, POBLES_MINI) and not url.endswith(f"?p={codi}"):
                    problemes.append(f"el QR no porta ?p={codi}")

        if problemes:
            errors += 1
            print(f"✗ {pdf.relative_to(ARREL.parent)}{destinacio}")
            for p in problemes:
                print(f"    {p}")
        else:
            print(f"✓ {pdf.relative_to(ARREL.parent)}  ·  1 pàg · {'A4' if mini else 'A5'}{destinacio}")

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
