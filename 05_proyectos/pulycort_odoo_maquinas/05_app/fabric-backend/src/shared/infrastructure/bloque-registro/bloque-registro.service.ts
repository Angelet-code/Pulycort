import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';

const TTL_MS = 5 * 60_000;

/**
 * Padrón de bloques de máquina (`bloque_maquinas`): el registro real de los
 * bloques que han pasado por las máquinas, al que apunta `parte_*.id_bloque`.
 *
 * Se usa para saber si el `n_bloque` de un parte es CONOCIDO. No confundir con
 * el flag `bloque_existe` de las tablas `_mapeada`, que comprueba el inventario
 * de Odoo (`lot_block_creation`) y está incompleto: marca como "no existe" el
 * 36-55% de partes cuyo bloque sí es real (ver 00_gestion/TAREAS.md).
 */
@Injectable()
export class BloqueRegistroService {
  private cache: { en: number; conocidos: Set<number> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Conjunto de `n_bloque` registrados, cacheado para no recorrer la tabla por página. */
  async conocidos(): Promise<Set<number>> {
    if (this.cache && Date.now() - this.cache.en < TTL_MS) {
      return this.cache.conocidos;
    }
    const filas = await this.prisma.bloqueMaquinas.findMany({
      where: { nBloque: { not: null } },
      select: { nBloque: true },
    });
    const conocidos = new Set(filas.map((f) => f.nBloque!));
    this.cache = { en: Date.now(), conocidos };
    return conocidos;
  }

  /** true solo si el bloque tiene número real (>0) y está en el padrón. */
  static esConocido(nBloque: number | null, conocidos: Set<number>): boolean {
    return nBloque !== null && nBloque > 0 && conocidos.has(nBloque);
  }
}
