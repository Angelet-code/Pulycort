import { Injectable } from '@nestjs/common';
import { Prisma, ReforzadoraMapeada as FilaParte } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/database/prisma/prisma.service';
import {
  FiltrosParteReforzadora,
  PaginaParteReforzadora,
  ParteReforzadora,
} from '../domain/parte-reforzadora.entity';
import { ParteReforzadoraRepository } from '../domain/parte-reforzadora.repository';
import { BloqueRegistroService } from '../../../shared/infrastructure/bloque-registro/bloque-registro.service';

const TTL_CATALOGOS_MS = 5 * 60_000;

@Injectable()
export class PrismaParteReforzadoraRepository
  implements ParteReforzadoraRepository
{
  private catalogosCache: {
    en: number;
    reforzadoras: string[];
    materiales: number[];
    acabados: string[];
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bloqueRegistro: BloqueRegistroService,
  ) {}

  async findMany(
    filtros: FiltrosParteReforzadora,
  ): Promise<PaginaParteReforzadora> {
    const where: Prisma.ReforzadoraMapeadaWhereInput = {};
    if (filtros.lote !== null) {
      where.nBloque = filtros.lote;
    }
    if (filtros.nReforzadora) {
      where.nReforzadora = filtros.nReforzadora;
    }
    if (filtros.material !== null) {
      where.material = filtros.material;
    }
    if (filtros.acabado !== null) {
      where.acabado = filtros.acabado;
    }
    if (filtros.desde || filtros.hasta) {
      where.fechaHora = {
        ...(filtros.desde ? { gte: filtros.desde } : {}),
        ...(filtros.hasta ? { lt: filtros.hasta } : {}),
      };
    }

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.reforzadoraMapeada.count({ where }),
      this.prisma.reforzadoraMapeada.findMany({
        where,
        // En Postgres DESC pone los NULL primero; los queremos al final.
        orderBy: [{ fechaHora: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
        take: filtros.limit,
        skip: filtros.offset,
      }),
    ]);

    const catalogos = await this.catalogos();
    const conocidos = await this.bloqueRegistro.conocidos();
    const ahora = Date.now();
    return {
      total,
      limit: filtros.limit,
      offset: filtros.offset,
      items: filas.map((fila) => this.toDomain(fila, ahora, conocidos)),
      reforzadoras: catalogos.reforzadoras,
      materiales: catalogos.materiales,
      acabados: catalogos.acabados,
    };
  }

  /** Catálogos para los filtros, cacheados para no recorrer la tabla por página. */
  private async catalogos(): Promise<{
    reforzadoras: string[];
    materiales: number[];
    acabados: string[];
  }> {
    if (
      this.catalogosCache &&
      Date.now() - this.catalogosCache.en < TTL_CATALOGOS_MS
    ) {
      return this.catalogosCache;
    }
    const [reforzadoras, materiales, acabados] = await this.prisma.$transaction([
      this.prisma.reforzadoraMapeada.findMany({
        distinct: ['nReforzadora'],
        select: { nReforzadora: true },
        where: { nReforzadora: { not: null } },
      }),
      this.prisma.reforzadoraMapeada.findMany({
        distinct: ['material'],
        select: { material: true },
        where: { material: { not: null } },
      }),
      this.prisma.reforzadoraMapeada.findMany({
        distinct: ['acabado'],
        select: { acabado: true },
        where: { acabado: { not: null } },
      }),
    ]);
    this.catalogosCache = {
      en: Date.now(),
      reforzadoras: reforzadoras
        .map((f) => f.nReforzadora!)
        .sort((a, b) => Number(a) - Number(b)),
      materiales: materiales.map((f) => f.material!).sort((a, b) => a - b),
      acabados: acabados.map((f) => f.acabado!).sort((a, b) => Number(a) - Number(b)),
    };
    return this.catalogosCache;
  }

  private toDomain(
    fila: FilaParte,
    ahora: number,
    conocidos: Set<number>,
  ): ParteReforzadora {
    const motivosSospecha: string[] = [];
    if (fila.fechaHora && fila.fechaHora.getTime() > ahora) {
      motivosSospecha.push('fecha futura imposible');
    }

    const largo = fila.largo;
    const alto = fila.alto;
    const nTablas = fila.nTablas;
    // m² reforzados de las tablas: n_tablas × largo × alto / 10⁴, asumiendo cm
    // (el rango observado lo respalda, pero la unidad sigue pendiente de
    // confirmar con TotWare — ver TAREAS.md). Solo si están los tres datos y son
    // > 0 (no se inventa para filas vacías/de cabecera).
    const metrosCuadrados =
      nTablas && largo && alto && nTablas > 0 && largo > 0 && alto > 0
        ? Math.round(((nTablas * largo * alto) / 10_000) * 100) / 100
        : null;

    return {
      id: fila.id,
      nReforzadora: fila.nReforzadora,
      operario1: fila.operario1,
      operario2: fila.operario2,
      nBloque: fila.nBloque,
      pmLote: fila.nBloque,
      bloqueConocido: BloqueRegistroService.esConocido(fila.nBloque, conocidos),
      material: fila.material,
      nTablas: fila.nTablas,
      largo,
      alto,
      grueso: fila.grueso !== null ? Number(fila.grueso) : null,
      consumo: fila.consumo,
      acabado: fila.acabado,
      eventos: fila.eventos,
      metrosCuadrados,
      fechaHora: fila.fechaHora,
      createDate: fila.createDate,
      sospechosa: motivosSospecha.length > 0,
      motivosSospecha,
    };
  }
}
