import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatNumero } from '../core/format';

const W = 640;
const H = 230;
const ML = 48;
const MR = 8;
const MT = 18;
const MB = 26;
const INNER_W = W - ML - MR;
const INNER_H = H - MT - MB;

export interface SegmentoBarra {
  valor: number;
  color: string;
  nombre?: string;
}

export interface BarraApilada {
  etiqueta: string;
  segmentos: SegmentoBarra[];
}

function techoBonito(max: number): { yMax: number; paso: number } {
  if (max <= 0) {
    return { yMax: 1, paso: 0.25 };
  }
  const crudo = max / 4;
  const magnitud = 10 ** Math.floor(Math.log10(crudo));
  const norma = crudo / magnitud;
  const factor = norma <= 1 ? 1 : norma <= 2 ? 2 : norma <= 5 ? 5 : 10;
  const paso = factor * magnitud;
  return { yMax: paso * Math.ceil(max / paso), paso };
}

/** Barras verticales apiladas (p. ej. m² por día con un segmento por telar). */
@Component({
  selector: 'fabric-grafico-barras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + ancho + ' ' + alto" class="grafico">
      @for (tick of ticksY(); track tick.valor) {
        <line
          [attr.x1]="margenIzq"
          [attr.x2]="ancho - margenDer"
          [attr.y1]="tick.y"
          [attr.y2]="tick.y"
          stroke="rgba(255,255,255,0.07)"
        />
        <text [attr.x]="margenIzq - 7" [attr.y]="tick.y + 3.5" text-anchor="end" class="texto-eje">
          {{ tick.etiqueta }}
        </text>
      }
      @for (barra of barrasPintadas(); track $index) {
        @for (seg of barra.segmentos; track $index) {
          <rect
            [attr.x]="barra.x"
            [attr.y]="seg.y"
            [attr.width]="anchoBarra()"
            [attr.height]="seg.alto"
            [attr.fill]="seg.color"
            rx="1.5"
          >
            <title>{{ seg.titulo }}</title>
          </rect>
        }
        @if (barra.totalEtiqueta) {
          <text
            [attr.x]="barra.x + anchoBarra() / 2"
            [attr.y]="barra.yTotal - 4"
            text-anchor="middle"
            class="texto-total"
          >
            {{ barra.totalEtiqueta }}
          </text>
        }
        @if (barra.etiqueta) {
          <text
            [attr.x]="barra.x + anchoBarra() / 2"
            [attr.y]="alto - 8"
            text-anchor="middle"
            class="texto-eje"
          >
            {{ barra.etiqueta }}
          </text>
        }
      }
      @if (unidad()) {
        <text [attr.x]="margenIzq" y="10" class="texto-eje">{{ unidad() }}</text>
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
    }
    .grafico {
      display: block;
      width: 100%;
    }
    .texto-eje {
      font-size: 11px;
      fill: var(--text-soft);
      font-variant-numeric: tabular-nums;
    }
    .texto-total {
      font-size: 10.5px;
      fill: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }
  `
})
export class GraficoBarrasComponent {
  readonly barras = input.required<BarraApilada[]>();
  readonly unidad = input('');
  /**
   * Pinta la etiqueta de TODAS las barras (no solo una de cada N). Útil cuando
   * cada barra es una entidad distinta —p. ej. una máquina— y la etiqueta corta
   * cabe en su hueco. Por defecto false: mantiene el muestreo del eje temporal.
   */
  readonly etiquetasCompletas = input(false);

  readonly ancho = W;
  readonly alto = H;
  readonly margenIzq = ML;
  readonly margenDer = MR;

  private readonly escala = computed(() => {
    const totales = this.barras().map((b) =>
      b.segmentos.reduce((suma, s) => suma + s.valor, 0)
    );
    return techoBonito(Math.max(1, ...totales));
  });

  readonly anchoBarra = computed(() => {
    const n = Math.max(1, this.barras().length);
    return Math.min(48, (INNER_W / n) * 0.62);
  });

  readonly ticksY = computed(() => {
    const { yMax, paso } = this.escala();
    const decimales = paso % 1 === 0 ? 0 : 2;
    const ticks: { valor: number; y: number; etiqueta: string }[] = [];
    for (let v = 0; v <= yMax + paso / 2; v += paso) {
      ticks.push({
        valor: v,
        y: MT + INNER_H - (v / yMax) * INNER_H,
        etiqueta: formatNumero(v, decimales)
      });
    }
    return ticks;
  });

  readonly barrasPintadas = computed(() => {
    const barras = this.barras();
    const { yMax } = this.escala();
    const n = Math.max(1, barras.length);
    const slot = INNER_W / n;
    const cadaEtiqueta = this.etiquetasCompletas() ? 1 : Math.ceil(n / 8);
    const conTotales = n <= 12;

    return barras.map((barra, i) => {
      const x = ML + slot * i + (slot - this.anchoBarra()) / 2;
      let acumulado = 0;
      const segmentos = barra.segmentos
        .filter((s) => s.valor > 0)
        .map((s) => {
          const alto = (s.valor / yMax) * INNER_H;
          acumulado += alto;
          return {
            y: MT + INNER_H - acumulado,
            alto,
            color: s.color,
            titulo: `${s.nombre ?? barra.etiqueta}: ${formatNumero(s.valor, 1)} ${this.unidad()}`
          };
        });
      const total = barra.segmentos.reduce((suma, s) => suma + s.valor, 0);
      return {
        x,
        segmentos,
        yTotal: MT + INNER_H - acumulado,
        totalEtiqueta: conTotales && total > 0 ? formatNumero(total) : '',
        etiqueta: i % cadaEtiqueta === 0 ? barra.etiqueta : ''
      };
    });
  });
}
