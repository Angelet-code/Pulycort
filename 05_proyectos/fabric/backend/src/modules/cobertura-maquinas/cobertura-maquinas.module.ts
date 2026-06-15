import { Module } from '@nestjs/common';
import { GetCoberturaMaquinasUseCase } from './application/get-cobertura-maquinas.use-case';
import { CoberturaMaquinasRepository } from './domain/cobertura-maquinas.repository';
import { PrismaCoberturaMaquinasRepository } from './infrastructure/prisma-cobertura-maquinas.repository';
import { CoberturaMaquinasController } from './presentation/cobertura-maquinas.controller';
import { PrismaModule } from '../../shared/infrastructure/database/prisma/prisma.module';
import { PrismaService } from '../../shared/infrastructure/database/prisma/prisma.service';

@Module({
  imports: [PrismaModule],
  controllers: [CoberturaMaquinasController],
  providers: [
    GetCoberturaMaquinasUseCase,
    {
      provide: CoberturaMaquinasRepository,
      inject: [PrismaService],
      useFactory: (
        prismaService: PrismaService,
      ): CoberturaMaquinasRepository =>
        new PrismaCoberturaMaquinasRepository(prismaService),
    },
  ],
})
export class CoberturaMaquinasModule {}
