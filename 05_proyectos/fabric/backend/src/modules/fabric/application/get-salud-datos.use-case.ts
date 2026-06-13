import { Injectable } from '@nestjs/common';
import { FabricRepository } from '../domain/fabric.repository';
import { SaludDatos } from '../domain/fabric.types';

@Injectable()
export class GetSaludDatosUseCase {
  constructor(private readonly repository: FabricRepository) {}

  execute(): Promise<SaludDatos> {
    return this.repository.getSaludDatos();
  }
}
