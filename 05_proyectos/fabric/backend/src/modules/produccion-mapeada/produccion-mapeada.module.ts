import { Module } from '@nestjs/common';
import { GetProduccionMapeadaByIdUseCase } from './application/get-produccion-mapeada-by-id.use-case';
import { GetProduccionMapeadaUseCase } from './application/get-produccion-mapeada.use-case';
import { ProduccionMapeadaRepository } from './domain/produccion-mapeada.repository';
import { PrismaProduccionMapeadaRepository } from './infrastructure/prisma-produccion-mapeada.repository';
import { ProduccionMapeadaController } from './presentation/produccion-mapeada.controller';
import { PrismaModule } from '../../shared/infrastructure/database/prisma/prisma.module';
import { PrismaService } from '../../shared/infrastructure/database/prisma/prisma.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProduccionMapeadaController],
  providers: [
    GetProduccionMapeadaUseCase,
    GetProduccionMapeadaByIdUseCase,
    {
      provide: ProduccionMapeadaRepository,
      inject: [PrismaService],
      useFactory: (prismaService: PrismaService): ProduccionMapeadaRepository =>
        new PrismaProduccionMapeadaRepository(prismaService),
    },
  ],
})
export class ProduccionMapeadaModule {}
