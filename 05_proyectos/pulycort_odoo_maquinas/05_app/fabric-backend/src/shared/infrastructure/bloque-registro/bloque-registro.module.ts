import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma/prisma.module';
import { BloqueRegistroService } from './bloque-registro.service';

@Module({
  imports: [PrismaModule],
  providers: [BloqueRegistroService],
  exports: [BloqueRegistroService],
})
export class BloqueRegistroModule {}
