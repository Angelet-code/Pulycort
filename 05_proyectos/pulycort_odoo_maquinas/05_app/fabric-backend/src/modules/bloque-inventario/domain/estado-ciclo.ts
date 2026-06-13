/**
 * Estado de ciclo de vida de un bloque, derivado de los partes de trabajo
 * (`parte_trabajo_mapeada`) por su columna `operacion`. NO se estima por
 * tiempo: cada estado es el reflejo de una operación que el operario registra.
 * Códigos de operación confirmados por el cliente (00_gestion/TAREAS.md):
 *
 *   1 = colocación del bloque  → moviendo-a-telar
 *   2 = aserrado del bloque    → aserrando
 *   3 = salida del telar       → sacando-del-telar  (bloque ya aserrado)
 *   4 = hacer paquetes         → almacenando / almacenado
 *
 * La op. 0 (paradas: fin de jornada, cambios, roturas, mantenimiento…) y los
 * códigos aún sin confirmar (5, 10, 11) no son fases: se ignoran.
 *
 * `sin-lecturas` no es una fase del parte: es el estado de un bloque que
 * empezó a aserrarse pero del que no hay lecturas de telar recientes (ni un
 * telar que lo confirme como ocupante actual). No lo damos por aserrando (no
 * hay telar) ni por almacenado (no hay salida/paquetes): queda en este limbo
 * hasta que llegue más información.
 */
export type EstadoCicloBloque =
  | 'inventariado'
  | 'moviendo-a-telar'
  | 'aserrando'
  | 'sacando-del-telar'
  | 'almacenando'
  | 'almacenado'
  | 'sin-lecturas';

/** Operaciones que sí marcan una fase del ciclo (no 0 ni desconocidas). */
const OPS_FASE = new Set(['1', '2', '3', '4']);

/**
 * Ventana de un único corte. El nº de bloque se REUTILIZA entre meses (el
 * 46449 del telar 4 tiene partes en dic-2025 y may-2026), así que acotamos los
 * partes a los ~30 días siguientes al primer parte de este bloque tras su alta:
 * holgado para un ciclo completo (colocación→paquetes dura horas/días) pero muy
 * por debajo del reuso a meses vista. No es un umbral de estimación: solo
 * desambigua de qué corte físico hablamos.
 */
const VENTANA_CORTE_MS = 30 * 24 * 60 * 60 * 1000;

/** Margen hacia atrás por desfase entre el alta en almacén y el primer parte. */
const SKEW_ALTA_MS = 2 * 24 * 60 * 60 * 1000;

/** Regla del cliente: tras el parte de paquetes, 30 min en "almacenando". */
const ALMACENANDO_MS = 30 * 60 * 1000;

/**
 * Ventana para fiarse de que un bloque sigue en el telar: si su última lectura
 * es más antigua que esto, el telar lleva en silencio sobre él y no afirmamos
 * "aserrando" (regla del cliente: ~3 días). Pasa a "sin lecturas" hasta que
 * haya más noticias del bloque.
 */
const RECIENTE_MS = 3 * 24 * 60 * 60 * 1000;

/** Parte mínimo necesario para derivar el estado. */
export type ParteFase = {
  operacion: string | null;
  fechaHora: Date | null;
};

/**
 * Estado del bloque a partir de sus partes de trabajo. `createDate` es el alta
 * en almacén (un bloque no puede cortarse antes de recibirse). `ahora` en ms.
 */
export function derivarEstadoCiclo(
  createDate: Date | null,
  partes: ParteFase[],
  ahora: number,
): EstadoCicloBloque {
  const altaMs = createDate?.getTime() ?? null;

  // Partes de fase de este bloque, desde (cerca de) el alta, en orden temporal.
  const candidatos = partes
    .filter(
      (p): p is { operacion: string; fechaHora: Date } =>
        p.operacion !== null &&
        p.fechaHora !== null &&
        OPS_FASE.has(p.operacion),
    )
    // Descartamos fechas futuras (anomalía conocida en la tabla, hasta
    // dic-2026; 00_gestion/TAREAS.md): un bloque no puede tener actividad por
    // venir, y dejarlas pasar rompería la regla de 30 min de "almacenando".
    .filter((p) => p.fechaHora.getTime() <= ahora)
    .filter((p) => altaMs === null || p.fechaHora.getTime() >= altaMs - SKEW_ALTA_MS)
    .sort((a, b) => a.fechaHora.getTime() - b.fechaHora.getTime());

  if (candidatos.length === 0) {
    return 'inventariado';
  }

  // Ancla = primer parte tras el alta (este corte); acotamos su ventana.
  const ancla = candidatos[0].fechaHora.getTime();
  const delCorte = candidatos.filter(
    (p) => p.fechaHora.getTime() <= ancla + VENTANA_CORTE_MS,
  );

  // Parte más avanzado: mayor fecha y, a igualdad, mayor nº de operación.
  const ultimo = delCorte.reduce((mejor, p) => {
    const tp = p.fechaHora.getTime();
    const tm = mejor.fechaHora.getTime();
    if (tp > tm) return p;
    if (tp === tm && Number(p.operacion) > Number(mejor.operacion)) return p;
    return mejor;
  });

  switch (ultimo.operacion) {
    case '1':
      return 'moviendo-a-telar';
    case '2':
      return 'aserrando';
    case '3':
      return 'sacando-del-telar';
    case '4':
      return ahora - ultimo.fechaHora.getTime() < ALMACENANDO_MS
        ? 'almacenando'
        : 'almacenado';
    default:
      return 'inventariado';
  }
}

/** Estados "en telar": un bloque solo puede estar en uno si ocupa un telar. */
const EN_TELAR: ReadonlySet<EstadoCicloBloque> = new Set([
  'moviendo-a-telar',
  'aserrando',
  'sacando-del-telar',
]);

/**
 * Presencia del bloque en su telar, derivada de `produccion_mapeada`. SOLO HAY
 * 4 TELARES, uno por bloque a la vez, así que como máximo 4 bloques pueden
 * estar "en telar" simultáneamente:
 *  - `reciente`: es el ocupante actual de un telar y su última lectura es
 *     reciente (<= RECIENTE_MS) → está cortándose ahora.
 *  - `silencio`: es el ocupante actual pero su última lectura es antigua
 *     (> RECIENTE_MS) → el telar lleva días en silencio sobre él (limbo).
 *  - `desalojado`: tuvo lecturas en un telar pero el telar siguió leyendo
 *     después → salió necesariamente del telar.
 *  - `sin-rastro`: no aparece en `produccion_mapeada` (no es ocupante de nada).
 */
export type OcupacionTelar = 'reciente' | 'silencio' | 'desalojado' | 'sin-rastro';

/**
 * Estado final combinando los partes de trabajo con la ocupación del telar,
 * imponiendo la restricción física de los 4 telares: solo un bloque que sea el
 * OCUPANTE ACTUAL y RECIENTE de un telar puede estar "en telar".
 *  - Op. 4 (paquetes) manda en la fase final: el telar no la altera.
 *  - Op. 3 (salida del telar) es evidencia POSITIVA de que el bloque salió: si
 *    es ocupante reciente, "sacando-del-telar" (saliendo ahora); si no,
 *    "almacenado" (ya salió, como un desalojo confirmado por el operario).
 *  - `reciente` (op. 1/2 o sin parte): está en el telar ahora → fase del parte;
 *    sin parte de fase → aserrando.
 *  - `desalojado`: el telar pasó a otro bloque → salió → almacenado.
 *  - `silencio`/`sin-rastro` con op. 1/2: empezó a colocarse/aserrarse pero no
 *    hay telar reciente que lo confirme y tampoco salida → "sin-lecturas"
 *    (limbo) hasta que haya más noticias. Sin partes de fase → inventariado.
 */
export function resolverEstadoCiclo(
  estadoParte: EstadoCicloBloque,
  ocupacion: OcupacionTelar,
): EstadoCicloBloque {
  if (estadoParte === 'almacenando' || estadoParte === 'almacenado') {
    return estadoParte;
  }
  // Op. 3 (salida): el operario confirmó que el bloque sale del telar.
  if (estadoParte === 'sacando-del-telar') {
    return ocupacion === 'reciente' ? 'sacando-del-telar' : 'almacenado';
  }
  if (ocupacion === 'reciente') {
    return estadoParte === 'inventariado' ? 'aserrando' : estadoParte;
  }
  if (ocupacion === 'desalojado') {
    return 'almacenado';
  }
  if (ocupacion === 'silencio') {
    // Ocupante actual con lecturas, ahora callado >3 días: tuvo telar pero no
    // sabemos si terminó. Limbo (sea op. 1/2 o sin parte de fase).
    return 'sin-lecturas';
  }
  // sin-rastro: sin lecturas de telar de este bloque.
  if (EN_TELAR.has(estadoParte)) {
    return 'sin-lecturas'; // colocación/aserrado por parte pero sin telar → limbo
  }
  return estadoParte; // 'inventariado' sin lecturas → nunca entró al telar
}

/** Lectura de telar mínima para clasificar la ocupación. */
export type LecturaOcupacion = {
  telarN: string | null;
  fechaHora: Date | null;
};

/**
 * Ocupación del bloque en su telar, a partir de SUS lecturas de
 * `produccion_mapeada` (ya filtradas por su nº de bloque), su alta (`createDate`)
 * y la última actividad de cada telar (`ultimaPorTelar`: telarN → ms).
 *
 * Acota las lecturas a la ventana del corte (como `derivarEstadoCiclo`) para no
 * confundir un reuso del nº de bloque a meses vista. Si dentro de la ventana el
 * bloque tuvo lecturas en un telar, y ese telar siguió leyendo DESPUÉS de la
 * última lectura del bloque → fue `desalojado` (entró otro bloque). Si el
 * bloque sigue siendo el actual del telar: `reciente` si su última lectura es
 * reciente (< RECIENTE_MS), o `silencio` si el telar lleva días callado sobre
 * él. Sin lecturas en la ventana → `sin-rastro`.
 */
export function clasificarOcupacion(
  lecturasDelBloque: LecturaOcupacion[],
  createDate: Date | null,
  ultimaPorTelar: Map<string, number>,
  ahora: number,
): OcupacionTelar {
  if (createDate === null) {
    return 'sin-rastro';
  }
  const min = createDate.getTime() - SKEW_ALTA_MS;
  const max = createDate.getTime() + VENTANA_CORTE_MS;

  // Telar con la lectura más reciente del bloque dentro de su ventana.
  let telar: string | null = null;
  let ultimaDelBloque = -Infinity;
  for (const l of lecturasDelBloque) {
    if (l.telarN === null || l.fechaHora === null) {
      continue;
    }
    const t = l.fechaHora.getTime();
    if (t < min || t > max || t > ahora) {
      continue;
    }
    if (t > ultimaDelBloque || (t === ultimaDelBloque && telar !== null && l.telarN < telar)) {
      ultimaDelBloque = t;
      telar = l.telarN;
    }
  }
  if (telar === null) {
    return 'sin-rastro';
  }

  const ultimaTelar = ultimaPorTelar.get(telar);
  // El telar leyó algo después de la última lectura del bloque ⇒ entró otro
  // bloque ⇒ este salió del telar.
  if (ultimaTelar !== undefined && ultimaTelar > ultimaDelBloque) {
    return 'desalojado';
  }
  // El bloque sigue siendo el actual del telar: ¿lectura reciente o silencio?
  return ahora - ultimaDelBloque <= RECIENTE_MS ? 'reciente' : 'silencio';
}

/**
 * El nº de bloque del inventario (`name`, texto en `lot_block_creation`) como
 * entero, para cruzar con `parte_trabajo_mapeada.n_bloque`. Devuelve null si
 * está vacío o no es un número entero (no cruzará: queda "inventariado"). Ojo:
 * `Number('')` y `Number('  ')` dan 0, así que se rechaza el vacío antes.
 */
export function numeroDeBloque(name: string | null): number | null {
  const limpio = name?.trim();
  if (!limpio) {
    return null;
  }
  const numero = Number(limpio);
  return Number.isInteger(numero) ? numero : null;
}
