import {
  DetalleTelar,
  Estadisticas,
  MedidasDudosasPagina,
  PaginaPartes,
  RangoEstadisticas,
  SaludDatos,
  SnapshotPlanta,
} from './fabric.types';

export abstract class FabricRepository {
  abstract getSnapshotPlanta(): Promise<SnapshotPlanta>;
  abstract getDetalleTelar(telarId: number): Promise<DetalleTelar | null>;
  abstract getEstadisticas(rango: RangoEstadisticas): Promise<Estadisticas>;
  abstract getSaludDatos(): Promise<SaludDatos>;
  abstract getPartes(
    rango: RangoEstadisticas,
    telarId: number | null,
  ): Promise<PaginaPartes>;
  abstract getMedidasDudosas(
    desde: Date | null,
    hasta: Date | null,
    telarId: number | null,
  ): Promise<MedidasDudosasPagina>;
}
