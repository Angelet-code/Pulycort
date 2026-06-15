import { PrismaService } from '../../../shared/infrastructure/database/prisma/prisma.service';
import { FiltrosBloqueInventario } from '../domain/bloque-inventario.entity';
import { PrismaBloqueInventarioRepository } from './prisma-bloque-inventario.repository';

/**
 * El inventario UNE dos eras disjuntas: stock on-hand (`stock_lot`+`stock_quant`,
 * snapshot histórico) y altas recientes no consumidas (`lot_block_creation`).
 * Estos tests fijan el criterio de unión (incluir altas en fábrica; EXCLUIR
 * consumidas por aserrado/salida/producción/disco-puente, entregadas y de nº no
 * numérico; deduplicar contra el stock) y el mapeo de m³/merma/medida imposible.
 */

const SIN_FILTROS: FiltrosBloqueInventario = {
  material: null,
  q: null,
  desde: null,
  hasta: null,
  limit: 50,
  offset: 0,
};

const TEMPLATES = [
  { id: 71, name: { es_ES: 'MARFIL' } },
  { id: 76, name: { es_ES: 'NEGRO MARQUINA' } },
  { id: 158, name: { es_ES: 'M3 BLOQUE TRAVERTINOS' } },
];

/** Lote on-hand de `stock_lot` (era "stock"): por defecto nº 100, MARFIL, 3 m³. */
function loteStock(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: '100',
    productId: 71,
    typeProductLot: 'block',
    largoSupplier: 2,
    altoSupplier: 1.5,
    gruesoSupplier: 1,
    largoMrp: null,
    altoMrp: null,
    gruesoMrp: null,
    createDate: new Date('2025-08-29T00:00:00Z'),
    writeDate: new Date('2025-08-29T00:00:00Z'),
    quants: [{ location: { completeName: 'WH/Stock' } }],
    ...over,
  };
}

/** Alta de `lot_block_creation` (era "alta"): por defecto 4 m³, TRAVERTINOS. */
function alta(over: Record<string, unknown> = {}) {
  return {
    id: 0,
    name: '0',
    productId: null,
    productIdTmpl: 158,
    deliveryDone: false,
    largoSupplier: 2,
    altoSupplier: 2,
    gruesoSupplier: 1,
    largoMrp: null,
    altoMrp: null,
    gruesoMrp: null,
    createDate: new Date('2026-06-01T00:00:00Z'),
    writeDate: new Date('2026-06-01T00:00:00Z'),
    ...over,
  };
}

/**
 * Repo con un prisma simulado. `consumidos` son los n_bloque que devuelve
 * `parte_trabajo_mapeada` (op 2/3); las demás tablas de consumo van vacías.
 */
function repoCon(opts: {
  lotes?: ReturnType<typeof loteStock>[];
  altas?: ReturnType<typeof alta>[];
  consumidos?: number[];
}): PrismaBloqueInventarioRepository {
  const prisma = {
    stockLot: { findMany: jest.fn().mockResolvedValue(opts.lotes ?? []) },
    lotBlockCreation: { findMany: jest.fn().mockResolvedValue(opts.altas ?? []) },
    parteTrabajoMapeada: {
      findMany: jest
        .fn()
        .mockResolvedValue((opts.consumidos ?? []).map((nBloque) => ({ nBloque }))),
    },
    produccionMapeada: { findMany: jest.fn().mockResolvedValue([]) },
    parteDiscoPuenteMapeada: { findMany: jest.fn().mockResolvedValue([]) },
    productTemplate: { findMany: jest.fn().mockResolvedValue(TEMPLATES) },
    productProduct: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return new PrismaBloqueInventarioRepository(prisma as unknown as PrismaService);
}

describe('PrismaBloqueInventarioRepository — unión de las dos eras', () => {
  it('une stock on-hand con altas en fábrica', async () => {
    const repo = repoCon({
      lotes: [loteStock()],
      altas: [alta({ id: 10, name: '46100' })],
    });
    const pagina = await repo.findMany(SIN_FILTROS);

    expect(pagina.total).toBe(2);
    const stock = pagina.items.find((b) => b.fuente === 'stock')!;
    const recibido = pagina.items.find((b) => b.fuente === 'alta')!;
    expect(stock.name).toBe('100');
    expect(stock.ubicacion).toBe('WH/Stock');
    expect(stock.materialNombre).toBe('MARFIL');
    expect(recibido.name).toBe('46100');
    // El alta no tiene ubicación en el stock de Odoo: no se inventa una.
    expect(recibido.ubicacion).toBeNull();
    // Nombre normalizado sin el prefijo "M3 BLOQUE".
    expect(recibido.materialNombre).toBe('TRAVERTINOS');
    expect(recibido.tipo).toBe('block');
  });

  it('excluye altas consumidas (aserrado/salida/producción/disco-puente)', async () => {
    const repo = repoCon({
      altas: [alta({ id: 10, name: '46100' }), alta({ id: 11, name: '200' })],
      consumidos: [200],
    });
    const pagina = await repo.findMany(SIN_FILTROS);
    expect(pagina.total).toBe(1);
    expect(pagina.items[0].name).toBe('46100');
  });

  it('excluye altas entregadas y de nº no numérico', async () => {
    const repo = repoCon({
      altas: [
        alta({ id: 10, name: '46100' }),
        alta({ id: 12, name: '46200', deliveryDone: true }),
        alta({ id: 14, name: 'ABC' }),
      ],
    });
    const pagina = await repo.findMany(SIN_FILTROS);
    expect(pagina.items.map((b) => b.name)).toEqual(['46100']);
  });

  it('deduplica: un alta con el mismo nº que un lote on-hand no se cuenta dos veces', async () => {
    const repo = repoCon({
      lotes: [loteStock()], // nº 100
      altas: [alta({ id: 13, name: '100' })],
    });
    const pagina = await repo.findMany(SIN_FILTROS);
    expect(pagina.total).toBe(1);
    expect(pagina.items[0].fuente).toBe('stock');
  });

  it('ordena por fecha de alta descendente (lo más reciente primero)', async () => {
    const repo = repoCon({
      lotes: [loteStock()], // 2025-08-29
      altas: [alta({ id: 10, name: '46100' })], // 2026-06-01
    });
    const pagina = await repo.findMany(SIN_FILTROS);
    expect(pagina.items.map((b) => b.name)).toEqual(['46100', '100']);
  });
});

describe('PrismaBloqueInventarioRepository.resumen — m³ por material', () => {
  it('agrega el m³ por material y cuenta la pieza imposible sin su volumen', async () => {
    const repo = repoCon({
      lotes: [
        // NEGRO MARQUINA: 3 bloques de 2 m³ + 1 con medida imposible (7 m de lado).
        loteStock({ id: 1, name: '1', productId: 76, largoSupplier: 2, altoSupplier: 1, gruesoSupplier: 1 }),
        loteStock({ id: 2, name: '2', productId: 76, largoSupplier: 2, altoSupplier: 1, gruesoSupplier: 1 }),
        loteStock({ id: 3, name: '3', productId: 76, largoSupplier: 2, altoSupplier: 1, gruesoSupplier: 1 }),
        loteStock({ id: 4, name: '4', productId: 76, largoSupplier: 7, altoSupplier: 1, gruesoSupplier: 1 }),
        // MARFIL: 2 bloques de 4 m³.
        loteStock({ id: 5, name: '5', productId: 71, largoSupplier: 4, altoSupplier: 1, gruesoSupplier: 1 }),
        loteStock({ id: 6, name: '6', productId: 71, largoSupplier: 4, altoSupplier: 1, gruesoSupplier: 1 }),
      ],
    });

    const bloques = (await repo.resumen()).formas.find((f) => f.forma === 'bloques')!;
    expect(bloques.unidad).toBe('m³');
    expect(bloques.pendiente).toBe(false);
    // Ordenado de mayor a menor cantidad: MARFIL (8) antes que MARQUINA (6).
    expect(bloques.materiales).toEqual([
      { material: 'MARFIL', cantidad: 8, piezas: 2 },
      { material: 'NEGRO MARQUINA', cantidad: 6, piezas: 4 },
    ]);
    expect(bloques.totalCantidad).toBe(14);
    expect(bloques.totalPiezas).toBe(6);
  });

  it('suma las dos eras y deja tablas/losas pendientes sin inventar', async () => {
    const repo = repoCon({
      lotes: [loteStock()], // MARFIL 3 m³
      altas: [alta({ id: 10, name: '46100' })], // TRAVERTINOS 4 m³
    });
    const vista = await repo.resumen();
    const bloques = vista.formas.find((f) => f.forma === 'bloques')!;
    expect(bloques.totalPiezas).toBe(2);
    expect(bloques.totalCantidad).toBeCloseTo(7, 5);
    expect(vista.formas.find((f) => f.forma === 'tablas')!).toMatchObject({ pendiente: true, totalPiezas: 0 });
    expect(vista.formas.find((f) => f.forma === 'losas')!).toMatchObject({ pendiente: true, totalPiezas: 0 });
  });
});

describe('PrismaBloqueInventarioRepository — mapeo de medidas y merma', () => {
  it('m³ del proveedor; merma null sin medida de fábrica', async () => {
    const repo = repoCon({ lotes: [loteStock({ id: 317, name: '43582', productId: 76 })] });
    const item = (await repo.findMany(SIN_FILTROS)).items[0];
    expect(item).toMatchObject({
      id: 317,
      fuente: 'stock',
      name: '43582',
      material: 76,
      materialNombre: 'NEGRO MARQUINA',
      tipo: 'block',
      ubicacion: 'WH/Stock',
      m3Supplier: 3,
      m3Mrp: null,
      m3SupplierImposible: false,
      mermaPct: null,
    });
  });

  it('calcula la merma con medida de proveedor y de fábrica', async () => {
    const repo = repoCon({
      // proveedor 2,5×2×2 = 10 m³; fábrica 2×2×2 = 8 m³ → merma 20 %.
      lotes: [
        loteStock({
          largoSupplier: 2.5, altoSupplier: 2, gruesoSupplier: 2,
          largoMrp: 2, altoMrp: 2, gruesoMrp: 2,
        }),
      ],
    });
    const item = (await repo.findMany(SIN_FILTROS)).items[0];
    expect(item.m3Supplier).toBe(10);
    expect(item.m3Mrp).toBe(8);
    expect(item.mermaPct).toBeCloseTo(20, 6);
  });

  it('medida de proveedor imposible: marca el flag, conserva el m³ y anula la merma', async () => {
    const repo = repoCon({
      lotes: [
        loteStock({
          largoSupplier: 7, altoSupplier: 1, gruesoSupplier: 1,
          largoMrp: 2, altoMrp: 1, gruesoMrp: 1,
        }),
      ],
    });
    const item = (await repo.findMany(SIN_FILTROS)).items[0];
    expect(item.m3SupplierImposible).toBe(true);
    // El m³ se calcula igualmente (7); la UI lo oculta por el flag, no es null.
    expect(item.m3Supplier).toBe(7);
    expect(item.mermaPct).toBeNull();
  });

  it('medida de fábrica imposible: marca el flag y anula la merma aunque el proveedor sea válido', async () => {
    const repo = repoCon({
      lotes: [
        loteStock({
          largoSupplier: 2, altoSupplier: 1, gruesoSupplier: 1,
          largoMrp: 7, altoMrp: 1, gruesoMrp: 1,
        }),
      ],
    });
    const item = (await repo.findMany(SIN_FILTROS)).items[0];
    expect(item.m3SupplierImposible).toBe(false);
    expect(item.m3MrpImposible).toBe(true);
    expect(item.mermaPct).toBeNull();
  });
});

describe('PrismaBloqueInventarioRepository.findMany — filtros y catálogo', () => {
  it('el catálogo y el filtro de material cubren las dos eras', async () => {
    const repo = repoCon({
      lotes: [loteStock()], // MARFIL
      altas: [alta({ id: 10, name: '46100' })], // TRAVERTINOS
    });
    const todas = await repo.findMany(SIN_FILTROS);
    expect(todas.materiales).toEqual(['MARFIL', 'TRAVERTINOS']);

    const soloMarfil = await repo.findMany({ ...SIN_FILTROS, material: 'MARFIL' });
    expect(soloMarfil.total).toBe(1);
    expect(soloMarfil.items[0].materialNombre).toBe('MARFIL');
  });

  it('busca por nº de bloque (q) sin distinguir mayúsculas/parcial', async () => {
    const repo = repoCon({
      lotes: [loteStock({ id: 1, name: '43582' })],
      altas: [alta({ id: 10, name: '46100' })],
    });
    const pagina = await repo.findMany({ ...SIN_FILTROS, q: '461' });
    expect(pagina.items.map((b) => b.name)).toEqual(['46100']);
  });

  it('filtra por ventana de fechas de alta (hasta exclusivo)', async () => {
    const repo = repoCon({
      lotes: [loteStock()], // 2025-08-29
      altas: [alta({ id: 10, name: '46100' })], // 2026-06-01
    });
    const pagina = await repo.findMany({
      ...SIN_FILTROS,
      desde: new Date('2026-01-01T00:00:00Z'),
      hasta: new Date('2026-12-31T00:00:00Z'),
    });
    expect(pagina.items.map((b) => b.name)).toEqual(['46100']);
  });

  it('pagina sobre el total combinado', async () => {
    const repo = repoCon({
      lotes: [loteStock({ id: 1, name: '100' })],
      altas: [
        alta({ id: 10, name: '46100', createDate: new Date('2026-06-03T00:00:00Z') }),
        alta({ id: 11, name: '46101', createDate: new Date('2026-06-02T00:00:00Z') }),
      ],
    });
    const p1 = await repo.findMany({ ...SIN_FILTROS, limit: 2, offset: 0 });
    expect(p1.total).toBe(3);
    expect(p1.items).toHaveLength(2);
    const p2 = await repo.findMany({ ...SIN_FILTROS, limit: 2, offset: 2 });
    expect(p2.items).toHaveLength(1);
    expect(p2.items[0].name).toBe('100');
  });
});
