import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/database/prisma/prisma.service';
import {
  bloqueImposible,
  volumenBloqueM3,
} from '../../../shared/domain/medidas-bloque';
import {
  BloqueInventario,
  FiltrosBloqueInventario,
  PaginaBloqueInventario,
  TipoBloque,
} from '../domain/bloque-inventario.entity';
import {
  FormaInventario,
  InventarioVistaConjunta,
  ResumenInventario,
} from '../domain/resumen-inventario.entity';
import { BloqueInventarioRepository } from '../domain/bloque-inventario.repository';

const TTL_CATALOGOS_MS = 5 * 60_000;
const TTL_RESUMEN_MS = 30_000;
/** La lista unida (stock + altas) cambia poco; se cachea unos segundos. */
const TTL_LISTA_MS = 30_000;
/** El set de PM/bloques consumidos (partes/producción) cambia despacio. */
const TTL_CONSUMO_MS = 60_000;

/** Tipos de lote que SON bloques (`type_product_lot`). El resto (tables/slabs) no. */
const TIPOS_BLOQUE = ['block', 'othermaterial'];

/** Códigos de operación de `parte_trabajo_mapeada` que consumen el bloque: aserrado (2) y salida (3). */
const OPERACIONES_CONSUMO = ['2', '3'];

/**
 * Lote on-hand: tiene existencias (`quantity > 0`) en una ubicación interna
 * (almacén). Es la definición de "en existencias" del stock de Odoo (la era
 * antigua, hoy un snapshot histórico — ver doc de la entidad).
 */
const QUANT_ON_HAND: Prisma.StockQuantWhereInput = {
  quantity: { gt: 0 },
  location: { usage: 'internal' },
};

/** Bloques (no tablas/losas) que están on-hand. Base de la era "stock". */
const BLOQUE_EN_EXISTENCIAS: Prisma.StockLotWhereInput = {
  typeProductLot: { in: TIPOS_BLOQUE },
  quants: { some: QUANT_ON_HAND },
};

/** Lote con su(s) quant(s) on-hand y la ubicación, para resolver dónde está. */
type LoteConUbicacion = Prisma.StockLotGetPayload<{
  include: { quants: { include: { location: true } } };
}>;

/** Campos que necesita el inventario de cada alta (`lot_block_creation`). */
const ALTA_SELECT = {
  id: true,
  name: true,
  productId: true,
  productIdTmpl: true,
  deliveryDone: true,
  largoSupplier: true,
  altoSupplier: true,
  gruesoSupplier: true,
  largoMrp: true,
  altoMrp: true,
  gruesoMrp: true,
  createDate: true,
  writeDate: true,
} satisfies Prisma.LotBlockCreationSelect;

type AltaBloque = Prisma.LotBlockCreationGetPayload<{ select: typeof ALTA_SELECT }>;

/** m³ y bandera de medida imposible de un juego de medidas (cualquiera nullable). */
function medidasM3(
  largo: number | null,
  alto: number | null,
  grueso: number | null,
): { m3: number | null; imposible: boolean } {
  if (largo === null || alto === null || grueso === null) {
    return { m3: null, imposible: false };
  }
  return {
    m3: volumenBloqueM3(largo, alto, grueso),
    imposible: bloqueImposible(largo, alto, grueso),
  };
}

/** Merma de compra %: `(m³ proveedor − m³ fábrica) / m³ proveedor × 100`; null sin las dos medidas. */
function mermaCompra(
  sup: { m3: number | null; imposible: boolean },
  mrp: { m3: number | null; imposible: boolean },
): number | null {
  if (
    sup.m3 === null ||
    sup.m3 <= 0 ||
    mrp.m3 === null ||
    sup.imposible ||
    mrp.imposible
  ) {
    return null;
  }
  return ((sup.m3 - mrp.m3) / sup.m3) * 100;
}

/**
 * Existencias de un material a partir de su acumulador, ordenadas de mayor a
 * menor y con los totales de la forma. Redondea el m³ a 2 decimales.
 */
function construirResumen(
  forma: FormaInventario,
  unidad: string,
  porMaterial: Map<string, { cantidad: number; piezas: number }>,
): ResumenInventario {
  const materiales = [...porMaterial.entries()]
    .map(([material, v]) => ({
      material,
      cantidad: Math.round(v.cantidad * 100) / 100,
      piezas: v.piezas,
    }))
    .sort((a, b) => b.cantidad - a.cantidad);
  return {
    forma,
    unidad,
    pendiente: false,
    totalCantidad: Math.round(materiales.reduce((s, m) => s + m.cantidad, 0) * 100) / 100,
    totalPiezas: materiales.reduce((s, m) => s + m.piezas, 0),
    materiales,
  };
}

/**
 * Texto del nombre de un producto de Odoo. `product_template.name` es jsonb
 * traducido ({en_US, es_ES}); preferimos español. Tolera el caso de un name
 * guardado como texto plano por si cambia el despliegue de Odoo.
 */
function textoNombre(name: Prisma.JsonValue | null | undefined): string | null {
  if (name == null) {
    return null;
  }
  if (typeof name === 'string') {
    return name;
  }
  if (typeof name === 'object' && !Array.isArray(name)) {
    const traducciones = name as Record<string, unknown>;
    const valor =
      traducciones['es_ES'] ??
      traducciones['en_US'] ??
      Object.values(traducciones)[0];
    return typeof valor === 'string' ? valor : null;
  }
  return null;
}

/**
 * Normaliza el nombre de material quitando el prefijo "M3 BLOQUE" del producto
 * de compra a granel ("M3 BLOQUE MARFIL" → "MARFIL"). Es solo presentación.
 */
function limpiarNombreMaterial(nombre: string | null): string | null {
  if (nombre === null) {
    return null;
  }
  const limpio = nombre.replace(/^M3\s+BLOQUE\s+/i, '').trim();
  return limpio === '' ? null : limpio;
}

/**
 * Etiqueta de material para mostrar/filtrar: el nombre resuelto o, si no hay
 * fila en `product_template`, "Material {id}". Única fuente del fallback (la
 * usan el catálogo, el filtro y cada fila), para que el frontend no lo recomponga.
 */
function etiquetaMaterial(id: number, nombres: Map<number, string>): string {
  return nombres.get(id) ?? `Material ${id}`;
}

/** Normaliza `type_product_lot` al tipo de dominio (siempre uno de los dos). */
function tipoBloque(valor: string | null): TipoBloque {
  return valor === 'block' ? 'block' : 'othermaterial';
}

@Injectable()
export class PrismaBloqueInventarioRepository implements BloqueInventarioRepository {
  /** Lista unida de existencias (stock on-hand + altas recientes no consumidas). */
  private listaCache: { en: number; data: BloqueInventario[] } | null = null;
  /** Resumen de existencias (treemap); cacheado a partir de la lista unida. */
  private resumenCache: { en: number; data: InventarioVistaConjunta } | null = null;
  /** PM/bloques consumidos (aserrado/salida/producción/disco-puente). */
  private consumoCache: { en: number; set: Set<number> } | null = null;
  /**
   * Nombre de material por id de producto (rara vez cambia; cacheado, con caché
   * negativa para los ids sin fila y TTL para que un alta tardía acabe
   * resolviéndose sin reiniciar el proceso).
   */
  private readonly nombreProductoCache = new Map<number, string | null>();
  private nombreProductoCacheEn = 0;

  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    filtros: FiltrosBloqueInventario,
  ): Promise<PaginaBloqueInventario> {
    const lista = await this.listaCompleta();

    // Catálogo de materiales (nombres distintos) de TODA la lista, para el filtro.
    const materiales = [
      ...new Set(
        lista
          .map((b) => b.materialNombre)
          .filter((n): n is string => n !== null),
      ),
    ].sort((a, b) => a.localeCompare(b, 'es'));

    let items = lista;
    if (filtros.material !== null) {
      items = items.filter((b) => b.materialNombre === filtros.material);
    }
    if (filtros.q !== null) {
      const q = filtros.q.toLowerCase();
      items = items.filter((b) => (b.name ?? '').toLowerCase().includes(q));
    }
    if (filtros.desde) {
      const desde = filtros.desde;
      items = items.filter((b) => b.createDate !== null && b.createDate >= desde);
    }
    if (filtros.hasta) {
      // `hasta` es exclusivo (inicio del día siguiente, lo fija el controlador).
      const hasta = filtros.hasta;
      items = items.filter((b) => b.createDate !== null && b.createDate < hasta);
    }

    // Más recientes primero; los sin fecha al final; desempate por nº de bloque.
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

  /**
   * Existencias por material para el mapa de inventario. Agrega la lista unida
   * (stock on-hand + altas recientes) sumando el m³ del proveedor por nombre de
   * material. Tablas y losas aún no tienen fuente conectada: van como
   * `pendiente`, vacías — sin inventar nada. Cacheado (TTL corto).
   */
  async resumen(): Promise<InventarioVistaConjunta> {
    if (this.resumenCache && Date.now() - this.resumenCache.en < TTL_RESUMEN_MS) {
      return this.resumenCache.data;
    }

    const lista = await this.listaCompleta();
    const porMaterial = new Map<string, { cantidad: number; piezas: number }>();
    for (const bloque of lista) {
      const material = bloque.materialNombre ?? 'Material desconocido';
      const acc = porMaterial.get(material) ?? { cantidad: 0, piezas: 0 };
      acc.piezas += 1;
      // m³ imposible o sin medida: cuenta la pieza pero no su volumen.
      if (bloque.m3Supplier !== null && !bloque.m3SupplierImposible) {
        acc.cantidad += bloque.m3Supplier;
      }
      porMaterial.set(material, acc);
    }

    const data: InventarioVistaConjunta = {
      generadoEn: new Date().toISOString(),
      formas: [
        construirResumen('bloques', 'm³', porMaterial),
        // Sin fuente de tablas/losas conectada todavía (no se inventa nada).
        { forma: 'tablas', unidad: 'm²', pendiente: true, totalCantidad: 0, totalPiezas: 0, materiales: [] },
        { forma: 'losas', unidad: 'm²', pendiente: true, totalCantidad: 0, totalPiezas: 0, materiales: [] },
      ],
    };
    this.resumenCache = { en: Date.now(), data };
    return data;
  }

  /**
   * Lista UNIDA de existencias = era "stock" (lotes on-hand de `stock_lot`) ∪
   * era "alta" (bloques recientes de `lot_block_creation` no consumidos). Las dos
   * series de nº de bloque son disjuntas; aun así se deduplica por `name` por si
   * en el futuro un alta llegara a tener stock on-hand (gana la fila de stock).
   * Cacheado (TTL corto): lo comparten lista, resumen y catálogo.
   */
  private async listaCompleta(): Promise<BloqueInventario[]> {
    if (this.listaCache && Date.now() - this.listaCache.en < TTL_LISTA_MS) {
      return this.listaCache.data;
    }

    const [lotesStock, altasRaw, consumidos] = await Promise.all([
      this.prisma.stockLot.findMany({
        where: BLOQUE_EN_EXISTENCIAS,
        // Solo un quant on-hand, para la ubicación. Si el lote tuviera
        // existencias en varias internas, el `orderBy` lo hace determinista.
        include: {
          quants: {
            where: QUANT_ON_HAND,
            include: { location: true },
            orderBy: [{ quantity: 'desc' }, { id: 'asc' }],
            take: 1,
          },
        },
      }),
      this.prisma.lotBlockCreation.findMany({ select: ALTA_SELECT }),
      this.nBloquesConsumidos(),
    ]);

    const nombresOnHand = new Set(
      lotesStock.map((l) => l.name).filter((n): n is string => n !== null),
    );

    // Altas EN FÁBRICA: nº numérico, no entregadas, no consumidas y que no estén
    // ya como stock on-hand (dedupe defensivo).
    const altasEnFabrica = altasRaw.filter((a) => {
      if (a.name === null || !/^\d+$/.test(a.name)) {
        return false;
      }
      if (a.deliveryDone === true) {
        return false;
      }
      if (consumidos.has(Number(a.name))) {
        return false;
      }
      return !nombresOnHand.has(a.name);
    });

    // Resolver nombres de material de las dos eras en una sola pasada.
    const idsMaterial = [
      ...lotesStock.map((l) => l.productId),
      ...altasEnFabrica
        .map((a) => a.productId ?? a.productIdTmpl)
        .filter((id): id is number => id !== null),
    ];
    const nombres = await this.nombresProducto(idsMaterial);

    const data: BloqueInventario[] = [
      ...lotesStock.map((lote) => this.toDomainStock(lote, nombres)),
      ...altasEnFabrica.map((alta) => this.toDomainAlta(alta, nombres)),
    ];
    this.listaCache = { en: Date.now(), data };
    return data;
  }

  /**
   * Nº de PM/bloque consumidos: aparecen aserrados/salidos en
   * `parte_trabajo_mapeada` (operación 2/3), o en `produccion_mapeada` o
   * `parte_discopuente_mapeada` (cualquier lectura = el bloque ya entró a corte).
   * Es la señal fiable de consumo de los bloques recientes (el stock de Odoo no
   * los refleja). Cacheado (TTL).
   */
  private async nBloquesConsumidos(): Promise<Set<number>> {
    if (this.consumoCache && Date.now() - this.consumoCache.en < TTL_CONSUMO_MS) {
      return this.consumoCache.set;
    }
    const [trabajo, produccion, disco] = await Promise.all([
      this.prisma.parteTrabajoMapeada.findMany({
        where: { operacion: { in: OPERACIONES_CONSUMO }, nBloque: { not: null } },
        distinct: ['nBloque'],
        select: { nBloque: true },
      }),
      this.prisma.produccionMapeada.findMany({
        where: { nBloque: { not: null } },
        distinct: ['nBloque'],
        select: { nBloque: true },
      }),
      this.prisma.parteDiscoPuenteMapeada.findMany({
        where: { nBloque: { not: null } },
        distinct: ['nBloque'],
        select: { nBloque: true },
      }),
    ]);
    const set = new Set<number>();
    for (const fila of [...trabajo, ...produccion, ...disco]) {
      if (fila.nBloque !== null) {
        set.add(fila.nBloque);
      }
    }
    this.consumoCache = { en: Date.now(), set };
    return set;
  }

  /**
   * Nombre de cada id de producto, normalizado (sin el prefijo "M3 BLOQUE").
   * Resuelve contra `product_template` y, para las altas que referencian una
   * variante (`product_product`), por su plantilla. Cacheado: solo consulta los
   * ids no vistos.
   */
  private async nombresProducto(ids: number[]): Promise<Map<number, string>> {
    if (Date.now() - this.nombreProductoCacheEn > TTL_CATALOGOS_MS) {
      this.nombreProductoCache.clear();
      this.nombreProductoCacheEn = Date.now();
    }
    const unicos = [...new Set(ids)];
    const faltan = unicos.filter((id) => !this.nombreProductoCache.has(id));
    if (faltan.length > 0) {
      const productos = await this.prisma.productTemplate.findMany({
        where: { id: { in: faltan } },
        select: { id: true, name: true },
      });
      for (const producto of productos) {
        this.nombreProductoCache.set(
          producto.id,
          limpiarNombreMaterial(textoNombre(producto.name)),
        );
      }
      // Algunos ids son variantes (`product_product.id`), no plantillas: se
      // resuelven por su `product_tmpl_id`.
      const faltanComoPlantilla = faltan.filter(
        (id) => !this.nombreProductoCache.has(id),
      );
      if (faltanComoPlantilla.length > 0) {
        const variantes = await this.prisma.productProduct.findMany({
          where: { id: { in: faltanComoPlantilla } },
          select: { id: true, productTmplId: true },
        });
        const plantillaIds = [
          ...new Set(variantes.map((variante) => variante.productTmplId)),
        ];
        const plantillas = await this.prisma.productTemplate.findMany({
          where: { id: { in: plantillaIds } },
          select: { id: true, name: true },
        });
        const nombrePorPlantilla = new Map(
          plantillas.map((producto) => [
            producto.id,
            limpiarNombreMaterial(textoNombre(producto.name)),
          ]),
        );
        for (const variante of variantes) {
          const nombre = nombrePorPlantilla.get(variante.productTmplId) ?? null;
          if (nombre !== null) {
            this.nombreProductoCache.set(variante.id, nombre);
          }
        }
      }
      // Caché negativa: los ids sin fila se marcan null para no reconsultarlos.
      for (const id of faltan) {
        if (!this.nombreProductoCache.has(id)) {
          this.nombreProductoCache.set(id, null);
        }
      }
    }
    const mapa = new Map<number, string>();
    for (const id of unicos) {
      const nombre = this.nombreProductoCache.get(id);
      if (nombre != null) {
        mapa.set(id, nombre);
      }
    }
    return mapa;
  }

  /** Mapea un lote on-hand de `stock_lot` (era "stock"). */
  private toDomainStock(
    lote: LoteConUbicacion,
    nombres: Map<number, string>,
  ): BloqueInventario {
    // Medidas en metros: `volumenBloqueM3` normaliza por umbral las que vengan
    // en cm. La merma necesita las dos medidas y casi nunca está on-hand.
    const sup = medidasM3(lote.largoSupplier, lote.altoSupplier, lote.gruesoSupplier);
    const mrp = medidasM3(lote.largoMrp, lote.altoMrp, lote.gruesoMrp);
    return {
      id: lote.id,
      fuente: 'stock',
      name: lote.name,
      material: lote.productId,
      materialNombre: etiquetaMaterial(lote.productId, nombres),
      tipo: tipoBloque(lote.typeProductLot),
      ubicacion: lote.quants[0]?.location.completeName ?? null,
      largoSupplier: lote.largoSupplier,
      altoSupplier: lote.altoSupplier,
      gruesoSupplier: lote.gruesoSupplier,
      largoMrp: lote.largoMrp,
      altoMrp: lote.altoMrp,
      gruesoMrp: lote.gruesoMrp,
      m3Supplier: sup.m3,
      m3Mrp: mrp.m3,
      m3SupplierImposible: sup.imposible,
      m3MrpImposible: mrp.imposible,
      mermaPct: mermaCompra(sup, mrp),
      createDate: lote.createDate,
      writeDate: lote.writeDate,
    };
  }

  /** Mapea un bloque recibido reciente de `lot_block_creation` (era "alta"). */
  private toDomainAlta(
    alta: AltaBloque,
    nombres: Map<number, string>,
  ): BloqueInventario {
    const materialId = alta.productId ?? alta.productIdTmpl ?? null;
    const sup = medidasM3(alta.largoSupplier, alta.altoSupplier, alta.gruesoSupplier);
    const mrp = medidasM3(alta.largoMrp, alta.altoMrp, alta.gruesoMrp);
    return {
      id: alta.id,
      fuente: 'alta',
      name: alta.name,
      material: materialId,
      materialNombre:
        materialId !== null ? etiquetaMaterial(materialId, nombres) : null,
      // Las altas son bloques recibidos (el log es de bloques); no hay subtipo.
      tipo: 'block',
      // Aún sin ubicación en el stock de Odoo: no se inventa una.
      ubicacion: null,
      largoSupplier: alta.largoSupplier,
      altoSupplier: alta.altoSupplier,
      gruesoSupplier: alta.gruesoSupplier,
      largoMrp: alta.largoMrp,
      altoMrp: alta.altoMrp,
      gruesoMrp: alta.gruesoMrp,
      m3Supplier: sup.m3,
      m3Mrp: mrp.m3,
      m3SupplierImposible: sup.imposible,
      m3MrpImposible: mrp.imposible,
      mermaPct: mermaCompra(sup, mrp),
      createDate: alta.createDate,
      writeDate: alta.writeDate,
    };
  }
}
