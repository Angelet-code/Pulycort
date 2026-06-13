/**
 * Constantes físicas del proceso de corte. Son hechos del dominio (no del
 * mock): la UI, el validador y la simulación las comparten desde aquí.
 */

/** Telares existentes en la nave. */
export const TELAR_IDS = [1, 2, 3, 4];

/** Espesor estándar de tabla. */
export const ESPESOR_TABLA_CM = 2;

/** Anchura de corte (kerf) del fleje. */
export const KERF_FLEJE_CM = 0.8;

/** Altura del bastidor levantado, sin bloque (tope físico aproximado). */
export const ALTURA_BASTIDOR_REPOSO_MM = 2150;
