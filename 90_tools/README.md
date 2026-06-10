# Tools

Utilidades locales para procesar documentos, videos, PDFs, texto y vistas previas.

Estas herramientas son soporte tecnico del repositorio. No son fuente de verdad de negocio.

## Scripts actuales

- `transcribe_video.py`: transcripcion y extraccion de material desde video/audio.
- `transcribe_audio.py`: transcripcion de archivos de audio sin extraccion de capturas.
- `make_contact_sheets.py`: generacion de hojas de contacto a partir de capturas.
- `generate_pulycort_pdf_summary.py`: genera el DOCX de resumen ejecutivo.
- `generate_pulycort_executive_pdf.py`: genera el PDF de resumen ejecutivo.
- `preview_pdf_with_playwright.js`: crea previews del PDF con navegador headless.
- `render_pdf_pages.mjs`: renderiza paginas del PDF a imagenes.
- `markdown_report_to_html.mjs`: convierte informes Markdown a HTML imprimible para exportarlos a PDF.
- `fix_spanish_text.ps1`: normaliza texto en archivos concretos ya generados.

## Convencion

- Las salidas elaboradas deben ir a `04_analisis_y_entregables/informes/`.
- Las salidas brutas, logs, capturas y transcripciones deben ir a `04_analisis_y_entregables/outputs/`.
- Si un script empieza a ser parte de una app real, moverlo al proyecto correspondiente en `05_proyectos/`.
