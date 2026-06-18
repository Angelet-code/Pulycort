import { Injectable } from '@nestjs/common';
import {
  FiltrosTablaInventario,
  PaginaTablaInventario,
} from '../domain/tabla-inventario.entity';
import { TablaInventarioRepository } from '../domain/tabla-inventario.repository';

@Injectable()
export class GetTablasInventarioUseCase {
  constructor(private readonly repository: TablaInventarioRepository) {}

  execute(filtros: FiltrosTablaInventario): Promise<PaginaTablaInventario> {
    return this.repository.findMany(filtros);
  }
}
