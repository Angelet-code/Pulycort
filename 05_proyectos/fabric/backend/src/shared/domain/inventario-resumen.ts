/**
 * Existencias agregadas por material, para el mapa (treemap) de inventario.
 * Concepto COMPARTIDO por las formas de existencia: `bloques` (m³, del stock real
 * de Odoo `stock_lot` on-hand) y `tablas`/`losas` (m²). El frontend dimensiona
 * cada rectángulo por `cantidad`. Vive en `shared` porque lo agregan dos módulos
 * (bloque-inventario y tabla-inventario) y el use-case del resumen los une.
 */
export type FormaInventario = 'bloques' | 'tablas' | 'losas';

/** Existencias de un material concreto dentro de una forma. */
export type ResumenMaterial = {
  /** Nombre legible del material (deduplicado entre los dos id-espacios de Odoo). */
  material: string;
  /** Magnitud que dimensiona el treemap: m³ (bloques) o m² (tablas/losas). */
  cantidad: number;
  /** Nº de piezas en existencias que componen esa cantidad. */
  piezas: number;
};

/** Existencias por material de una forma. */
export type ResumenInventario = {
  forma: FormaInventario;
  /** Unidad de `cantidad`: 'm³' (bloques) o 'm²' (tablas/losas). */
  unidad: string;
  /** true si esta forma aún no tiene fuente conectada (hoy solo losas). */
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

/** Acumulador por material mientras se agrega una forma. */
export type AcumuladorMaterial = Map<string, { cantidad: number; piezas: number }>;

/**
 * Construye el `ResumenInventario` de una forma a partir de su acumulador por
 * material: ordena de mayor a menor `cantidad`, redondea a 2 decimales y suma los
 * totales. `pendiente` es false (la forma SÍ tiene fuente; una forma sin fuente no
 * llama aquí, la stubea el use-case). Lo comparten los inventarios de bloques (m³)
 * y de tablas (m²) para no duplicar la agregación.
 */
export function construirResumen(
  forma: FormaInventario,
  unidad: string,
  porMaterial: AcumuladorMaterial,
): ResumenInventario {
  const materiales = [...porMaterial.entries()]
    .map(([material, v]) => ({
      material,
      cantidad: Math.round(v.cantidad * 100) / 100,
      piezas: v.piezas,
    }))
    .sort((a, b) => b.cantidad - a.cantidad);
  return {
    forma,
    unidad,
    pendiente: false,
    totalCantidad:
      Math.round(materiales.reduce((s, m) => s + m.cantidad, 0) * 100) / 100,
    totalPiezas: materiales.reduce((s, m) => s + m.piezas, 0),
    materiales,
  };
}

/** Forma stub `pendiente` (sin fuente conectada): armazón vacío para el treemap. */
export function formaPendiente(
  forma: FormaInventario,
  unidad: string,
): ResumenInventario {
  return {
    forma,
    unidad,
    pendiente: true,
    totalCantidad: 0,
    totalPiezas: 0,
    materiales: [],
  };
}
