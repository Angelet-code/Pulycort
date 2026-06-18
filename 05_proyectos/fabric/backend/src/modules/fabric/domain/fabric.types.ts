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
  | 'paro-rotura-material'
  | 'modo-manual'
  | 'modo-automatico'
  | 'rotura-fleje'
  | 'cambio-bloque'
  | 'desconocida'
  // Solo en segmentos del Gantt/gráficos: tramo sin lectura fiable (hueco mayor
  // que la cadencia). Nunca se asigna a una lectura individual; marca "no hay
  // dato", no un estado de la máquina, para no inventar lo que pasó en el hueco.
  | 'sin-datos';

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
  /**
   * Avisos de calidad que NO descartan la lectura: sigue contando en los KPIs,
   * pero se marca (consumo/velocidad inusuales, altura rara, etc.).
   */
  alertas: string[];
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
   * null = el PM no está dado de alta en inventario, su medida es imposible o el
   * PM está duplicado (sin medida fiable del bloque).
   */
  volumenM3: number | null;
  /**
   * Rendimiento del lote en m²/m³: m² reales del parte sobre el m³ del
   * inventario. null si no hay parte real o el PM no tiene medida real.
   */
  rendimientoM2M3: number | null;
  /**
   * Nº de filas de este PM (nº de lote) en el inventario. La PM es un
   * identificador ÚNICO de bloque (1:1, confirmado por Pulycort 2026-06-15):
   * debe ser 1. >1 = PM duplicado (error de dato, ver `pmDuplicado`). null = PM
   * sin alta en inventario.
   */
  bloquesEnLote: number | null;
  /**
   * El m³/rendimiento del lote NO es exacto: se usó la medida del proveedor como
   * respaldo al faltar la de fábrica. false = medida de fábrica.
   */
  volumenEstimado: boolean;
  /**
   * El PM aparece en más de un bloque del inventario. Como la PM debe ser un
   * identificador único (1:1), es un error de dato: no se sabe la medida del
   * bloque, así que el m³/rendimiento se anulan (a null) y la UI lo marca ⚠.
   */
  pmDuplicado: boolean;
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
  /**
   * El parte de aserrado (op 4) de esta PM consta en OTRO telar, no en el de
   * este run, y este run no tiene parte propio. Señal de PM heredada o mal
   * etiquetada por la consola del telar (caso típico del telar 4, que arrastra
   * una PM ya aserrada en otro telar): el ciclo probablemente no es un aserrado
   * real de esta PM en este telar. La UI lo marca ⚠ en la PM; la fila es dudosa.
   */
  parteEnOtroTelar: boolean;
}

/**
 * Actividad del operario tomada del último parte de trabajo del telar
 * (`parte_trabajo_mapeada`): qué hace (operacion 1-4) o por qué se paró (accion,
 * cuando operacion=0). Se pinta en el badge con prioridad sobre el estado de
 * máquina mientras es reciente (20 min); "Fin de jornada" dura hasta que la
 * máquina vuelve a dar señal de actividad. Mapeo: shared/domain/codigos-parte.ts.
 */
export interface ActividadParte {
  etiqueta: string;
  /** operacion = trabajo normal; evento = parada/incidencia; fin-jornada = descanso. */
  categoria: 'operacion' | 'evento' | 'fin-jornada';
  /** Fecha del parte que la originó (ISO). */
  desde: string;
}

export interface SnapshotTelar {
  telarId: number;
  nombre: string;
  estado: EstadoTelar;
  estadoDesde: string | null;
  causaParo: TipoIncidencia | null;
  /** Actividad del operario (último parte); null si no hay parte reciente. */
  actividadParte: ActividadParte | null;
  bloque: Bloque | null;
  ultimaLectura: LecturaTelar | null;
  /**
   * Marca de la ÚLTIMA lectura recibida del telar, esté o no fresca: para
   * mostrar siempre "hace cuánto" llegó el último dato, aunque el telar lleve
   * horas o días callado (entonces `ultimaLectura` es null por «sin señal»,
   * pero esta marca persiste). null solo si el telar nunca ha emitido.
   */
  ultimaLecturaEn: string | null;
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
  /** ¿Alguna lectura con avisos (no descartada) en las últimas 24 h? */
  datosConAvisos: boolean;
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
  /** Velocidad de descenso del bastidor (mm/h) a lo largo de la jornada. */
  serieVelocidad: PuntoSerie[];
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
  /**
   * Consumo eléctrico medio en marcha (kW ≈ kWh por hora), descartando las
   * lecturas con el telar parado. null si no hubo lecturas en marcha en el
   * rango: sin base no se inventa un 0.
   */
  potenciaMediaKw: number | null;
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

/**
 * Rendimiento m²/m³ desglosado por grosor de corte de la tabla. El rendimiento
 * depende sobre todo del grosor (a menor grosor, más m² por m³: el techo físico
 * es ~1 m³ ÷ grosor), así que el agregado único mezcla cortes no comparables.
 * Cada fila agrega los lotes con parte real de ese grosor con el mismo criterio
 * que `rendimientoM2M3`: Σ m² del parte ÷ Σ m³ de bloque.
 */
export interface RendimientoEspesor {
  /** Grosor de corte de la tabla en cm (clave del grupo, 1 decimal). */
  espesorCorteCm: number;
  /** m²/m³ medio del grupo; null si su base es toda de medidas dudosas. */
  rendimientoM2M3: number | null;
  /** Lotes con parte real y m³ que entran en este grosor. */
  bloques: number;
  /** De esos, los de medidas dudosas (no se restan; el sesgo solo es por defecto). */
  bloquesDudosos: number;
  /** Σ m² reales de los partes del grupo. */
  m2: number;
  /** Σ m³ de los bloques del grupo. */
  m3: number;
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
  /** Desglose de `rendimientoM2M3` por grosor de corte, ordenado por grosor. */
  rendimientoPorEspesor: RendimientoEspesor[];
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

/** Lectura con avisos del validador que NO se descarta (cuenta en KPIs). */
export interface LecturaAviso {
  lectura: LecturaTelar;
  alertas: string[];
}

export interface SaludTelar {
  telarId: number;
  nombre: string;
  lecturas7d: number;
  /** No descartadas (cuentan en KPIs, incluidas las que llevan avisos). Salud de la fuente. */
  fiables7d: number;
  /** % no descartadas. */
  pctFiables: number;
  /** Lecturas con algún aviso (no descartadas) en la ventana de 7 días. */
  conAvisos7d: number;
  /** 100% limpias: ni descartadas ni con avisos. */
  limpias7d: number;
  /** % de lecturas 100% limpias; es el KPI por telar de Salud. */
  pctLimpias: number;
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
  /** Lecturas con avisos que NO se descartan (siguen contando en KPIs). */
  avisos: LecturaAviso[];
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

/**
 * Una de las fuentes de medida de un bloque, normalizada a METROS. Cada
 * dimensión es null si la fuente no la trae; `volumenM3` solo si están las tres
 * y son > 0. `imposible` = la medida sigue fuera de rango físico tras normalizar
 * cm→m (corrupción real). Sirve para comparar lado a lado proveedor / fábrica /
 * consola del telar y localizar de dónde sale el descuadre.
 */
export interface MedidaBloqueFuente {
  largoM: number | null;
  altoM: number | null;
  gruesoM: number | null;
  volumenM3: number | null;
  imposible: boolean;
}

/**
 * Una lectura del telar del bloque, con las medidas de bloque que llevaba esa
 * lectura (consola, cm). La lectura ya trae su `sospechosa`/`motivosSospecha`/
 * `alertas` del validador, así que la UI las pinta directamente. Sirve para ver
 * "qué pasó" lectura a lectura (cuándo cambió la medida de consola, qué
 * incidencias, paros, consumo, altura…). No se deja nada fuera.
 */
export interface LecturaBloqueDudosa {
  lectura: LecturaTelar;
  /** Medidas de bloque tecleadas en esa lectura (consola). 0 si la lectura no las trae. */
  largoCm: number;
  altoCm: number;
  gruesoCm: number;
}

/**
 * Un bloque/lote cuyas medidas son DUDOSAS: reúne TODAS sus fuentes de medida
 * (proveedor de inventario, fábrica/MRP, consola del telar y parte de trabajo) y
 * qué pasó en el telar con ese lote, para diagnosticar el origen del ruido del
 * dato. Entra en la lista si tiene al menos una bandera de medida/identidad
 * activa (las alertas de lectura no lo incluyen, pero sí se muestran en su
 * detalle). Todas las cifras con su unidad; lo que no consta va a null.
 */
export interface BloqueDudoso {
  // ── Identidad ──
  /** = CicloBloque.id (`${telarId}-${pm}-${desdeMs}`). */
  id: string;
  /** Nº de lote (PM = n_bloque, identificador único de bloque 1:1). */
  pmLote: number;
  telarId: number;
  telarNombre: string;
  inicioCorte: string;
  finCorte: string | null;
  enCurso: boolean;
  materialId: string;
  /** Operarios del lote (nombres resueltos), de las lecturas del run. */
  operarios: string[];

  // ── Por qué es dudoso ──
  /** Etiquetas legibles de las banderas activas (para la columna "Motivos"). */
  motivos: string[];
  medidasIncoherentes: boolean;
  volumenIncompatibleParte: boolean;
  volumenImposible: boolean;
  pmDuplicado: boolean;
  parteEnOtroTelar: boolean;

  // ── Fuentes 1 y 2: inventario (alta/stock de Odoo) ──
  /**
   * Medidas de alta del bloque en el inventario. null = el PM no está dado de
   * alta (ni en `lot_block_creation` ni en `stock_lot`): sin entrada que comparar.
   */
  inventario: {
    /** De qué era salió: alta reciente (`lot_block_creation`) o stock (`stock_lot`). */
    fuente: 'alta' | 'stock';
    /** Medida del proveedor (`*_supplier`). */
    proveedor: MedidaBloqueFuente;
    /** Medida de fábrica/MRP (`*_mrp`); suele faltar hasta procesar el bloque. */
    fabrica: MedidaBloqueFuente;
    /** Merma de compra %: (m³ proveedor − m³ fábrica)/m³ proveedor; null sin las dos. */
    mermaPct: number | null;
    /** Nº de filas del PM en `lot_block_creation` (debe ser 1; >1 = duplicado). */
    bloques: number;
  } | null;

  // ── Fuente 3: consola del telar (produccion_mapeada) ──
  /**
   * Medida del bloque según la consola del telar, en METROS (misma forma que
   * proveedor/fábrica para compararlas lado a lado). La consola hereda la medida
   * del bloque anterior = ruido; por eso suele no cuadrar con el alta.
   */
  consola: MedidaBloqueFuente;
  /**
   * Nº de lote (PM) del bloque cortado JUSTO ANTES en este mismo telar: al empezar
   * este corte la consola arrastraba su valor (no se reinicia al cambiar de bloque),
   * verificado contra datos reales —la 1ª lectura de este run = la última del run
   * anterior—; por eso la medida de consola no cuadra con el alta. Es el run
   * inmediatamente previo en el tiempo, con lote distinto, dentro de la ventana
   * analizada. null = no hay run anterior en la ventana (primer corte cargado de
   * ese telar): no se inventa cuál.
   */
  loteBloqueAnterior: number | null;

  // ── Fuente 4: producción + parte de trabajo ──
  horasMarcha: number;
  horasParo: number;
  numParos: number;
  numLecturas: number;
  numLecturasConAlertas: number;
  numLecturasSospechosas: number;
  paquetes: ResumenPaquetes | null;
  espesorCorteCm: number | null;
  /** m³ "oficial" del lote (el de `CicloBloque.volumenM3`, del inventario). */
  volumenInventarioM3: number | null;
  rendimientoM2M3: number | null;
  tablasPrevistas: number | null;
  m2Previstos: number | null;

  // ── Señales de coherencia física (para detectar errores) ──
  /** m³ de piedra que salió en tabla = m² del parte × espesor de corte. */
  piedraCortadaM3: number | null;
  /** Merma de aserrado %: (m³ bloque − piedra cortada)/m³ bloque. Negativa = imposible. */
  mermaAserradoPct: number | null;
  /** Techo físico del rendimiento a este grosor: 1/grosor (= 100/espesorCorteCm) m²/m³. */
  techoRendimientoM2M3: number | null;
  /** Rendimiento como % del techo físico. >100 % = físicamente imposible. */
  rendimientoSobreTechoPct: number | null;
  /** Nº de medidas de bloque distintas que dio la consola durante el corte. */
  consolaMedidasDistintas: number;
  /** La medida de consola cambió durante el corte (>1 distinta): ruido/heredada. */
  consolaInestable: boolean;

  // ── Detalle fino: todas las lecturas del lote en ese telar ──
  lecturas: LecturaBloqueDudosa[];
}

export interface MedidasDudosasPagina {
  telarId: number | null;
  /** Ventana efectiva analizada (ISO): desde, y hasta exclusivo o "ahora". */
  desde: string;
  hasta: string;
  /** Nº total de bloques dudosos en la ventana (antes de recortar). */
  total: number;
  /** Nº total de lotes aserrados en la ventana (denominador: dudosos de cuántos). */
  totalBloques: number;
  /** true si se recortó la lista (total > bloques devueltos). */
  truncado: boolean;
  /** Conteo de bloques por bandera sobre el TOTAL (no solo los devueltos). */
  conteo: {
    medidasIncoherentes: number;
    volumenIncompatibleParte: number;
    volumenImposible: number;
    pmDuplicado: number;
    parteEnOtroTelar: number;
  };
  bloques: BloqueDudoso[];
}
