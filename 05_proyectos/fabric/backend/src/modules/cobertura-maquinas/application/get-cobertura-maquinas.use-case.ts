import { Injectable } from '@nestjs/common';
import { CoberturaMaquinas } from '../domain/cobertura-maquinas.entity';
import { CoberturaMaquinasRepository } from '../domain/cobertura-maquinas.repository';

/**
 * Mapa de cobertura de las máquinas de planta. Toda la agregación (catálogo +
 * volumen real por fuente) vive en el repositorio.
 */
@Injectable()
export class GetCoberturaMaquinasUseCase {
  constructor(private readonly repository: CoberturaMaquinasRepository) {}

  execute(): Promise<CoberturaMaquinas> {
    return this.repository.coberturaMaquinas();
  }
}
