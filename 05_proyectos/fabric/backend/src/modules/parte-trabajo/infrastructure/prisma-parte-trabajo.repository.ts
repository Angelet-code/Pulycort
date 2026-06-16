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
import {
  aplicarRemapeoFecha,
  sqlFechaHoraEfectiva,
} from '../../../shared/infrastructure/fecha-remapeo/fecha-remapeo';

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
    // El orden y los filtros de fecha van sobre la fecha_hora EFECTIVA (con el
    // año ya corregido), no sobre el valor crudo: si no, los partes remapeados
    // (lote del 31-dic-2025 estampado en 2026) saldrían al principio del
    // listado en vez de en su sitio real. Como Prisma no ordena por una
    // expresión calculada, se resuelve la página por SQL crudo y luego se traen
    // las filas tipadas por id. Ver `shared/.../fecha-remapeo`.
    const condiciones: Prisma.Sql[] = [];
    if (filtros.lote !== null) {
      condiciones.push(Prisma.sql`s.n_bloque = ${filtros.lote}`);
    }
    if (filtros.telarN) {
      condiciones.push(Prisma.sql`s.n_telar = ${filtros.telarN}`);
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
        SELECT id, n_bloque, n_telar, material, operacion,
               ${sqlFechaHoraEfectiva()} AS fecha_hora_efectiva
        FROM parte_trabajo_mapeada
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

    const catalogos = await this.catalogos();
    const conocidos = await this.bloqueRegistro.conocidos();

    const filasPorId = new Map<number, FilaParte>();
    if (ids.length > 0) {
      const filas = await this.prisma.parteTrabajoMapeada.findMany({
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
      .map((fila) => this.toDomain(fila, conocidos));

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
    // Remapeo del año mal estampado (+1) del lote de backfill del 31-dic-2025:
    // 26 filas que figuran en 2026 siendo de 2025. Se corrige restando 1 año y
    // se marca `fechaRemapeada`, pero se USA la fecha corregida. La detección
    // (fecha_hora muy por delante de create_date) deja intactos los partes
    // reales futuros cuando el tiempo avance. Ver `shared/.../fecha-remapeo`.
    const { fechaHora, fechaHoraOriginal, remapeada } = aplicarRemapeoFecha(
      fila.fechaHora,
      fila.createDate,
    );
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
      fechaHora,
      fechaHoraOriginal,
      fechaRemapeada: remapeada,
      createDate: fila.createDate,
      idBloque: fila.idBloque,
      metrosCubicos: fila.metrosCubicos,
      metrosCuadradosTablas:
        fila.metrosCuadradosTablas !== null ? Number(fila.metrosCuadradosTablas) : null,
      materialRecibido: fila.materialRecibido,
    };
  }
}
