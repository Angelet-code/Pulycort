/**
 * Parte de la reforzadora de tablas, tal y como llega en la tabla real
 * `reforzadora_mapeada` (datos de TotWare mapeados a Odoo). La reforzadora
 * refuerza las tablas con malla + resina.
 *
 * `acabado` y `eventos` son códigos de texto sin tabla de significados
 * confirmada (no se interpretan). `n_reforzadora` HOY solo trae '1': el dato no
 * separa REFORZADORA 1 de REFORZADORA 2 SEI (ver 00_gestion/TAREAS.md).
 * `material`, `operario_1/2` son FKs de Odoo; se exponen en crudo. `largo/alto/
 * grueso` van en cm. `metrosCuadrados` lo deriva el backend de n_tablas × largo
 * × alto (cm → m²); null si falta algún dato — no se inventa.
 */
export type ParteReforzadora = {
  id: number;
  nReforzadora: string | null;
  operario1: number | null;
  operario2: number | null;
  /** Columna fuente `n_bloque`; se conserva por compatibilidad. */
  nBloque: number | null;
  /** Matrícula operativa: PM/lote. */
  pmLote: number | null;
  /** Si el n_bloque existe en el padrón de máquina (bloque_maquinas); false = avisar. */
  bloqueConocido: boolean;
  material: number | null;
  nTablas: number | null;
  /** Medidas de tabla; unidad asumida cm (pendiente de confirmar, ver TAREAS.md). */
  largo: number | null;
  alto: number | null;
  grueso: number | null;
  /** Consumo en crudo; la unidad (¿amperios?) NO está confirmada para la reforzadora. */
  consumo: number | null;
  acabado: string | null;
  eventos: string | null;
  /** m² reforzados = n_tablas × largo × alto (cm) / 10⁴; null si falta algún dato. */
  metrosCuadrados: number | null;
  fechaHora: Date | null;
  createDate: Date | null;
  sospechosa: boolean;
  motivosSospecha: string[];
};

/** Filtros y paginación para el listado de partes de la reforzadora. */
export type FiltrosParteReforzadora = {
  nReforzadora: string | null;
  material: number | null;
  acabado: string | null;
  /** Ventana de fecha_hora; `hasta` es exclusivo (inicio del día siguiente). */
  desde: Date | null;
  hasta: Date | null;
  limit: number;
  offset: number;
};

/** Página de partes con catálogos para los filtros de la UI. */
export type PaginaParteReforzadora = {
  total: number;
  limit: number;
  offset: number;
  items: ParteReforzadora[];
  /** Reforzadoras, materiales y acabados distintos de toda la tabla. */
  reforzadoras: string[];
  materiales: number[];
  acabados: string[];
};
