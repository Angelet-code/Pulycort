import { Prisma } from '@prisma/client';

/**
 * Corrección de fechas con el AÑO mal estampado (+1) en lotes de backfill.
 *
 * Contexto: un volcado puntual del 31-dic-2025 cargó partes de la segunda mitad
 * de 2025 con el año subido en 1 (jul–dic 2025 → jul–dic 2026), dejando ~434
 * partes del disco puente (y 26 de parte_trabajo) con una `fecha_hora`
 * "imposible" en el futuro. No es el reloj de la máquina: el feed en vivo es
 * correcto y `create_date` (la inserción real en Odoo) nunca está en el futuro.
 *
 * Regla de detección — robusta al avance del tiempo: una lectura no puede
 * registrarse antes de ocurrir, así que si `fecha_hora` va por delante de
 * `create_date` más de un día, el año está mal y se le resta 1 año. Cuando el
 * tiempo avance y lleguen partes reales de jul–dic 2026, su `create_date` estará
 * también en 2026 (≈ misma marca), así que NUNCA se tocan: el lote viejo (creado
 * el 31-dic-2025) se corrige a 2025 y los nuevos quedan en 2026, sin solaparse.
 * Mismo umbral de 1 día que usa la salud del dato en `prisma-fabric.repository`.
 *
 * Solo corrige +1 año (la corrupción observada, un rollover de Nochevieja). Si
 * tras restar el año la fecha sigue en el futuro, es otra corrupción distinta:
 * el consumidor la marca como sospechosa ("fecha futura imposible"), no se
 * silencia.
 *
 * IMPORTANTE: `aplicarRemapeoFecha` (en memoria) y `sqlFechaHoraEfectiva` /
 * `sqlEsFechaRemapeada` (en BD, para ordenar y filtrar la paginación) aplican la
 * MISMA regla. Si cambias una, cambia las otras.
 */

const UN_DIA_MS = 24 * 60 * 60 * 1000;

export interface ResultadoRemapeo {
  /** `fecha_hora` efectiva: corregida (−1 año) si el año venía mal; si no, la original. */
  fechaHora: Date | null;
  /** Valor original tal cual en la tabla (informativo, para la señal de alerta). */
  fechaHoraOriginal: Date | null;
  /** true si se corrigió el año (lote de backfill con fecha futura imposible). */
  remapeada: boolean;
}

/** Aplica la corrección de año a una fecha en memoria (ver doc del módulo). */
export function aplicarRemapeoFecha(
  fechaHora: Date | null,
  createDate: Date | null,
): ResultadoRemapeo {
  if (
    fechaHora !== null &&
    createDate !== null &&
    fechaHora.getTime() > createDate.getTime() + UN_DIA_MS
  ) {
    const corregida = new Date(fechaHora);
    corregida.setFullYear(corregida.getFullYear() - 1);
    return { fechaHora: corregida, fechaHoraOriginal: fechaHora, remapeada: true };
  }
  return { fechaHora, fechaHoraOriginal: fechaHora, remapeada: false };
}

/** Predicado SQL: ¿la fila tiene el año mal (fecha_hora muy por delante de create_date)? */
export function sqlEsFechaRemapeada(
  fechaHora: Prisma.Sql = Prisma.sql`fecha_hora`,
  createDate: Prisma.Sql = Prisma.sql`create_date`,
): Prisma.Sql {
  return Prisma.sql`${fechaHora} IS NOT NULL AND ${createDate} IS NOT NULL AND ${fechaHora} > ${createDate} + interval '1 day'`;
}

/** Expresión SQL de la `fecha_hora` efectiva: corregida (−1 año) cuando procede. */
export function sqlFechaHoraEfectiva(
  fechaHora: Prisma.Sql = Prisma.sql`fecha_hora`,
  createDate: Prisma.Sql = Prisma.sql`create_date`,
): Prisma.Sql {
  return Prisma.sql`CASE WHEN ${sqlEsFechaRemapeada(fechaHora, createDate)} THEN ${fechaHora} - interval '1 year' ELSE ${fechaHora} END`;
}
