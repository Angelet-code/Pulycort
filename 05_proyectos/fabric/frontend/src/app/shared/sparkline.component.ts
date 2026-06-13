import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PuntoSerie } from '../core/models';

/** Mini-gráfico de área sin ejes: las caídas a 0 son paros legibles solos. */
@Component({
  selector: 'fabric-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (puntos().length >= 2) {
      <svg
        [attr.viewBox]="'0 0 100 ' + alto()"
        preserveAspectRatio="none"
        [style.height.px]="alto()"
      >
        <path [attr.d]="rutaArea()" [attr.fill]="color()" opacity="0.14" />
        <path
          [attr.d]="rutaLinea()"
          fill="none"
          [attr.stroke]="color()"
          stroke-width="1.6"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        />
      </svg>
    } @else {
      <span class="soft vacio">sin lecturas</span>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    svg {
      display: block;
      width: 100%;
    }
    .vacio {
      font-size: 11px;
    }
  `
})
export class SparklineComponent {
  readonly puntos = input.required<PuntoSerie[]>();
  readonly color = input('var(--green)');
  readonly alto = input(32);
  /** Techo fijo del eje (p. ej. 76 kW); si no, se autoajusta. */
  readonly yMax = input<number | null>(null);

  private readonly coordenadas = computed(() => {
    const puntos = this.puntos();
    const alto = this.alto();
    const max = this.yMax() ?? Math.max(1, ...puntos.map((p) => p.v)) * 1.08;
    return puntos.map((punto, i) => {
      const x = (i / (puntos.length - 1)) * 100;
      const y = alto - 2 - (Math.max(0, punto.v) / max) * (alto - 5);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
  });

  readonly rutaLinea = computed(() => `M${this.coordenadas().join(' L')}`);

  readonly rutaArea = computed(() => {
    const alto = this.alto();
    return `M0,${alto} L${this.coordenadas().join(' L')} L100,${alto} Z`;
  });
}
