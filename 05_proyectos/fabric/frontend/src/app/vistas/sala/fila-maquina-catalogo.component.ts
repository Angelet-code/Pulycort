import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FaseProduccion, MaquinaCatalogo } from '../../core/catalogo-maquinas';

/** Color de acento por fase de la cadena, en la línea del palette de telares. */
const ACENTO_FASE: Record<FaseProduccion, string> = {
  bloque: 'var(--blue)',
  tabla: 'var(--violet)',
  losa: 'var(--teal)'
};

const NOMBRE_FASE: Record<FaseProduccion, string> = {
  bloque: 'Bloque',
  tabla: 'Tabla',
  losa: 'Losa'
};

/**
 * Fila de máquina del catálogo de la nave, con el mismo lenguaje visual que la
 * fila de telar (`fila-maquina`): tarjeta horizontal con ícono de código,
 * nombre, meta y chip de estado; al desplegarla muestra sus parámetros
 * (unidad, fase, código) y su integración. A diferencia del telar no tiene
 * lectura en vivo, así que no inventa estado: los discos puente enlazan a sus
 * partes reales y el resto se marca «sin integrar».
 */
@Component({
  selector: 'fabric-fila-maquina-catalogo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="fila" [class.abierta]="abierta()" [style.--acento]="acento()">
      <button
        type="button"
        class="cabecera"
        [attr.aria-expanded]="abierta()"
        [attr.aria-controls]="'detalle-maquina-' + maquina().codigo"
        (click)="alternar.emit()"
      >
        <span class="icono" aria-hidden="true">{{ maquina().codigo }}</span>

        <span class="cuerpo">
          <span class="titulo-linea">
            <span class="nombre">{{ maquina().nombre }}</span>
          </span>
          <span class="meta">
            <span class="meta-unidad">{{ maquina().unidad }}</span>
            <span class="punto-sep" aria-hidden="true">·</span>
            <span class="meta-desc">{{ maquina().descripcion }}</span>
          </span>
        </span>

        <span class="estado">
          @if (conPartes()) {
            <span class="chip chip--cambio">
              <span class="punto" aria-hidden="true"></span>
              Con partes
            </span>
          } @else {
            <span class="chip chip--sindatos">
              <span class="punto" aria-hidden="true"></span>
              Sin integrar
            </span>
          }
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

      @if (abierta()) {
        <div class="detalle" [id]="'detalle-maquina-' + maquina().codigo">
          <div class="ficha">
            <span class="ficha-bloque">
              <span class="ficha-etiqueta">Unidad</span>
              <span class="ficha-valor num">{{ maquina().unidad }}</span>
            </span>
            <span class="punto-sep" aria-hidden="true">·</span>
            <span class="ficha-bloque">
              <span class="ficha-etiqueta">Fase</span>
              <span class="ficha-valor">{{ faseNombre() }}</span>
            </span>
            <span class="punto-sep" aria-hidden="true">·</span>
            <span class="ficha-bloque">
              <span class="ficha-etiqueta">Código</span>
              <span class="ficha-valor num">{{ maquina().codigo }}</span>
            </span>
          </div>

          <p class="nota">{{ nota() }}</p>

          @if (conPartes() && maquina().enlacePartes; as enlace) {
            <a class="enlace-detalle" [routerLink]="enlace">Ver sus partes →</a>
          }
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
      font-size: 18px;
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
    .meta-unidad {
      flex: none;
      font-weight: 700;
      color: var(--text-muted);
    }
    .meta-desc {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-weight: 600;
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

    /* ── Detalle desplegado ───────────────────────────────── */
    .detalle {
      display: flex;
      flex-direction: column;
      gap: 12px;
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
    .ficha {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 10px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--line);
    }
    .ficha-bloque {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
    }
    .ficha-etiqueta {
      font-size: 10.5px;
      font-weight: 650;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--text-soft);
    }
    .ficha-valor {
      font-size: 13px;
      font-weight: 700;
      color: var(--text);
    }
    .num {
      font-variant-numeric: tabular-nums;
    }
    .nota {
      margin: 0;
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--text-muted);
    }
    .enlace-detalle {
      align-self: flex-start;
      font-weight: 700;
      color: var(--acento);
      font-size: 12.5px;
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
    }
  `
})
export class FilaMaquinaCatalogoComponent {
  readonly maquina = input.required<MaquinaCatalogo>();
  readonly abierta = input(false);
  readonly alternar = output<void>();

  readonly acento = computed(() => ACENTO_FASE[this.maquina().fase]);
  readonly faseNombre = computed(() => NOMBRE_FASE[this.maquina().fase]);
  readonly conPartes = computed(() => this.maquina().integracion === 'con-partes');

  readonly nota = computed(() =>
    this.conPartes()
      ? 'Tiene partes de trabajo reales, pero todavía sin lectura de estado en vivo.'
      : 'Sin lectura en vivo todavía: pendiente de conectar su fuente de datos.'
  );
}
