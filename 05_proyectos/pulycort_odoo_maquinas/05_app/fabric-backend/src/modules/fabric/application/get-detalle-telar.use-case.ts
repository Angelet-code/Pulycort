import { Injectable } from '@nestjs/common';
import { FabricRepository } from '../domain/fabric.repository';
import { DetalleTelar } from '../domain/fabric.types';

@Injectable()
export class GetDetalleTelarUseCase {
  constructor(private readonly repository: FabricRepository) {}

  execute(telarId: number): Promise<DetalleTelar | null> {
    return this.repository.getDetalleTelar(telarId);
  }
}
