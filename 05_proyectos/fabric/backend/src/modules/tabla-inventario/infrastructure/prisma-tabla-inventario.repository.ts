import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/database/prisma/prisma.service';
import {
  dimensionBloqueAMetros,
  MAX_DIM_BLOQUE_M,
} from '../../../shared/domain/medidas-bloque';
import {
  MaterialNombresResolver,
  etiquetaMaterial,
} from '../../../shared/infrastructure/odoo/material-nombres.resolver';
import {
  AcumuladorMaterial,
  FormaInventario,
  ResumenInventario,
  construirResumen,
} from '../../../shared/domain/inventario-resumen';
import {
  FiltrosTablaInventario,
  PaginaTablaInventario,
  TablaInventario,
  TipoTabla,
} from '../domain/tabla-inventario.entity';
import { TablaInventarioRepository } from '../domain/tabla-inventario.repository';

/** La lista unida (stock + altas) cambia poco; se cachea unos segundos. */
const TTL_LISTA_MS = 30_000;

/**
 * Lote on-hand: existencias (`quantity > 0`) en una ubicación interna (almacén).
 * Misma definición de "en existencias" que el inventario de bloques.
 */
const QUANT_ON_HAND: Prisma.StockQuantWhereInput = {
  quantity: { gt: 0 },
  location: { usage: 'internal' },
};

/** Lote con su(s) quant(s) on-hand y la ubicación, para resolver dónde está. */
type LoteConUbicacion = Prisma.StockLotGetPayload<{
  include: { quants: { include: { location: true } } };
}>;

/** Campos del alta de TABLAS (`lot_tables_creation`). */
const ALTA_TABLA_SELECT = {
  id: true,
  name: true,
  productId: true,
  productIdTmpl: true,
  nTables: true,
  packagesTables: true,
  finished: true,
  deliveryDone: true,
  largoSupplier: true,
  altoSupplier: true,
  gruesoSupplier: true,
  createDate: true,
  writeDate: true,
} satisfies Prisma.LotTablesCreationSelect;

/** Campos del alta de LOSAS (`lot_slabs_creation`): `n_slabs`, sin paquetes. */
const ALTA_LOSA_SELECT = {
  id: true,
  name: true,
  productId: true,
  productIdTmpl: true,
  nSlabs: true,
  finished: true,
  deliveryDone: true,
  largoSupplier: true,
  altoSupplier: true,
  gruesoSupplier: true,
  createDate: true,
  writeDate: true,
} satisfies Prisma.LotSlabsCreationSelect;

/**
 * Alta normalizada de tabla o losa (las dos comparten todo salvo el nombre del
 * recuento —`n_tables`/`n_slabs`— y que las losas no traen paquetes).
 */
type AltaComun = {
  id: number;
  name: string | null;
  productId: number | null;
  productIdTmpl: number | null;
  /** Recuento de piezas del alta (`n_tables` o `n_slabs`); explícito. */
  nPiezas: number | null;
  /** Paquetes (`packages_tables`); null en losas. */
  paquetes: number | null;
  finished: string | null;
  deliveryDone: boolean | null;
  largoSupplier: number | null;
  altoSupplier: number | null;
  gruesoSupplier: number | null;
  createDate: Date | null;
  writeDate: Date | null;
};

/** Normaliza `type_product_lot` al tipo de dominio (tabla o losa). */
function tipoTabla(valor: string | null): TipoTabla {
  return valor === 'slabs' ? 'slabs' : 'tables';
}

/**
 * Pasa una medida de lote a metros normalizando cm→m por umbral (mismo criterio
 * que las medidas de bloque). Los lotes reales traen el grueso en unidades
 * inconsistentes (verificado contra BD 2026-06-18: 0,02 / 0,2 / 20 en lotes
 * contiguos), así que sin normalizar saldría un grueso de "20 m"; el umbral
 * recupera 0,2 m. No resuelve el ruido sub-umbral (0,02 vs 0,2): la semántica del
 * grueso queda pendiente de confirmar (00_gestion/TAREAS.md).
 */
function aMetros(valor: number | null): number | null {
  return valor === null ? null : dimensionBloqueAMetros(valor);
}

/**
 * m² de un alta = nº de piezas × largo × alto (medidas POR PIEZA, en metros
 * normalizados; el grueso no entra). Solo para la era "alta": el recuento
 * (`n_tables`/`n_slabs`) es EXPLÍCITO, a diferencia del `qty_creation` ambiguo del
 * stock. Da null si falta el recuento o una medida, o si una medida sigue fuera de
 * rango físico tras normalizar (corrupción real: no se inventa un área). Redondea
 * a 2 decimales para no arrastrar ruido de coma flotante.
 */
function areaPiezasM2(
  largo: number | null,
  alto: number | null,
  nPiezas: number | null,
): number | null {
  if (largo === null || alto === null || nPiezas === null || nPiezas <= 0) {
    return null;
  }
  const l = dimensionBloqueAMetros(largo);
  const a = dimensionBloqueAMetros(alto);
  if (l <= 0 || a <= 0 || l > MAX_DIM_BLOQUE_M || a > MAX_DIM_BLOQUE_M) {
    return null;
  }
  return Math.round(l * a * nPiezas * 100) / 100;
}

@Injectable()
export class PrismaTablaInventarioRepository implements TablaInventarioRepository {
  /** Lista unida (stock on-hand + altas no salidas) por tipo: tablas / losas. */
  private readonly listaCache = new Map<
    TipoTabla,
    { en: number; data: TablaInventario[] }
  >();
  /** Resuelve el nombre de material de cada id de producto (Odoo); caché propia. */
  private readonly resolverNombres: MaterialNombresResolver;

  constructor(private readonly prisma: PrismaService) {
    this.resolverNombres = new MaterialNombresResolver(prisma);
  }

  async findMany(
    filtros: FiltrosTablaInventario,
  ): Promise<PaginaTablaInventario> {
    // La vista de lista es de TABLAS (las losas solo alimentan el treemap).
    const lista = await this.listaPorTipo('tables');

    // Catálogo de materiales (nombres distintos) de TODA la lista, para el filtro.
    const materiales = [
      ...new Set(
        lista
          .map((t) => t.materialNombre)
          .filter((n): n is string => n !== null),
      ),
    ].sort((a, b) => a.localeCompare(b, 'es'));

    let items = lista;
    if (filtros.material !== null) {
      items = items.filter((t) => t.materialNombre === filtros.material);
    }
    if (filtros.q !== null) {
      const q = filtros.q.toLowerCase();
      items = items.filter((t) => (t.name ?? '').toLowerCase().includes(q));
    }
    if (filtros.desde) {
      const desde = filtros.desde;
      items = items.filter((t) => t.createDate !== null && t.createDate >= desde);
    }
    if (filtros.hasta) {
      // `hasta` es exclusivo (inicio del día siguiente, lo fija el controlador).
      const hasta = filtros.hasta;
      items = items.filter((t) => t.createDate !== null && t.createDate < hasta);
    }

    // Más recientes primero; los sin fecha al final; desempate por nº de lote.
    const ordenados = [...items].sort((a, b) => {
      const ta = a.createDate ? a.createDate.getTime() : -Infinity;
      const tb = b.createDate ? b.createDate.getTime() : -Infinity;
      if (tb !== ta) {
        return tb - ta;
      }
      return (b.name ?? '').localeCompare(a.name ?? '');
    });

    const total = ordenados.length;
    const pagina = ordenados.slice(filtros.offset, filtros.offset + filtros.limit);
    return {
      total,
      limit: filtros.limit,
      offset: filtros.offset,
      items: pagina,
      materiales,
    };
  }

  /** Existencias de TABLAS por material (m²) para el mapa de inventario. */
  resumenTablas(): Promise<ResumenInventario> {
    return this.resumenPorForma('tables', 'tablas');
  }

  /** Existencias de LOSAS por material (m²) para el mapa de inventario. */
  resumenLosas(): Promise<ResumenInventario> {
    return this.resumenPorForma('slabs', 'losas');
  }

  /**
   * Agrega la lista unida de un tipo (tablas/losas) por material sumando el m². Las
   * piezas sin m² (stock on-hand, recuento ambiguo) cuentan como pieza pero no
   * aportan área — igual que un bloque con m³ imposible. Reusa la lista cacheada.
   */
  private async resumenPorForma(
    tipo: TipoTabla,
    forma: FormaInventario,
  ): Promise<ResumenInventario> {
    const lista = await this.listaPorTipo(tipo);
    const porMaterial: AcumuladorMaterial = new Map();
    for (const pieza of lista) {
      const material = pieza.materialNombre ?? 'Material desconocido';
      const acc = porMaterial.get(material) ?? { cantidad: 0, piezas: 0 };
      acc.piezas += 1;
      if (pieza.m2 !== null) {
        acc.cantidad += pieza.m2;
      }
      porMaterial.set(material, acc);
    }
    return construirResumen(forma, 'm²', porMaterial);
  }

  /**
   * Lista UNIDA de existencias de un tipo = era "stock" (lotes on-hand de
   * `stock_lot`) ∪ era "alta" (paquetes recientes de `lot_tables_creation` /
   * `lot_slabs_creation` que aún no figuran en el stock de Odoo). El alta solo
   * aporta los lotes SIN fila en `stock_lot`: si una pieza ya entró al stock y se
   * agotó (0 on-hand), Odoo la da por salida y no se muestra — es el equivalente de
   * "consumida" (a diferencia de los bloques, el stock de tablas/losas SÍ refleja
   * la depleción). Cacheado por tipo (TTL corto).
   */
  private async listaPorTipo(tipo: TipoTabla): Promise<TablaInventario[]> {
    const cached = this.listaCache.get(tipo);
    if (cached && Date.now() - cached.en < TTL_LISTA_MS) {
      return cached.data;
    }

    const [lotesStock, altasRaw, lotesTodos] = await Promise.all([
      this.prisma.stockLot.findMany({
        where: { typeProductLot: tipo, quants: { some: QUANT_ON_HAND } },
        // Solo un quant on-hand, para la ubicación; `orderBy` lo hace determinista
        // si el lote tuviera existencias en varias internas.
        include: {
          quants: {
            where: QUANT_ON_HAND,
            include: { location: true },
            orderBy: [{ quantity: 'desc' }, { id: 'asc' }],
            take: 1,
          },
        },
      }),
      this.altasDe(tipo),
      // Nombres de TODOS los lotes de este tipo (on-hand o agotados): la frontera
      // entre la era stock y la era alta.
      this.prisma.stockLot.findMany({
        where: { typeProductLot: tipo },
        select: { name: true },
      }),
    ]);

    const nombresEnStock = new Set(
      lotesTodos.map((l) => l.name).filter((n): n is string => n !== null),
    );

    // Altas EN ALMACÉN: nº numérico, no entregadas y que NO consten en `stock_lot`
    // (ni on-hand ni agotadas) — es decir, recibidas y aún sin reflejo en el stock.
    const altasEnAlmacen = altasRaw.filter((a) => {
      if (a.name === null || !/^\d+$/.test(a.name)) {
        return false;
      }
      if (a.deliveryDone === true) {
        return false;
      }
      return !nombresEnStock.has(a.name);
    });

    // Resolver nombres de material de las dos eras en una sola pasada.
    const idsMaterial = [
      ...lotesStock.map((l) => l.productId),
      ...altasEnAlmacen
        .map((a) => a.productId ?? a.productIdTmpl)
        .filter((id): id is number => id !== null),
    ];
    const nombres = await this.resolverNombres.resolver(idsMaterial);

    const data: TablaInventario[] = [
      ...lotesStock.map((lote) => this.toDomainStock(lote, nombres)),
      ...altasEnAlmacen.map((alta) => this.toDomainAlta(alta, nombres, tipo)),
    ];
    this.listaCache.set(tipo, { en: Date.now(), data });
    return data;
  }

  /** Altas normalizadas del tipo: tablas (`n_tables`) o losas (`n_slabs`). */
  private async altasDe(tipo: TipoTabla): Promise<AltaComun[]> {
    if (tipo === 'slabs') {
      const filas = await this.prisma.lotSlabsCreation.findMany({
        select: ALTA_LOSA_SELECT,
      });
      return filas.map((f) => ({
        id: f.id,
        name: f.name,
        productId: f.productId,
        productIdTmpl: f.productIdTmpl,
        nPiezas: f.nSlabs,
        paquetes: null,
        finished: f.finished,
        deliveryDone: f.deliveryDone,
        largoSupplier: f.largoSupplier,
        altoSupplier: f.altoSupplier,
        gruesoSupplier: f.gruesoSupplier,
        createDate: f.createDate,
        writeDate: f.writeDate,
      }));
    }
    const filas = await this.prisma.lotTablesCreation.findMany({
      select: ALTA_TABLA_SELECT,
    });
    return filas.map((f) => ({
      id: f.id,
      name: f.name,
      productId: f.productId,
      productIdTmpl: f.productIdTmpl,
      nPiezas: f.nTables,
      paquetes: f.packagesTables,
      finished: f.finished,
      deliveryDone: f.deliveryDone,
      largoSupplier: f.largoSupplier,
      altoSupplier: f.altoSupplier,
      gruesoSupplier: f.gruesoSupplier,
      createDate: f.createDate,
      writeDate: f.writeDate,
    }));
  }

  /** Mapea un lote on-hand de `stock_lot` (era "stock"). */
  private toDomainStock(
    lote: LoteConUbicacion,
    nombres: Map<number, string>,
  ): TablaInventario {
    return {
      id: lote.id,
      fuente: 'stock',
      name: lote.name,
      material: lote.productId,
      materialNombre: etiquetaMaterial(lote.productId, nombres),
      tipo: tipoTabla(lote.typeProductLot),
      ubicacion: lote.quants[0]?.location.completeName ?? null,
      // Medidas a metros (normalizadas cm→m por umbral, ver `aMetros`). largo/alto
      // llegan limpios en metros; el grueso viene en unidades inconsistentes entre
      // lotes (a confirmar), por eso se normaliza para no pintar un "20 m".
      largo: aMetros(lote.largoSupplier),
      alto: aMetros(lote.altoSupplier),
      grueso: aMetros(lote.gruesoSupplier),
      paquetes: lote.packagesTables,
      nTablas: lote.qtyCreation,
      acabado: lote.finished,
      // m² no se deriva hasta confirmar qué cuenta `qty_creation` (no inventar).
      m2: null,
      createDate: lote.createDate,
      writeDate: lote.writeDate,
    };
  }

  /** Mapea un alta reciente (`lot_tables_creation`/`lot_slabs_creation`, era "alta"). */
  private toDomainAlta(
    alta: AltaComun,
    nombres: Map<number, string>,
    tipo: TipoTabla,
  ): TablaInventario {
    const materialId = alta.productId ?? alta.productIdTmpl ?? null;
    return {
      id: alta.id,
      fuente: 'alta',
      name: alta.name,
      material: materialId,
      materialNombre:
        materialId !== null ? etiquetaMaterial(materialId, nombres) : null,
      tipo,
      // Aún sin ubicación en el stock de Odoo: no se inventa una.
      ubicacion: null,
      largo: aMetros(alta.largoSupplier),
      alto: aMetros(alta.altoSupplier),
      grueso: aMetros(alta.gruesoSupplier),
      paquetes: alta.paquetes,
      // En el alta el recuento de piezas es explícito (`n_tables`/`n_slabs`).
      nTablas: alta.nPiezas,
      acabado: alta.finished,
      // m² = nº de piezas × largo × alto (recuento explícito; ver `areaPiezasM2`).
      m2: areaPiezasM2(alta.largoSupplier, alta.altoSupplier, alta.nPiezas),
      createDate: alta.createDate,
      writeDate: alta.writeDate,
    };
  }
}
