import {
  LecturaOcupacion,
  ParteFase,
  clasificarOcupacion,
  derivarEstadoCiclo,
  numeroDeBloque,
  resolverEstadoCiclo,
} from './estado-ciclo';

/**
 * El estado de ciclo se deriva de los partes de trabajo (op. 1-4), no de
 * umbrales de tiempo. La única regla temporal es la del cliente: 30 min en
 * "almacenando" tras el parte de paquetes. La ventana de corte (~30 días)
 * desambigua la reutilización del nº de bloque entre meses.
 */

const AHORA = Date.UTC(2026, 5, 13, 12, 0, 0); // 2026-06-13 12:00 UTC
const MIN = 60_000;
const HORA = 3_600_000;
const DIA = 86_400_000;
const ALTA = new Date(AHORA - 5 * DIA); // bloque recibido hace 5 días

/** Parte con tiempo relativo a AHORA (negativo = pasado). */
function p(operacion: string, msDesdeAhora: number): ParteFase {
  return { operacion, fechaHora: new Date(AHORA + msDesdeAhora) };
}

describe('derivarEstadoCiclo', () => {
  it('sin partes de fase → inventariado', () => {
    expect(derivarEstadoCiclo(ALTA, [], AHORA)).toBe('inventariado');
  });

  it('solo op. 0 (parada) no es fase → inventariado', () => {
    expect(derivarEstadoCiclo(ALTA, [p('0', -DIA)], AHORA)).toBe('inventariado');
  });

  it('op. 1 (colocación) → moviendo-a-telar', () => {
    expect(derivarEstadoCiclo(ALTA, [p('1', -2 * DIA)], AHORA)).toBe(
      'moviendo-a-telar',
    );
  });

  it('op. 2 (aserrado) → aserrando', () => {
    const partes = [p('1', -2 * DIA), p('2', -DIA)];
    expect(derivarEstadoCiclo(ALTA, partes, AHORA)).toBe('aserrando');
  });

  it('op. 3 (salida) → sacando-del-telar', () => {
    const partes = [p('1', -2 * DIA), p('2', -DIA), p('3', -2 * HORA)];
    expect(derivarEstadoCiclo(ALTA, partes, AHORA)).toBe('sacando-del-telar');
  });

  it('op. 4 hace menos de 30 min → almacenando', () => {
    expect(derivarEstadoCiclo(ALTA, [p('4', -10 * MIN)], AHORA)).toBe(
      'almacenando',
    );
  });

  it('op. 4 hace más de 30 min → almacenado', () => {
    expect(derivarEstadoCiclo(ALTA, [p('4', -40 * MIN)], AHORA)).toBe(
      'almacenado',
    );
  });

  it('op. 4 justo a los 30 min → almacenado (límite exclusivo)', () => {
    expect(derivarEstadoCiclo(ALTA, [p('4', -30 * MIN)], AHORA)).toBe(
      'almacenado',
    );
  });

  it('toma la operación más avanzada del corte', () => {
    const partes = [p('2', -3 * DIA), p('1', -3 * DIA - HORA), p('3', -DIA)];
    expect(derivarEstadoCiclo(ALTA, partes, AHORA)).toBe('sacando-del-telar');
  });

  it('ignora un corte posterior que reutiliza el mismo nº de bloque', () => {
    // Este corte: op. 2 hace 4 días. Reuso 5 meses después: op. 4.
    const partes = [p('2', -4 * DIA), p('4', 150 * DIA)];
    expect(derivarEstadoCiclo(ALTA, partes, AHORA)).toBe('aserrando');
  });

  it('ignora partes anteriores al alta (más allá del margen de desfase)', () => {
    // op. 4 una semana antes del alta → no es de este bloque.
    expect(derivarEstadoCiclo(ALTA, [p('4', -12 * DIA)], AHORA)).toBe(
      'inventariado',
    );
  });

  it('admite un parte ligeramente anterior al alta (dentro del desfase de 2 días)', () => {
    // alta hace 5 días; parte op. 1 hace 6 días (1 día antes del alta).
    expect(derivarEstadoCiclo(ALTA, [p('1', -6 * DIA)], AHORA)).toBe(
      'moviendo-a-telar',
    );
  });

  it('sin fecha de alta, admite un parte muy antiguo', () => {
    expect(derivarEstadoCiclo(null, [p('2', -200 * DIA)], AHORA)).toBe(
      'aserrando',
    );
  });

  it('descarta partes con fecha futura (op. 4 futuro como único parte) → inventariado', () => {
    // Anomalía conocida: fechas hasta dic-2026. No debe quedar "almacenando".
    expect(derivarEstadoCiclo(ALTA, [p('4', 30 * DIA)], AHORA)).toBe(
      'inventariado',
    );
  });

  it('una fecha futura no enmascara el último parte válido', () => {
    const partes = [p('2', -DIA), p('4', 200 * DIA)];
    expect(derivarEstadoCiclo(ALTA, partes, AHORA)).toBe('aserrando');
  });
});

describe('resolverEstadoCiclo (partes + ocupación de telar)', () => {
  it('desalojado del telar ⇒ almacenado, aunque el parte diga aserrando', () => {
    expect(resolverEstadoCiclo('aserrando', 'desalojado')).toBe('almacenado');
  });

  it('desalojado ⇒ almacenado aunque el parte diga moviendo-a-telar', () => {
    expect(resolverEstadoCiclo('moviendo-a-telar', 'desalojado')).toBe(
      'almacenado',
    );
  });

  it('desalojado sin ningún parte (inventariado) ⇒ almacenado', () => {
    expect(resolverEstadoCiclo('inventariado', 'desalojado')).toBe('almacenado');
  });

  it('reciente sin partes (inventariado) ⇒ aserrando (el telar rellena el hueco)', () => {
    expect(resolverEstadoCiclo('inventariado', 'reciente')).toBe('aserrando');
  });

  it('reciente respeta la fase del parte (moviendo / aserrando / sacando)', () => {
    expect(resolverEstadoCiclo('moviendo-a-telar', 'reciente')).toBe(
      'moviendo-a-telar',
    );
    expect(resolverEstadoCiclo('aserrando', 'reciente')).toBe('aserrando');
    expect(resolverEstadoCiclo('sacando-del-telar', 'reciente')).toBe(
      'sacando-del-telar',
    );
  });

  it('silencio (ocupante sin lecturas recientes) ⇒ sin-lecturas, sea cual sea el parte', () => {
    expect(resolverEstadoCiclo('aserrando', 'silencio')).toBe('sin-lecturas');
    expect(resolverEstadoCiclo('moviendo-a-telar', 'silencio')).toBe(
      'sin-lecturas',
    );
    expect(resolverEstadoCiclo('inventariado', 'silencio')).toBe('sin-lecturas');
  });

  it('sin-rastro + op. 1/2 (en telar) ⇒ sin-lecturas (ningún telar lo confirma)', () => {
    expect(resolverEstadoCiclo('aserrando', 'sin-rastro')).toBe('sin-lecturas');
    expect(resolverEstadoCiclo('moviendo-a-telar', 'sin-rastro')).toBe(
      'sin-lecturas',
    );
  });

  it('sin-rastro + sin partes ⇒ inventariado (nunca entró al telar)', () => {
    expect(resolverEstadoCiclo('inventariado', 'sin-rastro')).toBe(
      'inventariado',
    );
  });

  it('op. 3 (salida) reciente ⇒ sacando-del-telar (saliendo ahora)', () => {
    expect(resolverEstadoCiclo('sacando-del-telar', 'reciente')).toBe(
      'sacando-del-telar',
    );
  });

  it('op. 3 (salida) sin telar reciente ⇒ almacenado (ya salió, evidencia del operario)', () => {
    // El parte de salida es evidencia positiva: el bloque salió del telar.
    expect(resolverEstadoCiclo('sacando-del-telar', 'silencio')).toBe(
      'almacenado',
    );
    expect(resolverEstadoCiclo('sacando-del-telar', 'desalojado')).toBe(
      'almacenado',
    );
    expect(resolverEstadoCiclo('sacando-del-telar', 'sin-rastro')).toBe(
      'almacenado',
    );
  });

  it('op. 4 manda: almacenando/almacenado no los altera el telar', () => {
    expect(resolverEstadoCiclo('almacenando', 'reciente')).toBe('almacenando');
    expect(resolverEstadoCiclo('almacenando', 'silencio')).toBe('almacenando');
    expect(resolverEstadoCiclo('almacenando', 'desalojado')).toBe('almacenando');
    expect(resolverEstadoCiclo('almacenando', 'sin-rastro')).toBe('almacenando');
    expect(resolverEstadoCiclo('almacenado', 'reciente')).toBe('almacenado');
    expect(resolverEstadoCiclo('almacenado', 'silencio')).toBe('almacenado');
    expect(resolverEstadoCiclo('almacenado', 'sin-rastro')).toBe('almacenado');
    expect(resolverEstadoCiclo('almacenado', 'desalojado')).toBe('almacenado');
  });
});

describe('clasificarOcupacion (ventana de corte + última del telar)', () => {
  const ALTA_OCUP = new Date(AHORA - 5 * DIA); // alta hace 5 días
  // Ventana del corte: [alta - 2 días, alta + 30 días]. Reciente: < 3 días.

  function lec(telarN: string, msDesdeAhora: number): LecturaOcupacion {
    return { telarN, fechaHora: new Date(AHORA + msDesdeAhora) };
  }
  function ultimas(pares: [string, number][]): Map<string, number> {
    return new Map(pares.map(([t, ms]) => [t, AHORA + ms]));
  }

  it('sin fecha de alta ⇒ sin-rastro (no se puede acotar)', () => {
    expect(
      clasificarOcupacion([lec('1', -1 * DIA)], null, ultimas([['1', -1 * DIA]]), AHORA),
    ).toBe('sin-rastro');
  });

  it('sin lecturas ⇒ sin-rastro', () => {
    expect(clasificarOcupacion([], ALTA_OCUP, new Map(), AHORA)).toBe('sin-rastro');
  });

  it('lecturas solo fuera de la ventana (reuso antiguo) ⇒ sin-rastro', () => {
    expect(
      clasificarOcupacion([lec('1', -100 * DIA)], ALTA_OCUP, ultimas([['1', -1 * DIA]]), AHORA),
    ).toBe('sin-rastro');
  });

  it('ocupante actual con lectura reciente (< 3 días) ⇒ reciente', () => {
    expect(
      clasificarOcupacion([lec('1', -1 * DIA)], ALTA_OCUP, ultimas([['1', -1 * DIA]]), AHORA),
    ).toBe('reciente');
  });

  it('frontera: lectura justo a 3 días ⇒ reciente (límite inclusivo)', () => {
    const alta = new Date(AHORA - 10 * DIA); // ventana holgada para que -3d entre
    expect(
      clasificarOcupacion([lec('1', -3 * DIA)], alta, ultimas([['1', -3 * DIA]]), AHORA),
    ).toBe('reciente');
  });

  it('ocupante actual con lectura antigua (> 3 días) ⇒ silencio', () => {
    expect(
      clasificarOcupacion([lec('1', -4 * DIA)], ALTA_OCUP, ultimas([['1', -4 * DIA]]), AHORA),
    ).toBe('silencio');
  });

  it('el telar leyó después de la última del bloque ⇒ desalojado', () => {
    expect(
      clasificarOcupacion([lec('1', -4 * DIA)], ALTA_OCUP, ultimas([['1', -1 * DIA]]), AHORA),
    ).toBe('desalojado');
  });

  it('ignora un reuso del nº de bloque fuera de ventana, usa la lectura del corte', () => {
    // -100 días (reuso anterior, fuera de ventana) + -1 día (este corte, reciente).
    expect(
      clasificarOcupacion(
        [lec('1', -100 * DIA), lec('1', -1 * DIA)],
        ALTA_OCUP,
        ultimas([['1', -1 * DIA]]),
        AHORA,
      ),
    ).toBe('reciente');
  });

  it('desempata por telar (menor) ante misma fecha en dos telares', () => {
    // Misma fecha reciente en telar 1 y 2; elige el 1. ultima[1] = esa fecha ⇒ reciente.
    expect(
      clasificarOcupacion(
        [lec('2', -1 * DIA), lec('1', -1 * DIA)],
        ALTA_OCUP,
        ultimas([['1', -1 * DIA], ['2', -2 * HORA]]),
        AHORA,
      ),
    ).toBe('reciente');
  });
});

describe('numeroDeBloque', () => {
  it('número normal', () => {
    expect(numeroDeBloque('46449')).toBe(46449);
  });

  it('con espacios', () => {
    expect(numeroDeBloque('  46449 ')).toBe(46449);
  });

  it('null → null', () => {
    expect(numeroDeBloque(null)).toBeNull();
  });

  it('cadena vacía → null (no 0)', () => {
    expect(numeroDeBloque('')).toBeNull();
  });

  it('solo espacios → null (no 0)', () => {
    expect(numeroDeBloque('   ')).toBeNull();
  });

  it('no numérico → null', () => {
    expect(numeroDeBloque('BL-12')).toBeNull();
  });

  it('decimal → null', () => {
    expect(numeroDeBloque('46449.5')).toBeNull();
  });
});
