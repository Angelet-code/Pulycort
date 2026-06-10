---
tags: [pulycort, datos-maestros, codificacion]
generated: 2026-06-10
source: "ORDEN DE FAMILIAS, LISTADO PRODUCTOS, FAMILIAS Y ATRIBUTOS"
---
# Codificación y atributos

El modelo documental define una referencia basada en posiciones/atributos.

## Orden de atributos

| Posición | Atributo |
| --- | --- |
| 1 | ARTICULO / TRABAJO |
| 2 | PRODUCTO/familia |
| 3 | MATERIAL s/ subgrupo tipo |
| 4 | ACABADO |
| 5 | CALIDAD |
| 6 | LARGO |
| 7 | ANCHO |
| 8 | GRUESO |
| 9 | UNIDAD DE MEDIDA |

## Rangos de producto/trabajo

| Rango/código | Significado |
| --- | --- |
| PRODUCTO |  |
| XX | XXX-X-XX-XX |
| 00 | OTRAS OPERACIONES |
|  | OTROS INGRESOS GESTION |
|  | ALQUILERES |
|  | OTROS PRODUCTOS |
|  | ANTICIPOS |
| 01 AL 80 | MERCANCIA |
| 81 AL 84 | TRABAJOS ELABORACION |
| 85 | TRANSPORTES |
| 86 | HORAS TRABAJO |
| 87 AL 90 | LIBRE |
| 91 | PALET/BUNDELS |
| 92 | CAJONES |
| 93 | EMBALADO CAJAS |
| 94 | JUEGO CADENAS-CABALLETES |
| 95 AL 99 | LIBRE |

## Productos base documentados

- BLOQUE
- TABLA
- LOSA
- HUELLA
- TABICA
- ZANQUIN COMPUESTO
- ZANQUIN MONTACABALLO
- ZANQUIN CARTABON
- ZOCALO
- COMPENSADO
- CORTADO A MEDIDA
- ENCIMERA
- LAVABO
- BAÑERA
- MESA
- PALETS
- CAJONES
- BUNDELS
- JUEGO CABALLETES
- JUEGO DE CADENAS
- TRANSPORTE

## Calidades

- CLASICO
- COMERCIAL
- COMERCILA ALTO
- PRIMERA

## Dimensiones estándar

- Largo: 30, 30.5, 40, 45.7, 50, 60, 61, 62, 70, 80, 90, 100, 120, 140, 150, 160, Largo Libre
- Ancho: 7, 10, 30, 30.5, 40, 45.7, 50, 60, 61, 62, 70, 80, 90, 100, 120, 140, 150, 160
- Grueso: 1, 1.5, 2, 3

## Unidades de medida

- UNIDAD
- ML
- M2
- M3
- KG

## Lectura funcional

La codificación intenta describir qué se vende o trabaja: artículo/trabajo, producto/familia, material, acabado, calidad, largo, ancho, grueso y unidad. Para Odoo, conviene separar qué atributos generan variantes y qué datos deben guardarse en lote o en línea de pedido.
