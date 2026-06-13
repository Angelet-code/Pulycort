import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const databaseProvider = configService
      .get<string>('DATABASE_PROVIDER', 'prisma')
      .toLowerCase();
    // El modo demo del backend se retiró (2026-06-13): la demostración vive
    // solo en el frontend (switch Demo). Si alguien conserva la vieja config
    // DATABASE_PROVIDER=mock, fallamos claro en vez de servir datos falsos.
    if (databaseProvider === 'mock') {
      throw new Error(
        'DATABASE_PROVIDER=mock ya no existe: la demo está en el frontend. ' +
          'Quita esa variable (o ponla a "prisma") y define una DATABASE_URL real.',
      );
    }

    super({
      adapter: new PrismaPg({
        connectionString: configService.getOrThrow<string>('DATABASE_URL'),
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
