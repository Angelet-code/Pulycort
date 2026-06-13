import { Observable } from 'rxjs';
import {
  DetalleTelar,
  Estadisticas,
  FiltrosInventario,
  FiltrosLecturas,
  FiltrosPartesTrabajo,
  PaginaInventario,
  PaginaLecturas,
  PaginaPartes,
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
  /** Inventario de bloques de almacén (la tabla `lot_block_creation` real). */
  abstract getInventario(filtros: FiltrosInventario): Observable<PaginaInventario>;
}
