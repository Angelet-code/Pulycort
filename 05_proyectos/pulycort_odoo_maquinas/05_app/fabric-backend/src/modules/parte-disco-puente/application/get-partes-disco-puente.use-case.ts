import { Injectable } from '@nestjs/common';
import {
  FiltrosParteDiscoPuente,
  PaginaParteDiscoPuente,
} from '../domain/parte-disco-puente.entity';
import { ParteDiscoPuenteRepository } from '../domain/parte-disco-puente.repository';

@Injectable()
export class GetPartesDiscoPuenteUseCase {
  constructor(private readonly repository: ParteDiscoPuenteRepository) {}

  execute(filtros: FiltrosParteDiscoPuente): Promise<PaginaParteDiscoPuente> {
    return this.repository.findMany(filtros);
  }
}
