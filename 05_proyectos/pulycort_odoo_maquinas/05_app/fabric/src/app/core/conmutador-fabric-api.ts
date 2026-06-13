import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { FabricApi } from './fabric-api';
import { FuenteDatosService } from './fuente-datos.service';
import { HttpFabricApi } from './http-fabric-api';
import { MockFabricApi } from './mock/mock-fabric-api';
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
 * Conmutador de fuente de datos: delega cada llamada en la implementación
 * real (HTTP) o en la demo (mock) según el switch de la barra superior.
 * Se decide EN CADA LLAMADA, así el polling de las vistas recoge el cambio
 * sin recargar nada.
 */
@Injectable({ providedIn: 'root' })
export class ConmutadorFabricApi extends FabricApi {
  private readonly fuenteDatos = inject(FuenteDatosService);
  private readonly mock = inject(MockFabricApi);
  private readonly http = inject(HttpFabricApi);

  private get activa(): FabricApi {
    return this.fuenteDatos.esReal() ? this.http : this.mock;
  }

  override getSnapshotPlanta(): Observable<SnapshotPlanta> {
    return this.activa.getSnapshotPlanta();
  }

  override getDetalleTelar(telarId: number): Observable<DetalleTelar> {
    return this.activa.getDetalleTelar(telarId);
  }

  override getEstadisticas(rango: RangoEstadisticas): Observable<Estadisticas> {
    return this.activa.getEstadisticas(rango);
  }

  override getSaludDatos(): Observable<SaludDatos> {
    return this.activa.getSaludDatos();
  }

  override getPartes(
    rango: RangoEstadisticas,
    telarId: number | null
  ): Observable<PaginaPartes> {
    return this.activa.getPartes(rango, telarId);
  }

  override getLecturas(filtros: FiltrosLecturas): Observable<PaginaLecturas> {
    return this.activa.getLecturas(filtros);
  }

  override getPartesTrabajo(
    filtros: FiltrosPartesTrabajo
  ): Observable<PaginaPartesTrabajo> {
    return this.activa.getPartesTrabajo(filtros);
  }

  override getInventario(filtros: FiltrosInventario): Observable<PaginaInventario> {
    return this.activa.getInventario(filtros);
  }
}
