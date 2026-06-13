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
}): FilaPrueba {
  const fechaHora = new Date(AHORA - opciones.haceMs);
  const potencia = opciones.potencia ?? 45;
  return {
    id: siguienteId++,
    telarN: String(opciones.telar),
    fechaHora,
    // create_date llega ~3 min después de la fecha declarada (lote del ETL).
    createDate: opciones.sinCreateDate ? null : new Date(fechaHora.getTime() + 3 * MIN),
    incidencia: opciones.incidencia,
    potencia,
    consumo: potencia * 2,
    golpesXMinuto: 0,
    velocidad: 20,
    alturaActual: opciones.alturaMm ?? 1800,
    largo: 280,
    alto: 160,
    grueso: 190,
    material: 1,
    nBloque: 47177,
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

  it('marca "paro" con código 2 reciente', async () => {
    const filas = [fila({ telar: 1, haceMs: 10 * MIN, incidencia: '2', potencia: 13 })];
    expect(await estadoTelar(filas, 1)).toBe('paro');
  });

  it('cae a "sin-datos" cuando la última lectura supera el umbral, aunque dijera marcha', async () => {
    // Caso real del telar 1: último registro horas atrás con la fábrica parada.
    const filas = [
      fila({ telar: 1, haceMs: 12 * HORA + 10 * MIN, incidencia: '1', alturaMm: 1810 }),
      fila({ telar: 1, haceMs: 12 * HORA, incidencia: '1', alturaMm: 1805 }),
    ];
    expect(await estadoTelar(filas, 1)).toBe('sin-datos');
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
