-- Verificación de la fuente del inventario de TABLAS (consultas READ-ONLY).
--
-- Paso 0 del inventario de tablas (Fabric): confirma contra la BD REAL que
-- `stock_lot` tiene lotes de tabla on-hand antes de dar por buena la Fase 1.
-- Este PC suele estar en modo Demo/offline, así que se lanza desde la red de
-- fábrica (host de DATABASE_URL). Ver 00_gestion/TAREAS.md (inventario de tablas).
--
-- Qué resuelve cada consulta:
--   (1) el valor exacto de `type_product_lot` (¿'tables'? ¿'slabs'? ¿otros?);
--   (2) cuántos lotes de tabla hay realmente on-hand (la fuente del listado);
--   (3) qué columnas vienen pobladas → decide unidad de medidas y si se puede
--       derivar el m² (semántica de qty_creation / packages_tables);
--   (4) una muestra para inspección visual.

-- (1) Valores y recuento de type_product_lot.
SELECT type_product_lot, COUNT(*) AS lotes
FROM stock_lot
GROUP BY type_product_lot
ORDER BY lotes DESC;

-- (2) Lotes de TABLA con existencias on-hand (misma definición que bloques:
--     quantity > 0 en ubicación interna). Si sale 0, las tablas no se stockean.
SELECT COUNT(DISTINCT sl.id) AS lotes_tabla_on_hand
FROM stock_lot sl
JOIN stock_quant sq      ON sq.lot_id = sl.id
JOIN stock_location loc  ON loc.id = sq.location_id
WHERE sl.type_product_lot = 'tables'
  AND sq.quantity > 0
  AND loc.usage = 'internal';

-- (3) Cobertura de columnas en esos lotes (medidas, paquetes, cantidades,
--     acabado): rangos para detectar la unidad (m vs cm) y el significado de
--     qty_creation antes de derivar m² (hoy m² = null en real, no se inventa).
SELECT
  COUNT(*)                AS filas,
  COUNT(sl.largo_supplier)  AS con_largo,  MIN(sl.largo_supplier),  MAX(sl.largo_supplier),
  COUNT(sl.alto_supplier)   AS con_alto,   MIN(sl.alto_supplier),   MAX(sl.alto_supplier),
  COUNT(sl.grueso_supplier) AS con_grueso, MIN(sl.grueso_supplier), MAX(sl.grueso_supplier),
  COUNT(sl.packages_tables) AS con_paquetes, MIN(sl.packages_tables), MAX(sl.packages_tables),
  COUNT(sl.qty_creation)    AS con_qty,    MIN(sl.qty_creation),    MAX(sl.qty_creation),
  COUNT(sl.finished)        AS con_acabado
FROM stock_lot sl
JOIN stock_quant sq      ON sq.lot_id = sl.id
JOIN stock_location loc  ON loc.id = sq.location_id
WHERE sl.type_product_lot = 'tables'
  AND sq.quantity > 0
  AND loc.usage = 'internal';

-- (4) Muestra de lotes de tabla on-hand para inspección visual.
SELECT sl.id, sl.name, sl.product_id, sl.type_product_lot,
       sl.largo_supplier, sl.alto_supplier, sl.grueso_supplier,
       sl.packages_tables, sl.qty_creation, sl.finished,
       loc.complete_name AS ubicacion, sq.quantity
FROM stock_lot sl
JOIN stock_quant sq      ON sq.lot_id = sl.id
JOIN stock_location loc  ON loc.id = sq.location_id
WHERE sl.type_product_lot = 'tables'
  AND sq.quantity > 0
  AND loc.usage = 'internal'
ORDER BY sl.create_date DESC
LIMIT 20;
