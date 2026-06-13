import { Module } from '@nestjs/common';
import { GetPartesDiscoPuenteUseCase } from './application/get-partes-disco-puente.use-case';
import { ParteDiscoPuenteRepository } from './domain/parte-disco-puente.repository';
import { PrismaParteDiscoPuenteRepository } from './infrastructure/prisma-parte-disco-puente.repository';
import { ParteDiscoPuenteController } from './presentation/parte-disco-puente.controller';
import { PrismaModule } from '../../shared/infrastructure/database/prisma/prisma.module';
import { PrismaService } from '../../shared/infrastructure/database/prisma/prisma.service';
import { BloqueRegistroModule } from '../../shared/infrastructure/bloque-registro/bloque-registro.module';
import { BloqueRegistroService } from '../../shared/infrastructure/bloque-registro/bloque-registro.service';

@Module({
  imports: [PrismaModule, BloqueRegistroModule],
  controllers: [ParteDiscoPuenteController],
  providers: [
    GetPartesDiscoPuenteUseCase,
    {
      provide: ParteDiscoPuenteRepository,
      inject: [PrismaService, BloqueRegistroService],
      useFactory: (
        prismaService: PrismaService,
        bloqueRegistro: BloqueRegistroService,
      ): ParteDiscoPuenteRepository =>
        new PrismaParteDiscoPuenteRepository(prismaService, bloqueRegistro),
    },
  ],
})
export class ParteDiscoPuenteModule {}
