import { ResumenInventario } from '../../../shared/domain/inventario-resumen';
import {
  FiltrosTablaInventario,
  PaginaTablaInventario,
} from './tabla-inventario.entity';

export abstract class TablaInventarioRepository {
  abstract findMany(
    filtros: FiltrosTablaInventario,
  ): Promise<PaginaTablaInventario>;

  /** Existencias de tablas por material (m²), para el mapa de inventario. */
  abstract resumenTablas(): Promise<ResumenInventario>;

  /** Existencias de losas por material (m²), para el mapa de inventario. */
  abstract resumenLosas(): Promise<ResumenInventario>;
}
