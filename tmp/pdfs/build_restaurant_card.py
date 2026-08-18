from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, FloatObject, NameObject
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import HexColor, white
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader


ROOT = Path("/Users/mac/src/FontAppBE")
OUT = ROOT / "output" / "pdf"
ASSETS = OUT / "assets"
RAW_PDF = ROOT / "tmp" / "pdfs" / "fontapp-restaurant-card-raw.pdf"
FINAL_PDF = OUT / "fontapp-restaurant-card.pdf"
ILLUSTRATION = ASSETS / "fontapp-restaurant-illustration.png"
LOGO = ROOT / "web" / "public" / "icon-512.png"

PAGE_W = 91 * mm  # 85 x 55 mm trim plus 3 mm bleed on every side
PAGE_H = 61 * mm
TRIM = 3 * mm

CYAN = HexColor("#0EA5E9")
PALE_CYAN = HexColor("#DDF4FD")
NAVY = HexColor("#17324D")
MUTED = HexColor("#557086")
PAPER = HexColor("#F7FCFE")
SAGE = HexColor("#A8CF8D")


def rounded_label(c: canvas.Canvas, x: float, y: float, width: float, text: str) -> None:
    c.setFillColor(white)
    c.roundRect(x, y, width, 8.7 * mm, 2.3 * mm, fill=1, stroke=0)
    c.setFillColor(PALE_CYAN)
    c.circle(x + width / 2, y + 5.7 * mm, 1.75 * mm, fill=1, stroke=0)
    c.setFillColor(CYAN)
    c.circle(x + width / 2, y + 5.7 * mm, 0.72 * mm, fill=1, stroke=0)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 4.6)
    c.drawCentredString(x + width / 2, y + 1.85 * mm, text)


def draw_qr(c: canvas.Canvas, url: str, x: float, y: float, size: float) -> None:
    widget = qr.QrCodeWidget(url, barLevel="H")
    bounds = widget.getBounds()
    drawing = Drawing(size, size, transform=[size / (bounds[2] - bounds[0]), 0,
                                             0, size / (bounds[3] - bounds[1]), 0, 0])
    drawing.add(widget)
    drawing.drawOn(c, x, y)


def build_pdf() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)

    c = canvas.Canvas(str(RAW_PDF), pagesize=(PAGE_W, PAGE_H), pageCompression=1)
    c.setTitle("FontApp - tarjeta para restaurantes")
    c.setAuthor("FontApp")
    c.setSubject("Mapa colaborativo de fuentes publicas")

    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    # A soft brand field lets the generated illustration bleed off the trim edge.
    c.setFillColor(PALE_CYAN)
    c.circle(8 * mm, 31 * mm, 28 * mm, fill=1, stroke=0)
    c.setFillColor(SAGE)
    c.setFillAlpha(0.20)
    c.circle(19 * mm, 5 * mm, 15 * mm, fill=1, stroke=0)
    c.setFillAlpha(1)

    illustration = ImageReader(str(ILLUSTRATION))
    c.drawImage(illustration, -0.5 * mm, 3.0 * mm, 32 * mm, 48 * mm,
                preserveAspectRatio=True, anchor="c", mask="auto")

    # Brand lockup.
    c.drawImage(ImageReader(str(LOGO)), 33.2 * mm, 50.2 * mm, 6.3 * mm, 6.3 * mm,
                preserveAspectRatio=True, mask="auto")
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(41.0 * mm, 51.6 * mm, "FontApp")

    # Main message.
    c.setFont("Helvetica-Bold", 14.2)
    c.drawString(33.2 * mm, 43.0 * mm, "¿Agua cerca?")
    c.setFillColor(CYAN)
    c.setFont("Helvetica-Bold", 8.7)
    c.drawString(33.2 * mm, 38.8 * mm, "Encuentra una fuente pública.")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 5.8)
    c.drawString(33.2 * mm, 35.0 * mm, "Mapa colaborativo.")
    c.drawString(33.2 * mm, 32.5 * mm, "Fuentes públicas al día.")

    # Three-step micro infographic.
    step_y = 18.2 * mm
    step_w = 9.8 * mm
    rounded_label(c, 33.2 * mm, step_y, step_w, "BUSCA")
    rounded_label(c, 44.2 * mm, step_y, step_w, "COMPRUEBA")
    rounded_label(c, 55.2 * mm, step_y, step_w, "COMPARTE")

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 5.2)
    c.drawString(33.2 * mm, 13.7 * mm, "Estado del agua · potabilidad · última revisión")
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 5.2)
    c.drawString(33.2 * mm, 8.3 * mm, "GRATIS  ·  SIN INSTALAR  ·  SIN COBERTURA")

    # Scan block, kept well inside the trim safe area.
    qr_x, qr_y, qr_size = 69.1 * mm, 20.5 * mm, 16.5 * mm
    c.setFillColor(white)
    c.roundRect(qr_x - 1.4 * mm, qr_y - 1.4 * mm,
                qr_size + 2.8 * mm, qr_size + 2.8 * mm,
                2.0 * mm, fill=1, stroke=0)
    draw_qr(c, "https://fontapp.net/?p=restaurant", qr_x, qr_y, qr_size)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 6.5)
    c.drawCentredString(qr_x + qr_size / 2, 42.0 * mm, "ESCANEA")
    c.setFont("Helvetica-Bold", 5.4)
    c.drawCentredString(qr_x + qr_size / 2, 18.0 * mm, "ABRE EL MAPA")
    c.setFillColor(CYAN)
    c.setFont("Helvetica-Bold", 7.2)
    c.drawCentredString(qr_x + qr_size / 2, 13.9 * mm, "fontapp.net")

    c.showPage()
    c.save()

    # Add print-production boxes: 91 x 61 mm bleed, 85 x 55 mm trim.
    reader = PdfReader(str(RAW_PDF))
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    page = writer.pages[0]
    trim_box = ArrayObject([
        FloatObject(TRIM), FloatObject(TRIM),
        FloatObject(PAGE_W - TRIM), FloatObject(PAGE_H - TRIM),
    ])
    bleed_box = ArrayObject([
        FloatObject(0), FloatObject(0), FloatObject(PAGE_W), FloatObject(PAGE_H),
    ])
    page[NameObject("/TrimBox")] = trim_box
    page[NameObject("/BleedBox")] = bleed_box
    with FINAL_PDF.open("wb") as stream:
        writer.write(stream)


if __name__ == "__main__":
    build_pdf()
