from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, FloatObject, NameObject
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import HexColor, white
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


ROOT = Path("/Users/mac/src/FontAppBE")
OUT = ROOT / "output" / "pdf"
RAW_PDF = ROOT / "tmp" / "pdfs" / "fontapp-restaurant-card-welcome-raw.pdf"
FINAL_PDF = OUT / "fontapp-restaurant-card-welcome.pdf"
WELCOME = ROOT / "web" / "dist" / "welcome.jpg"
LOGO = ROOT / "web" / "public" / "icon-512.png"

PAGE_W = 91 * mm
PAGE_H = 61 * mm
TRIM = 3 * mm

INK = HexColor("#432B24")
TEAL = HexColor("#148F9D")
TEAL_LIGHT = HexColor("#D9F0EE")
TERRACOTTA = HexColor("#C96F3D")
MUTED = HexColor("#765F54")
PAPER = HexColor("#FFF9EA")
CARD = HexColor("#FFFDF6")


def draw_cover_image(c: canvas.Canvas, image_path: Path,
                     x: float, y: float, width: float, height: float) -> None:
    image = ImageReader(str(image_path))
    source_width, source_height = image.getSize()
    scale = max(width / source_width, height / source_height)
    drawn_width = source_width * scale
    drawn_height = source_height * scale
    path = c.beginPath()
    path.rect(x, y, width, height)
    c.saveState()
    c.clipPath(path, stroke=0, fill=0)
    c.drawImage(
        image,
        x + (width - drawn_width) / 2,
        y + (height - drawn_height) / 2,
        drawn_width,
        drawn_height,
        preserveAspectRatio=True,
    )
    c.restoreState()


def step(c: canvas.Canvas, x: float, y: float, width: float, label: str, number: str) -> None:
    c.setFillColor(CARD)
    c.roundRect(x, y, width, 9.2 * mm, 2.2 * mm, fill=1, stroke=0)
    c.setFillColor(TEAL_LIGHT)
    c.circle(x + width / 2, y + 6.0 * mm, 1.85 * mm, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.setFont("Helvetica-Bold", 5.0)
    c.drawCentredString(x + width / 2, y + 5.35 * mm, number)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 4.55)
    c.drawCentredString(x + width / 2, y + 1.85 * mm, label)


def draw_qr(c: canvas.Canvas, url: str, x: float, y: float, size: float) -> None:
    widget = qr.QrCodeWidget(url, barLevel="H")
    bounds = widget.getBounds()
    drawing = Drawing(size, size, transform=[
        size / (bounds[2] - bounds[0]), 0,
        0, size / (bounds[3] - bounds[1]), 0, 0,
    ])
    drawing.add(widget)
    drawing.drawOn(c, x, y)


def build() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    RAW_PDF.parent.mkdir(parents=True, exist_ok=True)

    c = canvas.Canvas(str(RAW_PDF), pagesize=(PAGE_W, PAGE_H), pageCompression=1)
    c.setTitle("FontApp - tarjeta para restaurantes - welcome")
    c.setAuthor("FontApp")
    c.setSubject("Mapa colaborativo de fuentes publicas")

    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    draw_cover_image(c, WELCOME, 0, 0, 31.3 * mm, PAGE_H)

    # A narrow terracotta seam connects the warm illustration to the information panel.
    c.setFillColor(TERRACOTTA)
    c.rect(31.3 * mm, 0, 1.0 * mm, PAGE_H, fill=1, stroke=0)

    c.drawImage(ImageReader(str(LOGO)), 35.0 * mm, 50.2 * mm, 6.3 * mm, 6.3 * mm,
                preserveAspectRatio=True, mask="auto")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(42.8 * mm, 51.6 * mm, "FontApp")

    c.setFont("Helvetica-Bold", 14.2)
    c.drawString(35.0 * mm, 43.0 * mm, "¿Agua cerca?")
    c.setFillColor(TEAL)
    c.setFont("Helvetica-Bold", 8.7)
    c.drawString(35.0 * mm, 38.8 * mm, "Encuentra una fuente pública.")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 5.8)
    c.drawString(35.0 * mm, 35.0 * mm, "Mapa colaborativo.")
    c.drawString(35.0 * mm, 32.5 * mm, "Fuentes públicas al día.")

    step_y = 18.2 * mm
    step(c, 35.0 * mm, step_y, 9.7 * mm, "BUSCA", "1")
    step(c, 45.8 * mm, step_y, 9.7 * mm, "COMPRUEBA", "2")
    step(c, 56.6 * mm, step_y, 9.7 * mm, "COMPARTE", "3")

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 5.15)
    c.drawString(35.0 * mm, 13.7 * mm, "Estado del agua · potabilidad · última revisión")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 5.05)
    c.drawString(35.0 * mm, 8.3 * mm, "GRATIS  ·  SIN INSTALAR  ·  SIN COBERTURA")

    qr_x, qr_y, qr_size = 69.5 * mm, 20.5 * mm, 16.2 * mm
    c.setFillColor(white)
    c.roundRect(qr_x - 1.4 * mm, qr_y - 1.4 * mm,
                qr_size + 2.8 * mm, qr_size + 2.8 * mm,
                2.0 * mm, fill=1, stroke=0)
    draw_qr(c, "https://fontapp.net/?p=restaurant", qr_x, qr_y, qr_size)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 6.5)
    c.drawCentredString(qr_x + qr_size / 2, 42.0 * mm, "ESCANEA")
    c.setFont("Helvetica-Bold", 5.4)
    c.drawCentredString(qr_x + qr_size / 2, 18.0 * mm, "ABRE EL MAPA")
    c.setFillColor(TEAL)
    c.setFont("Helvetica-Bold", 7.2)
    c.drawCentredString(qr_x + qr_size / 2, 13.9 * mm, "fontapp.net")

    c.showPage()
    c.save()

    reader = PdfReader(str(RAW_PDF))
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    page = writer.pages[0]
    page[NameObject("/TrimBox")] = ArrayObject([
        FloatObject(TRIM), FloatObject(TRIM),
        FloatObject(PAGE_W - TRIM), FloatObject(PAGE_H - TRIM),
    ])
    page[NameObject("/BleedBox")] = ArrayObject([
        FloatObject(0), FloatObject(0), FloatObject(PAGE_W), FloatObject(PAGE_H),
    ])
    with FINAL_PDF.open("wb") as stream:
        writer.write(stream)


if __name__ == "__main__":
    build()
