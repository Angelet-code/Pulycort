import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SnapshotTelar } from '../../core/models';
import { materialPorId } from '../../core/materiales';
import {
  formatDuracionMin,
  formatEta,
  formatMedidasCm,
  formatNumero,
  formatRelativo
} from '../../core/format';
import { RelojService } from '../../core/reloj.service';
import { EstadoChipComponent } from '../../shared/estado-chip.component';
import { MaterialDotComponent } from '../../shared/material-dot.component';
import { MetricaComponent } from '../../shared/metrica.component';
import { BarraProgresoComponent } from '../../shared/barra-progreso.component';
import { SparklineComponent } from '../../shared/sparkline.component';
import { DataBadgeComponent } from '../../shared/data-badge.component';

/**
 * Fila de máquina de la lista de telares: en reposo enseña lo justo (estado,
 * lote, avance); al desplegarla muestra el detalle vivo (métricas de la última
 * lectura, sparkline de potencia, operarios y el enlace a la vista completa).
 * Inspirada en la lista de apps: filas limpias que se abren en su sitio.
 */
@Component({
  selector: 'fabric-fila-maquina',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    EstadoChipComponent,
    MaterialDotComponent,
    MetricaComponent,
    BarraProgresoComponent,
    SparklineComponent,
    DataBadgeComponent
  ],
  template: `
    <div
      class="fila"
      [class.abierta]="abierta()"
      [style.--acento]="'var(--t' + telar().telarId + ')'"
    >
      <button
        type="button"
        class="cabecera"
        [attr.aria-expanded]="abierta()"
        [attr.aria-controls]="'detalle-telar-' + telar().telarId"
        (click)="alternar.emit()"
      >
        <span class="icono" aria-hidden="true">{{ telar().telarId }}</span>

        <span class="cuerpo">
          <span class="titulo-linea">
            <span class="nombre">{{ telar().nombre }}</span>
            @if (telar().datosSospechosos) {
              <fabric-data-badge
                [sospechosa]="true"
                [motivos]="['Hay lecturas en cuarentena en las últimas 24 h (ver Salud → Cuarentena)']"
              />
            }
          </span>
          @if (telar().bloque; as bloque) {
            <span class="meta">
              <fabric-material-dot [materialId]="bloque.materialId" [tam]="11" />
              <span class="meta-material">{{ nombreMaterial() }}</span>
            </span>
          } @else {
            <span class="meta meta-soft">Sin lote en la bancada</span>
          }
        </span>

        <span class="estado">
          <span class="estado-resumen" [class]="'tono-' + tonoResumen()">{{ resumenEstado() }}</span>
          <fabric-estado-chip [estado]="telar().estado" [causa]="telar().causaParo" />
        </span>

        <span class="chevron" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="15" height="15">
            <path
              d="M4 6.5 8 10.5 12 6.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
      </button>

      @if (telar().progresoPct !== null) {
        <div class="barra-reposo" [style.width.%]="pctSeguro()" [style.background]="colorProgreso()"></div>
      }

      @if (abierta()) {
        <div class="detalle" [id]="'detalle-telar-' + telar().telarId">
          @if (telar().bloque; as bloque) {
            <div class="ficha-lote">
              <span class="ficha-etiqueta">PM/lote</span>
              <span class="ficha-pm num">{{ bloque.pmLote }}</span>
              @if (medidasFabrica(); as m) {
                <span class="punto-sep" aria-hidden="true">·</span>
                <span class="ficha-medidas num">{{ m }}</span>
              }
            </div>
            <div class="avance">
              <div class="avance-cabecera">
                <fabric-metrica
                  [valor]="telar().progresoPct"
                  unidad="%"
                  [decimales]="1"
                  [tam]="22"
                />
                <span class="muted eta">{{ etaLarga() }}</span>
              </div>
              <fabric-barra-progreso [pct]="telar().progresoPct" [color]="colorProgreso()" />
            </div>
          }

          <div class="micro-metricas">
            <div class="micro">
              <span class="micro-etiqueta">Golpes</span>
              <fabric-metrica [valor]="lectura()?.golpesPorMinuto" unidad="golpes/min" [tam]="16" />
            </div>
            <div class="micro">
              <span class="micro-etiqueta">Potencia</span>
              <fabric-metrica [valor]="lectura()?.potenciaKw" unidad="kW" [tam]="16" />
            </div>
            <div class="micro">
              <span class="micro-etiqueta">Descenso</span>
              <span class="descenso">
                <fabric-metrica [valor]="lectura()?.velocidadMmH" unidad="mm/h" [tam]="16" />
                @if (desvioTexto(); as desvio) {
                  <span class="desvio" [title]="ritmoRealTexto()">{{ desvio }}</span>
                }
              </span>
            </div>
          </div>

          <div class="spark">
            <span class="micro-etiqueta">Potencia · últimas 2 h</span>
            <fabric-sparkline
              [puntos]="telar().seriePotencia"
              [yMax]="76"
              [color]="'var(--t' + telar().telarId + ')'"
            />
          </div>

          <div class="pie">
            <span class="operarios muted">{{ operariosTexto() }}</span>
            <span class="separa">
              <span class="ultima soft">{{ ultimaLecturaTexto() }}</span>
              <a class="enlace-detalle" [routerLink]="['/telares', telar().telarId]">
                Ver telar completo →
              </a>
            </span>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .fila {
      position: relative;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius-row);
      box-shadow: var(--shadow-soft);
      backdrop-filter: blur(var(--blur-soft));
      overflow: hidden;
      transition: border-color 0.18s ease, background 0.18s ease;
    }
    .fila::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: var(--acento);
      opacity: 0;
      transition: opacity 0.18s ease;
    }
    .fila:hover {
      border-color: var(--line-strong);
    }
    .fila.abierta {
      background: var(--surface-strong);
      border-color: var(--line-strong);
    }
    .fila.abierta::before {
      opacity: 1;
    }

    .cabecera {
      display: flex;
      align-items: center;
      gap: 14px;
      width: 100%;
      border: none;
      background: transparent;
      color: inherit;
      text-align: left;
      padding: 12px 16px;
      min-height: 64px;
    }
    .cabecera:hover {
      background: var(--surface-soft);
    }

    .icono {
      flex: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 42px;
      height: 42px;
      border-radius: 12px;
      font-size: 19px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: var(--acento);
      background: color-mix(in srgb, var(--acento) 18%, transparent);
      border: 1px solid color-mix(in srgb, var(--acento) 42%, transparent);
    }
    .cuerpo {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
      flex: 1 1 auto;
    }
    .titulo-linea {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .nombre {
      font-size: 15.5px;
      font-weight: 750;
      letter-spacing: 0.01em;
    }
    .meta {
      display: flex;
      align-items: center;
      gap: 7px;
      font-family: var(--font-mono);
      font-size: 12px;
      letter-spacing: -0.01em;
      min-width: 0;
    }
    .meta fabric-material-dot {
      flex: none;
    }
    .meta-material {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-weight: 650;
      color: var(--text-muted);
    }
    .meta-soft {
      flex: none;
      white-space: nowrap;
      color: var(--text-soft);
    }
    .punto-sep {
      flex: none;
      color: var(--text-soft);
    }

    .estado {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 5px;
      flex: none;
      text-align: right;
      align-self: flex-start;
    }
    .estado-resumen {
      font-size: 12px;
      font-weight: 650;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .estado-resumen.tono-ok {
      color: var(--green-text);
    }
    .estado-resumen.tono-aviso {
      color: var(--amber-text);
    }
    .estado-resumen.tono-mal {
      color: var(--red-text);
    }

    .chevron {
      flex: none;
      align-self: flex-start;
      display: inline-flex;
      color: var(--text-soft);
      transition: transform 0.22s ease, color 0.18s ease;
    }
    .fila.abierta .chevron {
      transform: rotate(180deg);
      color: var(--text-muted);
    }

    .barra-reposo {
      position: absolute;
      left: 0;
      bottom: 0;
      height: 3px;
      max-width: 100%;
      border-radius: 0 3px 3px 0;
      transition: width 0.6s ease;
    }
    .fila.abierta .barra-reposo {
      display: none;
    }

    /* ── Detalle desplegado ───────────────────────────────── */
    .detalle {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 4px 16px 16px;
      animation: abrir 0.22s ease;
    }
    @keyframes abrir {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .ficha-lote {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 8px;
      font-family: var(--font-mono);
      font-size: 12.5px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--line);
    }
    .ficha-etiqueta {
      font-family: var(--font-sans, inherit);
      font-size: 10.5px;
      font-weight: 650;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--text-soft);
    }
    .ficha-pm {
      font-weight: 700;
      color: var(--text);
    }
    .ficha-medidas {
      color: var(--text-soft);
    }
    .num {
      font-variant-numeric: tabular-nums;
    }
    .avance {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .avance-cabecera {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
    }
    .eta {
      font-size: 12.5px;
    }
    .micro-metricas {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .micro {
      display: flex;
      flex-direction: column;
      gap: 2px;
      background: var(--surface-soft);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 8px 10px;
      min-width: 0;
    }
    .micro-etiqueta {
      font-size: 10.5px;
      font-weight: 650;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--text-soft);
    }
    .descenso {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
    }
    .desvio {
      font-size: 11.5px;
      font-weight: 700;
      color: var(--amber);
    }
    .spark {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .pie {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      font-size: 12px;
      padding-top: 2px;
    }
    .separa {
      display: inline-flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }
    .enlace-detalle {
      font-weight: 700;
      color: var(--acento);
      white-space: nowrap;
    }
    .enlace-detalle:hover {
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    @media (max-width: 560px) {
      .cabecera {
        gap: 10px;
        padding: 12px 14px;
      }
      .estado-resumen {
        display: none;
      }
    }
  `
})
export class FilaMaquinaComponent {
  private readonly reloj = inject(RelojService);

  readonly telar = input.required<SnapshotTelar>();
  readonly abierta = input(false);
  readonly alternar = output<void>();

  readonly lectura = computed(() => this.telar().ultimaLectura);

  readonly nombreMaterial = computed(() => materialPorId(this.telar().bloque?.materialId).nombre);

  readonly medidasFabrica = computed(() => {
    const medidas = this.telar().bloque?.medidasFabrica;
    return medidas ? formatMedidasCm(medidas.largoCm, medidas.altoCm, medidas.gruesoCm) : '';
  });

  readonly pctSeguro = computed(() => Math.max(0, Math.min(100, this.telar().progresoPct ?? 0)));

  /** Resumen de estado de una línea para la fila en reposo. */
  readonly resumenEstado = computed(() => {
    const telar = this.telar();
    const ahora = this.reloj.ahoraMs();
    switch (telar.estado) {
      case 'marcha': {
        const pct = telar.progresoPct !== null ? `${formatNumero(telar.progresoPct)} %` : '';
        const eta = telar.etaFinCorte ? `termina ${formatEta(telar.etaFinCorte, ahora)}` : '';
        return [pct, eta].filter(Boolean).join(' · ') || 'En marcha';
      }
      case 'paro':
      case 'incidencia':
        return telar.estadoDesde ? `Parado ${minutosDesde(telar.estadoDesde, ahora)}` : 'En paro';
      case 'cambio-bloque':
        return 'Preparando la bancada';
      default:
        return 'Sin señal de la máquina';
    }
  });

  /** Color del resumen según gravedad del estado. */
  readonly tonoResumen = computed<'' | 'ok' | 'aviso' | 'mal'>(() => {
    switch (this.telar().estado) {
      case 'marcha':
        return 'ok';
      case 'incidencia':
        return 'mal';
      case 'paro':
        return 'aviso';
      default:
        return '';
    }
  });

  readonly etaLarga = computed(() => {
    const telar = this.telar();
    const ahora = this.reloj.ahoraMs();
    switch (telar.estado) {
      case 'marcha':
        return telar.etaFinCorte ? `Termina ~${formatEta(telar.etaFinCorte, ahora)}` : 'En marcha';
      case 'paro':
      case 'incidencia':
        return telar.estadoDesde ? `En paro ${minutosDesde(telar.estadoDesde, ahora)}` : 'En paro';
      case 'cambio-bloque':
        return 'Preparando la bancada';
      default:
        return 'Sin señal de la máquina';
    }
  });

  readonly colorProgreso = computed(() => {
    switch (this.telar().estado) {
      case 'incidencia':
        return 'linear-gradient(90deg, var(--red), var(--amber))';
      case 'paro':
        return 'linear-gradient(90deg, var(--amber), var(--stone))';
      default:
        return 'linear-gradient(90deg, var(--teal), var(--green))';
    }
  });

  readonly desvioTexto = computed(() => {
    const desvio = this.telar().desvioRitmo;
    if (!desvio || Math.abs(desvio.desvioPct) <= 10 || this.telar().estado !== 'marcha') {
      return null;
    }
    const flecha = desvio.desvioPct > 0 ? '↑' : '↓';
    return `${flecha} ${formatNumero(Math.abs(desvio.desvioPct))} %`;
  });

  readonly ritmoRealTexto = computed(() => {
    const desvio = this.telar().desvioRitmo;
    return desvio ? `${formatNumero(desvio.realMmH)} mm/h frente a consigna` : '';
  });

  readonly operariosTexto = computed(() => {
    const telar = this.telar();
    if (!telar.operario1 && !telar.operario2) {
      return 'Marcha automática · sin operarios registrados';
    }
    return [telar.operario1, telar.operario2]
      .filter(Boolean)
      .map((nombre) => abreviar(nombre as string))
      .join(' · ');
  });

  readonly ultimaLecturaTexto = computed(() => {
    const lectura = this.lectura();
    return lectura ? `Lectura ${formatRelativo(lectura.recibidaEn, this.reloj.ahoraMs())}` : '';
  });
}

function minutosDesde(iso: string, ahora: number): string {
  const minutos = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60_000));
  return `desde hace ${formatDuracionMin(minutos)}`;
}

function abreviar(nombre: string): string {
  const partes = nombre.split(' ').filter(Boolean);
  if (partes.length <= 1) {
    return nombre;
  }
  return `${partes[0].charAt(0)}. ${partes.slice(1, 3).join(' ')}`;
}
