import { LecturaTelar, TipoIncidencia } from './models';
import { formatFechaHoraAnio } from './format';
import { ALTURA_BASTIDOR_REPOSO_MM } from './dominio';

/**
 * Validador de calidad de datos ("salud del dato") — modo Demo.
 *
 * Espejo de `validarLecturas` del backend (prisma-fabric.repository.ts), que es
 * el que actúa sobre los datos reales. Modelo de dos niveles:
 *  - `sospechosa`/`motivosSospecha`: DESCARTE (fuera de KPIs, a cuarentena).
 *    Hoy solo la fecha incoherente con la recepción.
 *  - `alertas`: AVISO; la lectura SIGUE contando en los KPIs, solo se señala
 *    (consumo atípico por percentil de la cola del propio telar, velocidad
 *    inusual por σ, altura sobre el tope físico, saltos de altura en pleno corte).
 *
 * Las reglas trabajan sobre la secuencia en orden de recepción y comparan la
 * fecha declarada por la máquina con el sello de recepción del servidor, que
 * sí es fiable.
 */

const TOLERANCIA_FECHA_MS = 30 * 60_000;
const VELOCIDAD_MAX_MM_H = 310;
const SUBIDA_TOLERADA_MM = 30;
// Avisos σ de velocidad: mínimo de lecturas en marcha para fiarse de la media y
// la desviación típica de un telar (si no, no se avisa).
const SIGMA_MIN_MUESTRAS = 8;
// Consumo atípico por percentil de la cola del PROPIO telar. La potencia de los
// telares no es normal (μ±σ no vale: en unos telares no saltaba nunca y en otros
// chillaba — ver VERIFICACION.md), así que se corta por percentil. Se ignoran las
// lecturas < 5 kW (parado mal etiquetado, distorsionan la base) y hace falta un
// mínimo de muestras. Tasas (Pulycort 2026-06-16): "alto" = top 16 %, "inusual" =
// top 2,3 %, "MUY alto" = top 0,13 % de las lecturas en marcha de ese telar.
const POTENCIA_MIN_BASELINE_KW = 5;
const MUESTRAS_MIN_CONSUMO = 8;
const PCTL_CONSUMO_ALTO = 0.84;
const PCTL_CONSUMO_INUSUAL = 0.977;
const PCTL_CONSUMO_MUY = 0.9987;

/** Incidencias en las que el telar está cortando (cuentan como marcha). */
const INCIDENCIAS_MARCHA: readonly TipoIncidencia[] = [
  'marcha',
  'modo-manual',
  'modo-automatico'
];
const enMarcha = (incidencia: TipoIncidencia): boolean =>
  INCIDENCIAS_MARCHA.includes(incidencia);

/** Marca in situ `sospechosa`, `motivosSospecha` y `alertas` de cada lectura. */
export function validarLecturas(lecturas: LecturaTelar[]): void {
  // Baseline por telar sobre las lecturas EN MARCHA: cortes de consumo por
  // percentil de la cola (≥ 5 kW) y μ/σ de la velocidad. Solo se usan si hay
  // muestra suficiente (y dispersión real en la velocidad).
  const umbralCons = umbralConsumo(lecturas);
  const velocidadBase = baselineSigma(lecturas, (l) => l.velocidadMmH);

  // Coherencia de altura contra la lectura INMEDIATAMENTE anterior del mismo
  // bloque (válida o no): comparar solo contra la última válida encadenaría en
  // cascada al congelarse la altura en los paros.
  let previa: LecturaTelar | null = null;

  for (const lectura of lecturas) {
    const motivos: string[] = [];
    const alertas: string[] = [];

    const declarada = new Date(lectura.fechaHora).getTime();
    const recibida = new Date(lectura.recibidaEn).getTime();

    // #1 Fecha incoherente: ÚNICO motivo de descarte del validador.
    if (Number.isNaN(declarada) || Math.abs(declarada - recibida) > TOLERANCIA_FECHA_MS) {
      motivos.push(
        `Fecha declarada imposible (${formatFechaHoraAnio(lectura.fechaHora)}) frente a la recepción (${formatFechaHoraAnio(lectura.recibidaEn)})`
      );
    }

    // #2 Incidencia sin mapear: aviso, no descarte.
    if (lectura.incidencia === 'desconocida') {
      alertas.push('Incidencia sin mapear ("Sin nombre")');
    }

    // #3 Consumo atípico por percentil de la cola del telar. Solo en marcha (1
    // marcha, 4 modo manual, 5 modo automático): los paros (2, y 3 rotura de
    // material) llevan el sensor congelado, no consumo de corte.
    if (umbralCons && enMarcha(lectura.incidencia)) {
      const aviso = avisoConsumo(lectura.potenciaKw, umbralCons);
      if (aviso) {
        alertas.push(aviso);
      }
    }

    // #7 Velocidad de descenso escalonada por σ del telar (solo en marcha).
    if (velocidadBase && enMarcha(lectura.incidencia)) {
      const mmh = Math.round(lectura.velocidadMmH);
      const aviso = avisoSigma(lectura.velocidadMmH, velocidadBase, {
        alto: `Velocidad de descenso alta (${mmh} mm/h)`,
        inusual: `Velocidad de descenso inusualmente alta (${mmh} mm/h)`,
        muy: `Velocidad de descenso MUY alta (${mmh} mm/h), conviene revisar`
      });
      if (aviso) {
        alertas.push(aviso);
      }
    }

    // #8 Altura por encima del tope físico del bastidor: aviso, no descarte.
    if (lectura.alturaActualMm > ALTURA_BASTIDOR_REPOSO_MM + 100) {
      alertas.push(
        `Altura por encima del tope físico del bastidor (${Math.round(lectura.alturaActualMm)} mm)`
      );
    }

    // #10/#11 Coherencia física de la altura en pleno corte: avisos, no descarte.
    if (previa && lectura.bloque !== null && previa.bloque === lectura.bloque) {
      const deltaAltura = lectura.alturaActualMm - previa.alturaActualMm;
      const deltaHoras = (recibida - new Date(previa.recibidaEn).getTime()) / 3_600_000;
      if (enMarcha(lectura.incidencia) && enMarcha(previa.incidencia)) {
        if (deltaAltura > SUBIDA_TOLERADA_MM) {
          alertas.push(`La altura del bastidor sube ${Math.round(deltaAltura)} mm en pleno corte`);
        } else if (
          deltaHoras > 0 &&
          -deltaAltura > VELOCIDAD_MAX_MM_H * deltaHoras * 1.5 + SUBIDA_TOLERADA_MM
        ) {
          alertas.push(
            `Descenso físicamente imposible (${Math.round(-deltaAltura)} mm en ${Math.round(deltaHoras * 60)} min)`
          );
        }
      }
    }

    lectura.sospechosa = motivos.length > 0;
    lectura.motivosSospecha = motivos;
    lectura.alertas = alertas;
    previa = lectura;
  }
}

function redondea1(valor: number): number {
  return Math.round(valor * 10) / 10;
}

function media(valores: number[]): number {
  return valores.length === 0 ? 0 : valores.reduce((s, v) => s + v, 0) / valores.length;
}

interface UmbralConsumo {
  alto: number;
  inusual: number;
  muy: number;
}

/**
 * Cortes de consumo atípico por percentil de la cola derecha del PROPIO telar,
 * sobre las lecturas EN MARCHA con potencia ≥ 5 kW (las de 0–4 kW son parado mal
 * etiquetado y distorsionan la base). null si no hay muestra suficiente: sin base
 * fiable no se juzga lo atípico (no inventar). En ventanas pequeñas los cortes
 * altos se acercan al máximo, así que "MUY alto" apenas salta hasta que el telar
 * acumula lecturas.
 */
function umbralConsumo(lecturas: LecturaTelar[]): UmbralConsumo | null {
  const muestras = lecturas
    .filter((l) => enMarcha(l.incidencia) && l.potenciaKw >= POTENCIA_MIN_BASELINE_KW)
    .map((l) => l.potenciaKw)
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  if (muestras.length < MUESTRAS_MIN_CONSUMO) {
    return null;
  }
  return {
    alto: percentil(muestras, PCTL_CONSUMO_ALTO),
    inusual: percentil(muestras, PCTL_CONSUMO_INUSUAL),
    muy: percentil(muestras, PCTL_CONSUMO_MUY)
  };
}

/** percentil_cont (interpolación lineal, como PostgreSQL) sobre un array ORDENADO. */
function percentil(ordenadas: number[], q: number): number {
  const n = ordenadas.length;
  if (n === 1) {
    return ordenadas[0];
  }
  const rango = q * (n - 1);
  const i = Math.floor(rango);
  const frac = rango - i;
  return i + 1 < n ? ordenadas[i] + frac * (ordenadas[i + 1] - ordenadas[i]) : ordenadas[i];
}

/** Aviso de consumo atípico: en qué tramo de la cola del telar cae la lectura. */
function avisoConsumo(kw: number, u: UmbralConsumo): string | null {
  const r = redondea1(kw);
  if (kw > u.muy) {
    return `Consumo MUY alto (${r} kW), conviene revisar`;
  }
  if (kw > u.inusual) {
    return `Consumo inusualmente alto (${r} kW)`;
  }
  if (kw > u.alto) {
    return `Consumo alto (${r} kW)`;
  }
  return null;
}

/**
 * μ y σ de una magnitud sobre las lecturas EN MARCHA de un telar. null si no
 * hay muestra suficiente o no hay dispersión: sin base fiable no se avisa.
 */
function baselineSigma(
  lecturas: LecturaTelar[],
  valor: (l: LecturaTelar) => number
): { media: number; sigma: number } | null {
  const muestras = lecturas
    .filter((l) => enMarcha(l.incidencia))
    .map(valor)
    .filter((v) => Number.isFinite(v));
  if (muestras.length < SIGMA_MIN_MUESTRAS) {
    return null;
  }
  const m = media(muestras);
  const varianza = muestras.reduce((s, v) => s + (v - m) ** 2, 0) / muestras.length;
  const sigma = Math.sqrt(varianza);
  return sigma > 0 ? { media: m, sigma } : null;
}

/**
 * Aviso escalonado por cola alta: μ+1σ "alto", μ+2σ "inusual", μ+3σ "MUY alto".
 * Devuelve el mensaje correspondiente o null si está dentro de 1σ.
 */
function avisoSigma(
  valor: number,
  base: { media: number; sigma: number },
  mensajes: { alto: string; inusual: string; muy: string }
): string | null {
  const desv = (valor - base.media) / base.sigma;
  if (desv > 3) {
    return mensajes.muy;
  }
  if (desv > 2) {
    return mensajes.inusual;
  }
  if (desv > 1) {
    return mensajes.alto;
  }
  return null;
}
