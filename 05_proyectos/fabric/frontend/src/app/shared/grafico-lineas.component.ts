import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PuntoSerie, SegmentoEstado, TipoIncidencia } from '../core/models';
import { formatHora, formatNumero } from '../core/format';

const W = 640;
const H = 220;
const ML = 48;
const MR = 10;
const MT = 10;
const MB = 24;
const INNER_W = W - ML - MR;
const INNER_H = H - MT - MB;

const COLOR_BANDA: Partial<Record<TipoIncidencia, string>> = {
  paro: 'rgba(243, 200, 106, 0.14)',
  'rotura-fleje': 'rgba(255, 95, 125, 0.16)',
  'cambio-bloque': 'rgba(79, 201, 222, 0.1)',
  // Rayado gris: tramo sin lectura fiable. La línea además se corta aquí.
  'sin-datos': 'url(#patron-sin-datos)'
};

export interface ProyeccionLinea {
  t1: string;
  v1: number;
  t2: string;
  v2: number;
}

function epoch(iso: string): number {
  return new Date(iso).getTime();
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

/**
 * Gráfico de líneas/área sobre un dominio temporal, con bandas de paro
 * sombreadas y proyección discontinua opcional (el cruce con 0 es el ETA).
 */
@Component({
  selector: 'fabric-grafico-lineas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + ancho + ' ' + alto" class="grafico">
      <defs>
        <pattern
          id="patron-sin-datos"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="6" height="6" fill="rgba(148,163,184,0.07)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(148,163,184,0.40)" stroke-width="1.3" />
        </pattern>
      </defs>
      @if (puntosVisibles().length >= 2) {
        <!-- bandas de incidencia -->
        @for (banda of bandasPintadas(); track $index) {
          <rect
            [attr.x]="banda.x"
            [attr.y]="margenTop"
            [attr.width]="banda.ancho"
            [attr.height]="altoInterior"
            [attr.fill]="banda.color"
          />
        }
        <!-- rejilla y eje Y -->
        @for (tick of ticksY(); track tick.valor) {
          <line
            [attr.x1]="margenIzq"
            [attr.x2]="ancho - margenDer"
            [attr.y1]="tick.y"
            [attr.y2]="tick.y"
            stroke="rgba(255,255,255,0.07)"
          />
          <text
            [attr.x]="margenIzq - 7"
            [attr.y]="tick.y + 3.5"
            text-anchor="end"
            class="texto-eje"
          >
            {{ tick.etiqueta }}
          </text>
        }
        <!-- eje X -->
        @for (tick of ticksX(); track tick.x) {
          <text [attr.x]="tick.x" [attr.y]="alto - 7" text-anchor="middle" class="texto-eje">
            {{ tick.etiqueta }}
          </text>
        }
        @if (area()) {
          <path [attr.d]="rutaArea()" [attr.fill]="color()" opacity="0.16" />
        }
        <path
          [attr.d]="rutaLinea()"
          fill="none"
          [attr.stroke]="color()"
          stroke-width="1.8"
          stroke-linejoin="round"
        />
        <!-- Lecturas aisladas entre huecos: como la línea se corta, se marcan
             con un punto para que no desaparezcan. -->
        @for (p of puntosSueltos(); track $index) {
          <circle [attr.cx]="p.cx" [attr.cy]="p.cy" r="1.9" [attr.fill]="color()" />
        }
        @if (rutaProyeccion(); as ruta) {
          <path
            [attr.d]="ruta"
            fill="none"
            stroke="var(--text-soft)"
            stroke-width="1.4"
            stroke-dasharray="5 4"
          />
        }
        @if (unidad()) {
          <text [attr.x]="margenIzq" y="9" class="texto-eje">{{ unidad() }}</text>
        }
      } @else {
        <text [attr.x]="ancho / 2" [attr.y]="alto / 2" text-anchor="middle" class="texto-vacio">
          Sin lecturas en este periodo
        </text>
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
    .texto-vacio {
      font-size: 13px;
      fill: var(--text-soft);
    }
  `
})
export class GraficoLineasComponent {
  readonly serie = input.required<PuntoSerie[]>();
  readonly desde = input.required<string>();
  readonly hasta = input.required<string>();
  readonly color = input('var(--blue)');
  readonly unidad = input('');
  readonly area = input(false);
  readonly yMaxFijo = input<number | null>(null);
  readonly bandas = input<SegmentoEstado[]>([]);
  readonly proyeccion = input<ProyeccionLinea | null>(null);

  readonly ancho = W;
  readonly alto = H;
  readonly margenIzq = ML;
  readonly margenDer = MR;
  readonly margenTop = MT;
  readonly altoInterior = INNER_H;

  private readonly dominio = computed(() => {
    const d0 = epoch(this.desde());
    const d1 = Math.max(epoch(this.hasta()), d0 + 60_000);
    return { d0, d1, span: d1 - d0 };
  });

  readonly puntosVisibles = computed(() => {
    const { d0, d1 } = this.dominio();
    return this.serie().filter((p) => {
      const t = epoch(p.t);
      return t >= d0 && t <= d1;
    });
  });

  private readonly escalaY = computed(() => {
    const fijo = this.yMaxFijo();
    if (fijo !== null) {
      return { yMax: fijo, paso: fijo / 4 };
    }
    const max = Math.max(1, ...this.puntosVisibles().map((p) => p.v));
    return techoBonito(max);
  });

  private x(t: number): number {
    const { d0, span } = this.dominio();
    return ML + ((t - d0) / span) * INNER_W;
  }

  private y(v: number): number {
    const { yMax } = this.escalaY();
    return MT + INNER_H - (Math.max(0, Math.min(yMax, v)) / yMax) * INNER_H;
  }

  /**
   * Puntos partidos en tramos: se corta allí donde cae una banda 'sin-datos'
   * (hueco mayor que la cadencia). Así la línea no cruza el hueco inventando
   * una tendencia que no existe; el agujero queda visible y rayado.
   */
  private readonly tramos = computed<PuntoSerie[][]>(() => {
    const puntos = this.puntosVisibles();
    const huecos = this.bandas()
      .filter((b) => b.incidencia === 'sin-datos')
      .map((b) => [epoch(b.desde), epoch(b.hasta)] as const);
    const tramos: PuntoSerie[][] = [];
    let actual: PuntoSerie[] = [];
    for (let i = 0; i < puntos.length; i++) {
      if (i > 0) {
        const a = epoch(puntos[i - 1].t);
        const b = epoch(puntos[i].t);
        if (huecos.some(([g0, g1]) => g0 < b && g1 > a)) {
          tramos.push(actual);
          actual = [];
        }
      }
      actual.push(puntos[i]);
    }
    if (actual.length) {
      tramos.push(actual);
    }
    return tramos;
  });

  private coords(tramo: PuntoSerie[]): string {
    return tramo.map((p) => `${this.x(epoch(p.t)).toFixed(1)},${this.y(p.v).toFixed(1)}`).join(' L');
  }

  readonly rutaLinea = computed(() =>
    this.tramos()
      .filter((t) => t.length >= 2)
      .map((t) => `M${this.coords(t)}`)
      .join(' ')
  );

  /** Centro de cada lectura aislada (tramo de un solo punto), para pintarla como punto. */
  readonly puntosSueltos = computed(() =>
    this.tramos()
      .filter((t) => t.length === 1)
      .map((t) => ({ cx: this.x(epoch(t[0].t)), cy: this.y(t[0].v) }))
  );

  readonly rutaArea = computed(() => {
    const base = MT + INNER_H;
    return this.tramos()
      .filter((t) => t.length >= 2)
      .map((t) => {
        const x0 = this.x(epoch(t[0].t)).toFixed(1);
        const x1 = this.x(epoch(t[t.length - 1].t)).toFixed(1);
        return `M${x0},${base} L${this.coords(t)} L${x1},${base} Z`;
      })
      .join(' ');
  });

  readonly rutaProyeccion = computed(() => {
    const proyeccion = this.proyeccion();
    if (!proyeccion) {
      return null;
    }
    const a = `${this.x(epoch(proyeccion.t1)).toFixed(1)},${this.y(proyeccion.v1).toFixed(1)}`;
    const b = `${this.x(epoch(proyeccion.t2)).toFixed(1)},${this.y(proyeccion.v2).toFixed(1)}`;
    return `M${a} L${b}`;
  });

  readonly ticksY = computed(() => {
    const { yMax, paso } = this.escalaY();
    const decimales = paso % 1 === 0 ? 0 : 2;
    const ticks: { valor: number; y: number; etiqueta: string }[] = [];
    for (let v = 0; v <= yMax + paso / 2; v += paso) {
      ticks.push({ valor: v, y: this.y(v), etiqueta: formatNumero(v, decimales) });
    }
    return ticks;
  });

  readonly ticksX = computed(() => {
    const { d0, d1, span } = this.dominio();
    const horas = span / 3_600_000;
    const opciones = [1, 2, 3, 4, 6, 12];
    const crudo = horas / 6;
    const pasoH = opciones.find((o) => o >= crudo) ?? 24;
    const pasoMs = pasoH * 3_600_000;
    const primera = Math.ceil(d0 / pasoMs) * pasoMs;
    const ticks: { x: number; etiqueta: string }[] = [];
    for (let t = primera; t <= d1; t += pasoMs) {
      ticks.push({ x: this.x(t), etiqueta: formatHora(new Date(t).toISOString()) });
    }
    return ticks;
  });

  readonly bandasPintadas = computed(() => {
    const { d0, d1 } = this.dominio();
    return this.bandas()
      .map((banda) => {
        const desde = Math.max(epoch(banda.desde), d0);
        const hasta = Math.min(epoch(banda.hasta), d1);
        return { banda, desde, hasta };
      })
      .filter(({ banda, desde, hasta }) => hasta > desde && COLOR_BANDA[banda.incidencia])
      .map(({ banda, desde, hasta }) => ({
        x: this.x(desde),
        ancho: Math.max(1, this.x(hasta) - this.x(desde)),
        color: COLOR_BANDA[banda.incidencia] as string
      }));
  });
}
