import {
  FiltrosParteReforzadora,
  PaginaParteReforzadora,
} from './parte-reforzadora.entity';

export abstract class ParteReforzadoraRepository {
  abstract findMany(
    filtros: FiltrosParteReforzadora,
  ): Promise<PaginaParteReforzadora>;
}
