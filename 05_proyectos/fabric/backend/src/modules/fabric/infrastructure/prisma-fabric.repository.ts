import { Injectable } from '@nestjs/common';
import {
  ParteTrabajoMapeada as FilaParte,
  ProduccionMapeada as FilaProduccion,
} from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/database/prisma/prisma.service';
import {
  bloqueImposible,
  dimensionBloqueAMetros,
  volumenBloqueM3,
  volumenMenorQuePiedraCortada,
} from '../../../shared/domain/medidas-bloque';
import {
  ACCION_FIN_JORNADA,
  TELAR_ACCION,
  TELAR_OPERACION,
} from '../../../shared/domain/codigos-parte';
import {
  BandaConsumo,
  bandaConsumo,
  umbralConsumoDePotencias,
} from '../../../shared/domain/consumo-atipico';
import { FabricRepository } from '../domain/fabric.repository';
import {
  ActividadParte,
  Bloque,
  CicloBloque,
  CoincidenciaMedidaConsola,
  DiagnosticoBloqueDudoso,
  DesvioRitmo,
  DetalleTelar,
  Estadisticas,
  EstadisticasTelar,
  EstadoFuente,
  EstadoTelar,
  EventoParte,
  FuenteDato,
  Granularidad,
  GrupoFuente,
  JornadaTelar,
  KpisPlanta,
  LecturaAviso,
  LecturaBloqueDudosa,
  LecturaCuarentena,
  LecturaTelar,
  BloqueDudoso,
  EventoTimelineBloqueDudoso,
  MedidaBloqueFuente,
  MedidaConsolaDudosa,
  Medidas,
  MedidasDudosasPagina,
  PaginaPartes,
  ParteTrabajoBloqueDudoso,
  ParoPorCausa,
  ProduccionDia,
  ProduccionMaterial,
  ProduccionOperario,
  PuntoSerie,
  RangoEstadisticas,
  RendimientoEspesor,
  ResumenPaquetes,
  SaludDatos,
  SaludPartes,
  SaludTelar,
  SegmentoEstado,
  SnapshotPlanta,
  SnapshotTelar,
  TipoIncidencia,
  Turno,
} from '../domain/fabric.types';

/**
 * Repositorio REAL de Fabric: deriva todas las vistas desde la tabla
 * `produccion_mapeada` (lecturas crudas de los 4 telares).
 *
 * Principio (VERIFICACION.md): ningún valor estimado o inventado. Lo que no
 * se puede calcular desde columnas reales se devuelve `null` o vacío.
 * Por eso aquí m², tablas, paquetes, merma o roturas de fleje van a null/[]:
 * la tabla de lecturas no los contiene.
 *
 * Inferencias documentadas (pendientes de confirmar con TotWare; ver
 * 00_gestion/TAREAS.md):
 *  - Códigos de `incidencia`: '1'→marcha y '2'→paro CONFIRMADOS por Pulycort
 *    (2026-06-16). '3'/'4'/'5' siguen sin tabla de significados →
 *    'desconocida' (aviso, la lectura sigue contando). '0' (todo el telar 4)
 *    no trae código: se infiere marcha/paro por física (potencia ≥ 10 kW → marcha).
 *  - `consumo` es la corriente (amperios): cuadra fila a fila con
 *    amperios ≈ 2 × potencia, relación ya verificada en VERIFICACION.md §0.
 *  - `largo/alto/grueso` se asumen en cm; `altura_actual` en mm y
 *    `velocidad` en mm/h (verificado en VERIFICACION.md §0).
 *  - `material` del bloque: se toma del parte de operario
 *    (`parte_trabajo_mapeada`), no de la lectura — los telares 1 y 2 traen la
 *    columna clavada (sensor averiado). Telar estancado sin parte →
 *    'desconocido' (no inventar). Ver `resolverMateriales`/`MaterialesBloque`.
 *
 * Las duraciones se calculan por DIFERENCIA entre marcas de tiempo
 * consecutivas (no lecturas × 10 min), como exige VERIFICACION.md, con un
 * tope por hueco: un vacío de datos no suma tiempo a ningún estado.
 */

const TELAR_IDS = [1, 2, 3, 4];
const NOMBRES_TELAR = new Map(TELAR_IDS.map((id) => [id, `Telar ${id}`]));

const UMBRAL_SIN_DATOS_MS = 25 * 60_000;
/**
 * Sin lecturas durante este tiempo, el estado operativo (marcha/paro) deja de
 * mostrarse y la máquina pasa a "En pausa" (y a "Descansando" a partir de 24 h,
 * eso lo decide la UI). Hasta 1 h se conserva el último estado conocido.
 */
const UMBRAL_PAUSA_MS = 60 * 60_000;
/**
 * Un parte de operario (operacion/accion) se muestra en el badge durante este
 * tiempo desde que se registró. Excepción: "Fin de jornada" dura hasta que la
 * máquina vuelve a dar señal de marcha (no caduca a los 20 min).
 */
const VENTANA_ACTIVIDAD_MS = 20 * 60_000;
/**
 * Frescura de la fuente de lecturas: si la última lectura (de cualquier telar)
 * es más antigua que esto, no se afirma que "llegan con normalidad" aunque la
 * fiabilidad del periodo sea buena. Holgado para no avisar por pausas de turno;
 * un silencio de horas sí es señal en una página de salud del dato.
 */
const FUENTE_FRESCA_MS = 3 * 3_600_000;
/** Tope de atribución de tiempo entre lecturas: un hueco mayor no se imputa. */
const HUECO_MAX_MS = 25 * 60_000;
/** Cadencia nominal, solo para extender visualmente el Gantt de jornada. */
const INTERVALO_LECTURA_MS = 10 * 60_000;
/** Umbral físico para inferir marcha cuando no hay código de incidencia. */
const POTENCIA_MARCHA_KW = 10;

/**
 * ESTIMACIÓN de tablas/m² (decisión de Ángel, 2026-06-12): a falta de los
 * partes reales de paquetes, se estima tablas = grueso / (espesor + kerf)
 * con el espesor estándar de 2 cm y kerf de 0,8 cm del sistema antiguo.
 * La UI lo etiqueta como estimación; supuesto pendiente de confirmar
 * (00_gestion/TAREAS.md).
 */
const ESPESOR_TABLA_CM = 2;
const KERF_FLEJE_CM = 0.8;

function tablasPrevistasDe(medidas: Medidas): number | null {
  if (medidas.gruesoCm <= 0) {
    return null;
  }
  return Math.max(1, Math.floor(medidas.gruesoCm / (ESPESOR_TABLA_CM + KERF_FLEJE_CM)));
}

function m2PrevistosDe(medidas: Medidas): number | null {
  const tablas = tablasPrevistasDe(medidas);
  if (tablas === null || medidas.largoCm <= 0 || medidas.altoCm <= 0) {
    return null;
  }
  return (tablas * medidas.largoCm * medidas.altoCm) / 10_000;
}

/** Volumen del bloque en m³ (medidas asumidas en cm); null sin medidas. */
function volumenM3De(medidas: Medidas): number | null {
  if (medidas.largoCm <= 0 || medidas.altoCm <= 0 || medidas.gruesoCm <= 0) {
    return null;
  }
  return (medidas.largoCm * medidas.altoCm * medidas.gruesoCm) / 1_000_000;
}

/** Medida real de un PM (nº de lote), leída del inventario `lot_block_creation`. */
interface LoteInventario {
  /**
   * Nº de filas con este PM en el inventario. La PM es un identificador ÚNICO
   * de bloque (1:1, confirmado por Pulycort 2026-06-15), así que debe ser 1;
   * >1 = PM duplicado (error de dato, ver `duplicado`).
   */
  bloques: number;
  /** m³ del bloque, ya redondeado. */
  volumenM3: number;
  /** true si se usó la medida del proveedor como respaldo (falta la de fábrica). */
  estimado: boolean;
  /**
   * El PM aparece en más de una fila del inventario. Como la PM debe ser única
   * (1:1), es un error de dato: no se sabe cuál es la medida del bloque, así que
   * el m³/rendimiento no se calcula y la UI lo marca ⚠ a revisar.
   */
  duplicado: boolean;
  /**
   * Alguna medida del lote es físicamente imposible incluso tras normalizar
   * unidades cm→m (corrupción real del inventario): el m³/rendimiento no es
   * fiable y no debe mostrarse ni entrar en los KPIs.
   */
  imposible: boolean;
}

/**
 * Medidas de tabla de los partes con UNIDADES MEZCLADAS (hay filas en m y
 * filas en cm; TAREAS.md). Normalización a metros por umbral: un largo/alto
 * de tabla > 10 solo puede ser cm; un grueso > 0,5 también.
 */
function tablaAMetros(valor: number | null, umbralCm: number): number {
  if (valor === null || valor === 0) {
    return 0;
  }
  return valor > umbralCm ? valor / 100 : valor;
}

/** Clave de cruce entre un run de lecturas y sus partes: telar + nº bloque. */
function claveBloque(telarId: number | string, bloque: number): string {
  return `${telarId}-${bloque}`;
}

/**
 * Fecha fiable de un parte: la declarada salvo que esté corrupta (futura
 * respecto al sello de inserción, erratas de año vistas en los datos);
 * entonces se usa la de inserción. null si el parte no trae ninguna.
 */
function fechaParteMs(fila: FilaParte): number | null {
  const declarada = fila.fechaHora?.getTime() ?? null;
  const recibida = fila.createDate?.getTime() ?? null;
  if (declarada !== null && (recibida === null || declarada <= recibida + 86_400_000)) {
    return declarada;
  }
  return recibida ?? declarada;
}

/**
 * Ventana temporal del cruce run-parte. Los números de bloque se REUTILIZAN
 * con los meses (p. ej. el bloque 46449 del telar 4 tiene partes en dic-2025
 * y may-2026): sin acotar por fecha, el cruce por telar+nº bloque suma m² de
 * cortes antiguos. El parte se graba durante el corte o en los días
 * siguientes (clasificación posterior), de ahí el margen asimétrico.
 */
const MARGEN_PARTE_ANTES_MS = 2 * 86_400_000;
const MARGEN_PARTE_DESPUES_MS = 15 * 86_400_000;

/**
 * Margen ATRÁS para detectar una PM heredada por la consola del telar
 * (parteEnOtroTelar): el eco de la consola llega DÍAS después del corte real
 * (caso 47156: aserrado en el telar 1 el 3 jun, eco en el telar 4 el 12-13 jun,
 * 9 días), así que el margen normal de 2 días no alcanza el parte de origen.
 * Más amplio para llegar a él, pero acotado para no confundirlo con una PM
 * REUTILIZADA meses atrás en otro telar (otro bloque físico que recicló el nº).
 */
const MARGEN_PM_OTRO_TELAR_MS = 30 * 86_400_000;

function partesDeVentana(
  partes: FilaParte[],
  desdeMs: number,
  hastaMs: number,
  margenAntesMs: number = MARGEN_PARTE_ANTES_MS,
): FilaParte[] {
  return partes.filter((fila) => {
    const t = fechaParteMs(fila);
    return (
      t !== null &&
      t >= desdeMs - margenAntesMs &&
      t <= hastaMs + MARGEN_PARTE_DESPUES_MS
    );
  });
}

/**
 * ¿Las medidas de bloque tecleadas en la máquina son geométricamente
 * imposibles para el parte real? Dos comprobaciones sin supuestos de kerf,
 * probando las tres orientaciones posibles del corte:
 *  - la cara media de tabla (m²/tablas) no puede superar la cara del bloque;
 *  - el grosor sumado de las tablas debe caber en la dimensión aserrada.
 * Tolerancias por redondeo de medición. Las medidas de la consola llegan a
 * menudo heredadas del bloque anterior (se actualizan tarde): los bloques
 * detectados se marcan como dudosos en el ciclo y en la base del
 * rendimiento. Solo es demostrable el error por DEFECTO (un bloque grande
 * siempre puede producir un parte pequeño), por eso es una marca y no una
 * exclusión. Sin datos para juzgar (parte sin tablas/m² o medidas a 0)
 * devuelve false.
 */
function medidasIncompatiblesConParte(medidas: Medidas, paquetes: ResumenPaquetes): boolean {
  const m2 = paquetes.metrosCuadrados;
  const tablas = paquetes.numTablas;
  const dims = [medidas.largoCm, medidas.altoCm, medidas.gruesoCm];
  if (m2 <= 0 || tablas <= 0 || dims.some((d) => d <= 0)) {
    return false;
  }
  const areaTablaM2 = m2 / tablas;
  const gruesoTablaCm = paquetes.gruesoTablaM * 100;
  for (let i = 0; i < 3; i++) {
    const fondoCm = dims[i];
    const caraM2 = (dims[(i + 1) % 3] / 100) * (dims[(i + 2) % 3] / 100);
    const cabeCara = areaTablaM2 <= caraM2 * 1.05;
    const cabeFondo = gruesoTablaCm <= 0 || tablas * gruesoTablaCm <= fondoCm * 1.1;
    if (cabeCara && cabeFondo) {
      return false;
    }
  }
  return true;
}

/** Suma los partes de paquetes de un bloque en un ResumenPaquetes real. */
function resumenDePartes(partes: FilaParte[]): ResumenPaquetes {
  const ultimo = partes[partes.length - 1];
  return {
    numPaquetes: partes.reduce((s, p) => s + (p.nPaquete ?? 0), 0),
    numTablas: partes.reduce((s, p) => s + (p.nTablas ?? 0), 0),
    largoTablaM: redondea(tablaAMetros(ultimo.largoTablas, 10), 2),
    altoTablaM: redondea(tablaAMetros(ultimo.altoTablas, 10), 2),
    // 3 decimales (mm): el espesor de tabla es de 1-3 cm y 1,5 cm = 0,015 m se
    // perdería redondeando a 2 (→ 0,02 = 2 cm). Lo consume espesorCorteCm.
    gruesoTablaM: redondea(tablaAMetros(ultimo.gruesoTablas, 0.5), 3),
    metrosCuadrados: redondea(
      partes.reduce(
        (s, p) => s + (p.metrosCuadradosTablas !== null ? Number(p.metrosCuadradosTablas) : 0),
        0,
      ),
    ),
  };
}

// Umbrales del validador, compartidos con el frontend (validador.ts).
const TOLERANCIA_FECHA_MS = 30 * 60_000;
const VELOCIDAD_MAX_MM_H = 310;
const SUBIDA_TOLERADA_MM = 30;
const ALTURA_BASTIDOR_REPOSO_MM = 2150;
// Avisos σ de velocidad: mínimo de lecturas en marcha para fiarse de la media y
// la desviación típica de un telar (si no, no se avisa).
const SIGMA_MIN_MUESTRAS = 8;
// El consumo atípico se corta por percentil de la cola del propio telar; la
// lógica y las tasas (top 16/2,3/0,13 %, ≥ 5 kW) viven en
// `shared/domain/consumo-atipico.ts`, compartidas con el listado crudo.

const TTL_SNAPSHOT_MS = 20_000;
const TTL_ESTADISTICAS_MS = 60_000;
const TTL_SALUD_MS = 60_000;

/**
 * Lectura enriquecida con las columnas de bloque de la fila original
 * (dimensiones en cm asumidos y código de material). Los campos extra
 * viajan también en el JSON: información real adicional, no inventada.
 */
interface LecturaInterna extends LecturaTelar {
  largoCm: number;
  altoCm: number;
  gruesoCm: number;
  materialCodigo: string | null;
}

/** Tramo continuo de lecturas del mismo bloque en un telar. */
interface RunBloque {
  telarId: number;
  bloque: number;
  lecturas: LecturaInterna[];
  desdeMs: number;
  hastaMs: number;
}

/**
 * Material real por bloque, recuperado de los partes de operario
 * (`parte_trabajo_mapeada`) en vez de la lectura del telar: los telares 1 y 2
 * traen la columna `material` clavada en un único valor (sensor/consola
 * averiado, verificado en BD; anotado en Salud del sistema → Máquinas y
 * sensores y en 00_gestion/TAREAS.md), mientras que el parte sí lo registra
 * por bloque. Decisión de Ángel (2026-06-13): el material es del bloque, no se
 * vuelve a "sensar" en cada lectura.
 *  - `porBloque`: clave `${telar}-${nBloque}` → código real (`product_template.id`,
 *    el mismo espacio que el catálogo del frontend).
 *  - `estancados`: telares cuyo `material` de lectura no varía nunca (no fiable);
 *    para ellos no se usa la lectura como respaldo (mejor "desconocido" que el
 *    valor clavado: no inventar).
 */
interface MaterialesBloque {
  porBloque: Map<string, string>;
  estancados: Set<number>;
}

function epoch(iso: string): number {
  return new Date(iso).getTime();
}

function inicioDia(ms: number): number {
  const fecha = new Date(ms);
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime();
}

/** Lunes 00:00 (calendario local) de la semana que contiene `ms`. */
function inicioSemana(ms: number): number {
  const fecha = new Date(ms);
  const dia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const desdeLunes = (dia.getDay() + 6) % 7; // 0 = lunes
  dia.setDate(dia.getDate() - desdeLunes);
  return dia.getTime();
}

/** Día 1 a las 00:00 (calendario local) del mes que contiene `ms`. */
function inicioMes(ms: number): number {
  const fecha = new Date(ms);
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1).getTime();
}

function inicioPeriodo(ms: number, granularidad: Granularidad): number {
  if (granularidad === 'mes') {
    return inicioMes(ms);
  }
  return granularidad === 'semana' ? inicioSemana(ms) : inicioDia(ms);
}

/** Inicio del periodo siguiente (avanza el cursor de los buckets). */
function siguientePeriodo(ms: number, granularidad: Granularidad): number {
  const fecha = new Date(ms);
  if (granularidad === 'mes') {
    return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 1).getTime();
  }
  const dias = granularidad === 'semana' ? 7 : 1;
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + dias).getTime();
}

/**
 * Ventana temporal y granularidad de agregación de cada rango. Mes y 3 meses
 * se agrupan por semana; un año e histórico, por mes (con tantas barras al día
 * sería ilegible). `todo` arranca en epoch 0 y luego se acota al primer dato
 * real para no pintar meses vacíos previos a la primera lectura.
 */
function ventanaEstadisticas(
  rango: RangoEstadisticas,
  ahora: number,
): { desde: number; granularidad: Granularidad } {
  const fecha = new Date(ahora);
  const haceDias = (dias: number): number =>
    new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() - dias).getTime();
  if (rango === 'hoy') {
    return { desde: inicioDia(ahora), granularidad: 'dia' };
  }
  if (rango === '7d') {
    return { desde: haceDias(6), granularidad: 'dia' };
  }
  if (rango === '30d') {
    return { desde: haceDias(29), granularidad: 'semana' };
  }
  if (rango === '90d') {
    return { desde: haceDias(89), granularidad: 'semana' };
  }
  if (rango === '1a') {
    return {
      desde: new Date(fecha.getFullYear() - 1, fecha.getMonth(), fecha.getDate()).getTime(),
      granularidad: 'mes',
    };
  }
  return { desde: 0, granularidad: 'mes' }; // 'todo'
}

function media(valores: number[]): number {
  if (valores.length === 0) {
    return 0;
  }
  return valores.reduce((suma, v) => suma + v, 0) / valores.length;
}

/** Media y desviación típica (poblacional) de una muestra. */
function mediaYDesviacion(valores: number[]): { media: number; sigma: number } {
  if (valores.length === 0) {
    return { media: 0, sigma: 0 };
  }
  const m = media(valores);
  const varianza = valores.reduce((s, v) => s + (v - m) ** 2, 0) / valores.length;
  return { media: m, sigma: Math.sqrt(varianza) };
}

/**
 * μ y σ de una magnitud sobre las lecturas EN MARCHA de un telar. Devuelve null
 * si no hay muestra suficiente o no hay dispersión: sin base fiable no se puede
 * juzgar lo "inusual", así que no se avisa (no inventar).
 */
function baselineSigma(
  lecturas: LecturaTelar[],
  valor: (l: LecturaTelar) => number,
): { media: number; sigma: number } | null {
  const muestras = lecturas
    .filter((l) => enMarcha(l.incidencia))
    .map(valor)
    .filter((v) => Number.isFinite(v));
  if (muestras.length < SIGMA_MIN_MUESTRAS) {
    return null;
  }
  const base = mediaYDesviacion(muestras);
  return base.sigma > 0 ? base : null;
}

/**
 * Aviso escalonado por cola alta: μ+1σ "alto", μ+2σ "inusual", μ+3σ "MUY alto".
 * Devuelve el mensaje correspondiente o null si está dentro de 1σ.
 */
function avisoSigma(
  valor: number,
  base: { media: number; sigma: number },
  mensajes: { alto: string; inusual: string; muy: string },
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

/** Mensaje del aviso de consumo según la banda de la cola en que cae la lectura. */
function mensajeConsumo(banda: BandaConsumo, kw: number): string {
  const r = redondea(kw, 1);
  switch (banda) {
    case 'muy':
      return `Consumo MUY alto (${r} kW), conviene revisar`;
    case 'inusual':
      return `Consumo inusualmente alto (${r} kW)`;
    case 'alto':
      return `Consumo alto (${r} kW)`;
  }
}

function redondea(valor: number, decimales = 1): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}

/** Enumera en español: ["Telar 3","Telar 4"] → "Telar 3 y Telar 4". */
function listaEs(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? '';
  }
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

function turnoDe(epochMs: number): Turno {
  const hora = new Date(epochMs).getHours();
  if (hora >= 6 && hora < 14) {
    return 'manana';
  }
  if (hora >= 14 && hora < 22) {
    return 'tarde';
  }
  return 'noche';
}

/**
 * Mapeo de los códigos reales de la columna `incidencia` (confirmados por
 * Pulycort 2026-06-16): 1 marcha, 2 paro, 3 paro por rotura de material, 4 modo
 * manual, 5 modo automático. El 0 (telar 4, sin código) se infiere por potencia;
 * cualquier otro queda 'desconocida' (aviso, no descarte).
 */
function incidenciaDeCodigo(codigo: string | null, potencia: number): TipoIncidencia {
  switch ((codigo ?? '').trim()) {
    case '1':
      return 'marcha';
    case '2':
      return 'paro';
    case '3':
      return 'paro-rotura-material';
    case '4':
      return 'modo-manual';
    case '5':
      return 'modo-automatico';
    case '0':
      // Sin código (telar 4): inferencia física por potencia.
      return potencia >= POTENCIA_MARCHA_KW ? 'marcha' : 'paro';
    default:
      return 'desconocida';
  }
}

function mapearEstado(incidencia: TipoIncidencia): EstadoTelar {
  switch (incidencia) {
    case 'marcha':
    case 'modo-manual':
    case 'modo-automatico':
      return 'marcha';
    case 'rotura-fleje':
    case 'paro-rotura-material':
      return 'incidencia';
    case 'cambio-bloque':
      return 'cambio-bloque';
    default:
      return 'paro';
  }
}

/** Incidencias en las que el telar está CORTANDO (cuentan como marcha). */
const INCIDENCIAS_MARCHA: readonly TipoIncidencia[] = [
  'marcha',
  'modo-manual',
  'modo-automatico',
];
/** Incidencias de PARADA (cuentan como paro en los KPIs). */
const INCIDENCIAS_PARO: readonly TipoIncidencia[] = [
  'paro',
  'paro-rotura-material',
  'rotura-fleje',
];
const enMarcha = (incidencia: TipoIncidencia): boolean =>
  INCIDENCIAS_MARCHA.includes(incidencia);
const enParo = (incidencia: TipoIncidencia): boolean =>
  INCIDENCIAS_PARO.includes(incidencia);

/**
 * Mapea el último parte de operario del telar a la actividad del badge. null si
 * el parte no codifica nada mostrable (operacion 0 sin accion conocida, u
 * operacion 5/10/11 que no están en el selection) o si ya caducó (20 min; salvo
 * "Fin de jornada", que dura hasta que la máquina vuelve a marcha). Mapeo de
 * códigos en shared/domain/codigos-parte.ts.
 */
function actividadDeParteTelar(
  operacion: string | null,
  accion: string | null,
  fecha: Date,
  ahora: number,
  lecturas: LecturaInterna[],
): ActividadParte | null {
  const op = operacion && operacion.trim() !== '' ? Number(operacion) : null;
  let etiqueta: string | undefined;
  let categoria: ActividadParte['categoria'];
  let finJornada = false;
  if (op === 0) {
    const ac = accion && accion.trim() !== '' ? Number(accion) : null;
    if (ac === null || TELAR_ACCION[ac] === undefined) {
      return null;
    }
    etiqueta = TELAR_ACCION[ac];
    finJornada = ac === ACCION_FIN_JORNADA;
    categoria = finJornada ? 'fin-jornada' : 'evento';
  } else if (op !== null && TELAR_OPERACION[op] !== undefined) {
    etiqueta = TELAR_OPERACION[op];
    categoria = 'operacion';
  } else {
    return null;
  }
  const fechaMs = fecha.getTime();
  if (fechaMs > ahora) {
    return null;
  }
  if (finJornada) {
    const reanudada = lecturas.some(
      (l) => enMarcha(l.incidencia) && epoch(l.recibidaEn) > fechaMs,
    );
    if (reanudada) {
      return null;
    }
  } else if (ahora - fechaMs > VENTANA_ACTIVIDAD_MS) {
    return null;
  }
  return { etiqueta, categoria, desde: fecha.toISOString() };
}

/** Suma los minutos del mapa cuyas incidencias cumplen el predicado. */
function minutosDe(
  minutos: Map<TipoIncidencia, number>,
  predicado: (incidencia: TipoIncidencia) => boolean,
): number {
  let total = 0;
  for (const [incidencia, m] of minutos) {
    if (predicado(incidencia)) {
      total += m;
    }
  }
  return total;
}

/**
 * Validador de calidad portado del frontend (validador.ts). Modelo de dos
 * niveles:
 *  - `sospechosa`/`motivosSospecha` (DESCARTE, fuera de KPIs y a cuarentena):
 *    reservado al dato inservible. Hoy solo la fecha incoherente con la
 *    recepción (#1); los descartes "duros" de carga (fecha nula, telar ∉ 1-4,
 *    sello futuro) se aplican antes, en `lecturasDesde`.
 *  - `alertas` (AVISO, la lectura SIGUE contando en KPIs): lo que pinta raro
 *    pero es real. Incidencia sin mapear (#2), consumo (#3) y velocidad (#7)
 *    inusuales, altura sobre el tope (#8) y saltos de altura en corte (#10/#11).
 *
 * El consumo atípico (#3) se marca por PERCENTIL de la cola derecha del propio
 * telar ("alto" top 16 %, "inusual" top 2,3 %, "MUY alto" top 0,13 %), ignorando
 * las lecturas < 5 kW: la potencia de los telares no es normal y μ±σ no servía (en
 * unos no saltaba nunca y en otros chillaba — ver VERIFICACION.md). La velocidad
 * (#7) sigue por σ del telar. Las reglas de amperios (#4/#5) y golpes (#6) se
 * retiraron a la espera de aclararlas (00_gestion/TAREAS.md).
 */
function validarLecturas(lecturas: LecturaTelar[], codigos: string[]): void {
  // Baseline por telar sobre las lecturas EN MARCHA: cortes de consumo por
  // percentil de la cola (≥ 5 kW) y μ/σ de la velocidad. Solo se usan si hay
  // muestra suficiente (y dispersión real en la velocidad).
  const umbralCons = umbralConsumoDePotencias(
    lecturas.filter((l) => enMarcha(l.incidencia)).map((l) => l.potenciaKw),
  );
  const velocidadBase = baselineSigma(lecturas, (l) => l.velocidadMmH);

  // Coherencia de altura contra la lectura INMEDIATAMENTE anterior del mismo
  // bloque (válida o no): comparar solo contra la última válida encadena en
  // cascada — p. ej. el telar 4 congela la altura en 0 al parar y, al
  // arrancar, todas las lecturas posteriores quedarían marcadas para siempre.
  let previa: LecturaTelar | null = null;

  lecturas.forEach((lectura, i) => {
    const motivos: string[] = [];
    const alertas: string[] = [];
    const declarada = epoch(lectura.fechaHora);
    const recibida = epoch(lectura.recibidaEn);

    // #1 Fecha incoherente: ÚNICO motivo de descarte del validador.
    if (Number.isNaN(declarada) || Math.abs(declarada - recibida) > TOLERANCIA_FECHA_MS) {
      motivos.push(
        `Fecha declarada (${lectura.fechaHora}) alejada de la recepción (${lectura.recibidaEn})`,
      );
    }

    // #2 Incidencia sin mapear: aviso, no descarte.
    if (lectura.incidencia === 'desconocida') {
      alertas.push(`Incidencia sin mapear (código ${codigos[i]})`);
    }

    // #3 Consumo atípico por percentil de la cola del telar. Solo en marcha (1
    // marcha, 4 modo manual, 5 modo automático): los paros (2, y 3 rotura de
    // material) llevan el sensor congelado, no consumo de corte.
    if (umbralCons && enMarcha(lectura.incidencia)) {
      const banda = bandaConsumo(lectura.potenciaKw, umbralCons);
      if (banda) {
        alertas.push(mensajeConsumo(banda, lectura.potenciaKw));
      }
    }

    // #7 Velocidad de descenso escalonada por σ del telar (solo en marcha).
    if (velocidadBase && enMarcha(lectura.incidencia)) {
      const mmh = Math.round(lectura.velocidadMmH);
      const aviso = avisoSigma(lectura.velocidadMmH, velocidadBase, {
        alto: `Velocidad de descenso alta (${mmh} mm/h)`,
        inusual: `Velocidad de descenso inusualmente alta (${mmh} mm/h)`,
        muy: `Velocidad de descenso MUY alta (${mmh} mm/h), conviene revisar`,
      });
      if (aviso) {
        alertas.push(aviso);
      }
    }

    // #8 Altura por encima del tope físico del bastidor: aviso, no descarte.
    if (lectura.alturaActualMm > ALTURA_BASTIDOR_REPOSO_MM + 100) {
      alertas.push(
        `Altura por encima del tope físico del bastidor (${Math.round(lectura.alturaActualMm)} mm)`,
      );
    }

    // #10/#11 Coherencia de altura en pleno corte: avisos, no descarte.
    if (previa && lectura.bloque !== null && previa.bloque === lectura.bloque) {
      const deltaAltura = lectura.alturaActualMm - previa.alturaActualMm;
      const deltaHoras = (recibida - epoch(previa.recibidaEn)) / 3_600_000;
      // Solo en pleno corte: parado, algunos telares dejan la altura a 0 y
      // el salto al arrancar/parar no es un descenso de corte.
      if (enMarcha(lectura.incidencia) && enMarcha(previa.incidencia)) {
        if (deltaAltura > SUBIDA_TOLERADA_MM) {
          alertas.push(`La altura del bastidor sube ${Math.round(deltaAltura)} mm en pleno corte`);
        } else if (
          deltaHoras > 0 &&
          -deltaAltura > VELOCIDAD_MAX_MM_H * deltaHoras * 1.5 + SUBIDA_TOLERADA_MM
        ) {
          alertas.push(
            `Descenso físicamente imposible (${Math.round(-deltaAltura)} mm en ${Math.round(deltaHoras * 60)} min)`,
          );
        }
      }
    }

    lectura.sospechosa = motivos.length > 0;
    lectura.motivosSospecha = motivos;
    lectura.alertas = alertas;
    previa = lectura;
  });
}

/** Minutos imputados a cada incidencia por diferencia entre lecturas. */
function minutosPorIncidencia(
  validas: LecturaTelar[],
  hastaMs: number,
): Map<TipoIncidencia, number> {
  const minutos = new Map<TipoIncidencia, number>();
  for (let i = 0; i < validas.length; i++) {
    const t = epoch(validas[i].recibidaEn);
    const siguiente = i + 1 < validas.length ? epoch(validas[i + 1].recibidaEn) : hastaMs;
    const duracion = Math.max(0, Math.min(siguiente - t, HUECO_MAX_MS));
    const clave = validas[i].incidencia;
    minutos.set(clave, (minutos.get(clave) ?? 0) + duracion / 60_000);
  }
  return minutos;
}

interface TramoParo {
  causa: TipoIncidencia;
  inicio: LecturaTelar;
  minutos: number;
}

/** Tramos consecutivos de paro con minutos por diferencia de tiempos. */
function tramosDeParo(validas: LecturaTelar[], hastaMs: number): TramoParo[] {
  const tramos: TramoParo[] = [];
  let abierto: TramoParo | null = null;
  for (let i = 0; i < validas.length; i++) {
    const lectura = validas[i];
    const esParo = enParo(lectura.incidencia);
    if (!esParo) {
      abierto = null;
      continue;
    }
    const t = epoch(lectura.recibidaEn);
    const siguiente = i + 1 < validas.length ? epoch(validas[i + 1].recibidaEn) : hastaMs;
    const duracion = Math.max(0, Math.min(siguiente - t, HUECO_MAX_MS)) / 60_000;
    if (abierto && abierto.causa === lectura.incidencia) {
      abierto.minutos += duracion;
    } else {
      abierto = { causa: lectura.incidencia, inicio: lectura, minutos: duracion };
      tramos.push(abierto);
    }
  }
  return tramos;
}

/** Tramos homogéneos de estado para el Gantt (visual, como en el mock). */
function segmentos(validas: LecturaTelar[]): SegmentoEstado[] {
  const resultado: SegmentoEstado[] = [];
  for (const lectura of validas) {
    const previo = resultado[resultado.length - 1];
    const inicio = epoch(lectura.recibidaEn);
    const finLectura = new Date(inicio + INTERVALO_LECTURA_MS).toISOString();
    const hueco = previo ? inicio - epoch(previo.hasta) : 0;
    // Hueco largo sin lectura fiable: se marca como 'sin-datos' en vez de unir
    // los dos extremos (eso inventaría una tendencia que no existe). El telar 3/4
    // pasan horas en cuarentena; el gráfico debe mostrar el agujero, no rellenarlo.
    if (previo && hueco > UMBRAL_SIN_DATOS_MS) {
      resultado.push({
        desde: previo.hasta,
        hasta: lectura.recibidaEn,
        incidencia: 'sin-datos',
      });
      resultado.push({
        desde: lectura.recibidaEn,
        hasta: finLectura,
        incidencia: lectura.incidencia,
      });
      continue;
    }
    const continua =
      previo &&
      previo.incidencia === lectura.incidencia &&
      hueco <= INTERVALO_LECTURA_MS * 1.5;
    if (continua) {
      previo.hasta = finLectura;
    } else {
      resultado.push({
        desde: lectura.recibidaEn,
        hasta: finLectura,
        incidencia: lectura.incidencia,
      });
    }
  }
  return resultado;
}

/** Agrupa lecturas consecutivas del mismo bloque en runs (ciclos reales). */
function derivarRuns(lecturasTelar: LecturaInterna[]): RunBloque[] {
  const runs: RunBloque[] = [];
  let abierto: RunBloque | null = null;
  for (const lectura of lecturasTelar) {
    if (lectura.bloque === null) {
      abierto = null;
      continue;
    }
    const t = epoch(lectura.recibidaEn);
    if (abierto && abierto.bloque === lectura.bloque) {
      abierto.lecturas.push(lectura);
      abierto.hastaMs = t;
    } else {
      abierto = {
        telarId: lectura.telarId,
        bloque: lectura.bloque,
        lecturas: [lectura],
        desdeMs: t,
        hastaMs: t,
      };
      runs.push(abierto);
    }
  }
  return runs;
}

/** Tope de bloques dudosos devueltos por consulta (la lista avisa si recorta). */
const MAX_BLOQUES_DUDOSOS = 400;

/** Medidas crudas de inventario (proveedor + fábrica) de una fila de alta/stock. */
interface MedidasCrudasInv {
  largoSupplier: number | null;
  altoSupplier: number | null;
  gruesoSupplier: number | null;
  largoMrp: number | null;
  altoMrp: number | null;
  gruesoMrp: number | null;
}

/** Detalle de inventario por PM para diagnóstico: proveedor y fábrica por separado. */
interface DetalleInventarioLote {
  fuente: 'alta' | 'stock';
  proveedor: MedidaBloqueFuente;
  fabrica: MedidaBloqueFuente;
  mermaPct: number | null;
  bloques: number;
}

/**
 * Pasa una dimensión de bloque a metros (normaliza cm→m), o null si no la trae.
 * En `lot_block_creation` las columnas `*_supplier` son NOT NULL: una medida no
 * introducida llega como 0, no como null → un 0 es "ausente", no "0 m".
 */
function dimAMetrosONull(valor: number | null): number | null {
  return valor === null || valor <= 0 ? null : redondea(dimensionBloqueAMetros(valor), 3);
}

/**
 * Medidas de una fuente (proveedor o fábrica) normalizadas a metros, con su m³
 * (solo si están las tres dimensiones y son > 0) y la bandera de imposible. Las
 * dimensiones que la fuente no trae (null o 0) quedan en null (no se inventan).
 */
function medidaFuente(
  largo: number | null,
  alto: number | null,
  grueso: number | null,
): MedidaBloqueFuente {
  const completa =
    largo !== null && largo > 0 && alto !== null && alto > 0 && grueso !== null && grueso > 0;
  const m3 = completa ? volumenBloqueM3(largo, alto, grueso) : 0;
  return {
    largoM: dimAMetrosONull(largo),
    altoM: dimAMetrosONull(alto),
    gruesoM: dimAMetrosONull(grueso),
    volumenM3: completa && m3 > 0 ? redondea(m3, 2) : null,
    imposible: completa ? bloqueImposible(largo, alto, grueso) : false,
  };
}

/** Merma de compra % entre dos medidas; null si falta alguna o es imposible. */
function mermaEntreMedidas(
  proveedor: MedidaBloqueFuente,
  fabrica: MedidaBloqueFuente,
): number | null {
  if (
    proveedor.volumenM3 === null ||
    proveedor.volumenM3 <= 0 ||
    fabrica.volumenM3 === null ||
    proveedor.imposible ||
    fabrica.imposible
  ) {
    return null;
  }
  return redondea(((proveedor.volumenM3 - fabrica.volumenM3) / proveedor.volumenM3) * 100, 1);
}

/** ¿El ciclo tiene alguna bandera de medida/identidad dudosa? (alcance de la vista). */
function claveMedidaConsolaCm(
  largoCm: number,
  altoCm: number,
  gruesoCm: number,
): string | null {
  if (largoCm <= 0 && altoCm <= 0 && gruesoCm <= 0) {
    return null;
  }
  return `${largoCm}x${altoCm}x${gruesoCm}`;
}

function etiquetaMedidaCm(largoCm: number, altoCm: number, gruesoCm: number): string {
  return `${redondea(largoCm, 0)}x${redondea(altoCm, 0)}x${redondea(gruesoCm, 0)} cm`;
}

function etiquetaParteTrabajo(fila: FilaParte): { operacion: string; accion: string | null } {
  const operacion = fila.operacion ?? null;
  const accionRaw = fila.accion ?? null;
  const op = operacion && operacion.trim() !== '' ? Number(operacion) : null;
  const accion = accionRaw && accionRaw.trim() !== '' ? Number(accionRaw) : null;
  if (op === 0) {
    return {
      operacion: accion !== null ? `Parada: ${TELAR_ACCION[accion] ?? `accion ${accion}`}` : 'Parada',
      accion: accion !== null ? TELAR_ACCION[accion] ?? `accion ${accion}` : null,
    };
  }
  if (op !== null && TELAR_OPERACION[op] !== undefined) {
    return { operacion: TELAR_OPERACION[op], accion: null };
  }
  return {
    operacion: operacion ? `Operacion ${operacion}` : 'Parte sin operacion',
    accion: accion !== null ? TELAR_ACCION[accion] ?? `accion ${accion}` : null,
  };
}

const ETIQUETA_INCIDENCIA_BACKEND: Record<TipoIncidencia, string> = {
  marcha: 'Marcha telar',
  paro: 'Paro telar',
  'paro-rotura-material': 'Paro por rotura de material',
  'modo-manual': 'Modo manual',
  'modo-automatico': 'Modo automatico',
  'rotura-fleje': 'Rotura de fleje',
  'cambio-bloque': 'Cambio de lote',
  desconocida: 'Desconocida',
  'sin-datos': 'Sin datos',
};

function esBloqueDudoso(ciclo: CicloBloque): boolean {
  return (
    ciclo.medidasIncoherentes ||
    ciclo.volumenIncompatibleParte ||
    ciclo.volumenImposible ||
    ciclo.pmDuplicado ||
    ciclo.parteEnOtroTelar
  );
}

/** Etiquetas legibles de las banderas de medida dudosa activas de un ciclo. */
function motivosDeBloqueDudoso(ciclo: CicloBloque): string[] {
  const motivos: string[] = [];
  if (ciclo.medidasIncoherentes) {
    motivos.push('Medidas de consola incompatibles con el parte');
  }
  if (ciclo.volumenImposible) {
    motivos.push('Medida de inventario físicamente imposible');
  }
  if (ciclo.volumenIncompatibleParte) {
    motivos.push('m³ de inventario menor que la piedra cortada (m² × espesor)');
  }
  if (ciclo.pmDuplicado) {
    motivos.push('Nº de lote (PM) duplicado en el inventario');
  }
  if (ciclo.parteEnOtroTelar) {
    motivos.push('El parte de aserrado de este lote consta en otro telar');
  }
  return motivos;
}

/** Proyecta una lectura interna a la pública (sin las columnas de bloque extra). */
function aLecturaPublica(l: LecturaInterna): LecturaTelar {
  return {
    id: l.id,
    telarId: l.telarId,
    fechaHora: l.fechaHora,
    recibidaEn: l.recibidaEn,
    bloque: l.bloque,
    pmLote: l.pmLote,
    incidencia: l.incidencia,
    potenciaKw: l.potenciaKw,
    amperios: l.amperios,
    golpesPorMinuto: l.golpesPorMinuto,
    velocidadMmH: l.velocidadMmH,
    alturaActualMm: l.alturaActualMm,
    operario1: l.operario1,
    operario2: l.operario2,
    sospechosa: l.sospechosa,
    motivosSospecha: l.motivosSospecha,
    alertas: l.alertas,
  };
}

@Injectable()
export class PrismaFabricRepository implements FabricRepository {
  private readonly cache = new Map<string, { en: number; valor: unknown }>();
  private nombresOperariosCache: { en: number; valor: Map<number, string> } | null = null;
  private materialesCache: { en: number; valor: MaterialesBloque } | null = null;
  /** Material por bloque cargado al inicio de cada consulta (lo lee `bloqueDeRun`). */
  private materialesActual: MaterialesBloque = { porBloque: new Map(), estancados: new Set() };

  constructor(private readonly prisma: PrismaService) {}

  // ── API ──────────────────────────────────────────────────────────────────

  getSnapshotPlanta(): Promise<SnapshotPlanta> {
    return this.cacheado('snapshot', TTL_SNAPSHOT_MS, async () => {
      const ahora = Date.now();
      const porTelar = await this.lecturasDesde(ahora - 7 * 86_400_000);
      const nombres = await this.nombresOperarios();
      this.materialesActual = await this.resolverMateriales();
      // Marca de la última lectura por telar sin límite de ventana, para que
      // la lista de Máquinas muestre "hace cuánto" llegó el último dato aunque
      // el telar lleve más de 7 días sin emitir.
      const ultimasMarcas = await this.ultimaLecturaPorTelar(ahora);
      const actividades = await this.actividadOperarioPorTelar(ahora, porTelar);
      const telares = TELAR_IDS.map((telarId) =>
        this.snapshotTelar(
          telarId,
          porTelar.get(telarId) ?? [],
          ahora,
          nombres,
          ultimasMarcas.get(telarId) ?? null,
          actividades.get(telarId) ?? null,
        ),
      );

      // Bloques completados hoy → sus partes reales para los KPIs.
      const desdeDia = inicioDia(ahora);
      const completadosHoy: { telarId: number; run: RunBloque }[] = [];
      for (const telarId of TELAR_IDS) {
        const validas = (porTelar.get(telarId) ?? []).filter((l) => !l.sospechosa);
        const runs = derivarRuns(validas);
        const actual = this.runActual(runs, ahora);
        for (const run of runs) {
          if (run !== actual && run.hastaMs >= desdeDia) {
            completadosHoy.push({ telarId, run });
          }
        }
      }
      const partesHoy = await this.partesPaquetesDeBloques(
        completadosHoy.map((c) => c.run.bloque),
      );
      const ultimos = await this.ultimosPartesPaquetes();

      return {
        generadoEn: new Date(ahora).toISOString(),
        fuente: 'postgres',
        kpis: this.kpisPlanta(telares, porTelar, ahora, completadosHoy, partesHoy),
        telares,
        // Ticker con los últimos partes de paquetes reales (operación '4').
        ultimosEventos: ultimos.map((f) => this.eventoDeParte(f, nombres)),
      };
    });
  }

  getDetalleTelar(telarId: number): Promise<DetalleTelar | null> {
    if (!TELAR_IDS.includes(telarId)) {
      return Promise.resolve(null);
    }
    return this.cacheado(`detalle-${telarId}`, TTL_SNAPSHOT_MS, async () => {
      const ahora = Date.now();
      const porTelar = await this.lecturasDesde(ahora - 7 * 86_400_000);
      const nombres = await this.nombresOperarios();
      this.materialesActual = await this.resolverMateriales();
      const lecturas = porTelar.get(telarId) ?? [];
      const validas = lecturas.filter((l) => !l.sospechosa);
      const snapshot = this.snapshotTelar(telarId, lecturas, ahora, nombres);
      // Ventana rodante de 24 h (no día natural): así los gráficos del detalle no
      // se quedan en blanco al cruzar medianoche. El Gantt "Jornada de hoy" usa
      // estos mismos segmentos pero los recorta al día en curso.
      const desdeVentana = ahora - 24 * 3_600_000;
      const validasJornada = validas.filter((l) => epoch(l.recibidaEn) >= desdeVentana);
      const runs = derivarRuns(validas);
      const runActual = this.runActual(runs, ahora);

      // Partes de paquetes reales del historial y del bloque en curso.
      const completados = runs.filter((r) => r !== runActual).slice(-8).reverse();
      const partes = (
        await this.partesPaquetesDeBloques([
          ...completados.map((r) => r.bloque),
          ...(runActual ? [runActual.bloque] : []),
        ])
      ).filter((f) => f.nTelar === String(telarId));
      const partesPorClave = new Map<string, FilaParte[]>();
      for (const fila of partes) {
        if (fila.nBloque === null) {
          continue;
        }
        const clave = claveBloque(telarId, fila.nBloque);
        if (!partesPorClave.has(clave)) {
          partesPorClave.set(clave, []);
        }
        partesPorClave.get(clave)!.push(fila);
      }

      // Volumen real del lote (PM) desde el inventario para los ciclos del
      // historial (m³/rendimiento por lote; la consola queda solo como control).
      const inventario = await this.inventarioPorPm(completados.map((r) => r.bloque));

      return {
        snapshot,
        serieAltura: validasJornada.map((l) => ({ t: l.recibidaEn, v: l.alturaActualMm })),
        seriePotencia: validasJornada.map((l) => ({ t: l.recibidaEn, v: l.potenciaKw })),
        serieGolpes: validasJornada.map((l) => ({ t: l.recibidaEn, v: l.golpesPorMinuto })),
        serieVelocidad: validasJornada.map((l) => ({ t: l.recibidaEn, v: l.velocidadMmH })),
        segmentosJornada: segmentos(validasJornada),
        disponibilidadTurnoPct: this.disponibilidadTurno(validas, ahora),
        // Rotura de fleje sin código identificado en los datos reales.
        mtbfFleje7dHoras: null,
        roturas7d: null,
        latenciaDatosMin: snapshot.ultimaLectura
          ? Math.max(0, Math.round((ahora - epoch(snapshot.ultimaLectura.recibidaEn)) / 60_000))
          : null,
        // Vigía del fleje: ratio amperios/velocidad y umbral inventados, sin base
        // en histórico real de roturas (VERIFICACION.md §3). Retirado del modo
        // Real (→ null = "—"/oculto); la heurística sobrevive solo en Demo.
        // RETIRADA TEMPORAL: reintroducir en cuanto llegue el histórico de roturas
        // que permita validar ratio y umbral (VERIFICACION.md §2.10, TAREAS.md).
        vigiaFleje: null,
        lecturasRecientes: [...lecturas].slice(-30).reverse(),
        eventosCicloActual: runActual
          ? partesDeVentana(
              partesPorClave.get(claveBloque(telarId, runActual.bloque)) ?? [],
              runActual.desdeMs,
              ahora,
            ).map((f) => this.eventoDeParte(f, nombres))
          : [],
        historialCiclos: completados.map((r) => {
          const delBloque = partesDeVentana(
            partesPorClave.get(claveBloque(telarId, r.bloque)) ?? [],
            r.desdeMs,
            r.hastaMs,
          );
          return this.aCicloBloque(
            r,
            ahora,
            false,
            delBloque.length > 0 ? resumenDePartes(delBloque) : null,
            inventario.get(r.bloque) ?? null,
          );
        }),
      };
    });
  }

  getEstadisticas(rango: RangoEstadisticas): Promise<Estadisticas> {
    return this.cacheado(`estadisticas-${rango}`, TTL_ESTADISTICAS_MS, async () => {
      const ahora = Date.now();
      const { desde, granularidad } = ventanaEstadisticas(rango, ahora);

      const porTelar = await this.lecturasDesde(desde);
      this.materialesActual = await this.resolverMateriales();
      const porTelarValidas = new Map(
        TELAR_IDS.map((id) => [id, (porTelar.get(id) ?? []).filter((l) => !l.sospechosa)]),
      );

      const telaresBase = TELAR_IDS.map((telarId) =>
        this.estadisticasTelar(telarId, porTelarValidas.get(telarId) ?? [], ahora),
      );

      // 1ª pasada: runs completados de todos los telares.
      const runsCompletados: { telarId: number; run: RunBloque }[] = [];
      for (const telarId of TELAR_IDS) {
        const runs = derivarRuns(porTelarValidas.get(telarId) ?? []);
        const actual = this.runActual(runs, ahora);
        for (const run of runs) {
          if (run !== actual) {
            runsCompletados.push({ telarId, run });
          }
        }
      }

      // Cruce con los partes de paquetes REALES por telar + nº de bloque.
      const partesRows = await this.partesPaquetesDeBloques(
        runsCompletados.map((rc) => rc.run.bloque),
      );
      const partesPorClave = new Map<string, FilaParte[]>();
      // Todos los partes op 4 de cada PM (cualquier telar), para detectar una PM
      // heredada por la consola: una PM cuyo parte de aserrado consta en OTRO
      // telar dentro de la ventana del run (ver parteEnOtroTelar más abajo).
      const partesPorBloque = new Map<number, FilaParte[]>();
      for (const fila of partesRows) {
        if (fila.nBloque === null || fila.nTelar === null) {
          continue;
        }
        const clave = claveBloque(fila.nTelar, fila.nBloque);
        if (!partesPorClave.has(clave)) {
          partesPorClave.set(clave, []);
        }
        partesPorClave.get(clave)!.push(fila);
        if (!partesPorBloque.has(fila.nBloque)) {
          partesPorBloque.set(fila.nBloque, []);
        }
        partesPorBloque.get(fila.nBloque)!.push(fila);
      }

      // Volumen real del lote (PM) desde el inventario, para el m³/rendimiento
      // por lote (la medida de consola se conserva solo como control).
      const inventario = await this.inventarioPorPm(
        runsCompletados.map((rc) => rc.run.bloque),
      );

      const ciclosCompletados: CicloBloque[] = [];
      const porMaterial = new Map<string, { materialId: string; m2: number; bloques: number }>();
      const porTelarEst = new Map<number, { m2: number; tablas: number }>(
        TELAR_IDS.map((id) => [id, { m2: 0, tablas: 0 }]),
      );
      const completados: { telarId: number; finMs: number; m2: number; tablas: number }[] = [];
      let totalM3 = 0;
      let totalM2 = 0;
      let totalTablas = 0;
      let totalBloques = 0;
      let totalPaquetesReales = 0;
      let hayPartesReales = false;
      // Rendimiento AGREGADO sobre los bloques con parte real (sin
      // estimaciones en ningún lado del cociente). Las medidas de consola se
      // actualizan con retraso (cada bloque hereda las del anterior), así que
      // el m³ bloque a bloque es ruido, pero la SUMA de la ventana se
      // compensa: a 30 días el m³ declarado coincide ±3% con el implícito de
      // los partes a paso ~2,4 cm/tabla. Los bloques con medidas imposibles
      // para su parte se cuentan como dudosos; excluirlos sesgaría el ratio
      // (solo es detectable el error por defecto, no por exceso).
      let m2ConParte = 0;
      let m3ConParte = 0;
      let bloquesRendimiento = 0;
      let bloquesRendimientoDudosos = 0;
      // Mismo agregado, partido por grosor de corte de la tabla: el rendimiento
      // ≈ 1/grosor, así que el número único mezcla cortes no comparables. Clave =
      // espesorCorteCm del parte (1 decimal); solo entran lotes que ya cuentan en
      // el agregado global (parte real + m³ > 0) y que además traen grosor.
      const porEspesor = new Map<
        number,
        { espesorCorteCm: number; m2: number; m3: number; bloques: number; bloquesDudosos: number }
      >();
      const partesUsadosIds = new Set<number>();
      for (const { telarId, run } of runsCompletados) {
        totalBloques += 1;
        const delBloque = partesDeVentana(
          partesPorClave.get(claveBloque(telarId, run.bloque)) ?? [],
          run.desdeMs,
          run.hastaMs,
        );
        const paquetes = delBloque.length > 0 ? resumenDePartes(delBloque) : null;
        // PM heredada/mal etiquetada por la consola del telar: dentro de la
        // ventana del run (con margen atrás amplio porque el eco de consola llega
        // DÍAS después del corte real), el parte de aserrado de esta PM consta en
        // OTRO telar y en ninguno el de este run → ciclo fantasma. La ventana
        // evita el falso positivo de una PM reutilizada meses atrás en otro telar.
        // Como esta ventana (−30 d) contiene la del cruce de paquetes (−2 d),
        // parteEnOtroTelar=true implica paquetes=null (no entra en los agregados).
        // Limitación: si el parte del telar de origen trae nTelar corrupto (fuera
        // de 1-4) queda fuera de partesRows y el cruce no se detecta.
        const telaresParte = new Set(
          partesDeVentana(
            partesPorBloque.get(run.bloque) ?? [],
            run.desdeMs,
            run.hastaMs,
            MARGEN_PM_OTRO_TELAR_MS,
          ).map((p) => Number(p.nTelar)),
        );
        const parteEnOtroTelar = telaresParte.size > 0 && !telaresParte.has(telarId);
        const ciclo = this.aCicloBloque(
          run,
          ahora,
          false,
          paquetes,
          inventario.get(run.bloque) ?? null,
          parteEnOtroTelar,
        );
        ciclosCompletados.push(ciclo);
        // Volumen en m³ asumiendo medidas en cm (inferencia documentada).
        const volumenM3 = volumenM3De(ciclo.bloque.medidasFabrica) ?? 0;
        totalM3 += volumenM3;
        // m²/tablas REALES del parte de paquetes; estimación solo si falta.
        const m2 = paquetes?.metrosCuadrados ?? ciclo.m2Previstos ?? 0;
        const tablas = paquetes?.numTablas ?? ciclo.tablasPrevistas ?? 0;
        if (paquetes) {
          totalPaquetesReales += paquetes.numPaquetes;
          hayPartesReales = true;
          if (volumenM3 > 0) {
            m2ConParte += paquetes.metrosCuadrados;
            m3ConParte += volumenM3;
            bloquesRendimiento += 1;
            if (ciclo.medidasIncoherentes) {
              bloquesRendimientoDudosos += 1;
            }
            // Desglose por grosor (solo lotes con espesor de corte conocido).
            if (ciclo.espesorCorteCm !== null) {
              const grupo = porEspesor.get(ciclo.espesorCorteCm) ?? {
                espesorCorteCm: ciclo.espesorCorteCm,
                m2: 0,
                m3: 0,
                bloques: 0,
                bloquesDudosos: 0,
              };
              grupo.m2 += paquetes.metrosCuadrados;
              grupo.m3 += volumenM3;
              grupo.bloques += 1;
              if (ciclo.medidasIncoherentes) {
                grupo.bloquesDudosos += 1;
              }
              porEspesor.set(ciclo.espesorCorteCm, grupo);
            }
          }
        }
        totalM2 += m2;
        totalTablas += tablas;
        for (const fila of delBloque) {
          partesUsadosIds.add(fila.id);
        }
        const acumTelar = porTelarEst.get(telarId)!;
        acumTelar.m2 += m2;
        acumTelar.tablas += tablas;
        completados.push({ telarId, finMs: run.hastaMs, m2, tablas });
        const materialId = ciclo.bloque.materialId;
        const acumulado = porMaterial.get(materialId) ?? { materialId, m2: 0, bloques: 0 };
        acumulado.bloques += 1;
        acumulado.m2 += m2;
        porMaterial.set(materialId, acumulado);
      }
      ciclosCompletados.sort((a, b) => epoch(b.inicioCorte) - epoch(a.inicioCorte));

      // Igual criterio que el agregado global, pero por grosor (sin base sana
      // del grupo → null, mismo motivo que rendimientoM2M3). Más fino primero:
      // así la columna de rendimiento decrece de arriba abajo (≈ 1/grosor).
      const rendimientoPorEspesor: RendimientoEspesor[] = [...porEspesor.values()]
        .map((g) => ({
          espesorCorteCm: g.espesorCorteCm,
          bloques: g.bloques,
          bloquesDudosos: g.bloquesDudosos,
          m2: redondea(g.m2, 1),
          m3: redondea(g.m3, 2),
          rendimientoM2M3:
            g.m3 > 0 && g.bloques > g.bloquesDudosos ? redondea(g.m2 / g.m3, 2) : null,
        }))
        .sort((a, b) => a.espesorCorteCm - b.espesorCorteCm);

      // Producción real por operario, solo con los partes que han entrado en
      // el cruce (mismos bloques y misma ventana temporal que el resto de KPIs).
      const nombres = await this.nombresOperarios();
      const porOperario = new Map<string, ProduccionOperario>();
      for (const fila of partesRows.filter((f) => partesUsadosIds.has(f.id))) {
        const nombre =
          this.nombreOperario(
            fila.operario1 !== null ? String(fila.operario1) : null,
            nombres,
          ) ?? 'Sin operario';
        const acumulado =
          porOperario.get(nombre) ?? { operario: nombre, partes: 0, tablas: 0, m2: 0 };
        acumulado.partes += 1;
        acumulado.tablas += fila.nTablas ?? 0;
        acumulado.m2 +=
          fila.metrosCuadradosTablas !== null ? Number(fila.metrosCuadradosTablas) : 0;
        porOperario.set(nombre, acumulado);
      }
      const produccionPorOperario = [...porOperario.values()]
        .map((p) => ({ ...p, m2: redondea(p.m2) }))
        .sort((a, b) => b.m2 - a.m2);

      const telares = telaresBase.map((t) => ({
        ...t,
        m2: redondea(porTelarEst.get(t.telarId)?.m2 ?? 0),
        tablas: porTelarEst.get(t.telarId)?.tablas ?? 0,
      }));

      // m² por periodo (día/semana/mes según el rango), según cuándo terminó
      // cada bloque. En 'todo' se arranca en el primer bloque real, no en 1970.
      const inicioVentana =
        rango === 'todo'
          ? completados.length > 0
            ? completados.reduce((min, c) => Math.min(min, c.finMs), Number.POSITIVE_INFINITY)
            : inicioDia(ahora)
          : desde;
      const produccionPorDia: ProduccionDia[] = [];
      let cursor = inicioPeriodo(inicioVentana, granularidad);
      while (cursor <= ahora) {
        const finPeriodo = siguientePeriodo(cursor, granularidad);
        const delPeriodo = completados.filter((c) => c.finMs >= cursor && c.finMs < finPeriodo);
        const m2PorTelar: Record<number, number> = {};
        for (const telarId of TELAR_IDS) {
          m2PorTelar[telarId] = redondea(
            delPeriodo.filter((c) => c.telarId === telarId).reduce((s, c) => s + c.m2, 0),
          );
        }
        produccionPorDia.push({
          fecha: new Date(cursor).toISOString(),
          m2PorTelar,
          m2Total: redondea(delPeriodo.reduce((s, c) => s + c.m2, 0)),
          tablas: delPeriodo.reduce((s, c) => s + c.tablas, 0),
        });
        cursor = finPeriodo;
      }

      const horasTotales = telares.reduce(
        (suma, t) => suma + t.horasMarcha + t.horasParo + t.horasCambioBloque,
        0,
      );
      const horasMarchaGlobal = telares.reduce((suma, t) => suma + t.horasMarcha, 0);

      const sospechosas = TELAR_IDS.reduce(
        (suma, id) => suma + (porTelar.get(id) ?? []).filter((l) => l.sospechosa).length,
        0,
      );

      return {
        rango,
        granularidad,
        desde: new Date(inicioPeriodo(inicioVentana, granularidad)).toISOString(),
        hasta: new Date(ahora).toISOString(),
        // m²/tablas REALES de los partes de paquetes (estimación solo en los
        // bloques sin parte); la merma sigue sin fuente real (null).
        totalM2: redondea(totalM2),
        totalM3Aserrados: redondea(totalM3, 2),
        totalTablas,
        totalPaquetes: hayPartesReales ? totalPaquetesReales : null,
        totalBloques,
        // Sin un solo bloque sano de base (todos dudosos), mejor "—" que un
        // número: un día con un único bloque de medidas heredadas llegó a
        // mostrar 60,8 m²/m³ con el cálculo antiguo.
        rendimientoM2M3:
          m3ConParte > 0 && bloquesRendimiento > bloquesRendimientoDudosos
            ? redondea(m2ConParte / m3ConParte, 2)
            : null,
        bloquesRendimiento,
        bloquesRendimientoDudosos,
        rendimientoPorEspesor,
        mermaMediaPct: null,
        pctMarchaGlobal: horasTotales > 0 ? (horasMarchaGlobal / horasTotales) * 100 : 0,
        pctParoGlobal:
          horasTotales > 0
            ? (telares.reduce((suma, t) => suma + t.horasParo, 0) / horasTotales) * 100
            : 0,
        telares,
        produccionPorDia,
        produccionPorMaterial: [...porMaterial.values()]
          .map((p): ProduccionMaterial => ({ ...p, m2: redondea(p.m2) }))
          .sort((a, b) => (b.m2 ?? 0) - (a.m2 ?? 0)),
        produccionPorOperario,
        roturas: [],
        ciclosCompletados: ciclosCompletados.slice(0, 12),
        jornadaHoy: TELAR_IDS.map((telarId) => ({
          telarId,
          nombre: NOMBRES_TELAR.get(telarId) ?? `Telar ${telarId}`,
          segmentos: segmentos(
            (porTelarValidas.get(telarId) ?? []).filter(
              (l) => epoch(l.recibidaEn) >= inicioDia(ahora),
            ),
          ),
        })) satisfies JornadaTelar[],
        lecturasSospechosas: sospechosas,
      };
    });
  }

  /**
   * Bloques/lotes con medidas DUDOSAS en la ventana: reúne por bloque todas sus
   * fuentes de medida (proveedor de inventario, fábrica/MRP, consola del telar y
   * parte) y qué pasó en el telar, para diagnosticar el origen del ruido. Mismo
   * armazón que `getEstadisticas` (runs no sospechosos cruzados con partes e
   * inventario), filtrando los ciclos con alguna bandera de medida/identidad.
   */
  getMedidasDudosas(
    desde: Date | null,
    hasta: Date | null,
    telarId: number | null,
  ): Promise<MedidasDudosasPagina> {
    // Clave estable por los filtros (no por el "ahora", que el TTL ya refresca).
    const claveDesde = desde ? desde.getTime() : 'def';
    const claveHasta = hasta ? hasta.getTime() : 'now';
    return this.cacheado(
      `medidas-dudosas-${claveDesde}-${claveHasta}-${telarId ?? 'all'}`,
      TTL_SALUD_MS,
      async () => {
        const ahora = Date.now();
        // Ventana: desde (o 30 d atrás por defecto, para no barrer todo el
        // histórico — esta vista deriva los ciclos en memoria); hasta exclusivo
        // (o ahora). El frontend manda fechas naturales; el controlador las parsea.
        const desdeMs = desde ? desde.getTime() : ahora - 30 * 86_400_000;
        const hastaMs = hasta ? Math.min(hasta.getTime(), ahora) : ahora;
        const telarValido =
          telarId !== null && TELAR_IDS.includes(telarId) ? telarId : null;
        const telaresPedidos = telarValido !== null ? [telarValido] : TELAR_IDS;

        const porTelar = await this.lecturasDesde(desdeMs);
        this.materialesActual = await this.resolverMateriales();
        const nombres = await this.nombresOperarios();

        // Runs completados (sin el run en curso) sobre las lecturas NO
        // sospechosas, igual base que getEstadisticas.
        const runsCompletados: { telarId: number; run: RunBloque }[] = [];
        // Lote del bloque cortado justo antes en cada telar (su medida es la que
        // la consola heredó en el run siguiente). Clave por referencia de run.
        const lotePrevioPorRun = new Map<RunBloque, number | null>();
        for (const id of telaresPedidos) {
          const validas = (porTelar.get(id) ?? []).filter((l) => !l.sospechosa);
          const runs = derivarRuns(validas);
          // `runs` ya viene en orden ascendente (lecturasDesde ordena por fecha):
          // el run anterior con lote DISTINTO es "el bloque anterior" del que la
          // consola arrastra la medida. Se salta el mismo lote (corte reanudado).
          for (let i = 0; i < runs.length; i++) {
            let previo: number | null = null;
            for (let j = i - 1; j >= 0; j--) {
              if (runs[j].bloque !== runs[i].bloque) {
                previo = runs[j].bloque;
                break;
              }
            }
            lotePrevioPorRun.set(runs[i], previo);
          }
          const actual = this.runActual(runs, ahora);
          for (const run of runs) {
            // Completado y dentro de la ventana: el corte empezó antes de `hasta`
            // (el extremo inferior lo acota ya `lecturasDesde(desdeMs)`).
            if (run !== actual && run.desdeMs < hastaMs) {
              runsCompletados.push({ telarId: id, run });
            }
          }
        }

        // Cruce con partes reales (op 4) por telar + nº de bloque y ventana.
        const coincidenciasPorMedida = new Map<string, CoincidenciaMedidaConsola[]>();
        for (const { telarId: id, run } of runsCompletados) {
          const clavesRun = new Set(
            run.lecturas
              .map((l) => claveMedidaConsolaCm(l.largoCm, l.altoCm, l.gruesoCm))
              .filter((clave): clave is string => clave !== null),
          );
          for (const clave of clavesRun) {
            if (!coincidenciasPorMedida.has(clave)) {
              coincidenciasPorMedida.set(clave, []);
            }
            coincidenciasPorMedida.get(clave)!.push({
              pmLote: run.bloque,
              telarId: id,
              inicioCorte: new Date(run.desdeMs).toISOString(),
              finCorte: new Date(run.hastaMs).toISOString(),
              esBloqueAnterior: false,
            });
          }
        }

        const partesRows = await this.partesPaquetesDeBloques(
          runsCompletados.map((rc) => rc.run.bloque),
        );
        const partesPorClave = new Map<string, FilaParte[]>();
        const partesPorBloque = new Map<number, FilaParte[]>();
        for (const fila of partesRows) {
          if (fila.nBloque === null || fila.nTelar === null) {
            continue;
          }
          const clave = claveBloque(fila.nTelar, fila.nBloque);
          if (!partesPorClave.has(clave)) {
            partesPorClave.set(clave, []);
          }
          partesPorClave.get(clave)!.push(fila);
          if (!partesPorBloque.has(fila.nBloque)) {
            partesPorBloque.set(fila.nBloque, []);
          }
          partesPorBloque.get(fila.nBloque)!.push(fila);
        }

        const inventario = await this.inventarioPorPm(
          runsCompletados.map((rc) => rc.run.bloque),
        );

        // Construir cada ciclo y quedarse con los dudosos por medida/identidad.
        const dudosos: { telarId: number; run: RunBloque; ciclo: CicloBloque }[] = [];
        for (const { telarId: id, run } of runsCompletados) {
          const delBloque = partesDeVentana(
            partesPorClave.get(claveBloque(id, run.bloque)) ?? [],
            run.desdeMs,
            run.hastaMs,
          );
          const paquetes = delBloque.length > 0 ? resumenDePartes(delBloque) : null;
          const telaresParte = new Set(
            partesDeVentana(
              partesPorBloque.get(run.bloque) ?? [],
              run.desdeMs,
              run.hastaMs,
              MARGEN_PM_OTRO_TELAR_MS,
            ).map((p) => Number(p.nTelar)),
          );
          const parteEnOtroTelar = telaresParte.size > 0 && !telaresParte.has(id);
          const ciclo = this.aCicloBloque(
            run,
            ahora,
            false,
            paquetes,
            inventario.get(run.bloque) ?? null,
            parteEnOtroTelar,
          );
          if (esBloqueDudoso(ciclo)) {
            dudosos.push({ telarId: id, run, ciclo });
          }
        }

        // Conteo por bandera sobre el TOTAL de dudosos (no solo los devueltos),
        // calculado en backend para que los KPIs no infracuenten si se trunca.
        const conteo = {
          medidasIncoherentes: dudosos.filter((d) => d.ciclo.medidasIncoherentes).length,
          volumenIncompatibleParte: dudosos.filter((d) => d.ciclo.volumenIncompatibleParte)
            .length,
          volumenImposible: dudosos.filter((d) => d.ciclo.volumenImposible).length,
          pmDuplicado: dudosos.filter((d) => d.ciclo.pmDuplicado).length,
          parteEnOtroTelar: dudosos.filter((d) => d.ciclo.parteEnOtroTelar).length,
        };

        // Más recientes primero; se recorta a un tope (la página avisa si trunca).
        dudosos.sort((a, b) => b.run.desdeMs - a.run.desdeMs);
        const total = dudosos.length;
        const recortados = dudosos.slice(0, MAX_BLOQUES_DUDOSOS);

        // Detalle de inventario (proveedor/fábrica por separado, de las dos eras).
        const detalleInv = await this.detalleInventarioPorPm(
          recortados.map((d) => d.run.bloque),
        );
        const partesDetalleRows = await this.partesTrabajoDeBloques(
          recortados.map((d) => d.run.bloque),
        );
        const partesDetallePorBloque = new Map<number, FilaParte[]>();
        for (const fila of partesDetalleRows) {
          if (fila.nBloque === null) {
            continue;
          }
          if (!partesDetallePorBloque.has(fila.nBloque)) {
            partesDetallePorBloque.set(fila.nBloque, []);
          }
          partesDetallePorBloque.get(fila.nBloque)!.push(fila);
        }

        const bloques = recortados.map(({ telarId: id, run, ciclo }) =>
          this.aBloqueDudoso(
            id,
            run,
            ciclo,
            porTelar.get(id) ?? [],
            detalleInv.get(run.bloque) ?? null,
            nombres,
            lotePrevioPorRun.get(run) ?? null,
            partesDeVentana(
              partesDetallePorBloque.get(run.bloque) ?? [],
              run.desdeMs,
              run.hastaMs,
              MARGEN_PM_OTRO_TELAR_MS,
            ),
            coincidenciasPorMedida,
          ),
        );

        return {
          telarId: telarValido,
          desde: new Date(desdeMs).toISOString(),
          hasta: new Date(hastaMs).toISOString(),
          total,
          totalBloques: runsCompletados.length,
          truncado: total > recortados.length,
          conteo,
          bloques,
        } satisfies MedidasDudosasPagina;
      },
    );
  }

  getSaludDatos(): Promise<SaludDatos> {
    return this.cacheado('salud', TTL_SALUD_MS, async () => {
      const ahora = Date.now();
      const porTelar = await this.lecturasDesde(ahora - 7 * 86_400_000);

      const telares: SaludTelar[] = TELAR_IDS.map((telarId) => {
        const lecturas = porTelar.get(telarId) ?? [];
        const fiables = lecturas.filter((l) => !l.sospechosa).length;
        const conAvisos = lecturas.filter((l) => !l.sospechosa && l.alertas.length > 0).length;
        const limpias = lecturas.filter((l) => !l.sospechosa && l.alertas.length === 0).length;
        return {
          telarId,
          nombre: NOMBRES_TELAR.get(telarId) ?? `Telar ${telarId}`,
          lecturas7d: lecturas.length,
          fiables7d: fiables,
          pctFiables: lecturas.length > 0 ? (fiables / lecturas.length) * 100 : 100,
          conAvisos7d: conAvisos,
          limpias7d: limpias,
          pctLimpias: lecturas.length > 0 ? (limpias / lecturas.length) * 100 : 100,
        };
      });

      const cuarentena: LecturaCuarentena[] = TELAR_IDS.flatMap((id) =>
        (porTelar.get(id) ?? []).filter((l) => l.sospechosa),
      )
        .sort((a, b) => epoch(b.recibidaEn) - epoch(a.recibidaEn))
        .slice(0, 60)
        .map((lectura) => ({ lectura, motivos: lectura.motivosSospecha }));

      // Avisos: lecturas que NO se descartan (siguen en KPIs) pero pintan raro.
      const avisos: LecturaAviso[] = TELAR_IDS.flatMap((id) =>
        (porTelar.get(id) ?? []).filter((l) => !l.sospechosa && l.alertas.length > 0),
      )
        .sort((a, b) => epoch(b.recibidaEn) - epoch(a.recibidaEn))
        .slice(0, 60)
        .map((lectura) => ({ lectura, alertas: lectura.alertas }));

      const partes = await this.saludPartes();

      return {
        generadoEn: new Date(ahora).toISOString(),
        fuentes: await this.fuentesDatos(porTelar, telares, partes, ahora),
        telares,
        cuarentena,
        avisos,
        partes,
      };
    });
  }

  /**
   * Las tablas que alimentan Fabric, con su origen y su salud. El veredicto y el
   * diagnóstico se derivan de los datos (fiabilidad, cobertura); el resto es
   * descripción fija de la fuente. Cada consulta extra va protegida: si una
   * fuente no se puede leer, su tarjeta degrada a null/"—" sin tumbar la página.
   */
  private async fuentesDatos(
    porTelar: Map<number, LecturaInterna[]>,
    telares: SaludTelar[],
    partes: SaludPartes,
    ahora: number,
  ): Promise<FuenteDato[]> {
    return Promise.all([
      // Máquinas: lo que emiten los telares y el disco puente.
      this.fuenteLecturas(porTelar, telares, ahora),
      this.fuentePartes(partes, ahora),
      this.fuenteDiscoPuente(ahora),
      this.fuenteReforzadora(ahora),
      this.fuenteBloqueMaquinas(ahora),
      // Inventario real: el stock de Odoo.
      this.fuenteStockLot(ahora),
      this.fuenteStockQuant(),
      this.fuenteStockLocation(),
      // Catálogo de productos: solo para resolver nombres de material.
      this.fuenteProductTemplate(),
      this.fuenteProductProduct(),
      // Heredada: log antiguo con uso acotado.
      this.fuenteInventario(ahora),
    ]);
  }

  /** Envuelve una consulta opcional: si falla (permisos, tabla ausente), null. */
  private async intentar<T>(thunk: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await thunk();
    } catch {
      return fallback;
    }
  }

  /**
   * Tarjeta de una tabla de la que solo damos un recuento y la última marca:
   * maestros y catálogos sin un veredicto de fiabilidad rico (a diferencia de
   * lecturas/partes). El estado es real: "al día" si tiene filas, "sin datos" si
   * está vacía o no se pudo leer. Nada se estima.
   */
  private async fuenteConteo(args: {
    grupo: GrupoFuente;
    tabla: string;
    nombre: string;
    origen: string;
    descripcion: string;
    contar: () => Promise<number>;
    ultima?: () => Promise<Date | null>;
    diagnostico: (total: number) => string;
  }): Promise<FuenteDato> {
    const total = await this.intentar(args.contar, null as number | null);
    const ultima = args.ultima
      ? await this.intentar(args.ultima, null as Date | null)
      : null;
    return {
      grupo: args.grupo,
      tabla: args.tabla,
      nombre: args.nombre,
      origen: args.origen,
      descripcion: args.descripcion,
      registros: total,
      ultimaActualizacion: ultima ? ultima.toISOString() : null,
      estado: total === null || total === 0 ? 'sin-datos' : 'ok',
      diagnostico:
        total === null
          ? 'No se pudo leer la tabla.'
          : total === 0
            ? 'Sin registros.'
            : args.diagnostico(total),
    };
  }

  private fuenteDiscoPuente(ahora: number): Promise<FuenteDato> {
    return this.fuenteConteo({
      grupo: 'maquinas',
      tabla: 'parte_discopuente_mapeada',
      nombre: 'Partes del disco puente',
      origen: 'Máquina de disco puente (TotWare → Odoo)',
      descripcion:
        'Partes de la otra máquina de corte (disco puente): operaciones, paquetes, medidas de tablas y m² de entrada/salida con su eficiencia. Versión saneada de la tabla cruda, con fecha y hora reales.',
      contar: () => this.prisma.parteDiscoPuenteMapeada.count(),
      ultima: async () =>
        (
          await this.prisma.parteDiscoPuenteMapeada.findFirst({
            where: { fechaHora: { not: null, lte: new Date(ahora) } },
            orderBy: [{ fechaHora: 'desc' }, { id: 'desc' }],
            select: { fechaHora: true },
          })
        )?.fechaHora ?? null,
      diagnostico: (n) => `${n} partes del disco puente registrados.`,
    });
  }

  private fuenteReforzadora(ahora: number): Promise<FuenteDato> {
    return this.fuenteConteo({
      grupo: 'maquinas',
      tabla: 'reforzadora_mapeada',
      nombre: 'Partes de la reforzadora',
      origen: 'Máquina reforzadora de tablas (TotWare → Odoo)',
      descripcion:
        'Partes de la reforzadora de tablas (malla + resina): material, nº de tablas, medidas y m² reforzados (derivado). `n_reforzadora` solo trae 1 (no separa REFORZADORA 1 de REFORZADORA 2 SEI); acabado/eventos y la unidad de `consumo` pendientes de confirmar con TotWare.',
      contar: () => this.prisma.reforzadoraMapeada.count(),
      ultima: async () =>
        (
          await this.prisma.reforzadoraMapeada.findFirst({
            where: { fechaHora: { not: null, lte: new Date(ahora) } },
            orderBy: [{ fechaHora: 'desc' }, { id: 'desc' }],
            select: { fechaHora: true },
          })
        )?.fechaHora ?? null,
      diagnostico: (n) => `${n} partes de la reforzadora registrados.`,
    });
  }

  private fuenteBloqueMaquinas(ahora: number): Promise<FuenteDato> {
    return this.fuenteConteo({
      grupo: 'maquinas',
      tabla: 'bloque_maquinas',
      nombre: 'Padrón de bloques de máquina',
      origen: 'Sistema de máquinas (Odoo)',
      descripcion:
        'Censo de los números de bloque que conocen las máquinas (puente id ↔ nº de bloque). Sirve para validar si un PM/lote es conocido; no es el inventario de almacén.',
      contar: () => this.prisma.bloqueMaquinas.count(),
      ultima: async () =>
        (
          await this.prisma.bloqueMaquinas.findFirst({
            where: { createDate: { not: null, lte: new Date(ahora) } },
            orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
            select: { createDate: true },
          })
        )?.createDate ?? null,
      diagnostico: (n) => `${n} bloques en el padrón de máquinas.`,
    });
  }

  private fuenteStockLot(ahora: number): Promise<FuenteDato> {
    return this.fuenteConteo({
      grupo: 'inventario',
      tabla: 'stock_lot',
      nombre: 'Lotes / bloques en stock',
      origen: 'Almacén de Odoo (recepción de compra)',
      descripcion:
        'Maestro real del inventario: cada bloque físico es un lote, con su medida de proveedor y, cuando se mide al procesar, la de fábrica. Es la fuente del inventario de bloques y del m³/merma por lote.',
      contar: () => this.prisma.stockLot.count(),
      ultima: async () =>
        (
          await this.prisma.stockLot.findFirst({
            where: { writeDate: { not: null, lte: new Date(ahora) } },
            orderBy: [{ writeDate: 'desc' }, { id: 'desc' }],
            select: { writeDate: true },
          })
        )?.writeDate ?? null,
      diagnostico: (n) =>
        `${n} lotes en el maestro; las existencias reales salen del cruce con stock_quant.`,
    });
  }

  private fuenteStockQuant(): Promise<FuenteDato> {
    return this.fuenteConteo({
      grupo: 'inventario',
      tabla: 'stock_quant',
      nombre: 'Existencias on-hand',
      origen: 'Motor de inventario de Odoo (automático)',
      descripcion:
        'Cantidad de cada lote/producto en cada ubicación. El inventario cuenta como on-hand los quants en ubicación interna con cantidad mayor que cero; la cantidad va en unidades (1 unidad = 1 bloque).',
      contar: () => this.prisma.stockQuant.count(),
      diagnostico: (n) => `${n} registros de existencias.`,
    });
  }

  private fuenteStockLocation(): Promise<FuenteDato> {
    return this.fuenteConteo({
      grupo: 'inventario',
      tabla: 'stock_location',
      nombre: 'Ubicaciones de almacén',
      origen: 'Configuración de almacén en Odoo',
      descripcion:
        'Catálogo de ubicaciones de stock. El campo de uso distingue las internas (almacén) de proveedor, cliente o tránsito; el on-hand solo cuenta las internas.',
      contar: () => this.prisma.stockLocation.count(),
      diagnostico: (n) => `${n} ubicaciones de stock.`,
    });
  }

  private fuenteProductTemplate(): Promise<FuenteDato> {
    return this.fuenteConteo({
      grupo: 'catalogo',
      tabla: 'product_template',
      nombre: 'Catálogo de productos',
      origen: 'Maestro de productos de Odoo',
      descripcion:
        'Plantilla de producto. Resuelve el nombre del material (MARFIL, TRAVERTINO ALBINO…) a partir del id que guardan los lotes y las lecturas. Fabric solo la lee para nombres.',
      contar: () => this.prisma.productTemplate.count(),
      diagnostico: (n) => `${n} productos en el catálogo.`,
    });
  }

  private fuenteProductProduct(): Promise<FuenteDato> {
    return this.fuenteConteo({
      grupo: 'catalogo',
      tabla: 'product_product',
      nombre: 'Variantes de producto',
      origen: 'Maestro de productos de Odoo',
      descripcion:
        'Variante concreta que cuelga de una plantilla. Solo se usa como puente para resolver el nombre cuando el id de material es una variante en vez de la plantilla.',
      contar: () => this.prisma.productProduct.count(),
      diagnostico: (n) => `${n} variantes de producto.`,
    });
  }

  private async fuenteLecturas(
    porTelar: Map<number, LecturaInterna[]>,
    telares: SaludTelar[],
    ahora: number,
  ): Promise<FuenteDato> {
    const lecturas = TELAR_IDS.flatMap((id) => porTelar.get(id) ?? []);
    const fiables = lecturas.filter((l) => !l.sospechosa).length;
    const pct =
      lecturas.length > 0 ? Math.round((fiables / lecturas.length) * 100) : 100;
    const degradados = telares
      .filter((t) => t.lecturas7d > 0 && t.pctFiables < 95)
      .map((t) => t.nombre);

    const total = await this.intentar(
      () => this.prisma.produccionMapeada.count(),
      null as number | null,
    );
    const ultimaFila = await this.intentar(
      () =>
        this.prisma.produccionMapeada.findFirst({
          where: { fechaHora: { not: null, lte: new Date(ahora) } },
          orderBy: [{ fechaHora: 'desc' }, { id: 'desc' }],
          select: { fechaHora: true },
        }),
      null,
    );

    const ultimaMs = ultimaFila?.fechaHora ? ultimaFila.fechaHora.getTime() : null;
    const desfasada = ultimaMs !== null && ahora - ultimaMs > FUENTE_FRESCA_MS;

    let estado: EstadoFuente;
    let diagnostico: string;
    if (lecturas.length === 0) {
      estado = ultimaMs !== null ? 'aviso' : 'sin-datos';
      diagnostico =
        ultimaMs !== null
          ? 'No han entrado lecturas en los últimos 7 días: los telares pueden estar parados o la integración cortada.'
          : 'Sin lecturas en la base de datos.';
    } else {
      estado = pct >= 98 ? 'ok' : pct >= 90 ? 'aviso' : 'mal';
      if (desfasada) {
        // La frescura manda sobre la fiabilidad del periodo: no afirmar que
        // "llegan con normalidad" si la última lectura es de hace horas.
        if (estado === 'ok') {
          estado = 'aviso';
        }
        diagnostico = `No entran lecturas nuevas desde la última recibida (puede ser una parada o un corte de la integración); en los últimos 7 días, ${pct} % de lecturas fiables.`;
      } else {
        diagnostico =
          estado === 'ok'
            ? `Llegan con normalidad: ${pct} % de lecturas fiables en los últimos 7 días.`
            : `${pct} % de lecturas fiables en los últimos 7 días; el resto queda en cuarentena.`;
      }
      if (degradados.length > 0) {
        diagnostico += ` Las dudosas se concentran en ${listaEs(degradados)}.`;
      }
    }

    return {
      grupo: 'maquinas',
      tabla: 'produccion_mapeada',
      nombre: 'Lecturas de los telares',
      origen: 'Autómata de cada telar — una lectura cada ~10 min',
      descripcion:
        'Estado, potencia (kW), consumo (A), golpes/min y altura del bastidor (mm) de los 4 telares. Es la base de la sala en vivo, el detalle de cada telar, la producción y esta misma salud del dato.',
      registros: total,
      ultimaActualizacion: ultimaFila?.fechaHora
        ? ultimaFila.fechaHora.toISOString()
        : null,
      estado,
      diagnostico,
    };
  }

  private async fuentePartes(
    partes: SaludPartes,
    ahora: number,
  ): Promise<FuenteDato> {
    const ultimaFila = await this.intentar(
      () =>
        this.prisma.parteTrabajoMapeada.findFirst({
          where: { createDate: { not: null, lte: new Date(ahora) } },
          orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
          select: { createDate: true },
        }),
      null,
    );

    const pct =
      partes.total > 0 ? Math.round((partes.sospechosos / partes.total) * 100) : 0;
    let estado: EstadoFuente;
    let diagnostico: string;
    if (partes.total === 0) {
      estado = 'sin-datos';
      diagnostico = 'Sin partes registrados.';
    } else if (partes.sospechosos === 0) {
      estado = 'ok';
      diagnostico = `Los ${partes.total} partes pasan las comprobaciones de formato.`;
    } else {
      estado = pct >= 10 ? 'mal' : 'aviso';
      // Un recuento &gt; 0 que redondea a 0 % se muestra como "&lt;1 %": nunca
      // "(0 %)" junto a un número de partes con problemas (se contradice).
      const pctTxt = pct < 1 ? '<1' : String(pct);
      diagnostico = `${partes.sospechosos} de ${partes.total} partes con problemas de formato (${pctTxt} %); el desglose, más abajo.`;
    }

    return {
      grupo: 'maquinas',
      tabla: 'parte_trabajo_mapeada',
      nombre: 'Partes de trabajo de operario',
      origen: 'Registro de los operarios (TotWare → Odoo)',
      descripcion:
        'Operaciones de cada turno: colocación, aserrado, salida y los paquetes con sus tablas y m² reales. Aporta los m², las tablas y el material por lote que las lecturas de máquina no traen.',
      registros: partes.total,
      ultimaActualizacion: ultimaFila?.createDate
        ? ultimaFila.createDate.toISOString()
        : null,
      estado,
      diagnostico,
    };
  }

  private async fuenteInventario(ahora: number): Promise<FuenteDato> {
    const total = await this.intentar(
      () => this.prisma.lotBlockCreation.count(),
      null as number | null,
    );
    const conFabrica = await this.intentar(
      () => this.prisma.lotBlockCreation.count({ where: { largoMrp: { not: null } } }),
      null as number | null,
    );
    const ultimaFila = await this.intentar(
      () =>
        this.prisma.lotBlockCreation.findFirst({
          where: { createDate: { not: null, lte: new Date(ahora) } },
          orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
          select: { createDate: true },
        }),
      null,
    );

    let estado: EstadoFuente;
    let diagnostico: string;
    if (total === null) {
      estado = 'sin-datos';
      diagnostico = 'No se pudo leer el inventario.';
    } else if (total === 0) {
      estado = 'sin-datos';
      diagnostico = 'Sin altas de bloque.';
    } else {
      estado = 'ok';
      const conFab =
        conFabrica !== null ? `; ${conFabrica} con medida de fábrica` : '';
      diagnostico = `${total} altas de recepción${conFab}. Log VIVO de recepción: los bloques recientes (aún sin existencias en el stock de Odoo) se cuentan en el inventario desde aquí.`;
    }

    return {
      grupo: 'inventario',
      tabla: 'lot_block_creation',
      nombre: 'Altas de bloque (recepción reciente)',
      origen: 'Recepción de almacén (Odoo)',
      descripcion:
        'Log vivo de recepción de bloques. Es la fuente de los bloques recientes del inventario que aún no han entrado al stock de Odoo (sin existencias en stock_quant); el inventario los une con el stock on-hand del snapshot. Aporta además la medida real del bloque por PM/lote para el m³ y el rendimiento (m²/m³) de Producción.',
      registros: total,
      ultimaActualizacion: ultimaFila?.createDate
        ? ultimaFila.createDate.toISOString()
        : null,
      estado,
      diagnostico,
    };
  }

  /** Calidad de los partes de operario, con los motivos detectados. */
  private async saludPartes(): Promise<SaludPartes> {
    type Resumen = {
      total: number;
      sin_fecha: number;
      fecha_futura: number;
      telar_invalido: number;
      unidades_cm: number;
      sospechosos: number;
    };
    // Sin acceso a la tabla (permisos), la salud de partes degrada a vacío en
    // vez de tumbar toda la página de Salud del dato.
    const resumen = await this.intentar(
      async () => {
        const [fila] = await this.prisma.$queryRawUnsafe<Resumen[]>(`
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE fecha_hora IS NULL)::int AS sin_fecha,
        count(*) FILTER (WHERE fecha_hora > create_date + interval '1 day')::int AS fecha_futura,
        count(*) FILTER (WHERE n_telar IS NULL OR n_telar NOT IN ('1','2','3','4'))::int AS telar_invalido,
        count(*) FILTER (WHERE operacion = '4' AND largo_tablas > 10)::int AS unidades_cm,
        count(*) FILTER (WHERE fecha_hora IS NULL
          OR fecha_hora > create_date + interval '1 day'
          OR n_telar IS NULL OR n_telar NOT IN ('1','2','3','4')
          OR (operacion = '4' AND largo_tablas > 10))::int AS sospechosos
      FROM parte_trabajo_mapeada`);
        return fila;
      },
      { total: 0, sin_fecha: 0, fecha_futura: 0, telar_invalido: 0, unidades_cm: 0, sospechosos: 0 } as Resumen,
    );
    return {
      total: resumen.total,
      sospechosos: resumen.sospechosos,
      motivos: [
        { motivo: 'Sin fecha declarada', numero: resumen.sin_fecha },
        { motivo: 'Fecha declarada futura (posterior a la inserción)', numero: resumen.fecha_futura },
        { motivo: 'Telar desconocido (códigos corruptos o vacíos)', numero: resumen.telar_invalido },
        { motivo: 'Medidas de tabla en cm (unidades mezcladas)', numero: resumen.unidades_cm },
      ].filter((m) => m.numero > 0),
    };
  }

  getPartes(rango: RangoEstadisticas, telarId: number | null): Promise<PaginaPartes> {
    // Los partes de operario (colocación/salida/paquetes) no existen en
    // produccion_mapeada; la vista de partes consume las lecturas crudas por
    // el endpoint /produccion-mapeada. Página vacía: sin fuente, sin datos.
    const ahora = new Date();
    return Promise.resolve({
      rango,
      telarId,
      desde: ahora.toISOString(),
      hasta: ahora.toISOString(),
      total: 0,
      partes: [],
    });
  }

  // ── Carga y mapeo ────────────────────────────────────────────────────────

  private async cacheado<T>(clave: string, ttlMs: number, calc: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(clave);
    if (hit && Date.now() - hit.en < ttlMs) {
      return hit.valor as T;
    }
    const valor = await calc();
    this.cache.set(clave, { en: Date.now(), valor });
    return valor;
  }

  private async lecturasDesde(desdeMs: number): Promise<Map<number, LecturaInterna[]>> {
    const filas = await this.prisma.produccionMapeada.findMany({
      where: { fechaHora: { gte: new Date(desdeMs) } },
      orderBy: [{ fechaHora: 'asc' }, { id: 'asc' }],
    });

    const porTelar = new Map<number, LecturaInterna[]>();
    const codigosPorTelar = new Map<number, string[]>();
    for (const fila of filas) {
      const telarId = Number(fila.telarN);
      if (!TELAR_IDS.includes(telarId) || fila.fechaHora === null) {
        continue;
      }
      const lectura = this.aLectura(fila, telarId);
      if (!porTelar.has(telarId)) {
        porTelar.set(telarId, []);
        codigosPorTelar.set(telarId, []);
      }
      porTelar.get(telarId)!.push(lectura);
      codigosPorTelar.get(telarId)!.push((fila.incidencia ?? '').trim());
    }

    for (const telarId of porTelar.keys()) {
      validarLecturas(porTelar.get(telarId)!, codigosPorTelar.get(telarId)!);
    }
    return porTelar;
  }

  /**
   * Marca de la ÚLTIMA lectura recibida por cada telar SIN límite de ventana:
   * para poder decir "hace cuánto" llegó el último dato aunque el telar lleve
   * días (o semanas) callado, más allá de los 7 días que carga el snapshot.
   * El `lte ahora` descarta sellos futuros (reloj de consola corrupto); la
   * recepción es `create_date` o, si falta, la fecha declarada (como `aLectura`).
   */
  private async ultimaLecturaPorTelar(ahora: number): Promise<Map<number, string>> {
    const marcas = new Map<number, string>();
    await Promise.all(
      TELAR_IDS.map(async (telarId) => {
        // Protegida: si la consulta falla (permisos), el snapshot cae al
        // respaldo (última lectura de la ventana ya cargada) sin tumbarse.
        const fila = await this.intentar(
          () =>
            this.prisma.produccionMapeada.findFirst({
              where: { telarN: String(telarId), fechaHora: { not: null, lte: new Date(ahora) } },
              orderBy: [{ fechaHora: 'desc' }, { id: 'desc' }],
              select: { createDate: true, fechaHora: true },
            }),
          null as { createDate: Date | null; fechaHora: Date | null } | null,
        );
        if (fila?.createDate || fila?.fechaHora) {
          marcas.set(telarId, (fila.createDate ?? fila.fechaHora!).toISOString());
        }
      }),
    );
    return marcas;
  }

  /**
   * Actividad del operario (último parte de `parte_trabajo_mapeada`) por telar,
   * para el badge de la sala: operacion 1-4 → fase de trabajo; operacion 0 →
   * motivo de parada en `accion`. Caduca a los 20 min salvo "Fin de jornada"
   * (dura hasta que la máquina vuelve a marcha). Protegida: si falla, sin badge.
   */
  private async actividadOperarioPorTelar(
    ahora: number,
    porTelar: Map<number, LecturaInterna[]>,
  ): Promise<Map<number, ActividadParte>> {
    const mapa = new Map<number, ActividadParte>();
    await Promise.all(
      TELAR_IDS.map(async (telarId) => {
        const fila = await this.intentar(
          () =>
            this.prisma.parteTrabajoMapeada.findFirst({
              where: { nTelar: String(telarId), fechaHora: { not: null, lte: new Date(ahora) } },
              orderBy: [{ fechaHora: 'desc' }, { id: 'desc' }],
              select: { operacion: true, accion: true, fechaHora: true },
            }),
          null as {
            operacion: string | null;
            accion: string | null;
            fechaHora: Date | null;
          } | null,
        );
        if (!fila?.fechaHora) {
          return;
        }
        const act = actividadDeParteTelar(
          fila.operacion,
          fila.accion,
          fila.fechaHora,
          ahora,
          porTelar.get(telarId) ?? [],
        );
        if (act) {
          mapa.set(telarId, act);
        }
      }),
    );
    return mapa;
  }

  /**
   * Partes de paquetes (operación '4', la única con m²/tablas reales) de los
   * bloques dados. El cruce con los runs de lecturas es telar + nº bloque.
   */
  private async partesPaquetesDeBloques(bloques: number[]): Promise<FilaParte[]> {
    if (bloques.length === 0) {
      return [];
    }
    const filas = await this.prisma.parteTrabajoMapeada.findMany({
      where: {
        operacion: '4',
        nBloque: { in: [...new Set(bloques)] },
        nTelar: { in: TELAR_IDS.map(String) },
      },
      orderBy: [{ createDate: 'asc' }],
    });
    return filas.filter((fila) => fila.operacion === '4');
  }

  /** Partes de trabajo de cualquier operacion para reconstruir la linea temporal. */
  private async partesTrabajoDeBloques(bloques: number[]): Promise<FilaParte[]> {
    if (bloques.length === 0) {
      return [];
    }
    return this.prisma.parteTrabajoMapeada.findMany({
      where: {
        nBloque: { in: [...new Set(bloques)] },
        nTelar: { in: TELAR_IDS.map(String) },
      },
      orderBy: [{ createDate: 'asc' }],
    });
  }

  /** Últimos partes de paquetes para el ticker de la sala. */
  private ultimosPartesPaquetes(): Promise<FilaParte[]> {
    return this.prisma.parteTrabajoMapeada.findMany({
      where: { operacion: '4', nTelar: { in: TELAR_IDS.map(String) } },
      orderBy: [{ createDate: 'desc' }],
      take: 8,
    });
  }

  /** Nombres reales de operario (hr_employee de Odoo), cacheados 1 h. */
  private async nombresOperarios(): Promise<Map<number, string>> {
    if (
      this.nombresOperariosCache &&
      Date.now() - this.nombresOperariosCache.en < 3_600_000
    ) {
      return this.nombresOperariosCache.valor;
    }
    try {
      const filas = await this.prisma.$queryRawUnsafe<{ id: number; name: string }[]>(
        'SELECT id, name FROM hr_employee',
      );
      const valor = new Map(filas.map((f) => [f.id, f.name]));
      this.nombresOperariosCache = { en: Date.now(), valor };
      return valor;
    } catch {
      // Sin permisos sobre hr_employee: se muestran los códigos.
      return new Map();
    }
  }

  /**
   * Material real por bloque (de los partes de operario) + telares con el
   * sensor de material estancado. Cacheado 30 min (las tablas son pequeñas).
   * Si las consultas fallan, devuelve mapas vacíos y el cálculo sigue cayendo
   * al material de la lectura.
   */
  private async resolverMateriales(): Promise<MaterialesBloque> {
    if (this.materialesCache && Date.now() - this.materialesCache.en < 1_800_000) {
      return this.materialesCache.valor;
    }
    const porBloque = new Map<string, string>();
    const estancados = new Set<number>();
    try {
      // Material por bloque desde los partes (el más frecuente si el bloque
      // tiene partes con materiales distintos). Mismo código que el catálogo.
      const partes = await this.prisma.$queryRawUnsafe<
        { n_telar: string; n_bloque: number; material: number }[]
      >(
        `SELECT n_telar, n_bloque,
                MODE() WITHIN GROUP (ORDER BY material) AS material
           FROM parte_trabajo_mapeada
          WHERE material IS NOT NULL AND n_bloque IS NOT NULL
            AND n_telar IN ('1','2','3','4')
          GROUP BY n_telar, n_bloque`,
      );
      for (const p of partes) {
        porBloque.set(`${Number(p.n_telar)}-${p.n_bloque}`, String(p.material));
      }
      // Telares estancados: el material de lectura no varía nunca (sensor
      // averiado) → su lectura no sirve de respaldo.
      const variedad = await this.prisma.$queryRawUnsafe<{ telar_n: string; n: number }[]>(
        `SELECT telar_n, COUNT(DISTINCT material)::int AS n
           FROM produccion_mapeada
          WHERE telar_n IN ('1','2','3','4') AND material IS NOT NULL
          GROUP BY telar_n`,
      );
      for (const v of variedad) {
        if (v.n <= 1) {
          estancados.add(Number(v.telar_n));
        }
      }
    } catch {
      // Sin acceso a las tablas: sin recuperación, el cálculo sigue.
    }
    const valor: MaterialesBloque = { porBloque, estancados };
    this.materialesCache = { en: Date.now(), valor };
    return valor;
  }

  private nombreOperario(
    codigo: string | null,
    nombres: Map<number, string>,
  ): string | null {
    if (codigo === null) {
      return null;
    }
    return nombres.get(Number(codigo)) ?? codigo;
  }

  /** Parte de paquetes → evento del ticker/ciclo (tipo 'paquetes' deducido). */
  private eventoDeParte(fila: FilaParte, nombres: Map<number, string>): EventoParte {
    const fechaMs = fechaParteMs(fila) ?? 0;
    return {
      id: `parte-${fila.id}`,
      telarId: Number(fila.nTelar),
      fechaHora: new Date(fechaMs).toISOString(),
      tipo: 'paquetes',
      bloque: fila.nBloque,
      pmLote: fila.nBloque,
      materialId: fila.material !== null ? String(fila.material) : null,
      paquetes: resumenDePartes([fila]),
      operario1: this.nombreOperario(
        fila.operario1 !== null ? String(fila.operario1) : null,
        nombres,
      ),
      operario2: this.nombreOperario(
        fila.operario2 !== null ? String(fila.operario2) : null,
        nombres,
      ),
    };
  }

  private aLectura(fila: FilaProduccion, telarId: number): LecturaInterna {
    const potencia = fila.potencia ?? 0;
    const fechaHora = fila.fechaHora!.toISOString();
    return {
      largoCm: fila.largo ?? 0,
      altoCm: fila.alto ?? 0,
      gruesoCm: fila.grueso !== null ? Number(fila.grueso) : 0,
      materialCodigo: fila.material !== null ? String(fila.material) : null,
      id: String(fila.id),
      telarId,
      fechaHora,
      // create_date es el sello de inserción en BD; si falta (filas
      // históricas) se usa la propia fecha declarada.
      recibidaEn: (fila.createDate ?? fila.fechaHora!).toISOString(),
      bloque: fila.nBloque,
      pmLote: fila.nBloque,
      incidencia: incidenciaDeCodigo(fila.incidencia, potencia),
      potenciaKw: potencia,
      // consumo = amperios (≈ 2 × potencia, verificado en VERIFICACION.md §0).
      amperios: fila.consumo ?? 0,
      // La columna cruda llega en golpes×10 (los reales rondan ~80–90 gpm en
      // marcha, no ~800): se divide entre 10 en el origen para que todo lo que
      // venga después (snapshot, series, medias) use ya golpes/min reales.
      golpesPorMinuto: (fila.golpesXMinuto ?? 0) / 10,
      velocidadMmH: fila.velocidad ?? 0,
      alturaActualMm: fila.alturaActual ?? 0,
      operario1: fila.operario1 !== null ? String(fila.operario1) : null,
      operario2: fila.operario2 !== null ? String(fila.operario2) : null,
      sospechosa: false,
      motivosSospecha: [],
      alertas: [],
    };
  }

  // ── Derivaciones ─────────────────────────────────────────────────────────

  private runActual(runs: RunBloque[], ahora: number): RunBloque | null {
    const ultimo = runs[runs.length - 1];
    if (!ultimo) {
      return null;
    }
    // El último run sigue "vivo" si su lectura final es reciente.
    return ahora - ultimo.hastaMs <= UMBRAL_SIN_DATOS_MS * 2 ? ultimo : null;
  }

  /**
   * Medida real de cada PM desde el inventario `lot_block_creation`. La PM es la
   * columna `name` (numérica), la misma que `n_bloque`, y es un identificador
   * ÚNICO de bloque (1:1, confirmado por Pulycort 2026-06-15). Toma la medida de
   * FÁBRICA (mrp); si falta, la del proveedor como respaldo (marca `estimado`).
   * Un PM con varias filas = PM duplicado (error de dato): se marca `duplicado`
   * y el ciclo no calcula su m³ (no se inventa cuál de los bloques es). Los PM
   * ausentes del inventario no aparecen en el mapa (→ m³ null en el ciclo).
   */
  private async inventarioPorPm(pms: number[]): Promise<Map<number, LoteInventario>> {
    const numeros = [...new Set(pms.filter((n) => Number.isInteger(n) && n > 0))];
    if (numeros.length === 0) {
      return new Map();
    }
    const filas = await this.prisma.lotBlockCreation.findMany({
      where: { name: { in: numeros.map(String) } },
      select: {
        name: true,
        largoMrp: true,
        altoMrp: true,
        gruesoMrp: true,
        largoSupplier: true,
        altoSupplier: true,
        gruesoSupplier: true,
      },
    });
    const acum = new Map<
      number,
      { volumen: number; bloques: number; respaldo: boolean; imposible: boolean }
    >();
    for (const fila of filas) {
      const pm = Number(fila.name?.trim());
      if (!Number.isInteger(pm)) {
        continue;
      }
      // Medida real de fábrica (mrp); si falta, respaldo a la del proveedor.
      // El helper normaliza cm→m por dimensión (la tabla mezcla unidades).
      const fabrica = volumenBloqueM3(
        fila.largoMrp ?? 0,
        fila.altoMrp ?? 0,
        fila.gruesoMrp ?? 0,
      );
      const usaProveedor = fabrica <= 0;
      const [largo, alto, grueso] = usaProveedor
        ? [fila.largoSupplier, fila.altoSupplier, fila.gruesoSupplier]
        : [fila.largoMrp ?? 0, fila.altoMrp ?? 0, fila.gruesoMrp ?? 0];
      const volumen = usaProveedor
        ? volumenBloqueM3(largo, alto, grueso)
        : fabrica;
      const previo = acum.get(pm) ?? {
        volumen: 0,
        bloques: 0,
        respaldo: false,
        imposible: false,
      };
      previo.volumen += volumen;
      previo.bloques += 1;
      previo.respaldo = previo.respaldo || usaProveedor;
      previo.imposible = previo.imposible || bloqueImposible(largo, alto, grueso);
      acum.set(pm, previo);
    }
    return new Map(
      [...acum].map(([pm, v]) => [
        pm,
        {
          bloques: v.bloques,
          volumenM3: redondea(v.volumen, 2),
          estimado: v.respaldo,
          duplicado: v.bloques > 1,
          imposible: v.imposible,
        },
      ]),
    );
  }

  /**
   * Detalle de inventario por PM para el diagnóstico de medidas dudosas: a
   * diferencia de `inventarioPorPm` (que colapsa proveedor+fábrica en un único
   * m³), aquí se exponen las DOS medidas por separado y de las DOS eras del
   * inventario. La "alta" (`lot_block_creation`) es la entrada reciente del
   * bloque y se prefiere como origen; si el PM no está ahí se busca en el stock
   * (`stock_lot`). No filtra por consumo ni por on-hand (estos bloques ya se
   * cortaron), así que recupera la medida aunque el bloque ya no esté en
   * existencias. null por PM = no está dado de alta en ninguna era.
   */
  private async detalleInventarioPorPm(
    pms: number[],
  ): Promise<Map<number, DetalleInventarioLote>> {
    const numeros = [...new Set(pms.filter((n) => Number.isInteger(n) && n > 0))];
    if (numeros.length === 0) {
      return new Map();
    }
    const nombres = numeros.map(String);
    const medidasSelect = {
      name: true,
      largoSupplier: true,
      altoSupplier: true,
      gruesoSupplier: true,
      largoMrp: true,
      altoMrp: true,
      gruesoMrp: true,
    } as const;
    const [altas, stocks] = await Promise.all([
      this.prisma.lotBlockCreation.findMany({
        where: { name: { in: nombres } },
        select: medidasSelect,
      }),
      this.prisma.stockLot.findMany({
        where: { name: { in: nombres } },
        select: medidasSelect,
      }),
    ]);

    const conteoAlta = new Map<number, number>();
    const primeraAlta = new Map<number, MedidasCrudasInv>();
    for (const fila of altas) {
      const pm = Number(fila.name?.trim());
      if (!Number.isInteger(pm)) {
        continue;
      }
      conteoAlta.set(pm, (conteoAlta.get(pm) ?? 0) + 1);
      if (!primeraAlta.has(pm)) {
        primeraAlta.set(pm, fila);
      }
    }
    const primeraStock = new Map<number, MedidasCrudasInv>();
    for (const fila of stocks) {
      const pm = Number(fila.name?.trim());
      if (!Number.isInteger(pm) || primeraStock.has(pm)) {
        continue;
      }
      primeraStock.set(pm, fila);
    }

    const mapa = new Map<number, DetalleInventarioLote>();
    for (const pm of numeros) {
      const alta = primeraAlta.get(pm);
      const fila = alta ?? primeraStock.get(pm);
      if (!fila) {
        continue;
      }
      const proveedor = medidaFuente(
        fila.largoSupplier,
        fila.altoSupplier,
        fila.gruesoSupplier,
      );
      const fabrica = medidaFuente(fila.largoMrp, fila.altoMrp, fila.gruesoMrp);
      mapa.set(pm, {
        fuente: alta ? 'alta' : 'stock',
        proveedor,
        fabrica,
        mermaPct: mermaEntreMedidas(proveedor, fabrica),
        bloques: conteoAlta.get(pm) ?? 1,
      });
    }
    return mapa;
  }

  /** Ensambla un BloqueDudoso reuniendo todas las fuentes de un ciclo dudoso. */
  private aBloqueDudoso(
    telarId: number,
    run: RunBloque,
    ciclo: CicloBloque,
    lecturasTelar: LecturaInterna[],
    inv: DetalleInventarioLote | null,
    nombres: Map<number, string>,
    loteBloqueAnterior: number | null,
    partesRelacionados: FilaParte[],
    coincidenciasPorMedida: Map<string, CoincidenciaMedidaConsola[]>,
  ): BloqueDudoso {
    // Todas las lecturas de ESTE lote en ESTE telar dentro de la ventana del run
    // (incluidas las sospechosas, que no entran en el run pero sí "pasaron").
    const lecturas: LecturaBloqueDudosa[] = lecturasTelar
      .filter(
        (l) =>
          l.bloque === run.bloque &&
          epoch(l.recibidaEn) >= run.desdeMs &&
          epoch(l.recibidaEn) <= run.hastaMs,
      )
      .sort((a, b) => epoch(a.recibidaEn) - epoch(b.recibidaEn))
      .map((l) => ({
        lectura: aLecturaPublica(l),
        largoCm: l.largoCm,
        altoCm: l.altoCm,
        gruesoCm: l.gruesoCm,
      }));
    // Operarios del lote: nombres distintos de los que trabajaron el run.
    const operarios = [
      ...new Set(
        lecturas
          .flatMap((l) => [l.lectura.operario1, l.lectura.operario2])
          .map((codigo) => this.nombreOperario(codigo, nombres))
          .filter((n): n is string => n !== null),
      ),
    ];
    // Consola del telar en metros (misma forma que proveedor/fábrica).
    const m = ciclo.bloque.medidasFabrica;
    const consola = medidaFuente(m.largoCm, m.altoCm, m.gruesoCm);

    // ── Señales de coherencia física (para detectar errores) ──
    const esp = ciclo.espesorCorteCm; // cm
    const m2Parte = ciclo.paquetes?.metrosCuadrados ?? null;
    const m3Bloque = ciclo.volumenM3; // m³ oficial del inventario
    const techoRendimientoM2M3 = esp !== null && esp > 0 ? redondea(100 / esp, 1) : null;
    // Piedra que salió en tabla: m² × espesor (m). Es el mínimo físico que ocupa.
    const piedraCortadaM3 =
      m2Parte !== null && esp !== null && esp > 0 ? redondea(m2Parte * (esp / 100), 2) : null;
    const mermaAserradoPct =
      m3Bloque !== null && m3Bloque > 0 && piedraCortadaM3 !== null
        ? redondea(((m3Bloque - piedraCortadaM3) / m3Bloque) * 100, 1)
        : null;
    // Rendimiento BRUTO (sin anular por incompatibilidad) frente al techo 1/grosor.
    const rendBruto = m2Parte !== null && m3Bloque !== null && m3Bloque > 0 ? m2Parte / m3Bloque : null;
    const rendimientoSobreTechoPct =
      rendBruto !== null && techoRendimientoM2M3 !== null && techoRendimientoM2M3 > 0
        ? redondea((rendBruto / techoRendimientoM2M3) * 100, 0)
        : null;
    // Medidas de consola distintas durante el corte (>1 = la consola arrastró ruido).
    const medidasConsola = this.medidasConsolaDe(
      lecturas,
      run,
      telarId,
      loteBloqueAnterior,
      coincidenciasPorMedida,
    );
    const consolaMedidasDistintas = medidasConsola.length;
    const partes = this.partesBloqueDudoso(partesRelacionados, telarId, nombres);
    const diagnostico = this.diagnosticoBloqueDudoso(
      ciclo,
      medidasConsola,
      lecturas,
      partes,
      piedraCortadaM3,
      rendimientoSobreTechoPct,
    );
    const lineaTiempo = this.lineaTiempoBloqueDudoso(lecturas, partes);
    return {
      id: ciclo.id,
      pmLote: ciclo.pmLote,
      telarId,
      telarNombre: NOMBRES_TELAR.get(telarId) ?? `Telar ${telarId}`,
      inicioCorte: ciclo.inicioCorte,
      finCorte: ciclo.finCorte,
      enCurso: ciclo.enCurso,
      materialId: ciclo.bloque.materialId,
      operarios,
      motivos: motivosDeBloqueDudoso(ciclo),
      medidasIncoherentes: ciclo.medidasIncoherentes,
      volumenIncompatibleParte: ciclo.volumenIncompatibleParte,
      volumenImposible: ciclo.volumenImposible,
      pmDuplicado: ciclo.pmDuplicado,
      parteEnOtroTelar: ciclo.parteEnOtroTelar,
      diagnostico,
      inventario: inv
        ? {
            fuente: inv.fuente,
            proveedor: inv.proveedor,
            fabrica: inv.fabrica,
            mermaPct: inv.mermaPct,
            bloques: inv.bloques,
          }
        : null,
      consola,
      loteBloqueAnterior,
      medidasConsola,
      horasMarcha: ciclo.horasMarcha,
      horasParo: ciclo.horasParo,
      numParos: ciclo.numParos,
      numLecturas: lecturas.length,
      numLecturasConAlertas: lecturas.filter((l) => l.lectura.alertas.length > 0).length,
      numLecturasSospechosas: lecturas.filter((l) => l.lectura.sospechosa).length,
      paquetes: ciclo.paquetes,
      partes,
      espesorCorteCm: ciclo.espesorCorteCm,
      volumenInventarioM3: ciclo.volumenM3,
      rendimientoM2M3: ciclo.rendimientoM2M3,
      tablasPrevistas: ciclo.tablasPrevistas,
      m2Previstos: ciclo.m2Previstos,
      piedraCortadaM3,
      mermaAserradoPct,
      techoRendimientoM2M3,
      rendimientoSobreTechoPct,
      consolaMedidasDistintas,
      consolaInestable: consolaMedidasDistintas > 1,
      lecturas,
      lineaTiempo,
    };
  }

  private partesBloqueDudoso(
    filas: FilaParte[],
    telarRun: number,
    nombres: Map<number, string>,
  ): ParteTrabajoBloqueDudoso[] {
    return filas
      .slice()
      .sort((a, b) => (fechaParteMs(a) ?? 0) - (fechaParteMs(b) ?? 0))
      .map((fila) => {
        const etiquetas = etiquetaParteTrabajo(fila);
        const telarId = fila.nTelar != null ? Number(fila.nTelar) : null;
        return {
          id: Number(fila.id),
          telarId,
          fechaHora: fechaParteMs(fila) !== null ? new Date(fechaParteMs(fila)!).toISOString() : null,
          operacionCodigo: fila.operacion ?? null,
          operacionEtiqueta: etiquetas.operacion,
          accionCodigo: fila.accion ?? null,
          accionEtiqueta: etiquetas.accion,
          pmLote: fila.nBloque ?? null,
          esDelTelarDelRun: telarId === telarRun,
          paquetes: fila.operacion === '4' ? resumenDePartes([fila]) : null,
          operario1: this.nombreOperario(
            fila.operario1 != null ? String(fila.operario1) : null,
            nombres,
          ),
          operario2: this.nombreOperario(
            fila.operario2 != null ? String(fila.operario2) : null,
            nombres,
          ),
          materialId: fila.material != null ? String(fila.material) : null,
        };
      });
  }

  private medidasConsolaDe(
    lecturas: LecturaBloqueDudosa[],
    run: RunBloque,
    telarId: number,
    loteBloqueAnterior: number | null,
    coincidenciasPorMedida: Map<string, CoincidenciaMedidaConsola[]>,
  ): MedidaConsolaDudosa[] {
    const porClave = new Map<
      string,
      {
        largoCm: number;
        altoCm: number;
        gruesoCm: number;
        primeraLectura: string;
        ultimaLectura: string;
        lecturas: number;
      }
    >();
    for (const lectura of lecturas) {
      const clave = claveMedidaConsolaCm(lectura.largoCm, lectura.altoCm, lectura.gruesoCm);
      if (clave === null) {
        continue;
      }
      const previa = porClave.get(clave);
      if (previa) {
        previa.ultimaLectura = lectura.lectura.recibidaEn;
        previa.lecturas += 1;
      } else {
        porClave.set(clave, {
          largoCm: lectura.largoCm,
          altoCm: lectura.altoCm,
          gruesoCm: lectura.gruesoCm,
          primeraLectura: lectura.lectura.recibidaEn,
          ultimaLectura: lectura.lectura.recibidaEn,
          lecturas: 1,
        });
      }
    }
    const inicioRun = new Date(run.desdeMs).toISOString();
    return [...porClave.entries()]
      .map(([clave, m]) => {
        const coincidencias = (coincidenciasPorMedida.get(clave) ?? [])
          .filter(
            (c) =>
              !(
                c.pmLote === run.bloque &&
                c.telarId === telarId &&
                c.inicioCorte === inicioRun
              ),
          )
          .map((c) => ({
            ...c,
            esBloqueAnterior: c.pmLote === loteBloqueAnterior && c.telarId === telarId,
          }))
          .sort((a, b) => Number(b.esBloqueAnterior) - Number(a.esBloqueAnterior));
        return {
          clave,
          largoCm: m.largoCm,
          altoCm: m.altoCm,
          gruesoCm: m.gruesoCm,
          medida: medidaFuente(m.largoCm, m.altoCm, m.gruesoCm),
          primeraLectura: m.primeraLectura,
          ultimaLectura: m.ultimaLectura,
          lecturas: m.lecturas,
          coincideConLoteAnterior: coincidencias.some((c) => c.esBloqueAnterior),
          coincidencias,
        };
      })
      .sort((a, b) => epoch(a.primeraLectura) - epoch(b.primeraLectura));
  }

  private diagnosticoBloqueDudoso(
    ciclo: CicloBloque,
    medidasConsola: MedidaConsolaDudosa[],
    lecturas: LecturaBloqueDudosa[],
    partes: ParteTrabajoBloqueDudoso[],
    piedraCortadaM3: number | null,
    rendimientoSobreTechoPct: number | null,
  ): DiagnosticoBloqueDudoso {
    const medidaAnterior = medidasConsola.find((m) => m.coincideConLoteAnterior);
    const revisarConsola = ['telar/consola', 'produccion_mapeada'];
    if (ciclo.parteEnOtroTelar) {
      const parteOtroTelar = partes.find((p) => !p.esDelTelarDelRun && p.operacionCodigo === '4');
      return {
        origen: 'lote-equivocado',
        etiqueta: 'Numero de lote equivocado o PM heredada',
        tono: 'mal',
        evidencia: parteOtroTelar
          ? `El parte de paquetes de la PM consta en el telar ${parteOtroTelar.telarId}, no en el telar ${ciclo.telarId}.`
          : 'El parte de aserrado de la PM consta en otro telar y este run no tiene parte propio.',
        revisarEn: [...revisarConsola, 'parte_trabajo_mapeada'],
      };
    }
    if (ciclo.volumenIncompatibleParte) {
      return {
        origen: 'inventario-parte',
        etiqueta: 'Medida de inventario o parte incompatible',
        tono: 'mal',
        evidencia:
          piedraCortadaM3 !== null && ciclo.volumenM3 !== null
            ? `El parte implica ${piedraCortadaM3} m3 de piedra y el inventario declara ${ciclo.volumenM3} m3.`
            : 'El m3 del inventario no permite la piedra cortada que declara el parte.',
        revisarEn: ['lot_block_creation', 'stock_lot', 'parte_trabajo_mapeada', 'Odoo'],
      };
    }
    if (ciclo.volumenImposible) {
      return {
        origen: 'inventario-parte',
        etiqueta: 'Medida de inventario no utilizable',
        tono: 'mal',
        evidencia: 'La medida del inventario queda fuera de rango fisico tras normalizar cm/m.',
        revisarEn: ['lot_block_creation', 'stock_lot', 'Odoo'],
      };
    }
    if (ciclo.pmDuplicado) {
      return {
        origen: 'interpretacion-bd',
        etiqueta: 'Identidad PM duplicada',
        tono: 'mal',
        evidencia: `El PM aparece en ${ciclo.bloquesEnLote ?? 'varias'} filas de inventario; no se sabe que medida usar.`,
        revisarEn: ['lot_block_creation', 'stock_lot', 'Odoo'],
      };
    }
    if (medidaAnterior) {
      const anterior = medidaAnterior.coincidencias.find((c) => c.esBloqueAnterior);
      return {
        origen: 'operario-consola',
        etiqueta: 'Consola no actualizada / datos arrastrados',
        tono: 'aviso',
        evidencia: anterior
          ? `La consola emitio ${etiquetaMedidaCm(
              medidaAnterior.largoCm,
              medidaAnterior.altoCm,
              medidaAnterior.gruesoCm,
            )}, la misma medida que el lote anterior ${anterior.pmLote}.`
          : 'Una medida de consola coincide con el lote anterior.',
        revisarEn: revisarConsola,
      };
    }
    if (ciclo.medidasIncoherentes) {
      return {
        origen: 'operario-consola',
        etiqueta: 'Valores de consola incompatibles con el parte',
        tono: 'aviso',
        evidencia: 'La medida tecleada en el telar no encaja geometricamente con las tablas del parte.',
        revisarEn: [...revisarConsola, 'parte_trabajo_mapeada'],
      };
    }
    const alertas = lecturas.filter((l) => l.lectura.alertas.length > 0).length;
    const sospechosas = lecturas.filter((l) => l.lectura.sospechosa).length;
    const gap = this.maxGapMin(lecturas);
    const muchasAlertas =
      alertas >= Math.max(3, Math.ceil(Math.max(lecturas.length, 1) * 0.25));
    if (sospechosas > 0 || muchasAlertas || gap > HUECO_MAX_MS / 60_000) {
      return {
        origen: 'plc-lecturas',
        etiqueta: 'Posible fallo PLC / captura',
        tono: 'aviso',
        evidencia: `${alertas} lecturas con avisos, ${sospechosas} en cuarentena y hueco maximo ${redondea(gap, 0)} min.`,
        revisarEn: ['PLC/telar', 'produccion_mapeada'],
      };
    }
    if (rendimientoSobreTechoPct !== null && rendimientoSobreTechoPct <= 100) {
      return {
        origen: 'sin-determinar',
        etiqueta: 'Sin determinar',
        tono: 'ok',
        evidencia: 'La coherencia fisica no demuestra una contradiccion; hace falta revisar el origen manualmente.',
        revisarEn: ['telar/consola', 'parte_trabajo_mapeada', 'lot_block_creation'],
      };
    }
    return {
      origen: 'sin-determinar',
      etiqueta: 'Sin determinar',
      tono: 'aviso',
      evidencia: 'Las senales actuales no bastan para asignar un origen probable.',
      revisarEn: ['telar/consola', 'produccion_mapeada', 'parte_trabajo_mapeada', 'Odoo'],
    };
  }

  private maxGapMin(lecturas: LecturaBloqueDudosa[]): number {
    let max = 0;
    for (let i = 1; i < lecturas.length; i++) {
      max = Math.max(max, (epoch(lecturas[i].lectura.recibidaEn) - epoch(lecturas[i - 1].lectura.recibidaEn)) / 60_000);
    }
    return max;
  }

  private lineaTiempoBloqueDudoso(
    lecturas: LecturaBloqueDudosa[],
    partes: ParteTrabajoBloqueDudoso[],
  ): EventoTimelineBloqueDudoso[] {
    let clavePrevia: string | null = null;
    const eventosLectura = lecturas.map((l) => {
      const clave = claveMedidaConsolaCm(l.largoCm, l.altoCm, l.gruesoCm);
      const medidaCambio = clave !== null && clavePrevia !== null && clave !== clavePrevia;
      if (clave !== null) {
        clavePrevia = clave;
      }
      const tono: EventoTimelineBloqueDudoso['tono'] = l.lectura.sospechosa
        ? 'mal'
        : l.lectura.alertas.length > 0
          ? 'aviso'
          : 'ok';
      const medida = clave === null ? 'sin medida de consola' : etiquetaMedidaCm(l.largoCm, l.altoCm, l.gruesoCm);
      return {
        tipo: 'lectura' as const,
        fechaHora: l.lectura.recibidaEn,
        titulo: medidaCambio
          ? 'Cambio de medida de consola'
          : `Lectura: ${ETIQUETA_INCIDENCIA_BACKEND[l.lectura.incidencia]}`,
        detalle: `${medida} · ${l.lectura.potenciaKw} kW · ${l.lectura.alturaActualMm} mm`,
        tono,
        medidaCambio,
        lecturaId: l.lectura.id,
        parteId: null,
      };
    });
    const eventosParte = partes
      .filter((p) => p.fechaHora !== null)
      .map((p) => {
        const resumen = p.paquetes
          ? `${p.paquetes.numTablas} tablas · ${p.paquetes.metrosCuadrados} m2`
          : p.accionEtiqueta ?? '';
        return {
          tipo: 'parte' as const,
          fechaHora: p.fechaHora!,
          titulo: `Parte: ${p.operacionEtiqueta}`,
          detalle: `T${p.telarId ?? '?'}${resumen ? ` · ${resumen}` : ''}`,
          tono: p.esDelTelarDelRun ? 'ok' : 'aviso',
          medidaCambio: false,
          lecturaId: null,
          parteId: p.id,
        } satisfies EventoTimelineBloqueDudoso;
      });
    return [...eventosLectura, ...eventosParte].sort((a, b) => {
      const t = epoch(a.fechaHora) - epoch(b.fechaHora);
      return t !== 0 ? t : a.tipo.localeCompare(b.tipo);
    });
  }

  private aCicloBloque(
    run: RunBloque,
    ahora: number,
    enCurso: boolean,
    paquetes: ResumenPaquetes | null = null,
    loteInv: LoteInventario | null = null,
    parteEnOtroTelar = false,
  ): CicloBloque {
    const minutos = minutosPorIncidencia(run.lecturas, Math.min(run.hastaMs, ahora));
    const tramos = tramosDeParo(run.lecturas, Math.min(run.hastaMs, ahora));
    const bloque = this.bloqueDeRun(run);
    const m2 = m2PrevistosDe(bloque.medidasFabrica);
    // m³ del lote desde la MEDIDA REAL del inventario por PM (no la de consola,
    // que hereda del bloque anterior = ruido). null si el PM no está dado de
    // alta en inventario, si su medida es imposible aun tras normalizar cm→m
    // (corrupción real) o si el PM está duplicado (error de identidad: la PM
    // debe ser única, así que no se sabe la medida del bloque): no se muestra
    // un m³ que sabemos no fiable. La medida de consola (bloque.medidasFabrica)
    // se queda solo como punto de control (medidasIncoherentes).
    const volumenImposible = loteInv ? loteInv.imposible : false;
    const pmDuplicado = loteInv ? loteInv.duplicado : false;
    const volumenM3 =
      loteInv && !volumenImposible && !pmDuplicado ? loteInv.volumenM3 : null;
    // Cruce físico m³ ↔ parte: el m³ del inventario no puede ser menor que la
    // piedra que salió en tabla (m² × espesor). Si lo es, uno de los dos datos es
    // erróneo (m³ del alta infradimensionado o m² de otro corte cruzado al lote);
    // no se decide cuál, basta con que sean incompatibles. Es una corrupción que
    // volumenImposible no ve (cada dimensión suelta es plausible) y que daría un
    // rendimiento por encima del techo físico 1/espesor (caso PM 47156: 110 m²/m³
    // a 2 cm). El m³ se mantiene visible (lo que dice el inventario), marcado ⚠.
    const volumenIncompatibleParte =
      paquetes !== null &&
      volumenMenorQuePiedraCortada(volumenM3, paquetes.metrosCuadrados, paquetes.gruesoTablaM);
    // Rendimiento solo con parte real sobre un m³ real y compatible con el parte.
    const rendimientoM2M3 =
      paquetes !== null && volumenM3 !== null && volumenM3 > 0 && !volumenIncompatibleParte
        ? redondea(paquetes.metrosCuadrados / volumenM3, 2)
        : null;
    // Espesor de corte real del parte (grueso de tabla); null sin parte (no se
    // asume el 2 cm de la estimación). Ver fabric.types.ts/CicloBloque.
    const espesorCorteCm =
      paquetes !== null && paquetes.gruesoTablaM > 0
        ? redondea(paquetes.gruesoTablaM * 100, 1)
        : null;
    return {
      id: `${run.telarId}-${run.bloque}-${run.desdeMs}`,
      telarId: run.telarId,
      bloque,
      pmLote: run.bloque,
      colocacion: new Date(run.desdeMs).toISOString(),
      inicioCorte: new Date(run.desdeMs).toISOString(),
      finCorte: enCurso ? null : new Date(run.hastaMs).toISOString(),
      // Paquetes reales del cruce con parte_trabajo_mapeada (si hay parte).
      paquetes,
      horasMarcha: redondea((minutosDe(minutos, enMarcha)) / 60),
      horasParo: redondea((minutosDe(minutos, enParo)) / 60),
      numParos: tramos.length,
      // Estimación (la UI la marca con "prev." / "≈").
      tablasPrevistas: tablasPrevistasDe(bloque.medidasFabrica),
      m2Previstos: m2 !== null ? redondea(m2) : null,
      espesorCorteCm,
      volumenM3,
      rendimientoM2M3,
      bloquesEnLote: loteInv ? loteInv.bloques : null,
      volumenEstimado: loteInv ? loteInv.estimado : false,
      pmDuplicado,
      volumenImposible,
      volumenIncompatibleParte,
      mermaVolumenPct: null,
      enCurso,
      medidasIncoherentes:
        paquetes !== null && medidasIncompatiblesConParte(bloque.medidasFabrica, paquetes),
      parteEnOtroTelar,
    };
  }

  private bloqueDeRun(run: RunBloque): Bloque {
    // Dimensiones: última lectura del run con medidas > 0 (unidad asumida cm).
    // Las columnas no distinguen proveedor/fábrica: se exponen iguales y la
    // merma queda en null (sin segunda medida no hay comparación posible).
    let medidas = { largoCm: 0, altoCm: 0, gruesoCm: 0 };
    let materialLectura: string | null = null;
    for (const lectura of run.lecturas) {
      if (lectura.largoCm > 0 && lectura.altoCm > 0 && lectura.gruesoCm > 0) {
        medidas = {
          largoCm: lectura.largoCm,
          altoCm: lectura.altoCm,
          gruesoCm: lectura.gruesoCm,
        };
      }
      if (lectura.materialCodigo !== null) {
        materialLectura = lectura.materialCodigo;
      }
    }
    // Material del BLOQUE: lo aporta el parte de operario (fiable por bloque);
    // la lectura del telar solo vale de respaldo si ese telar NO está estancado
    // (telares 1 y 2 traen el material clavado). Sin ninguna fuente fiable →
    // 'desconocido', nunca el valor clavado (no inventar). Ver MaterialesBloque.
    const delParte = this.materialesActual.porBloque.get(`${run.telarId}-${run.bloque}`);
    const lecturaFiable =
      materialLectura !== null && !this.materialesActual.estancados.has(run.telarId)
        ? materialLectura
        : null;
    return {
      numero: run.bloque,
      pmLote: run.bloque,
      materialId: delParte ?? lecturaFiable ?? 'desconocido',
      medidasProveedor: medidas,
      medidasFabrica: medidas,
    };
  }

  private snapshotTelar(
    telarId: number,
    lecturas: LecturaInterna[],
    ahora: number,
    nombres: Map<number, string>,
    ultimaLecturaEnExterna?: string | null,
    actividadParte: ActividadParte | null = null,
  ): SnapshotTelar {
    const validas = lecturas.filter(
      (l) => !l.sospechosa && epoch(l.recibidaEn) <= ahora + UMBRAL_SIN_DATOS_MS,
    );
    const ultimaValida = validas.length > 0 ? validas[validas.length - 1] : null;
    const ultimaCualquiera = lecturas.length > 0 ? lecturas[lecturas.length - 1] : null;

    // "Hace cuánto" llegó el último dato, SIEMPRE (fresco o no). Prioriza la
    // marca externa (consulta sin límite de ventana, para telares callados
    // semanas); si no, la última lectura cargada en la ventana del snapshot.
    const ultimaLecturaEn =
      ultimaLecturaEnExterna ?? ultimaCualquiera?.recibidaEn ?? null;

    // "Sin señal" significa que NO llegan lecturas. El estado sale de la
    // última lectura RECIBIDA aunque esté en cuarentena (p. ej. el telar 4
    // emite con el consumo congelado y quedaría siempre "sin señal" siendo
    // falso): el badge de datos sospechosos ya avisa, y las métricas
    // derivadas (progreso, ETA, series) siguen usando solo lecturas fiables.
    // El umbral es de valor absoluto: una lectura FUTURA (reloj de consola
    // corrupto en una fila sin create_date) cumpliría `ahora - t ≤ umbral`
    // durante horas y dejaría el estado congelado en su incidencia.
    // Hasta 1 h (UMBRAL_PAUSA_MS) se mantiene el último estado operativo; más
    // allá, la máquina queda "sin lectura reciente" y la UI la pinta "En pausa"
    // (o "Descansando" pasadas 24 h).
    const esReciente = (l: LecturaTelar | null): l is LecturaTelar =>
      l !== null && Math.abs(ahora - epoch(l.recibidaEn)) <= UMBRAL_PAUSA_MS;
    const referencia = esReciente(ultimaValida)
      ? ultimaValida
      : esReciente(ultimaCualquiera)
        ? ultimaCualquiera
        : null;

    let estado: EstadoTelar = 'sin-datos';
    if (referencia) {
      estado = mapearEstado(referencia.incidencia);
    }

    // El bloque actual se identifica sobre TODAS las lecturas recibidas:
    // n_bloque/medidas/material son columnas crudas que una cuarentena por
    // otro campo (p. ej. consumo congelado) no invalida. Las métricas de
    // altura, en cambio, solo se calculan con lecturas fiables del run.
    const runs = derivarRuns(
      lecturas.filter((l) => epoch(l.recibidaEn) <= ahora + UMBRAL_SIN_DATOS_MS),
    );
    const runActual = this.runActual(runs, ahora);
    const bloque = runActual ? this.bloqueDeRun(runActual) : null;
    const validasRun = runActual
      ? runActual.lecturas.filter((l) => !l.sospechosa)
      : [];

    const alturaInicial = validasRun.length > 0 ? validasRun[0].alturaActualMm : null;
    const alturaActual =
      validasRun.length > 0 ? validasRun[validasRun.length - 1].alturaActualMm : null;

    // Avance: (altura 1ª lectura del bloque − altura actual) / altura 1ª.
    // Solo cuando la serie es físicamente coherente (desciende).
    let progresoPct: number | null = null;
    if (
      runActual &&
      alturaInicial !== null &&
      alturaActual !== null &&
      alturaInicial > 0 &&
      alturaActual <= alturaInicial
    ) {
      progresoPct = Math.min(100, ((alturaInicial - alturaActual) / alturaInicial) * 100);
    }

    // ETA: altura restante / velocidad consignada (mm ÷ mm/h).
    const ultimaValidaRun =
      validasRun.length > 0 ? validasRun[validasRun.length - 1] : null;
    const etaFinCorte =
      estado === 'marcha' &&
      alturaActual !== null &&
      ultimaValidaRun !== null &&
      ultimaValidaRun.velocidadMmH > 0
        ? new Date(
            ahora + (alturaActual / ultimaValidaRun.velocidadMmH) * 3_600_000,
          ).toISOString()
        : null;

    return {
      telarId,
      nombre: NOMBRES_TELAR.get(telarId) ?? `Telar ${telarId}`,
      estado,
      estadoDesde: this.inicioEstadoActual(validas, estado),
      causaParo:
        estado === 'paro' || estado === 'incidencia' || estado === 'cambio-bloque'
          ? (referencia?.incidencia ?? null)
          : null,
      actividadParte,
      bloque,
      ultimaLectura: referencia,
      ultimaLecturaEn,
      alturaInicialMm: alturaInicial,
      progresoPct,
      etaFinCorte,
      // Estimación etiquetada en la UI (espesor + kerf supuestos).
      tablasPrevistas: bloque ? tablasPrevistasDe(bloque.medidasFabrica) : null,
      m2Previstos:
        bloque && m2PrevistosDe(bloque.medidasFabrica) !== null
          ? redondea(m2PrevistosDe(bloque.medidasFabrica)!)
          : null,
      desvioRitmo: this.desvioRitmo(runActual),
      turno: turnoDe(ahora),
      // Nombres reales de hr_employee; si no se resuelve, el código.
      operario1: this.nombreOperario(referencia?.operario1 ?? null, nombres),
      operario2: this.nombreOperario(referencia?.operario2 ?? null, nombres),
      seriePotencia: validas
        .filter((l) => epoch(l.recibidaEn) >= ahora - 2 * 3_600_000)
        .map((l): PuntoSerie => ({ t: l.recibidaEn, v: l.potenciaKw })),
      datosSospechosos: lecturas.some(
        (l) => l.sospechosa && epoch(l.recibidaEn) >= ahora - 86_400_000,
      ),
      datosConAvisos: lecturas.some(
        (l) =>
          !l.sospechosa &&
          l.alertas.length > 0 &&
          epoch(l.recibidaEn) >= ahora - 86_400_000,
      ),
    };
  }

  private inicioEstadoActual(validas: LecturaTelar[], estado: EstadoTelar): string | null {
    if (validas.length === 0 || estado === 'sin-datos') {
      return null;
    }
    let inicio: string | null = null;
    for (let i = validas.length - 1; i >= 0; i--) {
      if (mapearEstado(validas[i].incidencia) !== estado) {
        break;
      }
      if (inicio && epoch(inicio) - epoch(validas[i].recibidaEn) > UMBRAL_SIN_DATOS_MS) {
        break;
      }
      inicio = validas[i].recibidaEn;
    }
    return inicio;
  }

  /** Ritmo real (Δaltura/Δt) frente a la velocidad consignada en la máquina. */
  private desvioRitmo(runActual: RunBloque | null): DesvioRitmo | null {
    if (!runActual) {
      return null;
    }
    const ventana = runActual.lecturas.filter((l) => !l.sospechosa).slice(-6);
    if (ventana.length < 3 || ventana.some((l) => l.incidencia !== 'marcha')) {
      return null;
    }
    const primera = ventana[0];
    const ultima = ventana[ventana.length - 1];
    const consigna = ultima.velocidadMmH;
    const deltaHoras = (epoch(ultima.recibidaEn) - epoch(primera.recibidaEn)) / 3_600_000;
    if (deltaHoras <= 0 || consigna <= 0) {
      return null;
    }
    const realMmH = (primera.alturaActualMm - ultima.alturaActualMm) / deltaHoras;
    return {
      consignaMmH: consigna,
      realMmH: Math.round(realMmH),
      desvioPct: redondea(((realMmH - consigna) / consigna) * 100),
    };
  }

  private disponibilidadTurno(validas: LecturaTelar[], ahora: number): number | null {
    const inicioTurno = this.inicioTurno(ahora);
    const minutosTurno = (ahora - inicioTurno) / 60_000;
    if (minutosTurno < 10) {
      return null;
    }
    const delTurno = validas.filter((l) => epoch(l.recibidaEn) >= inicioTurno);
    const minutos = minutosPorIncidencia(delTurno, ahora);
    return Math.min(100, ((minutosDe(minutos, enMarcha)) / minutosTurno) * 100);
  }

  private inicioTurno(ahora: number): number {
    const fecha = new Date(ahora);
    const hora = fecha.getHours();
    const dia = inicioDia(ahora);
    if (hora >= 6 && hora < 14) {
      return dia + 6 * 3_600_000;
    }
    if (hora >= 14 && hora < 22) {
      return dia + 14 * 3_600_000;
    }
    return hora >= 22 ? dia + 22 * 3_600_000 : dia - 2 * 3_600_000;
  }

  private kpisPlanta(
    telares: SnapshotTelar[],
    porTelar: Map<number, LecturaInterna[]>,
    ahora: number,
    completadosHoy: { telarId: number; run: RunBloque }[],
    partesHoy: FilaParte[],
  ): KpisPlanta {
    const desdeDia = inicioDia(ahora);
    let parosHoy = 0;
    let minutosParo = 0;
    for (const telarId of TELAR_IDS) {
      const validasHoy = (porTelar.get(telarId) ?? []).filter(
        (l) => !l.sospechosa && epoch(l.recibidaEn) >= desdeDia,
      );
      const tramos = tramosDeParo(validasHoy, ahora);
      parosHoy += tramos.length;
      minutosParo += tramos.reduce((suma, t) => suma + t.minutos, 0);
    }

    // m²/tablas REALES de los partes de paquetes de los bloques terminados
    // hoy; estimación solo donde falta el parte.
    const partesPorClave = new Map<string, FilaParte[]>();
    for (const fila of partesHoy) {
      if (fila.nBloque === null || fila.nTelar === null) {
        continue;
      }
      const clave = claveBloque(fila.nTelar, fila.nBloque);
      if (!partesPorClave.has(clave)) {
        partesPorClave.set(clave, []);
      }
      partesPorClave.get(clave)!.push(fila);
    }
    let m2Hoy = 0;
    let tablasHoy = 0;
    for (const { telarId, run } of completadosHoy) {
      const delBloque = partesDeVentana(
        partesPorClave.get(claveBloque(telarId, run.bloque)) ?? [],
        run.desdeMs,
        run.hastaMs,
      );
      const paquetes = delBloque.length > 0 ? resumenDePartes(delBloque) : null;
      const medidas = this.bloqueDeRun(run).medidasFabrica;
      m2Hoy += paquetes?.metrosCuadrados ?? m2PrevistosDe(medidas) ?? 0;
      tablasHoy += paquetes?.numTablas ?? tablasPrevistasDe(medidas) ?? 0;
    }

    return {
      telaresCortando: telares.filter((t) => t.estado === 'marcha').length,
      telaresTotales: TELAR_IDS.length,
      // El denominador de utilización (¿24 h? ¿turnos?) es una decisión de
      // negocio pendiente (VERIFICACION.md): sin definirla, sin número.
      utilizacionHoyPct: null,
      m2Hoy: redondea(m2Hoy),
      tablasHoy,
      parosHoy,
      minutosParoHoy: Math.round(minutosParo),
      minutosRoturaHoy: null,
    };
  }

  private estadisticasTelar(
    telarId: number,
    validas: LecturaInterna[],
    ahora: number,
  ): EstadisticasTelar {
    const minutos = minutosPorIncidencia(validas, ahora);
    const minutosMarcha = minutosDe(minutos, enMarcha);
    const minutosParo = minutosDe(minutos, enParo);
    const minutosCambio = minutos.get('cambio-bloque') ?? 0;
    const minutosTotales = minutosMarcha + minutosParo + minutosCambio;

    const tramos = tramosDeParo(validas, ahora);
    // Una entrada por causa de paro presente (paro genérico, rotura de material…);
    // 'paro' se muestra siempre aunque sea 0, para no esconder el KPI.
    const parosPorCausa: ParoPorCausa[] = INCIDENCIAS_PARO.map((causa) => {
      const deCausa = tramos.filter((t) => t.causa === causa);
      return {
        causa,
        minutos: Math.round(deCausa.reduce((s, t) => s + t.minutos, 0)),
        numero: deCausa.length,
      };
    }).filter((p) => p.causa === 'paro' || p.numero > 0);

    const runs = derivarRuns(validas);
    const actual = this.runActual(runs, ahora);
    const completados = runs.filter((r) => r !== actual).length;

    const marcha = validas.filter((l) => enMarcha(l.incidencia));
    return {
      telarId,
      nombre: NOMBRES_TELAR.get(telarId) ?? `Telar ${telarId}`,
      pctMarcha: minutosTotales > 0 ? (minutosMarcha / minutosTotales) * 100 : 0,
      pctParo: minutosTotales > 0 ? (minutosParo / minutosTotales) * 100 : 0,
      pctCambioBloque: minutosTotales > 0 ? (minutosCambio / minutosTotales) * 100 : 0,
      horasMarcha: redondea(minutosMarcha / 60),
      horasParo: redondea(minutosParo / 60),
      horasCambioBloque: redondea(minutosCambio / 60),
      m2: null,
      tablas: null,
      bloquesCompletados: completados,
      golpesMedios: Math.round(media(marcha.map((l) => l.golpesPorMinuto))),
      velocidadMediaMmH: Math.round(
        media(marcha.filter((l) => l.velocidadMmH > 0).map((l) => l.velocidadMmH)),
      ),
      amperiosMedios: Math.round(media(marcha.map((l) => l.amperios))),
      // Consumo eléctrico medio en marcha (kW); null si el telar no tuvo
      // lecturas en marcha en el rango (sin base, no se inventa un 0).
      potenciaMediaKw:
        marcha.length > 0 ? redondea(media(marcha.map((l) => l.potenciaKw)), 1) : null,
      parosPorCausa,
    };
  }
}
