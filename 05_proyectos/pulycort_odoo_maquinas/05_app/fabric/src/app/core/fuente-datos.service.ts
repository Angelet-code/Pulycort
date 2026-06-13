import { Injectable, signal } from '@angular/core';

export type FuenteDatos = 'demo' | 'real';

const CLAVE_ALMACEN = 'fabric.fuenteDatos';

/**
 * Fuente de datos activa de toda la app: 'real' (backend NestJS + Prisma
 * sobre la BD de las máquinas) o 'demo' (simulación en memoria). El switch
 * de la barra superior la cambia en caliente; el conmutador de FabricApi
 * delega cada llamada según este valor y las vistas se refrescan solas.
 */
@Injectable({ providedIn: 'root' })
export class FuenteDatosService {
  readonly fuente = signal<FuenteDatos>(this.leerInicial());

  esReal(): boolean {
    return this.fuente() === 'real';
  }

  fijar(fuente: FuenteDatos): void {
    this.fuente.set(fuente);
    try {
      localStorage.setItem(CLAVE_ALMACEN, fuente);
    } catch {
      // Sin almacenamiento disponible (modo privado): solo afecta a recordar
      // la elección entre sesiones.
    }
  }

  alternar(): void {
    this.fijar(this.esReal() ? 'demo' : 'real');
  }

  private leerInicial(): FuenteDatos {
    try {
      return localStorage.getItem(CLAVE_ALMACEN) === 'demo' ? 'demo' : 'real';
    } catch {
      return 'real';
    }
  }
}
