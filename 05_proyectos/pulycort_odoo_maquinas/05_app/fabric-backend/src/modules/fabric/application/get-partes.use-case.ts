import { Injectable } from '@nestjs/common';
import { FabricRepository } from '../domain/fabric.repository';
import { PaginaPartes, RangoEstadisticas } from '../domain/fabric.types';

@Injectable()
export class GetPartesUseCase {
  constructor(private readonly repository: FabricRepository) {}

  execute(
    rango: RangoEstadisticas,
    telarId: number | null,
  ): Promise<PaginaPartes> {
    return this.repository.getPartes(rango, telarId);
  }
}
