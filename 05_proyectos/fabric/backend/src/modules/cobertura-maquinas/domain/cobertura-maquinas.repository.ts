import { CoberturaMaquinas } from './cobertura-maquinas.entity';

export abstract class CoberturaMaquinasRepository {
  /** Catálogo de planta con el volumen real de cada fuente conectada. */
  abstract coberturaMaquinas(): Promise<CoberturaMaquinas>;
}
