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
 * Calcula el mapa de cobertura: cruza el catálogo curado de planta con el
 * volumen real de cada tabla conectada (`produccion_mapeada` por telar y
 * `parte_discopuente_mapeada` para el flujo de disco puente). Las máquinas sin
 * fuente quedan con stats en null — no se inventa actividad. Cacheado 60 s para
 * no recorrer la tabla en cada refresco de la vista.
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
    statsDisco: StatsFuente,
    statsReforzadora: StatsFuente,
  ): CoberturaMaquina {
    const base = {
      codigo: desc.codigo,
      nombre: desc.nombre,
      seccion: desc.seccion,
      familia: desc.familia,
      fuenteDatos: desc.fuenteDatos,
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
      // Flujo COMPARTIDO: el dato no separa las 3 máquinas físicas, así que no
      // se atribuye el volumen a ninguna (stats en null); la cifra real del
      // flujo va en la nota. Ver TAREAS.md (etiquetado por INDASEL pendiente).
      return {
        ...base,
        filas: null,
        lotes: null,
        ultimaActividad: null,
        nota:
          'Flujo combinado: el dato no separa Terzago/Gómez/Cáñigo — todo el ' +
          `corte llega como un único disco_puente_n. ${statsDisco.filas} partes y ` +
          `${statsDisco.lotes} lotes registrados, sin atribuir a esta máquina. ` +
          'Pendiente que INDASEL etiquete la máquina física por parte.',
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

  /** Volumen total del flujo de disco puente (las 3 máquinas juntas). */
  private async statsDiscoPuente(): Promise<StatsFuente> {
    const [filas, lotesDistintos, rango] = await this.prisma.$transaction([
      this.prisma.parteDiscoPuenteMapeada.count(),
      this.prisma.parteDiscoPuenteMapeada.findMany({
        distinct: ['nBloque'],
        select: { nBloque: true },
        where: { nBloque: { not: null } },
      }),
      this.prisma.parteDiscoPuenteMapeada.aggregate({
        _max: { fechaHora: true },
      }),
    ]);

    return {
      filas,
      lotes: lotesDistintos.length,
      ultimaActividad: rango._max.fechaHora,
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
