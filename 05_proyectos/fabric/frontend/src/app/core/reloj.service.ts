import { Injectable, OnDestroy, signal } from '@angular/core';

/**
 * Reloj virtual de la aplicación.
 *
 * A factor 1 equivale a la hora real. El modo demo (×60) acelera el tiempo
 * para ver avanzar los cortes sin esperar: un minuto real = una hora de
 * fábrica. Toda la app lee la hora de aquí, de modo que el cambio de factor
 * mueve coherentemente snapshot, gráficos y estadísticas.
 */
@Injectable({ providedIn: 'root' })
export class RelojService implements OnDestroy {
  private anclaRealMs = Date.now();
  private anclaVirtualMs = Date.now();
  private readonly intervalo: ReturnType<typeof setInterval>;

  readonly factor = signal(1);
  readonly ahoraMs = signal(Date.now());

  constructor() {
    this.intervalo = setInterval(() => this.ahoraMs.set(this.calcularAhora()), 1000);
  }

  ahora(): number {
    return this.calcularAhora();
  }

  fijarFactor(factor: number): void {
    // Re-ancla para que el tiempo virtual sea continuo al cambiar de marcha.
    const virtual = this.calcularAhora();
    this.anclaVirtualMs = virtual;
    this.anclaRealMs = Date.now();
    this.factor.set(factor);
    this.ahoraMs.set(virtual);
  }

  alternarDemo(): void {
    this.fijarFactor(this.factor() === 1 ? 60 : 1);
  }

  private calcularAhora(): number {
    return this.anclaVirtualMs + (Date.now() - this.anclaRealMs) * this.factor();
  }

  ngOnDestroy(): void {
    clearInterval(this.intervalo);
  }
}
