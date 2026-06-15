import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RangoEstadisticas } from '../core/models';

const OPCIONES: { valor: RangoEstadisticas; etiqueta: string; titulo?: string }[] = [
  { valor: 'hoy', etiqueta: 'Hoy' },
  { valor: '7d', etiqueta: '7 días' },
  { valor: '30d', etiqueta: '30 días' },
  { valor: '90d', etiqueta: '90 días' },
  { valor: '1a', etiqueta: '1 año' },
  { valor: 'todo', etiqueta: 'Histórico', titulo: 'Desde que hay registros' }
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
          [attr.title]="opcion.titulo ?? null"
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
