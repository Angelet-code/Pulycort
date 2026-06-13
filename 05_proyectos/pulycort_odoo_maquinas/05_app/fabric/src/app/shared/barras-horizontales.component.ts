import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MaterialDotComponent } from './material-dot.component';
import { MetricaComponent } from './metrica.component';

export interface ItemBarraH {
  etiqueta: string;
  valor: number;
  color?: string;
  materialId?: string | null;
  sufijo?: string;
}

/** Barras horizontales con etiqueta, valor + unidad y dot de material opcional. */
@Component({
  selector: 'fabric-barras-horizontales',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialDotComponent, MetricaComponent],
  template: `
    @for (item of items(); track item.etiqueta) {
      <div class="fila">
        <span class="etiqueta">
          @if (item.materialId !== undefined) {
            <fabric-material-dot [materialId]="item.materialId" [tam]="12" />
          }
          <span class="texto">{{ item.etiqueta }}</span>
        </span>
        <span class="pista">
          <span
            class="relleno"
            [style.width.%]="anchoPct(item.valor)"
            [style.background]="item.color || 'var(--stone)'"
          ></span>
        </span>
        <span class="dato">
          <fabric-metrica [valor]="item.valor" [unidad]="unidad()" [decimales]="decimales()" [tam]="13" />
          @if (item.sufijo) {
            <span class="soft sufijo">{{ item.sufijo }}</span>
          }
        </span>
      </div>
    } @empty {
      <div class="estado-vacio">Sin datos en este periodo</div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 9px;
    }
    .fila {
      display: grid;
      grid-template-columns: minmax(110px, 150px) 1fr auto;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .etiqueta {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-size: 12.5px;
      font-weight: 600;
      min-width: 0;
    }
    .texto {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pista {
      display: block;
      height: 9px;
      background: var(--surface-soft);
      border: 1px solid var(--line);
      border-radius: 999px;
      overflow: hidden;
    }
    .relleno {
      display: block;
      height: 100%;
      border-radius: 999px;
      transition: width 0.5s ease;
    }
    .dato {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      justify-content: flex-end;
      min-width: 86px;
    }
    .sufijo {
      font-size: 11px;
    }
  `
})
export class BarrasHorizontalesComponent {
  readonly items = input.required<ItemBarraH[]>();
  readonly unidad = input('');
  readonly decimales = input(0);

  private readonly max = computed(() => Math.max(1, ...this.items().map((i) => i.valor)));

  anchoPct(valor: number): number {
    return Math.max(0, Math.min(100, (valor / this.max()) * 100));
  }
}
