import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatNumero } from '../core/format';

/**
 * Patrón valor + unidad: número tabular y unidad pequeña en gris.
 * La unidad nunca va dentro del número; si no hay dato, muestra "—" sin unidad.
 */
@Component({
  selector: 'fabric-metrica',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="metrica" [style.font-size.px]="tam()">
      <span class="valor" [style.color]="color() || null">{{ texto() }}</span>
      @if (conUnidad()) {
        <span class="unidad">{{ unidad() }}</span>
      }
    </span>
  `
})
export class MetricaComponent {
  readonly valor = input.required<number | null | undefined>();
  readonly unidad = input('');
  readonly decimales = input(0);
  readonly tam = input(15);
  readonly color = input('');

  readonly texto = computed(() => formatNumero(this.valor() ?? null, this.decimales()));
  readonly conUnidad = computed(() => this.texto() !== '—' && this.unidad() !== '');
}
