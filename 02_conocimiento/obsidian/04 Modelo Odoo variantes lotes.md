---
tags: [pulycort, odoo, modelo-datos]
generated: 2026-06-10
source: "informe jerarquizado reunión Pulycort/Odoo"
---
# Modelo Odoo variantes lotes

La reunión con Odoo/IDDAMS se centró en cómo estructurar productos sin multiplicar variantes innecesarias y sin perder trazabilidad, precio, coste y stock.

## Principios acordados

- Producto base: bloque, tabla, losa estándar, losa personalizada u otros artículos.
- Material: atributo que genera variantes.
- Familia de material: dato informativo/asociado para costes, no nivel visible de jerarquía si el material ya la determina.
- Medidas estándar: pueden generar variantes si están tarifadas.
- Medidas reales/especiales: deben ir en lote, número de serie o descripción, no crear miles de variantes.
- Lote: debe contener largo, ancho/alto, grueso, volumen, acabado real y ubicación.
- Trabajo de máquina: no es necesariamente stock; puede ser operación, coste o artículo facturable.

## Producto, atributo y variante

En Odoo, el producto base se combina con atributos para formar variantes. Ejemplo:

- Producto base: losa estándar.
- Material: Koala.
- Grosor: 2 cm.
- Medida estándar: 60 x 30.
- Acabado: pulido, apomazado, bruto, reforzado u otro, pendiente de decisión final.

## Familia de material

La familia se deduce del material:

- Koala -> familia Marfil.
- Travertino Romano -> familia Travertinos.
- Negro Marquina -> familia Marquina.

Uso recomendado:

- Agrupar costes.
- Filtrar y reportar.
- Ayudar a reglas de tarifa.
- Evitar mostrarla como nivel redundante en código comercial.

## Medidas

- Estándar: medidas tarifadas que sí pueden formar parte de variante.
- Real: medidas producidas con pequeñas diferencias, mermas o recuperaciones. Deben ir a lote.
- Personalizada: usar valor o producto genérico de medida personalizada y registrar medidas exactas en lote/descripcion.

## Acabado: decisión crítica

El acabado puede ser:

- Estado real del material en el lote.
- Atributo que genera variante cuando afecta a venta, precio o stock.
- Ambos, si se diferencia acabado vendido/previsto y acabado real del lote.

Punto abierto: si el acabado solo se decide al seleccionar lote en albarán, el pedido de venta puede no conocer el acabado y no calcular bien precio/factura. Si se convierte en atributo, aumenta mucho el número de variantes.

## Costes

El coste directo se calcula por trabajo, familia/material y unidad. El tiempo no entra directamente en el precio fijo documentado. El precio de máquina incluye gastos directos como mano de obra y consumibles; faltan costes indirectos.
