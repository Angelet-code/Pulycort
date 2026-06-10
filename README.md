# Pulycort

Repositorio de conocimiento, documentacion y proyectos para entender y ayudar a Pulycort / INDASEL.

El objetivo de esta carpeta es mantener separadas tres cosas que suelen mezclarse rapido:

- Fuentes recibidas de la empresa.
- Sintesis, mapas mentales y conocimiento operativo.
- Proyectos, prototipos y entregables accionables.

## Estructura principal

- `00_gestion/`: roadmap, tareas abiertas y decisiones de organizacion.
- `01_entrada/`: bandeja de entrada para documentos recibidos sin procesar.
- `02_conocimiento/`: Obsidian, mapas mentales y notas de comprension.
- `03_documentacion_curada/`: documentacion ya ordenada, limpia o clasificada.
- `04_analisis_y_entregables/`: informes, salidas de transcripcion y entregables generados.
- `05_proyectos/`: iniciativas concretas de software, automatizacion o integracion.
- `90_tools/`: scripts y utilidades internas para procesar documentos, video, PDF o texto.

Las carpetas `.cache/` y `.vendor/` se mantienen como soporte tecnico local y no deben tratarse como conocimiento de negocio.

## Flujo recomendado

1. Guardar cada documento nuevo en `01_entrada/` sin modificarlo.
2. Crear o actualizar una version trabajada en `03_documentacion_curada/`.
3. Resumir lo aprendido en `02_conocimiento/obsidian/` cuando afecte al modelo operativo.
4. Registrar decisiones, dudas y proximas acciones en `00_gestion/`.
5. Si una linea de trabajo ya tiene entidad propia, moverla a `05_proyectos/`.

## Fuentes de arranque

- Indice de documentacion: `03_documentacion_curada/INDICE.md`
- Boveda Obsidian: `02_conocimiento/obsidian/00 Inicio.md`
- Proyecto Odoo-maquinas: `05_proyectos/pulycort_odoo_maquinas/README.md`
- Tareas abiertas: `00_gestion/TAREAS.md`

