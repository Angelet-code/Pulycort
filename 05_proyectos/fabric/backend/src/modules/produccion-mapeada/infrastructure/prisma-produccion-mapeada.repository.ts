import { Injectable } from '@nestjs/common';
import { Prisma, ProduccionMapeada as PrismaProduccionMapeada } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/database/prisma/prisma.service';
import {
  FiltrosProduccionMapeada,
  PaginaProduccionMapeada,
  ProduccionMapeada,
} from '../domain/produccion-mapeada.entity';
import { ProduccionMapeadaRepository } from '../domain/produccion-mapeada.repository';
import {
  bandaConsumo,
  intensidadConsumo,
  POTENCIA_MIN_BASELINE_KW,
  UmbralConsumo,
  umbralConsumoDePotencias,
} from '../../../shared/domain/consumo-atipico';

const TTL_MATERIALES_MS = 5 * 60_000;
const TTL_UMBRALES_MS = 5 * 60_000;
/** Ventana de referencia para los cortes de consumo por telar. */
const VENTANA_UMBRALES_MS = 30 * 86_400_000;
const TELARES = ['1', '2', '3', '4'];
/** Códigos de incidencia EN MARCHA (1 marcha, 4 modo manual, 5 modo automático). */
const CODIGOS_MARCHA = ['1', '4', '5'];
/** Umbral de potencia (kW) para inferir marcha cuando el telar emite '0'. */
const POTENCIA_MARCHA_KW = 10;

@Injectable()
export class PrismaProduccionMapeadaRepository
  implements ProduccionMapeadaRepository
{
  private materialesCache: { en: number; valor: number[] } | null = null;
  private umbralesCache: {
    en: number;
    valor: Map<string, UmbralConsumo>;
  } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    filtros: FiltrosProduccionMapeada,
  ): Promise<PaginaProduccionMapeada> {
    const where: Prisma.ProduccionMapeadaWhereInput = {};
    if (filtros.lote !== null) {
      where.nBloque = filtros.lote;
    }
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

    const umbrales = await this.umbralesConsumoPorTelar();
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
      items: filas.map((fila) => this.toDomain(fila, umbrales)),
      materiales: await this.materialesDisponibles(),
      umbralesConsumo: Object.fromEntries(umbrales),
    };
  }

  /**
   * Cortes de consumo por telar (top 16/2,3/0,13 % de la cola) sobre las lecturas
   * en marcha ≥ 5 kW de los últimos 30 días, para colorear la potencia atípica.
   * Cacheado: la distribución de un telar no cambia entre páginas. Misma lógica
   * (percentil) que el validador de salud, compartida en `shared/domain`.
   */
  private async umbralesConsumoPorTelar(): Promise<Map<string, UmbralConsumo>> {
    if (
      this.umbralesCache &&
      Date.now() - this.umbralesCache.en < TTL_UMBRALES_MS
    ) {
      return this.umbralesCache.valor;
    }
    const desde = new Date(Date.now() - VENTANA_UMBRALES_MS);
    const filas = await this.prisma.produccionMapeada.findMany({
      where: {
        telarN: { in: TELARES },
        potencia: { gte: POTENCIA_MIN_BASELINE_KW },
        fechaHora: { gte: desde },
        // marcha = códigos 1 / 4 (manual) / 5 (automático), o código 0 (telar 4
        // sin código) con potencia ≥ 10. Los paros (2, 3) no entran al baseline.
        OR: [
          ...CODIGOS_MARCHA.map((c) => ({ incidencia: c })),
          { incidencia: '0', potencia: { gte: POTENCIA_MARCHA_KW } },
        ],
      },
      select: { telarN: true, potencia: true },
    });

    const porTelar = new Map<string, number[]>();
    for (const f of filas) {
      if (f.telarN === null || f.potencia === null) {
        continue;
      }
      const lista = porTelar.get(f.telarN) ?? [];
      lista.push(f.potencia);
      porTelar.set(f.telarN, lista);
    }
    const umbrales = new Map<string, UmbralConsumo>();
    for (const [telar, potencias] of porTelar) {
      const u = umbralConsumoDePotencias(potencias);
      if (u) {
        umbrales.set(telar, u);
      }
    }
    this.umbralesCache = { en: Date.now(), valor: umbrales };
    return umbrales;
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

    return fila
      ? this.toDomain(fila, await this.umbralesConsumoPorTelar())
      : null;
  }

  private toDomain(
    fila: PrismaProduccionMapeada,
    umbrales: Map<string, UmbralConsumo>,
  ): ProduccionMapeada {
    // El consumo atípico solo se mira EN MARCHA (códigos 1 / 4 manual / 5
    // automático, o 0 del telar 4 con potencia ≥ 10). Los paros (2, y 3 rotura de
    // material) llevan el sensor congelado, no consumo de corte. Por debajo del
    // corte "alto" del telar no se colorea.
    const u = fila.telarN ? (umbrales.get(fila.telarN) ?? null) : null;
    const potencia = fila.potencia ?? 0;
    const incidencia = (fila.incidencia ?? '').trim();
    const esMarcha =
      CODIGOS_MARCHA.includes(incidencia) ||
      (incidencia === '0' && potencia >= POTENCIA_MARCHA_KW);
    const banda = u && esMarcha ? bandaConsumo(potencia, u) : null;
    return {
      ...fila,
      pmLote: fila.nBloque,
      // `grueso` es NUMERIC en Postgres → Prisma lo entrega como Decimal.
      grueso: fila.grueso === null ? null : fila.grueso.toNumber(),
      // La columna cruda llega en golpes×10: se divide entre 10 para dar
      // golpes/min reales (mismo criterio que el resto del backend).
      golpesXMinuto:
        fila.golpesXMinuto === null ? null : fila.golpesXMinuto / 10,
      consumoBanda: banda,
      consumoIntensidad: banda && u ? intensidadConsumo(potencia, u) : 0,
    };
  }
}
