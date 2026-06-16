import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Sello de calidad del dato, con tres estados:
 *  - ✓ verificada (verde): sin problemas.
 *  - ! con avisos (ámbar): algo pinta raro pero la lectura es real y SIGUE
 *    contando en los KPIs (`alertas`).
 *  - ✕ descartada (rojo): dato inservible, fuera de los KPIs (`sospechosa`).
 *
 * Las marcas se dibujan como SVG (mismo viewBox, mismo grosor de trazo, mismo
 * tamaño) para que los tres sellos sean idénticos en todas las plataformas —
 * con glifos de fuente cada sistema los renderiza a un tamaño distinto. Los
 * motivos (descarte) o las alertas (aviso) viajan en el tooltip; los datos
 * malos se señalan, nunca se ocultan.
 */
@Component({
  selector: 'fabric-data-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="sello"
      [class.es-mal]="sospechosa()"
      [class.es-aviso]="!sospechosa() && alertas().length > 0"
      role="img"
      [attr.aria-label]="titulo()"
      [title]="titulo()"
    >
      @switch (estado()) {
        @case ('mal') {
          <svg class="marca" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M4 4 L10 10" />
            <path d="M10 4 L4 10" />
          </svg>
        }
        @case ('aviso') {
          <svg class="marca" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 3 L7 8" />
            <path d="M7 11 L7 11" />
          </svg>
        }
        @default {
          <svg class="marca" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3.4 7.4 L6 10 L10.6 4.2" />
          </svg>
        }
      }
    </span>
  `,
  styles: `
    .sello {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: var(--radius-sm);
      vertical-align: middle;
      color: var(--green);
      background: rgba(53, 217, 157, 0.12);
      border: 1px solid rgba(53, 217, 157, 0.3);
      cursor: default;
    }
    .marca {
      width: 11px;
      height: 11px;
      display: block;
    }
    .marca path {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .sello.es-aviso {
      color: var(--amber);
      background: rgba(243, 200, 106, 0.13);
      border-color: rgba(243, 200, 106, 0.4);
    }
    .sello.es-mal {
      color: var(--red);
      background: rgba(232, 110, 110, 0.13);
      border-color: rgba(232, 110, 110, 0.4);
    }
  `
})
export class DataBadgeComponent {
  /** Lectura descartada (fuera de KPIs). Tiene prioridad sobre los avisos. */
  readonly sospechosa = input.required<boolean>();
  /** Motivos del descarte (tooltip cuando `sospechosa`). */
  readonly motivos = input<string[]>([]);
  /** Avisos que NO descartan la lectura (tooltip cuando hay y no es sospechosa). */
  readonly alertas = input<string[]>([]);

  readonly estado = computed<'ok' | 'aviso' | 'mal'>(() => {
    if (this.sospechosa()) {
      return 'mal';
    }
    return this.alertas().length > 0 ? 'aviso' : 'ok';
  });

  readonly titulo = computed(() => {
    if (this.sospechosa()) {
      return this.motivos().join(' · ') || 'Lectura descartada';
    }
    if (this.alertas().length > 0) {
      return this.alertas().join(' · ');
    }
    return 'Lectura verificada';
  });
}
