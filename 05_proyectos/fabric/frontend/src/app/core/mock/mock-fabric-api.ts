import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { FabricApi } from '../fabric-api';
import {
  Bloque,
  BloqueInventario,
  CicloBloque,
  DesvioRitmo,
  DetalleTelar,
  Estadisticas,
  EstadisticasTelar,
  EstadoCicloBloque,
  EstadoTelar,
  EventoParte,
  FiltrosInventario,
  FiltrosLecturas,
  FiltrosPartesTrabajo,
  JornadaTelar,
  KpisPlanta,
  LecturaCruda,
  LecturaCuarentena,
  LecturaTelar,
  PaginaInventario,
  PaginaLecturas,
  PaginaPartes,
  PaginaPartesTrabajo,
  ParoPorCausa,
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
 * Estado de ciclo del bloque en la demo, a partir de los hitos del ciclo y el
 * reloj virtual. Réplica de la lógica real (`estado-ciclo.ts` del backend),
 * que la deriva de los partes op. 1-4; aquí los hitos equivalen a esos partes:
 * colocacion→op1, inicioCorte→op2, salida→op3, paquetesEn→op4.
 */
function estadoCicloDemo(ciclo: CicloSim, ahora: number): EstadoCicloBloque {
  if (ahora >= ciclo.paquetesEn) {
    return ahora - ciclo.paquetesEn < ALMACENANDO_MS ? 'almacenando' : 'almacenado';
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
    const desdeDia = inicioDia(ahora);
    const validasJornada = this.lecturasValidas(telarId, desdeDia, ahora);
    const ciclo = cicloEn(this.mundo.ciclos, telarId, ahora);

    const detalle: DetalleTelar = {
      snapshot,
      serieAltura: validasJornada.map((l) => ({ t: l.recibidaEn, v: l.alturaActualMm })),
      seriePotencia: validasJornada.map((l) => ({ t: l.recibidaEn, v: l.potenciaKw })),
      serieGolpes: validasJornada.map((l) => ({ t: l.recibidaEn, v: l.golpesPorMinuto })),
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
    // Rangos por días = días naturales completos incluyendo hoy, con
    // calendario local (los días de cambio horario no duran 24 h).
    const fecha = new Date(ahora);
    const desde =
      rango === 'hoy'
        ? inicioDia(ahora)
        : new Date(
            fecha.getFullYear(),
            fecha.getMonth(),
            fecha.getDate() - (rango === '7d' ? 6 : 29)
          ).getTime();

    const porTelar = TELAR_IDS.map((telarId) => this.estadisticasTelar(telarId, desde, ahora));
    const eventosRango = this.eventosHasta(ahora).filter((e) => epoch(e.fechaHora) >= desde);
    const paquetes = eventosRango.filter((e) => e.tipo === 'paquetes' && e.paquetes);
    const salidas = eventosRango.filter((e) => e.tipo === 'salida');

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
      desde: new Date(desde).toISOString(),
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
      produccionPorDia: this.produccionPorDia(paquetes, desde, ahora),
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

    const telares: SaludTelar[] = TELAR_IDS.map((telarId) => {
      const lecturas = this.lecturas(telarId).filter(
        (l) => epoch(l.recibidaEn) >= desde && epoch(l.recibidaEn) <= ahora
      );
      const fiables = lecturas.filter((l) => !l.sospechosa).length;
      return {
        telarId,
        nombre: NOMBRES_TELAR.get(telarId) ?? `Telar ${telarId}`,
        lecturas7d: lecturas.length,
        fiables7d: fiables,
        pctFiables: lecturas.length > 0 ? (fiables / lecturas.length) * 100 : 100
      };
    });

    const cuarentena: LecturaCuarentena[] = TELAR_IDS.flatMap((telarId) =>
      this.lecturas(telarId).filter(
        (l) => l.sospechosa && epoch(l.recibidaEn) >= desde && epoch(l.recibidaEn) <= ahora
      )
    )
      .sort((a, b) => epoch(b.recibidaEn) - epoch(a.recibidaEn))
      .slice(0, 60)
      .map((lectura) => ({ lectura, motivos: lectura.motivosSospecha }));

    return this.conLatencia({
      generadoEn: new Date(ahora).toISOString(),
      telares,
      cuarentena,
      // La salud de partes solo aplica a la tabla real.
      partes: null
    });
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

  override getInventario(filtros: FiltrosInventario): Observable<PaginaInventario> {
    const ahora = this.reloj.ahora();
    this.asegurarVentana(ahora);

    // Réplica de la tabla real `lot_block_creation` con los bloques de la
    // simulación: el alta en almacén precede unos días a la colocación en el
    // telar, y los bloques aún no colocados siguen sin medida de fábrica. Como
    // en real, el proveedor va en `ref` (texto) y `supplier` queda vacío.
    const ALTA_ANTES_MS = 3 * 86_400_000;
    const PROVEEDORES = [
      'CANTERAS DEL LEVANTE',
      'MÁRMOLES ALMANZORA',
      'PIEDRAS HNOS. GARCÍA'
    ];
    const filas: BloqueInventario[] = this.mundo.ciclos
      .map((ciclo, i) => ({ ciclo, altaMs: ciclo.colocacion - ALTA_ANTES_MS, id: i + 1 }))
      .filter((x) => x.altaMs <= ahora)
      .map(({ ciclo, altaMs, id }) => {
        const medido = ciclo.colocacion <= ahora;
        const proveedor = ciclo.bloque.medidasProveedor;
        const fabrica = ciclo.bloque.medidasFabrica;
        // Como en real, las medidas se exponen en metros (la simulación las
        // guarda en cm). El m³ y la merma se derivan aquí, no en la vista.
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
          name: String(ciclo.bloque.numero),
          ref: PROVEEDORES[ciclo.bloque.numero % PROVEEDORES.length],
          material: ciclo.bloque.materialId,
          variantId: null,
          attributeValueId: null,
          operario: operariosDe(altaMs)[0],
          supplier: null,
          poId: null,
          pickingId: null,
          locationDestId: null,
          thirdPartyMaterial: ciclo.bloque.numero % 11 === 0,
          deliveryDone: true,
          createLotDone: medido,
          largoSupplier,
          altoSupplier,
          gruesoSupplier,
          largoMrp,
          altoMrp,
          gruesoMrp,
          m3Supplier,
          m3Mrp,
          mermaPct,
          createDate: new Date(altaMs).toISOString(),
          writeDate: new Date(medido ? ciclo.colocacion : altaMs).toISOString(),
          estadoCiclo: estadoCicloDemo(ciclo, ahora)
        };
      });
    filas.sort((a, b) => epoch(b.createDate ?? '') - epoch(a.createDate ?? ''));

    const materiales = [
      ...new Set(filas.map((f) => f.material).filter((m): m is string => m !== null))
    ].sort();
    const proveedores = [
      ...new Set(filas.map((f) => f.ref).filter((p): p is string => p !== null))
    ].sort();

    const q = filtros.q?.toLowerCase() ?? null;
    const desdeMs = filtros.desde ? new Date(`${filtros.desde}T00:00:00`).getTime() : null;
    const hastaMs = filtros.hasta
      ? new Date(`${filtros.hasta}T00:00:00`).getTime() + 86_400_000
      : null;
    const filtradas = filas.filter((f) => {
      if (filtros.material && String(f.material) !== filtros.material) {
        return false;
      }
      if (filtros.proveedor && f.ref !== filtros.proveedor) {
        return false;
      }
      if (filtros.estado && f.estadoCiclo !== filtros.estado) {
        return false;
      }
      if (
        q !== null &&
        !f.name?.toLowerCase().includes(q) &&
        !f.ref?.toLowerCase().includes(q)
      ) {
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
      materiales,
      proveedores
    });
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

  private snapshotTelar(telarId: number, ahora: number): SnapshotTelar {
    const validas = this.lecturasValidas(telarId, ahora - 86_400_000, ahora);
    const ultimaValida = validas.length > 0 ? validas[validas.length - 1] : null;
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
      bloque: ciclo?.bloque ?? null,
      ultimaLectura: ultimaValida,
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
      )
    };
  }

  private mapearEstado(incidencia: TipoIncidencia): EstadoTelar {
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
      // Una lectura en cuarentena intermedia se puentea; rachas más largas
      // sin dato fiable se dejan como hueco en el Gantt, no se inventan.
      const continua =
        previo &&
        previo.incidencia === lectura.incidencia &&
        inicio - epoch(previo.hasta) <= INTERVALO_LECTURA_MS * 1.5;
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
    return {
      id: ciclo.id,
      telarId: ciclo.telarId,
      bloque: ciclo.bloque,
      colocacion: new Date(ciclo.colocacion).toISOString(),
      inicioCorte: new Date(ciclo.inicioCorte).toISOString(),
      finCorte: ciclo.finCorte <= ahora ? new Date(ciclo.finCorte).toISOString() : null,
      paquetes: ciclo.paquetesEn <= ahora ? ciclo.resumenPaquetes : null,
      horasMarcha:
        Math.round(((Math.min(ciclo.finCorte, ahora) - ciclo.inicioCorte - msParos) / 3_600_000) * 10) /
        10,
      horasParo: Math.round((msParos / 3_600_000) * 10) / 10,
      numParos: ciclo.paros.length,
      tablasPrevistas: tablasPrevistas(ciclo.bloque.medidasFabrica),
      m2Previstos: Math.round(m2Previstos(ciclo.bloque) * 10) / 10,
      mermaVolumenPct: Math.round(mermaVolumenPct(ciclo.bloque) * 10) / 10,
      enCurso,
      // La simulación conoce las medidas reales de sus bloques: siempre coherentes.
      medidasIncoherentes: false
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
      parosPorCausa
    };
  }

  private produccionPorDia(
    paquetes: EventoParte[],
    desde: number,
    hasta: number
  ): ProduccionDia[] {
    const dias: ProduccionDia[] = [];
    // Cursor con calendario local: sumar 24 h fijas descuadra los buckets
    // al cruzar un cambio de hora (días de 23/25 h).
    let cursor = new Date(inicioDia(desde));
    while (cursor.getTime() <= hasta) {
      const dia = cursor.getTime();
      const delDia = paquetes.filter((e) => inicioDia(epoch(e.fechaHora)) === dia);
      const m2PorTelar: Record<number, number> = {};
      for (const telarId of TELAR_IDS) {
        m2PorTelar[telarId] =
          Math.round(
            delDia
              .filter((e) => e.telarId === telarId)
              .reduce((suma, e) => suma + (e.paquetes?.metrosCuadrados ?? 0), 0) * 10
          ) / 10;
      }
      dias.push({
        fecha: new Date(dia).toISOString(),
        m2PorTelar,
        m2Total:
          Math.round(delDia.reduce((suma, e) => suma + (e.paquetes?.metrosCuadrados ?? 0), 0) * 10) /
          10,
        tablas: delDia.reduce((suma, e) => suma + (e.paquetes?.numTablas ?? 0), 0)
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
    return dias;
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
