import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { GetDetalleTelarUseCase } from '../application/get-detalle-telar.use-case';
import { GetEstadisticasUseCase } from '../application/get-estadisticas.use-case';
import { GetPartesUseCase } from '../application/get-partes.use-case';
import { GetSaludDatosUseCase } from '../application/get-salud-datos.use-case';
import { GetSnapshotPlantaUseCase } from '../application/get-snapshot-planta.use-case';
import {
  DetalleTelar,
  Estadisticas,
  PaginaPartes,
  RangoEstadisticas,
  rangosEstadisticas,
  SaludDatos,
  SnapshotPlanta,
} from '../domain/fabric.types';

@Controller('api')
export class FabricController {
  constructor(
    private readonly getSnapshotPlantaUseCase: GetSnapshotPlantaUseCase,
    private readonly getDetalleTelarUseCase: GetDetalleTelarUseCase,
    private readonly getEstadisticasUseCase: GetEstadisticasUseCase,
    private readonly getSaludDatosUseCase: GetSaludDatosUseCase,
    private readonly getPartesUseCase: GetPartesUseCase,
  ) {}

  @Get('planta/snapshot')
  getSnapshotPlanta(): Promise<SnapshotPlanta> {
    return this.getSnapshotPlantaUseCase.execute();
  }

  @Get('telares/:telarId')
  async getDetalleTelar(
    @Param('telarId', ParseIntPipe) telarId: number,
  ): Promise<DetalleTelar> {
    const detalle = await this.getDetalleTelarUseCase.execute(telarId);

    if (!detalle) {
      throw new NotFoundException(`Telar ${telarId} not found`);
    }

    return detalle;
  }

  @Get('estadisticas')
  getEstadisticas(
    @Query('rango') rango: string | undefined,
  ): Promise<Estadisticas> {
    return this.getEstadisticasUseCase.execute(this.parseRango(rango));
  }

  @Get('salud-datos')
  getSaludDatos(): Promise<SaludDatos> {
    return this.getSaludDatosUseCase.execute();
  }

  @Get('partes')
  getPartes(
    @Query('rango') rango: string | undefined,
    @Query('telar') telar: string | undefined,
  ): Promise<PaginaPartes> {
    return this.getPartesUseCase.execute(
      this.parseRango(rango),
      this.parseNullableNumber(telar),
    );
  }

  private parseRango(rango: string | undefined): RangoEstadisticas {
    const value = rango ?? 'hoy';

    if (!rangosEstadisticas.includes(value as RangoEstadisticas)) {
      throw new BadRequestException(
        `Invalid rango. Expected one of: ${rangosEstadisticas.join(', ')}`,
      );
    }

    return value as RangoEstadisticas;
  }

  private parseNullableNumber(value: string | undefined): number | null {
    if (value === undefined || value === '' || value === 'null') {
      return null;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed)) {
      throw new BadRequestException('Invalid telar. Expected integer.');
    }

    return parsed;
  }
}
