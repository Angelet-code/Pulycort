import { TipoEvento, TipoIncidencia, Turno } from './models';

export const ETIQUETA_INCIDENCIA: Record<TipoIncidencia, string> = {
  marcha: 'Marcha telar',
  paro: 'Paro telar',
  'paro-rotura-material': 'Paro por rotura de material',
  'modo-manual': 'Modo manual',
  'modo-automatico': 'Modo automático',
  'rotura-fleje': 'Rotura de fleje',
  'cambio-bloque': 'Cambio de lote',
  desconocida: 'Desconocida',
  'sin-datos': 'Sin datos'
};

/**
 * Códigos crudos de la columna `incidencia` de `produccion_mapeada` (lo que
 * emite la consola del telar). Mapeo CONFIRMADO por Pulycort (2026-06-16):
 * `1` = marcha, `2` = paro, `3` = paro por rotura de material, `4` = modo manual,
 * `5` = modo automático. Solo el `0` (telar 4, que no envía código) sigue sin
 * mapear: se infiere por potencia. Mapea a `TipoIncidencia` para reutilizar
 * ETIQUETA_INCIDENCIA.
 */
export const INCIDENCIA_POR_CODIGO: Record<string, TipoIncidencia> = {
  '1': 'marcha',
  '2': 'paro',
  '3': 'paro-rotura-material',
  '4': 'modo-manual',
  '5': 'modo-automatico'
};

export const ETIQUETA_EVENTO: Record<TipoEvento, string> = {
  colocacion: 'Colocación de lote',
  aserrado: 'Aserrado en curso',
  salida: 'Salida del telar',
  paquetes: 'Paquetes hechos',
  'fin-jornada': 'Fin de jornada'
};

export const ETIQUETA_TURNO: Record<Turno, string> = {
  manana: 'Turno mañana · 06:00–14:00',
  tarde: 'Turno tarde · 14:00–22:00',
  noche: 'Turno noche · 22:00–06:00'
};

/**
 * Operaciones del parte de trabajo de telares (tabla real
 * `parte_trabajo_mapeada`). Mapeo confirmado por Pulycort (2026-06-16):
 * la op. 0 no tiene etiqueta fija — su significado lo da la columna `accion`
 * de cada fila (códigos por decodificar). Los códigos 5/10/11 que aparecen en
 * los datos siguen sin confirmar (00_gestion/TAREAS.md).
 */
export const ETIQUETA_OPERACION: Record<string, string> = {
  '1': 'Colocando bloque',
  '2': 'Aserrando bloque',
  '3': 'Salida del telar',
  '4': 'Haciendo paquetes'
};

export interface EtiquetaAccion {
  texto: string;
  /** Color CSS (token del tema) para resaltar el motivo en la tabla. */
  color?: string;
}

/**
 * Sub-motivos de la columna `accion` de las paradas (operación 0) del parte de
 * trabajo de telares. Solo la op. 0 usa `accion`; las ops 1-4 llevan accion=0.
 * Significados confirmados por Pulycort (2026-06-16), con color por categoría:
 * azul = cambio, rojo = rotura, verde = mantenimiento, ámbar = fin de jornada.
 * Los códigos 0 y 10 (observados en datos reales) siguen sin significado y se
 * muestran en crudo (00_gestion/TAREAS.md).
 */
export const ETIQUETA_ACCION: Record<string, EtiquetaAccion> = {
  '5': { texto: 'Cambio de sierras', color: 'var(--blue)' },
  '6': { texto: 'Cambio de espesor', color: 'var(--blue)' },
  '7': { texto: 'Rotura de material', color: 'var(--red)' },
  '8': { texto: 'Rotura máquina', color: 'var(--red)' },
  '9': { texto: 'Mantenimiento', color: 'var(--green)' },
  '11': { texto: 'Fin de jornada', color: 'var(--amber)' }
};
