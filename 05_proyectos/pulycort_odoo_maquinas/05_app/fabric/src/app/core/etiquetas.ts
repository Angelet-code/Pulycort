import { TipoEvento, TipoIncidencia, Turno } from './models';

export const ETIQUETA_INCIDENCIA: Record<TipoIncidencia, string> = {
  marcha: 'Marcha telar',
  paro: 'Paro telar',
  'rotura-fleje': 'Rotura de fleje',
  'cambio-bloque': 'Cambio de bloque',
  desconocida: 'Desconocida'
};

export const ETIQUETA_EVENTO: Record<TipoEvento, string> = {
  colocacion: 'Colocación de bloque',
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
