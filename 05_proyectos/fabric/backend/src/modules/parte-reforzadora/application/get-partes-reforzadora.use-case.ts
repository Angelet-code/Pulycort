import { Injectable } from '@nestjs/common';
import {
  FiltrosParteReforzadora,
  PaginaParteReforzadora,
} from '../domain/parte-reforzadora.entity';
import { ParteReforzadoraRepository } from '../domain/parte-reforzadora.repository';

@Injectable()
export class GetPartesReforzadoraUseCase {
  constructor(private readonly repository: ParteReforzadoraRepository) {}

  execute(filtros: FiltrosParteReforzadora): Promise<PaginaParteReforzadora> {
    return this.repository.findMany(filtros);
  }
}
