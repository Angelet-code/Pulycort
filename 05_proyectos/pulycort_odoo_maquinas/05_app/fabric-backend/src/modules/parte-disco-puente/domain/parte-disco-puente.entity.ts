/**
 * Parte del disco puente ya mapeado, tal y como llega en la tabla
 * `parte_discopuente_mapeada` (datos reales de TotWare mapeados a Odoo).
 *
 * Lectura en crudo: se expone lo que trae la tabla, sin cálculos derivados.
 * `operacion`, `acabado` y `discoPuenteN` son códigos/textos de TotWare sin
 * tabla de significados confirmada; `material`, `materialRecibido`, `operario1/2`
 * e `idBloque` son FKs de Odoo y se exponen en crudo. `metro2Entrada/Salida` y
 * `eficienciaM2` llegan ya calculados por el mapeador. Las 8 medidas de tabla
 * (`largoTablas`/`altoTablas`) se agrupan en arrays de longitud 8.
 */
export type ParteDiscoPuente = {
  id: number;
  discoPuenteN: string | null;
  operario1: number | null;
  operario2: number | null;
  nBloque: number | null;
  idBloque: number | null;
  /** Si el bloque está dado de alta en el inventario de Odoo (lot_block_creation). */
  enInventarioOdoo: boolean | null;
  /** Si el n_bloque existe en el padrón de máquina (bloque_maquinas); false = avisar. */
  bloqueConocido: boolean;
  material: number | null;
  materialRecibido: number | null;
  operacion: string | null;
  acabado: string | null;
  largo: number | null;
  alto: number | null;
  grueso: number | null;
  nPaquete: number | null;
  nTablas: number | null;
  /** Medidas de las hasta 8 tablas del parte (índice 0 = tabla 1). */
  largoTablas: (number | null)[];
  altoTablas: (number | null)[];
  gruesoTablas: number | null;
  consumo: number | null;
  metro2Entrada: number | null;
  metro2Salida: number | null;
  eficienciaM2: number | null;
  fecha: Date | null;
  fechaHora: Date | null;
  createDate: Date | null;
  /** true si la lectura es sospechosa; hoy solo: fecha declarada en el futuro. */
  sospechosa: boolean;
  motivosSospecha: string[];
};

/** Filtros y paginación para el listado de partes de disco puente. */
export type FiltrosParteDiscoPuente = {
  discoPuenteN: string | null;
  material: number | null;
  operacion: string | null;
  /** Ventana de fecha_hora; `hasta` es exclusivo (inicio del día siguiente). */
  desde: Date | null;
  hasta: Date | null;
  limit: number;
  offset: number;
};

/** Página de partes con catálogos para los filtros de la UI. */
export type PaginaParteDiscoPuente = {
  total: number;
  limit: number;
  offset: number;
  items: ParteDiscoPuente[];
  /** Valores distintos de toda la tabla, para los selectores de filtro. */
  discosPuente: string[];
  materiales: number[];
  operaciones: string[];
};
