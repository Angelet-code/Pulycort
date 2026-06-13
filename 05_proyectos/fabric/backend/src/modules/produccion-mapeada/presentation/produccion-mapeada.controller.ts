import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { GetProduccionMapeadaByIdUseCase } from '../application/get-produccion-mapeada-by-id.use-case';
import { GetProduccionMapeadaUseCase } from '../application/get-produccion-mapeada.use-case';
import {
  PaginaProduccionMapeada,
  ProduccionMapeada,
} from '../domain/produccion-mapeada.entity';

const LIMIT_MAXIMO = 200;
const LIMIT_POR_DEFECTO = 50;

@Controller('produccion-mapeada')
export class ProduccionMapeadaController {
  constructor(
    private readonly getListaUseCase: GetProduccionMapeadaUseCase,
    private readonly getByIdUseCase: GetProduccionMapeadaByIdUseCase,
  ) {}

  @Get()
  list(
    @Query('telar') telar?: string,
    @Query('material') material?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('limit', new DefaultValuePipe(LIMIT_POR_DEFECTO), ParseIntPipe)
    limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe)
    offset?: number,
  ): Promise<PaginaProduccionMapeada> {
    return this.getListaUseCase.execute({
      telarN: telar && telar.trim() !== '' ? telar.trim() : null,
      material: this.parseEntero('material', material),
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
    // Medianoche local del servidor (misma zona que la fábrica).
    const fecha = new Date(`${valor}T00:00:00`);
    if (Number.isNaN(fecha.getTime())) {
      throw new BadRequestException(`Invalid ${nombre}. Expected YYYY-MM-DD.`);
    }
    if (finDeDia) {
      fecha.setDate(fecha.getDate() + 1);
    }
    return fecha;
  }

  @Get(':id')
  async getById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ProduccionMapeada> {
    const fila = await this.getByIdUseCase.execute(id);

    if (!fila) {
      throw new NotFoundException(`Produccion mapeada ${id} not found`);
    }

    return fila;
  }
}
