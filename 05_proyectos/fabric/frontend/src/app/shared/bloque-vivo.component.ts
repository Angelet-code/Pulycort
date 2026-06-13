import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Bloque } from '../core/models';
import { materialPorId } from '../core/materiales';
import { formatNumero } from '../core/format';
import { ESPESOR_TABLA_CM, KERF_FLEJE_CM } from '../core/dominio';

const PAD_X = 18;
const PAD_TOP = 22;
const PAD_BOTTOM = 14;

/**
 * Bloque Vivo: sección transversal a escala (grueso × alto) del bloque en el
 * telar. La línea del bastidor desciende con el corte; por encima quedan las
 * tablas ya cortadas con el kerf del fleje visible. Convierte la columna
 * "altura actual" del sistema viejo en algo que se entiende a 10 metros.
 */
@Component({
  selector: 'fabric-bloque-vivo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="viewBox()" class="bloque-svg">
      <!-- bancada -->
      <rect
        [attr.x]="padX() - 12"
        [attr.y]="altoCm() + padTop()"
        [attr.width]="anchoCm() + 24"
        height="7"
        rx="2.5"
        fill="rgba(255,255,255,0.09)"
      />
      <!-- postes del bastidor -->
      <rect [attr.x]="padX() - 9" y="6" width="2.4" [attr.height]="bastidorY() - 6" fill="rgba(255,255,255,0.22)" />
      <rect [attr.x]="padX() + anchoCm() + 6.6" y="6" width="2.4" [attr.height]="bastidorY() - 6" fill="rgba(255,255,255,0.22)" />

      <!-- hueco del corte (lo ya aserrado, de fondo oscuro) -->
      @if (cortadoCm() > 0.4) {
        <rect
          [attr.x]="padX()"
          [attr.y]="padTop()"
          [attr.width]="anchoCm()"
          [attr.height]="cortadoCm()"
          fill="rgba(0, 0, 0, 0.5)"
        />
        <!-- tablas naciendo, separadas por el kerf del fleje -->
        @for (tabla of tablas(); track $index) {
          <rect
            [attr.x]="padX() + tabla"
            [attr.y]="padTop()"
            [attr.width]="espesorCm"
            [attr.height]="cortadoCm()"
            [attr.fill]="material().color"
            [attr.opacity]="$index % 2 === 0 ? 0.92 : 0.74"
          />
        }
      }

      <!-- piedra aún maciza -->
      <rect
        [attr.x]="padX()"
        [attr.y]="bastidorY()"
        [attr.width]="anchoCm()"
        [attr.height]="macizoCm()"
        [attr.fill]="material().color"
        [attr.stroke]="material().colorBorde"
        stroke-width="0.8"
      />

      <!-- línea del bastidor con los flejes -->
      <rect
        class="fleje"
        [class.cortando]="enMarcha()"
        [attr.x]="padX() - 9"
        [attr.y]="bastidorY() - 1"
        [attr.width]="anchoCm() + 18"
        height="2"
        rx="1"
        fill="#dce6f5"
      />

      <!-- rótulo de altura restante -->
      <text
        [attr.x]="padX() + anchoCm() / 2"
        y="13"
        text-anchor="middle"
        [attr.font-size]="tamFuente()"
        fill="var(--text-muted)"
        font-weight="600"
      >
        Quedan {{ alturaTexto() }} mm
      </text>
    </svg>
  `,
  styles: `
    :host {
      display: block;
    }
    .bloque-svg {
      display: block;
      width: 100%;
      max-height: 340px;
      margin: 0 auto;
    }
    .fleje.cortando {
      animation: brillo-fleje 1.6s ease-in-out infinite;
    }
    @keyframes brillo-fleje {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.55;
      }
    }
  `
})
export class BloqueVivoComponent {
  readonly bloque = input.required<Bloque>();
  readonly alturaInicialMm = input.required<number>();
  readonly alturaActualMm = input.required<number>();
  readonly enMarcha = input(false);

  readonly espesorCm = ESPESOR_TABLA_CM;

  readonly material = computed(() => materialPorId(this.bloque().materialId));
  readonly anchoCm = computed(() => this.bloque().medidasFabrica.gruesoCm);
  readonly altoCm = computed(() => this.bloque().medidasFabrica.altoCm);

  padX(): number {
    return PAD_X;
  }

  padTop(): number {
    return PAD_TOP;
  }

  readonly viewBox = computed(
    () => `0 0 ${this.anchoCm() + PAD_X * 2} ${this.altoCm() + PAD_TOP + PAD_BOTTOM}`
  );

  /** Profundidad ya cortada, en cm de bloque. */
  readonly cortadoCm = computed(() => {
    const cortadoMm = this.alturaInicialMm() - this.alturaActualMm();
    return Math.max(0, Math.min(this.altoCm(), cortadoMm / 10));
  });

  readonly macizoCm = computed(() => this.altoCm() - this.cortadoCm());
  readonly bastidorY = computed(() => PAD_TOP + this.cortadoCm());

  /** Offsets X de cada tabla dentro del bloque (espesor + kerf). */
  readonly tablas = computed(() => {
    const offsets: number[] = [];
    const paso = ESPESOR_TABLA_CM + KERF_FLEJE_CM;
    for (let x = KERF_FLEJE_CM; x + ESPESOR_TABLA_CM <= this.anchoCm(); x += paso) {
      offsets.push(x);
    }
    return offsets;
  });

  readonly tamFuente = computed(() => Math.max(9, this.altoCm() * 0.062));

  readonly alturaTexto = computed(() =>
    formatNumero(Math.max(0, Math.round(this.alturaActualMm())))
  );
}
