---
tags: [pulycort, proceso, ventas, odoo]
generated: 2026-06-10
source: "preauditoría IA, mapa mental e informe Odoo"
---
# Flujo pedido a cobro

El flujo operativo deseado conecta la entrada comercial con la producción y la facturación sin duplicar datos.

## Flujo general

1. Entra una solicitud por web, comercial, teléfono, WhatsApp, cliente recurrente, feria, redes u otro canal.
2. Se recopilan datos mínimos: cliente, material, medidas, grosor, acabado, cantidad, uso, plazo, transporte y datos fiscales.
3. Se prepara presupuesto o proforma.
4. Al aceptarse el presupuesto y recibirse el pago/señal cuando aplique, se genera una OP.
5. La OP activa producción o reserva de stock.
6. Producción transforma el material y registra avance, consumo, incidencias y lote/palet.
7. El material se embala.
8. Se coordina transporte: lo puede contratar Pulycort o el cliente.
9. Se emite albarán.
10. Se emite factura.
11. Se controla cobro según forma y condición de pago.

## Flujo Odoo mencionado

```mermaid
flowchart LR
  O[Oportunidad] --> P[Pedido de venta]
  P --> A[Albarán]
  A --> F[Factura]
```

## Puntos críticos

- El presupuesto necesita saber material, medidas, acabado y unidades.
- El lote debe permitir seguir bloque, tabla, losa y palet.
- Si el acabado solo vive en el lote, puede llegar tarde para precio y pedido de venta.
- Si el acabado genera variante, el catálogo crece mucho.
- Los trabajos de máquina no siempre son stock: pueden ser coste, operación o línea facturable.

## Documentos del proceso

- Solicitud o lead.
- Presupuesto/proforma.
- Pedido de venta.
- OP u orden de producción.
- Parte de máquina/producción.
- Albarán.
- Factura.
- Documentación logística y de embalaje cuando aplique.

## Oportunidad de mejora

La documentación recomienda introducir datos una sola vez y reutilizarlos en todos los documentos. La IA puede ayudar a extraer datos de emails/PDFs, detectar faltantes, preparar borradores y validar inconsistencias, pero las decisiones importantes deben mantenerse revisadas por personas.
