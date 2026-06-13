import type { EstadoCicloBloque } from './estado-ciclo';

export type { EstadoCicloBloque } from './estado-ciclo';

/**
 * Alta de bloque en almacén tal y como llega en la tabla `lot_block_creation`
 * de Odoo: cada bloque recibido con la medida declarada por el proveedor
 * (`*_supplier`, NOT NULL en la tabla) y la medida tomada en fábrica
 * (`*_mrp`, null mientras no se mida).
 *
 * `material` es `product_id_tmpl` (la plantilla de producto de Odoo, el
 * código de material confirmado del catálogo). El **proveedor** es la columna
 * `ref` (texto con el nombre legible: Arival, Visemar, Levantina…); el FK
 * `supplier` (res_partner) viene vacío en datos reales y `operario`
 * (hr_employee) es un FK de Odoo sin resolver.
 *
 * **Unidades de las medidas: metros.** En datos reales `largo/alto/grueso`
 * llegan como ~2,8 (no ~280), así que el m³ con la antigua suposición de cm
 * (÷10⁶) salía ~0 en toda la columna. Por eso `m3Supplier`/`m3Mrp` se derivan
 * aquí como `largo × alto × grueso` (metros → m³ directos) y `mermaPct` de
 * esos volúmenes. La unidad sigue pendiente de confirmar oficialmente con
 * TotWare/Odoo (00_gestion/TAREAS.md).
 *
 * `estadoCiclo` es el estado de vida derivado de los partes de trabajo del
 * bloque (no está en `lot_block_creation`); ver `estado-ciclo.ts`.
 */
export type BloqueInventario = {
  id: number;
  name: string | null;
  ref: string | null;
  material: number | null;
  variantId: number | null;
  attributeValueId: number | null;
  operario: number | null;
  supplier: number | null;
  poId: number | null;
  pickingId: number | null;
  locationDestId: number | null;
  thirdPartyMaterial: boolean | null;
  deliveryDone: boolean | null;
  createLotDone: boolean | null;
  largoSupplier: number;
  altoSupplier: number;
  gruesoSupplier: number;
  largoMrp: number | null;
  altoMrp: number | null;
  gruesoMrp: number | null;
  /** Volumen del proveedor en m³ (`largo × alto × grueso`, metros). */
  m3Supplier: number;
  /** Volumen de fábrica en m³; null mientras no haya medida de fábrica. */
  m3Mrp: number | null;
  /** Merma de compra: `(m³ proveedor − m³ fábrica) / m³ proveedor × 100`; null si falta dato. */
  mermaPct: number | null;
  createDate: Date | null;
  writeDate: Date | null;
  estadoCiclo: EstadoCicloBloque;
};

/** Filtros y paginación para el listado de bloques de inventario. */
export type FiltrosBloqueInventario = {
  material: number | null;
  /** Nombre de proveedor exacto (columna `ref`); null = todos. */
  proveedor: string | null;
  /** Estado de ciclo de vida (campo derivado, se filtra en memoria); null = todos. */
  estado: EstadoCicloBloque | null;
  /** Búsqueda por nombre o referencia del bloque (contiene, sin mayúsculas). */
  q: string | null;
  /** Ventana de create_date; `hasta` es exclusivo (inicio del día siguiente). */
  desde: Date | null;
  hasta: Date | null;
  limit: number;
  offset: number;
};

/** Página de bloques con catálogos para los filtros de la UI. */
export type PaginaBloqueInventario = {
  total: number;
  limit: number;
  offset: number;
  items: BloqueInventario[];
  /** Materiales (product_id_tmpl) y proveedores (`ref`) distintos de toda la tabla. */
  materiales: number[];
  proveedores: string[];
};
