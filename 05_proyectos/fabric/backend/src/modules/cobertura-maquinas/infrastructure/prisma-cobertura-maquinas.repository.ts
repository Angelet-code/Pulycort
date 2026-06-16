import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma/prisma.service';
import {
  CoberturaMaquina,
  CoberturaMaquinas,
} from '../domain/cobertura-maquinas.entity';
import { CoberturaMaquinasRepository } from '../domain/cobertura-maquinas.repository';
import {
  CATALOGO_MAQUINAS,
  DescriptorMaquina,
} from '../domain/catalogo-maquinas';

const TTL_MS = 60_000;

/** Volumen real de una fuente de datos: filas, lotes (PM) y última actividad. */
type StatsFuente = {
  filas: number;
  lotes: number;
  ultimaActividad: Date | null;
};

/**
 * Stats del disco puente Gómez: además del volumen, el material del último parte
 * y los m² de entrada de hoy, para su tarjeta de la sala de máquinas.
 */
type StatsDiscoPuente = StatsFuente & {
  ultimoMaterial: number | null;
  m2EntradaHoy: number | null;
};

/**
 * Calcula el mapa de cobertura: cruza el catálogo curado de planta con el
 * volumen real de cada tabla conectada (`produccion_mapeada` por telar y
 * `parte_discopuente_mapeada` para el disco puente Gómez, el único con PLC). Las
 * máquinas sin fuente quedan con stats en null — no se inventa actividad.
 * Cacheado 60 s para no recorrer la tabla en cada refresco de la vista.
 */
@Injectable()
export class PrismaCoberturaMaquinasRepository
  implements CoberturaMaquinasRepository
{
  private cache: { en: number; valor: CoberturaMaquinas } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async coberturaMaquinas(): Promise<CoberturaMaquinas> {
    if (this.cache && Date.now() - this.cache.en < TTL_MS) {
      return this.cache.valor;
    }

    const [statsTelar, statsDisco, statsReforzadora] = await Promise.all([
      this.statsPorTelar(),
      this.statsDiscoPuente(),
      this.statsReforzadora(),
    ]);

    const valor: CoberturaMaquinas = {
      generadoEn: new Date().toISOString(),
      maquinas: CATALOGO_MAQUINAS.map((desc) =>
        this.aCobertura(desc, statsTelar, statsDisco, statsReforzadora),
      ),
    };
    this.cache = { en: Date.now(), valor };
    return valor;
  }

  private aCobertura(
    desc: DescriptorMaquina,
    statsTelar: Map<string, StatsFuente>,
    statsDisco: StatsDiscoPuente,
    statsReforzadora: StatsFuente,
  ): CoberturaMaquina {
    const base = {
      codigo: desc.codigo,
      nombre: desc.nombre,
      seccion: desc.seccion,
      familia: desc.familia,
      fuenteDatos: desc.fuenteDatos,
      ultimoMaterial: null,
      m2EntradaHoy: null,
      estado: desc.estado,
    };

    if (desc.telarN) {
      const s = statsTelar.get(desc.telarN);
      return {
        ...base,
        filas: s?.filas ?? 0,
        lotes: s?.lotes ?? 0,
        ultimaActividad: s?.ultimaActividad ?? null,
        nota: desc.notaBase ?? null,
      };
    }

    if (desc.esDiscoPuente) {
      // Gómez es el ÚNICO disco puente con PLC integrado: todo
      // `parte_discopuente_mapeada` es suyo, así que su volumen se le atribuye
      // directamente. Terzago y Cáñigo no tienen fuente y caen al caso
      // `pendiente` (sin atribución). Ver TAREAS.md (PLC de los otros dos).
      return {
        ...base,
        filas: statsDisco.filas,
        lotes: statsDisco.lotes,
        ultimaActividad: statsDisco.ultimaActividad,
        ultimoMaterial: statsDisco.ultimoMaterial,
        m2EntradaHoy: statsDisco.m2EntradaHoy,
        nota:
          'Único disco puente integrado (con PLC); todo el flujo es suyo. ' +
          'Terzago y Cáñigo aún sin integrar.',
      };
    }

    if (desc.esReforzadora) {
      // Mismo caso que el disco puente: el dato no separa REFORZADORA 1 de
      // REFORZADORA 2 SEI (todo llega como n_reforzadora='1'). Ver TAREAS.md.
      return {
        ...base,
        filas: null,
        lotes: null,
        ultimaActividad: null,
        nota:
          'Flujo combinado: el dato no separa REFORZADORA 1 de REFORZADORA 2 SEI ' +
          `— todo llega como un único n_reforzadora. ${statsReforzadora.filas} partes y ` +
          `${statsReforzadora.lotes} lotes registrados, sin atribuir a esta máquina. ` +
          'Pendiente que INDASEL etiquete la máquina física por parte.',
      };
    }

    return {
      ...base,
      filas: null,
      lotes: null,
      ultimaActividad: null,
      nota: desc.notaBase ?? null,
    };
  }

  /** Filas, lotes (n_bloque distintos) y última actividad por telar. */
  private async statsPorTelar(): Promise<Map<string, StatsFuente>> {
    // Promise.all (no $transaction): el tipo de retorno de groupBy se ensancha
    // dentro de $transaction y rompe el acceso a `_count`/`_max`.
    const [porTelar, lotesPorTelar] = await Promise.all([
      this.prisma.produccionMapeada.groupBy({
        by: ['telarN'],
        _count: { _all: true },
        _max: { fechaHora: true },
        where: { telarN: { not: null } },
        orderBy: { telarN: 'asc' },
      }),
      this.prisma.produccionMapeada.groupBy({
        by: ['telarN', 'nBloque'],
        where: { telarN: { not: null }, nBloque: { not: null } },
        orderBy: [{ telarN: 'asc' }, { nBloque: 'asc' }],
      }),
    ]);

    const lotes = new Map<string, number>();
    for (const fila of lotesPorTelar) {
      const t = fila.telarN!;
      lotes.set(t, (lotes.get(t) ?? 0) + 1);
    }

    const stats = new Map<string, StatsFuente>();
    for (const fila of porTelar) {
      const t = fila.telarN!;
      stats.set(t, {
        filas: fila._count._all,
        lotes: lotes.get(t) ?? 0,
        ultimaActividad: fila._max.fechaHora ?? null,
      });
    }
    return stats;
  }

  /**
   * Volumen del disco puente Gómez (todo `parte_discopuente_mapeada` es suyo),
   * más el material del último parte y los m² de entrada de hoy para su tarjeta.
   * La última actividad y el último material se toman del parte más reciente con
   * fecha SANA (`fechaHora <= ahora`): la tabla tiene ~434 filas con fecha futura
   * imposible (errata de año) que no deben colarse como "lo más reciente".
   * Los m² del disco puente están pendientes de validar (la vista los marca).
   */
  private async statsDiscoPuente(): Promise<StatsDiscoPuente> {
    const ahora = new Date();
    const inicioHoy = new Date(
      ahora.getFullYear(),
      ahora.getMonth(),
      ahora.getDate(),
    );
    const [filas, lotesDistintos, ultimoParte, m2Hoy] =
      await this.prisma.$transaction([
        this.prisma.parteDiscoPuenteMapeada.count(),
        this.prisma.parteDiscoPuenteMapeada.findMany({
          distinct: ['nBloque'],
          select: { nBloque: true },
          where: { nBloque: { not: null } },
        }),
        this.prisma.parteDiscoPuenteMapeada.findFirst({
          where: { fechaHora: { lte: ahora } },
          orderBy: { fechaHora: 'desc' },
          select: { fechaHora: true, material: true },
        }),
        this.prisma.parteDiscoPuenteMapeada.aggregate({
          _sum: { metro2Entrada: true },
          where: { fechaHora: { gte: inicioHoy, lte: ahora } },
        }),
      ]);

    return {
      filas,
      lotes: lotesDistintos.length,
      ultimaActividad: ultimoParte?.fechaHora ?? null,
      ultimoMaterial: ultimoParte?.material ?? null,
      m2EntradaHoy:
        m2Hoy._sum.metro2Entrada !== null
          ? Number(m2Hoy._sum.metro2Entrada)
          : null,
    };
  }

  /** Volumen total del flujo de la reforzadora de tablas (todas juntas). */
  private async statsReforzadora(): Promise<StatsFuente> {
    const [filas, lotesDistintos, rango] = await this.prisma.$transaction([
      this.prisma.reforzadoraMapeada.count(),
      this.prisma.reforzadoraMapeada.findMany({
        distinct: ['nBloque'],
        select: { nBloque: true },
        where: { nBloque: { not: null } },
      }),
      this.prisma.reforzadoraMapeada.aggregate({
        _max: { fechaHora: true },
      }),
    ]);

    return {
      filas,
      lotes: lotesDistintos.length,
      ultimaActividad: rango._max.fechaHora,
    };
  }
}
