import { Injectable } from '@nestjs/common';
import { Prisma, ParteTrabajoMapeada as FilaParte } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/database/prisma/prisma.service';
import {
  FiltrosParteTrabajo,
  PaginaParteTrabajo,
  ParteTrabajo,
} from '../domain/parte-trabajo.entity';
import { ParteTrabajoRepository } from '../domain/parte-trabajo.repository';
import { BloqueRegistroService } from '../../../shared/infrastructure/bloque-registro/bloque-registro.service';

const TTL_CATALOGOS_MS = 5 * 60_000;

@Injectable()
export class PrismaParteTrabajoRepository implements ParteTrabajoRepository {
  private catalogosCache: {
    en: number;
    materiales: number[];
    operaciones: string[];
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bloqueRegistro: BloqueRegistroService,
  ) {}

  async findMany(filtros: FiltrosParteTrabajo): Promise<PaginaParteTrabajo> {
    const where: Prisma.ParteTrabajoMapeadaWhereInput = {};
    if (filtros.telarN) {
      where.nTelar = filtros.telarN;
    }
    if (filtros.material !== null) {
      where.material = filtros.material;
    }
    if (filtros.operacion !== null) {
      where.operacion = filtros.operacion;
    }
    if (filtros.desde || filtros.hasta) {
      where.fechaHora = {
        ...(filtros.desde ? { gte: filtros.desde } : {}),
        ...(filtros.hasta ? { lt: filtros.hasta } : {}),
      };
    }

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.parteTrabajoMapeada.count({ where }),
      this.prisma.parteTrabajoMapeada.findMany({
        where,
        // En Postgres DESC pone los NULL primero; los queremos al final.
        orderBy: [{ fechaHora: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
        take: filtros.limit,
        skip: filtros.offset,
      }),
    ]);

    const catalogos = await this.catalogos();
    const conocidos = await this.bloqueRegistro.conocidos();
    return {
      total,
      limit: filtros.limit,
      offset: filtros.offset,
      items: filas.map((fila) => this.toDomain(fila, conocidos)),
      materiales: catalogos.materiales,
      operaciones: catalogos.operaciones,
    };
  }

  /** Catálogos para los filtros, cacheados para no recorrer la tabla por página. */
  private async catalogos(): Promise<{ materiales: number[]; operaciones: string[] }> {
    if (this.catalogosCache && Date.now() - this.catalogosCache.en < TTL_CATALOGOS_MS) {
      return this.catalogosCache;
    }
    const [materiales, operaciones] = await this.prisma.$transaction([
      this.prisma.parteTrabajoMapeada.findMany({
        distinct: ['material'],
        select: { material: true },
        where: { material: { not: null } },
      }),
      this.prisma.parteTrabajoMapeada.findMany({
        distinct: ['operacion'],
        select: { operacion: true },
        where: { operacion: { not: null } },
      }),
    ]);
    this.catalogosCache = {
      en: Date.now(),
      materiales: materiales.map((f) => f.material!).sort((a, b) => a - b),
      operaciones: operaciones
        .map((f) => f.operacion!)
        .sort((a, b) => Number(a) - Number(b)),
    };
    return this.catalogosCache;
  }

  private toDomain(fila: FilaParte, conocidos: Set<number>): ParteTrabajo {
    return {
      id: fila.id,
      nTelar: fila.nTelar,
      operario1: fila.operario1,
      operario2: fila.operario2,
      nBloque: fila.nBloque,
      pmLote: fila.nBloque,
      material: fila.material,
      largo: fila.largo,
      alto: fila.alto,
      grueso: fila.grueso !== null ? Number(fila.grueso) : null,
      operacion: fila.operacion,
      nPaquete: fila.nPaquete,
      nTablas: fila.nTablas,
      largoTablas: fila.largoTablas,
      altoTablas: fila.altoTablas,
      gruesoTablas: fila.gruesoTablas,
      consumo: fila.consumo,
      enInventarioOdoo: fila.bloqueExiste,
      bloqueConocido: BloqueRegistroService.esConocido(fila.nBloque, conocidos),
      accion: fila.accion,
      fechaHora: fila.fechaHora,
      createDate: fila.createDate,
      idBloque: fila.idBloque,
      metrosCubicos: fila.metrosCubicos,
      metrosCuadradosTablas:
        fila.metrosCuadradosTablas !== null ? Number(fila.metrosCuadradosTablas) : null,
      materialRecibido: fila.materialRecibido,
    };
  }
}
