import { Injectable } from '@nestjs/common';
import { Prisma, LotBlockCreation as FilaBloque } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/database/prisma/prisma.service';
import {
  BloqueInventario,
  FiltrosBloqueInventario,
  PaginaBloqueInventario,
} from '../domain/bloque-inventario.entity';
import { BloqueInventarioRepository } from '../domain/bloque-inventario.repository';
import {
  EstadoCicloBloque,
  OcupacionTelar,
  clasificarOcupacion,
  derivarEstadoCiclo,
  numeroDeBloque,
  resolverEstadoCiclo,
} from '../domain/estado-ciclo';

/** Telares físicos: solo hay 4 (telar_n llega corrupto en produccion_mapeada). */
const TELARES = ['1', '2', '3', '4'];

const TTL_CATALOGOS_MS = 5 * 60_000;
const TTL_ULTIMA_TELAR_MS = 60_000;

/** Estados ya terminales por parte (op. 4): el telar no los altera. */
const ESTADOS_OP4: ReadonlySet<EstadoCicloBloque> = new Set([
  'almacenando',
  'almacenado',
]);

@Injectable()
export class PrismaBloqueInventarioRepository implements BloqueInventarioRepository {
  private catalogosCache: {
    en: number;
    materiales: number[];
    proveedores: string[];
  } | null = null;
  /** Última lectura (ms) de cada telar; cacheada para no barrer la tabla por página. */
  private ultimaTelarCache: { en: number; porTelar: Map<string, number> } | null =
    null;

  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    filtros: FiltrosBloqueInventario,
  ): Promise<PaginaBloqueInventario> {
    const where: Prisma.LotBlockCreationWhereInput = {};
    if (filtros.material !== null) {
      where.productIdTmpl = filtros.material;
    }
    if (filtros.proveedor !== null) {
      where.ref = filtros.proveedor;
    }
    if (filtros.q !== null) {
      where.OR = [
        { name: { contains: filtros.q, mode: 'insensitive' } },
        { ref: { contains: filtros.q, mode: 'insensitive' } },
      ];
    }
    if (filtros.desde || filtros.hasta) {
      where.createDate = {
        ...(filtros.desde ? { gte: filtros.desde } : {}),
        ...(filtros.hasta ? { lt: filtros.hasta } : {}),
      };
    }

    // En Postgres DESC pone los NULL primero; los queremos al final.
    const orderBy: Prisma.LotBlockCreationOrderByWithRelationInput[] = [
      { createDate: { sort: 'desc', nulls: 'last' } },
      { id: 'desc' },
    ];

    // `estadoCiclo` es un campo DERIVADO (de los partes de trabajo), no una
    // columna: no se puede filtrar con un WHERE de SQL. Cuando hay filtro de
    // estado, traemos todos los bloques que casan los demás filtros, derivamos
    // su estado y filtramos/paginamos en memoria; si no, paginamos en SQL y
    // solo derivamos el estado de la página (camino eficiente habitual).
    if (filtros.estado !== null) {
      const todas = await this.prisma.lotBlockCreation.findMany({
        where,
        orderBy,
      });
      const [catalogos, estados] = await Promise.all([
        this.catalogos(),
        this.estadosCiclo(todas),
      ]);
      const filtradas = todas.filter(
        (fila) => (estados.get(fila.id) ?? 'inventariado') === filtros.estado,
      );
      const pagina = filtradas.slice(
        filtros.offset,
        filtros.offset + filtros.limit,
      );
      return {
        total: filtradas.length,
        limit: filtros.limit,
        offset: filtros.offset,
        items: pagina.map((fila) =>
          this.toDomain(fila, estados.get(fila.id) ?? 'inventariado'),
        ),
        materiales: catalogos.materiales,
        proveedores: catalogos.proveedores,
      };
    }

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.lotBlockCreation.count({ where }),
      this.prisma.lotBlockCreation.findMany({
        where,
        orderBy,
        take: filtros.limit,
        skip: filtros.offset,
      }),
    ]);

    const [catalogos, estados] = await Promise.all([
      this.catalogos(),
      this.estadosCiclo(filas),
    ]);
    return {
      total,
      limit: filtros.limit,
      offset: filtros.offset,
      items: filas.map((fila) =>
        this.toDomain(fila, estados.get(fila.id) ?? 'inventariado'),
      ),
      materiales: catalogos.materiales,
      proveedores: catalogos.proveedores,
    };
  }

  /**
   * Estado de ciclo de vida de cada bloque de la página. Combina dos señales:
   * los partes de trabajo (`parte_trabajo_mapeada`, op. más avanzada) y la
   * ocupación de su telar (`produccion_mapeada`). Los partes no son
   * obligatorios por fase, así que el telar corrige estados incompletos: si un
   * bloque que parecía en el telar ya fue desalojado por otro, está terminado.
   */
  private async estadosCiclo(
    filas: FilaBloque[],
  ): Promise<Map<number, EstadoCicloBloque>> {
    const ahora = Date.now();
    const numeros = [
      ...new Set(
        filas
          .map((fila) => numeroDeBloque(fila.name))
          .filter((n): n is number => n !== null),
      ),
    ];
    if (numeros.length === 0) {
      return new Map(filas.map((fila) => [fila.id, 'inventariado' as const]));
    }

    const porNumero = await this.partesDeFase(numeros);

    // Estado por parte de cada fila. Solo cruzamos con la ocupación del telar
    // los bloques cuyo parte NO es ya terminal (op. 4): el telar no altera
    // 'almacenando'/'almacenado', así que evitamos barrer las lecturas de los
    // bloques ya empaquetados (la mayoría) y acotamos la consulta de ocupación.
    const estadoParte = new Map<number, EstadoCicloBloque>();
    const createDatePorNumero = new Map<number, Date | null>();
    const numerosParaOcupacion = new Set<number>();
    for (const fila of filas) {
      const numero = numeroDeBloque(fila.name);
      const lista = numero !== null ? (porNumero.get(numero) ?? []) : [];
      const estado = derivarEstadoCiclo(fila.createDate, lista, ahora);
      estadoParte.set(fila.id, estado);
      if (numero !== null && !ESTADOS_OP4.has(estado)) {
        numerosParaOcupacion.add(numero);
        createDatePorNumero.set(numero, fila.createDate);
      }
    }

    const ocupacion = await this.ocupacionDeTelar(
      [...numerosParaOcupacion],
      createDatePorNumero,
      ahora,
    );

    return new Map(
      filas.map((fila) => {
        const numero = numeroDeBloque(fila.name);
        const estado = estadoParte.get(fila.id) ?? 'inventariado';
        const ocup =
          numero !== null ? (ocupacion.get(numero) ?? 'sin-rastro') : 'sin-rastro';
        return [fila.id, resolverEstadoCiclo(estado, ocup)];
      }),
    );
  }

  /** Partes de fase (op. 1-4) de los bloques dados, agrupados por nº de bloque. */
  private async partesDeFase(
    numeros: number[],
  ): Promise<Map<number, { operacion: string | null; fechaHora: Date | null }[]>> {
    // `operacion` es String? en el schema (códigos '1'-'4' = colocación,
    // aserrado, salida, paquetes). La ventana del corte la aplica
    // derivarEstadoCiclo, así que aquí traemos todos los partes de fase.
    const partes = await this.prisma.parteTrabajoMapeada.findMany({
      where: {
        nBloque: { in: numeros },
        operacion: { in: ['1', '2', '3', '4'] },
        fechaHora: { not: null },
      },
      select: { nBloque: true, operacion: true, fechaHora: true },
    });

    const porNumero = new Map<
      number,
      { operacion: string | null; fechaHora: Date | null }[]
    >();
    for (const parte of partes) {
      if (parte.nBloque === null) {
        continue;
      }
      const lista = porNumero.get(parte.nBloque) ?? [];
      lista.push({ operacion: parte.operacion, fechaHora: parte.fechaHora });
      porNumero.set(parte.nBloque, lista);
    }
    return porNumero;
  }

  /**
   * Ocupación de telar de cada bloque (desde `produccion_mapeada`). Para cada
   * bloque trae sus lecturas y delega en `clasificarOcupacion`, que las acota a
   * la ventana del corte (createDate) para no confundir un reuso del nº de
   * bloque a meses vista, y compara su última lectura con la del telar.
   */
  private async ocupacionDeTelar(
    numeros: number[],
    createDatePorNumero: Map<number, Date | null>,
    ahora: number,
  ): Promise<Map<number, OcupacionTelar>> {
    if (numeros.length === 0) {
      return new Map();
    }

    const [lecturas, ultimaPorTelar] = await Promise.all([
      this.prisma.produccionMapeada.findMany({
        where: {
          nBloque: { in: numeros },
          telarN: { in: TELARES },
          fechaHora: { not: null, lte: new Date(ahora) },
        },
        select: { nBloque: true, telarN: true, fechaHora: true },
      }),
      this.ultimaLecturaPorTelar(ahora),
    ]);

    const porBloque = new Map<
      number,
      { telarN: string | null; fechaHora: Date | null }[]
    >();
    for (const lectura of lecturas) {
      if (lectura.nBloque === null) {
        continue;
      }
      const lista = porBloque.get(lectura.nBloque) ?? [];
      lista.push({ telarN: lectura.telarN, fechaHora: lectura.fechaHora });
      porBloque.set(lectura.nBloque, lista);
    }

    const ocupacion = new Map<number, OcupacionTelar>();
    for (const numero of numeros) {
      ocupacion.set(
        numero,
        clasificarOcupacion(
          porBloque.get(numero) ?? [],
          createDatePorNumero.get(numero) ?? null,
          ultimaPorTelar,
          ahora,
        ),
      );
    }
    return ocupacion;
  }

  /**
   * Última lectura (ms) de cada telar — su actividad más reciente, sea del
   * bloque que sea. Cacheada (TTL corto) porque es independiente de la página
   * y barrer `produccion_mapeada` por telar es caro.
   */
  private async ultimaLecturaPorTelar(ahora: number): Promise<Map<string, number>> {
    if (
      this.ultimaTelarCache &&
      ahora - this.ultimaTelarCache.en < TTL_ULTIMA_TELAR_MS
    ) {
      return this.ultimaTelarCache.porTelar;
    }
    const porTelar = new Map<string, number>();
    await Promise.all(
      TELARES.map(async (telar) => {
        const ultima = await this.prisma.produccionMapeada.findFirst({
          where: { telarN: telar, fechaHora: { not: null, lte: new Date(ahora) } },
          orderBy: [{ fechaHora: 'desc' }, { id: 'desc' }],
          select: { fechaHora: true },
        });
        if (ultima?.fechaHora) {
          porTelar.set(telar, ultima.fechaHora.getTime());
        }
      }),
    );
    this.ultimaTelarCache = { en: ahora, porTelar };
    return porTelar;
  }

  /** Catálogos para los filtros, cacheados para no recorrer la tabla por página. */
  private async catalogos(): Promise<{
    materiales: number[];
    proveedores: string[];
  }> {
    if (
      this.catalogosCache &&
      Date.now() - this.catalogosCache.en < TTL_CATALOGOS_MS
    ) {
      return this.catalogosCache;
    }
    const [materiales, proveedores] = await this.prisma.$transaction([
      this.prisma.lotBlockCreation.findMany({
        distinct: ['productIdTmpl'],
        select: { productIdTmpl: true },
        where: { productIdTmpl: { not: null } },
      }),
      this.prisma.lotBlockCreation.findMany({
        distinct: ['ref'],
        select: { ref: true },
        where: { ref: { not: null } },
      }),
    ]);
    this.catalogosCache = {
      en: Date.now(),
      materiales: materiales.map((f) => f.productIdTmpl!).sort((a, b) => a - b),
      proveedores: proveedores
        .map((f) => f.ref!)
        .sort((a, b) => a.localeCompare(b, 'es')),
    };
    return this.catalogosCache;
  }

  private toDomain(
    fila: FilaBloque,
    estadoCiclo: EstadoCicloBloque,
  ): BloqueInventario {
    // Medidas en metros (ver doc de BloqueInventario): m³ = largo × alto ×
    // grueso, sin dividir. La merma necesita las dos medidas.
    const m3Supplier =
      fila.largoSupplier * fila.altoSupplier * fila.gruesoSupplier;
    const m3Mrp =
      fila.largoMrp !== null && fila.altoMrp !== null && fila.gruesoMrp !== null
        ? fila.largoMrp * fila.altoMrp * fila.gruesoMrp
        : null;
    const mermaPct =
      m3Mrp !== null && m3Supplier > 0
        ? ((m3Supplier - m3Mrp) / m3Supplier) * 100
        : null;
    return {
      id: fila.id,
      name: fila.name,
      ref: fila.ref,
      material: fila.productIdTmpl,
      variantId: fila.variantId,
      attributeValueId: fila.attributeValueId,
      operario: fila.operario,
      supplier: fila.supplier,
      poId: fila.poId,
      pickingId: fila.pickingId,
      locationDestId: fila.locationDestId,
      thirdPartyMaterial: fila.thirdPartyMaterial,
      deliveryDone: fila.deliveryDone,
      createLotDone: fila.createLotDone,
      largoSupplier: fila.largoSupplier,
      altoSupplier: fila.altoSupplier,
      gruesoSupplier: fila.gruesoSupplier,
      largoMrp: fila.largoMrp,
      altoMrp: fila.altoMrp,
      gruesoMrp: fila.gruesoMrp,
      m3Supplier,
      m3Mrp,
      mermaPct,
      createDate: fila.createDate,
      writeDate: fila.writeDate,
      estadoCiclo,
    };
  }
}
