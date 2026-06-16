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
import {
  aplicarRemapeoFecha,
  sqlFechaHoraEfectiva,
} from '../../../shared/infrastructure/fecha-remapeo/fecha-remapeo';

const TTL_CATALOGOS_MS = 5 * 60_000;

@Injectable()
export class PrismaParteDiscoPuenteRepository
  implements ParteDiscoPuenteRepository
{
  private catalogosCache: {
    en: number;
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
    // El orden y los filtros de fecha van sobre la fecha_hora EFECTIVA (con el
    // año ya corregido), no sobre el valor crudo: si no, los partes remapeados
    // (lote del 31-dic-2025 estampado en 2026) saldrían al principio del
    // listado en vez de en su sitio real (jul–dic 2025). Como Prisma no ordena
    // por una expresión calculada, se resuelve la página por SQL crudo y luego
    // se traen las filas tipadas por id.
    const condiciones: Prisma.Sql[] = [];
    if (filtros.lote !== null) {
      condiciones.push(Prisma.sql`s.n_bloque = ${filtros.lote}`);
    }
    if (filtros.material !== null) {
      condiciones.push(Prisma.sql`s.material = ${filtros.material}`);
    }
    if (filtros.operacion !== null) {
      condiciones.push(Prisma.sql`s.operacion = ${filtros.operacion}`);
    }
    if (filtros.desde) {
      condiciones.push(Prisma.sql`s.fecha_hora_efectiva >= ${filtros.desde}`);
    }
    if (filtros.hasta) {
      condiciones.push(Prisma.sql`s.fecha_hora_efectiva < ${filtros.hasta}`);
    }
    const where =
      condiciones.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(condiciones, ' AND ')}`
        : Prisma.empty;

    const base = Prisma.sql`
      FROM (
        SELECT id, n_bloque, material, operacion,
               ${sqlFechaHoraEfectiva()} AS fecha_hora_efectiva
        FROM parte_discopuente_mapeada
      ) s
      ${where}`;

    const totalFilas = await this.prisma.$queryRaw<{ total: number }[]>(
      Prisma.sql`SELECT count(*)::int AS total ${base}`,
    );
    const total = totalFilas[0]?.total ?? 0;

    const idsOrdenados = await this.prisma.$queryRaw<{ id: number }[]>(
      Prisma.sql`SELECT s.id ${base}
                 ORDER BY s.fecha_hora_efectiva DESC NULLS LAST, s.id DESC
                 LIMIT ${filtros.limit} OFFSET ${filtros.offset}`,
    );
    const ids = idsOrdenados.map((f) => f.id);

    const ahora = Date.now();
    const catalogos = await this.catalogos();
    const conocidos = await this.bloqueRegistro.conocidos();

    const filasPorId = new Map<number, FilaParte>();
    if (ids.length > 0) {
      const filas = await this.prisma.parteDiscoPuenteMapeada.findMany({
        where: { id: { in: ids } },
      });
      for (const fila of filas) {
        filasPorId.set(fila.id, fila);
      }
    }
    // Se respeta el orden devuelto por la consulta SQL (por fecha efectiva).
    const items = ids
      .map((id) => filasPorId.get(id))
      .filter((fila): fila is FilaParte => fila !== undefined)
      .map((fila) => this.toDomain(fila, ahora, conocidos));

    return {
      total,
      limit: filtros.limit,
      offset: filtros.offset,
      items,
      materiales: catalogos.materiales,
      operaciones: catalogos.operaciones,
    };
  }

  /** Catálogos para los filtros, cacheados para no recorrer la tabla por página. */
  private async catalogos(): Promise<{
    materiales: number[];
    operaciones: string[];
  }> {
    if (
      this.catalogosCache &&
      Date.now() - this.catalogosCache.en < TTL_CATALOGOS_MS
    ) {
      return this.catalogosCache;
    }
    const [materiales, operaciones] = await this.prisma.$transaction([
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
    // Remapeo del año mal estampado (+1) del lote de backfill del 31-dic-2025:
    // ~434 filas de jul–dic 2025 que figuran en 2026. Se corrige restando 1 año
    // y se marca `fechaRemapeada` (señal de alerta), pero se USA la fecha
    // corregida. La detección (fecha_hora muy por delante de create_date) deja
    // intactos los partes reales futuros cuando el tiempo avance hasta esos
    // meses. Ver `shared/.../fecha-remapeo`.
    const { fechaHora, fechaHoraOriginal, remapeada } = aplicarRemapeoFecha(
      fila.fechaHora,
      fila.createDate,
    );
    const motivosSospecha: string[] = [];
    // Si tras corregir el año la fecha SIGUE en el futuro, es otra corrupción
    // distinta (no un +1 año): se marca, como antes, pero no se silencia.
    if (fechaHora && fechaHora.getTime() > ahora) {
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
      fechaHora,
      fechaHoraOriginal,
      fechaRemapeada: remapeada,
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
