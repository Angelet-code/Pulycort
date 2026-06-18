import { Module } from '@nestjs/common';
import { GetDetalleTelarUseCase } from './application/get-detalle-telar.use-case';
import { GetEstadisticasUseCase } from './application/get-estadisticas.use-case';
import { GetMedidasDudosasUseCase } from './application/get-medidas-dudosas.use-case';
import { GetPartesUseCase } from './application/get-partes.use-case';
import { GetSaludDatosUseCase } from './application/get-salud-datos.use-case';
import { GetSnapshotPlantaUseCase } from './application/get-snapshot-planta.use-case';
import { FabricRepository } from './domain/fabric.repository';
import { PrismaFabricRepository } from './infrastructure/prisma-fabric.repository';
import { FabricController } from './presentation/fabric.controller';
import { PrismaModule } from '../../shared/infrastructure/database/prisma/prisma.module';
import { PrismaService } from '../../shared/infrastructure/database/prisma/prisma.service';

@Module({
  imports: [PrismaModule],
  controllers: [FabricController],
  providers: [
    GetSnapshotPlantaUseCase,
    GetDetalleTelarUseCase,
    GetEstadisticasUseCase,
    GetSaludDatosUseCase,
    GetPartesUseCase,
    GetMedidasDudosasUseCase,
    {
      provide: FabricRepository,
      inject: [PrismaService],
      useFactory: (prismaService: PrismaService): FabricRepository =>
        new PrismaFabricRepository(prismaService),
    },
  ],
})
export class FabricModule {}
