import { Injectable } from '@nestjs/common';
import { InventarioVistaConjunta } from '../../../shared/domain/inventario-resumen';
import { BloqueInventarioRepository } from '../domain/bloque-inventario.repository';
import { TablaInventarioRepository } from '../../tabla-inventario/domain/tabla-inventario.repository';

/**
 * Existencias por material para el mapa de inventario, uniendo las TRES formas:
 * BLOQUES (m³) del inventario de bloques y TABLAS y LOSAS (m²) del inventario de
 * tablas/losas. El repo de bloques stubea `tablas` y `losas` como `pendiente` y
 * aquí se reemplazan por las formas reales. Cada repo agrega lo suyo (no se duplica
 * la lógica del treemap).
 */
@Injectable()
export class GetResumenInventarioUseCase {
  constructor(
    private readonly bloqueRepo: BloqueInventarioRepository,
    private readonly tablaRepo: TablaInventarioRepository,
  ) {}

  async execute(): Promise<InventarioVistaConjunta> {
    const [conjunta, tablas, losas] = await Promise.all([
      this.bloqueRepo.resumen(),
      this.tablaRepo.resumenTablas(),
      this.tablaRepo.resumenLosas(),
    ]);
    const porForma: Record<string, (typeof conjunta.formas)[number]> = {
      tablas,
      losas,
    };
    return {
      ...conjunta,
      formas: conjunta.formas.map((f) => porForma[f.forma] ?? f),
    };
  }
}
