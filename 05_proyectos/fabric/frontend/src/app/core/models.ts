/**
 * Modelos de dominio de Fabric.
 *
 * Vocabulario: en lecturas de maquina/partes, `n_bloque` es PM/lote
 * (matricula operativa). "Bloque" queda para inventario fisico
 * (`lot_block_creation`) o para campos heredados de compatibilidad.
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
  /** Alias funcional de `numero` cuando procede de `n_bloque` de maquinas/partes. */
  pmLote: number;
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
  /** Campo heredado de contrato; leer `pmLote` en UI nueva. */
  bloque: number | null;
  /** Matricula operativa confirmada para lecturas de maquina/partes. */
  pmLote: number | null;
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
  /** Campo heredado de contrato; leer `pmLote` en UI nueva. */
  bloque: number | null;
  /** Matricula operativa confirmada para lecturas de maquina/partes. */
  pmLote: number | null;
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
  /** Matricula operativa confirmada; deriva de `n_bloque` del run. */
  pmLote: number;
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
  /**
   * Espesor de corte de la tabla acabada, en cm (`grueso_tablas` del parte
   * real). null sin parte: nunca se asume el 2 cm de la estimación.
   * Interpretación de `grueso_tablas` pendiente de confirmar (ver TAREAS.md).
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
   * La medida del bloque en el inventario es físicamente imposible aun tras
   * normalizar unidades cm→m (corrupción real de `lot_block_creation`): el m³ y
   * el rendimiento llegan a null y la UI lo marca ⚠ a revisar, sin inventar valor.
   */
  volumenImposible: boolean;
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
  /** 0-100, avance del corte del lote actual. */
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

export type RangoEstadisticas = 'hoy' | '7d' | '30d' | '90d' | '1a' | 'todo';

/** Agregación de las barras de producción: por día, semana natural o mes. */
export type Granularidad = 'dia' | 'semana' | 'mes';

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
  fecha: string; // ISO del inicio del periodo (día, lunes de la semana o día 1 del mes)
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
  /** Campo heredado de contrato; leer `pmLote` en UI nueva. */
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

/** Veredicto de salud de una fuente de datos. */
export type EstadoFuente = 'ok' | 'aviso' | 'mal' | 'sin-datos';

/**
 * Familia de la tabla, para agrupar las fuentes: máquinas (telares/disco puente),
 * inventario (stock real de Odoo), catálogo (maestro de productos) y heredada
 * (tabla antigua con uso acotado). Opcional para tolerar backends anteriores al
 * campo: la vista agrupa lo que no la traiga bajo "Otras fuentes".
 */
export type GrupoFuente = 'maquinas' | 'inventario' | 'catalogo' | 'heredada';

/**
 * Una de las tablas de la base de datos que alimentan Fabric: qué es, de dónde
 * sale y cómo está funcionando. El `estado` y el `diagnostico` los deriva el
 * backend de los datos; el frontend solo los pinta.
 */
export interface FuenteDato {
  /** Familia de la tabla para agruparla en la vista; opcional por compatibilidad. */
  grupo?: GrupoFuente;
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
  /**
   * Las tablas que alimentan Fabric, con su origen y su salud. Opcional para
   * tolerar backends anteriores al campo (la UI no pinta la sección si falta).
   */
  fuentes?: FuenteDato[];
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
  /** Campo heredado de contrato; leer `pmLote` en UI nueva. */
  bloque: number | null;
  /** Matricula operativa confirmada para lecturas de maquina/partes. */
  pmLote: number | null;
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
  /** Columna fuente heredada `n_bloque`; se conserva por compatibilidad. */
  nBloque: number | null;
  /** Matricula operativa confirmada para lecturas de maquina/partes. */
  pmLote: number | null;
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
  /** Columna fuente heredada `n_bloque`; se conserva por compatibilidad. */
  nBloque: number | null;
  /** Matricula operativa confirmada para partes/maquinas. */
  pmLote: number | null;
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
 * Parte del disco puente tal cual está en la tabla real
 * `parte_discopuente_mapeada` (la máquina puente que recorta las tablas que
 * salen del telar). Lectura en crudo, sin cálculos derivados: `operacion`,
 * `acabado` y `discoPuenteN` son códigos/textos de TotWare sin tabla de
 * significados confirmada; `material` y los operarios son FKs de Odoo (en demo,
 * los ids/nombres de la simulación). `metro2Entrada/Salida` y `eficienciaM2`
 * llegan ya calculados por el mapeador. Las hasta 8 medidas de tabla van en
 * arrays de longitud 8 (índice 0 = tabla 1). Ver el módulo `parte-disco-puente`
 * del backend.
 */
export interface ParteDiscoPuenteCrudo {
  id: number;
  discoPuenteN: string | null;
  operario1: number | string | null;
  operario2: number | string | null;
  /** Columna fuente heredada `n_bloque`; se conserva por compatibilidad. */
  nBloque: number | null;
  /** Matricula operativa confirmada para partes/maquinas. */
  pmLote: number | null;
  idBloque: number | null;
  /** Si el bloque está dado de alta en el inventario de Odoo (lot_block_creation). */
  enInventarioOdoo: boolean | null;
  /** Si el n_bloque existe en el padrón de máquina (bloque_maquinas); false = avisar. */
  bloqueConocido: boolean;
  material: number | string | null;
  materialRecibido: number | null;
  operacion: string | null;
  acabado: string | null;
  largo: number | null;
  alto: number | null;
  grueso: number | null;
  nPaquete: number | null;
  nTablas: number | null;
  /** Deriva de `pm_losa`: palet/cajón de salida, no losa individual. */
  contenedorSalida: number | null;
  /** Medidas de las hasta 8 tablas del parte (índice 0 = tabla 1). */
  largoTablas: (number | null)[];
  altoTablas: (number | null)[];
  gruesoTablas: number | null;
  consumo: number | null;
  metro2Entrada: number | null;
  metro2Salida: number | null;
  eficienciaM2: number | null;
  fechaHora: string | null;
  /** true si la lectura es sospechosa (hoy solo: fecha declarada en el futuro). */
  sospechosa: boolean;
  motivosSospecha: string[];
}

export interface FiltrosPartesDiscoPuente {
  /** Nº de disco puente (catálogo dinámico); null = todos. */
  disco: string | null;
  material: string | null;
  operacion: string | null;
  /** Fechas naturales YYYY-MM-DD inclusivas; null = sin límite. */
  desde: string | null;
  hasta: string | null;
  limit: number;
  offset: number;
}

export interface PaginaPartesDiscoPuente {
  total: number;
  limit: number;
  offset: number;
  items: ParteDiscoPuenteCrudo[];
  /** Catálogos de toda la fuente para los filtros de la UI. */
  discosPuente: string[];
  materiales: (number | string)[];
  operaciones: string[];
}

/**
 * Parte de la reforzadora de tablas tal cual está en la tabla real
 * `reforzadora_mapeada` (refuerza las tablas con malla + resina). Lectura en
 * crudo: `acabado` y `eventos` son códigos de texto sin tabla de significados
 * confirmada; `material` y los operarios son FKs de Odoo. `n_reforzadora` HOY
 * solo trae '1' (no separa REFORZADORA 1 de REFORZADORA 2 SEI). Medidas en cm;
 * `metrosCuadrados` lo deriva el backend de n_tablas × largo × alto. Ver el
 * módulo `parte-reforzadora` del backend.
 */
export interface ParteReforzadoraCrudo {
  id: number;
  nReforzadora: string | null;
  operario1: number | string | null;
  operario2: number | string | null;
  /** Columna fuente `n_bloque`; se conserva por compatibilidad. */
  nBloque: number | null;
  /** Matrícula operativa: PM/lote. */
  pmLote: number | null;
  /** Si el n_bloque existe en el padrón de máquina (bloque_maquinas); false = avisar. */
  bloqueConocido: boolean;
  material: number | string | null;
  nTablas: number | null;
  /** Medidas de tabla en cm. */
  largo: number | null;
  alto: number | null;
  grueso: number | null;
  consumo: number | null;
  acabado: string | null;
  eventos: string | null;
  /** m² reforzados (n_tablas × largo × alto, cm → m²); null si falta algún dato. */
  metrosCuadrados: number | null;
  fechaHora: string | null;
  /** true si la lectura es sospechosa (hoy solo: fecha declarada en el futuro). */
  sospechosa: boolean;
  motivosSospecha: string[];
}

export interface FiltrosPartesReforzadora {
  /** Nº de reforzadora (catálogo dinámico); null = todas. */
  reforzadora: string | null;
  material: string | null;
  acabado: string | null;
  /** Fechas naturales YYYY-MM-DD inclusivas; null = sin límite. */
  desde: string | null;
  hasta: string | null;
  limit: number;
  offset: number;
}

export interface PaginaPartesReforzadora {
  total: number;
  limit: number;
  offset: number;
  items: ParteReforzadoraCrudo[];
  /** Catálogos de toda la fuente para los filtros de la UI. */
  reforzadoras: string[];
  materiales: (number | string)[];
  acabados: string[];
}

/**
 * Mapa de cobertura de las máquinas de planta (`/cobertura-maquinas` del
 * backend): para cada máquina del catálogo (sala de aserrado M3 + sala de
 * máquinas M2) indica de qué tabla real sale su dato y en qué estado está su
 * integración en Fabric. El catálogo es dato curado; el volumen (filas, lotes,
 * última actividad) lo calcula el backend. Lo no conectado llega con stats en
 * null y la UI lo pinta como "—": no se inventa actividad donde no la hay.
 */
export type SeccionPlanta = 'M3' | 'M2';

/**
 * - `integrada`: el dato se lee y se atribuye a esta máquina.
 * - `parcial`: hay dato pero no se puede atribuir a esta máquina (los 3
 *   discopuentes comparten un único `disco_puente_n`).
 * - `pendiente`: aún sin fuente de datos conectada.
 */
export type EstadoIntegracion = 'integrada' | 'parcial' | 'pendiente';

export type FamiliaMaquina =
  | 'telar'
  | 'disco_puente'
  | 'reforzadora'
  | 'pulidora'
  | 'corte'
  | 'cnc'
  | 'acabado'
  | 'taller';

export interface CoberturaMaquina {
  /** Código del catálogo curado (1–19). */
  codigo: number;
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
  ultimaActividad: string | null;
  /** Nota de integración (p. ej. la discrepancia 3 máquinas físicas vs 1 flujo). */
  nota: string | null;
}

export interface CoberturaMaquinas {
  generadoEn: string;
  /** Una entrada por máquina del catálogo, en orden de código. */
  maquinas: CoberturaMaquina[];
}

/**
 * Bloque en existencias del inventario. El inventario UNE DOS ERAS de datos
 * disjuntas (ninguna sola es completa): `fuente='stock'` = lote de `stock_lot`
 * on-hand (snapshot histórico de Odoo) y `fuente='alta'` = bloque recibido
 * reciente de `lot_block_creation` aún no procesado por el stock y no consumido.
 * `material` es el id de producto, que el backend resuelve contra
 * `product_template` para dar `materialNombre` (sin "M3 BLOQUE"). En demo, los
 * valores salen de la simulación.
 */
export type TipoBloque = 'block' | 'othermaterial';

export interface BloqueInventario {
  id: number;
  /**
   * Era/origen del dato: `stock` = existencias on-hand del snapshot de Odoo;
   * `alta` = recepción reciente (`lot_block_creation`) aún sin existencias en el
   * stock. Opcional para tolerar backends/demo anteriores al campo.
   */
  fuente?: 'stock' | 'alta';
  /** Nº de bloque (`stock_lot.name` o `lot_block_creation.name`). */
  name: string | null;
  /** Id de producto del material (en demo, id de la simulación). */
  material: number | string | null;
  /** Nombre legible del material, ya resuelto por el backend/mock (sin "M3 BLOQUE"). */
  materialNombre: string | null;
  /** Clasificación del lote (`type_product_lot`): bloque estándar u otro material. */
  tipo: TipoBloque;
  /** Ubicación física on-hand (`stock_location.complete_name`), p. ej. "WH/Stock". */
  ubicacion: string | null;
  /** Medidas en metros; null si la fuente no las trae. */
  largoSupplier: number | null;
  altoSupplier: number | null;
  gruesoSupplier: number | null;
  largoMrp: number | null;
  altoMrp: number | null;
  gruesoMrp: number | null;
  /** Volumen del proveedor en m³ (`largo × alto × grueso`, metros); null sin medida. */
  m3Supplier: number | null;
  /** Volumen de fábrica en m³; null mientras no haya medida de fábrica (lo normal on-hand). */
  m3Mrp: number | null;
  /** La medida de proveedor es imposible aun tras normalizar cm→m: la UI oculta su m³ con ⚠. */
  m3SupplierImposible: boolean;
  /** Igual para la medida de fábrica (mrp): se oculta su m³ y la merma. */
  m3MrpImposible: boolean;
  /** Merma de compra en %: `(m³ proveedor − m³ fábrica) / m³ proveedor × 100`; null si falta dato o alguna medida es imposible. */
  mermaPct: number | null;
  createDate: string | null;
  writeDate: string | null;
}

export interface FiltrosInventario {
  /** Nombre de material (casa todas sus variantes de id de Odoo); null = todos. */
  material: string | null;
  /** Búsqueda por nº de bloque (`name`); null = sin búsqueda. */
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
  /** Nombres de material distintos (deduplicados) para el desplegable. */
  materiales: string[];
}

/**
 * Formas de existencia del inventario: `bloques` (m³, dato real), `tablas` y
 * `losas` (m², aún sin fuente). El mapa (treemap) de inventario dimensiona cada
 * material por su `cantidad` en la forma activa.
 */
export type FormaInventario = 'bloques' | 'tablas' | 'losas';

/** Existencias de un material dentro de una forma (lo agrega el backend/mock). */
export interface ResumenMaterial {
  /** Nombre legible del material (ya deduplicado). */
  material: string;
  /** Magnitud que dimensiona el treemap: m³ (bloques) o m² (tablas/losas). */
  cantidad: number;
  /** Nº de piezas en existencias que componen esa cantidad. */
  piezas: number;
}

/** Existencias por material de una forma. */
export interface ResumenInventario {
  forma: FormaInventario;
  /** Unidad de `cantidad`: 'm³' (bloques) o 'm²' (tablas/losas). */
  unidad: string;
  /** true si la forma aún no tiene fuente conectada (tablas/losas en real). */
  pendiente: boolean;
  totalCantidad: number;
  totalPiezas: number;
  /** Materiales ordenados de mayor a menor `cantidad`. */
  materiales: ResumenMaterial[];
}

/** Las tres formas de existencia juntas, para el mapa de inventario. */
export interface InventarioVistaConjunta {
  generadoEn: string;
  /** Una entrada por forma, en orden [bloques, tablas, losas]. */
  formas: ResumenInventario[];
}
