import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EstadoTelar, TipoIncidencia } from '../core/models';

/** Chip de estado de telar: marcha, paro, rotura, cambio de bloque, sin señal. */
@Component({
  selector: 'fabric-estado-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="chip"
      [class.chip--marcha]="estado() === 'marcha'"
      [class.chip--paro]="estado() === 'paro'"
      [class.chip--incidencia]="estado() === 'incidencia'"
      [class.chip--cambio]="estado() === 'cambio-bloque'"
      [class.chip--sindatos]="estado() === 'sin-datos'"
    >
      <span class="punto"></span>
      {{ etiqueta() }}
    </span>
  `
})
export class EstadoChipComponent {
  readonly estado = input.required<EstadoTelar>();
  readonly causa = input<TipoIncidencia | null>(null);

  readonly etiqueta = computed(() => {
    switch (this.estado()) {
      case 'marcha':
        return 'En marcha';
      case 'incidencia':
        return 'Rotura de fleje';
      case 'cambio-bloque':
        return 'Cambio de bloque';
      case 'sin-datos':
        return 'Sin señal';
      default:
        return this.causa() === 'rotura-fleje' ? 'Rotura de fleje' : 'Paro';
    }
  });
}
