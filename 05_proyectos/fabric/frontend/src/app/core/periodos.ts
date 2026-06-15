/**
 * Ventana temporal y granularidad de agregación de cada rango de estadísticas.
 * Réplica de la lógica del backend (`prisma-fabric.repository.ts`) para que la
 * demo agrupe el gráfico igual que la fuente real: día (hoy/7d), semana natural
 * lunes→domingo (30d/90d) o mes (1a/todo).
 */
import { Granularidad, RangoEstadisticas } from './models';

export function inicioDia(ms: number): number {
  const fecha = new Date(ms);
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime();
}

/** Lunes 00:00 (calendario local) de la semana que contiene `ms`. */
export function inicioSemana(ms: number): number {
  const fecha = new Date(ms);
  const dia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const desdeLunes = (dia.getDay() + 6) % 7; // 0 = lunes
  dia.setDate(dia.getDate() - desdeLunes);
  return dia.getTime();
}

/** Día 1 a las 00:00 (calendario local) del mes que contiene `ms`. */
export function inicioMes(ms: number): number {
  const fecha = new Date(ms);
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1).getTime();
}

export function inicioPeriodo(ms: number, granularidad: Granularidad): number {
  if (granularidad === 'mes') {
    return inicioMes(ms);
  }
  return granularidad === 'semana' ? inicioSemana(ms) : inicioDia(ms);
}

/** Inicio del periodo siguiente (avanza el cursor de los buckets). */
export function siguientePeriodo(ms: number, granularidad: Granularidad): number {
  const fecha = new Date(ms);
  if (granularidad === 'mes') {
    return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 1).getTime();
  }
  const dias = granularidad === 'semana' ? 7 : 1;
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + dias).getTime();
}

/**
 * Mes y 3 meses se agrupan por semana; un año e histórico, por mes. `todo`
 * arranca en epoch 0 y se acota luego al primer dato real.
 */
export function ventanaEstadisticas(
  rango: RangoEstadisticas,
  ahora: number
): { desde: number; granularidad: Granularidad } {
  const fecha = new Date(ahora);
  const haceDias = (dias: number): number =>
    new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() - dias).getTime();
  if (rango === 'hoy') {
    return { desde: inicioDia(ahora), granularidad: 'dia' };
  }
  if (rango === '7d') {
    return { desde: haceDias(6), granularidad: 'dia' };
  }
  if (rango === '30d') {
    return { desde: haceDias(29), granularidad: 'semana' };
  }
  if (rango === '90d') {
    return { desde: haceDias(89), granularidad: 'semana' };
  }
  if (rango === '1a') {
    return {
      desde: new Date(fecha.getFullYear() - 1, fecha.getMonth(), fecha.getDate()).getTime(),
      granularidad: 'mes'
    };
  }
  return { desde: 0, granularidad: 'mes' }; // 'todo'
}
