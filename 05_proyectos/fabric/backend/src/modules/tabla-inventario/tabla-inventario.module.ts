import { Module } from '@nestjs/common';
import { GetTablasInventarioUseCase } from './application/get-tablas-inventario.use-case';
import { TablaInventarioRepository } from './domain/tabla-inventario.repository';
import { PrismaTablaInventarioRepository } from './infrastructure/prisma-tabla-inventario.repository';
import { TablaInventarioController } from './presentation/tabla-inventario.controller';
import { PrismaModule } from '../../shared/infrastructure/database/prisma/prisma.module';
import { PrismaService } from '../../shared/infrastructure/database/prisma/prisma.service';

@Module({
  imports: [PrismaModule],
  controllers: [TablaInventarioController],
  providers: [
    GetTablasInventarioUseCase,
    {
      provide: TablaInventarioRepository,
      inject: [PrismaService],
      useFactory: (prismaService: PrismaService): TablaInventarioRepository =>
        new PrismaTablaInventarioRepository(prismaService),
    },
  ],
  // Lo usa el use-case del resumen de inventario (forma "tablas" del treemap).
  exports: [TablaInventarioRepository],
})
export class TablaInventarioModule {}
