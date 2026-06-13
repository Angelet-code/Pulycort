import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BloqueInventarioModule } from './modules/bloque-inventario/bloque-inventario.module';
import { FabricModule } from './modules/fabric/fabric.module';
import { ParteDiscoPuenteModule } from './modules/parte-disco-puente/parte-disco-puente.module';
import { ParteTrabajoModule } from './modules/parte-trabajo/parte-trabajo.module';
import { ProduccionMapeadaModule } from './modules/produccion-mapeada/produccion-mapeada.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BloqueInventarioModule,
    FabricModule,
    ParteDiscoPuenteModule,
    ParteTrabajoModule,
    ProduccionMapeadaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
