import { Injectable } from '@nestjs/common';
import { FabricRepository } from '../domain/fabric.repository';
import { Estadisticas, RangoEstadisticas } from '../domain/fabric.types';

@Injectable()
export class GetEstadisticasUseCase {
  constructor(private readonly repository: FabricRepository) {}

  execute(rango: RangoEstadisticas): Promise<Estadisticas> {
    return this.repository.getEstadisticas(rango);
  }
}
