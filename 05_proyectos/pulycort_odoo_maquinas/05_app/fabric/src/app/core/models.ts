/**
 * Modelos de dominio de Fabric.
 *
 * Vocabulario: un TELAR corta un BLOQUE de piedra en TABLAS mediante FLEJES.
 * Ciclo de bloque: colocación → aserrado (con paros) → salida → paquetes.
 * Las medidas de bloque existen por duplicado: las declaradas por el
 * proveedor y las medidas reales tomadas en fábrica.
 */

export type EstadoTelar = 'marcha' | 'paro' | 'incidencia' | 'cambio-bloque' | 'sin-datos';

export type TipoIncidencia =
  | 'marcha'
  | 'paro'
  | 'rotura-fleje'
  | 'cambio-bloque'
  | 'desconocida';

export type Turno = 'manana' | 'tarde' | 'noche';

export interface Medidas {
  largoCm: number;
  altoCm: number;
  gruesoCm: number;
}

export interface Material {
  id: string;
  nombre: string;
  /** Color representativo de la piedra para el círculo de material. */
  color: string;
  /** Borde para materiales claros sobre fondo oscuro. */
  colorBorde: string;
  /** Dureza relativa 1-5; condiciona la velocidad de descenso. */
  dureza: number;
}

export interface Bloque {
  numero: number;
  materialId: string;
  medidasProveedor: Medidas;
  medidasFabrica: Medidas;
}

/** Lectura automática emitida por el telar cada ~10 minutos. */
export interface LecturaTelar {
  id: string;
  telarId: number;
  /** Fecha declarada por la máquina; puede llegar corrupta. */
  fechaHora: string; // ISO
  /** Sello de recepción del servidor: siempre fiable, ordena la serie. */
  recibidaEn: string; // ISO
  bloque: number | null;
  incidencia: TipoIncidencia;
  potenciaKw: number;
  amperios: number;
  golpesPorMinuto: number;
  /** Velocidad de descenso del bastidor. */
  velocidadMmH: number;
  /** Posición del bastidor; desciende hasta ~0 al terminar el corte. */
  alturaActualMm: number;
  operario1: string | null;
  operario2: string | null;
  /** Marcada por el validador de calidad de datos (fechas imposibles, etc.). */
  sospechosa: boolean;
  motivosSospecha: string[];
}

export type TipoEvento =
  | 'colocacion'
  | 'aserrado'
  | 'salida'
  | 'paquetes'
  | 'fin-jornada';

export interface ResumenPaquetes {
  numPaquetes: number;
  numTablas: number;
  largoTablaM: number;
  altoTablaM: number;
  gruesoTablaM: number;
  metrosCuadrados: number;
}

/** Parte de trabajo registrado por los operarios. */
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

/** Ciclo completo (o en curso) de un bloque en un telar. */
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
  /** Tablas según fórmula (grueso / (espesor + kerf)); null sin fuente real. */
  tablasPrevistas: number | null;
  m2Previstos: number | null;
  /** Merma de compra: (m³ proveedor − m³ fábrica) / m³ proveedor × 100. */
  mermaVolumenPct: number | null;
  enCurso: boolean;
  /**
   * Las medidas de bloque de la máquina son geométricamente imposibles para
   * el parte real (cara de tabla mayor que cualquier cara del bloque, o más
   * tablas de las que caben). Cuenta como dudoso en el rendimiento m²/m³.
   */
  medidasIncoherentes: boolean;
}

export interface PuntoSerie {
  t: string; // ISO
  v: number;
}

/** Tramo homogéneo de estado, para el Gantt de jornada y las bandas de gráfico. */
export interface SegmentoEstado {
  desde: string;
  hasta: string;
  incidencia: TipoIncidencia;
}

/** Desvío entre la consigna de descenso y el ritmo real medido. */
export interface DesvioRitmo {
  consignaMmH: number;
  realMmH: number;
  desvioPct: number;
}

/** Estado actual de un telar, calculado en servidor (mock). */
export interface SnapshotTelar {
  telarId: number;
  nombre: string;
  estado: EstadoTelar;
  /** Inicio del estado actual (para "parado desde hace 25 min"). */
  estadoDesde: string | null;
  causaParo: TipoIncidencia | null;
  bloque: Bloque | null;
  ultimaLectura: LecturaTelar | null;
  alturaInicialMm: number | null;
  /** 0-100, avance del corte del bloque actual. */
  progresoPct: number | null;
  etaFinCorte: string | null;
  tablasPrevistas: number | null;
  m2Previstos: number | null;
  desvioRitmo: DesvioRitmo | null;
  turno: Turno;
  operario1: string | null;
  operario2: string | null;
  /** Potencia (kW) de las últimas 2 h para el sparkline de la tarjeta. */
  seriePotencia: PuntoSerie[];
  /** ¿Alguna lectura sospechosa en las últimas 24 h alimentando esta tarjeta? */
  datosSospechosos: boolean;
}

export interface KpisPlanta {
  telaresCortando: number;
  telaresTotales: number;
  /**
   * Σ min marcha de los telares / (telares × min transcurridos de hoy) × 100.
   * null con datos reales: el denominador es una decisión de negocio pendiente.
   */
  utilizacionHoyPct: number | null;
  /** null cuando la fuente real no contiene partes de paquetes. */
  m2Hoy: number | null;
  tablasHoy: number | null;
  parosHoy: number;
  minutosParoHoy: number;
  minutosRoturaHoy: number | null;
}

export interface SnapshotPlanta {
  generadoEn: string;
  /**
   * Origen declarado por quien sirve los datos. Si el modo Real recibe
   * 'mock', el backend está en demostración y la UI debe avisarlo.
   * Opcional para tolerar backends anteriores al campo.
   */
  fuente?: 'postgres' | 'mock';
  kpis: KpisPlanta;
  telares: SnapshotTelar[];
  /** Últimos partes de trabajo para el ticker. */
  ultimosEventos: EventoParte[];
}

/** Vigilancia de fatiga del fleje: ratio amperios / velocidad de descenso. */
export interface VigiaFleje {
  ratioActual: number | null;
  ratioMediana: number | null;
  /** Subida sostenida >15 % sobre la mediana del corte. */
  fatigado: boolean;
}

/** Detalle completo de un telar para su vista propia. */
export interface DetalleTelar {
  snapshot: SnapshotTelar;
  /** Series de la jornada (hoy desde 00:00) sin lecturas sospechosas. */
  serieAltura: PuntoSerie[];
  seriePotencia: PuntoSerie[];
  serieGolpes: PuntoSerie[];
  segmentosJornada: SegmentoEstado[];
  /** Disponibilidad del turno actual: min marcha / min de turno transcurridos. */
  disponibilidadTurnoPct: number | null;
  /** Horas de marcha por rotura en 7 días; null = sin roturas. */
  mtbfFleje7dHoras: number | null;
  /** null cuando la fuente real no identifica roturas de fleje. */
  roturas7d: number | null;
  /** Minutos desde la última lectura; la cadencia esperada es 10. */
  latenciaDatosMin: number | null;
  /** null = fuente sin datos (modo Real): heurística inventada, solo se calcula en Demo. */
  vigiaFleje: VigiaFleje | null;
  lecturasRecientes: LecturaTelar[];
  eventosCicloActual: EventoParte[];
  historialCiclos: CicloBloque[];
}

export type RangoEstadisticas = 'hoy' | '7d' | '30d';

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
  fecha: string; // ISO del día (00:00 local)
  /** m² por telar, indexado por telarId. */
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
  /** null cuando la fuente real no contiene partes de paquetes. */
  totalM2: number | null;
  totalM3Aserrados: number;
  totalTablas: number | null;
  totalPaquetes: number | null;
  totalBloques: number;
  /** m² de tabla obtenidos por m³ de bloque aserrado. */
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
  /** Gantt de estados de hoy, siempre referido al día en curso. */
  jornadaHoy: JornadaTelar[];
  lecturasSospechosas: number;
}

/** Lectura en cuarentena con los motivos del validador. */
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

/**
 * Fila del registro de partes de trabajo (la vista "en crudo" de toda la vida):
 * cada evento que registra el operario, con las columnas del sistema antiguo
 * pero estructuradas y con unidades.
 */
export interface ParteTrabajo {
  id: string;
  fechaHora: string;
  telarId: number;
  operacion: TipoEvento;
  bloque: number | null;
  materialId: string | null;
  /** Medida real (de fábrica) del bloque. */
  medidas: Medidas | null;
  volumenM3: number | null;
  operario1: string | null;
  operario2: string | null;
  /** Solo en partes de "Hacer paquetes". */
  paquetes: ResumenPaquetes | null;
}

export interface PaginaPartes {
  rango: RangoEstadisticas;
  /** Telar filtrado; null = todos. */
  telarId: number | null;
  desde: string;
  hasta: string;
  /** Total de partes en el periodo/telar (antes de recortar la página). */
  total: number;
  /** Página devuelta (los más recientes primero). */
  partes: ParteTrabajo[];
}

/**
 * Lectura cruda de un telar tal cual está en la tabla `produccion_mapeada`
 * de la base de datos real. Valores sin interpretar: `material` y los
 * operarios son códigos de Odoo, y las unidades son las de la máquina.
 */
export interface LecturaCruda {
  id: number;
  telarN: string | null;
  operario1: number | null;
  operario2: number | null;
  nBloque: number | null;
  /** Código numérico de Odoo en datos reales; nombre de material en demo. */
  material: number | string | null;
  largo: number | null;
  alto: number | null;
  grueso: number | null;
  potencia: number | null;
  velocidad: number | null;
  incidencia: string | null;
  consumo: number | null;
  golpesXMinuto: number | null;
  alturaActual: number | null;
  fechaHora: string | null;
}

export interface FiltrosLecturas {
  telarN: string | null;
  /** Código real (u id de la demo) de material; null = todos. */
  material: string | null;
  /** Fechas naturales YYYY-MM-DD inclusivas; null = sin límite. */
  desde: string | null;
  hasta: string | null;
  limit: number;
  offset: number;
}

export interface PaginaLecturas {
  total: number;
  limit: number;
  offset: number;
  items: LecturaCruda[];
  /** Materiales distintos de toda la fuente, para el filtro de la UI. */
  materiales: (number | string)[];
}

/**
 * Parte de trabajo de operario tal cual está en la tabla real
 * `parte_trabajo_mapeada`. `operacion`/`accion` son códigos sin tabla de
 * significados confirmada (solo la operación '4' se deduce de los datos:
 * es la única con paquetes/tablas/m²). En demo, `operacion` lleva el nombre
 * del evento simulado.
 */
export interface ParteTrabajoCrudo {
  id: number;
  nTelar: string | null;
  operario1: number | string | null;
  operario2: number | string | null;
  nBloque: number | null;
  material: number | string | null;
  largo: number | null;
  alto: number | null;
  grueso: number | null;
  operacion: string | null;
  nPaquete: number | null;
  nTablas: number | null;
  largoTablas: number | null;
  altoTablas: number | null;
  gruesoTablas: number | null;
  consumo: number | null;
  /** Si el bloque está dado de alta en el inventario de Odoo (lot_block_creation). */
  enInventarioOdoo: boolean | null;
  /** Si el n_bloque existe en el padrón de máquina (bloque_maquinas); false = avisar. */
  bloqueConocido: boolean;
  accion: string | null;
  fechaHora: string | null;
  idBloque: number | null;
  metrosCubicos: number | null;
  metrosCuadradosTablas: number | null;
  materialRecibido: number | null;
}

export interface FiltrosPartesTrabajo {
  telarN: string | null;
  material: string | null;
  operacion: string | null;
  /** Fechas naturales YYYY-MM-DD inclusivas; null = sin límite. */
  desde: string | null;
  hasta: string | null;
  limit: number;
  offset: number;
}

export interface PaginaPartesTrabajo {
  total: number;
  limit: number;
  offset: number;
  items: ParteTrabajoCrudo[];
  /** Catálogos de toda la fuente para los filtros de la UI. */
  materiales: (number | string)[];
  operaciones: string[];
}

/**
 * Alta de bloque en almacén tal cual está en la tabla real
 * `lot_block_creation` de Odoo: cada bloque recibido con la medida declarada
 * por el proveedor (siempre presente) y la medida tomada en fábrica (mrp;
 * null mientras no se mida). En datos reales `material` es `product_id_tmpl`
 * (el código de material del catálogo) y `supplier`/`operario` son FKs de
 * Odoo sin resolver; en demo llevan los ids/nombres de la simulación.
 */
/**
 * Estado de vida del bloque derivado de los partes de trabajo (op. 1-4); lo
 * calcula el backend, el frontend solo lo pinta. Ver `estado-ciclo.ts` del
 * backend y el mock `estadoCicloDemo`.
 */
export type EstadoCicloBloque =
  | 'inventariado'
  | 'moviendo-a-telar'
  | 'aserrando'
  | 'sacando-del-telar'
  | 'almacenando'
  | 'almacenado'
  | 'sin-lecturas';

export interface BloqueInventario {
  id: number;
  name: string | null;
  /** Proveedor: nombre legible (columna `ref`; el FK `supplier` viene vacío en real). */
  ref: string | null;
  material: number | string | null;
  variantId: number | null;
  attributeValueId: number | null;
  operario: number | string | null;
  supplier: number | string | null;
  poId: number | null;
  pickingId: number | null;
  locationDestId: number | null;
  thirdPartyMaterial: boolean | null;
  deliveryDone: boolean | null;
  createLotDone: boolean | null;
  /** Medidas en metros (real y demo); ver m3Supplier para el porqué. */
  largoSupplier: number;
  altoSupplier: number;
  gruesoSupplier: number;
  largoMrp: number | null;
  altoMrp: number | null;
  gruesoMrp: number | null;
  /**
   * Volumen del proveedor en m³, derivado en el backend/mock como
   * `largo × alto × grueso` (medidas en metros). Con la antigua suposición de
   * cm el m³ salía ~0 en toda la columna.
   */
  m3Supplier: number;
  /** Volumen de fábrica en m³; null mientras no haya medida de fábrica. */
  m3Mrp: number | null;
  /** Merma de compra en %: `(m³ proveedor − m³ fábrica) / m³ proveedor × 100`; null si falta dato. */
  mermaPct: number | null;
  createDate: string | null;
  writeDate: string | null;
  estadoCiclo: EstadoCicloBloque;
}

export interface FiltrosInventario {
  /** Código de material (u id de la demo); null = todos. */
  material: string | null;
  /** Nombre de proveedor (columna `ref`); null = todos. */
  proveedor: string | null;
  /** Estado de ciclo de vida del bloque; null = todos. */
  estado: EstadoCicloBloque | null;
  /** Búsqueda por nº de bloque o proveedor (`ref`); null = sin búsqueda. */
  q: string | null;
  /** Fechas naturales YYYY-MM-DD inclusivas sobre el alta; null = sin límite. */
  desde: string | null;
  hasta: string | null;
  limit: number;
  offset: number;
}

export interface PaginaInventario {
  total: number;
  limit: number;
  offset: number;
  items: BloqueInventario[];
  /** Catálogos de toda la fuente para los filtros de la UI. */
  materiales: (number | string)[];
  /** Proveedores distintos (valores de `ref`). */
  proveedores: string[];
}
