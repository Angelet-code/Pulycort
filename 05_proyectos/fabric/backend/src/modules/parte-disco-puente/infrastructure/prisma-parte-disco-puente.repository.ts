import { Injectable } from '@nestjs/common';
import { Prisma, ParteDiscoPuenteMapeada as FilaParte } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/database/prisma/prisma.service';
import {
  FiltrosParteDiscoPuente,
  PaginaParteDiscoPuente,
  ParteDiscoPuente,
} from '../domain/parte-disco-puente.entity';
import { ParteDiscoPuenteRepository } from '../domain/parte-disco-puente.repository';
import { BloqueRegistroService } from '../../../shared/infrastructure/bloque-registro/bloque-registro.service';

const TTL_CATALOGOS_MS = 5 * 60_000;

@Injectable()
export class PrismaParteDiscoPuenteRepository
  implements ParteDiscoPuenteRepository
{
  private catalogosCache: {
    en: number;
    discosPuente: string[];
    materiales: number[];
    operaciones: string[];
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bloqueRegistro: BloqueRegistroService,
  ) {}

  async findMany(
    filtros: FiltrosParteDiscoPuente,
  ): Promise<PaginaParteDiscoPuente> {
    const where: Prisma.ParteDiscoPuenteMapeadaWhereInput = {};
    if (filtros.discoPuenteN) {
      where.discoPuenteN = filtros.discoPuenteN;
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
      this.prisma.parteDiscoPuenteMapeada.count({ where }),
      this.prisma.parteDiscoPuenteMapeada.findMany({
        where,
        // En Postgres DESC pone los NULL primero; los queremos al final.
        orderBy: [{ fechaHora: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
        take: filtros.limit,
        skip: filtros.offset,
      }),
    ]);

    const ahora = Date.now();
    const catalogos = await this.catalogos();
    const conocidos = await this.bloqueRegistro.conocidos();
    return {
      total,
      limit: filtros.limit,
      offset: filtros.offset,
      items: filas.map((fila) => this.toDomain(fila, ahora, conocidos)),
      discosPuente: catalogos.discosPuente,
      materiales: catalogos.materiales,
      operaciones: catalogos.operaciones,
    };
  }

  /** Catálogos para los filtros, cacheados para no recorrer la tabla por página. */
  private async catalogos(): Promise<{
    discosPuente: string[];
    materiales: number[];
    operaciones: string[];
  }> {
    if (
      this.catalogosCache &&
      Date.now() - this.catalogosCache.en < TTL_CATALOGOS_MS
    ) {
      return this.catalogosCache;
    }
    const [discos, materiales, operaciones] = await this.prisma.$transaction([
      this.prisma.parteDiscoPuenteMapeada.findMany({
        distinct: ['discoPuenteN'],
        select: { discoPuenteN: true },
        where: { discoPuenteN: { not: null } },
      }),
      this.prisma.parteDiscoPuenteMapeada.findMany({
        distinct: ['material'],
        select: { material: true },
        where: { material: { not: null } },
      }),
      this.prisma.parteDiscoPuenteMapeada.findMany({
        distinct: ['operacion'],
        select: { operacion: true },
        where: { operacion: { not: null } },
      }),
    ]);
    this.catalogosCache = {
      en: Date.now(),
      discosPuente: discos
        .map((f) => f.discoPuenteN!)
        .sort((a, b) => Number(a) - Number(b)),
      materiales: materiales.map((f) => f.material!).sort((a, b) => a - b),
      operaciones: operaciones
        .map((f) => f.operacion!)
        .sort((a, b) => Number(a) - Number(b)),
    };
    return this.catalogosCache;
  }

  private toDomain(
    fila: FilaParte,
    ahora: number,
    conocidos: Set<number>,
  ): ParteDiscoPuente {
    const motivosSospecha: string[] = [];
    // Cuarentena: una fecha declarada en el futuro es imposible (~434 filas en
    // jul-dic 2026). Se marca pero NO se oculta (estilo de la casa: el validador
    // señala y excluye de KPIs; aquí es una lectura en crudo, sin KPIs). Las
    // reglas definitivas de cuarentena de partes están pendientes de TotWare
    // (00_gestion/TAREAS.md).
    if (fila.fechaHora && fila.fechaHora.getTime() > ahora) {
      motivosSospecha.push('fecha futura imposible');
    }
    return {
      id: fila.id,
      discoPuenteN: fila.discoPuenteN,
      operario1: fila.operario1,
      operario2: fila.operario2,
      nBloque: fila.nBloque,
      pmLote: fila.nBloque,
      idBloque: fila.idBloque,
      enInventarioOdoo: fila.bloqueExiste,
      bloqueConocido: BloqueRegistroService.esConocido(fila.nBloque, conocidos),
      material: fila.material,
      materialRecibido: fila.materialRecibido,
      operacion: fila.operacion,
      acabado: fila.acabado,
      largo: fila.largo,
      alto: fila.alto,
      grueso: dec(fila.grueso),
      nPaquete: fila.nPaquete,
      nTablas: fila.nTablas,
      contenedorSalida: fila.pmLosa,
      largoTablas: [
        dec(fila.largoTablas1),
        fila.largoTablas2,
        fila.largoTablas3,
        fila.largoTablas4,
        fila.largoTablas5,
        fila.largoTablas6,
        fila.largoTablas7,
        fila.largoTablas8,
      ],
      altoTablas: [
        dec(fila.altoTablas1),
        fila.altoTablas2,
        fila.altoTablas3,
        fila.altoTablas4,
        fila.altoTablas5,
        fila.altoTablas6,
        fila.altoTablas7,
        fila.altoTablas8,
      ],
      gruesoTablas: dec(fila.gruesoTablas),
      consumo: fila.consumo,
      metro2Entrada: dec(fila.metro2Entrada),
      metro2Salida: dec(fila.metro2Salida),
      eficienciaM2: fila.eficienciaM2,
      fecha: fila.fecha,
      fechaHora: fila.fechaHora,
      createDate: fila.createDate,
      sospechosa: motivosSospecha.length > 0,
      motivosSospecha,
    };
  }
}

/** Convierte un Decimal de Prisma (numeric) a número JS, conservando null. */
function dec(valor: Prisma.Decimal | null): number | null {
  return valor !== null ? Number(valor) : null;
}
