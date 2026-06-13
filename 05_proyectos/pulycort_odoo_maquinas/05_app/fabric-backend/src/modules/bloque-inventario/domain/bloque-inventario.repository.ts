import {
  FiltrosBloqueInventario,
  PaginaBloqueInventario,
} from './bloque-inventario.entity';

export abstract class BloqueInventarioRepository {
  abstract findMany(
    filtros: FiltrosBloqueInventario,
  ): Promise<PaginaBloqueInventario>;
}
