import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { GetBloquesInventarioUseCase } from '../application/get-bloques-inventario.use-case';
import { PaginaBloqueInventario } from '../domain/bloque-inventario.entity';
import { EstadoCicloBloque } from '../domain/estado-ciclo';

const LIMIT_MAXIMO = 200;
const LIMIT_POR_DEFECTO = 50;

const ESTADOS_CICLO: readonly EstadoCicloBloque[] = [
  'inventariado',
  'moviendo-a-telar',
  'aserrando',
  'sacando-del-telar',
  'almacenando',
  'almacenado',
  'sin-lecturas',
];

@Controller('bloques')
export class BloqueInventarioController {
  constructor(private readonly getListaUseCase: GetBloquesInventarioUseCase) {}

  @Get()
  list(
    @Query('material') material?: string,
    @Query('proveedor') proveedor?: string,
    @Query('estado') estado?: string,
    @Query('q') q?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('limit', new DefaultValuePipe(LIMIT_POR_DEFECTO), ParseIntPipe)
    limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe)
    offset?: number,
  ): Promise<PaginaBloqueInventario> {
    return this.getListaUseCase.execute({
      material: this.parseEntero('material', material),
      proveedor: proveedor && proveedor.trim() !== '' ? proveedor.trim() : null,
      estado: this.parseEstado(estado),
      q: q && q.trim() !== '' ? q.trim() : null,
      desde: this.parseFecha('desde', desde, false),
      // `hasta` incluye el día completo: límite exclusivo al día siguiente.
      hasta: this.parseFecha('hasta', hasta, true),
      limit: Math.min(Math.max(limit ?? LIMIT_POR_DEFECTO, 1), LIMIT_MAXIMO),
      offset: Math.max(offset ?? 0, 0),
    });
  }

  private parseEstado(valor?: string): EstadoCicloBloque | null {
    if (valor === undefined || valor.trim() === '') {
      return null;
    }
    const limpio = valor.trim() as EstadoCicloBloque;
    if (!ESTADOS_CICLO.includes(limpio)) {
      throw new BadRequestException(
        `Invalid estado. Expected one of: ${ESTADOS_CICLO.join(', ')}.`,
      );
    }
    return limpio;
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
