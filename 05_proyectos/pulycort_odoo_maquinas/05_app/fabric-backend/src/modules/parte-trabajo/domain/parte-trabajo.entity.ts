/**
 * Parte de trabajo registrado por los operarios, tal y como llega en la
 * tabla `parte_trabajo_mapeada` (datos reales de TotWare mapeados a Odoo).
 *
 * `operacion` y `accion` son códigos sin tabla de significados confirmada
 * (solo se deduce de los datos que la operación '4' es "hacer paquetes",
 * la única con m²/tablas). `material`, `operario_1/2`, `material_recibido`
 * e `id_bloque` son FKs de Odoo; se exponen en crudo, sin resolver.
 */
export type ParteTrabajo = {
  id: number;
  nTelar: string | null;
  operario1: number | null;
  operario2: number | null;
  nBloque: number | null;
  material: number | null;
  largo: number | null;
  alto: number | null;
  grueso: number | null;
  operacion: string | null;
  nPaquete: number | null;
  nTablas: number | null;
  largoTablas: number | null;
  altoTablas: number | null;
  gruesoTablas: number | null;
  consumo: number | null;
  /** Si el bloque está dado de alta en el inventario de Odoo (lot_block_creation). */
  enInventarioOdoo: boolean | null;
  /** Si el n_bloque existe en el padrón de máquina (bloque_maquinas); false = avisar. */
  bloqueConocido: boolean;
  accion: string | null;
  fechaHora: Date | null;
  createDate: Date | null;
  idBloque: number | null;
  metrosCubicos: number | null;
  metrosCuadradosTablas: number | null;
  materialRecibido: number | null;
};

/** Filtros y paginación para el listado de partes. */
export type FiltrosParteTrabajo = {
  telarN: string | null;
  material: number | null;
  operacion: string | null;
  /** Ventana de fecha_hora; `hasta` es exclusivo (inicio del día siguiente). */
  desde: Date | null;
  hasta: Date | null;
  limit: number;
  offset: number;
};

/** Página de partes con catálogos para los filtros de la UI. */
export type PaginaParteTrabajo = {
  total: number;
  limit: number;
  offset: number;
  items: ParteTrabajo[];
  /** Materiales y operaciones distintos de toda la tabla. */
  materiales: number[];
  operaciones: string[];
};
