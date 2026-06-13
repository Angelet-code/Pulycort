import { Injectable } from '@nestjs/common';
import { Prisma, ProduccionMapeada as PrismaProduccionMapeada } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/database/prisma/prisma.service';
import {
  FiltrosProduccionMapeada,
  PaginaProduccionMapeada,
  ProduccionMapeada,
} from '../domain/produccion-mapeada.entity';
import { ProduccionMapeadaRepository } from '../domain/produccion-mapeada.repository';

const TTL_MATERIALES_MS = 5 * 60_000;

@Injectable()
export class PrismaProduccionMapeadaRepository
  implements ProduccionMapeadaRepository
{
  private materialesCache: { en: number; valor: number[] } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    filtros: FiltrosProduccionMapeada,
  ): Promise<PaginaProduccionMapeada> {
    const where: Prisma.ProduccionMapeadaWhereInput = {};
    if (filtros.telarN) {
      where.telarN = filtros.telarN;
    }
    if (filtros.material !== null) {
      where.material = filtros.material;
    }
    if (filtros.desde || filtros.hasta) {
      where.fechaHora = {
        ...(filtros.desde ? { gte: filtros.desde } : {}),
        ...(filtros.hasta ? { lt: filtros.hasta } : {}),
      };
    }

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.produccionMapeada.count({ where }),
      this.prisma.produccionMapeada.findMany({
        where,
        orderBy: [{ fechaHora: 'desc' }, { id: 'desc' }],
        take: filtros.limit,
        skip: filtros.offset,
      }),
    ]);

    return {
      total,
      limit: filtros.limit,
      offset: filtros.offset,
      items: filas.map((fila) => this.toDomain(fila)),
      materiales: await this.materialesDisponibles(),
    };
  }

  /** Materiales distintos de toda la tabla, cacheados para no recorrerla en cada página. */
  private async materialesDisponibles(): Promise<number[]> {
    if (
      this.materialesCache &&
      Date.now() - this.materialesCache.en < TTL_MATERIALES_MS
    ) {
      return this.materialesCache.valor;
    }
    const filas = await this.prisma.produccionMapeada.findMany({
      distinct: ['material'],
      select: { material: true },
      where: { material: { not: null } },
    });
    const valor = filas
      .map((f) => f.material!)
      .sort((a, b) => a - b);
    this.materialesCache = { en: Date.now(), valor };
    return valor;
  }

  async findById(id: number): Promise<ProduccionMapeada | null> {
    const fila = await this.prisma.produccionMapeada.findUnique({
      where: { id },
    });

    return fila ? this.toDomain(fila) : null;
  }

  private toDomain(fila: PrismaProduccionMapeada): ProduccionMapeada {
    return {
      ...fila,
      // `grueso` es NUMERIC en Postgres → Prisma lo entrega como Decimal.
      grueso: fila.grueso === null ? null : fila.grueso.toNumber(),
    };
  }
}
