import { Observable } from 'rxjs';
import {
  CoberturaMaquinas,
  DetalleTelar,
  Estadisticas,
  FiltrosInventario,
  FiltrosLecturas,
  FiltrosPartesDiscoPuente,
  FiltrosPartesReforzadora,
  FiltrosPartesTrabajo,
  InventarioVistaConjunta,
  PaginaInventario,
  PaginaLecturas,
  PaginaPartes,
  PaginaPartesDiscoPuente,
  PaginaPartesReforzadora,
  PaginaPartesTrabajo,
  RangoEstadisticas,
  SaludDatos,
  SnapshotPlanta
} from './models';

/**
 * Fachada de la API de Fabric con dos implementaciones intercambiables:
 * `MockFabricApi` (simulación en memoria) y `HttpFabricApi` (backend real
 * NestJS + Prisma sobre la BD de las máquinas). El conmutador de
 * `app.config.ts` delega en una u otra según la fuente elegida en la barra
 * superior; ningún componente depende de la implementación.
 */
export abstract class FabricApi {
  abstract getSnapshotPlanta(): Observable<SnapshotPlanta>;
  abstract getDetalleTelar(telarId: number): Observable<DetalleTelar>;
  abstract getEstadisticas(rango: RangoEstadisticas): Observable<Estadisticas>;
  abstract getSaludDatos(): Observable<SaludDatos>;
  abstract getPartes(
    rango: RangoEstadisticas,
    telarId: number | null
  ): Observable<PaginaPartes>;
  /** Registro en crudo de lecturas (la tabla `produccion_mapeada` real). */
  abstract getLecturas(filtros: FiltrosLecturas): Observable<PaginaLecturas>;
  /** Partes de operario en crudo (la tabla `parte_trabajo_mapeada` real). */
  abstract getPartesTrabajo(
    filtros: FiltrosPartesTrabajo
  ): Observable<PaginaPartesTrabajo>;
  /** Partes del disco puente en crudo (la tabla `parte_discopuente_mapeada` real). */
  abstract getPartesDiscoPuente(
    filtros: FiltrosPartesDiscoPuente
  ): Observable<PaginaPartesDiscoPuente>;
  /** Partes de la reforzadora de tablas en crudo (la tabla `reforzadora_mapeada` real). */
  abstract getPartesReforzadora(
    filtros: FiltrosPartesReforzadora
  ): Observable<PaginaPartesReforzadora>;
  /** Bloques en existencias del stock real (`stock_lot` on-hand vía `stock_quant`). */
  abstract getInventario(filtros: FiltrosInventario): Observable<PaginaInventario>;
  /** Existencias por material para el mapa de inventario (bloques en m³; tablas/losas pendientes). */
  abstract getResumenInventario(): Observable<InventarioVistaConjunta>;
  /** Mapa de cobertura: catálogo de planta + volumen real de cada máquina conectada. */
  abstract getCoberturaMaquinas(): Observable<CoberturaMaquinas>;
}
