import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { FabricApi } from '../fabric-api';
import {
  Bloque,
  BloqueInventario,
  CicloBloque,
  CoberturaMaquina,
  CoberturaMaquinas,
  EstadoIntegracion,
  FamiliaMaquina,
  SeccionPlanta,
  DesvioRitmo,
  DetalleTelar,
  Estadisticas,
  EstadisticasTelar,
  EstadoFuente,
  EstadoTelar,
  ActividadParte,
  EventoParte,
  TipoEvento,
  FiltrosInventario,
  FormaInventario,
  FuenteDato,
  Granularidad,
  InventarioVistaConjunta,
  ResumenInventario,
  FiltrosLecturas,
  FiltrosPartesDiscoPuente,
  FiltrosPartesReforzadora,
  FiltrosPartesTrabajo,
  JornadaTelar,
  KpisPlanta,
  LecturaCruda,
  LecturaAviso,
  LecturaCuarentena,
  LecturaTelar,
  PaginaInventario,
  PaginaLecturas,
  PaginaPartes,
  PaginaPartesDiscoPuente,
  PaginaPartesReforzadora,
  PaginaPartesTrabajo,
  ParoPorCausa,
  ParteDiscoPuenteCrudo,
  ParteReforzadoraCrudo,
  ParteTrabajo,
  ParteTrabajoCrudo,
  ProduccionDia,
  ProduccionMaterial,
  ProduccionOperario,
  PuntoSerie,
  RangoEstadisticas,
  RoturaFleje,
  SaludDatos,
  SaludTelar,
  SegmentoEstado,
  SnapshotPlanta,
  SnapshotTelar,
  TipoIncidencia,
  VigiaFleje
} from '../models';
import { materialPorId } from '../materiales';
import { inicioPeriodo, siguientePeriodo, ventanaEstadisticas } from '../periodos';
import { RelojService } from '../reloj.service';
import { validarLecturas } from '../validador';
import {
  CicloSim,
  DIAS_FUTURO,
  INTERVALO_LECTURA_MS,
  MundoSim,
  TELAR_IDS,
  alturaEn,
  cicloEn,
  generarMundo,
  operariosDe,
  tablasPrevistas,
  turnoDe
} from './simulacion';

/**
 * Implementación mock de la API de Fabric.
 *
 * Mantiene en memoria un mundo simulado pregenerado (histórico + futuro) y
 * responde a cada llamada "como si fuera el servidor": filtra lo ya emitido
 * según el reloj virtual, aplica el validador de calidad de datos y agrega.
 * La latencia artificial imita una petición HTTP real.
 */

const MINUTOS_POR_LECTURA = INTERVALO_LECTURA_MS / 60_000;
const UMBRAL_SIN_DATOS_MS = 25 * 60_000;
/** Ventana del badge de actividad del operario (20 min; fin de jornada no caduca). */
const VENTANA_ACTIVIDAD_MS = 20 * 60_000;
/** Frescura de la fuente de lecturas (igual que en el backend real). */
const FUENTE_FRESCA_MS = 3 * 3_600_000;
const SEED = 20260611;
const NOMBRES_TELAR = new Map(TELAR_IDS.map((id) => [id, `Telar ${id}`]));

interface TramoParo {
  causa: TipoIncidencia;
  inicio: LecturaTelar;
  lecturas: number;
}

function epoch(iso: string): number {
  return new Date(iso).getTime();
}

function inicioDia(ms: number): number {
  const fecha = new Date(ms);
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime();
}

/** Regla del cliente: tras hacer paquetes, 30 min en "almacenando". */
const ALMACENANDO_MS = 30 * 60_000;

/**
 * Estado de ciclo del bloque en la demo. Ya no es parte del contrato de la API
 * (el inventario real lo deriva del stock on-hand, no de los partes); aquí se
 * conserva solo como criterio interno para saber qué bloques siguen EN
 * EXISTENCIAS (no terminados): los terminales 'almacenando'/'aserrado' ya no
 * son existencias. Hitos de la simulación: colocacion→op1, inicioCorte→op2,
 * salida→op3, paquetesEn→op4.
 */
type EstadoCicloDemo =
  | 'inventariado'
  | 'moviendo-a-telar'
  | 'aserrando'
  | 'sacando-del-telar'
  | 'almacenando'
  | 'aserrado';

function estadoCicloDemo(ciclo: CicloSim, ahora: number): EstadoCicloDemo {
  if (ahora >= ciclo.paquetesEn) {
    return ahora - ciclo.paquetesEn < ALMACENANDO_MS ? 'almacenando' : 'aserrado';
  }
  if (ahora >= ciclo.salida) {
    return 'sacando-del-telar';
  }
  if (ahora >= ciclo.inicioCorte) {
    return 'aserrando';
  }
  if (ahora >= ciclo.colocacion) {
    return 'moviendo-a-telar';
  }
  return 'inventariado';
}

function volumenM3(bloque: Bloque): number {
  const medidas = bloque.medidasFabrica;
  return (medidas.largoCm * medidas.altoCm * medidas.gruesoCm) / 1_000_000;
}

function mermaVolumenPct(bloque: Bloque): number {
  const proveedor = bloque.medidasProveedor;
  const m3Proveedor = (proveedor.largoCm * proveedor.altoCm * proveedor.gruesoCm) / 1_000_000;
  const m3Fabrica = volumenM3(bloque);
  if (m3Proveedor <= 0) {
    return 0;
  }
  return ((m3Proveedor - m3Fabrica) / m3Proveedor) * 100;
}

function m2Previstos(bloque: Bloque): number {
  const tablas = tablasPrevistas(bloque.medidasFabrica);
  return (tablas * bloque.medidasFabrica.largoCm * bloque.medidasFabrica.altoCm) / 10_000;
}

function media(valores: number[]): number {
  if (valores.length === 0) {
    return 0;
  }
  return valores.reduce((suma, valor) => suma + valor, 0) / valores.length;
}

/** Enumera en español: ["Telar 3","Telar 4"] → "Telar 3 y Telar 4". */
function listaEs(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? '';
  }
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) {
    return null;
  }
  const ordenados = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[mitad - 1] + ordenados[mitad]) / 2
    : ordenados[mitad];
}

/** Agrupa lecturas consecutivas de paro (paro / rotura) en tramos. */
function tramosDeParo(lecturas: LecturaTelar[]): TramoParo[] {
  const tramos: TramoParo[] = [];
  let abierto: TramoParo | null = null;
  for (const lectura of lecturas) {
    const esParo = lectura.incidencia === 'paro' || lectura.incidencia === 'rotura-fleje';
    if (esParo) {
      if (abierto && abierto.causa === lectura.incidencia) {
        abierto.lecturas += 1;
      } else {
        abierto = { causa: lectura.incidencia, inicio: lectura, lecturas: 1 };
        tramos.push(abierto);
      }
    } else {
      abierto = null;
    }
  }
  return tramos;
}

/** Descriptor de máquina del catálogo de planta para el mapa de cobertura (demo). */
interface DescriptorMaquinaDemo {
  codigo: number;
  nombre: string;
  seccion: SeccionPlanta;
  familia: FamiliaMaquina;
  fuenteDatos: string | null;
  estado: EstadoIntegracion;
  /** Telar de la simulación (1–4) cuando la máquina es un telar. */
  telarId?: number;
  /** true SOLO para el disco puente Gómez (el único con PLC); el flujo es suyo. */
  esDiscoPuente?: boolean;
  /** true si vuelca al flujo compartido de la reforzadora de tablas. */
  esReforzadora?: boolean;
  notaBase?: string | null;
}

const SIN_FUENTE_MAQUINA = 'Sin fuente de datos conectada.';
const DATO_SIN_INTEGRAR_MAQUINA =
  'Existe tabla de datos del sistema antiguo; pendiente de confirmar columnas con TotWare e integrar.';
const SIN_PLC_MAQUINA =
  'Sin PLC ni integración todavía; no envía datos. De los tres discos puente solo Gómez está conectado.';

/**
 * Catálogo de planta (mismo orden y nombres que el backend; fuente:
 * `02_conocimiento/obsidian/08 Maquinas operaciones y produccion.md`). Solo
 * telares y disco puente tienen fuente; el resto queda pendiente.
 */
const CATALOGO_MAQUINAS_DEMO: readonly DescriptorMaquinaDemo[] = [
  { codigo: 1, nombre: 'REFORZADORA BLOQUES', seccion: 'M3', familia: 'reforzadora', fuenteDatos: null, estado: 'pendiente', notaBase: SIN_FUENTE_MAQUINA },
  { codigo: 2, nombre: 'MONOHILO', seccion: 'M3', familia: 'corte', fuenteDatos: null, estado: 'pendiente', notaBase: SIN_FUENTE_MAQUINA },
  { codigo: 3, nombre: 'TELAR 1', seccion: 'M3', familia: 'telar', fuenteDatos: 'produccion_mapeada', estado: 'integrada', telarId: 1 },
  { codigo: 4, nombre: 'TELAR 2', seccion: 'M3', familia: 'telar', fuenteDatos: 'produccion_mapeada', estado: 'integrada', telarId: 2 },
  { codigo: 5, nombre: 'TELAR 3', seccion: 'M3', familia: 'telar', fuenteDatos: 'produccion_mapeada', estado: 'integrada', telarId: 3 },
  { codigo: 6, nombre: 'TELAR 4', seccion: 'M3', familia: 'telar', fuenteDatos: 'produccion_mapeada', estado: 'integrada', telarId: 4 },
  { codigo: 7, nombre: 'TELAR EXTERNO', seccion: 'M3', familia: 'telar', fuenteDatos: null, estado: 'pendiente', notaBase: 'Aserrado subcontratado; sin telemetría propia en la BD.' },
  { codigo: 8, nombre: 'CORTABLOQUES', seccion: 'M2', familia: 'corte', fuenteDatos: null, estado: 'pendiente', notaBase: SIN_FUENTE_MAQUINA },
  { codigo: 9, nombre: 'REFORZADORA 1', seccion: 'M2', familia: 'reforzadora', fuenteDatos: 'reforzadora_mapeada', estado: 'parcial', esReforzadora: true },
  { codigo: 10, nombre: 'REFORZADORA 2 SEI', seccion: 'M2', familia: 'reforzadora', fuenteDatos: 'reforzadora_mapeada', estado: 'parcial', esReforzadora: true },
  { codigo: 11, nombre: 'PULIDORA TABLA SIMEC', seccion: 'M2', familia: 'pulidora', fuenteDatos: null, estado: 'pendiente', notaBase: DATO_SIN_INTEGRAR_MAQUINA },
  { codigo: 12, nombre: 'DISCOPUENTE 1 TERZAGO', seccion: 'M2', familia: 'disco_puente', fuenteDatos: null, estado: 'pendiente', notaBase: SIN_PLC_MAQUINA },
  { codigo: 13, nombre: 'DISCOPUENTE 2 GOMEZ', seccion: 'M2', familia: 'disco_puente', fuenteDatos: 'parte_discopuente_mapeada', estado: 'integrada', esDiscoPuente: true },
  { codigo: 14, nombre: 'DISCOPUENTE 3 CANIGO', seccion: 'M2', familia: 'disco_puente', fuenteDatos: null, estado: 'pendiente', notaBase: SIN_PLC_MAQUINA },
  { codigo: 15, nombre: 'CONTROL NUMERICO DONATONI', seccion: 'M2', familia: 'cnc', fuenteDatos: null, estado: 'pendiente', notaBase: 'También realiza corte de disco puente (catálogo). Sin fuente de datos conectada.' },
  { codigo: 16, nombre: 'PULIDORA LOSA', seccion: 'M2', familia: 'pulidora', fuenteDatos: null, estado: 'pendiente', notaBase: DATO_SIN_INTEGRAR_MAQUINA },
  { codigo: 17, nombre: 'BISELADORA', seccion: 'M2', familia: 'acabado', fuenteDatos: null, estado: 'pendiente', notaBase: SIN_FUENTE_MAQUINA },
  { codigo: 18, nombre: 'RECUPERADORA', seccion: 'M2', familia: 'corte', fuenteDatos: null, estado: 'pendiente', notaBase: SIN_FUENTE_MAQUINA },
  { codigo: 19, nombre: 'TALLER', seccion: 'M2', familia: 'taller', fuenteDatos: null, estado: 'pendiente', notaBase: SIN_FUENTE_MAQUINA }
];

@Injectable({ providedIn: 'root' })
export class MockFabricApi extends FabricApi {
  private readonly reloj = inject(RelojService);
  private mundo: MundoSim;

  constructor() {
    super();
    this.mundo = this.generarYValidar(Date.now());
  }

  private generarYValidar(ancla: number): MundoSim {
    const mundo = generarMundo(SEED, ancla);
    for (const telarId of TELAR_IDS) {
      validarLecturas(mundo.lecturasPorTelar.get(telarId) ?? []);
    }
    return mundo;
  }

  /**
   * El mundo cubre 4 días de futuro; con el reloj demo ×60 se agotan en
   * ~96 min reales. Si el ahora virtual se acerca al borde, se regenera
   * anclado a la hora virtual para que la demo nunca se quede "Sin señal".
   */
  private asegurarVentana(ahora: number): void {
    const borde = this.mundo.ahoraGeneracion + (DIAS_FUTURO - 1) * 86_400_000;
    if (ahora > borde) {
      this.mundo = this.generarYValidar(ahora);
    }
  }

  override getSnapshotPlanta(): Observable<SnapshotPlanta> {
    const ahora = this.reloj.ahora();
    this.asegurarVentana(ahora);
    const telares = TELAR_IDS.map((telarId) => this.snapshotTelar(telarId, ahora));
    const snapshot: SnapshotPlanta = {
      generadoEn: new Date(ahora).toISOString(),
      fuente: 'mock',
      kpis: this.kpisPlanta(telares, ahora),
      telares,
      ultimosEventos: this.eventosHasta(ahora).slice(-8).reverse()
    };
    return this.conLatencia(snapshot);
  }

  override getDetalleTelar(telarId: number): Observable<DetalleTelar> {
    if (!TELAR_IDS.includes(telarId)) {
      // Mismo contrato que tendrá la API real: telar inexistente = error.
      return throwError(() => new Error(`Telar ${telarId} no existe`));
    }
    const ahora = this.reloj.ahora();
    this.asegurarVentana(ahora);
    const snapshot = this.snapshotTelar(telarId, ahora);
    // Ventana rodante de 24 h (no día natural): el detalle no se queda en blanco
    // al cruzar medianoche. El Gantt "Jornada de hoy" recorta estos segmentos al día.
    const desdeVentana = ahora - 24 * 3_600_000;
    const validasJornada = this.lecturasValidas(telarId, desdeVentana, ahora);
    const ciclo = cicloEn(this.mundo.ciclos, telarId, ahora);

    const detalle: DetalleTelar = {
      snapshot,
      serieAltura: validasJornada.map((l) => ({ t: l.recibidaEn, v: l.alturaActualMm })),
      seriePotencia: validasJornada.map((l) => ({ t: l.recibidaEn, v: l.potenciaKw })),
      serieGolpes: validasJornada.map((l) => ({ t: l.recibidaEn, v: l.golpesPorMinuto })),
      serieVelocidad: validasJornada.map((l) => ({ t: l.recibidaEn, v: l.velocidadMmH })),
      segmentosJornada: this.segmentos(validasJornada),
      disponibilidadTurnoPct: this.disponibilidadTurno(telarId, ahora),
      ...this.mtbfFleje(telarId, ahora),
      latenciaDatosMin: snapshot.ultimaLectura
        ? Math.max(0, Math.round((ahora - epoch(snapshot.ultimaLectura.recibidaEn)) / 60_000))
        : null,
      vigiaFleje: this.vigiaFleje(telarId, ciclo, ahora),
      lecturasRecientes: this.lecturas(telarId)
        .filter((l) => epoch(l.recibidaEn) <= ahora)
        .slice(-30)
        .reverse(),
      eventosCicloActual: ciclo
        ? this.eventosHasta(ahora).filter(
            (evento) => evento.telarId === telarId && evento.bloque === ciclo.bloque.numero
          )
        : [],
      historialCiclos: this.mundo.ciclos
        .filter((c) => c.telarId === telarId && c.salida <= ahora)
        .slice(-8)
        .reverse()
        .map((c) => this.aCicloBloque(c, ahora))
    };
    return this.conLatencia(detalle);
  }

  override getEstadisticas(rango: RangoEstadisticas): Observable<Estadisticas> {
    const ahora = this.reloj.ahora();
    this.asegurarVentana(ahora);
    // Misma ventana y granularidad que la fuente real (ver core/periodos.ts):
    // día (hoy/7d), semana (30d/90d) o mes (1a/todo). 'todo' arranca en 0 y se
    // acota luego al primer paquete; la demo solo guarda ~31 días de histórico.
    const { desde, granularidad } = ventanaEstadisticas(rango, ahora);

    const porTelar = TELAR_IDS.map((telarId) => this.estadisticasTelar(telarId, desde, ahora));
    const eventosRango = this.eventosHasta(ahora).filter((e) => epoch(e.fechaHora) >= desde);
    const paquetes = eventosRango.filter((e) => e.tipo === 'paquetes' && e.paquetes);
    const salidas = eventosRango.filter((e) => e.tipo === 'salida');
    // En 'todo' (desde = 0) las barras arrancan en el primer paquete real,
    // no en 1970; el resto de rangos arrancan en su `desde` natural.
    const inicioBuckets =
      rango === 'todo'
        ? paquetes.length > 0
          ? Math.min(...paquetes.map((e) => epoch(e.fechaHora)))
          : inicioDia(ahora)
        : desde;

    const ciclosCompletados = this.mundo.ciclos
      .filter((c) => c.salida >= desde && c.salida <= ahora)
      .sort((a, b) => b.salida - a.salida)
      .map((c) => this.aCicloBloque(c, ahora));

    const totalM2 = paquetes.reduce((suma, e) => suma + (e.paquetes?.metrosCuadrados ?? 0), 0);
    const ciclosPorBloque = new Map(this.mundo.ciclos.map((c) => [`${c.telarId}-${c.bloque.numero}`, c]));
    let totalM3 = 0;
    const mermas: number[] = [];
    for (const salida of salidas) {
      const ciclo = ciclosPorBloque.get(`${salida.telarId}-${salida.bloque}`);
      if (ciclo) {
        totalM3 += volumenM3(ciclo.bloque);
        mermas.push(mermaVolumenPct(ciclo.bloque));
      }
    }

    // Mismo denominador que las barras por telar: marcha + paro + cambio.
    const horasTotales = porTelar.reduce(
      (suma, t) => suma + t.horasMarcha + t.horasParo + t.horasCambioBloque,
      0
    );
    const horasMarchaGlobal = porTelar.reduce((suma, t) => suma + t.horasMarcha, 0);

    const estadisticas: Estadisticas = {
      rango,
      granularidad,
      desde: new Date(inicioPeriodo(inicioBuckets, granularidad)).toISOString(),
      hasta: new Date(ahora).toISOString(),
      totalM2: Math.round(totalM2 * 10) / 10,
      totalM3Aserrados: Math.round(totalM3 * 100) / 100,
      totalTablas: paquetes.reduce((suma, e) => suma + (e.paquetes?.numTablas ?? 0), 0),
      totalPaquetes: paquetes.reduce((suma, e) => suma + (e.paquetes?.numPaquetes ?? 0), 0),
      totalBloques: salidas.length,
      rendimientoM2M3: totalM3 > 0 ? Math.round((totalM2 / totalM3) * 100) / 100 : null,
      // En demo todos los bloques con salida tienen parte y medidas coherentes.
      bloquesRendimiento: salidas.length,
      bloquesRendimientoDudosos: 0,
      mermaMediaPct: mermas.length > 0 ? Math.round(media(mermas) * 10) / 10 : null,
      pctMarchaGlobal: horasTotales > 0 ? (horasMarchaGlobal / horasTotales) * 100 : 0,
      pctParoGlobal:
        horasTotales > 0
          ? (porTelar.reduce((suma, t) => suma + t.horasParo, 0) / horasTotales) * 100
          : 0,
      telares: porTelar,
      produccionPorDia: this.produccionPorDia(paquetes, inicioBuckets, ahora, granularidad),
      produccionPorMaterial: this.produccionPorMaterial(paquetes),
      produccionPorOperario: this.produccionPorOperario(paquetes),
      roturas: this.roturas(desde, ahora),
      ciclosCompletados: ciclosCompletados.slice(0, 12),
      jornadaHoy: TELAR_IDS.map((telarId) => this.jornadaTelar(telarId, ahora)),
      lecturasSospechosas: TELAR_IDS.reduce(
        (suma, telarId) =>
          suma +
          this.lecturas(telarId).filter(
            (l) => l.sospechosa && epoch(l.recibidaEn) >= desde && epoch(l.recibidaEn) <= ahora
          ).length,
        0
      )
    };
    return this.conLatencia(estadisticas);
  }

  override getSaludDatos(): Observable<SaludDatos> {
    const ahora = this.reloj.ahora();
    this.asegurarVentana(ahora);
    const desde = ahora - 7 * 86_400_000;

    const enVentana = (l: LecturaTelar): boolean =>
      epoch(l.recibidaEn) >= desde && epoch(l.recibidaEn) <= ahora;

    const telares: SaludTelar[] = TELAR_IDS.map((telarId) => {
      const lecturas = this.lecturas(telarId).filter(enVentana);
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
        pctLimpias: lecturas.length > 0 ? (limpias / lecturas.length) * 100 : 100
      };
    });

    const cuarentena: LecturaCuarentena[] = TELAR_IDS.flatMap((telarId) =>
      this.lecturas(telarId).filter((l) => l.sospechosa && enVentana(l))
    )
      .sort((a, b) => epoch(b.recibidaEn) - epoch(a.recibidaEn))
      .slice(0, 60)
      .map((lectura) => ({ lectura, motivos: lectura.motivosSospecha }));

    // Avisos: lecturas que NO se descartan (siguen en KPIs) pero pintan raro.
    const avisos: LecturaAviso[] = TELAR_IDS.flatMap((telarId) =>
      this.lecturas(telarId).filter((l) => !l.sospechosa && l.alertas.length > 0 && enVentana(l))
    )
      .sort((a, b) => epoch(b.recibidaEn) - epoch(a.recibidaEn))
      .slice(0, 60)
      .map((lectura) => ({ lectura, alertas: lectura.alertas }));

    return this.conLatencia({
      generadoEn: new Date(ahora).toISOString(),
      fuentes: this.fuentesDatos(ahora, telares),
      telares,
      cuarentena,
      avisos,
      // La salud de partes solo aplica a la tabla real.
      partes: null
    });
  }

  /**
   * Las tablas que alimentan Fabric, con su origen y su salud. Mismo contrato y
   * mismos textos que el modo Real (describe siempre el sistema real); aquí los
   * números salen de la simulación.
   */
  private fuentesDatos(ahora: number, telares: SaludTelar[]): FuenteDato[] {
    // produccion_mapeada — lecturas de telar.
    const lecturas7d = telares.reduce((s, t) => s + t.lecturas7d, 0);
    const fiables7d = telares.reduce((s, t) => s + t.fiables7d, 0);
    const pct = lecturas7d > 0 ? Math.round((fiables7d / lecturas7d) * 100) : 100;
    const degradados = telares
      .filter((t) => t.lecturas7d > 0 && t.pctFiables < 95)
      .map((t) => t.nombre);
    const todasLecturas = TELAR_IDS.flatMap((id) =>
      this.lecturas(id).filter((l) => epoch(l.recibidaEn) <= ahora)
    );
    const ultimaLecturaMs = todasLecturas.reduce(
      (m, l) => Math.max(m, epoch(l.recibidaEn)),
      0
    );

    const desfasada = ultimaLecturaMs > 0 && ahora - ultimaLecturaMs > FUENTE_FRESCA_MS;
    let estadoLecturas: EstadoFuente = pct >= 98 ? 'ok' : pct >= 90 ? 'aviso' : 'mal';
    let diagLecturas: string;
    if (lecturas7d === 0) {
      estadoLecturas = ultimaLecturaMs > 0 ? 'aviso' : 'sin-datos';
      diagLecturas =
        ultimaLecturaMs > 0
          ? 'No han entrado lecturas en los últimos 7 días: los telares pueden estar parados o la integración cortada.'
          : 'Sin lecturas en la base de datos.';
    } else {
      if (desfasada) {
        if (estadoLecturas === 'ok') {
          estadoLecturas = 'aviso';
        }
        diagLecturas = `No entran lecturas nuevas desde la última recibida (puede ser una parada o un corte de la integración); en los últimos 7 días, ${pct} % de lecturas fiables.`;
      } else {
        diagLecturas =
          estadoLecturas === 'ok'
            ? `Llegan con normalidad: ${pct} % de lecturas fiables en los últimos 7 días.`
            : `${pct} % de lecturas fiables en los últimos 7 días; el resto queda en cuarentena.`;
      }
      if (degradados.length > 0) {
        diagLecturas += ` Las dudosas se concentran en ${listaEs(degradados)}.`;
      }
    }

    // parte_trabajo_mapeada — partes de operario.
    const eventos = this.eventosHasta(ahora);
    const ultimaParteMs = eventos.reduce((m, e) => Math.max(m, epoch(e.fechaHora)), 0);

    // reforzadora_mapeada — la demo la deriva de los partes de paquetes (las
    // tablas que salen del telar son las que luego se refuerzan).
    const eventosReforzadora = eventos.filter((e) => e.tipo === 'paquetes' && e.paquetes);
    const ultimaReforzadoraMs = eventosReforzadora.reduce(
      (m, e) => Math.max(m, epoch(e.fechaHora)),
      0
    );

    // lot_block_creation — inventario de bloques (alta ~3 días antes de colocar).
    const ALTA_ANTES_MS = 3 * 86_400_000;
    const altas = this.mundo.ciclos
      .map((c) => ({ altaMs: c.colocacion - ALTA_ANTES_MS, medido: c.colocacion <= ahora }))
      .filter((x) => x.altaMs <= ahora);
    const conFabrica = altas.filter((x) => x.medido).length;
    const ultimaAltaMs = altas.reduce((m, x) => Math.max(m, x.altaMs), 0);

    return [
      {
        grupo: 'maquinas',
        tabla: 'produccion_mapeada',
        nombre: 'Lecturas de los telares',
        origen: 'Autómata de cada telar — una lectura cada ~10 min',
        descripcion:
          'Estado, potencia (kW), consumo (A), golpes/min y altura del bastidor (mm) de los 4 telares. Es la base de la sala en vivo, el detalle de cada telar, la producción y esta misma salud del dato.',
        registros: todasLecturas.length,
        ultimaActualizacion: ultimaLecturaMs > 0 ? new Date(ultimaLecturaMs).toISOString() : null,
        estado: estadoLecturas,
        diagnostico: diagLecturas
      },
      {
        grupo: 'maquinas',
        tabla: 'parte_trabajo_mapeada',
        nombre: 'Partes de trabajo de operario',
        origen: 'Registro de los operarios (TotWare → Odoo)',
        descripcion:
          'Operaciones de cada turno: colocación, aserrado, salida y los paquetes con sus tablas y m² reales. Aporta los m², las tablas y el material por lote que las lecturas de máquina no traen.',
        registros: eventos.length,
        ultimaActualizacion: ultimaParteMs > 0 ? new Date(ultimaParteMs).toISOString() : null,
        estado: eventos.length > 0 ? 'ok' : 'sin-datos',
        diagnostico:
          eventos.length > 0
            ? `Los ${eventos.length} partes pasan las comprobaciones de formato.`
            : 'Sin partes registrados.'
      },
      {
        grupo: 'maquinas',
        tabla: 'reforzadora_mapeada',
        nombre: 'Partes de la reforzadora',
        origen: 'Máquina reforzadora de tablas (TotWare → Odoo)',
        descripcion:
          'Partes de la reforzadora de tablas (malla + resina): material, nº de tablas, medidas y m² reforzados. n_reforzadora solo trae 1 (no separa REFORZADORA 1 de REFORZADORA 2 SEI); acabado/eventos y la unidad de consumo, pendientes de confirmar con TotWare.',
        registros: eventosReforzadora.length,
        ultimaActualizacion:
          ultimaReforzadoraMs > 0 ? new Date(ultimaReforzadoraMs).toISOString() : null,
        estado: eventosReforzadora.length > 0 ? 'ok' : 'sin-datos',
        diagnostico:
          eventosReforzadora.length > 0
            ? `${eventosReforzadora.length} partes de la reforzadora registrados.`
            : 'Sin partes de la reforzadora.'
      },
      {
        grupo: 'heredada',
        tabla: 'lot_block_creation',
        nombre: 'Altas de bloque (heredada)',
        origen: 'Recepción de almacén (Odoo) — log antiguo',
        descripcion:
          'Log antiguo de altas de bloque. Ya NO alimenta el inventario (ahora lo hace el stock real de Odoo); su único uso vivo es aportar la medida real del bloque por PM/lote para el m³ y el rendimiento (m²/m³) de Producción. Es parcial y está desfasada del stock on-hand.',
        registros: altas.length,
        ultimaActualizacion: ultimaAltaMs > 0 ? new Date(ultimaAltaMs).toISOString() : null,
        estado: altas.length > 0 ? 'ok' : 'sin-datos',
        diagnostico:
          altas.length > 0
            ? `${altas.length} altas; ${conFabrica} con medida de fábrica. Disjunta del stock actual: ya no es el inventario.`
            : 'Sin altas de bloque.'
      }
    ];
  }

  override getPartes(rango: RangoEstadisticas, telarId: number | null): Observable<PaginaPartes> {
    const ahora = this.reloj.ahora();
    this.asegurarVentana(ahora);
    const fecha = new Date(ahora);
    const desde =
      rango === 'hoy'
        ? inicioDia(ahora)
        : new Date(
            fecha.getFullYear(),
            fecha.getMonth(),
            fecha.getDate() - (rango === '7d' ? 6 : 29)
          ).getTime();

    const porBloque = new Map(
      this.mundo.ciclos.map((c) => [`${c.telarId}-${c.bloque.numero}`, c])
    );

    const eventos = this.eventosHasta(ahora).filter((e) => {
      if (epoch(e.fechaHora) < desde) {
        return false;
      }
      return telarId === null || e.telarId === telarId;
    });

    const partes: ParteTrabajo[] = [...eventos]
      .sort((a, b) => epoch(b.fechaHora) - epoch(a.fechaHora))
      .slice(0, 200)
      .map((e) => {
        const ciclo = e.bloque !== null ? porBloque.get(`${e.telarId}-${e.bloque}`) : undefined;
        return {
          id: e.id,
          fechaHora: e.fechaHora,
          telarId: e.telarId,
          operacion: e.tipo,
          bloque: e.bloque,
          pmLote: e.pmLote,
          materialId: e.materialId,
          medidas: ciclo ? ciclo.bloque.medidasFabrica : null,
          volumenM3: ciclo ? Math.round(volumenM3(ciclo.bloque) * 100) / 100 : null,
          operario1: e.operario1,
          operario2: e.operario2,
          paquetes: e.paquetes
        };
      });

    return this.conLatencia({
      rango,
      telarId,
      desde: new Date(desde).toISOString(),
      hasta: new Date(ahora).toISOString(),
      total: eventos.length,
      partes
    });
  }

  override getLecturas(filtros: FiltrosLecturas): Observable<PaginaLecturas> {
    const ahora = this.reloj.ahora();
    this.asegurarVentana(ahora);

    // Réplica de la tabla real `produccion_mapeada` con las lecturas de la
    // simulación: mismas columnas, los más recientes primero.
    const filas: LecturaCruda[] = [];
    for (const telarId of TELAR_IDS) {
      for (const l of this.lecturas(telarId)) {
        const t = epoch(l.recibidaEn);
        if (t > ahora) {
          continue;
        }
        const ciclo = l.bloque !== null ? cicloEn(this.mundo.ciclos, telarId, t) : null;
        filas.push({
          id: t,
          telarN: String(telarId),
          operario1: null,
          operario2: null,
          nBloque: l.bloque,
          pmLote: l.pmLote,
          material: ciclo?.bloque.materialId ?? null,
          largo: ciclo?.bloque.medidasFabrica.largoCm ?? null,
          alto: ciclo?.bloque.medidasFabrica.altoCm ?? null,
          grueso: ciclo?.bloque.medidasFabrica.gruesoCm ?? null,
          potencia: Math.round(l.potenciaKw),
          velocidad: Math.round(l.velocidadMmH),
          incidencia: l.incidencia,
          consumo: Math.round(l.amperios),
          golpesXMinuto: Math.round(l.golpesPorMinuto),
          alturaActual: Math.round(l.alturaActualMm),
          fechaHora: l.fechaHora
        });
      }
    }
    filas.sort((a, b) => b.id - a.id);

    const materiales = [
      ...new Set(filas.map((f) => f.material).filter((m): m is string => m !== null))
    ].sort();

    // Filtros: mismas semánticas que el backend real (fechas naturales
    // inclusivas sobre el sello de recepción).
    const desdeMs = filtros.desde ? new Date(`${filtros.desde}T00:00:00`).getTime() : null;
    const hastaMs = filtros.hasta
      ? new Date(`${filtros.hasta}T00:00:00`).getTime() + 86_400_000
      : null;
    const filtradas = filas.filter((f) => {
      if (filtros.lote && String(f.pmLote ?? f.nBloque ?? '') !== filtros.lote) {
        return false;
      }
      if (filtros.telarN && f.telarN !== filtros.telarN) {
        return false;
      }
      if (filtros.material && String(f.material) !== filtros.material) {
        return false;
      }
      if (desdeMs !== null && f.id < desdeMs) {
        return false;
      }
      if (hastaMs !== null && f.id >= hastaMs) {
        return false;
      }
      return true;
    });

    const items = filtradas.slice(filtros.offset, filtros.offset + filtros.limit);
    return this.conLatencia({
      total: filtradas.length,
      limit: filtros.limit,
      offset: filtros.offset,
      items,
      materiales
    });
  }

  override getPartesTrabajo(
    filtros: FiltrosPartesTrabajo
  ): Observable<PaginaPartesTrabajo> {
    const ahora = this.reloj.ahora();
    this.asegurarVentana(ahora);

    // Réplica de la tabla real `parte_trabajo_mapeada` con los eventos de la
    // simulación; `operacion` lleva el nombre del evento (en real, un código).
    const porBloque = new Map(
      this.mundo.ciclos.map((c) => [`${c.telarId}-${c.bloque.numero}`, c])
    );
    const filas: ParteTrabajoCrudo[] = this.eventosHasta(ahora).map((e, i) => {
      const ciclo = e.bloque !== null ? porBloque.get(`${e.telarId}-${e.bloque}`) : undefined;
      const medidas = ciclo?.bloque.medidasFabrica ?? null;
      const m3 = medidas
        ? Math.round(((medidas.largoCm * medidas.altoCm * medidas.gruesoCm) / 1_000_000) * 100) / 100
        : null;
      return {
        id: i + 1,
        nTelar: String(e.telarId),
        operario1: e.operario1,
        operario2: e.operario2,
        nBloque: e.bloque,
        pmLote: e.pmLote,
        material: ciclo?.bloque.materialId ?? e.materialId,
        largo: medidas?.largoCm ?? null,
        alto: medidas?.altoCm ?? null,
        grueso: medidas?.gruesoCm ?? null,
        operacion: e.tipo,
        nPaquete: e.paquetes?.numPaquetes ?? 0,
        nTablas: e.paquetes?.numTablas ?? 0,
        largoTablas: e.paquetes ? Math.round(e.paquetes.largoTablaM * 100) : 0,
        altoTablas: e.paquetes ? Math.round(e.paquetes.altoTablaM * 100) : 0,
        gruesoTablas: e.paquetes ? Math.round(e.paquetes.gruesoTablaM * 100) : 0,
        consumo: null,
        enInventarioOdoo: null,
        bloqueConocido: true,
        accion: null,
        fechaHora: e.fechaHora,
        fechaHoraOriginal: e.fechaHora,
        fechaRemapeada: false,
        idBloque: null,
        metrosCubicos: m3,
        metrosCuadradosTablas: e.paquetes?.metrosCuadrados ?? null,
        materialRecibido: null
      };
    });
    filas.sort((a, b) => epoch(b.fechaHora ?? '') - epoch(a.fechaHora ?? ''));

    const materiales = [
      ...new Set(filas.map((f) => f.material).filter((m): m is string => m !== null))
    ].sort();
    const operaciones = [
      ...new Set(filas.map((f) => f.operacion).filter((o): o is string => o !== null))
    ].sort();

    const desdeMs = filtros.desde ? new Date(`${filtros.desde}T00:00:00`).getTime() : null;
    const hastaMs = filtros.hasta
      ? new Date(`${filtros.hasta}T00:00:00`).getTime() + 86_400_000
      : null;
    const filtradas = filas.filter((f) => {
      if (filtros.lote && String(f.pmLote ?? f.nBloque ?? '') !== filtros.lote) {
        return false;
      }
      if (filtros.telarN && f.nTelar !== filtros.telarN) {
        return false;
      }
      if (filtros.material && String(f.material) !== filtros.material) {
        return false;
      }
      if (filtros.operacion && f.operacion !== filtros.operacion) {
        return false;
      }
      const t = epoch(f.fechaHora ?? '');
      if (desdeMs !== null && t < desdeMs) {
        return false;
      }
      if (hastaMs !== null && t >= hastaMs) {
        return false;
      }
      return true;
    });

    return this.conLatencia({
      total: filtradas.length,
      limit: filtros.limit,
      offset: filtros.offset,
      items: filtradas.slice(filtros.offset, filtros.offset + filtros.limit),
      materiales,
      operaciones
    });
  }

  override getPartesDiscoPuente(
    filtros: FiltrosPartesDiscoPuente
  ): Observable<PaginaPartesDiscoPuente> {
    const ahora = this.reloj.ahora();
    this.asegurarVentana(ahora);

    // Réplica de la tabla real `parte_discopuente_mapeada`. La simulación no
    // modela un disco puente propio, así que la demo lo deriva de los partes de
    // paquetes (las tablas que produce el telar son justo lo que recorta el
    // disco puente): cada parte aporta sus m² de entrada y un rendimiento de
    // recorte hasta los m² de salida. Datos de demostración, coherentes con el
    // resto de la simulación.
    const porBloque = new Map(
      this.mundo.ciclos.map((c) => [`${c.telarId}-${c.bloque.numero}`, c])
    );
    const ACABADOS = ['PULIDO', 'APOMAZADO'];
    const filas: ParteDiscoPuenteCrudo[] = this.eventosHasta(ahora)
      .filter((e) => e.tipo === 'paquetes' && e.paquetes)
      .map((e, i) => {
        const paq = e.paquetes!;
        const ciclo = e.bloque !== null ? porBloque.get(`${e.telarId}-${e.bloque}`) : undefined;
        const medidas = ciclo?.bloque.medidasFabrica ?? null;
        const entrada = Math.round(paq.metrosCuadrados * 100) / 100;
        // Rendimiento del recorte 88-95 % según el bloque (determinista, sin azar).
        const rendimiento = 0.88 + ((e.bloque ?? 0) % 8) / 100;
        const salida = Math.round(entrada * rendimiento * 100) / 100;
        const eficiencia = entrada > 0 ? Math.round((salida / entrada) * 1000) / 10 : null;
        return {
          id: i + 1,
          discoPuenteN: String(((e.bloque ?? e.telarId) % 2) + 1),
          operario1: e.operario1,
          operario2: e.operario2,
          nBloque: e.bloque,
          pmLote: e.pmLote,
          idBloque: null,
          enInventarioOdoo: null,
          bloqueConocido: true,
          material: ciclo?.bloque.materialId ?? e.materialId,
          materialRecibido: null,
          operacion: String((i % 3) + 1),
          acabado: ACABADOS[i % ACABADOS.length],
          largo: medidas?.largoCm ?? null,
          alto: medidas?.altoCm ?? null,
          grueso: medidas?.gruesoCm ?? null,
          nPaquete: paq.numPaquetes,
          nTablas: paq.numTablas,
          contenedorSalida: null,
          largoTablas: [Math.round(paq.largoTablaM * 100), null, null, null, null, null, null, null],
          altoTablas: [Math.round(paq.altoTablaM * 100), null, null, null, null, null, null, null],
          gruesoTablas: Math.round(paq.gruesoTablaM * 100),
          consumo: null,
          metro2Entrada: entrada,
          metro2Salida: salida,
          eficienciaM2: eficiencia,
          fechaHora: e.fechaHora,
          fechaHoraOriginal: e.fechaHora,
          fechaRemapeada: false,
          sospechosa: false,
          motivosSospecha: []
        };
      });
    filas.sort((a, b) => epoch(b.fechaHora ?? '') - epoch(a.fechaHora ?? ''));

    const materiales = [
      ...new Set(filas.map((f) => f.material).filter((m): m is string => m !== null))
    ].sort();
    const operaciones = [
      ...new Set(filas.map((f) => f.operacion).filter((o): o is string => o !== null))
    ].sort();

    const desdeMs = filtros.desde ? new Date(`${filtros.desde}T00:00:00`).getTime() : null;
    const hastaMs = filtros.hasta
      ? new Date(`${filtros.hasta}T00:00:00`).getTime() + 86_400_000
      : null;
    const filtradas = filas.filter((f) => {
      if (filtros.lote && String(f.pmLote ?? f.nBloque ?? '') !== filtros.lote) {
        return false;
      }
      if (filtros.material && String(f.material) !== filtros.material) {
        return false;
      }
      if (filtros.operacion && f.operacion !== filtros.operacion) {
        return false;
      }
      const t = epoch(f.fechaHora ?? '');
      if (desdeMs !== null && t < desdeMs) {
        return false;
      }
      if (hastaMs !== null && t >= hastaMs) {
        return false;
      }
      return true;
    });

    return this.conLatencia({
      total: filtradas.length,
      limit: filtros.limit,
      offset: filtros.offset,
      items: filtradas.slice(filtros.offset, filtros.offset + filtros.limit),
      materiales,
      operaciones
    });
  }

  override getPartesReforzadora(
    filtros: FiltrosPartesReforzadora
  ): Observable<PaginaPartesReforzadora> {
    const ahora = this.reloj.ahora();
    this.asegurarVentana(ahora);

    // Réplica de la tabla real `reforzadora_mapeada`. La simulación no modela una
    // reforzadora propia, así que la demo la deriva de los partes de paquetes (las
    // tablas que salen del telar son las que luego se refuerzan con malla + resina):
    // cada parte aporta sus tablas, medidas y m². Datos de demostración.
    const porBloque = new Map(
      this.mundo.ciclos.map((c) => [`${c.telarId}-${c.bloque.numero}`, c])
    );
    const ACABADOS = ['1', '2', '3', '4'];
    const filas: ParteReforzadoraCrudo[] = this.eventosHasta(ahora)
      .filter((e) => e.tipo === 'paquetes' && e.paquetes)
      .map((e, i) => {
        const paq = e.paquetes!;
        const ciclo = e.bloque !== null ? porBloque.get(`${e.telarId}-${e.bloque}`) : undefined;
        const medidas = ciclo?.bloque.medidasFabrica ?? null;
        const largo = medidas?.largoCm ?? null;
        const alto = medidas?.altoCm ?? null;
        const nTablas = paq.numTablas;
        const metrosCuadrados =
          nTablas && largo && alto
            ? Math.round(((nTablas * largo * alto) / 10_000) * 100) / 100
            : null;
        return {
          id: i + 1,
          nReforzadora: '1',
          operario1: e.operario1,
          operario2: e.operario2,
          nBloque: e.bloque,
          pmLote: e.pmLote,
          bloqueConocido: true,
          material: ciclo?.bloque.materialId ?? e.materialId,
          nTablas,
          largo,
          alto,
          grueso: medidas?.gruesoCm ?? null,
          consumo: null,
          acabado: ACABADOS[i % ACABADOS.length],
          eventos: '99',
          metrosCuadrados,
          fechaHora: e.fechaHora,
          sospechosa: false,
          motivosSospecha: []
        };
      });
    filas.sort((a, b) => epoch(b.fechaHora ?? '') - epoch(a.fechaHora ?? ''));

    const reforzadoras = [
      ...new Set(filas.map((f) => f.nReforzadora).filter((d): d is string => d !== null))
    ].sort((a, b) => Number(a) - Number(b));
    const materiales = [
      ...new Set(filas.map((f) => f.material).filter((m): m is string => m !== null))
    ].sort();
    const acabados = [
      ...new Set(filas.map((f) => f.acabado).filter((o): o is string => o !== null))
    ].sort((a, b) => Number(a) - Number(b));

    const desdeMs = filtros.desde ? new Date(`${filtros.desde}T00:00:00`).getTime() : null;
    const hastaMs = filtros.hasta
      ? new Date(`${filtros.hasta}T00:00:00`).getTime() + 86_400_000
      : null;
    const filtradas = filas.filter((f) => {
      if (filtros.lote && String(f.pmLote ?? f.nBloque ?? '') !== filtros.lote) {
        return false;
      }
      if (filtros.reforzadora && f.nReforzadora !== filtros.reforzadora) {
        return false;
      }
      if (filtros.material && String(f.material) !== filtros.material) {
        return false;
      }
      if (filtros.acabado && f.acabado !== filtros.acabado) {
        return false;
      }
      const t = epoch(f.fechaHora ?? '');
      if (desdeMs !== null && t < desdeMs) {
        return false;
      }
      if (hastaMs !== null && t >= hastaMs) {
        return false;
      }
      return true;
    });

    return this.conLatencia({
      total: filtradas.length,
      limit: filtros.limit,
      offset: filtros.offset,
      items: filtradas.slice(filtros.offset, filtros.offset + filtros.limit),
      reforzadoras,
      materiales,
      acabados
    });
  }

  override getInventario(filtros: FiltrosInventario): Observable<PaginaInventario> {
    const ahora = this.reloj.ahora();
    this.asegurarVentana(ahora);

    // Bloques EN EXISTENCIAS, como el stock real (stock_lot on-hand): dados de
    // alta y aún sin aserrar (estado no terminal). Cada bloque expone su medida
    // de proveedor y, si ya se midió en fábrica, la de fábrica (mrp, lo normal
    // on-hand es que falte). m³ y merma se derivan aquí, no en la vista.
    const ALTA_ANTES_MS = 3 * 86_400_000;
    const filas: BloqueInventario[] = this.mundo.ciclos
      .map((ciclo, i) => ({ ciclo, altaMs: ciclo.colocacion - ALTA_ANTES_MS, id: i + 1 }))
      .filter((x) => x.altaMs <= ahora)
      .filter((x) => {
        const estado = estadoCicloDemo(x.ciclo, ahora);
        return estado !== 'almacenando' && estado !== 'aserrado';
      })
      .map(({ ciclo, altaMs, id }) => {
        const medido = ciclo.colocacion <= ahora;
        const proveedor = ciclo.bloque.medidasProveedor;
        const fabrica = ciclo.bloque.medidasFabrica;
        // Medidas en metros (la simulación las guarda en cm).
        const largoSupplier = proveedor.largoCm / 100;
        const altoSupplier = proveedor.altoCm / 100;
        const gruesoSupplier = proveedor.gruesoCm / 100;
        const largoMrp = medido ? fabrica.largoCm / 100 : null;
        const altoMrp = medido ? fabrica.altoCm / 100 : null;
        const gruesoMrp = medido ? fabrica.gruesoCm / 100 : null;
        const m3Supplier = largoSupplier * altoSupplier * gruesoSupplier;
        const m3Mrp =
          largoMrp !== null && altoMrp !== null && gruesoMrp !== null
            ? largoMrp * altoMrp * gruesoMrp
            : null;
        const mermaPct =
          m3Mrp !== null && m3Supplier > 0
            ? ((m3Supplier - m3Mrp) / m3Supplier) * 100
            : null;
        return {
          id,
          // La simulación modela el stock on-hand; no genera la era "alta".
          fuente: 'stock',
          name: String(ciclo.bloque.numero),
          material: ciclo.bloque.materialId,
          materialNombre: materialPorId(ciclo.bloque.materialId).nombre,
          // type_product_lot de Odoo: la mayoría 'block'; algunos 'othermaterial'.
          tipo: ciclo.bloque.numero % 5 === 0 ? 'othermaterial' : 'block',
          ubicacion: 'WH/Stock',
          largoSupplier,
          altoSupplier,
          gruesoSupplier,
          largoMrp,
          altoMrp,
          gruesoMrp,
          m3Supplier,
          m3Mrp,
          // La simulación conoce las medidas reales de sus bloques: nunca imposibles.
          m3SupplierImposible: false,
          m3MrpImposible: false,
          mermaPct,
          createDate: new Date(altaMs).toISOString(),
          writeDate: new Date(medido ? ciclo.colocacion : altaMs).toISOString()
        } satisfies BloqueInventario;
      });
    filas.sort((a, b) => epoch(b.createDate ?? '') - epoch(a.createDate ?? ''));

    const materiales = [
      ...new Set(
        filas.map((f) => f.materialNombre).filter((n): n is string => n !== null)
      )
    ].sort((a, b) => a.localeCompare(b, 'es'));

    const q = filtros.q?.toLowerCase() ?? null;
    const desdeMs = filtros.desde ? new Date(`${filtros.desde}T00:00:00`).getTime() : null;
    const hastaMs = filtros.hasta
      ? new Date(`${filtros.hasta}T00:00:00`).getTime() + 86_400_000
      : null;
    const filtradas = filas.filter((f) => {
      if (filtros.material && f.materialNombre !== filtros.material) {
        return false;
      }
      if (q !== null && !f.name?.toLowerCase().includes(q)) {
        return false;
      }
      const t = epoch(f.createDate ?? '');
      if (desdeMs !== null && t < desdeMs) {
        return false;
      }
      if (hastaMs !== null && t >= hastaMs) {
        return false;
      }
      return true;
    });

    return this.conLatencia({
      total: filtradas.length,
      limit: filtros.limit,
      offset: filtros.offset,
      items: filtradas.slice(filtros.offset, filtros.offset + filtros.limit),
      materiales
    });
  }

  override getResumenInventario(): Observable<InventarioVistaConjunta> {
    const ahora = this.reloj.ahora();
    this.asegurarVentana(ahora);
    const ALTA_ANTES_MS = 3 * 86_400_000;

    // Bloques EN EXISTENCIAS: dados de alta y aún sin aserrar (estado no
    // terminal). Mismo criterio que el backend real. m³ en metros (la sim los
    // guarda en cm), agrupado por nombre de material.
    const porBloques = new Map<string, { cantidad: number; piezas: number }>();
    for (const ciclo of this.mundo.ciclos) {
      if (ciclo.colocacion - ALTA_ANTES_MS > ahora) {
        continue;
      }
      const estado = estadoCicloDemo(ciclo, ahora);
      if (estado === 'almacenando' || estado === 'aserrado') {
        continue;
      }
      const prov = ciclo.bloque.medidasProveedor;
      const m3 = (prov.largoCm / 100) * (prov.altoCm / 100) * (prov.gruesoCm / 100);
      const nombre = materialPorId(ciclo.bloque.materialId).nombre;
      const acc = porBloques.get(nombre) ?? { cantidad: 0, piezas: 0 };
      acc.cantidad += m3;
      acc.piezas += 1;
      porBloques.set(nombre, acc);
    }

    // Tablas: vista PREVIA de la demo (m² por material de los paquetes ya
    // hechos). La fuente real aún no trae tablas en existencias → en real va
    // como pendiente; aquí la demo enseña a qué se parecerá el mapa.
    const porTablas = new Map<string, { cantidad: number; piezas: number }>();
    for (const evento of this.eventosHasta(ahora)) {
      if (evento.tipo !== 'paquetes' || !evento.paquetes) {
        continue;
      }
      const nombre = materialPorId(evento.materialId ?? 'desconocido').nombre;
      const acc = porTablas.get(nombre) ?? { cantidad: 0, piezas: 0 };
      acc.cantidad += evento.paquetes.metrosCuadrados;
      acc.piezas += evento.paquetes.numTablas;
      porTablas.set(nombre, acc);
    }

    const formas: ResumenInventario[] = [
      this.aResumenForma('bloques', 'm³', porBloques),
      this.aResumenForma('tablas', 'm²', porTablas),
      // La simulación no modela losas: pendiente, igual que el modo real.
      { forma: 'losas', unidad: 'm²', pendiente: true, totalCantidad: 0, totalPiezas: 0, materiales: [] }
    ];
    return this.conLatencia({ generadoEn: new Date(ahora).toISOString(), formas });
  }

  override getCoberturaMaquinas(): Observable<CoberturaMaquinas> {
    const ahora = this.reloj.ahora();
    this.asegurarVentana(ahora);
    const ahoraIso = new Date(ahora).toISOString();

    // Volumen por telar (filas = ciclos, lotes = bloques distintos) y del disco
    // puente Gómez (los partes de paquetes), derivados de la simulación.
    const ciclos = this.mundo.ciclos.filter((c) => c.colocacion <= ahora);
    const lotesPorTelar = new Map<number, Set<number>>();
    const filasPorTelar = new Map<number, number>();
    for (const c of ciclos) {
      filasPorTelar.set(c.telarId, (filasPorTelar.get(c.telarId) ?? 0) + 1);
      const set = lotesPorTelar.get(c.telarId) ?? new Set<number>();
      set.add(c.bloque.numero);
      lotesPorTelar.set(c.telarId, set);
    }

    const eventosDisco = this.eventosHasta(ahora).filter(
      (e) => e.tipo === 'paquetes' && e.paquetes
    );
    const discoFilas = eventosDisco.length;
    const discoLotes = new Set(
      eventosDisco.map((e) => e.bloque).filter((b): b is number => b !== null)
    ).size;
    // Para la tarjeta de Gómez en la sala: material del último parte y m² de hoy.
    const inicioHoy = (() => {
      const d = new Date(ahora);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })();
    const ultimoEventoDisco = eventosDisco.reduce<(typeof eventosDisco)[number] | null>(
      (ultimo, e) =>
        !ultimo || epoch(e.fechaHora ?? '') >= epoch(ultimo.fechaHora ?? '') ? e : ultimo,
      null
    );
    const matNum = Number(ultimoEventoDisco?.materialId);
    const discoUltimoMaterial = Number.isFinite(matNum) ? matNum : null;
    const discoM2Hoy = eventosDisco
      .filter((e) => {
        const t = epoch(e.fechaHora ?? '');
        return t >= inicioHoy && t <= ahora;
      })
      .reduce((suma, e) => suma + (e.paquetes?.metrosCuadrados ?? 0), 0);
    const discoM2HoyValor = discoM2Hoy > 0 ? Math.round(discoM2Hoy * 10) / 10 : null;

    const maquinas: CoberturaMaquina[] = CATALOGO_MAQUINAS_DEMO.map((d) => {
      const base = {
        codigo: d.codigo,
        nombre: d.nombre,
        seccion: d.seccion,
        familia: d.familia,
        fuenteDatos: d.fuenteDatos,
        ultimoMaterial: null,
        m2EntradaHoy: null,
        estado: d.estado
      };
      if (d.telarId !== undefined) {
        const filas = filasPorTelar.get(d.telarId) ?? 0;
        return {
          ...base,
          filas,
          lotes: lotesPorTelar.get(d.telarId)?.size ?? 0,
          ultimaActividad: filas > 0 ? ahoraIso : null,
          nota: d.notaBase ?? null
        };
      }
      if (d.esDiscoPuente) {
        // Gómez es el único disco puente con PLC: todo el flujo es suyo.
        return {
          ...base,
          filas: discoFilas,
          lotes: discoLotes,
          ultimaActividad: discoFilas > 0 ? ahoraIso : null,
          ultimoMaterial: discoUltimoMaterial,
          m2EntradaHoy: discoM2HoyValor,
          nota:
            'Único disco puente integrado (con PLC); todo el flujo es suyo. ' +
            'Terzago y Cáñigo aún sin integrar.'
        };
      }
      if (d.esReforzadora) {
        return {
          ...base,
          filas: null,
          lotes: null,
          ultimaActividad: null,
          nota:
            'Flujo combinado: el dato no separa REFORZADORA 1 de REFORZADORA 2 ' +
            `SEI — todo llega como un único n_reforzadora. ${discoFilas} partes y ` +
            `${discoLotes} lotes registrados, sin atribuir a esta máquina. ` +
            'Pendiente que INDASEL etiquete la máquina física por parte.'
        };
      }
      return {
        ...base,
        filas: null,
        lotes: null,
        ultimaActividad: null,
        nota: d.notaBase ?? null
      };
    });

    return this.conLatencia({ generadoEn: ahoraIso, maquinas });
  }

  /** Construye una forma del resumen a partir de su acumulador por material. */
  private aResumenForma(
    forma: FormaInventario,
    unidad: string,
    porMaterial: Map<string, { cantidad: number; piezas: number }>
  ): ResumenInventario {
    const materiales = [...porMaterial.entries()]
      .map(([material, v]) => ({
        material,
        cantidad: Math.round(v.cantidad * 100) / 100,
        piezas: v.piezas
      }))
      .sort((a, b) => b.cantidad - a.cantidad);
    return {
      forma,
      unidad,
      pendiente: false,
      totalCantidad: Math.round(materiales.reduce((s, m) => s + m.cantidad, 0) * 100) / 100,
      totalPiezas: materiales.reduce((s, m) => s + m.piezas, 0),
      materiales
    };
  }

  // ── Derivaciones ────────────────────────────────────────────────────────

  private lecturas(telarId: number): LecturaTelar[] {
    return this.mundo.lecturasPorTelar.get(telarId) ?? [];
  }

  private lecturasValidas(telarId: number, desde: number, hasta: number): LecturaTelar[] {
    return this.lecturas(telarId).filter((l) => {
      if (l.sospechosa) {
        return false;
      }
      const t = epoch(l.recibidaEn);
      return t >= desde && t <= hasta;
    });
  }

  private eventosHasta(ahora: number): EventoParte[] {
    return this.mundo.eventos.filter((evento) => epoch(evento.fechaHora) <= ahora);
  }

  /** Actividad del operario (demo): deriva del último evento simulado del telar. */
  private actividadParteDemo(telarId: number, ahora: number): ActividadParte | null {
    const ultimo = this.mundo.eventos
      .filter((e) => e.telarId === telarId && epoch(e.fechaHora) <= ahora)
      .reduce<EventoParte | null>(
        (max, e) =>
          max === null || epoch(e.fechaHora) > epoch(max.fechaHora) ? e : max,
        null
      );
    if (!ultimo) {
      return null;
    }
    const mapa: Record<TipoEvento, { etiqueta: string; categoria: ActividadParte['categoria'] }> = {
      colocacion: { etiqueta: 'Colocando', categoria: 'operacion' },
      aserrado: { etiqueta: 'Aserrando', categoria: 'operacion' },
      salida: { etiqueta: 'Salida de Bloque', categoria: 'operacion' },
      paquetes: { etiqueta: 'Haciendo Paquetes', categoria: 'operacion' },
      'fin-jornada': { etiqueta: 'Fin de jornada', categoria: 'fin-jornada' }
    };
    const m = mapa[ultimo.tipo];
    if (
      m.categoria !== 'fin-jornada' &&
      ahora - epoch(ultimo.fechaHora) > VENTANA_ACTIVIDAD_MS
    ) {
      return null;
    }
    return { etiqueta: m.etiqueta, categoria: m.categoria, desde: ultimo.fechaHora };
  }

  private snapshotTelar(telarId: number, ahora: number): SnapshotTelar {
    const validas = this.lecturasValidas(telarId, ahora - 86_400_000, ahora);
    const ultimaValida = validas.length > 0 ? validas[validas.length - 1] : null;
    // "Hace cuánto" llegó el último dato, SIEMPRE: la última lectura recibida
    // (fresca o no), independiente de la frescura que decide `estado`.
    const ultimaLecturaEn = this.lecturas(telarId).reduce<string | null>((max, l) => {
      const t = epoch(l.recibidaEn);
      return t <= ahora && (max === null || t > epoch(max)) ? l.recibidaEn : max;
    }, null);
    const ciclo = cicloEn(this.mundo.ciclos, telarId, ahora);
    const cortando = !!ciclo && ahora >= ciclo.inicioCorte && ahora < ciclo.finCorte;

    let estado: EstadoTelar = 'sin-datos';
    if (ultimaValida && ahora - epoch(ultimaValida.recibidaEn) <= UMBRAL_SIN_DATOS_MS) {
      estado = this.mapearEstado(ultimaValida.incidencia);
    }

    const alturaContinua = ciclo ? alturaEn(ciclo, ahora) : null;
    const progresoPct =
      ciclo && alturaContinua !== null && ahora >= ciclo.inicioCorte
        ? Math.min(100, ((ciclo.alturaInicialMm - alturaContinua) / ciclo.alturaInicialMm) * 100)
        : ciclo
          ? 0
          : null;

    // ETA estimada como lo haría el servidor real: altura restante / consigna.
    const etaFinCorte =
      ciclo && cortando && alturaContinua !== null && ciclo.velocidadMmH > 0
        ? new Date(ahora + (alturaContinua / ciclo.velocidadMmH) * 3_600_000).toISOString()
        : null;

    const [operario1, operario2] = operariosDe(ahora);
    return {
      telarId,
      nombre: NOMBRES_TELAR.get(telarId) ?? `Telar ${telarId}`,
      estado,
      estadoDesde: this.inicioEstadoActual(validas, estado),
      causaParo:
        estado === 'paro' || estado === 'incidencia' || estado === 'cambio-bloque'
          ? (ultimaValida?.incidencia ?? null)
          : null,
      actividadParte: this.actividadParteDemo(telarId, ahora),
      bloque: ciclo?.bloque ?? null,
      ultimaLectura: ultimaValida,
      ultimaLecturaEn,
      alturaInicialMm: ciclo?.alturaInicialMm ?? null,
      progresoPct,
      etaFinCorte,
      tablasPrevistas: ciclo ? tablasPrevistas(ciclo.bloque.medidasFabrica) : null,
      m2Previstos: ciclo ? Math.round(m2Previstos(ciclo.bloque) * 10) / 10 : null,
      desvioRitmo: this.desvioRitmo(validas, ciclo),
      turno: turnoDe(ahora),
      operario1,
      operario2,
      seriePotencia: validas
        .filter((l) => epoch(l.recibidaEn) >= ahora - 2 * 3_600_000)
        .map((l) => ({ t: l.recibidaEn, v: l.potenciaKw })),
      datosSospechosos: this.lecturas(telarId).some(
        (l) =>
          l.sospechosa &&
          epoch(l.recibidaEn) >= ahora - 86_400_000 &&
          epoch(l.recibidaEn) <= ahora
      ),
      datosConAvisos: this.lecturas(telarId).some(
        (l) =>
          !l.sospechosa &&
          l.alertas.length > 0 &&
          epoch(l.recibidaEn) >= ahora - 86_400_000 &&
          epoch(l.recibidaEn) <= ahora
      )
    };
  }

  private mapearEstado(incidencia: TipoIncidencia): EstadoTelar {
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

  private inicioEstadoActual(validas: LecturaTelar[], estado: EstadoTelar): string | null {
    if (validas.length === 0 || estado === 'sin-datos') {
      return null;
    }
    let inicio: string | null = null;
    for (let i = validas.length - 1; i >= 0; i--) {
      if (this.mapearEstado(validas[i].incidencia) !== estado) {
        break;
      }
      // Un hueco sin datos fiables corta la racha: no se asume continuidad.
      if (inicio && new Date(inicio).getTime() - epoch(validas[i].recibidaEn) > UMBRAL_SIN_DATOS_MS) {
        break;
      }
      inicio = validas[i].recibidaEn;
    }
    return inicio;
  }

  /** Ritmo real de descenso (últimas 6 lecturas en marcha) frente a consigna. */
  private desvioRitmo(validas: LecturaTelar[], ciclo: CicloSim | null): DesvioRitmo | null {
    if (!ciclo) {
      return null;
    }
    // Solo con una ventana íntegra en marcha: si la cruza un paro, el ritmo
    // medido se desploma y el desvío sería un falso positivo.
    const delBloque = validas.filter((l) => l.bloque === ciclo.bloque.numero);
    const ventana = delBloque.slice(-6);
    if (ventana.length < 3 || ventana.some((l) => l.incidencia !== 'marcha')) {
      return null;
    }
    const primera = ventana[0];
    const ultima = ventana[ventana.length - 1];
    const deltaHoras = (epoch(ultima.recibidaEn) - epoch(primera.recibidaEn)) / 3_600_000;
    if (deltaHoras <= 0) {
      return null;
    }
    const realMmH = (primera.alturaActualMm - ultima.alturaActualMm) / deltaHoras;
    const consigna = ciclo.velocidadMmH;
    return {
      consignaMmH: consigna,
      realMmH: Math.round(realMmH),
      desvioPct: consigna > 0 ? Math.round(((realMmH - consigna) / consigna) * 1000) / 10 : 0
    };
  }

  private kpisPlanta(telares: SnapshotTelar[], ahora: number): KpisPlanta {
    const desdeDia = inicioDia(ahora);
    const minutosDia = Math.max(1, (ahora - desdeDia) / 60_000);

    let minutosMarcha = 0;
    let parosHoy = 0;
    let minutosParo = 0;
    let minutosRotura = 0;
    for (const telarId of TELAR_IDS) {
      const validasHoy = this.lecturasValidas(telarId, desdeDia, ahora);
      minutosMarcha +=
        validasHoy.filter((l) => l.incidencia === 'marcha').length * MINUTOS_POR_LECTURA;
      const tramos = tramosDeParo(validasHoy);
      parosHoy += tramos.length;
      for (const tramo of tramos) {
        const minutos = tramo.lecturas * MINUTOS_POR_LECTURA;
        minutosParo += minutos;
        if (tramo.causa === 'rotura-fleje') {
          minutosRotura += minutos;
        }
      }
    }

    const paquetesHoy = this.eventosHasta(ahora).filter(
      (e) => e.tipo === 'paquetes' && e.paquetes && epoch(e.fechaHora) >= desdeDia
    );

    return {
      telaresCortando: telares.filter((t) => t.estado === 'marcha').length,
      telaresTotales: TELAR_IDS.length,
      utilizacionHoyPct: Math.min(
        100,
        (minutosMarcha / (TELAR_IDS.length * minutosDia)) * 100
      ),
      m2Hoy:
        Math.round(
          paquetesHoy.reduce((suma, e) => suma + (e.paquetes?.metrosCuadrados ?? 0), 0) * 10
        ) / 10,
      tablasHoy: paquetesHoy.reduce((suma, e) => suma + (e.paquetes?.numTablas ?? 0), 0),
      parosHoy,
      minutosParoHoy: Math.round(minutosParo),
      minutosRoturaHoy: Math.round(minutosRotura)
    };
  }

  private segmentos(validas: LecturaTelar[]): SegmentoEstado[] {
    const segmentos: SegmentoEstado[] = [];
    for (const lectura of validas) {
      const previo = segmentos[segmentos.length - 1];
      const inicio = epoch(lectura.recibidaEn);
      const finLectura = new Date(inicio + INTERVALO_LECTURA_MS).toISOString();
      const hueco = previo ? inicio - epoch(previo.hasta) : 0;
      // Una lectura en cuarentena intermedia se puentea; un hueco largo sin dato
      // fiable se marca como 'sin-datos' (no se une, eso inventaría una tendencia).
      if (previo && hueco > UMBRAL_SIN_DATOS_MS) {
        segmentos.push({ desde: previo.hasta, hasta: lectura.recibidaEn, incidencia: 'sin-datos' });
        segmentos.push({ desde: lectura.recibidaEn, hasta: finLectura, incidencia: lectura.incidencia });
        continue;
      }
      const continua =
        previo &&
        previo.incidencia === lectura.incidencia &&
        hueco <= INTERVALO_LECTURA_MS * 1.5;
      if (continua) {
        previo.hasta = finLectura;
      } else {
        segmentos.push({ desde: lectura.recibidaEn, hasta: finLectura, incidencia: lectura.incidencia });
      }
    }
    return segmentos;
  }

  private disponibilidadTurno(telarId: number, ahora: number): number | null {
    const inicioTurno = this.inicioTurno(ahora);
    const minutosTurno = (ahora - inicioTurno) / 60_000;
    if (minutosTurno < MINUTOS_POR_LECTURA) {
      return null;
    }
    const validas = this.lecturasValidas(telarId, inicioTurno, ahora);
    const minutosMarcha =
      validas.filter((l) => l.incidencia === 'marcha').length * MINUTOS_POR_LECTURA;
    return Math.min(100, (minutosMarcha / minutosTurno) * 100);
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
    return hora >= 22 ? dia + 22 * 3_600_000 : dia - 2 * 3_600_000; // noche: arrancó a las 22:00
  }

  private mtbfFleje(
    telarId: number,
    ahora: number
  ): { mtbfFleje7dHoras: number | null; roturas7d: number } {
    const validas = this.lecturasValidas(telarId, ahora - 7 * 86_400_000, ahora);
    const horasMarcha =
      (validas.filter((l) => l.incidencia === 'marcha').length * MINUTOS_POR_LECTURA) / 60;
    const roturas = tramosDeParo(validas).filter((t) => t.causa === 'rotura-fleje').length;
    return {
      mtbfFleje7dHoras: roturas > 0 ? Math.round((horasMarcha / roturas) * 10) / 10 : null,
      roturas7d: roturas
    };
  }

  /** Ratio amperios / velocidad: si sube sostenido, el fleje está fatigado. */
  private vigiaFleje(telarId: number, ciclo: CicloSim | null, ahora: number): VigiaFleje {
    if (!ciclo) {
      return { ratioActual: null, ratioMediana: null, fatigado: false };
    }
    const enMarcha = this.lecturasValidas(telarId, ciclo.inicioCorte, ahora).filter(
      (l) => l.incidencia === 'marcha' && l.velocidadMmH > 0
    );
    const ratios = enMarcha.map((l) => l.amperios / l.velocidadMmH);
    const med = mediana(ratios);
    const ultimas = ratios.slice(-12);
    const actual = ultimas.length > 0 ? media(ultimas) : null;
    return {
      ratioActual: actual !== null ? Math.round(actual * 100) / 100 : null,
      ratioMediana: med !== null ? Math.round(med * 100) / 100 : null,
      fatigado: actual !== null && med !== null && ultimas.length >= 12 && actual > med * 1.15
    };
  }

  private aCicloBloque(ciclo: CicloSim, ahora: number): CicloBloque {
    const msParos = ciclo.paros.reduce((suma, paro) => suma + (paro.hasta - paro.desde), 0);
    const enCurso = ciclo.salida > ahora;
    const paquetes = ciclo.paquetesEn <= ahora ? ciclo.resumenPaquetes : null;
    const m3 = volumenM3(ciclo.bloque);
    // Rendimiento solo con parte real sobre m³ (igual que el modo real).
    const rendimientoM2M3 =
      paquetes !== null && m3 > 0 ? Math.round((paquetes.metrosCuadrados / m3) * 100) / 100 : null;
    return {
      id: ciclo.id,
      telarId: ciclo.telarId,
      bloque: ciclo.bloque,
      pmLote: ciclo.bloque.pmLote,
      colocacion: new Date(ciclo.colocacion).toISOString(),
      inicioCorte: new Date(ciclo.inicioCorte).toISOString(),
      finCorte: ciclo.finCorte <= ahora ? new Date(ciclo.finCorte).toISOString() : null,
      paquetes,
      horasMarcha:
        Math.round(((Math.min(ciclo.finCorte, ahora) - ciclo.inicioCorte - msParos) / 3_600_000) * 10) /
        10,
      horasParo: Math.round((msParos / 3_600_000) * 10) / 10,
      numParos: ciclo.paros.length,
      tablasPrevistas: tablasPrevistas(ciclo.bloque.medidasFabrica),
      m2Previstos: Math.round(m2Previstos(ciclo.bloque) * 10) / 10,
      // Espesor de corte real del parte (igual que el modo real); null sin parte.
      espesorCorteCm:
        paquetes !== null && paquetes.gruesoTablaM > 0
          ? Math.round(paquetes.gruesoTablaM * 100 * 10) / 10
          : null,
      volumenM3: Math.round(m3 * 100) / 100,
      rendimientoM2M3,
      // La demo es 1 bloque por PM (1:1): m³ exacto, sin estimación ni duplicado.
      bloquesEnLote: 1,
      volumenEstimado: false,
      pmDuplicado: false,
      // La simulación conoce las medidas reales de sus bloques: nunca imposibles.
      volumenImposible: false,
      // El m³ de la demo es coherente con su parte: nunca infradimensionado.
      volumenIncompatibleParte: false,
      mermaVolumenPct: Math.round(mermaVolumenPct(ciclo.bloque) * 10) / 10,
      enCurso,
      // La simulación conoce las medidas reales de sus bloques: siempre coherentes.
      medidasIncoherentes: false,
      // La demo liga cada PM a su telar real: nunca hay PM heredada de otro telar.
      parteEnOtroTelar: false
    };
  }

  private estadisticasTelar(telarId: number, desde: number, hasta: number): EstadisticasTelar {
    const validas = this.lecturasValidas(telarId, desde, hasta);
    const total = validas.length;
    const marcha = validas.filter((l) => l.incidencia === 'marcha');
    const paro = validas.filter(
      (l) => l.incidencia === 'paro' || l.incidencia === 'rotura-fleje'
    );
    const cambio = validas.filter((l) => l.incidencia === 'cambio-bloque');

    const tramos = tramosDeParo(validas);
    const causas: TipoIncidencia[] = ['paro', 'rotura-fleje'];
    const parosPorCausa: ParoPorCausa[] = causas.map((causa) => {
      const deCausa = tramos.filter((t) => t.causa === causa);
      return {
        causa,
        minutos: Math.round(
          deCausa.reduce((suma, t) => suma + t.lecturas * MINUTOS_POR_LECTURA, 0)
        ),
        numero: deCausa.length
      };
    });

    const paquetes = this.eventosHasta(hasta).filter(
      (e) =>
        e.telarId === telarId && e.tipo === 'paquetes' && e.paquetes && epoch(e.fechaHora) >= desde
    );
    const salidas = this.eventosHasta(hasta).filter(
      (e) => e.telarId === telarId && e.tipo === 'salida' && epoch(e.fechaHora) >= desde
    );

    return {
      telarId,
      nombre: NOMBRES_TELAR.get(telarId) ?? `Telar ${telarId}`,
      pctMarcha: total > 0 ? (marcha.length / total) * 100 : 0,
      pctParo: total > 0 ? (paro.length / total) * 100 : 0,
      pctCambioBloque: total > 0 ? (cambio.length / total) * 100 : 0,
      horasMarcha: Math.round(((marcha.length * MINUTOS_POR_LECTURA) / 60) * 10) / 10,
      horasParo: Math.round(((paro.length * MINUTOS_POR_LECTURA) / 60) * 10) / 10,
      horasCambioBloque: Math.round(((cambio.length * MINUTOS_POR_LECTURA) / 60) * 10) / 10,
      m2:
        Math.round(paquetes.reduce((suma, e) => suma + (e.paquetes?.metrosCuadrados ?? 0), 0) * 10) /
        10,
      tablas: paquetes.reduce((suma, e) => suma + (e.paquetes?.numTablas ?? 0), 0),
      bloquesCompletados: salidas.length,
      golpesMedios: Math.round(media(marcha.map((l) => l.golpesPorMinuto))),
      velocidadMediaMmH: Math.round(media(marcha.map((l) => l.velocidadMmH))),
      amperiosMedios: Math.round(media(marcha.map((l) => l.amperios))),
      // Consumo eléctrico medio en marcha (kW); null sin lecturas en marcha.
      potenciaMediaKw:
        marcha.length > 0 ? Math.round(media(marcha.map((l) => l.potenciaKw)) * 10) / 10 : null,
      parosPorCausa
    };
  }

  private produccionPorDia(
    paquetes: EventoParte[],
    desde: number,
    hasta: number,
    granularidad: Granularidad
  ): ProduccionDia[] {
    const periodos: ProduccionDia[] = [];
    // Cursor con calendario local (vía core/periodos.ts): avanzar por bloques
    // fijos descuadraría los buckets al cruzar un cambio de hora.
    let cursor = inicioPeriodo(desde, granularidad);
    while (cursor <= hasta) {
      const fin = siguientePeriodo(cursor, granularidad);
      const delPeriodo = paquetes.filter((e) => {
        const t = epoch(e.fechaHora);
        return t >= cursor && t < fin;
      });
      const m2PorTelar: Record<number, number> = {};
      for (const telarId of TELAR_IDS) {
        m2PorTelar[telarId] =
          Math.round(
            delPeriodo
              .filter((e) => e.telarId === telarId)
              .reduce((suma, e) => suma + (e.paquetes?.metrosCuadrados ?? 0), 0) * 10
          ) / 10;
      }
      periodos.push({
        fecha: new Date(cursor).toISOString(),
        m2PorTelar,
        m2Total:
          Math.round(
            delPeriodo.reduce((suma, e) => suma + (e.paquetes?.metrosCuadrados ?? 0), 0) * 10
          ) / 10,
        tablas: delPeriodo.reduce((suma, e) => suma + (e.paquetes?.numTablas ?? 0), 0)
      });
      cursor = fin;
    }
    return periodos;
  }

  private produccionPorOperario(paquetes: EventoParte[]): ProduccionOperario[] {
    const porOperario = new Map<string, ProduccionOperario>();
    for (const evento of paquetes) {
      const nombre = evento.operario1 ?? 'Sin operario';
      const acumulado =
        porOperario.get(nombre) ?? { operario: nombre, partes: 0, tablas: 0, m2: 0 };
      acumulado.partes += 1;
      acumulado.tablas += evento.paquetes?.numTablas ?? 0;
      acumulado.m2 += evento.paquetes?.metrosCuadrados ?? 0;
      porOperario.set(nombre, acumulado);
    }
    return [...porOperario.values()]
      .map((p) => ({ ...p, m2: Math.round(p.m2 * 10) / 10 }))
      .sort((a, b) => b.m2 - a.m2);
  }

  private produccionPorMaterial(paquetes: EventoParte[]): ProduccionMaterial[] {
    // En la simulación el m² siempre existe (no así en la fuente real).
    const porMaterial = new Map<string, { materialId: string; m2: number; bloques: number }>();
    for (const evento of paquetes) {
      const materialId = evento.materialId ?? 'desconocido';
      const acumulado = porMaterial.get(materialId) ?? { materialId, m2: 0, bloques: 0 };
      acumulado.m2 += evento.paquetes?.metrosCuadrados ?? 0;
      acumulado.bloques += 1;
      porMaterial.set(materialId, acumulado);
    }
    return [...porMaterial.values()]
      .map((p) => ({ ...p, m2: Math.round(p.m2 * 10) / 10 }))
      .sort((a, b) => b.m2 - a.m2);
  }

  private roturas(desde: number, hasta: number): RoturaFleje[] {
    const roturas: RoturaFleje[] = [];
    for (const telarId of TELAR_IDS) {
      const validas = this.lecturasValidas(telarId, desde, hasta);
      for (const tramo of tramosDeParo(validas)) {
        if (tramo.causa !== 'rotura-fleje') {
          continue;
        }
        const ciclo = cicloEn(this.mundo.ciclos, telarId, epoch(tramo.inicio.recibidaEn));
        roturas.push({
          telarId,
          fechaHora: tramo.inicio.recibidaEn,
          bloque: tramo.inicio.bloque,
          pmLote: tramo.inicio.pmLote,
          materialId: ciclo?.bloque.materialId ?? null,
          minutos: Math.round(tramo.lecturas * MINUTOS_POR_LECTURA)
        });
      }
    }
    return roturas.sort((a, b) => epoch(b.fechaHora) - epoch(a.fechaHora));
  }

  private jornadaTelar(telarId: number, ahora: number): JornadaTelar {
    const validas = this.lecturasValidas(telarId, inicioDia(ahora), ahora);
    return {
      telarId,
      nombre: NOMBRES_TELAR.get(telarId) ?? `Telar ${telarId}`,
      segmentos: this.segmentos(validas)
    };
  }

  private conLatencia<T>(valor: T): Observable<T> {
    return of(valor).pipe(delay(150 + Math.random() * 250));
  }
}
