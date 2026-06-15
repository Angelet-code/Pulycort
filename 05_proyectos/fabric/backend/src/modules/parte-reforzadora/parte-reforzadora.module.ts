import { Module } from '@nestjs/common';
import { GetPartesReforzadoraUseCase } from './application/get-partes-reforzadora.use-case';
import { ParteReforzadoraRepository } from './domain/parte-reforzadora.repository';
import { PrismaParteReforzadoraRepository } from './infrastructure/prisma-parte-reforzadora.repository';
import { ParteReforzadoraController } from './presentation/parte-reforzadora.controller';
import { PrismaModule } from '../../shared/infrastructure/database/prisma/prisma.module';
import { PrismaService } from '../../shared/infrastructure/database/prisma/prisma.service';
import { BloqueRegistroModule } from '../../shared/infrastructure/bloque-registro/bloque-registro.module';
import { BloqueRegistroService } from '../../shared/infrastructure/bloque-registro/bloque-registro.service';

@Module({
  imports: [PrismaModule, BloqueRegistroModule],
  controllers: [ParteReforzadoraController],
  providers: [
    GetPartesReforzadoraUseCase,
    {
      provide: ParteReforzadoraRepository,
      inject: [PrismaService, BloqueRegistroService],
      useFactory: (
        prismaService: PrismaService,
        bloqueRegistro: BloqueRegistroService,
      ): ParteReforzadoraRepository =>
        new PrismaParteReforzadoraRepository(prismaService, bloqueRegistro),
    },
  ],
})
export class ParteReforzadoraModule {}
