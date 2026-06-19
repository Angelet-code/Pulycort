import { PrismaFabricRepository } from './prisma-fabric.repository';
import { PrismaService } from '../../../shared/infrastructure/database/prisma/prisma.service';

/**
 * Estado del telar a partir de produccion_mapeada: las reglas de staleness
 * son la barrera para no afirmar "en marcha" con datos viejos o con relojes
 * de consola corruptos (caso real: telar 1 "en marcha" sin lecturas en 12 h).
 */

// Reloj fijo del test: 2026-06-12 23:00:00 UTC.
const AHORA = Date.UTC(2026, 5, 12, 23, 0, 0);
const MIN = 60_000;
const HORA = 3_600_000;

interface FilaPrueba {
  id: number;
  telarN: string;
  fechaHora: Date;
  createDate: Date | null;
  incidencia: string;
  potencia: number;
  consumo: number;
  golpesXMinuto: number;
  velocidad: number;
  alturaActual: number;
  largo: number;
  alto: number;
  grueso: number;
  material: number | null;
  nBloque: number | null;
  operario1: number | null;
  operario2: number | null;
  fecha: Date | null;
  writeDate: Date | null;
  createUid: number | null;
  writeUid: number | null;
  hora: number | null;
  dato1: number | null;
  dato2: number | null;
  dato3: number | null;
  dato4: number | null;
  dato5: number | null;
  dato6: number | null;
}

let siguienteId = 1;

/** Fila coherente con el validador (consumo ≈ 2 × potencia, rangos físicos). */
function fila(opciones: {
  telar: number;
  haceMs: number;
  incidencia: string;
  potencia?: number;
  alturaMm?: number;
  sinCreateDate?: boolean;
  nBloque?: number;
  largo?: number;
  alto?: number;
  grueso?: number;
  /** Desfase de create_date (recepción) respecto a la fecha declarada. */
  desfaseRecibidaMs?: number;
}): FilaPrueba {
  const fechaHora = new Date(AHORA - opciones.haceMs);
  const potencia = opciones.potencia ?? 45;
  // create_date llega ~3 min después de la fecha declarada (lote del ETL); un
  // desfase grande (±) simula un reloj de consola corrupto → cuarentena (#1).
  const desfaseRecibida = opciones.desfaseRecibidaMs ?? 3 * MIN;
  return {
    id: siguienteId++,
    telarN: String(opciones.telar),
    fechaHora,
    createDate: opciones.sinCreateDate ? null : new Date(fechaHora.getTime() + desfaseRecibida),
    incidencia: opciones.incidencia,
    potencia,
    consumo: potencia * 2,
    golpesXMinuto: 0,
    velocidad: 20,
    alturaActual: opciones.alturaMm ?? 1800,
    largo: opciones.largo ?? 280,
    alto: opciones.alto ?? 160,
    grueso: opciones.grueso ?? 190,
    material: 1,
    nBloque: opciones.nBloque ?? 47177,
    operario1: null,
    operario2: null,
    fecha: null,
    writeDate: null,
    createUid: null,
    writeUid: null,
    hora: null,
    dato1: null,
    dato2: null,
    dato3: null,
    dato4: null,
    dato5: null,
    dato6: null,
  };
}

function repoCon(filas: FilaPrueba[]): PrismaFabricRepository {
  const prisma = {
    produccionMapeada: { findMany: jest.fn().mockResolvedValue(filas) },
    parteTrabajoMapeada: { findMany: jest.fn().mockResolvedValue([]) },
    // Sin permisos sobre hr_employee: el repositorio degrada a códigos.
    $queryRawUnsafe: jest.fn().mockRejectedValue(new Error('permission denied')),
  } as unknown as PrismaService;
  return new PrismaFabricRepository(prisma);
}

async function estadoTelar(filas: FilaPrueba[], telarId: number): Promise<string> {
  const planta = await repoCon(filas).getSnapshotPlanta();
  return planta.telares.find((t) => t.telarId === telarId)!.estado;
}

describe('PrismaFabricRepository · estado del telar', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(AHORA);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('marca "marcha" con una lectura de corte reciente', async () => {
    const filas = [
      fila({ telar: 1, haceMs: 20 * MIN, incidencia: '1', alturaMm: 1810 }),
      fila({ telar: 1, haceMs: 10 * MIN, incidencia: '1', alturaMm: 1805 }),
    ];
    expect(await estadoTelar(filas, 1)).toBe('marcha');
  });

  it('expone pmLote derivado de n_bloque sin retirar los campos heredados', async () => {
    const filas = [
      fila({ telar: 1, haceMs: 20 * MIN, incidencia: '1', alturaMm: 1810 }),
      fila({ telar: 1, haceMs: 10 * MIN, incidencia: '1', alturaMm: 1805 }),
    ];
    const planta = await repoCon(filas).getSnapshotPlanta();
    const telar = planta.telares.find((t) => t.telarId === 1)!;

    expect(telar.ultimaLectura?.bloque).toBe(47177);
    expect(telar.ultimaLectura?.pmLote).toBe(47177);
    expect(telar.bloque?.numero).toBe(47177);
    expect(telar.bloque?.pmLote).toBe(47177);
  });

  it('marca "paro" con código 2 reciente', async () => {
    const filas = [fila({ telar: 1, haceMs: 10 * MIN, incidencia: '2', potencia: 13 })];
    expect(await estadoTelar(filas, 1)).toBe('paro');
  });

  it('códigos confirmados (Pulycort 2026-06-16): 4 modo manual y 5 automático son marcha; 3 rotura de material es incidencia', async () => {
    expect(
      await estadoTelar([fila({ telar: 1, haceMs: 10 * MIN, incidencia: '4' })], 1),
    ).toBe('marcha');
    expect(
      await estadoTelar([fila({ telar: 1, haceMs: 10 * MIN, incidencia: '5' })], 1),
    ).toBe('marcha');
    expect(
      await estadoTelar([fila({ telar: 1, haceMs: 10 * MIN, incidencia: '3' })], 1),
    ).toBe('incidencia');
  });

  it('cae a "sin-datos" cuando la última lectura supera el umbral, aunque dijera marcha', async () => {
    // Caso real del telar 1: último registro horas atrás con la fábrica parada.
    const filas = [
      fila({ telar: 1, haceMs: 12 * HORA + 10 * MIN, incidencia: '1', alturaMm: 1810 }),
      fila({ telar: 1, haceMs: 12 * HORA, incidencia: '1', alturaMm: 1805 }),
    ];
    expect(await estadoTelar(filas, 1)).toBe('sin-datos');
  });

  it('conserva ultimaLecturaEn (hace cuánto llegó el dato) aunque el telar esté «sin señal»', async () => {
    // Telar callado 12 h: estado «sin-datos» y sin ultimaLectura viva, pero la
    // marca de la última lectura recibida persiste para mostrar "hace 12 h".
    const filas = [
      fila({ telar: 1, haceMs: 12 * HORA + 10 * MIN, incidencia: '1', alturaMm: 1810 }),
      fila({ telar: 1, haceMs: 12 * HORA, incidencia: '1', alturaMm: 1805 }),
    ];
    const planta = await repoCon(filas).getSnapshotPlanta();
    const telar = planta.telares.find((t) => t.telarId === 1)!;
    expect(telar.estado).toBe('sin-datos');
    expect(telar.ultimaLectura).toBeNull();
    // create_date de la última fila = fechaHora + 3 min (lote del ETL).
    expect(telar.ultimaLecturaEn).toBe(new Date(AHORA - 12 * HORA + 3 * MIN).toISOString());
  });

  it('una lectura con fecha FUTURA (reloj corrupto, sin create_date) no cuenta como reciente', async () => {
    // Sin create_date, recibidaEn cae a la fecha declarada por la máquina.
    // Antes del umbral absoluto, `ahora - futuro ≤ 25 min` se cumplía siempre
    // y el telar quedaba "en marcha" indefinidamente.
    const filas = [
      fila({ telar: 1, haceMs: -12 * HORA, incidencia: '1', sinCreateDate: true }),
    ];
    expect(await estadoTelar(filas, 1)).toBe('sin-datos');
  });

  it('una lectura futura no eclipsa a una válida reciente', async () => {
    const filas = [
      fila({ telar: 1, haceMs: 10 * MIN, incidencia: '2', potencia: 13 }),
      fila({ telar: 1, haceMs: -12 * HORA, incidencia: '1', sinCreateDate: true }),
    ];
    expect(await estadoTelar(filas, 1)).toBe('paro');
  });

  it('marca "sin-datos" un telar sin filas', async () => {
    expect(await estadoTelar([], 3)).toBe('sin-datos');
  });

  it('declara fuente "postgres" en el snapshot de planta', async () => {
    const planta = await repoCon([]).getSnapshotPlanta();
    expect(planta.fuente).toBe('postgres');
  });
});

/**
 * m³/rendimiento POR LOTE: la medida REAL del bloque sale del inventario
 * (`lot_block_creation`) por PM, no de la consola de `produccion_mapeada`
 * (que hereda del bloque anterior = ruido). La PM es un identificador ÚNICO
 * de bloque (1:1): un PM con varias filas = PM duplicado (error de dato), no
 * se suma ni se calcula su m³.
 */
function repoConInventario(
  filas: FilaPrueba[],
  inventario: Array<Record<string, unknown>>,
): PrismaFabricRepository {
  const prisma = {
    produccionMapeada: { findMany: jest.fn().mockResolvedValue(filas) },
    parteTrabajoMapeada: { findMany: jest.fn().mockResolvedValue([]) },
    lotBlockCreation: { findMany: jest.fn().mockResolvedValue(inventario) },
    $queryRawUnsafe: jest.fn().mockRejectedValue(new Error('permission denied')),
  } as unknown as PrismaService;
  return new PrismaFabricRepository(prisma);
}

async function cicloDe(
  filas: FilaPrueba[],
  inventario: Array<Record<string, unknown>>,
  pm: number,
) {
  const est = await repoConInventario(filas, inventario).getEstadisticas('7d');
  return est.ciclosCompletados.find((c) => c.pmLote === pm);
}

// Run ya completado (no es el actual): última lectura 3 h atrás.
function runCompletado(): FilaPrueba[] {
  return [
    fila({ telar: 1, haceMs: 3 * HORA, incidencia: '1', alturaMm: 1810 }),
    fila({ telar: 1, haceMs: 3 * HORA - 10 * MIN, incidencia: '1', alturaMm: 1805 }),
  ];
}

// Run completado en un telar y nº de bloque concretos (para el cruce de PM).
function runCompletadoDe(telar: number, nBloque: number): FilaPrueba[] {
  return [
    fila({ telar, nBloque, haceMs: 3 * HORA, incidencia: '1', alturaMm: 1810 }),
    fila({ telar, nBloque, haceMs: 3 * HORA - 10 * MIN, incidencia: '1', alturaMm: 1805 }),
  ];
}

// Parte de paquetes (operación 4) con telar y nº de bloque explícitos.
function parteOp4(opciones: {
  telar: number;
  nBloque: number;
  haceMs?: number;
  tablas?: number;
  m2?: number;
}): Record<string, unknown> {
  const fechaHora = new Date(AHORA - (opciones.haceMs ?? 3 * HORA));
  return {
    id: siguienteId++,
    nTelar: String(opciones.telar),
    nBloque: opciones.nBloque,
    operacion: '4',
    operario1: null,
    operario2: null,
    nPaquete: 3,
    nTablas: opciones.tablas ?? 37,
    largoTablas: 1.65,
    altoTablas: 1.35,
    gruesoTablas: 0.02,
    metrosCuadradosTablas: opciones.m2 ?? 82.4,
    createDate: fechaHora,
    fechaHora,
  };
}

function repoConPartes(
  filas: FilaPrueba[],
  inventario: Array<Record<string, unknown>>,
  partes: Array<Record<string, unknown>>,
): PrismaFabricRepository {
  const prisma = {
    produccionMapeada: { findMany: jest.fn().mockResolvedValue(filas) },
    parteTrabajoMapeada: { findMany: jest.fn().mockResolvedValue(partes) },
    lotBlockCreation: { findMany: jest.fn().mockResolvedValue(inventario) },
    stockLot: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRawUnsafe: jest.fn().mockRejectedValue(new Error('permission denied')),
  } as unknown as PrismaService;
  return new PrismaFabricRepository(prisma);
}

/**
 * PM heredada / mal etiquetada por la consola del telar: el run de un telar trae
 * una PM cuyo parte de aserrado (op 4) consta en OTRO telar. Caso real 2026-06-15:
 * la consola del telar 4 etiquetó su corte como PM 47156, pero 47156 se aserró en
 * el telar 1 (su único parte op 4 está allí). El ciclo del telar 4 es un fantasma:
 * se marca `parteEnOtroTelar` para avisar de que la fila no es fiable.
 */
describe('PrismaFabricRepository · parte de aserrado en otro telar (PM heredada)', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(AHORA);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('marca parteEnOtroTelar cuando el parte op4 de la PM está en otro telar y el run no tiene parte propio', async () => {
    const est = await repoConPartes(
      runCompletadoDe(4, 47156), // run de consola del telar 4 con PM 47156
      [],
      [parteOp4({ telar: 1, nBloque: 47156, haceMs: 9 * 24 * HORA })], // pero su parte está en el telar 1
    ).getEstadisticas('30d');
    const ciclo = est.ciclosCompletados.find((c) => c.telarId === 4 && c.pmLote === 47156);
    expect(ciclo?.parteEnOtroTelar).toBe(true);
    expect(ciclo?.paquetes).toBeNull(); // run fantasma: sin parte propio en este telar
  });

  it('NO marca parteEnOtroTelar cuando el parte op4 está en el mismo telar del run', async () => {
    const est = await repoConPartes(
      runCompletadoDe(1, 47156),
      [],
      [parteOp4({ telar: 1, nBloque: 47156 })],
    ).getEstadisticas('30d');
    const ciclo = est.ciclosCompletados.find((c) => c.telarId === 1 && c.pmLote === 47156);
    expect(ciclo?.parteEnOtroTelar).toBe(false);
    expect(ciclo?.paquetes).not.toBeNull(); // aserrado real en este telar
  });

  it('NO marca parteEnOtroTelar cuando la PM no tiene ningún parte op4', async () => {
    const est = await repoConPartes(runCompletadoDe(4, 47156), [], []).getEstadisticas('30d');
    const ciclo = est.ciclosCompletados.find((c) => c.telarId === 4 && c.pmLote === 47156);
    expect(ciclo?.parteEnOtroTelar).toBe(false);
  });

  it('NO marca parteEnOtroTelar por una PM REUTILIZADA meses atrás en otro telar (fuera de ventana)', async () => {
    // Los nº de bloque se reciclan: un parte de hace 60 días en otro telar es de
    // OTRO bloque físico, no una PM heredada del corte actual → no debe marcar.
    const est = await repoConPartes(
      runCompletadoDe(4, 47156),
      [],
      [parteOp4({ telar: 1, nBloque: 47156, haceMs: 60 * 24 * HORA })],
    ).getEstadisticas('90d');
    const ciclo = est.ciclosCompletados.find((c) => c.telarId === 4 && c.pmLote === 47156);
    expect(ciclo?.parteEnOtroTelar).toBe(false);
  });

  it('NO marca parteEnOtroTelar cuando la PM tiene parte en su telar Y en otro', async () => {
    const est = await repoConPartes(
      runCompletadoDe(1, 47156),
      [],
      [
        parteOp4({ telar: 1, nBloque: 47156 }), // parte propio del telar del run
        parteOp4({ telar: 4, nBloque: 47156, haceMs: 5 * 24 * HORA }), // y otro en el telar 4
      ],
    ).getEstadisticas('30d');
    const ciclo = est.ciclosCompletados.find((c) => c.telarId === 1 && c.pmLote === 47156);
    expect(ciclo?.parteEnOtroTelar).toBe(false);
  });
});

describe('PrismaFabricRepository · detalle de medidas dudosas', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(AHORA);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('diagnostica consola arrastrada cuando la medida coincide con el lote anterior', async () => {
    const filas = [
      fila({ telar: 1, nBloque: 47000, haceMs: 6 * HORA, incidencia: '1', largo: 100, alto: 100, grueso: 10 }),
      fila({ telar: 1, nBloque: 47000, haceMs: 6 * HORA - 10 * MIN, incidencia: '1', largo: 100, alto: 100, grueso: 10 }),
      fila({ telar: 1, nBloque: 47177, haceMs: 4 * HORA, incidencia: '1', largo: 100, alto: 100, grueso: 10 }),
      fila({ telar: 1, nBloque: 47177, haceMs: 4 * HORA - 10 * MIN, incidencia: '1', largo: 100, alto: 100, grueso: 10 }),
    ];
    const pagina = await repoConPartes(
      filas,
      [],
      [parteOp4({ telar: 1, nBloque: 47177, haceMs: 4 * HORA - 5 * MIN })],
    ).getMedidasDudosas(null, null, null);

    const bloque = pagina.bloques.find((b) => b.pmLote === 47177)!;
    expect(bloque.diagnostico.origen).toBe('operario-consola');
    expect(bloque.diagnostico.tono).toBe('aviso');
    expect(bloque.medidasConsola[0].coincideConLoteAnterior).toBe(true);
    expect(bloque.medidasConsola[0].coincidencias).toEqual(
      expect.arrayContaining([expect.objectContaining({ pmLote: 47000, esBloqueAnterior: true })]),
    );
    expect(bloque.lineaTiempo.some((e) => e.tipo === 'parte')).toBe(true);
    const tiempos = bloque.lineaTiempo.map((e) => new Date(e.fechaHora).getTime());
    expect(tiempos).toEqual([...tiempos].sort((a, b) => a - b));
  });

  it('diagnostica numero de lote equivocado cuando el parte esta en otro telar', async () => {
    const pagina = await repoConPartes(
      runCompletadoDe(4, 47156),
      [],
      [parteOp4({ telar: 1, nBloque: 47156, haceMs: 9 * 24 * HORA })],
    ).getMedidasDudosas(null, null, null);

    const bloque = pagina.bloques.find((b) => b.pmLote === 47156)!;
    expect(bloque.parteEnOtroTelar).toBe(true);
    expect(bloque.diagnostico.origen).toBe('lote-equivocado');
    expect(bloque.diagnostico.tono).toBe('mal');
    expect(bloque.partes).toEqual(
      expect.arrayContaining([expect.objectContaining({ telarId: 1, esDelTelarDelRun: false })]),
    );
  });

  it('diagnostica inventario/parte incompatible cuando el m3 no permite la piedra cortada', async () => {
    const pagina = await repoConPartes(
      runCompletado(),
      [
        {
          name: '47177',
          largoMrp: 1,
          altoMrp: 1,
          gruesoMrp: 1,
          largoSupplier: 1,
          altoSupplier: 1,
          gruesoSupplier: 1,
        },
      ],
      [parteOp4({ telar: 1, nBloque: 47177 })],
    ).getMedidasDudosas(null, null, null);

    const bloque = pagina.bloques.find((b) => b.pmLote === 47177)!;
    expect(bloque.volumenIncompatibleParte).toBe(true);
    expect(bloque.diagnostico.origen).toBe('inventario-parte');
    expect(bloque.diagnostico.tono).toBe('mal');
    expect(bloque.piedraCortadaM3).toBeGreaterThan(bloque.volumenInventarioM3 ?? 0);
  });
});

describe('PrismaFabricRepository · m³/rendimiento por lote desde inventario', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(AHORA);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('1 bloque en el lote: m³ exacto desde la medida de fábrica, sin estimación', async () => {
    const ciclo = await cicloDe(
      runCompletado(),
      [
        {
          name: '47177',
          largoMrp: 2.8,
          altoMrp: 1.6,
          gruesoMrp: 1.9,
          largoSupplier: 3,
          altoSupplier: 1.6,
          gruesoSupplier: 2,
        },
      ],
      47177,
    );
    expect(ciclo?.volumenM3).toBeCloseTo(8.51, 2); // 2,8 × 1,6 × 1,9 (metros)
    expect(ciclo?.bloquesEnLote).toBe(1);
    expect(ciclo?.volumenEstimado).toBe(false);
  });

  it('PM duplicado (aparece en >1 bloque del inventario): error de dato, sin m³ ni rendimiento', async () => {
    const ciclo = await cicloDe(
      runCompletado(),
      [
        { name: '47177', largoMrp: 2, altoMrp: 1, gruesoMrp: 1, largoSupplier: 2, altoSupplier: 1, gruesoSupplier: 1 },
        { name: '47177', largoMrp: 3, altoMrp: 1, gruesoMrp: 1, largoSupplier: 3, altoSupplier: 1, gruesoSupplier: 1 },
      ],
      47177,
    );
    // La PM debe ser un identificador único (1:1, Pulycort 2026-06-15): repetida
    // = error de dato, no se suma ni se inventa un m³.
    expect(ciclo?.pmDuplicado).toBe(true);
    expect(ciclo?.bloquesEnLote).toBe(2);
    expect(ciclo?.volumenM3).toBeNull();
    expect(ciclo?.rendimientoM2M3).toBeNull();
  });

  it('PM sin alta en inventario: m³, rendimiento y nº de bloques a null, sin estimación', async () => {
    const ciclo = await cicloDe(runCompletado(), [], 47177);
    expect(ciclo?.volumenM3).toBeNull();
    expect(ciclo?.bloquesEnLote).toBeNull();
    expect(ciclo?.volumenEstimado).toBe(false);
    expect(ciclo?.rendimientoM2M3).toBeNull();
  });

  it('sin medida de fábrica: respaldo a la del proveedor, marcado como estimación', async () => {
    const ciclo = await cicloDe(
      runCompletado(),
      [
        {
          name: '47177',
          largoMrp: null,
          altoMrp: null,
          gruesoMrp: null,
          largoSupplier: 2,
          altoSupplier: 1.5,
          gruesoSupplier: 1,
        },
      ],
      47177,
    );
    expect(ciclo?.volumenM3).toBeCloseTo(3, 2); // 2 × 1,5 × 1 (proveedor)
    expect(ciclo?.bloquesEnLote).toBe(1);
    expect(ciclo?.volumenEstimado).toBe(true);
  });
});

/**
 * Unidades mezcladas en `lot_block_creation` (~4,6 % de filas reales): el m³ se
 * normaliza por umbral cm→m (igual que `tablaAMetros` para los partes), no se
 * multiplica a ciegas. Caso real que disparó la corrección: PM 47220, grueso 85
 * (cm) → 216,75 m³ imposible y rendimiento 0,41 m²/m³ en vez de ~40.
 */
describe('PrismaFabricRepository · m³ con unidades mezcladas (cm/m) del inventario', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(AHORA);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('grueso en cm (caso PM 47220): normaliza a metros, no infla el m³ ×100', async () => {
    const ciclo = await cicloDe(
      runCompletado(),
      [
        {
          name: '47177',
          largoMrp: 1.7,
          altoMrp: 1.5,
          gruesoMrp: 85,
          largoSupplier: 1.7,
          altoSupplier: 1.5,
          gruesoSupplier: 85,
        },
      ],
      47177,
    );
    expect(ciclo?.volumenM3).toBeCloseTo(2.17, 2); // 1,7 × 1,5 × 0,85, no 216,75
    expect(ciclo?.volumenImposible).toBe(false);
  });

  it('las tres dimensiones en cm: las normaliza a un m³ plausible', async () => {
    const ciclo = await cicloDe(
      runCompletado(),
      [
        {
          name: '47177',
          largoMrp: 285,
          altoMrp: 160,
          gruesoMrp: 180,
          largoSupplier: 285,
          altoSupplier: 160,
          gruesoSupplier: 180,
        },
      ],
      47177,
    );
    expect(ciclo?.volumenM3).toBeCloseTo(8.21, 2); // 2,85 × 1,6 × 1,8
    expect(ciclo?.volumenImposible).toBe(false);
  });

  it('medida imposible aun tras normalizar: anula m³ y rendimiento y marca ⚠', async () => {
    const ciclo = await cicloDe(
      runCompletado(),
      [
        {
          name: '47177',
          largoMrp: 7,
          altoMrp: 2,
          gruesoMrp: 2,
          largoSupplier: 7,
          altoSupplier: 2,
          gruesoSupplier: 2,
        },
      ],
      47177,
    );
    expect(ciclo?.volumenImposible).toBe(true);
    expect(ciclo?.volumenM3).toBeNull();
    expect(ciclo?.rendimientoM2M3).toBeNull();
  });
});

/**
 * Apartado "Fuentes" de Salud del dato: cada tabla que alimenta Fabric con su
 * salud derivada de los datos. Una fuente ilegible degrada a "sin-datos"/null,
 * nunca tumba la página (mismo principio que hr_employee sin permisos).
 */
interface FuentesMock {
  lecturas: FilaPrueba[];
  prodCount?: number;
  prodUltima?: Date | null;
  parteUltima?: Date | null;
  inventarioCount?: number;
  inventarioConFabrica?: number;
  inventarioUltima?: Date | null;
  partes?: {
    total: number;
    sin_fecha: number;
    fecha_futura: number;
    telar_invalido: number;
    unidades_cm: number;
    sospechosos: number;
  };
  prismaExtra?: Record<string, unknown>;
}

function repoConFuentes(opts: FuentesMock): PrismaFabricRepository {
  const partes = opts.partes ?? {
    total: 0,
    sin_fecha: 0,
    fecha_futura: 0,
    telar_invalido: 0,
    unidades_cm: 0,
    sospechosos: 0,
  };
  const prodUltima =
    opts.prodUltima === undefined ? new Date(AHORA - 10 * MIN) : opts.prodUltima;
  const prisma = {
    produccionMapeada: {
      findMany: jest.fn().mockResolvedValue(opts.lecturas),
      count: jest.fn().mockResolvedValue(opts.prodCount ?? opts.lecturas.length),
      findFirst: jest
        .fn()
        .mockResolvedValue(prodUltima ? { fechaHora: prodUltima } : null),
    },
    parteTrabajoMapeada: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest
        .fn()
        .mockResolvedValue(opts.parteUltima ? { createDate: opts.parteUltima } : null),
    },
    lotBlockCreation: {
      // Dos count() seguidos: total y luego los que tienen medida de fábrica.
      count: jest
        .fn()
        .mockResolvedValueOnce(opts.inventarioCount ?? 0)
        .mockResolvedValueOnce(opts.inventarioConFabrica ?? 0),
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.inventarioUltima ? { createDate: opts.inventarioUltima } : null,
        ),
    },
    $queryRawUnsafe: jest.fn().mockResolvedValue([partes]),
    ...opts.prismaExtra,
  } as unknown as PrismaService;
  return new PrismaFabricRepository(prisma);
}

/** Dos lecturas de corte, fiables (pasan el validador). */
function lecturasFiables(): FilaPrueba[] {
  return [
    fila({ telar: 1, haceMs: 20 * MIN, incidencia: '1', alturaMm: 1810 }),
    fila({ telar: 1, haceMs: 10 * MIN, incidencia: '1', alturaMm: 1805 }),
  ];
}

describe('PrismaFabricRepository · fuentes de Salud del dato', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(AHORA);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('describe las once tablas reales como fuentes, agrupadas y en orden', async () => {
    const salud = await repoConFuentes({ lecturas: lecturasFiables() }).getSaludDatos();
    expect(salud.fuentes.map((f) => f.tabla)).toEqual([
      'produccion_mapeada',
      'parte_trabajo_mapeada',
      'parte_discopuente_mapeada',
      'reforzadora_mapeada',
      'bloque_maquinas',
      'stock_lot',
      'stock_quant',
      'stock_location',
      'product_template',
      'product_product',
      'lot_block_creation',
    ]);
    // Cada tabla cae en su familia para que la vista las agrupe.
    const grupo = (tabla: string) =>
      salud.fuentes.find((f) => f.tabla === tabla)!.grupo;
    expect(grupo('produccion_mapeada')).toBe('maquinas');
    expect(grupo('stock_lot')).toBe('inventario');
    expect(grupo('product_template')).toBe('catalogo');
    // lot_block_creation pasó a 'inventario' (es la era reciente del inventario).
    expect(grupo('lot_block_creation')).toBe('inventario');
  });

  it('produccion_mapeada: estado ok con lecturas fiables; registros del count y última actualización', async () => {
    const salud = await repoConFuentes({
      lecturas: lecturasFiables(),
      prodCount: 1234,
    }).getSaludDatos();
    const fuente = salud.fuentes.find((f) => f.tabla === 'produccion_mapeada')!;
    expect(fuente.estado).toBe('ok');
    expect(fuente.registros).toBe(1234);
    expect(fuente.ultimaActualizacion).toBe(new Date(AHORA - 10 * MIN).toISOString());
  });

  it('produccion_mapeada: pasa a "mal" cuando la mayoría de lecturas están en cuarentena', async () => {
    // 1 fiable + 3 con la fecha declarada incoherente con la recepción (reloj de
    // consola desfasado > 30 min, el único motivo de cuarentena) = 25 % fiables.
    const salud = await repoConFuentes({
      lecturas: [
        fila({ telar: 1, haceMs: 40 * MIN, incidencia: '1', alturaMm: 1810 }),
        fila({ telar: 1, haceMs: 30 * MIN, incidencia: '1', alturaMm: 1808, desfaseRecibidaMs: -45 * MIN }),
        fila({ telar: 1, haceMs: 20 * MIN, incidencia: '1', alturaMm: 1806, desfaseRecibidaMs: -45 * MIN }),
        fila({ telar: 1, haceMs: 10 * MIN, incidencia: '1', alturaMm: 1804, desfaseRecibidaMs: -45 * MIN }),
      ],
    }).getSaludDatos();
    const fuente = salud.fuentes.find((f) => f.tabla === 'produccion_mapeada')!;
    expect(fuente.estado).toBe('mal');
    expect(fuente.diagnostico).toContain('25 %');
  });

  it('incidencia sin mapear: es un AVISO, no descarta (la lectura sigue contando en KPIs)', async () => {
    const salud = await repoConFuentes({
      lecturas: [
        fila({ telar: 1, haceMs: 30 * MIN, incidencia: '1', alturaMm: 1808 }),
        // Código fuera de la tabla confirmada (1-5): sigue siendo "sin mapear".
        fila({ telar: 1, haceMs: 10 * MIN, incidencia: '9', alturaMm: 1806 }),
      ],
    }).getSaludDatos();
    // No va a cuarentena…
    expect(salud.cuarentena).toHaveLength(0);
    // …sino a avisos, y el telar la sigue contando como fiable.
    expect(
      salud.avisos.some((a) => a.alertas.some((m) => m.includes('Incidencia sin mapear'))),
    ).toBe(true);
    const telar = salud.telares.find((t) => t.telarId === 1)!;
    // No descartada → sigue siendo "fiable" (cuenta en KPIs)…
    expect(telar.pctFiables).toBe(100);
    // …pero el % de lecturas LIMPIAS baja, porque tiene un aviso.
    expect(telar.pctLimpias).toBeLessThan(100);
    expect(telar.conAvisos7d).toBeGreaterThan(0);
  });

  it('consumo: avisa (sin descartar) cuando una lectura entra en la cola alta del telar', async () => {
    const lecturas: FilaPrueba[] = [];
    // Baseline estable del telar (~45 kW) para fijar los percentiles de la cola.
    for (let i = 0; i < 8; i++) {
      lecturas.push(
        fila({ telar: 1, haceMs: (90 - i * 8) * MIN, incidencia: '1', potencia: 45, alturaMm: 1805 }),
      );
    }
    // Pico en la cola (por encima del top 0,13 %): aviso "MUY alto", sin descartar.
    lecturas.push(fila({ telar: 1, haceMs: 8 * MIN, incidencia: '1', potencia: 200, alturaMm: 1805 }));

    const salud = await repoConFuentes({ lecturas }).getSaludDatos();
    expect(salud.cuarentena).toHaveLength(0);
    expect(
      salud.avisos.some((a) => a.alertas.some((m) => m.includes('Consumo MUY alto'))),
    ).toBe(true);
    const telar = salud.telares.find((t) => t.telarId === 1)!;
    expect(telar.conAvisos7d).toBeGreaterThan(0);
    // El pico no descarta (sigue fiable) pero rebaja el % de lecturas limpias.
    expect(telar.pctFiables).toBe(100);
    expect(telar.pctLimpias).toBeLessThan(100);
  });

  it('parte_trabajo_mapeada: registros del total y aviso con partes sospechosos', async () => {
    const salud = await repoConFuentes({
      lecturas: lecturasFiables(),
      partes: {
        total: 100,
        sin_fecha: 0,
        fecha_futura: 5,
        telar_invalido: 0,
        unidades_cm: 0,
        sospechosos: 5,
      },
      parteUltima: new Date(AHORA - 2 * HORA),
    }).getSaludDatos();
    const fuente = salud.fuentes.find((f) => f.tabla === 'parte_trabajo_mapeada')!;
    expect(fuente.registros).toBe(100);
    expect(fuente.estado).toBe('aviso');
    expect(fuente.diagnostico).toContain('5 de 100');
    expect(fuente.ultimaActualizacion).toBe(new Date(AHORA - 2 * HORA).toISOString());
  });

  it('lot_block_creation: registros y cobertura de medida de fábrica en el diagnóstico', async () => {
    const salud = await repoConFuentes({
      lecturas: lecturasFiables(),
      inventarioCount: 50,
      inventarioConFabrica: 30,
      inventarioUltima: new Date(AHORA - 3 * HORA),
    }).getSaludDatos();
    const fuente = salud.fuentes.find((f) => f.tabla === 'lot_block_creation')!;
    expect(fuente.estado).toBe('ok');
    expect(fuente.registros).toBe(50);
    expect(fuente.diagnostico).toContain('30 con medida de fábrica');
  });

  it('produccion_mapeada: avisa por falta de frescura aunque las lecturas del periodo sean fiables', async () => {
    // Lecturas del periodo todas fiables (100 %), pero la última es de hace 8 h.
    const salud = await repoConFuentes({
      lecturas: [
        fila({ telar: 1, haceMs: 8 * HORA + 10 * MIN, incidencia: '1', alturaMm: 1810 }),
        fila({ telar: 1, haceMs: 8 * HORA, incidencia: '1', alturaMm: 1805 }),
      ],
      prodUltima: new Date(AHORA - 8 * HORA),
    }).getSaludDatos();
    const fuente = salud.fuentes.find((f) => f.tabla === 'produccion_mapeada')!;
    expect(fuente.estado).toBe('aviso');
    expect(fuente.diagnostico).toContain('No entran lecturas nuevas');
  });

  it('produccion_mapeada: "sin datos" sin lecturas ni marca previa; "aviso" si hay marca anterior', async () => {
    const sinNada = await repoConFuentes({ lecturas: [], prodUltima: null }).getSaludDatos();
    expect(sinNada.fuentes.find((f) => f.tabla === 'produccion_mapeada')!.estado).toBe(
      'sin-datos',
    );

    const conMarca = await repoConFuentes({
      lecturas: [],
      prodUltima: new Date(AHORA - 30 * 86_400_000),
    }).getSaludDatos();
    const fuente = conMarca.fuentes.find((f) => f.tabla === 'produccion_mapeada')!;
    expect(fuente.estado).toBe('aviso');
    expect(fuente.diagnostico).toContain('No han entrado lecturas');
  });

  it('parte_trabajo_mapeada: "al día" sin problemas y "mal" cuando superan el 10 %', async () => {
    const limpio = await repoConFuentes({
      lecturas: lecturasFiables(),
      partes: { total: 50, sin_fecha: 0, fecha_futura: 0, telar_invalido: 0, unidades_cm: 0, sospechosos: 0 },
    }).getSaludDatos();
    const ok = limpio.fuentes.find((f) => f.tabla === 'parte_trabajo_mapeada')!;
    expect(ok.estado).toBe('ok');
    expect(ok.diagnostico).toContain('Los 50 partes');

    const roto = await repoConFuentes({
      lecturas: lecturasFiables(),
      partes: { total: 100, sin_fecha: 0, fecha_futura: 0, telar_invalido: 20, unidades_cm: 0, sospechosos: 20 },
    }).getSaludDatos();
    expect(roto.fuentes.find((f) => f.tabla === 'parte_trabajo_mapeada')!.estado).toBe('mal');
  });

  it('parte_trabajo_mapeada: muestra "<1 %" con pocos problemas sobre un total grande, nunca "(0 %)"', async () => {
    const salud = await repoConFuentes({
      lecturas: lecturasFiables(),
      partes: { total: 1000, sin_fecha: 0, fecha_futura: 3, telar_invalido: 0, unidades_cm: 0, sospechosos: 3 },
    }).getSaludDatos();
    const fuente = salud.fuentes.find((f) => f.tabla === 'parte_trabajo_mapeada')!;
    expect(fuente.estado).toBe('aviso');
    expect(fuente.diagnostico).toContain('3 de 1000');
    expect(fuente.diagnostico).toContain('<1 %');
    expect(fuente.diagnostico).not.toContain('(0 %)');
  });

  it('lot_block_creation: "sin datos" cuando no hay altas', async () => {
    const salud = await repoConFuentes({
      lecturas: lecturasFiables(),
      inventarioCount: 0,
    }).getSaludDatos();
    const fuente = salud.fuentes.find((f) => f.tabla === 'lot_block_creation')!;
    expect(fuente.estado).toBe('sin-datos');
    expect(fuente.diagnostico).toContain('Sin altas de bloque');
  });

  it('una fuente ilegible degrada a "sin-datos"/null sin tumbar la página', async () => {
    const salud = await repoConFuentes({
      lecturas: lecturasFiables(),
      prismaExtra: {
        lotBlockCreation: {
          count: jest.fn().mockRejectedValue(new Error('permission denied')),
          findFirst: jest.fn().mockRejectedValue(new Error('permission denied')),
        },
      },
    }).getSaludDatos();
    const inventario = salud.fuentes.find((f) => f.tabla === 'lot_block_creation')!;
    expect(inventario.registros).toBeNull();
    expect(inventario.estado).toBe('sin-datos');
    // Las demás fuentes siguen presentes.
    expect(salud.fuentes).toHaveLength(11);
  });
});

/**
 * Rango del gráfico de producción: cada periodo se agrega a una granularidad
 * (día/semana/mes) que decide el backend. Mes y 3 meses → semana; un año e
 * histórico → mes. 'todo' arranca en el primer registro, no en epoch 0.
 */
describe('PrismaFabricRepository · rango y granularidad del gráfico', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(AHORA);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('hoy y 7 días agregan por día', async () => {
    const repo = repoConInventario(runCompletado(), []);
    expect((await repo.getEstadisticas('hoy')).granularidad).toBe('dia');
    expect((await repo.getEstadisticas('7d')).granularidad).toBe('dia');
  });

  it('mes (30d) y 3 meses (90d) agregan por semana', async () => {
    const repo = repoConInventario(runCompletado(), []);
    expect((await repo.getEstadisticas('30d')).granularidad).toBe('semana');
    expect((await repo.getEstadisticas('90d')).granularidad).toBe('semana');
  });

  it('un año e histórico agregan por mes', async () => {
    const repo = repoConInventario(runCompletado(), []);
    expect((await repo.getEstadisticas('1a')).granularidad).toBe('mes');
    expect((await repo.getEstadisticas('todo')).granularidad).toBe('mes');
  });

  it('"hoy" produce un único bucket', async () => {
    const est = await repoConInventario(runCompletado(), []).getEstadisticas('hoy');
    expect(est.produccionPorDia).toHaveLength(1);
  });

  it('las barras de semana arrancan en lunes', async () => {
    const est = await repoConInventario(runCompletado(), []).getEstadisticas('30d');
    for (const periodo of est.produccionPorDia) {
      expect(new Date(periodo.fecha).getDay()).toBe(1); // 1 = lunes
    }
  });

  it('las barras de mes arrancan el día 1', async () => {
    const est = await repoConInventario(runCompletado(), []).getEstadisticas('1a');
    for (const periodo of est.produccionPorDia) {
      expect(new Date(periodo.fecha).getDate()).toBe(1);
    }
  });

  it('"histórico" arranca en el primer registro real, no en 1970', async () => {
    const est = await repoConInventario(runCompletado(), []).getEstadisticas('todo');
    expect(est.produccionPorDia.length).toBeGreaterThan(0);
    expect(new Date(est.produccionPorDia[0].fecha).getFullYear()).toBe(2026);
  });
});
