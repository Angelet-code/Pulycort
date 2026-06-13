import { Injectable } from '@nestjs/common';
import {
  FiltrosBloqueInventario,
  PaginaBloqueInventario,
} from '../domain/bloque-inventario.entity';
import { BloqueInventarioRepository } from '../domain/bloque-inventario.repository';

@Injectable()
export class GetBloquesInventarioUseCase {
  constructor(private readonly repository: BloqueInventarioRepository) {}

  execute(filtros: FiltrosBloqueInventario): Promise<PaginaBloqueInventario> {
    return this.repository.findMany(filtros);
  }
}
