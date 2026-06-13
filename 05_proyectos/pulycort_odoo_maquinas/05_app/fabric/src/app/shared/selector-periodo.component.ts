import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RangoEstadisticas } from '../core/models';

const OPCIONES: { valor: RangoEstadisticas; etiqueta: string }[] = [
  { valor: 'hoy', etiqueta: 'Hoy' },
  { valor: '7d', etiqueta: '7 días' },
  { valor: '30d', etiqueta: '30 días' }
];

/** Pills de selección de periodo para estadísticas. */
@Component({
  selector: 'fabric-selector-periodo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pills">
      @for (opcion of opciones; track opcion.valor) {
        <button
          type="button"
          [class.activa]="opcion.valor === valor()"
          (click)="cambio.emit(opcion.valor)"
        >
          {{ opcion.etiqueta }}
        </button>
      }
    </div>
  `
})
export class SelectorPeriodoComponent {
  readonly valor = input.required<RangoEstadisticas>();
  readonly cambio = output<RangoEstadisticas>();

  readonly opciones = OPCIONES;
}
