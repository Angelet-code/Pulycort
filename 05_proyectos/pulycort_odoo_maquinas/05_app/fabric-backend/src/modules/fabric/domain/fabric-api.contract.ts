import { Observable } from 'rxjs';
import {
  DetalleTelar,
  Estadisticas,
  PaginaPartes,
  RangoEstadisticas,
  SaludDatos,
  SnapshotPlanta,
} from './fabric.types';

export abstract class FabricApi {
  abstract getSnapshotPlanta(): Observable<SnapshotPlanta>;
  abstract getDetalleTelar(telarId: number): Observable<DetalleTelar>;
  abstract getEstadisticas(rango: RangoEstadisticas): Observable<Estadisticas>;
  abstract getSaludDatos(): Observable<SaludDatos>;
  abstract getPartes(
    rango: RangoEstadisticas,
    telarId: number | null,
  ): Observable<PaginaPartes>;
}
