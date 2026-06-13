import { Module } from '@nestjs/common';
import { GetPartesTrabajoUseCase } from './application/get-partes-trabajo.use-case';
import { ParteTrabajoRepository } from './domain/parte-trabajo.repository';
import { PrismaParteTrabajoRepository } from './infrastructure/prisma-parte-trabajo.repository';
import { ParteTrabajoController } from './presentation/parte-trabajo.controller';
import { PrismaModule } from '../../shared/infrastructure/database/prisma/prisma.module';
import { PrismaService } from '../../shared/infrastructure/database/prisma/prisma.service';
import { BloqueRegistroModule } from '../../shared/infrastructure/bloque-registro/bloque-registro.module';
import { BloqueRegistroService } from '../../shared/infrastructure/bloque-registro/bloque-registro.service';

@Module({
  imports: [PrismaModule, BloqueRegistroModule],
  controllers: [ParteTrabajoController],
  providers: [
    GetPartesTrabajoUseCase,
    {
      provide: ParteTrabajoRepository,
      inject: [PrismaService, BloqueRegistroService],
      useFactory: (
        prismaService: PrismaService,
        bloqueRegistro: BloqueRegistroService,
      ): ParteTrabajoRepository =>
        new PrismaParteTrabajoRepository(prismaService, bloqueRegistro),
    },
  ],
})
export class ParteTrabajoModule {}
