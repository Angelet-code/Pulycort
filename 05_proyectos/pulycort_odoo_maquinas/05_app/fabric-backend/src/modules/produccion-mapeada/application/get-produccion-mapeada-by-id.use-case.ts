import { Injectable } from '@nestjs/common';
import { ProduccionMapeada } from '../domain/produccion-mapeada.entity';
import { ProduccionMapeadaRepository } from '../domain/produccion-mapeada.repository';

@Injectable()
export class GetProduccionMapeadaByIdUseCase {
  constructor(private readonly repository: ProduccionMapeadaRepository) {}

  execute(id: number): Promise<ProduccionMapeada | null> {
    return this.repository.findById(id);
  }
}
