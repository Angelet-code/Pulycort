export const rangosEstadisticas = ['hoy', '7d', '30d', '90d', '1a', 'todo'] as const;

/**
 * Cómo se agregan las barras del gráfico de producción según el rango:
 * por día (hoy/7d), por semana natural lunes→domingo (30d/90d) o por mes
 * (1a/todo). Lo decide el backend; el frontend solo lo pinta y etiqueta.
 */
export const granularidades = ['dia', 'semana', 'mes'] as const;
export type Granularidad = (typeof granularidades)[number];

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
  /** Alias funcional de `numero` cuando procede de `n_bloque` de maquinas/partes. */
  pmLote: number;
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
  /** Columna fuente heredada `n_bloque`; se conserva por compatibilidad. */
  bloque: number | null;
  /** Matricula operativa confirmada para lecturas de maquina/partes. */
  pmLote: number | null;
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
  /** Columna fuente heredada `n_bloque`; se conserva por compatibilidad. */
  bloque: number | null;
  /** Matricula operativa confirmada para lecturas de maquina/partes. */
  pmLote: number | null;
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
  /** Matricula operativa confirmada; deriva de `n_bloque` del run. */
  pmLote: number;
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
  /**
   * Espesor de corte de la tabla acabada, en cm (`grueso_tablas` del parte
   * real × 100). null sin parte: nunca se asume el 2 cm de la estimación.
   * La interpretación de `grueso_tablas` como espesor de corte está pendiente
   * de confirmar con TotWare (00_gestion/TAREAS.md).
   */
  espesorCorteCm: number | null;
  /**
   * Volumen del lote (PM) en m³, de la MEDIDA REAL del bloque en el inventario
   * `lot_block_creation` por PM (metros → m³ directo), no de la medida de
   * consola de `produccion_mapeada` (que hereda del bloque anterior = ruido).
   * Suma de los bloques del lote si el PM tiene varios. null = el PM no está
   * dado de alta en inventario (sin medida real).
   */
  volumenM3: number | null;
  /**
   * Rendimiento del lote en m²/m³: m² reales del parte sobre el m³ del
   * inventario. null si no hay parte real o el PM no tiene medida real.
   */
  rendimientoM2M3: number | null;
  /**
   * Nº de bloques físicos del lote (PM) según el inventario. null = PM sin alta
   * en inventario. Lo común es 1 (1 lote = 1 bloque); >1 es la excepción.
   */
  bloquesEnLote: number | null;
  /**
   * El m³/rendimiento del lote NO es exacto: lote multibloque (no se certifica
   * que el parte cubra todos los bloques) o medida de proveedor usada como
   * respaldo al faltar la de fábrica. false = 1 bloque con medida de fábrica.
   */
  volumenEstimado: boolean;
  /**
   * La medida del bloque en el inventario es físicamente imposible incluso tras
   * normalizar unidades cm→m (corrupción real de `lot_block_creation`): se anula
   * el m³ y el rendimiento (`volumenM3`/`rendimientoM2M3` a null) y la UI lo marca
   * ⚠ para revisar, en vez de pintar un m³ que sabemos falso.
   */
  volumenImposible: boolean;
  /**
   * El m³ del inventario es MENOR que la piedra que salió en tabla (m² del parte
   * × espesor de corte): m³ y parte son incompatibles y uno de los dos es erróneo
   * (m³ del alta infradimensionado o m² de otro corte cruzado al lote; no se decide
   * cuál). A diferencia de `volumenImposible` (dimensión suelta fuera de rango),
   * aquí cada cota es plausible y solo el cruce con el parte lo delata. Se anula el
   * rendimiento (sería mayor que el techo físico 1/espesor) y la UI lo marca ⚠; el
   * m³ se sigue mostrando como dato del inventario a revisar.
   */
  volumenIncompatibleParte: boolean;
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
  /** ISO del inicio del periodo (día, lunes de la semana o día 1 del mes). */
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
  /** Columna fuente heredada `n_bloque`; se conserva por compatibilidad. */
  bloque: number | null;
  /** Matricula operativa confirmada para lecturas de maquina/partes. */
  pmLote: number | null;
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
  /** Agregación de `produccionPorDia`: por día, semana o mes según el rango. */
  granularidad: Granularidad;
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

/** Veredicto de salud de una fuente de datos. */
export type EstadoFuente = 'ok' | 'aviso' | 'mal' | 'sin-datos';

/**
 * Familia de la tabla, para agrupar las fuentes en la pestaña Salud → Fuentes:
 * - `maquinas`: lecturas y partes que emiten los telares y el disco puente.
 * - `inventario`: stock real de Odoo (lotes, existencias, ubicaciones).
 * - `catalogo`: maestro de productos de Odoo (solo resuelve nombres de material).
 * - `heredada`: tabla antigua con uso acotado; no es fuente fiable de inventario.
 */
export type GrupoFuente = 'maquinas' | 'inventario' | 'catalogo' | 'heredada';

/**
 * Una de las tablas de la base de datos que alimentan Fabric: qué es, de dónde
 * sale y cómo está funcionando ahora mismo. El veredicto (`estado`) y el
 * `diagnostico` se derivan de los datos (frecuencia, fiabilidad); el resto es
 * descripción fija de la fuente. El frontend solo lo pinta.
 */
export interface FuenteDato {
  /** Familia de la tabla para agruparla en la vista. */
  grupo: GrupoFuente;
  /** Tabla real de origen; identificador estable de la fuente. */
  tabla: string;
  /** Nombre legible de la fuente. */
  nombre: string;
  /** Sistema o máquina del que sale el dato. */
  origen: string;
  /** Qué contiene y para qué la usa Fabric. */
  descripcion: string;
  /** Nº de registros de la fuente; null si no se pudo contar. */
  registros: number | null;
  /** Marca del registro más reciente (ISO); null si no hay o no se pudo leer. */
  ultimaActualizacion: string | null;
  /** Veredicto de salud derivado de los datos. */
  estado: EstadoFuente;
  /** Cómo está funcionando ahora: fiabilidad, avisos, cobertura. */
  diagnostico: string;
}

export interface SaludDatos {
  generadoEn: string;
  /** Las tablas que alimentan Fabric, con su origen y su salud. */
  fuentes: FuenteDato[];
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
  /** Columna fuente heredada `n_bloque`; se conserva por compatibilidad. */
  bloque: number | null;
  /** Matricula operativa confirmada para lecturas de maquina/partes. */
  pmLote: number | null;
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
