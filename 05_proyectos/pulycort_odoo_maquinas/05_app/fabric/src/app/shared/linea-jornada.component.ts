import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SegmentoEstado, TipoIncidencia } from '../core/models';
import { formatHora } from '../core/format';

const COLOR_POR_INCIDENCIA: Record<TipoIncidencia, string> = {
  marcha: 'rgba(53, 217, 157, 0.75)',
  paro: 'rgba(243, 200, 106, 0.85)',
  'rotura-fleje': 'rgba(255, 95, 125, 0.9)',
  'cambio-bloque': 'rgba(79, 201, 222, 0.45)',
  desconocida: 'rgba(255, 255, 255, 0.25)'
};

const ETIQUETA_POR_INCIDENCIA: Record<TipoIncidencia, string> = {
  marcha: 'En marcha',
  paro: 'Paro',
  'rotura-fleje': 'Rotura de fleje',
  'cambio-bloque': 'Cambio de bloque',
  desconocida: 'Desconocida'
};

interface TramoPintado {
  izquierdaPct: number;
  anchoPct: number;
  color: string;
  titulo: string;
}

/** Carril Gantt de estados de un telar a lo largo del día (00:00–24:00). */
@Component({
  selector: 'fabric-linea-jornada',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="carril" [style.height.px]="alto()">
      @for (tramo of tramos(); track $index) {
        <div
          class="seg"
          [style.left.%]="tramo.izquierdaPct"
          [style.width.%]="tramo.anchoPct"
          [style.background]="tramo.color"
          [title]="tramo.titulo"
        ></div>
      }
    </div>
    @if (mostrarHoras()) {
      <div class="horas soft">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>24 h</span>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .carril {
      position: relative;
      background: var(--surface-soft);
      border: 1px solid var(--line);
      border-radius: 7px;
      overflow: hidden;
    }
    .seg {
      position: absolute;
      top: 0;
      bottom: 0;
    }
    .horas {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      margin-top: 3px;
      font-variant-numeric: tabular-nums;
    }
  `
})
export class LineaJornadaComponent {
  readonly segmentos = input.required<SegmentoEstado[]>();
  /** Inicio del día (ISO) al que se refiere el carril. */
  readonly inicioDia = input.required<string>();
  readonly alto = input(16);
  readonly mostrarHoras = input(true);

  readonly tramos = computed<TramoPintado[]>(() => {
    const dia0 = new Date(this.inicioDia()).getTime();
    const spanMs = 24 * 3_600_000;
    return this.segmentos()
      .map((segmento) => {
        const desde = Math.max(new Date(segmento.desde).getTime(), dia0);
        const hasta = Math.min(new Date(segmento.hasta).getTime(), dia0 + spanMs);
        return { segmento, desde, hasta };
      })
      .filter(({ desde, hasta }) => hasta > desde)
      .map(({ segmento, desde, hasta }) => ({
        izquierdaPct: ((desde - dia0) / spanMs) * 100,
        anchoPct: ((hasta - desde) / spanMs) * 100,
        color: COLOR_POR_INCIDENCIA[segmento.incidencia],
        titulo: `${ETIQUETA_POR_INCIDENCIA[segmento.incidencia]} · ${formatHora(segmento.desde)}–${formatHora(segmento.hasta)}`
      }));
  });
}
