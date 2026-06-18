/**
 * Tabla en existencias del inventario. Gemelo simétrico del inventario de
 * bloques y, como él, UNE DOS ERAS de datos (verificado contra BD 2026-06-18):
 *
 * - `fuente='stock'`: lote `type_product_lot='tables'` de `stock_lot` on-hand
 *   (con `stock_quant` en ubicación interna y `quantity > 0`). Son las
 *   existencias confirmadas por Odoo (hoy solo 7 lotes).
 * - `fuente='alta'`: paquete de tablas dado de entrada en `lot_tables_creation`
 *   (el log VIVO de altas, gemelo de `lot_block_creation`) que aún no consta en el
 *   stock de Odoo y no ha salido. Sin esta era la vista infracontaba (mostraba 7
 *   de las 115 altas) — el origen de "veo poquísimas tablas".
 *
 * Una tabla cuyo lote SÍ figura en `stock_lot` pero está agotado (0 on-hand) se
 * considera ya salida del almacén y NO se muestra: es el equivalente de "bloque
 * consumido" para las tablas (Odoo rastrea su depleción, a diferencia de los
 * bloques). Por eso el alta solo aporta los lotes SIN reflejo en `stock_lot`. La
 * frontera entre eras (qué altas con lote agotado son envíos reales vs. snapshot
 * obsoleto) queda pendiente de confirmar — ver 00_gestion/TAREAS.md.
 *
 * `material` es el id de producto (era nueva `product_id_tmpl` "M2 TABLA <piedra>",
 * era antigua `product_id` de telar) y `materialNombre` su nombre legible resuelto
 * contra `product_template` (sin el prefijo de forma). `tipo` es el
 * `type_product_lot`. `ubicacion` es la ubicación on-hand (p. ej. "WH/Stock") en
 * el stock y `null` en las altas (aún sin ubicación Odoo).
 *
 * **Pendiente de confirmar (00_gestion/TAREAS.md), por la regla "no inventar":**
 * - Las medidas (`largo`/`alto`/`grueso`) se devuelven en METROS, normalizadas
 *   cm→m por umbral. largo/alto llegan limpios; el `grueso` viene en unidades
 *   inconsistentes entre lotes (verificado contra BD 2026-06-18: 0,02 / 0,2 / 20
 *   en lotes contiguos) y su semántica (¿espesor de tabla?) está sin confirmar.
 * - `paquetes` (`packages_tables`) y `nTablas` (`qty_creation` en stock /
 *   `n_tables` en el alta) se devuelven en crudo.
 * - `m2`: en la era **alta** SÍ se deriva = `n_tables` × largo × alto (recuento
 *   explícito, medidas por tabla en metros; el grueso no entra). En la era
 *   **stock** se deja `null`: el recuento on-hand es ambiguo (`qty_creation` al
 *   alta vs la cantidad de `stock_quant`), no se inventa un área no garantizada.
 */
export type TipoTabla = 'tables' | 'slabs';

/** Era/origen de una tabla del inventario (las dos fuentes que se unen). */
export type FuenteTabla = 'stock' | 'alta';

export type TablaInventario = {
  /** Id de la fila origen (`stock_lot.id` o `lot_tables_creation.id` según `fuente`). */
  id: number;
  /**
   * Era/origen del dato: `stock` = existencias on-hand de Odoo (`stock_lot` +
   * `stock_quant`); `alta` = paquete recibido reciente de `lot_tables_creation`
   * aún sin reflejo en el stock. Ver doc.
   */
  fuente: FuenteTabla;
  /** Nº de lote de la tabla (`stock_lot.name` o `lot_tables_creation.name`). */
  name: string | null;
  /** Id de producto del material; null si no se resuelve. */
  material: number | null;
  /**
   * Etiqueta de material lista para pintar/filtrar: nombre real de
   * `product_template` (sin "M3 BLOQUE") o "Material {id}" si el id no tiene fila.
   */
  materialNombre: string | null;
  /** Clasificación del lote (`type_product_lot`): tablas o losas. */
  tipo: TipoTabla;
  /** Nombre legible de la ubicación on-hand (`stock_location.complete_name`). */
  ubicacion: string | null;
  /** Largo del lote de tabla en metros (normalizado). */
  largo: number | null;
  /** Alto del lote de tabla en metros (normalizado). */
  alto: number | null;
  /** Grueso del lote en metros (normalizado); semántica inconsistente entre lotes, a confirmar. */
  grueso: number | null;
  /** Nº de paquetes del lote (`packages_tables`); crudo, significado a confirmar. */
  paquetes: number | null;
  /** Nº de tablas del lote (`qty_creation`); crudo, significado a confirmar. */
  nTablas: number | null;
  /** Acabado del lote (`finished`); código en crudo. */
  acabado: string | null;
  /** Superficie en m²: en altas = `n_tables` × largo × alto; null en stock (recuento on-hand ambiguo). */
  m2: number | null;
  createDate: Date | null;
  writeDate: Date | null;
};

/** Filtros y paginación del listado de tablas en existencias (espejo del de bloques). */
export type FiltrosTablaInventario = {
  /** Nombre de material (casa todas sus variantes de id de Odoo); null = todos. */
  material: string | null;
  /** Búsqueda por nº de lote (`name`, contiene, sin mayúsculas). */
  q: string | null;
  /** Ventana de create_date; `hasta` es exclusivo (inicio del día siguiente). */
  desde: Date | null;
  hasta: Date | null;
  limit: number;
  offset: number;
};

/** Página de tablas con catálogo de materiales para el filtro de la UI. */
export type PaginaTablaInventario = {
  total: number;
  limit: number;
  offset: number;
  items: TablaInventario[];
  /** Nombres de material distintos de las tablas en existencias (deduplicados). */
  materiales: string[];
};
