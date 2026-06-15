/**
 * Constantes físicas del proceso de corte. Son hechos del dominio (no del
 * mock): la UI, el validador y la simulación las comparten desde aquí.
 */

/** Telares existentes en la nave. */
export const TELAR_IDS = [1, 2, 3, 4];

/** Espesor estándar de tabla (fallback de la estimación cuando no hay parte). */
export const ESPESOR_TABLA_CM = 2;

/**
 * Espesores de corte habituales (cm) según las tarifas de aserrado en telar.
 * El espesor real de cada bloque lo trae el parte (`grueso_tablas`); esta serie
 * solo alimenta la variación de la demo.
 */
export const ESPESORES_TABLA_CM = [1, 1.5, 2, 3] as const;

/** Anchura de corte (kerf) del fleje. */
export const KERF_FLEJE_CM = 0.8;

/** Altura del bastidor levantado, sin bloque (tope físico aproximado). */
export const ALTURA_BASTIDOR_REPOSO_MM = 2150;
