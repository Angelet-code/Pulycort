from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "04_analisis_y_entregables" / "informes"
PDF_PATH = OUT_DIR / "resumen_ejecutivo_ia_pulycort.pdf"

BLUE = colors.HexColor("#1F4D78")
MID_BLUE = colors.HexColor("#2E74B5")
DARK = colors.HexColor("#172033")
MUTED = colors.HexColor("#5A6678")
LIGHT_BLUE = colors.HexColor("#E8EEF5")
LIGHT_GRAY = colors.HexColor("#F4F6F9")
BORDER = colors.HexColor("#D7DEE8")
GREEN = colors.HexColor("#1F6B4D")
GOLD = colors.HexColor("#7A5A00")
PALE_GOLD = colors.HexColor("#FFF4DD")
WHITE = colors.white
FONT = "ArialEmbed"
FONT_BOLD = "ArialEmbed-Bold"

pdfmetrics.registerFont(TTFont(FONT, "C:\\Windows\\Fonts\\arial.ttf"))
pdfmetrics.registerFont(TTFont(FONT_BOLD, "C:\\Windows\\Fonts\\arialbd.ttf"))


def make_styles():
    base = getSampleStyleSheet()
    return {
        "kicker": ParagraphStyle(
            "Kicker",
            parent=base["Normal"],
            fontName=FONT_BOLD,
            fontSize=11,
            textColor=MUTED,
            leading=14,
            spaceAfter=6,
        ),
        "title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName=FONT_BOLD,
            fontSize=28,
            leading=32,
            textColor=BLUE,
            alignment=TA_LEFT,
            spaceAfter=8,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle",
            parent=base["Normal"],
            fontName=FONT,
            fontSize=14,
            leading=18,
            textColor=DARK,
            spaceAfter=16,
        ),
        "h1": ParagraphStyle(
            "H1",
            parent=base["Heading1"],
            fontName=FONT_BOLD,
            fontSize=15,
            leading=18,
            textColor=MID_BLUE,
            spaceBefore=12,
            spaceAfter=7,
            keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontName=FONT_BOLD,
            fontSize=12.5,
            leading=15,
            textColor=BLUE,
            spaceBefore=9,
            spaceAfter=5,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName=FONT,
            fontSize=9.8,
            leading=13.2,
            textColor=DARK,
            spaceAfter=6,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName=FONT,
            fontSize=8.4,
            leading=11,
            textColor=DARK,
        ),
        "table_header": ParagraphStyle(
            "TableHeader",
            parent=base["BodyText"],
            fontName=FONT_BOLD,
            fontSize=8.2,
            leading=10.2,
            alignment=TA_CENTER,
            textColor=BLUE,
        ),
        "table_cell": ParagraphStyle(
            "TableCell",
            parent=base["BodyText"],
            fontName=FONT,
            fontSize=8,
            leading=10.3,
            textColor=DARK,
        ),
        "table_center": ParagraphStyle(
            "TableCenter",
            parent=base["BodyText"],
            fontName=FONT,
            fontSize=8,
            leading=10.3,
            alignment=TA_CENTER,
            textColor=DARK,
        ),
        "callout_title": ParagraphStyle(
            "CalloutTitle",
            parent=base["BodyText"],
            fontName=FONT_BOLD,
            fontSize=9.5,
            leading=12,
            textColor=BLUE,
            spaceAfter=3,
        ),
        "callout_body": ParagraphStyle(
            "CalloutBody",
            parent=base["BodyText"],
            fontName=FONT,
            fontSize=9,
            leading=12,
            textColor=DARK,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["BodyText"],
            fontName=FONT,
            fontSize=9.2,
            leading=12,
            leftIndent=13,
            bulletIndent=3,
            spaceAfter=3.5,
            textColor=DARK,
        ),
    }


STYLES = make_styles()


def p(text, style="body"):
    return Paragraph(text, STYLES[style])


def bullet(text):
    return Paragraph(text, STYLES["bullet"], bulletText="•")


def section(title):
    return p(title, "h1")


def subsection(title):
    return p(title, "h2")


def callout(title, body, fill=LIGHT_GRAY, accent=BLUE):
    title_style = ParagraphStyle(
        "CalloutTitle{}".format(str(accent)),
        parent=STYLES["callout_title"],
        textColor=accent,
    )
    table = Table(
        [[Paragraph(title, title_style), Paragraph(body, STYLES["callout_body"])]],
        colWidths=[4.0 * cm, 12.2 * cm],
        hAlign="LEFT",
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), fill),
                ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return KeepTogether([table, Spacer(1, 8)])


def matrix(headers, rows, widths, center_cols=None):
    center_cols = set(center_cols or [])
    data = [[Paragraph(h, STYLES["table_header"]) for h in headers]]
    for row in rows:
        data.append(
            [
                Paragraph(str(value), STYLES["table_center" if idx in center_cols else "table_cell"])
                for idx, value in enumerate(row)
            ]
        )
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT", splitByRow=True)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), LIGHT_BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), BLUE),
                ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return [table, Spacer(1, 9)]


def label_table(rows):
    data = []
    for label, detail in rows:
        data.append(
            [
                Paragraph(label, STYLES["table_header"]),
                Paragraph(detail, STYLES["table_cell"]),
            ]
        )
    table = Table(data, colWidths=[4.0 * cm, 12.2 * cm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), LIGHT_BLUE),
                ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return [table, Spacer(1, 9)]


def header_footer(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFont(FONT, 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(2.0 * cm, height - 1.15 * cm, "Pulycort | Resumen ejecutivo IA")
    canvas.drawRightString(width - 2.0 * cm, 1.1 * cm, "Página {}".format(doc.page))
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.4)
    canvas.line(2.0 * cm, height - 1.32 * cm, width - 2.0 * cm, height - 1.32 * cm)
    canvas.restoreState()


def build_story():
    story = []

    story.append(Spacer(1, 1.6 * cm))
    story.append(p("Pulycort", "kicker"))
    story.append(p("Resumen ejecutivo", "title"))
    story.append(p("Pre-auditoría de procesos internos e integración de IA", "subtitle"))
    story.append(
        callout(
            "Idea central",
            "La oportunidad no está en crear una IA aislada, sino en ordenar el flujo solicitud → presupuesto → pedido → producción → albarán → factura, usando Odoo como columna vertebral y la IA como capa de asistencia.",
            LIGHT_BLUE,
            BLUE,
        )
    )
    story.extend(
        label_table(
            [
                ("Objetivo", "Reducir trabajo manual, errores, tiempos de respuesta y dependencia de conocimiento informal."),
                ("Enfoque inicial", "Automatizaciones de baja fricción: email, documentos, facturación asistida, reporting y asistente interno."),
                ("Enfoque estratégico", "Datos industriales: producción, SIMEC, trazabilidad de bloques/tablas, stock, energía, calidad y rendimiento."),
                ("Fecha", "8 de junio de 2026."),
            ]
        )
    )
    story.append(subsection("Decisiones que conviene tomar primero"))
    for item in [
        "Confirmar qué modalidad de Odoo han contratado y qué integraciones permite.",
        "Elegir un primer piloto visible en 30-60 días, sin tocar todavía sistemas industriales críticos.",
        "Definir una fuente de verdad para clientes, pedidos, stock, producción, facturas y albaranes.",
        "Presentar la IA al equipo como ayuda para quitar trabajo repetitivo, no como vigilancia.",
    ]:
        story.append(bullet(item))
    story.append(PageBreak())

    story.append(section("1. Dónde poner el foco"))
    story.append(
        p(
            "El mayor retorno inicial está en administración comercial y documentación. El mayor retorno estratégico está en producción, trazabilidad, rendimiento de material y máquina. La vía prudente es empezar por tareas con mucho volumen y poca fricción, y escalar después hacia IA industrial."
        )
    )
    story.extend(
        matrix(
            ["Área", "Impacto", "Fricción", "Por qué importa"],
            [
                ("Entrada de solicitudes y email", "Alto", "Baja", "Ordena pedidos que llegan por varias vías y reduce tiempo de primera respuesta."),
                ("Presupuesto → pedido → producción → factura", "Muy alto", "Media", "Evita doble entrada de datos y errores entre documentos."),
                ("Facturación y albaranes", "Alto", "Media", "Trabajo manual claro y dependencia operativa."),
                ("Odoo como fuente de verdad", "Muy alto", "Media", "Debe centralizar CRM, ventas, compras, inventario, producción y facturación."),
                ("SIMEC y datos de producción", "Alto", "Media-alta", "Permite medir m², paradas, rendimiento, merma y productividad real."),
                ("Compras, stock y trazabilidad", "Alto", "Media", "Afecta margen, plazos, disponibilidad y calidad."),
                ("Placas solares y energía", "Medio", "Baja", "Quick win: informe automático y detección de anomalías."),
            ],
            [4.2 * cm, 2.2 * cm, 2.4 * cm, 7.4 * cm],
            center_cols=[1, 2],
        )
    )
    story.append(
        callout(
            "Recomendación",
            "No empezar por una app grande ni por visión artificial. Primero hay que asegurar datos fiables, documentos normalizados y un Odoo bien modelado.",
            LIGHT_GRAY,
            GREEN,
        )
    )

    story.append(section("2. Primeros pilotos recomendados"))
    story.extend(
        matrix(
            ["Piloto", "Qué resuelve", "Duración", "Resultado esperado"],
            [
                ("Bandeja inteligente", "Clasifica emails/formularios, extrae datos, detecta faltantes y prepara respuesta.", "4-6 semanas", "Menos tiempo administrativo y solicitudes mejor estructuradas."),
                ("Generación documental", "Crea borradores de presupuesto, pedido, orden, albarán y factura desde datos comunes.", "4-8 semanas", "Menos errores, menos copia manual y mejor trazabilidad."),
                ("Informe solar automático", "Lee informes o API de placas solares y genera resumen de rendimiento.", "1-2 semanas", "Demostración rápida de valor con baja fricción."),
                ("Diagnóstico SIMEC", "Identifica qué datos genera la máquina y cómo capturarlos.", "2-4 semanas", "Base técnica para dashboard de producción."),
            ],
            [3.2 * cm, 5.5 * cm, 2.4 * cm, 5.1 * cm],
            center_cols=[2],
        )
    )

    story.append(section("3. Odoo: punto crítico"))
    story.append(
        p(
            "Odoo no debe tratarse solo como CRM. Si el plan contratado lo permite, debe ser la columna vertebral del flujo operativo. Antes de construir herramientas externas hay que confirmar límites de API, módulos, personalización y entorno técnico."
        )
    )
    story.extend(
        label_table(
            [
                ("Pregunta 1", "¿Tienen Odoo Online Standard, Odoo Online Custom, Odoo.sh u on-premise?"),
                ("Pregunta 2", "¿Hay acceso a API externa y módulos personalizados?"),
                ("Pregunta 3", "¿Cómo se modelarán bloques, tablas, lotes, acabados, stock reservado y producción?"),
                ("Pregunta 4", "¿Cómo se generarán factura y albarán, y cómo encaja con VERI*FACTU/factura electrónica?"),
                ("Decisión", "Integrar la IA con Odoo siempre que sea viable; evitar otro silo operativo."),
            ]
        )
    )

    story.append(section("4. Datos industriales"))
    story.append(
        p(
            "El potencial industrial está en conectar pedido, lote, material, máquina, merma, tiempos, incidencias y calidad. Pero este bloque requiere más cuidado técnico: primero captura y visualización; después predicción y optimización."
        )
    )
    for item in [
        "SIMEC: identificar modelo, software, servidor interno, logs, protocolos, credenciales y formato de datos.",
        "Producción: medir m², tiempos, paradas, causas, turnos, rendimiento por material/acabado y retrasos.",
        "Trazabilidad: vincular proveedor, bloque, tabla, lote, pedido, cliente, fotos, defectos y reclamaciones.",
        "Calidad: registrar defectos con fotos y causa probable antes de plantear visión artificial.",
    ]:
        story.append(bullet(item))
    story.append(
        callout(
            "Precaución técnica",
            "No conectar maquinaria industrial directamente a internet. Si hay datos de máquina, conviene capturarlos en red local con un colector edge y enviar solo datos normalizados al sistema central.",
            PALE_GOLD,
            GOLD,
        )
    )

    story.append(section("5. Roadmap propuesto"))
    story.extend(
        matrix(
            ["Horizonte", "Objetivo", "Entregables"],
            [
                ("0-30 días", "Auditar procesos y lanzar quick wins.", "Mapa de procesos, inventario de sistemas, 5 pedidos reales analizados, prototipo de bandeja inteligente e informe solar."),
                ("30-90 días", "Automatizar flujo documental y Odoo.", "Presupuesto → pedido → orden → albarán/factura con validación humana y dashboard operativo básico."),
                ("3-6 meses", "Capturar datos industriales.", "Colector SIMEC, partes de producción normalizados, stock/lotes trazables y reportes de rendimiento."),
                ("6-12 meses", "Optimizar decisiones.", "Predicción de retrasos, mantenimiento preventivo, recomendación de compras, análisis de margen real y visión artificial si hay datos suficientes."),
            ],
            [3.0 * cm, 4.2 * cm, 9.0 * cm],
        )
    )

    story.append(section("6. Preguntas imprescindibles"))
    for item in [
        "¿Dónde se pierde más tiempo hoy: emails, presupuestos, facturas, producción, stock o incidencias?",
        "¿Qué documentos se generan manualmente y quién los genera?",
        "¿Cuántos presupuestos, pedidos, facturas y albaranes se emiten al mes?",
        "¿Qué información se copia entre sistemas o documentos?",
        "¿El stock real coincide con el stock en sistema?",
        "¿Qué datos recibe o debería recibir el servidor de SIMEC?",
        "¿De dónde salen los informes de placas solares: PDF, email, portal o API?",
        "¿Qué persona o proceso no puede fallar porque concentra demasiado conocimiento?",
    ]:
        story.append(bullet(item))

    story.append(section("7. Dónde no conviene empezar"))
    story.extend(
        matrix(
            ["Evitar al principio", "Motivo"],
            [
                ("Visión artificial de calidad", "Puede ser potente, pero necesita imágenes, etiquetas y criterios consistentes."),
                ("Mantenimiento predictivo avanzado", "Sin histórico fiable de averías y paradas, sería más promesa que herramienta."),
                ("Sistema paralelo a Odoo", "Aumentaría silos y doble entrada de datos."),
                ("Marketing como primer eje", "Útil, pero el problema principal parece operativo y documental."),
                ("Automatizar decisiones sin revisión", "Al inicio la IA debe preparar y validar, no enviar ni decidir sola."),
            ],
            [5.0 * cm, 11.2 * cm],
        )
    )

    story.append(section("8. Mensaje interno recomendado"))
    story.append(
        callout(
            "Para explicar el proyecto al equipo",
            "Queremos entender qué tareas os hacen perder más tiempo, dónde se repiten errores y qué información os falta para trabajar más cómodos. La tecnología preparará borradores, ordenará datos y quitará trabajo repetitivo; las decisiones importantes seguirán pasando por personas.",
            LIGHT_BLUE,
            BLUE,
        )
    )

    story.append(section("9. Siguiente paso"))
    story.append(
        p(
            "Organizar una reunión o visita de auditoría de 2-4 horas con dirección, administración, ventas, producción, compras/almacén e IT/mantenimiento."
        )
    )
    for item in [
        "Ver 5 pedidos reales completos de punta a punta.",
        "Confirmar plan y alcance real de Odoo.",
        "Localizar servidor SIMEC y plataforma solar.",
        "Elegir un piloto de 30-60 días.",
        "Definir métricas: horas ahorradas, errores evitados, tiempo de respuesta y visibilidad operativa.",
    ]:
        story.append(bullet(item))

    story.append(subsection("Fuentes base"))
    for item in [
        "Web y proceso de Pulycort: pulycort.com.",
        "Documentación oficial de Odoo sobre API externa y Odoo.sh.",
        "Información oficial de AEAT sobre VERI*FACTU y facturación electrónica.",
        "Información pública de SIMEC como fabricante de maquinaria para piedra natural.",
    ]:
        story.append(bullet(item))

    return story


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(PDF_PATH),
        pagesize=A4,
        rightMargin=2.0 * cm,
        leftMargin=2.0 * cm,
        topMargin=1.7 * cm,
        bottomMargin=1.7 * cm,
        title="Pulycort - Resumen ejecutivo IA",
        author="Codex",
    )
    doc.build(build_story(), onFirstPage=header_footer, onLaterPages=header_footer)
    print(PDF_PATH)


if __name__ == "__main__":
    main()
