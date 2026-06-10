---
tags: [pulycort, pendientes, odoo, produccion]
generated: 2026-06-10
source: "síntesis de reuniones, cuestionario y auditoría"
---
# Puntos abiertos

## Odoo y datos maestros

- [ ] Decidir si acabado genera variante, vive solo en lote o se usa en ambos sitios.
- [ ] Crear tabla operación de máquina -> acabado resultante.
- [ ] Confirmar cómo reflejar precio de venta si el acabado se conoce antes o después del lote.
- [ ] Confirmar modelo de producto personalizado y medidas fuera de tarifa.
- [ ] Definir campos obligatorios de lote: largo, ancho, grueso, volumen, acabado, ubicación, palet/cajón.
- [ ] Confirmar plan Odoo contratado y acceso real a API/personalización.

## Producción y máquinas

- [ ] Revisar tablas de eventos/incidencias de Indasel.
- [ ] Confirmar significado final de campos `dato_1`, `dato_2`, etc. por máquina.
- [ ] Confirmar cómo se calcula consumo eléctrico en cada máquina.
- [ ] Validar traslado de códigos de empleado desde Odoo Community.
- [ ] Definir cómo se enlaza palet de salida del disco puente con entrada/salida de pulidora.
- [ ] Resolver qué datos genera SIMEC/Indasel y dónde quedan guardados.

## Costes y tarifas

- [ ] Añadir costes indirectos a precios de máquina.
- [ ] Confirmar precio máquina por familia y vigencia anual.
- [ ] Revisar operaciones sin precio de venta o sin precio máquina.
- [ ] Confirmar grupo 84 marcado como revisar.

## Clientes, proveedores y pagos

- [ ] Crear campos Studio antes de importar partners.
- [ ] Crear condiciones y modos de pago en Odoo.
- [ ] Revisar provincias/países que no hagan match automático.
- [ ] Validar límites de riesgo y campos de seguro.

## Auditoría operativa

- [ ] Ver 5-10 pedidos reales completos de punta a punta.
- [ ] Medir tiempos de respuesta, presupuestación, producción, embalaje y facturación.
- [ ] Identificar tareas repetitivas de mayor impacto.
- [ ] Elegir primer piloto: bandeja inteligente, documentos o diagnóstico máquinas.
