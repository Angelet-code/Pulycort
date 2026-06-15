import { Controller, Get } from '@nestjs/common';
import { GetCoberturaMaquinasUseCase } from '../application/get-cobertura-maquinas.use-case';
import { CoberturaMaquinas } from '../domain/cobertura-maquinas.entity';

@Controller('cobertura-maquinas')
export class CoberturaMaquinasController {
  constructor(
    private readonly getCoberturaUseCase: GetCoberturaMaquinasUseCase,
  ) {}

  /** Catálogo de planta con el volumen real de cada máquina conectada. */
  @Get()
  cobertura(): Promise<CoberturaMaquinas> {
    return this.getCoberturaUseCase.execute();
  }
}
