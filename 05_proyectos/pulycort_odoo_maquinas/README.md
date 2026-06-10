# Proyecto: Odoo y maquinas de produccion

## Objetivo

Conectar la informacion que generan las maquinas de produccion con Odoo para mejorar trazabilidad, stock, costes, operaciones y relacion con pedidos.

La pregunta operativa central es:

> Que bloque, tabla o losa esta en que pedido, con que lote, en que maquina, con que operacion y en que estado.

## Alcance inicial

- Entender los datos que genera cada maquina.
- Identificar el identificador comun entre maquina, lote, bloque, tabla, losa y pedido.
- Definir que debe vivir en Odoo como producto, variante, lote, parte de trabajo, operacion o movimiento de stock.
- Disenar una integracion incremental antes de construir una app grande.

## Estructura

- `00_contexto/`: reuniones, notas de negocio y fuentes relacionadas.
- `01_requisitos/`: requisitos funcionales y casos de uso.
- `02_arquitectura/`: decisiones tecnicas, modelo de datos y flujos.
- `03_integraciones/`: Odoo, maquinas, formatos de intercambio y APIs.
- `04_prototipos/`: pruebas pequenas o demos.
- `05_app/`: codigo de aplicacion si el proyecto crece.
- `90_referencias/`: documentos, capturas o extractos relevantes.

## Fuentes relacionadas

- `03_documentacion_curada/06_produccion_y_acceso_maquinas/`
- `03_documentacion_curada/04_tarifas_operaciones_maquinas/`
- `04_analisis_y_entregables/outputs/pulycort-odoo-adaptacion-software-2026-06-09/`
- `02_conocimiento/obsidian/04 Modelo Odoo variantes lotes.md`
- `02_conocimiento/obsidian/08 Maquinas operaciones y produccion.md`

## Dudas abiertas

- Que software concreto usa cada maquina y que formatos puede exportar.
- Si existe un ID estable de lote/PM que aparezca tanto en maquina como en Odoo.
- Que eventos se necesitan en tiempo real y cuales pueden sincronizarse por lote.
- Como tratar reprocesos, mermas, tablas parciales, losas personalizadas y cambios de pedido.
