import { PrismaParteReforzadoraRepository } from './prisma-parte-reforzadora.repository';
import { PrismaService } from '../../../shared/infrastructure/database/prisma/prisma.service';
import { BloqueRegistroService } from '../../../shared/infrastructure/bloque-registro/bloque-registro.service';

/**
 * Fija la lógica de `toDomain` del módulo reforzadora, que es donde vive la regla
 * "no inventar": el m² derivado (n_tablas × largo × alto / 10⁴) solo se calcula si
 * los tres datos están y son > 0 (las filas de cabecera/paro con largo/alto=0 dan
 * m² null, no 0), la fecha futura marca `sospechosa`, y `bloqueConocido` sale del
 * padrón `bloque_maquinas` (n_bloque > 0 y presente).
 */

const FILTROS = {
  nReforzadora: null,
  material: null,
  acabado: null,
  desde: null,
  hasta: null,
  limit: 50,
  offset: 0,
};

/** Mock de PrismaService: ramifica findMany por `distinct` (catálogo) vs query principal. */
function crearRepo(filas: any[], conocidos: Set<number>): PrismaParteReforzadoraRepository {
  const prisma = {
    $transaction: (arr: Promise<unknown>[]) => Promise.all(arr),
    reforzadoraMapeada: {
      count: jest.fn(() => Promise.resolve(filas.length)),
      findMany: jest.fn((args: { distinct?: string[] }) => {
        const campo = args.distinct?.[0];
        if (campo === 'nReforzadora') {
          return Promise.resolve([{ nReforzadora: '1' }]);
        }
        if (campo === 'material') {
          return Promise.resolve([{ material: 71 }, { material: 116 }]);
        }
        if (campo === 'acabado') {
          return Promise.resolve([{ acabado: '1' }, { acabado: '2' }]);
        }
        return Promise.resolve(filas);
      }),
    },
  } as unknown as PrismaService;

  const bloqueRegistro = {
    conocidos: jest.fn(() => Promise.resolve(conocidos)),
  } as unknown as BloqueRegistroService;

  return new PrismaParteReforzadoraRepository(prisma, bloqueRegistro);
}

function fila(over: Record<string, unknown>): any {
  return {
    id: 1,
    nReforzadora: '1',
    operario1: null,
    operario2: null,
    nBloque: 47173,
    material: 71,
    nTablas: 62,
    largo: 190,
    alto: 160,
    grueso: 2,
    consumo: 49,
    acabado: '1',
    eventos: '99',
    fecha: null,
    createDate: null,
    writeDate: null,
    hora: null,
    fechaHora: new Date('2026-06-12T13:48:00Z'),
    ...over,
  };
}

describe('PrismaParteReforzadoraRepository.toDomain', () => {
  it('deriva m² = n_tablas × largo × alto / 10⁴ (cm → m²)', async () => {
    const repo = crearRepo([fila({ id: 1, nTablas: 62, largo: 190, alto: 160 })], new Set([47173]));
    const { items } = await repo.findMany(FILTROS);
    // 62 × 190 × 160 / 10.000 = 188,48
    expect(items[0].metrosCuadrados).toBe(188.48);
  });

  it('devuelve m² null cuando largo/alto=0 (fila de cabecera/paro), no 0', async () => {
    const repo = crearRepo([fila({ id: 15891, nTablas: 66, largo: 0, alto: 0 })], new Set());
    const { items } = await repo.findMany(FILTROS);
    expect(items[0].metrosCuadrados).toBeNull();
  });

  it('devuelve m² null cuando falta alguna medida o n_tablas', async () => {
    const repo = crearRepo(
      [
        fila({ id: 2, alto: null }),
        fila({ id: 3, nTablas: null }),
      ],
      new Set([47173]),
    );
    const { items } = await repo.findMany(FILTROS);
    expect(items.find((i) => i.id === 2)!.metrosCuadrados).toBeNull();
    expect(items.find((i) => i.id === 3)!.metrosCuadrados).toBeNull();
  });

  it('marca sospechosa una fila con fecha_hora en el futuro', async () => {
    const repo = crearRepo([fila({ id: 4, fechaHora: new Date('2099-01-01T00:00:00Z') })], new Set([47173]));
    const { items } = await repo.findMany(FILTROS);
    expect(items[0].sospechosa).toBe(true);
    expect(items[0].motivosSospecha).toContain('fecha futura imposible');
  });

  it('expone pmLote = n_bloque y bloqueConocido según el padrón', async () => {
    const repo = crearRepo(
      [
        fila({ id: 5, nBloque: 47173 }), // en el padrón
        fila({ id: 6, nBloque: 99999 }), // fuera del padrón
        fila({ id: 7, nBloque: 0 }), // sin nº real
      ],
      new Set([47173]),
    );
    const { items } = await repo.findMany(FILTROS);
    const byId = (n: number) => items.find((i) => i.id === n)!;
    expect(byId(5).pmLote).toBe(47173);
    expect(byId(5).bloqueConocido).toBe(true);
    expect(byId(6).bloqueConocido).toBe(false);
    expect(byId(7).bloqueConocido).toBe(false);
  });

  it('devuelve los catálogos de reforzadoras, materiales y acabados', async () => {
    const repo = crearRepo([fila({})], new Set([47173]));
    const pagina = await repo.findMany(FILTROS);
    expect(pagina.reforzadoras).toEqual(['1']);
    expect(pagina.materiales).toEqual([71, 116]);
    expect(pagina.acabados).toEqual(['1', '2']);
  });
});
