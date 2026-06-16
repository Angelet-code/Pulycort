import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { GetPartesDiscoPuenteUseCase } from '../application/get-partes-disco-puente.use-case';
import { PaginaParteDiscoPuente } from '../domain/parte-disco-puente.entity';

const LIMIT_MAXIMO = 200;
const LIMIT_POR_DEFECTO = 50;

@Controller('partes-disco-puente')
export class ParteDiscoPuenteController {
  constructor(private readonly getListaUseCase: GetPartesDiscoPuenteUseCase) {}

  @Get()
  list(
    @Query('lote') lote?: string,
    @Query('material') material?: string,
    @Query('operacion') operacion?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('limit', new DefaultValuePipe(LIMIT_POR_DEFECTO), ParseIntPipe)
    limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe)
    offset?: number,
  ): Promise<PaginaParteDiscoPuente> {
    return this.getListaUseCase.execute({
      lote: lote && /^\d+$/.test(lote.trim()) ? Number(lote.trim()) : null,
      material: this.parseEntero('material', material),
      operacion: operacion && operacion.trim() !== '' ? operacion.trim() : null,
      desde: this.parseFecha('desde', desde, false),
      // `hasta` incluye el día completo: límite exclusivo al día siguiente.
      hasta: this.parseFecha('hasta', hasta, true),
      limit: Math.min(Math.max(limit ?? LIMIT_POR_DEFECTO, 1), LIMIT_MAXIMO),
      offset: Math.max(offset ?? 0, 0),
    });
  }

  private parseEntero(nombre: string, valor?: string): number | null {
    if (valor === undefined || valor.trim() === '') {
      return null;
    }
    const numero = Number(valor);
    if (!Number.isInteger(numero)) {
      throw new BadRequestException(`Invalid ${nombre}. Expected integer.`);
    }
    return numero;
  }

  private parseFecha(
    nombre: string,
    valor: string | undefined,
    finDeDia: boolean,
  ): Date | null {
    if (valor === undefined || valor.trim() === '') {
      return null;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      throw new BadRequestException(`Invalid ${nombre}. Expected YYYY-MM-DD.`);
    }
    const fecha = new Date(`${valor}T00:00:00`);
    if (Number.isNaN(fecha.getTime())) {
      throw new BadRequestException(`Invalid ${nombre}. Expected YYYY-MM-DD.`);
    }
    if (finDeDia) {
      fecha.setDate(fecha.getDate() + 1);
    }
    return fecha;
  }
}
