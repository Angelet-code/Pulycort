/**
 * Bloque en existencias del inventario. El inventario UNE DOS ERAS de datos
 * disjuntas (verificado contra BD el 2026-06-14), porque ninguna sola es
 * completa:
 *
 * - `fuente='stock'`: lote de `stock_lot` on-hand (con `stock_quant` en ubicación
 *   interna y `quantity > 0`). En la práctica es un SNAPSHOT histórico de Odoo
 *   (nº de bloque ≤ 45999, cargado ago-2025): `stock_quant` dejó de recibir
 *   bloques nuevos, así que por sí solo INFRACUENTA.
 * - `fuente='alta'`: bloque recibido recientemente (nº ≥ 46003) registrado en
 *   `lot_block_creation` (el log VIVO de recepción) que aún no ha pasado por el
 *   stock de Odoo y no consta consumido (sin aserrado/salida en
 *   `parte_trabajo_mapeada`, ni en `produccion_mapeada`/`parte_discopuente_mapeada`,
 *   ni `delivery_done`). Sin esta era faltarían los bloques sin cortar en patio.
 *
 * Las dos series de nº de bloque son disjuntas, así que unirlas NO duplica.
 *
 * `material` es el id de producto (`stock_lot.product_id`, o en las altas
 * `product_id` ?? `product_id_tmpl`) y `materialNombre` su nombre legible
 * resuelto contra `product_template` (sin el prefijo "M3 BLOQUE"). `tipo` es
 * `type_product_lot` para el stock (`block`/`othermaterial`; `tables`/`slabs`
 * quedan fuera) y `block` para las altas. `ubicacion` es la ubicación on-hand
 * (p. ej. "WH/Stock") en el stock y `null` en las altas (aún sin ubicación Odoo).
 *
 * **Unidades de las medidas: metros**; `m3Supplier`/`m3Mrp` se derivan con
 * `volumenBloqueM3` (`shared/domain/medidas-bloque`, normaliza por umbral las
 * dimensiones que vengan en cm). La merma necesita las dos medidas y casi nunca
 * está disponible (la de fábrica se toma al procesar el bloque).
 */
export type TipoBloque = 'block' | 'othermaterial';

/** Era/origen de un bloque del inventario (las dos fuentes que se unen). */
export type FuenteBloque = 'stock' | 'alta';

export type BloqueInventario = {
  /** Id de la fila origen (`stock_lot.id` o `lot_block_creation.id` según `fuente`). */
  id: number;
  /**
   * Era/origen del dato: `stock` = existencias on-hand del snapshot de Odoo
   * (`stock_lot` + `stock_quant`); `alta` = bloque recibido reciente de
   * `lot_block_creation` aún no procesado por el stock y no consumido. Ver doc.
   */
  fuente: FuenteBloque;
  /** Nº de bloque (`stock_lot.name` o `lot_block_creation.name`). */
  name: string | null;
  /** Id de producto del material; null si no se resuelve. */
  material: number | null;
  /**
   * Etiqueta de material lista para pintar/filtrar: el nombre real de
   * `product_template` (sin "M3 BLOQUE") o, si el id no tiene fila, "Material
   * {id}". null solo si no hay material. Misma fuente que el desplegable.
   */
  materialNombre: string | null;
  /** Clasificación del lote (`type_product_lot`): bloque estándar u otro material. */
  tipo: TipoBloque;
  /** Nombre legible de la ubicación on-hand (`stock_location.complete_name`). */
  ubicacion: string | null;
  largoSupplier: number | null;
  altoSupplier: number | null;
  gruesoSupplier: number | null;
  largoMrp: number | null;
  altoMrp: number | null;
  gruesoMrp: number | null;
  /** Volumen del proveedor en m³ (`largo × alto × grueso`, metros); null sin medida. */
  m3Supplier: number | null;
  /** Volumen de fábrica en m³; null mientras no haya medida de fábrica. */
  m3Mrp: number | null;
  /**
   * La medida de proveedor es físicamente imposible aun tras normalizar cm→m
   * (corrupción real): su m³ no es fiable y la UI lo oculta con ⚠.
   */
  m3SupplierImposible: boolean;
  /** Igual para la medida de fábrica (mrp): su m³ y la merma quedan ocultos. */
  m3MrpImposible: boolean;
  /** Merma de compra: `(m³ proveedor − m³ fábrica) / m³ proveedor × 100`; null si falta dato o alguna medida es imposible. */
  mermaPct: number | null;
  createDate: Date | null;
  writeDate: Date | null;
};

/** Filtros y paginación para el listado de bloques en existencias. */
export type FiltrosBloqueInventario = {
  /**
   * Nombre de material (no id): un mismo material puede tener varios ids de Odoo,
   * así que se filtra por nombre para que case todos. null = todos.
   */
  material: string | null;
  /** Búsqueda por nº de bloque (`name`, contiene, sin mayúsculas). */
  q: string | null;
  /** Ventana de create_date; `hasta` es exclusivo (inicio del día siguiente). */
  desde: Date | null;
  hasta: Date | null;
  limit: number;
  offset: number;
};

/** Página de bloques con catálogo de materiales para el filtro de la UI. */
export type PaginaBloqueInventario = {
  total: number;
  limit: number;
  offset: number;
  items: BloqueInventario[];
  /**
   * Nombres de material distintos de los bloques en existencias, para el
   * desplegable (deduplicados). Ordenados.
   */
  materiales: string[];
};
