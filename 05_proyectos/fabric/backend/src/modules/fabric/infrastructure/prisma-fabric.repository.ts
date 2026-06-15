import { Injectable } from '@nestjs/common';
import {
  ParteTrabajoMapeada as FilaParte,
  ProduccionMapeada as FilaProduccion,
} from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/database/prisma/prisma.service';
import {
  bloqueImposible,
  volumenBloqueM3,
  volumenMenorQuePiedraCortada,
} from '../../../shared/domain/medidas-bloque';
import { FabricRepository } from '../domain/fabric.repository';
import {
  Bloque,
  CicloBloque,
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
  LecturaCuarentena,
  LecturaTelar,
  Medidas,
  PaginaPartes,
  ParoPorCausa,
  ProduccionDia,
  ProduccionMaterial,
  ProduccionOperario,
  PuntoSerie,
  RangoEstadisticas,
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
 *  - Códigos de `incidencia`: '1'→marcha (velocidad media ~100 mm/h),
 *    '2'→paro (velocidad ~0). '3'/'4'/'5' sin tabla de significados →
 *    'desconocida' (cuarentena). '0' (todo el telar 4) no trae código:
 *    se infiere marcha/paro por física (potencia ≥ 10 kW → marcha).
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
const TOLERANCIA_FECHA_MS = 15 * 60_000;
const VELOCIDAD_MAX_MM_H = 310;
const SUBIDA_TOLERADA_MM = 30;
const GOLPES_MIN = 700;
const GOLPES_MAX = 1000;
const POTENCIA_MAX_KW = 76;
const ALTURA_BASTIDOR_REPOSO_MM = 2150;

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

/** Mapeo de códigos reales de incidencia (inferencia documentada arriba). */
function incidenciaDeCodigo(codigo: string | null, potencia: number): TipoIncidencia {
  switch ((codigo ?? '').trim()) {
    case '1':
      return 'marcha';
    case '2':
      return 'paro';
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
      return 'marcha';
    case 'rotura-fleje':
      return 'incidencia';
    case 'cambio-bloque':
      return 'cambio-bloque';
    default:
      return 'paro';
  }
}

/**
 * Validador de calidad portado del frontend (validador.ts) con las reglas
 * aplicables a los datos reales. Marca in situ `sospechosa`/`motivosSospecha`.
 */
function validarLecturas(lecturas: LecturaTelar[], codigos: string[]): void {
  // Coherencia de altura contra la lectura INMEDIATAMENTE anterior del mismo
  // bloque (válida o no): comparar solo contra la última válida encadena en
  // cascada — p. ej. el telar 4 congela la altura en 0 al parar y, al
  // arrancar, todas las lecturas posteriores quedarían marcadas para siempre.
  let previa: LecturaTelar | null = null;

  lecturas.forEach((lectura, i) => {
    const motivos: string[] = [];
    const declarada = epoch(lectura.fechaHora);
    const recibida = epoch(lectura.recibidaEn);

    if (Number.isNaN(declarada) || Math.abs(declarada - recibida) > TOLERANCIA_FECHA_MS) {
      motivos.push(
        `Fecha declarada (${lectura.fechaHora}) alejada de la recepción (${lectura.recibidaEn})`,
      );
    }

    if (lectura.incidencia === 'desconocida') {
      motivos.push(`Incidencia sin mapear (código ${codigos[i]})`);
    }

    if (lectura.potenciaKw > POTENCIA_MAX_KW || lectura.potenciaKw < 0) {
      motivos.push(`Potencia fuera de rango (${lectura.potenciaKw} kW)`);
    } else if (lectura.potenciaKw > 5) {
      const esperado = lectura.potenciaKw * 2;
      if (Math.abs(lectura.amperios - esperado) > esperado * 0.35) {
        motivos.push(
          `Consumo desacoplado de la potencia (${lectura.amperios} A con ${lectura.potenciaKw} kW)`,
        );
      }
    } else if (lectura.amperios > lectura.potenciaKw * 2 + 8) {
      motivos.push(
        `Consumo sin potencia que lo justifique (${lectura.amperios} A con ${lectura.potenciaKw} kW)`,
      );
    }

    if (
      lectura.golpesPorMinuto !== 0 &&
      (lectura.golpesPorMinuto < GOLPES_MIN || lectura.golpesPorMinuto > GOLPES_MAX)
    ) {
      motivos.push(`Golpes fuera de rango (${lectura.golpesPorMinuto} golpes/min)`);
    }

    if (lectura.velocidadMmH > VELOCIDAD_MAX_MM_H || lectura.velocidadMmH < 0) {
      motivos.push(`Velocidad fuera de rango (${lectura.velocidadMmH} mm/h)`);
    }

    if (lectura.alturaActualMm > ALTURA_BASTIDOR_REPOSO_MM + 100) {
      motivos.push(
        `Altura por encima del tope físico del bastidor (${Math.round(lectura.alturaActualMm)} mm)`,
      );
    }

    if (previa && lectura.bloque !== null && previa.bloque === lectura.bloque) {
      const deltaAltura = lectura.alturaActualMm - previa.alturaActualMm;
      const deltaHoras = (recibida - epoch(previa.recibidaEn)) / 3_600_000;
      // Solo en pleno corte: parado, algunos telares dejan la altura a 0 y
      // el salto al arrancar/parar no es un descenso de corte.
      if (lectura.incidencia === 'marcha' && previa.incidencia === 'marcha') {
        if (deltaAltura > SUBIDA_TOLERADA_MM) {
          motivos.push(`La altura del bastidor sube ${Math.round(deltaAltura)} mm en pleno corte`);
        } else if (
          deltaHoras > 0 &&
          -deltaAltura > VELOCIDAD_MAX_MM_H * deltaHoras * 1.5 + SUBIDA_TOLERADA_MM
        ) {
          motivos.push(
            `Descenso físicamente imposible (${Math.round(-deltaAltura)} mm en ${Math.round(deltaHoras * 60)} min)`,
          );
        }
      }
    }

    lectura.sospechosa = motivos.length > 0;
    lectura.motivosSospecha = motivos;
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
    const esParo = lectura.incidencia === 'paro' || lectura.incidencia === 'rotura-fleje';
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
    const continua =
      previo &&
      previo.incidencia === lectura.incidencia &&
      inicio - epoch(previo.hasta) <= INTERVALO_LECTURA_MS * 1.5;
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
      const telares = TELAR_IDS.map((telarId) =>
        this.snapshotTelar(telarId, porTelar.get(telarId) ?? [], ahora, nombres),
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
      const desdeDia = inicioDia(ahora);
      const validasJornada = validas.filter((l) => epoch(l.recibidaEn) >= desdeDia);
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

  getSaludDatos(): Promise<SaludDatos> {
    return this.cacheado('salud', TTL_SALUD_MS, async () => {
      const ahora = Date.now();
      const porTelar = await this.lecturasDesde(ahora - 7 * 86_400_000);

      const telares: SaludTelar[] = TELAR_IDS.map((telarId) => {
        const lecturas = porTelar.get(telarId) ?? [];
        const fiables = lecturas.filter((l) => !l.sospechosa).length;
        return {
          telarId,
          nombre: NOMBRES_TELAR.get(telarId) ?? `Telar ${telarId}`,
          lecturas7d: lecturas.length,
          fiables7d: fiables,
          pctFiables: lecturas.length > 0 ? (fiables / lecturas.length) * 100 : 100,
        };
      });

      const cuarentena: LecturaCuarentena[] = TELAR_IDS.flatMap((id) =>
        (porTelar.get(id) ?? []).filter((l) => l.sospechosa),
      )
        .sort((a, b) => epoch(b.recibidaEn) - epoch(a.recibidaEn))
        .slice(0, 60)
        .map((lectura) => ({ lectura, motivos: lectura.motivosSospecha }));

      const partes = await this.saludPartes();

      return {
        generadoEn: new Date(ahora).toISOString(),
        fuentes: await this.fuentesDatos(porTelar, telares, partes, ahora),
        telares,
        cuarentena,
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
   * Partes de paquetes (operación '4', la única con m²/tablas reales) de los
   * bloques dados. El cruce con los runs de lecturas es telar + nº bloque.
   */
  private async partesPaquetesDeBloques(bloques: number[]): Promise<FilaParte[]> {
    if (bloques.length === 0) {
      return [];
    }
    return this.prisma.parteTrabajoMapeada.findMany({
      where: {
        operacion: '4',
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
      golpesPorMinuto: fila.golpesXMinuto ?? 0,
      velocidadMmH: fila.velocidad ?? 0,
      alturaActualMm: fila.alturaActual ?? 0,
      operario1: fila.operario1 !== null ? String(fila.operario1) : null,
      operario2: fila.operario2 !== null ? String(fila.operario2) : null,
      sospechosa: false,
      motivosSospecha: [],
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
      horasMarcha: redondea((minutos.get('marcha') ?? 0) / 60),
      horasParo: redondea(((minutos.get('paro') ?? 0) + (minutos.get('rotura-fleje') ?? 0)) / 60),
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
  ): SnapshotTelar {
    const validas = lecturas.filter(
      (l) => !l.sospechosa && epoch(l.recibidaEn) <= ahora + UMBRAL_SIN_DATOS_MS,
    );
    const ultimaValida = validas.length > 0 ? validas[validas.length - 1] : null;
    const ultimaCualquiera = lecturas.length > 0 ? lecturas[lecturas.length - 1] : null;

    // "Sin señal" significa que NO llegan lecturas. El estado sale de la
    // última lectura RECIBIDA aunque esté en cuarentena (p. ej. el telar 4
    // emite con el consumo congelado y quedaría siempre "sin señal" siendo
    // falso): el badge de datos sospechosos ya avisa, y las métricas
    // derivadas (progreso, ETA, series) siguen usando solo lecturas fiables.
    // El umbral es de valor absoluto: una lectura FUTURA (reloj de consola
    // corrupto en una fila sin create_date) cumpliría `ahora - t ≤ umbral`
    // durante horas y dejaría el estado congelado en su incidencia.
    const esReciente = (l: LecturaTelar | null): l is LecturaTelar =>
      l !== null && Math.abs(ahora - epoch(l.recibidaEn)) <= UMBRAL_SIN_DATOS_MS;
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
      bloque,
      ultimaLectura: referencia,
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
    return Math.min(100, ((minutos.get('marcha') ?? 0) / minutosTurno) * 100);
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
    const minutosMarcha = minutos.get('marcha') ?? 0;
    const minutosParo = (minutos.get('paro') ?? 0) + (minutos.get('rotura-fleje') ?? 0);
    const minutosCambio = minutos.get('cambio-bloque') ?? 0;
    const minutosTotales = minutosMarcha + minutosParo + minutosCambio;

    const tramos = tramosDeParo(validas, ahora);
    const parosPorCausa: ParoPorCausa[] = [
      {
        causa: 'paro',
        minutos: Math.round(
          tramos.filter((t) => t.causa === 'paro').reduce((s, t) => s + t.minutos, 0),
        ),
        numero: tramos.filter((t) => t.causa === 'paro').length,
      },
    ];

    const runs = derivarRuns(validas);
    const actual = this.runActual(runs, ahora);
    const completados = runs.filter((r) => r !== actual).length;

    const marcha = validas.filter((l) => l.incidencia === 'marcha');
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
      parosPorCausa,
    };
  }
}
