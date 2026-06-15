import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BloqueInventarioModule } from './modules/bloque-inventario/bloque-inventario.module';
import { CoberturaMaquinasModule } from './modules/cobertura-maquinas/cobertura-maquinas.module';
import { FabricModule } from './modules/fabric/fabric.module';
import { ParteDiscoPuenteModule } from './modules/parte-disco-puente/parte-disco-puente.module';
import { ParteReforzadoraModule } from './modules/parte-reforzadora/parte-reforzadora.module';
import { ParteTrabajoModule } from './modules/parte-trabajo/parte-trabajo.module';
import { ProduccionMapeadaModule } from './modules/produccion-mapeada/produccion-mapeada.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BloqueInventarioModule,
    CoberturaMaquinasModule,
    FabricModule,
    ParteDiscoPuenteModule,
    ParteReforzadoraModule,
    ParteTrabajoModule,
    ProduccionMapeadaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
