import { Module } from '@nestjs/common';
import { GetBloquesInventarioUseCase } from './application/get-bloques-inventario.use-case';
import { GetResumenInventarioUseCase } from './application/get-resumen-inventario.use-case';
import { BloqueInventarioRepository } from './domain/bloque-inventario.repository';
import { PrismaBloqueInventarioRepository } from './infrastructure/prisma-bloque-inventario.repository';
import { BloqueInventarioController } from './presentation/bloque-inventario.controller';
import { PrismaModule } from '../../shared/infrastructure/database/prisma/prisma.module';
import { PrismaService } from '../../shared/infrastructure/database/prisma/prisma.service';

@Module({
  imports: [PrismaModule],
  controllers: [BloqueInventarioController],
  providers: [
    GetBloquesInventarioUseCase,
    GetResumenInventarioUseCase,
    {
      provide: BloqueInventarioRepository,
      inject: [PrismaService],
      useFactory: (prismaService: PrismaService): BloqueInventarioRepository =>
        new PrismaBloqueInventarioRepository(prismaService),
    },
  ],
})
export class BloqueInventarioModule {}
