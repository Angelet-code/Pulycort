/**
 * Normalización de las medidas de bloque (`largo/alto/grueso` de proveedor y de
 * fábrica/mrp). Lo comparten /produccion (medidas de `lot_block_creation` por PM)
 * y /inventario (medidas `*_supplier`/`*_mrp` de `stock_lot`); la estadística del
 * 4,6 % de filas con unidad mezclada (abajo) se midió sobre `lot_block_creation`.
 *
 * La tabla MEZCLA UNIDADES: la mayoría de filas traen las dimensiones en METROS
 * (~2,8), pero una minoría (~4,6 % verificado sobre los 1.093 registros reales,
 * 2026-06-14) las trae total o parcialmente en CENTÍMETROS — el grueso `85`
 * (= 0,85 m) del PM 47220, o las tres `285·160·180` (= 2,85·1,6·1,8) de varios
 * bloques de la serie 464xx. Multiplicar a ciegas asumiendo metros daba m³
 * imposibles: 1,7 × 1,5 × 85 = 216,75 m³ en lugar de 2,17 m³, y un rendimiento
 * de 0,41 m²/m³ en lugar de ~40.
 *
 * Igual que `tablaAMetros` hace con la tabla de partes, normalizamos POR
 * DIMENSIÓN y por umbral: ningún bloque de piedra mide más de ~3,5 m de lado, así
 * que una cota por encima de `UMBRAL_DIM_CM_M` solo puede estar en cm → /100. Las
 * cotas plausibles (0,8–3,5 m) se dejan intactas. No es inventar: `85` o `285`
 * son centímetros de forma inequívoca y dividir recupera el metro real (el dato
 * normalizado cae dentro del rango sano: mediana 4,25 m³, p10–p90 = 2,12–7,29 m³).
 *
 * La unidad oficial sigue pendiente de confirmar con TotWare/Odoo
 * (00_gestion/TAREAS.md, inventario): si se confirmara una convención distinta,
 * basta tocar este módulo.
 */

/** Cota (m) por encima de la cual una dimensión solo puede venir en cm (→ /100). */
export const UMBRAL_DIM_CM_M = 10;

/** Dimensión (m) por encima de la cual un bloque es imposible tras normalizar. */
export const MAX_DIM_BLOQUE_M = 5;

/** m³ por encima del cual un bloque de piedra es físicamente imposible. */
export const MAX_M3_BLOQUE = 20;

/**
 * Pasa una dimensión a metros: si supera el umbral viene en cm (ningún bloque
 * mide >10 m de lado), así que se divide entre 100; si no, ya está en metros.
 */
export function dimensionBloqueAMetros(valor: number): number {
  return valor > UMBRAL_DIM_CM_M ? valor / 100 : valor;
}

/**
 * Volumen en m³ del bloque normalizando cada dimensión cm→m antes de multiplicar.
 * 0 si falta o es ≤ 0 alguna dimensión (sin medida, no hay volumen).
 */
export function volumenBloqueM3(
  largo: number,
  alto: number,
  grueso: number,
): number {
  const l = dimensionBloqueAMetros(largo);
  const a = dimensionBloqueAMetros(alto);
  const g = dimensionBloqueAMetros(grueso);
  if (l <= 0 || a <= 0 || g <= 0) {
    return 0;
  }
  return l * a * g;
}

/**
 * ¿El bloque sigue siendo físicamente imposible tras normalizar las unidades?
 * Red de seguridad para la corrupción que el umbral cm→m NO arregla: una cota en
 * la zona ambigua (5–10, demasiado grande para metros y demasiado pequeña para
 * pasar a cm) o un volumen absurdo. Un bloque imposible no muestra su
 * m³/rendimiento y queda fuera de los KPIs (no se inventa un valor). Sin medida
 * (alguna cota ≤ 0) NO es "imposible" sino "ausente" → false.
 */
export function bloqueImposible(
  largo: number,
  alto: number,
  grueso: number,
): boolean {
  const l = dimensionBloqueAMetros(largo);
  const a = dimensionBloqueAMetros(alto);
  const g = dimensionBloqueAMetros(grueso);
  if (l <= 0 || a <= 0 || g <= 0) {
    return false;
  }
  if (l > MAX_DIM_BLOQUE_M || a > MAX_DIM_BLOQUE_M || g > MAX_DIM_BLOQUE_M) {
    return true;
  }
  return l * a * g > MAX_M3_BLOQUE;
}

/**
 * Margen al comparar el m³ del bloque con la piedra cortada (m² × espesor): ese
 * piso físico asume kerf y recortes nulos (un bloque real siempre lo supera), así
 * que solo marcamos por debajo del 98 % del piso. Evita falsos positivos por
 * redondeo sin dejar pasar la corrupción real, que infradimensiona muy por debajo
 * (caso PM 47156: 1,86 m³ frente a 4,10 m³ de piedra cortada).
 */
export const MARGEN_PIEDRA_CORTADA = 0.98;

/**
 * ¿El m³ del bloque es menor que la piedra que realmente salió en tabla?
 * El parte da los m² de tabla y el espesor de corte (m); esa piedra ocupa, como
 * mínimo, `m² × espesor` (sin contar el kerf de la sierra ni los recortes, que
 * solo lo aumentan). Un bloque no puede rendir más superficie de la que cabe en
 * su volumen, así que `volumenM3 < m² × espesor` es físicamente imposible:
 * uno de los dos datos es erróneo (el m³ del alta infradimensionado, o los m²
 * del parte de otro corte cruzado al lote). No se decide cuál: basta con que sean
 * incompatibles para que el ratio no sea fiable.
 *
 * Esta corrupción NO la ve `bloqueImposible` (cada dimensión suelta es plausible)
 * y dispara un rendimiento por encima del techo físico 1/espesor — caso real PM
 * 47156: 204,9 m² a 2 cm = 4,10 m³ de tabla frente a 1,86 m³ del inventario →
 * 110 m²/m³, imposible a 2 cm donde el máximo es 1/0,02 = 50 m²/m³. Marca para
 * anular el rendimiento (no se pinta un m²/m³ que sabemos falso). Sin bloque, sin
 * parte (m² ≤ 0) o sin espesor (≤ 0) → false: es "ausente", no "imposible".
 */
export function volumenMenorQuePiedraCortada(
  volumenM3: number | null,
  m2Cortados: number,
  espesorCorteM: number,
): boolean {
  if (volumenM3 === null || volumenM3 <= 0 || m2Cortados <= 0 || espesorCorteM <= 0) {
    return false;
  }
  return volumenM3 < m2Cortados * espesorCorteM * MARGEN_PIEDRA_CORTADA;
}
