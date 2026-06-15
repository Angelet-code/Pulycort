import { Injectable } from '@nestjs/common';
import { InventarioVistaConjunta } from '../domain/resumen-inventario.entity';
import { BloqueInventarioRepository } from '../domain/bloque-inventario.repository';

/**
 * Existencias por material para el mapa de inventario (bloques en m³ reales;
 * tablas/losas pendientes de fuente). Toda la agregación vive en el repositorio.
 */
@Injectable()
export class GetResumenInventarioUseCase {
  constructor(private readonly repository: BloqueInventarioRepository) {}

  execute(): Promise<InventarioVistaConjunta> {
    return this.repository.resumen();
  }
}
