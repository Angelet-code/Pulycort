/**
 * Existencias agregadas por material, para el mapa (treemap) de inventario.
 *
 * Tres FORMAS de existencia: `bloques` (m³, dato real del stock de Odoo:
 * `stock_lot` on-hand vía `stock_quant`), `tablas` y `losas` (m², aún SIN fuente
 * conectada → `pendiente: true`, sin inventar nada). El frontend dimensiona cada
 * rectángulo por `cantidad`.
 *
 * "En existencias" = bloques con stock real on-hand: lote (`block`/`othermaterial`)
 * con `stock_quant.quantity > 0` en una ubicación interna. Lo calcula el backend;
 * el frontend solo pinta.
 */
export type FormaInventario = 'bloques' | 'tablas' | 'losas';

/** Existencias de un material concreto dentro de una forma. */
export type ResumenMaterial = {
  /** Nombre legible del material (deduplicado entre los dos id-espacios de Odoo). */
  material: string;
  /** Magnitud que dimensiona el treemap: m³ (bloques) o m² (tablas/losas). */
  cantidad: number;
  /** Nº de piezas en existencias (bloques) que componen esa cantidad. */
  piezas: number;
};

/** Existencias por material de una forma. */
export type ResumenInventario = {
  forma: FormaInventario;
  /** Unidad de `cantidad`: 'm³' (bloques) o 'm²' (tablas/losas). */
  unidad: string;
  /** true si esta forma aún no tiene fuente conectada (tablas/losas hoy). */
  pendiente: boolean;
  /** Suma de `cantidad` de todos los materiales (m³/m²). */
  totalCantidad: number;
  /** Suma de `piezas` de todos los materiales. */
  totalPiezas: number;
  /** Materiales ordenados de mayor a menor `cantidad`. */
  materiales: ResumenMaterial[];
};

/** Las tres formas de existencia juntas, para el mapa de inventario. */
export type InventarioVistaConjunta = {
  generadoEn: string;
  /** Una entrada por forma, en orden [bloques, tablas, losas]. */
  formas: ResumenInventario[];
};
