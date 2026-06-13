import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Barra de avance del corte. */
@Component({
  selector: 'fabric-barra-progreso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pista" [style.height.px]="alto()">
      <div class="relleno" [style.width.%]="pctSeguro()" [style.background]="color()"></div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .pista {
      background: var(--surface-soft);
      border: 1px solid var(--line);
      border-radius: 999px;
      overflow: hidden;
    }
    .relleno {
      height: 100%;
      border-radius: 999px;
      transition: width 0.6s ease;
      min-width: 0;
    }
  `
})
export class BarraProgresoComponent {
  readonly pct = input.required<number | null>();
  readonly alto = input(8);
  readonly color = input('linear-gradient(90deg, var(--teal), var(--green))');

  readonly pctSeguro = computed(() => Math.max(0, Math.min(100, this.pct() ?? 0)));
}
