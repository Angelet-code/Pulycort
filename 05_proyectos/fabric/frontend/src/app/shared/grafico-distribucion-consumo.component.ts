import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Ilustración de cómo se detectan los consumos atípicos: la campana de las
 * lecturas de un telar con las colas que marcamos como aviso. Es un dibujo
 * conceptual (un telar de ejemplo que ronda los 60 kW); el motor real corta por
 * percentil sobre las lecturas de CADA telar, no por esta curva ideal. La cola
 * derecha es lo "raro": top 16 % = alto, top 2,3 % = inusual, top 0,13 % = muy
 * alto. Sin entradas: solo pinta.
 */
@Component({
  selector: 'fabric-grafico-distribucion-consumo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 680 360" role="img" aria-labelledby="dc-titulo dc-desc">
      <title id="dc-titulo">Distribución del consumo de un telar y las colas de aviso</title>
      <desc id="dc-desc">
        La mayoría de lecturas se agrupan en torno al consumo típico del telar; marcamos
        como atípico el consumo de la cola derecha: el 16 % más alto (alto), el 2,3 %
        (inusual) y el 0,13 % (muy alto). Ejemplo de un telar que ronda los 60 kW.
      </desc>

      <rect x="118" y="10" width="13" height="13" rx="3" fill="var(--amber)" opacity="0.5" />
      <text class="dc-soft" x="138" y="20">consumo alto (cola, top 16 %)</text>
      <rect x="372" y="10" width="13" height="13" rx="3" fill="var(--red)" opacity="0.55" />
      <text class="dc-soft" x="392" y="20">muy alto (top 0,13 %)</text>

      <path
        d="M420 280 L420 152.6 L440 183.9 L460 211.8 L480 234.6 L500 251.6 L520 263.3 L540 270.8 L560 275.2 L580 277.7 L580 280 Z"
        fill="var(--amber)"
        opacity="0.22"
      />
      <path
        d="M500 280 L500 251.6 L520 263.3 L540 270.8 L560 275.2 L580 277.7 L580 280 Z"
        fill="var(--red)"
        opacity="0.3"
      />

      <line class="dc-guia" x1="100" y1="277.7" x2="100" y2="280" />
      <line class="dc-guia" x1="180" y1="251.6" x2="180" y2="280" />
      <line class="dc-guia" x1="260" y1="152.6" x2="260" y2="280" />
      <line class="dc-guia" x1="420" y1="152.6" x2="420" y2="280" />
      <line class="dc-guia" x1="500" y1="251.6" x2="500" y2="280" />
      <line class="dc-guia" x1="580" y1="277.7" x2="580" y2="280" />
      <line class="dc-media" x1="340" y1="70" x2="340" y2="280" />

      <path
        class="dc-curva"
        d="M100 277.7 L120 275.2 L140 270.8 L160 263.3 L180 251.6 L200 234.6 L220 211.8 L240 183.9 L260 152.6 L280 121.5 L300 94.7 L320 76.5 L340 70 L360 76.5 L380 94.7 L400 121.5 L420 152.6 L440 183.9 L460 211.8 L480 234.6 L500 251.6 L520 263.3 L540 270.8 L560 275.2 L580 277.7"
      />

      <line class="dc-eje" x1="70" y1="280" x2="612" y2="280" />

      <text class="dc-main" x="340" y="200" text-anchor="middle">68 %</text>
      <text class="dc-soft" x="340" y="216" text-anchor="middle">dentro de lo normal (μ ± 1σ)</text>

      <text class="dc-amber" x="428" y="146">≈16 %</text>
      <text class="dc-red" x="508" y="244">≈2,3 %</text>
      <text class="dc-red" x="582" y="262" text-anchor="end">≈0,13 %</text>

      <text class="dc-lbl" x="100" y="297" text-anchor="middle">10</text>
      <text class="dc-lbl" x="180" y="297" text-anchor="middle">27</text>
      <text class="dc-lbl" x="260" y="297" text-anchor="middle">43</text>
      <text class="dc-main" x="340" y="297" text-anchor="middle">60</text>
      <text class="dc-lbl" x="420" y="297" text-anchor="middle">77</text>
      <text class="dc-lbl" x="500" y="297" text-anchor="middle">93</text>
      <text class="dc-lbl" x="580" y="297" text-anchor="middle">110</text>

      <text class="dc-soft" x="100" y="313" text-anchor="middle">μ−3σ</text>
      <text class="dc-soft" x="180" y="313" text-anchor="middle">μ−2σ</text>
      <text class="dc-soft" x="260" y="313" text-anchor="middle">μ−1σ</text>
      <text class="dc-soft" x="340" y="313" text-anchor="middle">media</text>
      <text class="dc-soft" x="420" y="313" text-anchor="middle">μ+1σ</text>
      <text class="dc-soft" x="500" y="313" text-anchor="middle">μ+2σ</text>
      <text class="dc-soft" x="580" y="313" text-anchor="middle">μ+3σ</text>

      <text class="dc-lbl" x="340" y="339" text-anchor="middle">
        consumo en marcha (kW) — ejemplo de un telar que ronda los 60 kW
      </text>
    </svg>
  `,
  styles: `
    :host {
      display: block;
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
    }
    .dc-curva {
      fill: none;
      stroke: var(--text);
      stroke-width: 2;
      stroke-linejoin: round;
    }
    .dc-eje {
      stroke: var(--text-muted);
      stroke-width: 1;
    }
    .dc-media {
      stroke: var(--text-muted);
      stroke-width: 1.5;
    }
    .dc-guia {
      stroke: var(--text-soft);
      stroke-width: 1;
      stroke-dasharray: 3 3;
    }
    text {
      font-family: inherit;
    }
    .dc-main {
      font-size: 13px;
      font-weight: 700;
      fill: var(--text);
    }
    .dc-lbl {
      font-size: 12px;
      fill: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }
    .dc-soft {
      font-size: 11.5px;
      fill: var(--text-soft);
    }
    .dc-amber {
      font-size: 12px;
      font-weight: 650;
      fill: var(--amber-text);
    }
    .dc-red {
      font-size: 12px;
      font-weight: 650;
      fill: var(--red-text);
    }
  `
})
export class GraficoDistribucionConsumoComponent {}
