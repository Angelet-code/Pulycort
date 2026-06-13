import {
  FiltrosParteDiscoPuente,
  PaginaParteDiscoPuente,
} from './parte-disco-puente.entity';

export abstract class ParteDiscoPuenteRepository {
  abstract findMany(
    filtros: FiltrosParteDiscoPuente,
  ): Promise<PaginaParteDiscoPuente>;
}
