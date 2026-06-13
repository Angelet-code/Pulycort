/**
 * Formateo es-ES sin depender del registro de locales de Angular:
 * números 1.234,56, fechas cortas y duraciones legibles. Cada helper
 * acepta null/undefined y devuelve "—" para no propagar NaN a la UI.
 */

const SIN_DATO = '—';

export function formatNumero(valor: number | null | undefined, decimales = 0): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) {
    return SIN_DATO;
  }
  const fijo = valor.toFixed(decimales);
  const [entera, decimal] = fijo.split('.');
  const signo = entera.startsWith('-') ? '-' : '';
  const digitos = signo ? entera.slice(1) : entera;
  const agrupada = digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${signo}${agrupada}${decimal ? `,${decimal}` : ''}`;
}

export function formatValorUnidad(
  valor: number | null | undefined,
  unidad: string,
  decimales = 0
): string {
  const numero = formatNumero(valor, decimales);
  if (numero === SIN_DATO || !unidad) {
    return numero;
  }
  return `${numero} ${unidad}`;
}

export function formatPorcentaje(valor: number | null | undefined, decimales = 0): string {
  const numero = formatNumero(valor, decimales);
  return numero === SIN_DATO ? numero : `${numero} %`;
}

export function formatMedidasCm(
  largo: number | null | undefined,
  alto: number | null | undefined,
  grueso: number | null | undefined
): string {
  if (largo == null || alto == null || grueso == null) {
    return SIN_DATO;
  }
  return `${formatNumero(largo)} × ${formatNumero(alto)} × ${formatNumero(grueso)} cm`;
}

export function formatHora(iso: string | null | undefined): string {
  if (!iso) {
    return SIN_DATO;
  }
  return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso)
  );
}

export function formatFechaHora(iso: string | null | undefined): string {
  if (!iso) {
    return SIN_DATO;
  }
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(iso));
}

/** Con año: imprescindible para enseñar fechas corruptas (2014, 2099...). */
export function formatFechaHoraAnio(iso: string | null | undefined): string {
  if (!iso) {
    return SIN_DATO;
  }
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(iso));
}

export function formatFechaCorta(iso: string | null | undefined): string {
  if (!iso) {
    return SIN_DATO;
  }
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' }).format(
    new Date(iso)
  );
}

export function formatDiaSemanaCorto(iso: string | null | undefined): string {
  if (!iso) {
    return SIN_DATO;
  }
  return new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(new Date(iso));
}

/** "hace 4 min", "hace 2 h", "hace 3 días". */
export function formatRelativo(iso: string | null | undefined, ahora = Date.now()): string {
  if (!iso) {
    return SIN_DATO;
  }
  const ms = ahora - new Date(iso).getTime();
  if (ms < 0) {
    return 'en el futuro';
  }
  const minutos = Math.floor(ms / 60_000);
  if (minutos < 1) {
    return 'ahora mismo';
  }
  if (minutos < 60) {
    return `hace ${minutos} min`;
  }
  const horas = Math.floor(minutos / 60);
  if (horas < 24) {
    return `hace ${horas} h`;
  }
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}

/** Duración en minutos → "1 h 25 min" / "45 min" / "2 días 3 h". */
export function formatDuracionMin(minutos: number | null | undefined): string {
  if (minutos === null || minutos === undefined || Number.isNaN(minutos) || minutos < 0) {
    return SIN_DATO;
  }
  const total = Math.round(minutos);
  if (total < 60) {
    return `${total} min`;
  }
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  if (horas < 24) {
    return resto > 0 ? `${horas} h ${resto} min` : `${horas} h`;
  }
  const dias = Math.floor(horas / 24);
  const horasResto = horas % 24;
  return horasResto > 0 ? `${dias} d ${horasResto} h` : `${dias} d`;
}

export function formatDuracionHoras(horas: number | null | undefined): string {
  if (horas === null || horas === undefined || Number.isNaN(horas)) {
    return SIN_DATO;
  }
  return formatDuracionMin(horas * 60);
}

/**
 * ETA legible: "hoy 17:40", "mañana 09:15" o "vie 08:30".
 */
export function formatEta(iso: string | null | undefined, ahora = Date.now()): string {
  if (!iso) {
    return SIN_DATO;
  }
  const fecha = new Date(iso);
  const hora = formatHora(iso);
  const hoy = new Date(ahora);
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  const diffDias = Math.floor((fecha.getTime() - inicioHoy) / 86_400_000);
  if (diffDias === 0) {
    return `hoy ${hora}`;
  }
  if (diffDias === 1) {
    return `mañana ${hora}`;
  }
  const dia = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric' }).format(fecha);
  return `${dia}, ${hora}`;
}
