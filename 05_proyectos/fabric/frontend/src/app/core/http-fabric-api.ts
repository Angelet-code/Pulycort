import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { FabricApi } from './fabric-api';
import {
  CoberturaMaquinas,
  DetalleTelar,
  Estadisticas,
  FiltrosInventario,
  FiltrosInventarioTablas,
  FiltrosLecturas,
  FiltrosPartesDiscoPuente,
  FiltrosPartesReforzadora,
  FiltrosPartesTrabajo,
  InventarioVistaConjunta,
  MedidasDudosasPagina,
  PaginaInventario,
  PaginaInventarioTablas,
  PaginaLecturas,
  PaginaPartes,
  PaginaPartesDiscoPuente,
  PaginaPartesReforzadora,
  PaginaPartesTrabajo,
  RangoEstadisticas,
  SaludDatos,
  SnapshotPlanta
} from './models';

/** URL base del backend de máquinas (NestJS + Prisma). */
export const FABRIC_API_BASE = 'http://localhost:3000';

/**
 * Implementación real de la fachada contra el backend NestJS, que computa
 * todas las vistas desde la tabla `produccion_mapeada` de la BD de las
 * máquinas. Lo que la fuente real no permite calcular llega como null/vacío
 * y la UI lo enseña como "—" (principio de VERIFICACION.md: no inventar).
 */
@Injectable({ providedIn: 'root' })
export class HttpFabricApi extends FabricApi {
  private readonly http = inject(HttpClient);

  override getSnapshotPlanta(): Observable<SnapshotPlanta> {
    return this.http.get<SnapshotPlanta>(`${FABRIC_API_BASE}/api/planta/snapshot`);
  }

  override getDetalleTelar(telarId: number): Observable<DetalleTelar> {
    return this.http.get<DetalleTelar>(`${FABRIC_API_BASE}/api/telares/${telarId}`);
  }

  override getEstadisticas(rango: RangoEstadisticas): Observable<Estadisticas> {
    return this.http.get<Estadisticas>(`${FABRIC_API_BASE}/api/estadisticas`, {
      params: new HttpParams().set('rango', rango)
    });
  }

  override getSaludDatos(): Observable<SaludDatos> {
    return this.http.get<SaludDatos>(`${FABRIC_API_BASE}/api/salud-datos`);
  }

  override getPartes(
    rango: RangoEstadisticas,
    telarId: number | null
  ): Observable<PaginaPartes> {
    let params = new HttpParams().set('rango', rango);
    if (telarId !== null) {
      params = params.set('telar', String(telarId));
    }
    return this.http.get<PaginaPartes>(`${FABRIC_API_BASE}/api/partes`, { params });
  }

  override getMedidasDudosas(
    desde: string | null,
    hasta: string | null,
    telarId: number | null
  ): Observable<MedidasDudosasPagina> {
    let params = new HttpParams();
    if (desde) {
      params = params.set('desde', desde);
    }
    if (hasta) {
      params = params.set('hasta', hasta);
    }
    if (telarId !== null) {
      params = params.set('telar', String(telarId));
    }
    return this.http.get<MedidasDudosasPagina>(
      `${FABRIC_API_BASE}/api/salud/medidas-dudosas`,
      { params }
    );
  }

  override getLecturas(filtros: FiltrosLecturas): Observable<PaginaLecturas> {
    let params = new HttpParams()
      .set('limit', String(filtros.limit))
      .set('offset', String(filtros.offset));
    if (filtros.telarN) {
      params = params.set('telar', filtros.telarN);
    }
    if (filtros.material) {
      params = params.set('material', filtros.material);
    }
    if (filtros.desde) {
      params = params.set('desde', filtros.desde);
    }
    if (filtros.hasta) {
      params = params.set('hasta', filtros.hasta);
    }
    if (filtros.lote) {
      params = params.set('lote', filtros.lote);
    }
    return this.http.get<PaginaLecturas>(`${FABRIC_API_BASE}/produccion-mapeada`, {
      params
    });
  }

  override getPartesTrabajo(
    filtros: FiltrosPartesTrabajo
  ): Observable<PaginaPartesTrabajo> {
    let params = new HttpParams()
      .set('limit', String(filtros.limit))
      .set('offset', String(filtros.offset));
    if (filtros.telarN) {
      params = params.set('telar', filtros.telarN);
    }
    if (filtros.material) {
      params = params.set('material', filtros.material);
    }
    if (filtros.operacion) {
      params = params.set('operacion', filtros.operacion);
    }
    if (filtros.desde) {
      params = params.set('desde', filtros.desde);
    }
    if (filtros.hasta) {
      params = params.set('hasta', filtros.hasta);
    }
    if (filtros.lote) {
      params = params.set('lote', filtros.lote);
    }
    return this.http.get<PaginaPartesTrabajo>(`${FABRIC_API_BASE}/partes-trabajo`, {
      params
    });
  }

  override getPartesDiscoPuente(
    filtros: FiltrosPartesDiscoPuente
  ): Observable<PaginaPartesDiscoPuente> {
    let params = new HttpParams()
      .set('limit', String(filtros.limit))
      .set('offset', String(filtros.offset));
    if (filtros.material) {
      params = params.set('material', filtros.material);
    }
    if (filtros.operacion) {
      params = params.set('operacion', filtros.operacion);
    }
    if (filtros.desde) {
      params = params.set('desde', filtros.desde);
    }
    if (filtros.hasta) {
      params = params.set('hasta', filtros.hasta);
    }
    if (filtros.lote) {
      params = params.set('lote', filtros.lote);
    }
    return this.http.get<PaginaPartesDiscoPuente>(
      `${FABRIC_API_BASE}/partes-disco-puente`,
      { params }
    );
  }

  override getPartesReforzadora(
    filtros: FiltrosPartesReforzadora
  ): Observable<PaginaPartesReforzadora> {
    let params = new HttpParams()
      .set('limit', String(filtros.limit))
      .set('offset', String(filtros.offset));
    if (filtros.reforzadora) {
      params = params.set('reforzadora', filtros.reforzadora);
    }
    if (filtros.material) {
      params = params.set('material', filtros.material);
    }
    if (filtros.acabado) {
      params = params.set('acabado', filtros.acabado);
    }
    if (filtros.desde) {
      params = params.set('desde', filtros.desde);
    }
    if (filtros.hasta) {
      params = params.set('hasta', filtros.hasta);
    }
    if (filtros.lote) {
      params = params.set('lote', filtros.lote);
    }
    return this.http.get<PaginaPartesReforzadora>(
      `${FABRIC_API_BASE}/partes-reforzadora`,
      { params }
    );
  }

  override getInventario(filtros: FiltrosInventario): Observable<PaginaInventario> {
    let params = new HttpParams()
      .set('limit', String(filtros.limit))
      .set('offset', String(filtros.offset));
    if (filtros.material) {
      params = params.set('material', filtros.material);
    }
    if (filtros.q) {
      params = params.set('q', filtros.q);
    }
    if (filtros.desde) {
      params = params.set('desde', filtros.desde);
    }
    if (filtros.hasta) {
      params = params.set('hasta', filtros.hasta);
    }
    return this.http.get<PaginaInventario>(`${FABRIC_API_BASE}/bloques`, { params });
  }

  override getInventarioTablas(
    filtros: FiltrosInventarioTablas
  ): Observable<PaginaInventarioTablas> {
    let params = new HttpParams()
      .set('limit', String(filtros.limit))
      .set('offset', String(filtros.offset));
    if (filtros.material) {
      params = params.set('material', filtros.material);
    }
    if (filtros.q) {
      params = params.set('q', filtros.q);
    }
    if (filtros.desde) {
      params = params.set('desde', filtros.desde);
    }
    if (filtros.hasta) {
      params = params.set('hasta', filtros.hasta);
    }
    return this.http.get<PaginaInventarioTablas>(`${FABRIC_API_BASE}/tablas`, { params });
  }

  override getResumenInventario(): Observable<InventarioVistaConjunta> {
    return this.http.get<InventarioVistaConjunta>(`${FABRIC_API_BASE}/bloques/resumen`);
  }

  override getCoberturaMaquinas(): Observable<CoberturaMaquinas> {
    return this.http.get<CoberturaMaquinas>(`${FABRIC_API_BASE}/cobertura-maquinas`);
  }
}
