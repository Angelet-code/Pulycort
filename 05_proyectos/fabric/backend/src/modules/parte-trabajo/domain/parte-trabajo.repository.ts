import {
  FiltrosParteTrabajo,
  PaginaParteTrabajo,
} from './parte-trabajo.entity';

export abstract class ParteTrabajoRepository {
  abstract findMany(filtros: FiltrosParteTrabajo): Promise<PaginaParteTrabajo>;
}
