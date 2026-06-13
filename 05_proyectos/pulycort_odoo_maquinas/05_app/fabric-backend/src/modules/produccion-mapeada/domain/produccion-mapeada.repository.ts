import {
  FiltrosProduccionMapeada,
  PaginaProduccionMapeada,
  ProduccionMapeada,
} from './produccion-mapeada.entity';

export abstract class ProduccionMapeadaRepository {
  abstract findMany(
    filtros: FiltrosProduccionMapeada,
  ): Promise<PaginaProduccionMapeada>;
  abstract findById(id: number): Promise<ProduccionMapeada | null>;
}
