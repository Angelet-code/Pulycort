import {
  Bloque,
  EventoParte,
  LecturaTelar,
  Medidas,
  ResumenPaquetes,
  TipoIncidencia,
  Turno
} from '../models';
import { MATERIALES } from '../materiales';
import {
  ALTURA_BASTIDOR_REPOSO_MM,
  ESPESOR_TABLA_CM,
  ESPESORES_TABLA_CM,
  KERF_FLEJE_CM,
  TELAR_IDS
} from '../dominio';

export { ALTURA_BASTIDOR_REPOSO_MM, ESPESOR_TABLA_CM, KERF_FLEJE_CM, TELAR_IDS };

/**
 * Motor de simulación de Fabric.
 *
 * Genera una línea temporal determinista (seed fijo) anclada a la hora real:
 * 31 días de histórico + 4 días de futuro por telar. Todo lo demás (snapshot,
 * series, estadísticas) se deriva de aquí leyendo "qué hay a la hora actual",
 * igual que haría el servidor real contra la base de datos de las máquinas.
 *
 * Física del telar: el bastidor parte de la altura del bloque + margen y
 * desciende a `velocidadMmH` solo mientras hay marcha; los paros congelan
 * la altura. El corte termina al llegar a 0.
 *
 * Calidad de datos: igual que en el sistema antiguo, los telares 1, 3 y 4
 * corrompen parte de sus lecturas (fechas imposibles, "Sin nombre", saltos
 * de altura...); el telar 2 emite limpio. El validador del lado API es quien
 * las detecta y pone en cuarentena.
 */

export interface ParoSim {
  desde: number; // epoch ms
  hasta: number;
  causa: TipoIncidencia; // 'paro' | 'rotura-fleje'
}

export interface CicloSim {
  id: string;
  telarId: number;
  bloque: Bloque;
  colocacion: number;
  inicioCorte: number;
  finCorte: number;
  salida: number;
  paquetesEn: number;
  alturaInicialMm: number;
  velocidadMmH: number;
  golpesBase: number;
  amperiosBase: number;
  paros: ParoSim[];
  resumenPaquetes: ResumenPaquetes;
}

export interface MundoSim {
  ahoraGeneracion: number;
  ciclos: CicloSim[];
  /** Lecturas por telar en orden de emisión real (las corruptas incluidas). */
  lecturasPorTelar: Map<number, LecturaTelar[]>;
  eventos: EventoParte[];
}

export const OPERARIOS_MANANA: [string, string] = [
  'RAMON BLANCO RODRIGUEZ',
  'JUAN MARTINEZ MANZANERA'
];
export const OPERARIOS_TARDE: [string, string] = [
  'VOLODYMYR SLYPCHENKO',
  'EDELMIRO MARTINEZ JIMENEZ'
];

const DIAS_HISTORICO = 31;
export const DIAS_FUTURO = 4;
export const INTERVALO_LECTURA_MS = 10 * 60_000;

/** % de lecturas corruptas por telar, calcado de la realidad: el 2 va fino. */
const TASA_CORRUPCION: Record<number, number> = { 1: 0.03, 2: 0, 3: 0.05, 4: 0.08 };

/** PRNG mulberry32: determinista y suficiente para datos de demo. */
function crearRng(seed: number): () => number {
  let estado = seed >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function entre(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

function enteroEntre(rng: () => number, min: number, max: number): number {
  return Math.floor(entre(rng, min, max + 1));
}

function redondeaA(valor: number, multiplo: number): number {
  return Math.round(valor / multiplo) * multiplo;
}

export function turnoDe(epochMs: number): Turno {
  const hora = new Date(epochMs).getHours();
  if (hora >= 6 && hora < 14) {
    return 'manana';
  }
  if (hora >= 14 && hora < 22) {
    return 'tarde';
  }
  return 'noche';
}

export function operariosDe(epochMs: number): [string | null, string | null] {
  const turno = turnoDe(epochMs);
  if (turno === 'manana') {
    return OPERARIOS_MANANA;
  }
  if (turno === 'tarde') {
    return OPERARIOS_TARDE;
  }
  return [null, null]; // noche: marcha automática sin operario
}

/** Milisegundos de marcha efectiva entre inicioCorte y t (descuenta paros). */
function msMarchaHasta(ciclo: CicloSim, t: number): number {
  const fin = Math.min(t, ciclo.finCorte);
  if (fin <= ciclo.inicioCorte) {
    return 0;
  }
  let marcha = fin - ciclo.inicioCorte;
  for (const paro of ciclo.paros) {
    const solapaDesde = Math.max(paro.desde, ciclo.inicioCorte);
    const solapaHasta = Math.min(paro.hasta, fin);
    if (solapaHasta > solapaDesde) {
      marcha -= solapaHasta - solapaDesde;
    }
  }
  return Math.max(0, marcha);
}

export function alturaEn(ciclo: CicloSim, t: number): number {
  const horasMarcha = msMarchaHasta(ciclo, t) / 3_600_000;
  return Math.max(0, ciclo.alturaInicialMm - ciclo.velocidadMmH * horasMarcha);
}

export function paroActivoEn(ciclo: CicloSim, t: number): ParoSim | null {
  if (t < ciclo.inicioCorte || t >= ciclo.finCorte) {
    return null;
  }
  return ciclo.paros.find((paro) => t >= paro.desde && t < paro.hasta) ?? null;
}

export function cicloEn(ciclos: CicloSim[], telarId: number, t: number): CicloSim | null {
  return (
    ciclos.find((c) => c.telarId === telarId && t >= c.colocacion && t < c.salida) ?? null
  );
}

function generarMedidas(rng: () => number): { proveedor: Medidas; fabrica: Medidas } {
  const proveedor: Medidas = {
    largoCm: redondeaA(entre(rng, 190, 320), 5),
    altoCm: redondeaA(entre(rng, 90, 200), 5),
    gruesoCm: redondeaA(entre(rng, 60, 180), 5)
  };
  // La medida de fábrica es la real: suele diferir unos cm de la declarada.
  const fabrica: Medidas = {
    largoCm: proveedor.largoCm + enteroEntre(rng, -6, 2),
    altoCm: proveedor.altoCm + enteroEntre(rng, -5, 2),
    gruesoCm: proveedor.gruesoCm + enteroEntre(rng, -4, 2)
  };
  return { proveedor, fabrica };
}

export function tablasPrevistas(
  medidasFabrica: Medidas,
  espesorCm: number = ESPESOR_TABLA_CM
): number {
  return Math.max(1, Math.floor(medidasFabrica.gruesoCm / (espesorCm + KERF_FLEJE_CM)));
}

/**
 * Espesor de corte de un bloque en la demo. Determinista por número de bloque
 * (no consume el rng global, para no descuadrar el resto de la simulación):
 * recorre 1 / 1,5 / 2 / 3 cm. En el modo real el espesor lo trae el parte.
 */
function espesorTablaDeBloque(numeroBloque: number): number {
  return ESPESORES_TABLA_CM[numeroBloque % ESPESORES_TABLA_CM.length];
}

function generarResumenPaquetes(
  rng: () => number,
  medidas: Medidas,
  espesorCm: number
): ResumenPaquetes {
  // Las tablas reales difieren de las previstas: roturas al manipular o
  // alguna lámina extra si el kerf real fue menor. A menor espesor, más tablas.
  const numTablas = Math.max(1, tablasPrevistas(medidas, espesorCm) + enteroEntre(rng, -3, 1));
  const largoTablaM = (medidas.largoCm - enteroEntre(rng, 8, 18)) / 100;
  const altoTablaM = (medidas.altoCm - enteroEntre(rng, 10, 22)) / 100;
  const metrosCuadrados = numTablas * largoTablaM * altoTablaM;
  return {
    numPaquetes: Math.max(1, Math.ceil(numTablas / 12)),
    numTablas,
    largoTablaM: Math.round(largoTablaM * 100) / 100,
    altoTablaM: Math.round(altoTablaM * 100) / 100,
    gruesoTablaM: espesorCm / 100,
    metrosCuadrados: Math.round(metrosCuadrados * 10) / 10
  };
}

function velocidadPorDureza(rng: () => number, dureza: number): number {
  // Verificado contra el sistema antiguo: 110-170 mm/h en piedras duras,
  // hasta ~300 mm/h en blandas.
  const rangos: Record<number, [number, number]> = {
    1: [260, 310],
    2: [160, 190],
    3: [140, 165],
    4: [105, 135],
    5: [90, 115]
  };
  const [min, max] = rangos[dureza] ?? [130, 160];
  return redondeaA(entre(rng, min, max), 5);
}

interface ContextoGeneracion {
  rng: () => number;
  ahora: number;
  siguienteNumeroBloque: () => number;
}

function generarParos(
  ctx: ContextoGeneracion,
  telarId: number,
  inicioCorte: number,
  msCortePuro: number
): ParoSim[] {
  const { rng } = ctx;
  const numParos = enteroEntre(rng, 1, 3);
  const paros: ParoSim[] = [];
  // Offsets sobre el tiempo de marcha; al insertar paros el corte se alarga,
  // así que colocamos secuencialmente desplazando lo ya acumulado.
  const offsets = Array.from({ length: numParos }, () => entre(rng, 0.06, 0.88) * msCortePuro).sort(
    (a, b) => a - b
  );
  let acumulado = 0;
  let ultimoFin = 0;
  for (const offset of offsets) {
    if (offset <= ultimoFin + 20 * 60_000) {
      continue; // evita paros solapados o pegados
    }
    const esRotura = rng() < 0.05;
    const duracionMin = esRotura ? entre(rng, 40, 110) : entre(rng, 10, 55);
    const desde = inicioCorte + offset + acumulado;
    const hasta = desde + duracionMin * 60_000;
    paros.push({ desde, hasta, causa: esRotura ? 'rotura-fleje' : 'paro' });
    acumulado += hasta - desde;
    ultimoFin = offset;
  }

  return paros;
}

function generarCiclosTelar(ctx: ContextoGeneracion, telarId: number): CicloSim[] {
  const { rng, ahora } = ctx;
  const inicioVentana = ahora - DIAS_HISTORICO * 86_400_000;
  const finVentana = ahora + DIAS_FUTURO * 86_400_000;
  const ciclos: CicloSim[] = [];

  let cursor = inicioVentana + entre(rng, 0, 8) * 3_600_000;
  let contador = 0;
  while (cursor < finVentana) {
    const { proveedor, fabrica } = generarMedidas(rng);
    const material = MATERIALES[enteroEntre(rng, 0, MATERIALES.length - 1)];
    const numeroBloque = ctx.siguienteNumeroBloque();
    const bloque: Bloque = {
      numero: numeroBloque,
      pmLote: numeroBloque,
      materialId: material.id,
      medidasProveedor: proveedor,
      medidasFabrica: fabrica
    };

    const colocacion = cursor;
    const inicioCorte = colocacion + entre(rng, 0.25, 0.6) * 3_600_000;
    const alturaInicialMm = fabrica.altoCm * 10 + enteroEntre(rng, 30, 80);
    const velocidadMmH = velocidadPorDureza(rng, material.dureza);
    const msCortePuro = (alturaInicialMm / velocidadMmH) * 3_600_000;
    const paros = generarParos(ctx, telarId, inicioCorte, msCortePuro);
    const msParos = paros.reduce((suma, paro) => suma + (paro.hasta - paro.desde), 0);
    const finCorte = inicioCorte + msCortePuro + msParos;
    const salida = finCorte + entre(rng, 0.2, 0.6) * 3_600_000;
    const paquetesEn = salida + entre(rng, 0.3, 1) * 3_600_000;

    ciclos.push({
      id: `c-${telarId}-${contador}`,
      telarId,
      bloque,
      colocacion,
      inicioCorte,
      finCorte,
      salida,
      paquetesEn,
      alturaInicialMm,
      velocidadMmH,
      golpesBase: enteroEntre(rng, 825, 905),
      // Máx. 138+7 de ruido = 145 A → 73 kW, bajo el tope real de 76 kW.
      amperiosBase: enteroEntre(rng, 92, 138),
      paros,
      resumenPaquetes: generarResumenPaquetes(rng, fabrica, espesorTablaDeBloque(bloque.numero))
    });

    // Hueco corto entre bloques: así los telares pasan la mayor parte del
    // tiempo cortando y suele haber al menos 3 en marcha a la vez.
    const gapHoras = entre(rng, 0.2, 1);
    cursor = salida + gapHoras * 3_600_000;
    contador += 1;
  }
  return ciclos;
}

/**
 * Corrompe una lectura como lo hace el sistema real: el dato sale mal de la
 * máquina. El validador del lado API es quien debe cazarla después.
 */
function corromperLectura(rng: () => number, lectura: LecturaTelar): void {
  const tipo = enteroEntre(rng, 0, 5);
  switch (tipo) {
    case 0: {
      const fecha = new Date(lectura.fechaHora);
      fecha.setFullYear(2014);
      lectura.fechaHora = fecha.toISOString();
      break;
    }
    case 1: {
      const fecha = new Date(lectura.fechaHora);
      fecha.setFullYear(2099);
      lectura.fechaHora = fecha.toISOString();
      break;
    }
    case 2:
      lectura.incidencia = 'desconocida';
      break;
    case 3:
      // El bastidor jamás sube durante un corte.
      lectura.alturaActualMm += enteroEntre(rng, 600, 1500);
      break;
    case 4:
      lectura.golpesPorMinuto = rng() < 0.5 ? 9999 : enteroEntre(rng, 1100, 1400);
      break;
    default:
      // Amperios desacoplados de la potencia (sensor roto).
      lectura.amperios = lectura.potenciaKw * 5 + enteroEntre(rng, 10, 40);
      break;
  }
}

function lecturaBase(
  telarId: number,
  t: number,
  indice: number
): Pick<
  LecturaTelar,
  | 'id'
  | 'telarId'
  | 'fechaHora'
  | 'recibidaEn'
  | 'operario1'
  | 'operario2'
  | 'sospechosa'
  | 'motivosSospecha'
> {
  const [operario1, operario2] = operariosDe(t);
  const iso = new Date(t).toISOString();
  return {
    id: `l-${telarId}-${indice}`,
    telarId,
    fechaHora: iso,
    recibidaEn: iso,
    operario1,
    operario2,
    sospechosa: false,
    motivosSospecha: []
  };
}

function generarLecturasTelar(
  ctx: ContextoGeneracion,
  telarId: number,
  ciclos: CicloSim[]
): LecturaTelar[] {
  const { rng, ahora } = ctx;
  const inicioVentana = ahora - DIAS_HISTORICO * 86_400_000;
  // Se generan también lecturas futuras: la API solo entrega las que ya
  // "han llegado" según el reloj virtual (recibidaEn <= ahora).
  const finVentana = ahora + DIAS_FUTURO * 86_400_000;
  const lecturas: LecturaTelar[] = [];
  const tasaCorrupcion = TASA_CORRUPCION[telarId] ?? 0;
  let indice = 0;
  let derivaGolpes = 0;

  for (let t = inicioVentana; t <= finVentana; t += INTERVALO_LECTURA_MS) {
    const jitter = entre(rng, -80_000, 80_000);
    const tLectura = t + jitter;
    const ciclo = cicloEn(ciclos, telarId, tLectura);
    const base = lecturaBase(telarId, tLectura, indice);
    indice += 1;

    let lectura: LecturaTelar;
    if (!ciclo) {
      // Entre salida y la siguiente colocación: bastidor arriba, sin bloque.
      lectura = {
        ...base,
        bloque: null,
        pmLote: null,
        incidencia: 'cambio-bloque',
        potenciaKw: 0,
        amperios: 0,
        golpesPorMinuto: 0,
        velocidadMmH: 0,
        alturaActualMm: ALTURA_BASTIDOR_REPOSO_MM
      };
    } else {
      const altura = Math.round(alturaEn(ciclo, tLectura));
      const cortando = tLectura >= ciclo.inicioCorte && tLectura < ciclo.finCorte;
      const paro = paroActivoEn(ciclo, tLectura);

      if (!cortando || paro) {
        // Antes o después del corte (colocación / espera de salida) no es un
        // paro: es preparación, y se etiqueta como cambio de bloque.
        const causa: TipoIncidencia = paro ? paro.causa : 'cambio-bloque';
        const residual = rng() < 0.4 ? enteroEntre(rng, 5, 25) : 0;
        lectura = {
          ...base,
          bloque: ciclo.bloque.numero,
          pmLote: ciclo.bloque.pmLote,
          incidencia: causa,
          potenciaKw: Math.round(residual / 2),
          amperios: residual,
          golpesPorMinuto: 0,
          velocidadMmH: 0,
          alturaActualMm: altura
        };
      } else {
        // Marcha: golpes con deriva suave, amperios correlados con ruido.
        derivaGolpes = Math.max(-40, Math.min(40, derivaGolpes + entre(rng, -9, 9)));
        const golpes = Math.round(ciclo.golpesBase + derivaGolpes + entre(rng, -6, 6));
        const amperios = Math.round(ciclo.amperiosBase + entre(rng, -7, 7));
        lectura = {
          ...base,
          bloque: ciclo.bloque.numero,
          pmLote: ciclo.bloque.pmLote,
          incidencia: 'marcha',
          potenciaKw: Math.round(amperios / 2),
          amperios,
          golpesPorMinuto: golpes,
          velocidadMmH: ciclo.velocidadMmH,
          alturaActualMm: altura
        };
      }
    }

    if (tasaCorrupcion > 0 && rng() < tasaCorrupcion) {
      corromperLectura(rng, lectura);
    }
    lecturas.push(lectura);
  }
  return lecturas;
}

function generarEventos(ctx: ContextoGeneracion, ciclos: CicloSim[]): EventoParte[] {
  const { rng } = ctx;
  const eventos: EventoParte[] = [];
  let indice = 0;

  // Se generan todos (también los futuros); la API filtra por el reloj virtual.
  const crear = (
    ciclo: CicloSim,
    tipo: EventoParte['tipo'],
    t: number,
    paquetes: ResumenPaquetes | null = null
  ): void => {
    const [operario1, operario2] = operariosDe(t);
    eventos.push({
      id: `e-${indice++}`,
      telarId: ciclo.telarId,
      fechaHora: new Date(t).toISOString(),
      tipo,
      bloque: ciclo.bloque.numero,
      pmLote: ciclo.bloque.pmLote,
      materialId: ciclo.bloque.materialId,
      paquetes,
      operario1: operario1 ?? OPERARIOS_MANANA[0],
      operario2: operario2 ?? OPERARIOS_MANANA[1]
    });
  };

  for (const ciclo of ciclos) {
    crear(ciclo, 'colocacion', ciclo.colocacion);
    const numAserrados = enteroEntre(rng, 2, 5);
    for (let i = 1; i <= numAserrados; i++) {
      const t = ciclo.inicioCorte + ((ciclo.finCorte - ciclo.inicioCorte) * i) / (numAserrados + 1);
      crear(ciclo, 'aserrado', t + entre(rng, -20, 20) * 60_000);
    }
    crear(ciclo, 'salida', ciclo.salida);
    crear(ciclo, 'paquetes', ciclo.paquetesEn, ciclo.resumenPaquetes);
  }

  // "Fin de jornada": el operario cierra su turno. Aparece en los partes del
  // sistema antiguo (sin bloque); no cuenta para producción.
  const inicio = ctx.ahora - DIAS_HISTORICO * 86_400_000;
  const fin = ctx.ahora + DIAS_FUTURO * 86_400_000;
  const cierres: Array<[number, readonly [string, string]]> = [
    [14 * 3_600_000, OPERARIOS_MANANA],
    [22 * 3_600_000, OPERARIOS_TARDE]
  ];
  const primer = new Date(inicio);
  let dia = new Date(primer.getFullYear(), primer.getMonth(), primer.getDate()).getTime();
  while (dia <= fin) {
    const d = new Date(dia);
    for (const telarId of TELAR_IDS) {
      for (const [offset, operarios] of cierres) {
        const t = dia + offset + entre(rng, -8, 8) * 60_000 + telarId * 60_000;
        if (t < inicio || t > fin) {
          continue;
        }
        eventos.push({
          id: `fj-${indice++}`,
          telarId,
          fechaHora: new Date(t).toISOString(),
          tipo: 'fin-jornada',
          bloque: null,
          pmLote: null,
          materialId: null,
          paquetes: null,
          operario1: operarios[0],
          operario2: operarios[1]
        });
      }
    }
    dia = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  }

  eventos.sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
  return eventos;
}

export function generarMundo(seed = 20260611, ahora = Date.now()): MundoSim {
  const rng = crearRng(seed);
  let numeroBloque = 46950 + Math.floor(rng() * 40);
  const ctx: ContextoGeneracion = {
    rng,
    ahora,
    siguienteNumeroBloque: () => {
      numeroBloque += enteroEntre(rng, 1, 4);
      return numeroBloque;
    }
  };

  const ciclos: CicloSim[] = [];
  const lecturasPorTelar = new Map<number, LecturaTelar[]>();
  for (const telarId of TELAR_IDS) {
    const ciclosTelar = generarCiclosTelar(ctx, telarId);
    ciclos.push(...ciclosTelar);
    lecturasPorTelar.set(telarId, generarLecturasTelar(ctx, telarId, ciclosTelar));
  }

  return {
    ahoraGeneracion: ahora,
    ciclos,
    lecturasPorTelar,
    eventos: generarEventos(ctx, ciclos)
  };
}
