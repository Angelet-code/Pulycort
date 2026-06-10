---
tags: [pulycort, clientes, proveedores, odoo, pagos]
generated: 2026-06-10
source: "plantilla importación partners y formas de pago"
---
# Clientes proveedores y pagos

La documentación está preparada para migrar clientes, proveedores y acreedores a Odoo.

## Resumen de partners

- Registros origen CLI: 4.439
- Partners consolidados: 4069
- Solo cliente: 2314
- Solo proveedor/acreedor: 1400
- Cliente + proveedor/acreedor con mismo NIF: 355
- Direcciones adicionales/contactos hijos: 17

## Reglas de consolidación

- Prefijo 430: cliente.
- Prefijo 400: proveedor.
- Prefijo 410: acreedor.
- Si un mismo NIF aparece en varios prefijos, se crea un partner único con rangos activos.
- Pagos "Por determinar" se eliminan y quedan vacíos para que Odoo tome valores por defecto.

## Campos clave para Odoo

- `customer_rank` y `supplier_rank` marcan tipo de partner.
- `property_payment_term_id` define condición de pago de venta.
- `property_supplier_payment_term_id` define condición de pago de compra.
- `customer_payment_mode_id` y `supplier_payment_mode_id` definen modos de cobro/pago.
- `credit_limit` recoge riesgo total empresa.
- `use_partner_credit_limit` se activa cuando hay límite.
- Campos Studio documentados guardan cuentas origen, códigos de dirección y riesgos de seguro.

## Formas de pago/cobro

| Familia | Forma | Código |
| --- | --- | --- |
| EFECTIVO |  | 1xx |
| PAGARÉ / CHEQUE |  | 6xx |
| EFECTIVO | CONTADO | 100 |
| PAGARÉ | CONTADO / A LA VISTA | 600 |
| PAGARÉ | 30 DIAS | 630 |
| RECIBOS DOMICILIADOS |  | 2xx |
| PAGARÉ | 45 DIAS | 645 |
| RECIBO DOMICILIADO | 30 DIAS | 230 |
| PAGARÉ | 60 DIAS | 660 |
| RECIBO DOMICILIADO | 45 DIAS | 245 |
| PAGARÉ | 90 DIAS | 690 |
| RECIBO DOMICILIADO | 60 DIAS | 260 |
| PAGARÉ | 120 DIAS | 612 |
| RECIBO DOMICILIADO | 90 DIAS | 290 |
| PAGARÉ | 30, 60 DIAS | 636 |
| RECIBO DOMICILIADO | 120 DIAS | 212 |
| PAGARÉ | 30, 90 DIAS | 639 |
| RECIBO DOMICILIADO | 150 DIAS | 215 |
| PAGARÉ | 60, 90 DIAS | 669 |
| RECIBO DOMICILIADO | 180 DIAS | 218 |
| PAGARÉ | 30, 60, 90 DIAS | 637 |
| RECIBO DOMICILIADO | 30, 60 DIAS | 236 |
| RECIBO DOMICILIADO | 30, 90 DIAS | 239 |
| TRANSFERENCIA |  | 7xx |
| RECIBO DOMICILIADO | 60, 90 DIAS | 269 |
| TRANSFERENCIA | CONTADO / A LA VISTA | 700 |
| RECIBO DOMICILIADO | 30, 60, 90 DIAS | 237 |
| TRANSFERENCIA | 30 DIAS | 730 |
| TRANSFERENCIA | 45 DIAS | 745 |
| TARJETA |  | 3xx |
| TRANSFERENCIA | 60 DIAS | 760 |
| TARJETA /TPV |  | 300 |
| TRANSFERENCIA | 90 DIAS | 790 |
| TRANSFERENCIA | 120 DIAS | 712 |
| REMESA DOCUMENTARIA |  | 5xx |
| TRANSFERENCIA | 30, 60 DIAS | 736 |
| REMESA DOCUMENTARIA | CONTADO / A LA VISTA | 500 |
| TRANSFERENCIA | 30, 90 DIAS | 739 |
| REMESA DOCUMENTARIA | 30 DIAS | 530 |
| TRANSFERENCIA | 60, 90 DIAS | 769 |
| REMESA DOCUMENTARIA | 45 DIAS | 545 |
| TRANSFERENCIA | 30, 60, 90 DIAS | 737 |
| REMESA DOCUMENTARIA | 60 DIAS | 560 |
| TRANSFERENCIA | 30, 60, 90, 120 DIAS | 731 |
| REMESA DOCUMENTARIA | 90 DIAS | 590 |
| REMESA DOCUMENTARIA | 120 DIAS | 512 |
| REMESA DOCUMENTARIA | 30, 60 DIAS | 536 |
| CREDITO DOCUMENTARIO |  | 8xx |
| REMESA DOCUMENTARIA | 30, 90 DIAS | 539 |
| CARTA DE CREDITOS | 30 DIAS | 830 |
| REMESA DOCUMENTARIA | 60, 90 DIAS | 569 |
| CARTA DE CREDITOS | 60 DIAS | 860 |
| REMESA DOCUMENTARIA | 30, 60, 90 DIAS | 537 |
| CARTA DE CREDITOS | 90 DIAS | 890 |
| CARTA DE CREDITOS | 30, 60 DIAS | 836 |
| CARTA DE CREDITOS | 30, 90 DIAS | 839 |
| CARTA DE CREDITOS | 60, 90 DIAS | 869 |
| CARTA DE CREDITOS | 120 DIAS | 812 |
| CONFIRMING / AVAL BANCARIO / FACTORING |  | 9xx |
| CONFIRMING | 0 DIAS (CONTADO) | 900 |
| CONFIRMING | 30 DIAS | 930 |
| CONFIRMING | 60 DIAS | 960 |
| CONFIRMING | 90 DIAS | 990 |
| CONFIRMING | 30, 60 DIAS | 936 |
| CONFIRMING | 30, 90 DIAS | 939 |
| CONFIRMING | 60, 90 DIAS | 969 |
| CONFIRMING | 60,90 120 DIAS | 961 |
| CONFIRMING | 120 DIAS | 912 |
| CONFIRMIG | 180 DIAS | 918 |

## Riesgo de migración

Antes de importar, hay que crear los campos Studio, maestros de pago, condiciones y modos de pago. Si no existen, Odoo no resolverá las columnas externas correctamente.
