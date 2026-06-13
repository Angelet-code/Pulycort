import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { EventoParte, TipoEvento } from '../core/models';
import { formatHora, formatNumero } from '../core/format';
import { MaterialDotComponent } from './material-dot.component';

const ETIQUETA_EVENTO: Record<TipoEvento, string> = {
  colocacion: 'Colocación de bloque',
  aserrado: 'Aserrado en curso',
  salida: 'Salida del telar',
  paquetes: 'Paquetes hechos',
  'fin-jornada': 'Fin de jornada'
};

/** Cinta con los últimos partes de trabajo de la planta. */
@Component({
  selector: 'fabric-ticker-eventos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialDotComponent],
  template: `
    <div class="cinta">
      @for (evento of eventos(); track evento.id) {
        <div class="evento" [style.border-left-color]="'var(--t' + evento.telarId + ')'">
          <span class="hora num">{{ hora(evento) }}</span>
          <span class="telar" [style.color]="'var(--t' + evento.telarId + ')'">T{{ evento.telarId }}</span>
          <span class="cuerpo">
            <span class="tipo">{{ etiqueta(evento) }}</span>
            <span class="detalle muted">
              @if (evento.bloque !== null) {
                <fabric-material-dot [materialId]="evento.materialId" [tam]="10" />
                Bloque {{ evento.bloque }}
              }
              @if (evento.paquetes; as paquetes) {
                · {{ resumen(paquetes.numTablas, paquetes.metrosCuadrados) }}
              }
            </span>
          </span>
        </div>
      } @empty {
        <div class="estado-vacio">Aún no hay partes de trabajo</div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .cinta {
      display: flex;
      gap: 10px;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .evento {
      flex: none;
      display: flex;
      align-items: center;
      gap: 9px;
      background: var(--surface-soft);
      border: 1px solid var(--line);
      border-left: 3px solid;
      border-radius: 12px;
      padding: 7px 12px;
      font-size: 12.5px;
    }
    .hora {
      color: var(--text-soft);
      font-weight: 650;
    }
    .telar {
      font-weight: 800;
    }
    .cuerpo {
      display: flex;
      flex-direction: column;
      line-height: 1.25;
    }
    .tipo {
      font-weight: 650;
    }
    .detalle {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11.5px;
    }
  `
})
export class TickerEventosComponent {
  readonly eventos = input.required<EventoParte[]>();

  hora(evento: EventoParte): string {
    return formatHora(evento.fechaHora);
  }

  etiqueta(evento: EventoParte): string {
    return ETIQUETA_EVENTO[evento.tipo];
  }

  resumen(tablas: number, m2: number): string {
    return `${formatNumero(tablas)} tablas · ${formatNumero(m2, 1)} m²`;
  }
}
