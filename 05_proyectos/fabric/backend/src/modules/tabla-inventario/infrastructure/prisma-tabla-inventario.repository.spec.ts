import { PrismaService } from '../../../shared/infrastructure/database/prisma/prisma.service';
import { FiltrosTablaInventario } from '../domain/tabla-inventario.entity';
import { PrismaTablaInventarioRepository } from './prisma-tabla-inventario.repository';

/**
 * El inventario de tablas une dos eras de Odoo y una procedencia pendiente:
 * era "stock" (`stock_lot` on-hand), era "alta" (`lot_tables_creation`) y
 * "aserrado" (partes reales de paquetes pendientes de Odoo). Estos tests fijan: el mapeo
 * en crudo de medidas y conteos (sin inventar: `m2` siempre null, medidas sin
 * convertir más allá de cm→m), la unión y deduplicación de las procedencias (un alta
 * cuyo lote ya consta en `stock_lot` —on-hand o agotado— no se muestra), la
 * resolución de nombre de material y los filtros/catálogo/orden.
 */

const SIN_FILTROS: FiltrosTablaInventario = {
  material: null,
  q: null,
  desde: null,
  hasta: null,
  limit: 50,
  offset: 0,
};

const TEMPLATES = [
  { id: 71, name: { es_ES: 'MARFIL' } },
  { id: 75, name: { es_ES: 'TRAVERTINO TURCO' } },
  { id: 76, name: { es_ES: 'NEGRO MARQUINA' } },
  // Productos de la era nueva: el prefijo de forma se limpia a la piedra.
  { id: 156, name: { es_ES: 'M2 TABLA MARFIL' } },
  { id: 182, name: { es_ES: 'M2 LOSA TRAVERTINO' } },
];

/** Lote de tabla on-hand de `stock_lot` (era "stock"): por defecto nº 500, MARFIL. */
function loteTabla(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: '500',
    productId: 71,
    typeProductLot: 'tables',
    largoSupplier: 2.4,
    altoSupplier: 1.2,
    gruesoSupplier: 0.02,
    packagesTables: 3,
    qtyCreation: 30,
    finished: 'PULIDO',
    createDate: new Date('2026-06-01T00:00:00Z'),
    writeDate: new Date('2026-06-01T00:00:00Z'),
    quants: [{ location: { completeName: 'WH/Stock' } }],
    ...over,
  };
}

/** Alta de tablas de `lot_tables_creation` (era "alta"): por defecto nº 46500, MARFIL nuevo. */
function tablaAlta(over: Record<string, unknown> = {}) {
  return {
    id: 100,
    name: '46500',
    productId: null,
    productIdTmpl: 156,
    nTables: 40,
    packagesTables: 4,
    finished: null,
    deliveryDone: false,
    largoSupplier: 1.65,
    altoSupplier: 0.68,
    gruesoSupplier: 0.02,
    createDate: new Date('2026-06-05T00:00:00Z'),
    writeDate: new Date('2026-06-05T00:00:00Z'),
    ...over,
  };
}

/** Alta de losas de `lot_slabs_creation`: por defecto nº 47100, TRAVERTINO, 60×30 cm. */
function losaAlta(over: Record<string, unknown> = {}) {
  return {
    id: 200,
    name: '47100',
    productId: null,
    productIdTmpl: 182,
    nSlabs: 500,
    finished: null,
    deliveryDone: false,
    largoSupplier: 60,
    altoSupplier: 30,
    gruesoSupplier: 2,
    createDate: new Date('2026-06-04T00:00:00Z'),
    writeDate: new Date('2026-06-04T00:00:00Z'),
    ...over,
  };
}

/** Agregado de partes de paquetes reales (`operacion='4'`) pendiente de Odoo. */
function parteAserrado(over: Record<string, unknown> = {}) {
  return {
    nBloque: 47001,
    material: 76,
    paquetes: 3,
    nTablas: 52,
    largo: 245,
    alto: 122,
    grueso: 2,
    m2: 155.43,
    createDate: new Date('2026-06-10T00:00:00Z'),
    writeDate: new Date('2026-06-10T00:00:00Z'),
    ...over,
  };
}

/**
 * `lotes` = lotes on-hand (era stock); `altas` = filas de `lot_tables_creation`;
 * `nombresAgotados` = nº de lote que existen en `stock_lot` pero NO on-hand (era
 * stock agotada); `altasLosas` = filas de `lot_slabs_creation`. El mock distingue
 * la consulta on-hand de la de nombres por el `select`.
 */
function repoCon(
  lotes: ReturnType<typeof loteTabla>[],
  altas: ReturnType<typeof tablaAlta>[] = [],
  nombresAgotados: string[] = [],
  altasLosas: ReturnType<typeof losaAlta>[] = [],
  partesAserrado: ReturnType<typeof parteAserrado>[] = [],
  materialesAserradoFallback: { nBloque: number; material: number | null }[] = [],
): PrismaTablaInventarioRepository {
  const nombresStock = [
    ...lotes.map((l) => ({ name: l.name })),
    ...nombresAgotados.map((name) => ({ name })),
  ];
  const queryRaw = jest
    .fn()
    .mockResolvedValueOnce(partesAserrado)
    .mockResolvedValue(materialesAserradoFallback);
  const prisma = {
    stockLot: {
      findMany: jest.fn((args: { select?: { name?: boolean } }) =>
        Promise.resolve(args?.select?.name ? nombresStock : lotes),
      ),
    },
    lotTablesCreation: { findMany: jest.fn().mockResolvedValue(altas) },
    lotSlabsCreation: { findMany: jest.fn().mockResolvedValue(altasLosas) },
    $queryRaw: queryRaw,
    productTemplate: { findMany: jest.fn().mockResolvedValue(TEMPLATES) },
    productProduct: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return new PrismaTablaInventarioRepository(prisma as unknown as PrismaService);
}

describe('PrismaTablaInventarioRepository — mapeo en crudo (no inventar)', () => {
  it('mapea un lote de tabla on-hand con medidas/conteos en crudo y m² null', async () => {
    const item = (await repoCon([loteTabla()]).findMany(SIN_FILTROS)).items[0];
    expect(item).toMatchObject({
      id: 1,
      fuente: 'stock',
      name: '500',
      material: 71,
      materialNombre: 'MARFIL',
      tipo: 'tables',
      ubicacion: 'WH/Stock',
      largo: 2.4,
      alto: 1.2,
      grueso: 0.02,
      paquetes: 3,
      nTablas: 30,
      acabado: 'PULIDO',
      m2: null,
    });
  });

  it('distingue losas (slabs) de tablas en el campo tipo', async () => {
    const item = (
      await repoCon([loteTabla({ typeProductLot: 'slabs' })]).findMany(SIN_FILTROS)
    ).items[0];
    expect(item.tipo).toBe('slabs');
  });

  it('material sin fila en product_template cae a "Material {id}"', async () => {
    const item = (
      await repoCon([loteTabla({ productId: 999 })]).findMany(SIN_FILTROS)
    ).items[0];
    expect(item.materialNombre).toBe('Material 999');
  });
});

describe('PrismaTablaInventarioRepository — era "alta" (lot_tables_creation)', () => {
  it('une un alta sin lote en stock como fuente="alta" y deriva el m² (n_tables × largo × alto)', async () => {
    const item = (await repoCon([], [tablaAlta()]).findMany(SIN_FILTROS)).items[0];
    expect(item).toMatchObject({
      id: 100,
      fuente: 'alta',
      name: '46500',
      // El prefijo de forma "M2 TABLA" se limpia a la piedra.
      materialNombre: 'MARFIL',
      tipo: 'tables',
      ubicacion: null,
      largo: 1.65,
      alto: 0.68,
      grueso: 0.02,
      paquetes: 4,
      nTablas: 40,
      // 40 × 1,65 × 0,68 = 44,88 m² (el grueso no entra).
      m2: 44.88,
    });
  });

  it('el m² del alta es null si falta el recuento o la medida es imposible (no inventa)', async () => {
    const sinRecuento = (
      await repoCon([], [tablaAlta({ nTables: null })]).findMany(SIN_FILTROS)
    ).items[0];
    expect(sinRecuento.m2).toBeNull();
    // Largo en zona ambigua (5–10): imposible aun tras normalizar → no se deriva área.
    const medidaImposible = (
      await repoCon([], [tablaAlta({ largoSupplier: 7 })]).findMany(SIN_FILTROS)
    ).items[0];
    expect(medidaImposible.m2).toBeNull();
  });

  it('resuelve el material de la era antigua por product_id', async () => {
    const item = (
      await repoCon([], [tablaAlta({ productId: 71, productIdTmpl: null })]).findMany(
        SIN_FILTROS,
      )
    ).items[0];
    expect(item.materialNombre).toBe('MARFIL');
  });

  it('excluye un alta cuyo lote consta AGOTADO en stock_lot (ya salido)', async () => {
    const pagina = await repoCon([], [tablaAlta({ name: '46500' })], ['46500']).findMany(
      SIN_FILTROS,
    );
    expect(pagina.total).toBe(0);
  });

  it('excluye un alta ya on-hand (gana la fila de stock, sin duplicar)', async () => {
    const pagina = await repoCon(
      [loteTabla({ name: '46500' })],
      [tablaAlta({ name: '46500' })],
    ).findMany(SIN_FILTROS);
    expect(pagina.total).toBe(1);
    expect(pagina.items[0].fuente).toBe('stock');
  });

  it('excluye un alta entregada (delivery_done)', async () => {
    const pagina = await repoCon([], [tablaAlta({ deliveryDone: true })]).findMany(
      SIN_FILTROS,
    );
    expect(pagina.total).toBe(0);
  });

  it('une stock + alta y ordena por fecha (alta más reciente primero)', async () => {
    const pagina = await repoCon(
      [loteTabla({ name: '500' })],
      [tablaAlta({ name: '46500' })],
    ).findMany(SIN_FILTROS);
    expect(pagina.items.map((t) => t.name)).toEqual(['46500', '500']);
    expect(pagina.items.map((t) => t.fuente)).toEqual(['alta', 'stock']);
  });
});

describe('PrismaTablaInventarioRepository — era "aserrado" (partes de paquetes)', () => {
  it('incluye partes reales de paquetes pendientes de Odoo como fuente="aserrado"', async () => {
    const item = (
      await repoCon([], [], [], [], [parteAserrado()]).findMany(SIN_FILTROS)
    ).items[0];
    expect(item).toMatchObject({
      id: -47001,
      fuente: 'aserrado',
      name: '47001',
      material: 76,
      materialNombre: 'NEGRO MARQUINA',
      tipo: 'tables',
      ubicacion: null,
      largo: 2.45,
      alto: 1.22,
      grueso: 0.02,
      paquetes: 3,
      nTablas: 52,
      acabado: null,
      m2: 155.43,
    });
  });

  it('ordena los aserrados pendientes con el resto por fecha descendente', async () => {
    const pagina = await repoCon(
      [loteTabla({ name: '500', createDate: new Date('2026-06-01T00:00:00Z') })],
      [tablaAlta({ name: '46500', createDate: new Date('2026-06-05T00:00:00Z') })],
      [],
      [],
      [parteAserrado({ nBloque: 47001, createDate: new Date('2026-06-10T00:00:00Z') })],
    ).findMany(SIN_FILTROS);
    expect(pagina.items.map((t) => t.fuente)).toEqual(['aserrado', 'alta', 'stock']);
  });

  it('filtra y cataloga materiales de aserrado igual que las otras eras', async () => {
    const repo = repoCon(
      [],
      [],
      [],
      [],
      [
        parteAserrado({ nBloque: 47001, material: 76 }),
        parteAserrado({ nBloque: 47002, material: 71 }),
      ],
    );
    const todas = await repo.findMany(SIN_FILTROS);
    expect(todas.materiales).toEqual(['MARFIL', 'NEGRO MARQUINA']);

    const soloMarfil = await repo.findMany({ ...SIN_FILTROS, material: 'MARFIL' });
    expect(soloMarfil.items.map((t) => t.name)).toEqual(['47002']);
  });

  it('recupera el material pendiente desde PM/lote cuando el parte viene sin material', async () => {
    const item = (
      await repoCon(
        [],
        [],
        [],
        [],
        [parteAserrado({ material: null })],
        [{ nBloque: 47001, material: 75 }],
      ).findMany(SIN_FILTROS)
    ).items[0];
    expect(item).toMatchObject({
      material: 75,
      materialNombre: 'TRAVERTINO TURCO',
    });
  });

  it('mantiene material null si ninguna fuente fiable lo recupera', async () => {
    const item = (
      await repoCon([], [], [], [], [parteAserrado({ material: null })]).findMany(
        SIN_FILTROS,
      )
    ).items[0];
    expect(item).toMatchObject({
      material: null,
      materialNombre: null,
    });
  });

  it('no inventa filas cuando la consulta no devuelve partes validos', async () => {
    const pagina = await repoCon([], [], [], [], []).findMany(SIN_FILTROS);
    expect(pagina.total).toBe(0);
  });
});

describe('PrismaTablaInventarioRepository.resumenTablas — agregación m² del treemap', () => {
  it('agrega las altas por material en m² y cuenta el stock sin m² como pieza', async () => {
    const r = await repoCon(
      // Stock MARFIL (m² null: cuenta pieza, no área).
      [loteTabla({ name: '500', productId: 71 })],
      // Dos altas MARFIL (M2 TABLA MARFIL → MARFIL): 40 × 1,65 × 0,68 = 44,88 m² c/u.
      [
        tablaAlta({ id: 100, name: '46500' }),
        tablaAlta({ id: 101, name: '46501' }),
      ],
    ).resumenTablas();
    expect(r.forma).toBe('tablas');
    expect(r.unidad).toBe('m²');
    expect(r.pendiente).toBe(false);
    expect(r.materiales).toEqual([
      { material: 'MARFIL', cantidad: 89.76, piezas: 3 },
    ]);
    expect(r.totalCantidad).toBe(89.76);
    expect(r.totalPiezas).toBe(3);
  });

  it('agrega los m² reales de aserrado pendiente al resumen de tablas', async () => {
    const r = await repoCon(
      [loteTabla({ name: '500', productId: 71 })],
      [tablaAlta({ id: 100, name: '46500' })],
      [],
      [],
      [parteAserrado({ nBloque: 47001, material: 76, m2: 155.43 })],
    ).resumenTablas();
    expect(r.materiales).toEqual([
      { material: 'NEGRO MARQUINA', cantidad: 155.43, piezas: 1 },
      { material: 'MARFIL', cantidad: 44.88, piezas: 2 },
    ]);
    expect(r.totalCantidad).toBe(200.31);
    expect(r.totalPiezas).toBe(3);
  });
});

describe('PrismaTablaInventarioRepository.resumenLosas — forma "losas" del treemap', () => {
  it('agrega altas de losas por material en m² (n_slabs × largo × alto, cm→m)', async () => {
    const r = await repoCon([], [], [], [losaAlta()]).resumenLosas();
    expect(r.forma).toBe('losas');
    expect(r.unidad).toBe('m²');
    expect(r.pendiente).toBe(false);
    // 500 losas × 0,60 m × 0,30 m = 90 m²; "M2 LOSA TRAVERTINO" → "TRAVERTINO".
    expect(r.materiales).toEqual([
      { material: 'TRAVERTINO', cantidad: 90, piezas: 1 },
    ]);
  });

  it('no mezcla losas con la lista de tablas (findMany sigue siendo de tablas)', async () => {
    const repo = repoCon([], [tablaAlta()], [], [losaAlta()]);
    const tablas = await repo.findMany(SIN_FILTROS);
    expect(tablas.items.map((t) => t.tipo)).toEqual(['tables']);
    const losas = await repo.resumenLosas();
    expect(losas.totalPiezas).toBe(1);
  });
});

describe('PrismaTablaInventarioRepository.findMany — filtros, catálogo y orden', () => {
  it('arma el catálogo de materiales deduplicado y ordenado', async () => {
    const pagina = await repoCon([
      loteTabla({ id: 1, name: '500', productId: 76 }),
      loteTabla({ id: 2, name: '501', productId: 71 }),
      loteTabla({ id: 3, name: '502', productId: 71 }),
    ]).findMany(SIN_FILTROS);
    expect(pagina.materiales).toEqual(['MARFIL', 'NEGRO MARQUINA']);
  });

  it('filtra por nombre de material', async () => {
    const pagina = await repoCon([
      loteTabla({ id: 1, name: '500', productId: 76 }),
      loteTabla({ id: 2, name: '501', productId: 71 }),
    ]).findMany({ ...SIN_FILTROS, material: 'MARFIL' });
    expect(pagina.total).toBe(1);
    expect(pagina.items[0].materialNombre).toBe('MARFIL');
  });

  it('busca por nº de lote (q) parcial y sin distinguir mayúsculas', async () => {
    const pagina = await repoCon([
      loteTabla({ id: 1, name: '500' }),
      loteTabla({ id: 2, name: '6501' }),
    ]).findMany({ ...SIN_FILTROS, q: '65' });
    expect(pagina.items.map((t) => t.name)).toEqual(['6501']);
  });

  it('ordena por fecha descendente y pagina sobre el total', async () => {
    const repo = repoCon([
      loteTabla({ id: 1, name: '500', createDate: new Date('2026-06-01T00:00:00Z') }),
      loteTabla({ id: 2, name: '501', createDate: new Date('2026-06-03T00:00:00Z') }),
      loteTabla({ id: 3, name: '502', createDate: new Date('2026-06-02T00:00:00Z') }),
    ]);
    const p1 = await repo.findMany({ ...SIN_FILTROS, limit: 2, offset: 0 });
    expect(p1.total).toBe(3);
    expect(p1.items.map((t) => t.name)).toEqual(['501', '502']);
    const p2 = await repo.findMany({ ...SIN_FILTROS, limit: 2, offset: 2 });
    expect(p2.items.map((t) => t.name)).toEqual(['500']);
  });

  it('filtra por ventana de fechas (hasta exclusivo)', async () => {
    const pagina = await repoCon([
      loteTabla({ id: 1, name: '500', createDate: new Date('2025-12-01T00:00:00Z') }),
      loteTabla({ id: 2, name: '501', createDate: new Date('2026-06-01T00:00:00Z') }),
    ]).findMany({
      ...SIN_FILTROS,
      desde: new Date('2026-01-01T00:00:00Z'),
      hasta: new Date('2026-12-31T00:00:00Z'),
    });
    expect(pagina.items.map((t) => t.name)).toEqual(['501']);
  });
});
