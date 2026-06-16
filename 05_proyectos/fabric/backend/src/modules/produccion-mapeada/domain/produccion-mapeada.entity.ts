import { BandaConsumo, UmbralConsumo } from '../../../shared/domain/consumo-atipico';

/**
 * Lectura de producción de un telar tal y como llega en la tabla
 * `produccion_mapeada` (datos reales de TotWare mapeados a Odoo).
 *
 * Los campos `material`, `operario1/2`, `createUid` y `writeUid` son códigos
 * (claves foráneas a catálogos de Odoo); se exponen en crudo, sin resolver.
 */
export type ProduccionMapeada = {
  id: number;
  telarN: string | null;
  operario1: number | null;
  operario2: number | null;
  /** Columna fuente heredada `n_bloque`; se conserva por compatibilidad. */
  nBloque: number | null;
  /** Matricula operativa confirmada para partes/maquinas. */
  pmLote: number | null;
  material: number | null;
  largo: number | null;
  alto: number | null;
  grueso: number | null;
  potencia: number | null;
  velocidad: number | null;
  incidencia: string | null;
  consumo: number | null;
  createUid: number | null;
  writeUid: number | null;
  fecha: Date | null;
  createDate: Date | null;
  writeDate: Date | null;
  hora: number | null;
  golpesXMinuto: number | null;
  alturaActual: number | null;
  dato1: number | null;
  dato2: number | null;
  dato3: number | null;
  dato4: number | null;
  dato5: number | null;
  dato6: number | null;
  fechaHora: Date | null;
  /**
   * Banda de consumo atípico (percentil de la cola del propio telar) o null si
   * el consumo es normal o la lectura está en paro. Calculado en el backend.
   */
  consumoBanda: BandaConsumo | null;
  /** Intensidad 0..1 dentro de la cola, para el degradado amarillo→rojo de la UI. */
  consumoIntensidad: number;
};

/** Filtros y paginación para el listado de lecturas. */
export type FiltrosProduccionMapeada = {
  /** Nº de lote (n_bloque) exacto; null = todos. */
  lote: number | null;
  telarN: string | null;
  /** Código de material (FK product_template); null = todos. */
  material: number | null;
  /** Ventana de fecha_hora; `hasta` es exclusivo (inicio del día siguiente). */
  desde: Date | null;
  hasta: Date | null;
  limit: number;
  offset: number;
};

/** Página de lecturas con el total disponible para paginar en cliente. */
export type PaginaProduccionMapeada = {
  total: number;
  limit: number;
  offset: number;
  items: ProduccionMapeada[];
  /** Materiales distintos de toda la tabla, para el filtro de la UI. */
  materiales: number[];
  /**
   * Cortes de consumo (kW) por telar usados para colorear la potencia atípica
   * (top 16/2,3/0,13 % de la cola, últimos 30 días), para los tooltips de la UI.
   */
  umbralesConsumo: Record<string, UmbralConsumo>;
};
