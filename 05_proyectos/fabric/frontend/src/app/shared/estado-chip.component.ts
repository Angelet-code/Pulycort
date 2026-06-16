import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ActividadParte, EstadoTelar, TipoIncidencia } from '../core/models';
import { formatDuracionMin } from '../core/format';

/** Minutos sin lecturas a partir de los cuales la máquina pasa a "Descansando". */
const DESCANSANDO_MIN = 24 * 60;

/** Clase de color del chip según la categoría de actividad del operario. */
const CLASE_ACTIVIDAD: Record<ActividadParte['categoria'], string> = {
  operacion: 'chip--cambio',
  evento: 'chip--paro',
  'fin-jornada': 'chip--sindatos'
};

/**
 * Chip de estado de máquina: En marcha, Parado, Rotura de fleje, Cambio de lote,
 * En pausa o Descansando. El estado operativo (marcha/paro/evento) sale del
 * backend; cuando no hay lecturas recientes (`sin-datos`), el chip distingue
 * "En pausa" de "Descansando" por el tiempo de inactividad. Cada estado lleva su
 * explicación en el tooltip (al pasar el ratón).
 */
@Component({
  selector: 'fabric-estado-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span [class]="claseChip()" [title]="tooltip()">
      <span class="punto"></span>
      {{ etiqueta() }}
    </span>
  `
})
export class EstadoChipComponent {
  readonly estado = input.required<EstadoTelar>();
  readonly causa = input<TipoIncidencia | null>(null);
  /** Minutos desde la última lectura/parte; decide En pausa vs Descansando. */
  readonly inactivoMin = input<number | null>(null);
  /** Actividad del operario (último parte); si está, manda sobre el estado de máquina. */
  readonly actividad = input<ActividadParte | null>(null);

  private readonly descansando = computed(
    () => (this.inactivoMin() ?? 0) >= DESCANSANDO_MIN
  );

  /** Clase del chip: el color de la actividad del operario tiene prioridad. */
  readonly claseChip = computed(() => {
    const act = this.actividad();
    if (act) {
      return `chip ${CLASE_ACTIVIDAD[act.categoria]}`;
    }
    switch (this.estado()) {
      case 'marcha':
        return 'chip chip--marcha';
      case 'incidencia':
        return 'chip chip--incidencia';
      case 'cambio-bloque':
        return 'chip chip--cambio';
      case 'sin-datos':
        return 'chip chip--sindatos';
      default:
        return 'chip chip--paro';
    }
  });

  readonly etiqueta = computed(() => {
    const act = this.actividad();
    if (act) {
      return act.etiqueta;
    }
    switch (this.estado()) {
      case 'marcha':
        return 'En marcha';
      case 'incidencia':
        return this.causa() === 'paro-rotura-material'
          ? 'Paro por rotura de material'
          : 'Rotura de fleje';
      case 'cambio-bloque':
        return 'Cambio de lote';
      case 'sin-datos':
        return this.descansando() ? 'Descansando' : 'En pausa';
      default:
        return this.causa() === 'rotura-fleje' ? 'Rotura de fleje' : 'Parado';
    }
  });

  /** Texto explicativo del estado, mostrado al pasar el ratón sobre el chip. */
  readonly tooltip = computed(() => {
    const act = this.actividad();
    if (act) {
      return act.categoria === 'fin-jornada'
        ? 'Fin de jornada: el operario cerró el turno; la máquina descansa hasta la próxima actividad.'
        : `Parte de operario: ${act.etiqueta} (en los últimos 20 min).`;
    }
    switch (this.estado()) {
      case 'marcha':
        return 'La máquina está funcionando.';
      case 'incidencia':
        return this.causa() === 'paro-rotura-material'
          ? 'El telar se ha parado por rotura de material.'
          : 'Rotura del fleje registrada por el operario.';
      case 'cambio-bloque':
        return 'Cambio de bloque/lote en la bancada.';
      case 'sin-datos': {
        const min = this.inactivoMin();
        const tiempo = min != null ? formatDuracionMin(min) : null;
        return tiempo
          ? `Sin lecturas desde hace ${tiempo}.`
          : 'Sin lecturas recientes de la máquina.';
      }
      default:
        return this.causa() === 'rotura-fleje'
          ? 'Rotura del fleje registrada por el operario.'
          : 'La máquina está parada.';
    }
  });
}
