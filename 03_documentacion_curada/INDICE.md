# Índice de documentación Pulycort / INDASEL

Organizado el 2026-06-09 a partir de los archivos recibidos en `01_entrada/`.

## Contexto general

La documentación parece formar parte de una parametrización/migración de datos de Pulycort con INDASEL/Indaws, probablemente hacia Odoo y hacia una integración de producción de máquinas. El bloque principal describe catálogos maestros para artículos, materiales, acabados, medidas, unidades, trabajos de elaboración, tarifas por familia de material y datos de clientes/proveedores.

La empresa trabaja piedra natural/mármol con procesos como bloque, tabla, losa, telar, reforzado, pulido, disco puente, taller y otros trabajos de elaboración. La codificación de artículos/trabajos se construye por posiciones o atributos: producto/familia, material, acabado, calidad, largo, ancho, grueso y unidad de medida.

## Criterio de carpetas

- `01_modelo_codificacion_y_atributos`: estructura del código, productos y familias/atributos simples consolidados.
- `02_materiales`: relación vigente de materiales por familias y libro de apoyo con campos adicionales.
- `03_acabados_y_trabajos`: acabados aplicables a artículos/materiales, trabajos/servicios y versiones de apoyo no redundantes.
- `04_tarifas_operaciones_maquinas`: trabajos por grupos 81-84, tarifas y relación con máquinas.
- `05_clientes_proveedores_pagos`: importación de partners a Odoo y formas/condiciones de pago.
- `06_produccion_y_acceso_maquinas`: cuestionario funcional de producción y acceso remoto a máquinas.
- `07_tarifas_por_material`: tarifas comerciales por material y año, separadas de las tarifas de operaciones/máquinas.

Cuando hay archivos con `DEFINITIVO` o con fecha, se han mantenido junto a sus versiones previas para conservar trazabilidad.

## 01_modelo_codificacion_y_atributos

| Documento | Contenido |
| --- | --- |
| [ORDEN DE FAMILIAS.XLSX](<01_modelo_codificacion_y_atributos/ORDEN DE FAMILIAS.XLSX>) | Define el orden de los atributos del código de artículo/trabajo: artículo/trabajo, producto/familia, material, acabado, calidad, largo, ancho, grueso y unidad de medida. Es el mapa principal para entender cómo se compone la referencia. |
| [LISTADO PRODUCTOS.XLSX](<01_modelo_codificacion_y_atributos/LISTADO PRODUCTOS.XLSX>) | Relaciona rangos/códigos de producto: otras operaciones, mercancía, trabajos de elaboración, transportes, horas de trabajo y otros grupos. Sirve como visión de alto nivel de familias de producto. |
| [FAMILIAS Y ATRIBUTOS.xlsx](<01_modelo_codificacion_y_atributos/FAMILIAS Y ATRIBUTOS.xlsx>) | Libro consolidado de familias simples y atributos base: productos, calidades, largo, ancho, grueso y unidad de medida. Sustituye a los Excels individuales de familias que antes estaban separados. |

## 02_materiales

| Documento | Contenido |
| --- | --- |
| [RELACION DE MATERIALES.XLSX](<02_materiales/RELACION DE MATERIALES.XLSX>) | Relación vigente de materiales revisados, agrupada por familias. Es la referencia principal del bloque y resuelve el código `701` como `GRIS SAN VICENTE`. |
| [0 RELACION MATERIALES.XLSX](<02_materiales/0 RELACION MATERIALES.XLSX>) | Libro de apoyo y trazabilidad con tres hojas: materiales revisados, orden de materiales y tabla fuente con código original, nombre revisado, material para telar, familia y posición. Útil para consultar campos que no están en la relación vigente. |

## 03_acabados_y_trabajos

| Documento | Contenido |
| --- | --- |
| [RELACION ACABADOS TRABAJOS DEFINITIVOS.XLS](<03_acabados_y_trabajos/RELACION ACABADOS TRABAJOS DEFINITIVOS.XLS>) | Relación vigente de acabados/trabajos y servicios de elaboración. Es la referencia principal para trabajos; supera a la versión intermedia `4 FAMILIA ACABADOS TRABAJOS DEFINITIVOS.XLS`. |
| [4 FAMILIA ACABADO MATERIALES-articulos DEFINITIVO.XLSX](<03_acabados_y_trabajos/4 FAMILIA ACABADO MATERIALES-articulos DEFINITIVO.XLSX>) | Versión depurada de acabados aplicables a artículos/materiales. Referencia principal para acabados de artículos. |
| [ACABADO MATERIALES.XLSX](<03_acabados_y_trabajos/ACABADO MATERIALES.XLSX>) | Libro de apoyo con relación de acabados de materiales y una hoja específica de acabados para disco puente. Se conserva porque aporta una clasificación que no aparece en los otros libros. |
| [4 FAMILIA ACABADO MATERIALES-articulos.xlsx](<03_acabados_y_trabajos/4 FAMILIA ACABADO MATERIALES-articulos.xlsx>) | Versión previa/ampliada de acabados de artículos, con variantes no cubiertas de forma inequívoca por la definitiva. Se conserva como apoyo para no perder datos. |
| [4 FAMILIA ACABADOS TRABAJOS.XLS](<03_acabados_y_trabajos/4 FAMILIA ACABADOS TRABAJOS.XLS>) | Versión previa/ampliada de acabados/trabajos. Se conserva porque mantiene entradas descartadas o renombradas que no conviene perder sin revisión manual. |

## 04_tarifas_operaciones_maquinas

| Documento | Contenido |
| --- | --- |
| [RELACION DE TRABAJOS 81 82 83 MAQUINAS 24-03-26.xlsx](<04_tarifas_operaciones_maquinas/RELACION DE TRABAJOS 81 82 83 MAQUINAS 24-03-26.xlsx>) | Tarifas de trabajos 81, 82 y 83 por familia/tipo de material. Incluye precio de venta, referencia de trabajo, código de trabajo de máquina y precio de trabajo de máquina para procesos como reforzado de bloque y aserrado por telar. |
| [RELACION DE TRABAJOS 84 TALLER 24-03-26.xlsx](<04_tarifas_operaciones_maquinas/RELACION DE TRABAJOS 84 TALLER 24-03-26.xlsx>) | Tarifas del grupo 84, otros trabajos de taller. Incluye referencias, precios por unidad y fórmulas de incremento para familias como travertinos y granito. La hoja está marcada como `revisar`. |
| [TRABAJOS POR MAQUINAS.XLS](<04_tarifas_operaciones_maquinas/TRABAJOS POR MAQUINAS.XLS>) | Mapa de servicios de elaboración por máquina. Incluye lista general de servicios, catálogo de máquinas y hojas específicas para reforzadora, hilo, telar, pulidora, disco puente, control numérico, biseladora, taller, recuperadora y cortabloques. |

## 05_clientes_proveedores_pagos

| Documento | Contenido |
| --- | --- |
| [BASE DATOS CLIENTES-PROVEEDORES INDAWS -plantilla importacion-.xlsx](<05_clientes_proveedores_pagos/BASE DATOS CLIENTES-PROVEEDORES INDAWS -plantilla importacion-.xlsx>) | Plantilla de importación de clientes, proveedores y acreedores consolidados para Odoo. Contiene instrucciones, 4.069 partners consolidados, direcciones adicionales, modos de pago, condiciones de pago, mapeo de provincias y países. |
| [LISTADO FORMA DE PAGO-COBRO ODOO.XLSX](<05_clientes_proveedores_pagos/LISTADO FORMA DE PAGO-COBRO ODOO.XLSX>) | Listado de formas de pago/cobro y códigos para Odoo: efectivo, recibos domiciliados, confirming, transferencias, pagarés/cheques y plazos como contado, 30, 45, 60 días, etc. |

## 06_produccion_y_acceso_maquinas

| Documento | Contenido |
| --- | --- |
| [Cuestionario para Angel - INDASEL Pulycort.xlsx](<06_produccion_y_acceso_maquinas/Cuestionario para Angel - INDASEL Pulycort.xlsx>) | Cuestionario funcional para Ángel sobre partes de máquinas y datos de producción. Cubre preguntas clave, campos por máquina, materiales y operaciones/tarifa. Incluye respuestas sobre conceptos como `PM`/número de lote, telares, reforzadoras, pulidoras y disco puente. |
| [INSTRUCCIONES ACCESO MAQUINAS-INDASEL.DOCX](<06_produccion_y_acceso_maquinas/INSTRUCCIONES ACCESO MAQUINAS-INDASEL.DOCX>) | Instrucciones de acceso remoto a máquinas mediante RealVNC Viewer. Incluye IPs de telares, reforzadora, pulidoras y disco puente, con indicaciones de conexión. |

## 07_tarifas_por_material

| Documento | Contenido |
| --- | --- |
| [INDICE.md](<07_tarifas_por_material/INDICE.md>) | Indice local de tarifas comerciales por material y año. Define el criterio de carpetas para incorporar nuevos materiales sin mezclarlos con tarifas de operaciones/máquinas. |
| [00_TARIFA_MAESTRA_CONSOLIDADA_v5.xlsx](<07_tarifas_por_material/00_TARIFA_MAESTRA_CONSOLIDADA_v5.xlsx>) | **Libro maestro vigente (v5).** Igual que v4 + **nuevo material «Travertino Mexicano»** (incorporado manualmente, no viene de `.xls`): solo tabla, eje = acabado (Bruto base + apomazado/pulido o cepillado, en poro abierto / a su color / transparente), 2 cm tecleado y 3 cm = +40 % calculado; ex factory, embalado no incluido. Catálogo de 15 materiales. Mecanismo de materiales manuales en `MANUAL_TABLAS` (`90_tools/tarifas_construir_v5.py` / `tarifas_verificar_v5.py`). |
| 00_TARIFA_MAESTRA_CONSOLIDADA_v4.xlsx | **v4 (histórico, 14 materiales).** Igual que v3 (base Bruto, acabados que suman por fórmula, sin hoja de modificadores, BD derivada) con dos retoques: hoja `Acabados y notas` en **rojo** y **catálogo de materiales reordenado** (1 fila por material con sus variantes listadas; sin columnas «Tipo de eje» ni «Depósito», cuyo aviso pasa a Notas). Incluye **esquemas geométricos limpios de los 3 zanquines** (monta-caballo, cartabón, compuesto) bajo su columna en `Peldaños` (generados con `90_tools/tarifas_dibujos.py` → `90_tools/assets/`). **563 precios** (auditoría 2026-06-19: se corrigió un bug de extracción que perdía los precios de tabla/losa/banda de Caliza «Alba» y «Light Emperador», y se quitó la losa envejecida/arenada inventada de Gris San Vicente; v1/v2/v3 conservan ese bug y quedan superadas). `90_tools/tarifas_construir_v4.py` / `tarifas_verificar_v4.py` / `tarifas_auditoria.py`. |
| 00_TARIFA_MAESTRA_CONSOLIDADA_v3.xlsx | **v3 (histórico).** Acabado base normalizado a **Bruto** (fila base = pieza sin acabado, lo que se teclea); al desplegar, los acabados **suman** sobre el bruto por fórmula (Pulido/Apomazado +3, Envejecido +5, Arenado +10 €/m²; Travertino: poro abierto/resina/transparente son precios propios, arenado +13). Pietra Grey y Tundra Grey no tienen bruto → base Pulido. **Sin hoja de modificadores**: todo integrado en las tablas (deltas inline); la hoja `Acabados y notas` es solo explicativa. `< 20 ud`, `medida fija` y `arista matada` como columnas calculadas; cabezas de huella/tabica como producto. `BD_Precios` = vista derivada por referencias. Verificado además contra los `.xls` originales (los 541 precios de origen aparecen en v3). `90_tools/tarifas_construir_v3.py` / `tarifas_verificar_v3.py`. |
| 00_TARIFA_MAESTRA_CONSOLIDADA_v2.xlsx | **v2 (intermedio).** Modificadores integrados y enlazados por fórmulas, pero con base Pulido/Apomazado y hoja `Reglas` con celdas con nombre. Superado por la v3. |
| 00_TARIFA_MAESTRA_CONSOLIDADA.xlsx | **v1 (histórico).** Primera consolidación: hoja por familia, `Reglas y modificadores` aparte (no enlazada), `BD_Precios` con 541 precios y sin fórmulas entre hojas. |
| [TARIFA AZUL BATEIG 2026.xls](<07_tarifas_por_material/azul_bateig/2026/TARIFA AZUL BATEIG 2026.xls>) | Tarifa 2026 del material Azul Bateig. Copia literal de la fuente recibida en `01_entrada/`. |
| [TARIFA CREMA MARFIL 2026.xls](<07_tarifas_por_material/crema_marfil/2026/TARIFA CREMA MARFIL 2026.xls>) | Tarifa 2026 del material Crema Marfil. Copia literal de la fuente recibida en `01_entrada/`. |

## Observaciones útiles

- En materiales, `RELACION DE MATERIALES.XLSX` queda como referencia vigente y `0 RELACION MATERIALES.XLSX` se mantiene como libro de apoyo por sus campos adicionales.
- En acabados/trabajos, se elimina solo la versión intermedia claramente redundante; se conservan los libros previos que todavía contienen variantes únicas o clasificaciones específicas.
- Los archivos de acabados tienen varias versiones. Para trabajo operativo conviene priorizar los fechados más recientes y los marcados como `DEFINITIVO`, manteniendo las versiones anteriores como histórico.
- Las familias simples de producto, calidad, dimensiones y unidad de medida quedan agrupadas en `01_modelo_codificacion_y_atributos/FAMILIAS Y ATRIBUTOS.xlsx`.
- Los libros de trabajos 81-84 y `TRABAJOS POR MAQUINAS.XLS` conectan tarifas, operaciones y máquinas; son clave para integrar partes de producción con el catálogo de trabajos.
- La plantilla de clientes/proveedores ya está muy orientada a Odoo: usa `external_id`, `customer_rank`, `supplier_rank`, modos de pago, condiciones de pago, provincias y países.
- El cuestionario de producción explica la intención del proyecto: conseguir que las máquinas vuelquen producción y consumos al sistema con datos bien entendidos antes de programar la integración.
