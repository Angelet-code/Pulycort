import { Injectable } from '@nestjs/common';
import {
  FiltrosProduccionMapeada,
  PaginaProduccionMapeada,
} from '../domain/produccion-mapeada.entity';
import { ProduccionMapeadaRepository } from '../domain/produccion-mapeada.repository';

@Injectable()
export class GetProduccionMapeadaUseCase {
  constructor(private readonly repository: ProduccionMapeadaRepository) {}

  execute(
    filtros: FiltrosProduccionMapeada,
  ): Promise<PaginaProduccionMapeada> {
    return this.repository.findMany(filtros);
  }
}
