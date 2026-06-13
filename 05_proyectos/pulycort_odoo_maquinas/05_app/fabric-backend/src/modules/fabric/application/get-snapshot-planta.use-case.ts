import { Injectable } from '@nestjs/common';
import { FabricRepository } from '../domain/fabric.repository';
import { SnapshotPlanta } from '../domain/fabric.types';

@Injectable()
export class GetSnapshotPlantaUseCase {
  constructor(private readonly repository: FabricRepository) {}

  execute(): Promise<SnapshotPlanta> {
    return this.repository.getSnapshotPlanta();
  }
}
