export const rangosEstadisticas = ['hoy', '7d', '30d'] as const;

export type EstadoTelar =
  | 'marcha'
  | 'paro'
  | 'incidencia'
  | 'cambio-bloque'
  | 'sin-datos';

export type TipoIncidencia =
  | 'marcha'
  | 'paro'
  | 'rotura-fleje'
  | 'cambio-bloque'
  | 'desconocida';

export type Turno = 'manana' | 'tarde' | 'noche';

export type TipoEvento =
  | 'colocacion'
  | 'aserrado'
  | 'salida'
  | 'paquetes'
  | 'fin-jornada';

export type RangoEstadisticas = (typeof rangosEstadisticas)[number];

export interface Medidas {
  largoCm: number;
  altoCm: number;
  gruesoCm: number;
}

export interface Bloque {
  numero: number;
  materialId: string;
  medidasProveedor: Medidas;
  medidasFabrica: Medidas;
}

export interface PuntoSerie {
  t: string;
  v: number;
}

export interface ResumenPaquetes {
  numPaquetes: number;
  numTablas: number;
  largoTablaM: number;
  altoTablaM: number;
  gruesoTablaM: number;
  metrosCuadrados: number;
}

export interface LecturaTelar {
  id: string;
  telarId: number;
  fechaHora: string;
  recibidaEn: string;
  bloque: number | null;
  incidencia: TipoIncidencia;
  potenciaKw: number;
  amperios: number;
  golpesPorMinuto: number;
  velocidadMmH: number;
  alturaActualMm: number;
  operario1: string | null;
  operario2: string | null;
  sospechosa: boolean;
  motivosSospecha: string[];
}

export interface EventoParte {
  id: string;
  telarId: number;
  fechaHora: string;
  tipo: TipoEvento;
  bloque: number | null;
  materialId: string | null;
  paquetes: ResumenPaquetes | null;
  operario1: string | null;
  operario2: string | null;
}

export interface SegmentoEstado {
  desde: string;
  hasta: string;
  incidencia: TipoIncidencia;
}

export interface DesvioRitmo {
  consignaMmH: number;
  realMmH: number;
  desvioPct: number;
}

export interface CicloBloque {
  id: string;
  telarId: number;
  bloque: Bloque;
  colocacion: string;
  inicioCorte: string;
  finCorte: string | null;
  paquetes: ResumenPaquetes | null;
  horasMarcha: number;
  horasParo: number;
  numParos: number;
  /** null cuando la fuente real no permite calcularlo (sin datos de tablas). */
  tablasPrevistas: number | null;
  m2Previstos: number | null;
  mermaVolumenPct: number | null;
  enCurso: boolean;
  /**
   * Las medidas de bloque de la máquina son geométricamente imposibles para
   * el parte real (cara de tabla mayor que cualquier cara del bloque, o más
   * tablas de las que caben). Cuenta como dudoso en el rendimiento m²/m³.
   */
  medidasIncoherentes: boolean;
}

export interface SnapshotTelar {
  telarId: number;
  nombre: string;
  estado: EstadoTelar;
  estadoDesde: string | null;
  causaParo: TipoIncidencia | null;
  bloque: Bloque | null;
  ultimaLectura: LecturaTelar | null;
  alturaInicialMm: number | null;
  progresoPct: number | null;
  etaFinCorte: string | null;
  tablasPrevistas: number | null;
  m2Previstos: number | null;
  desvioRitmo: DesvioRitmo | null;
  turno: Turno;
  operario1: string | null;
  operario2: string | null;
  seriePotencia: PuntoSerie[];
  datosSospechosos: boolean;
}

export interface KpisPlanta {
  telaresCortando: number;
  telaresTotales: number;
  /** null cuando la fuente real no permite calcularlo todavía. */
  utilizacionHoyPct: number | null;
  m2Hoy: number | null;
  tablasHoy: number | null;
  parosHoy: number;
  minutosParoHoy: number;
  minutosRoturaHoy: number | null;
}

/**
 * Origen de los datos que sirve el backend. La UI debe avisar cuando el modo
 * Real recibe 'mock': los datos de demostración nunca pueden pasar por reales.
 */
export type FuenteBackend = 'postgres' | 'mock';

export interface SnapshotPlanta {
  generadoEn: string;
  fuente: FuenteBackend;
  kpis: KpisPlanta;
  telares: SnapshotTelar[];
  ultimosEventos: EventoParte[];
}

export interface VigiaFleje {
  ratioActual: number | null;
  ratioMediana: number | null;
  fatigado: boolean;
}

export interface DetalleTelar {
  snapshot: SnapshotTelar;
  serieAltura: PuntoSerie[];
  seriePotencia: PuntoSerie[];
  serieGolpes: PuntoSerie[];
  segmentosJornada: SegmentoEstado[];
  disponibilidadTurnoPct: number | null;
  mtbfFleje7dHoras: number | null;
  roturas7d: number | null;
  latenciaDatosMin: number | null;
  /** null cuando la fuente no lo expone (modo Real): heurística inventada, solo Demo. */
  vigiaFleje: VigiaFleje | null;
  lecturasRecientes: LecturaTelar[];
  eventosCicloActual: EventoParte[];
  historialCiclos: CicloBloque[];
}

export interface ParoPorCausa {
  causa: TipoIncidencia;
  minutos: number;
  numero: number;
}

export interface EstadisticasTelar {
  telarId: number;
  nombre: string;
  pctMarcha: number;
  pctParo: number;
  pctCambioBloque: number;
  horasMarcha: number;
  horasParo: number;
  horasCambioBloque: number;
  m2: number | null;
  tablas: number | null;
  bloquesCompletados: number;
  golpesMedios: number;
  velocidadMediaMmH: number;
  amperiosMedios: number;
  parosPorCausa: ParoPorCausa[];
}

export interface ProduccionDia {
  fecha: string;
  m2PorTelar: Record<number, number>;
  m2Total: number;
  tablas: number;
}

export interface ProduccionMaterial {
  materialId: string;
  m2: number | null;
  bloques: number;
}

/** Producción real por operario, de los partes de paquetes. */
export interface ProduccionOperario {
  operario: string;
  partes: number;
  tablas: number;
  m2: number;
}

export interface RoturaFleje {
  telarId: number;
  fechaHora: string;
  bloque: number | null;
  materialId: string | null;
  minutos: number;
}

export interface JornadaTelar {
  telarId: number;
  nombre: string;
  segmentos: SegmentoEstado[];
}

export interface Estadisticas {
  rango: RangoEstadisticas;
  desde: string;
  hasta: string;
  totalM2: number | null;
  totalM3Aserrados: number;
  totalTablas: number | null;
  totalPaquetes: number | null;
  totalBloques: number;
  rendimientoM2M3: number | null;
  /** Bloques con parte real y volumen declarado: la base del rendimiento. */
  bloquesRendimiento: number;
  /** De esa base, bloques cuyas medidas de máquina no encajan con su parte. */
  bloquesRendimientoDudosos: number;
  mermaMediaPct: number | null;
  pctMarchaGlobal: number;
  pctParoGlobal: number;
  telares: EstadisticasTelar[];
  produccionPorDia: ProduccionDia[];
  produccionPorMaterial: ProduccionMaterial[];
  /** Vacío cuando la fuente no tiene partes de paquetes. */
  produccionPorOperario: ProduccionOperario[];
  roturas: RoturaFleje[];
  ciclosCompletados: CicloBloque[];
  jornadaHoy: JornadaTelar[];
  lecturasSospechosas: number;
}

export interface LecturaCuarentena {
  lectura: LecturaTelar;
  motivos: string[];
}

export interface SaludTelar {
  telarId: number;
  nombre: string;
  lecturas7d: number;
  fiables7d: number;
  pctFiables: number;
}

/** Calidad de los partes de operario (tabla parte_trabajo_mapeada). */
export interface SaludPartes {
  total: number;
  sospechosos: number;
  motivos: { motivo: string; numero: number }[];
}

export interface SaludDatos {
  generadoEn: string;
  telares: SaludTelar[];
  cuarentena: LecturaCuarentena[];
  /** null cuando la fuente no tiene partes (demo). */
  partes: SaludPartes | null;
}

export interface ParteTrabajo {
  id: string;
  fechaHora: string;
  telarId: number;
  operacion: TipoEvento;
  bloque: number | null;
  materialId: string | null;
  medidas: Medidas | null;
  volumenM3: number | null;
  operario1: string | null;
  operario2: string | null;
  paquetes: ResumenPaquetes | null;
}

export interface PaginaPartes {
  rango: RangoEstadisticas;
  telarId: number | null;
  desde: string;
  hasta: string;
  total: number;
  partes: ParteTrabajo[];
}
