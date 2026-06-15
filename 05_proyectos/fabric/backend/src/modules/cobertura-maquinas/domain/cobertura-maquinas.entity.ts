/**
 * Mapa de cobertura de las máquinas de planta: para cada máquina del catálogo
 * (sala de aserrado M3 + sala de máquinas M2) indica de qué tabla real sale su
 * dato y en qué estado está su integración en Fabric.
 *
 * El catálogo de máquinas es dato curado (ver
 * `02_conocimiento/obsidian/08 Maquinas operaciones y produccion.md`); el
 * VOLUMEN de cada fuente (filas, lotes, última actividad) lo calcula el backend
 * desde la BD real. Lo que no tiene fuente conectada llega con stats en null
 * (la UI lo pinta como "—"): no se inventa actividad donde no la hay.
 */

/** Sección de planta: M3 (bloque → tabla) o M2 (tabla → losa, sala de máquinas). */
export type SeccionPlanta = 'M3' | 'M2';

/**
 * Estado de integración de la máquina en Fabric:
 * - `integrada`: su dato se lee y se atribuye a esta máquina concreta.
 * - `parcial`: existe dato pero no se puede atribuir a esta máquina (p. ej. los
 *   3 discopuentes comparten un único `disco_puente_n`).
 * - `pendiente`: aún sin fuente de datos conectada.
 */
export type EstadoIntegracion = 'integrada' | 'parcial' | 'pendiente';

/** Familia de máquina, para agrupar el mapa. */
export type FamiliaMaquina =
  | 'telar'
  | 'disco_puente'
  | 'reforzadora'
  | 'pulidora'
  | 'corte'
  | 'cnc'
  | 'acabado'
  | 'taller';

/** Cobertura de datos de una máquina del catálogo de planta. */
export type CoberturaMaquina = {
  /** Código del catálogo curado (1–19). */
  codigo: number;
  /** Nombre tal cual el catálogo de planta. */
  nombre: string;
  seccion: SeccionPlanta;
  familia: FamiliaMaquina;
  /** Tabla mapeada que alimenta esta máquina; null si aún no hay fuente. */
  fuenteDatos: string | null;
  estado: EstadoIntegracion;
  /** Filas reales atribuibles a esta máquina; null si no aplica/sin fuente. */
  filas: number | null;
  /** Lotes (PM) distintos vistos para esta máquina; null si no aplica. */
  lotes: number | null;
  /** Última actividad registrada (ISO); null si no aplica/sin datos. */
  ultimaActividad: Date | null;
  /** Nota de integración (p. ej. la discrepancia 3 máquinas físicas vs 1 flujo). */
  nota: string | null;
};

/** El catálogo de planta completo con su cobertura, para el mapa de máquinas. */
export type CoberturaMaquinas = {
  generadoEn: string;
  /** Una entrada por máquina del catálogo, en orden de código. */
  maquinas: CoberturaMaquina[];
};
