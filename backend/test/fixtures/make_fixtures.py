#!/usr/bin/env python3
"""Gera os arquivos SINTETICOS usados nos testes (nenhum documento real).

Uso: python3 test/fixtures/make_fixtures.py   (a partir de backend/)
Requer: python-docx, python-pptx, Pillow (so para gerar; os testes usam os arquivos
gerados, que ficam versionados).

- relatorio.docx     2 paginas, cabecalho com imagem, tabela, imagem no corpo,
                     acentuacao (portugues), lista e rodape: serve pra conferir a
                     APARENCIA da conversao Word -> PDF, nao so se gerou um arquivo.
- apresentacao.pptx  2 slides com titulo acentuado, tabela e imagem.
- digitalizado.pdf   PDF so com imagem (simula documento escaneado, sem texto).
- foto-rotacionada.jpg  JPEG 300x200 com EXIF Orientation=6 (celular "deitado").
- transparente.png   PNG RGBA com area transparente.
- imagem.webp        WebP 120x80.
"""
import io
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))


def font(size):
    for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                 "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def logo_png(w=360, h=90):
    img = Image.new("RGB", (w, h), (232, 93, 4))  # laranja
    d = ImageDraw.Draw(img)
    d.text((18, 22), "COOPERATIVA TESTE", fill="white", font=font(34))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    buf.seek(0)
    return buf


def chart_png(w=480, h=240):
    img = Image.new("RGB", (w, h), "white")
    d = ImageDraw.Draw(img)
    values = [60, 120, 90, 180, 150]
    for i, v in enumerate(values):
        x = 40 + i * 85
        d.rectangle([x, h - 30 - v, x + 50, h - 30], fill=(0, 102, 170))
    d.line([30, h - 30, w - 10, h - 30], fill="black", width=2)
    d.text((40, 10), "Produção mensal (t)", fill="black", font=font(18))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    buf.seek(0)
    return buf


def make_docx():
    import docx
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Inches, Pt, RGBColor

    doc = docx.Document()
    section = doc.sections[0]
    header = section.header.paragraphs[0]
    header.add_run().add_picture(logo_png(), width=Inches(2.0))
    header.add_run("   Documento sintético para homologação")
    footer = section.footer.paragraphs[0]
    footer.text = "Rodapé — uso interno — página de teste"
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.add_heading("Relatório de Produção — Unidade São João", level=1)
    p = doc.add_paragraph()
    run = p.add_run("Acentuação: ação, coração, pinhão, açúcar, órgão, você, à, ü, ñ, ç. ")
    run.font.size = Pt(12)
    p.add_run("Texto em negrito.").bold = True
    p.add_run(" Texto em itálico vermelho.").font.color.rgb = RGBColor(0xC0, 0x00, 0x00)

    doc.add_paragraph("Primeiro item da lista", style="List Bullet")
    doc.add_paragraph("Segundo item — com travessão", style="List Bullet")

    table = doc.add_table(rows=4, cols=3)
    table.style = "Table Grid"
    rows = [("Mês", "Produção (t)", "Situação"),
            ("Janeiro", "1.250,5", "Concluído"),
            ("Fevereiro", "1.180,0", "Em revisão"),
            ("Março", "1.402,7", "Aprovação pendente")]
    for r, values in enumerate(rows):
        for c, value in enumerate(values):
            table.cell(r, c).text = value
    for cell in table.rows[0].cells:
        cell.paragraphs[0].runs[0].bold = True

    doc.add_paragraph()
    doc.add_picture(chart_png(), width=Inches(4.5))
    doc.add_paragraph("Figura 1 — gráfico de barras gerado para o teste.")

    doc.add_page_break()
    doc.add_heading("Segunda página", level=2)
    doc.add_paragraph("Conteúdo da segunda página, para conferir a quebra e o cabeçalho repetido.")
    doc.save(os.path.join(HERE, "relatorio.docx"))


def make_pptx():
    from pptx import Presentation
    from pptx.util import Inches, Pt

    prs = Presentation()
    s1 = prs.slides.add_slide(prs.slide_layouts[0])
    s1.shapes.title.text = "Apresentação de Resultados — Safra 2026"
    s1.placeholders[1].text = "Slide sintético com acentuação: ação, gestão, logística"

    s2 = prs.slides.add_slide(prs.slide_layouts[5])
    s2.shapes.title.text = "Indicadores por região"
    shape = s2.shapes.add_table(3, 3, Inches(0.5), Inches(1.6), Inches(5), Inches(1.2))
    data = [("Região", "Volume", "Variação"), ("Oeste", "320", "+4,5%"), ("Sudoeste", "210", "−1,2%")]
    for r, values in enumerate(data):
        for c, value in enumerate(values):
            shape.table.cell(r, c).text = value
            shape.table.cell(r, c).text_frame.paragraphs[0].runs[0].font.size = Pt(14)
    s2.shapes.add_picture(chart_png(), Inches(5.7), Inches(1.6), width=Inches(3.8))
    prs.save(os.path.join(HERE, "apresentacao.pptx"))


def make_scanned_pdf():
    img = Image.new("RGB", (1240, 1754), "white")  # A4 a 150 dpi
    d = ImageDraw.Draw(img)
    d.text((120, 160), "DOCUMENTO DIGITALIZADO (imagem)", fill="black", font=font(48))
    for i in range(12):
        d.text((120, 320 + i * 80), f"Linha {i + 1} de texto que existe so como pixels.", fill="black", font=font(32))
    img.save(os.path.join(HERE, "digitalizado.pdf"), "PDF", resolution=150)


def make_images():
    img = Image.new("RGB", (300, 200), (30, 120, 200))
    ImageDraw.Draw(img).text((20, 80), "TOPO", fill="white", font=font(40))
    exif = Image.Exif()
    exif[0x0112] = 6  # Orientation: girar 90° horário ao exibir
    img.save(os.path.join(HERE, "foto-rotacionada.jpg"), "JPEG", quality=90, exif=exif.tobytes())

    rgba = Image.new("RGBA", (160, 100), (0, 0, 0, 0))
    ImageDraw.Draw(rgba).ellipse([20, 10, 140, 90], fill=(0, 160, 80, 255))
    rgba.save(os.path.join(HERE, "transparente.png"), "PNG")

    Image.new("RGB", (120, 80), (200, 40, 40)).save(os.path.join(HERE, "imagem.webp"), "WEBP", quality=80)


if __name__ == "__main__":
    make_docx()
    make_pptx()
    make_scanned_pdf()
    make_images()
    print("fixtures geradas em", HERE)
