import {
  FiltrosBloqueInventario,
  PaginaBloqueInventario,
} from './bloque-inventario.entity';
import { InventarioVistaConjunta } from './resumen-inventario.entity';

export abstract class BloqueInventarioRepository {
  abstract findMany(
    filtros: FiltrosBloqueInventario,
  ): Promise<PaginaBloqueInventario>;

  /** Existencias por material (bloques en m³; tablas/losas pendientes). */
  abstract resumen(): Promise<InventarioVistaConjunta>;
}
