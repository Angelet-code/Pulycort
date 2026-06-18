import { Injectable } from '@nestjs/common';
import { FabricRepository } from '../domain/fabric.repository';
import { MedidasDudosasPagina } from '../domain/fabric.types';

@Injectable()
export class GetMedidasDudosasUseCase {
  constructor(private readonly repository: FabricRepository) {}

  execute(
    desde: Date | null,
    hasta: Date | null,
    telarId: number | null,
  ): Promise<MedidasDudosasPagina> {
    return this.repository.getMedidasDudosas(desde, hasta, telarId);
  }
}
