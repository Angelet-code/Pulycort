import { Injectable } from '@nestjs/common';
import {
  FiltrosParteTrabajo,
  PaginaParteTrabajo,
} from '../domain/parte-trabajo.entity';
import { ParteTrabajoRepository } from '../domain/parte-trabajo.repository';

@Injectable()
export class GetPartesTrabajoUseCase {
  constructor(private readonly repository: ParteTrabajoRepository) {}

  execute(filtros: FiltrosParteTrabajo): Promise<PaginaParteTrabajo> {
    return this.repository.findMany(filtros);
  }
}
