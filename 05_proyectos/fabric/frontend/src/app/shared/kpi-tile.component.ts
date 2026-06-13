import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MetricaComponent } from './metrica.component';

/** Tile de KPI: etiqueta, valor con unidad y nota de contexto opcional. */
@Component({
  selector: 'fabric-kpi',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MetricaComponent],
  host: {
    class: 'kpi-tile',
    '[class.tono-ok]': "tono() === 'ok'",
    '[class.tono-aviso]': "tono() === 'aviso'",
    '[class.tono-mal]': "tono() === 'mal'",
    // Tooltip de "cómo se calcula" al pasar el ratón por el tile.
    '[attr.title]': 'ayuda() || null',
    '[style.cursor]': "ayuda() ? 'help' : null"
  },
  template: `
    <span class="kpi-etiqueta">{{ etiqueta() }}</span>
    <fabric-metrica
      [valor]="valor()"
      [unidad]="unidad()"
      [decimales]="decimales()"
      [tam]="26"
    />
    @if (nota()) {
      <span class="kpi-nota">{{ nota() }}</span>
    }
  `
})
export class KpiTileComponent {
  readonly etiqueta = input.required<string>();
  readonly valor = input.required<number | null | undefined>();
  readonly unidad = input('');
  readonly decimales = input(0);
  readonly nota = input('');
  readonly tono = input<'' | 'ok' | 'aviso' | 'mal'>('');
  /** Explicación de cómo se calcula el KPI, mostrada como tooltip en hover. */
  readonly ayuda = input('');
}
