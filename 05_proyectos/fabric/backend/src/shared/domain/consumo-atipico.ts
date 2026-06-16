/**
 * Consumo atípico de los telares: cortes por percentil de la cola derecha del
 * PROPIO telar. La potencia de los telares NO es normal (μ±σ no vale: en unos
 * telares no saltaba nunca y en otros chillaba — ver `fabric/VERIFICACION.md`),
 * así que se corta por percentil sobre las lecturas en marcha con potencia ≥ 5 kW
 * (las de 0–4 kW son parado mal etiquetado y distorsionan la base).
 *
 * Fuente ÚNICA de la lógica en el backend: la usan el validador de salud
 * (`PrismaFabricRepository`) y el coloreado del listado crudo
 * (`PrismaProduccionMapeadaRepository`). El espejo del modo Demo vive aparte en
 * `frontend/core/validador.ts`.
 */

export interface UmbralConsumo {
  alto: number;
  inusual: number;
  muy: number;
}

export type BandaConsumo = 'alto' | 'inusual' | 'muy';

/** Potencia (kW) mínima para que una lectura en marcha entre en el baseline. */
export const POTENCIA_MIN_BASELINE_KW = 5;
/** Mínimo de muestras para fiarse de los percentiles de un telar. */
export const MUESTRAS_MIN_CONSUMO = 8;
/** Cortes: top 16 % "alto", top 2,3 % "inusual", top 0,13 % "MUY alto". */
export const PCTL_CONSUMO_ALTO = 0.84;
export const PCTL_CONSUMO_INUSUAL = 0.977;
export const PCTL_CONSUMO_MUY = 0.9987;

/** percentil_cont (interpolación lineal, como PostgreSQL) sobre un array ORDENADO. */
export function percentil(ordenadas: number[], q: number): number {
  const n = ordenadas.length;
  if (n === 1) {
    return ordenadas[0];
  }
  const rango = q * (n - 1);
  const i = Math.floor(rango);
  const frac = rango - i;
  return i + 1 < n ? ordenadas[i] + frac * (ordenadas[i + 1] - ordenadas[i]) : ordenadas[i];
}

/**
 * Cortes de consumo de un telar a partir de las potencias (kW) de sus lecturas
 * EN MARCHA. Filtra las < 5 kW y exige un mínimo de muestras; null si no llega
 * (sin base fiable no se juzga lo atípico: no inventar).
 */
export function umbralConsumoDePotencias(potencias: number[]): UmbralConsumo | null {
  const muestras = potencias
    .filter((v) => Number.isFinite(v) && v >= POTENCIA_MIN_BASELINE_KW)
    .sort((a, b) => a - b);
  if (muestras.length < MUESTRAS_MIN_CONSUMO) {
    return null;
  }
  return {
    alto: percentil(muestras, PCTL_CONSUMO_ALTO),
    inusual: percentil(muestras, PCTL_CONSUMO_INUSUAL),
    muy: percentil(muestras, PCTL_CONSUMO_MUY),
  };
}

/** En qué tramo de la cola del telar cae la lectura (null = dentro de lo normal). */
export function bandaConsumo(kw: number, u: UmbralConsumo): BandaConsumo | null {
  if (kw > u.muy) {
    return 'muy';
  }
  if (kw > u.inusual) {
    return 'inusual';
  }
  if (kw > u.alto) {
    return 'alto';
  }
  return null;
}

/**
 * Intensidad 0..1 dentro de la cola para el degradado de color: 0 en el corte
 * "alto", 0,5 en "inusual" y 1 en "muy" (y por encima). Solo tiene sentido para
 * lecturas con banda; las normales devuelven 0.
 */
export function intensidadConsumo(kw: number, u: UmbralConsumo): number {
  if (kw <= u.alto) {
    return 0;
  }
  if (kw <= u.inusual) {
    return tramo(kw, u.alto, u.inusual, 0, 0.5);
  }
  if (kw <= u.muy) {
    return tramo(kw, u.inusual, u.muy, 0.5, 1);
  }
  return 1;
}

/** Interpola x de [lo,hi] a [a,b]; si el tramo es degenerado (hi≤lo), devuelve b. */
function tramo(x: number, lo: number, hi: number, a: number, b: number): number {
  return hi > lo ? a + ((b - a) * (x - lo)) / (hi - lo) : b;
}
