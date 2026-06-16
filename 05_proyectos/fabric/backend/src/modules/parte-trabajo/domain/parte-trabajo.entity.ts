/**
 * Parte de trabajo registrado por los operarios, tal y como llega en la
 * tabla `parte_trabajo_mapeada` (datos reales de TotWare mapeados a Odoo).
 *
 * `operacion` 1-4 está confirmada por Pulycort (1 colocar, 2 aserrar,
 * 3 salida, 4 paquetes; la 4 es la única con m²/tablas); la op. 0 no es fase
 * y su detalle está en `accion`, código aún sin decodificar (igual que los
 * `operacion` 5/10/11). `material`, `operario_1/2`, `material_recibido`
 * e `id_bloque` son FKs de Odoo; se exponen en crudo, sin resolver.
 */
export type ParteTrabajo = {
  id: number;
  nTelar: string | null;
  operario1: number | null;
  operario2: number | null;
  /** Columna fuente heredada `n_bloque`; se conserva por compatibilidad. */
  nBloque: number | null;
  /** Matricula operativa confirmada para partes/maquinas. */
  pmLote: number | null;
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
  /**
   * `fecha_hora` efectiva. Si la fila venía con el año mal estampado (+1, el
   * lote de backfill del 31-dic-2025), aquí va ya corregida (−1 año) y se usa
   * para ordenar, filtrar y mostrar. Ver `shared/.../fecha-remapeo`.
   */
  fechaHora: Date | null;
  /** Valor original de `fecha_hora` tal cual en la tabla, antes de corregir el año. */
  fechaHoraOriginal: Date | null;
  /** true si se corrigió el año (señal de alerta: la fecha está remapeada). */
  fechaRemapeada: boolean;
  createDate: Date | null;
  idBloque: number | null;
  metrosCubicos: number | null;
  metrosCuadradosTablas: number | null;
  materialRecibido: number | null;
};

/** Filtros y paginación para el listado de partes. */
export type FiltrosParteTrabajo = {
  /** Nº de lote (n_bloque) exacto; null = todos. */
  lote: number | null;
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
