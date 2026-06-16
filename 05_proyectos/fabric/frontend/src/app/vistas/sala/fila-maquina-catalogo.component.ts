import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FaseProduccion, MaquinaCatalogo } from '../../core/catalogo-maquinas';
import { CoberturaMaquina } from '../../core/models';
import { materialPorId } from '../../core/materiales';
import { formatRelativoFino } from '../../core/format';
import { RelojService } from '../../core/reloj.service';
import { EstadoChipComponent } from '../../shared/estado-chip.component';
import { MaterialDotComponent } from '../../shared/material-dot.component';
import { MetricaComponent } from '../../shared/metrica.component';

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
 * Cortes de frescura del último parte del disco puente: como no tiene estado en
 * vivo, su frescura se infiere de cuándo llegó el último parte, igual que la
 * última lectura de los telares — verde <10 min, ámbar <2 h, gris ≥2 h. Con la
 * frescura "fresca" (<10 min) la tarjeta dice "Cortando"; si no, "Último corte".
 */
const LECTURA_FRESCA_MIN = 10;
const LECTURA_TIBIA_MIN = 120;
/**
 * Minutos sin parte para que el disco puente deje de estar "En marcha" (badge) y
 * "Cortando" (2ª línea). Mismo umbral que los telares (1 h, UMBRAL_PAUSA_MS): por
 * debajo, "En marcha"/"Cortando"; por encima, el chip pasa a "En pausa" (y a
 * "Descansando" tras 24 h) y la 2ª línea a "Último corte".
 */
const SIN_SENAL_MIN = 60;

/**
 * Fila de máquina del catálogo de la nave, con el mismo lenguaje visual que la
 * fila de telar (`fila-maquina`): tarjeta horizontal con ícono de código,
 * nombre, meta y un valor a la derecha. A diferencia del telar no tiene lectura
 * en vivo, así que no inventa estado. El disco puente Gómez (único integrado) sí
 * enseña, como un telar, el material que corta (2ª línea) y sus m² de hoy (a la
 * derecha); el resto muestra unidad/descripción y su chip de integración.
 */
@Component({
  selector: 'fabric-fila-maquina-catalogo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MaterialDotComponent, MetricaComponent, EstadoChipComponent],
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
          @if (mostrarResumenDisco()) {
            <span class="meta">
              <span class="meta-corte">{{ etiquetaCorte() }}:</span>
              @if (materialId(); as mid) {
                <fabric-material-dot [materialId]="mid" [tam]="11" />
                <span class="meta-material">{{ materialNombre() }}</span>
              } @else {
                <span class="meta-soft">—</span>
              }
            </span>
          } @else {
            <span class="meta">
              <span class="meta-unidad">{{ maquina().unidad }}</span>
              <span class="punto-sep" aria-hidden="true">·</span>
              <span class="meta-desc">{{ maquina().descripcion }}</span>
            </span>
          }
        </span>

        <span class="estado">
          @if (mostrarResumenDisco()) {
            <span class="estado-top">
              <span
                class="m2-hoy"
                title="m² de entrada de los partes de hoy. La semántica de los m² del disco puente está pendiente de confirmar con TotWare; se muestra en crudo, no como rendimiento."
              >
                <span class="m2-cap">m² hoy</span>
                <fabric-metrica [valor]="m2Valor()" unidad="m²" [decimales]="1" [tam]="16" />
                <span class="m2-aviso" aria-label="pendiente de validar">⚠</span>
              </span>
              <fabric-estado-chip [estado]="estadoDisco()" [inactivoMin]="inactivoMin()" />
            </span>
            <span
              class="ultima-lectura soft"
              [class.fresca]="tonoLectura() === 'fresca'"
              [class.tibia]="tonoLectura() === 'tibia'"
              >{{ ultimaLecturaTexto() }}</span
            >
          } @else if (conPartes()) {
            <span
              class="chip chip--cambio"
              title="¡Paciencia! Pronto tendremos la información de esta máquina."
            >
              <span class="punto" aria-hidden="true"></span>
              Integrando
            </span>
          } @else {
            <span class="chip chip--sindatos" title="Sin fuente de datos conectada.">
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
    /* Disco puente Gómez: la 2ª línea es el material, como en la fila de telar. */
    .meta-corte {
      flex: none;
      font-weight: 700;
      color: var(--text-muted);
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
      color: var(--text);
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
    /* Columna derecha al estilo telar: m² de hoy arriba + última actividad. */
    .estado-top {
      display: inline-flex;
      align-items: center;
      gap: 9px;
    }
    .m2-hoy {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      cursor: help;
    }
    .m2-cap {
      flex: none;
      font-size: 10.5px;
      font-weight: 650;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--text-soft);
    }
    .m2-aviso {
      align-self: center;
      color: var(--amber);
      font-size: 11px;
    }
    /* "Hace cuánto" llegó el último parte: verde <10 min, ámbar <2 h, gris ≥2 h. */
    .ultima-lectura {
      font-size: 11px;
      white-space: nowrap;
    }
    .ultima-lectura.fresca {
      color: var(--green-text);
    }
    .ultima-lectura.tibia {
      color: var(--amber-text);
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
  private readonly reloj = inject(RelojService);

  readonly maquina = input.required<MaquinaCatalogo>();
  /** Cobertura real de la máquina (volumen/material); hoy solo aplica a Gómez. */
  readonly cobertura = input<CoberturaMaquina | null>(null);
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

  /** El resumen de partes solo se pinta en el disco puente integrado (Gómez). */
  readonly mostrarResumenDisco = computed(
    () =>
      this.conPartes() &&
      this.maquina().familia === 'disco_puente' &&
      this.cobertura() !== null
  );

  /** Id de material (string) del último parte, o null si no hay. */
  readonly materialId = computed(() => {
    const m = this.cobertura()?.ultimoMaterial;
    return m != null ? String(m) : null;
  });
  readonly materialNombre = computed(() => {
    const m = this.cobertura()?.ultimoMaterial;
    return m != null ? materialPorId(String(m)).nombre : '—';
  });
  /** m² de entrada de hoy; null (→ "—") si no hubo partes hoy. */
  readonly m2Valor = computed(() => this.cobertura()?.m2EntradaHoy ?? null);

  /**
   * "Cortando" si hay parte en los últimos SIN_SENAL_MIN; si no, "Último corte".
   * Mismo criterio que el badge (En marcha / Sin señal): el disco puente no tiene
   * estado en vivo, así que se infiere de la frescura del último parte.
   */
  readonly cortando = computed(() => {
    const minutos = this.minutosDesdeUltimoParte();
    return minutos !== null && minutos < SIN_SENAL_MIN;
  });
  readonly etiquetaCorte = computed(() => (this.cortando() ? 'Cortando' : 'Último corte'));

  /**
   * Estado para el badge, equivalente al de los telares: "En marcha" si hay parte
   * reciente (< SIN_SENAL_MIN), "Sin señal" si no. Derivado de la frescura del
   * parte (no hay marcha/paro en vivo del disco puente).
   */
  readonly estadoDisco = computed<'marcha' | 'sin-datos'>(() =>
    this.cortando() ? 'marcha' : 'sin-datos'
  );

  /** Minutos desde el último parte; el chip decide En pausa vs Descansando. */
  readonly inactivoMin = computed(() => this.minutosDesdeUltimoParte());

  /** Texto de frescura del último parte ("Último parte hace X"), como el telar. */
  readonly ultimaLecturaTexto = computed(() => {
    const f = this.cobertura()?.ultimaActividad;
    return f
      ? `Último parte ${formatRelativoFino(f, this.reloj.ahoraMs())}`
      : 'Sin partes registrados';
  });

  /** Tono de la frescura: verde <10 min, ámbar <2 h, gris ≥2 h o sin partes. */
  readonly tonoLectura = computed<'fresca' | 'tibia' | 'fria'>(() => {
    const minutos = this.minutosDesdeUltimoParte();
    if (minutos === null) {
      return 'fria';
    }
    if (minutos < LECTURA_FRESCA_MIN) {
      return 'fresca';
    }
    return minutos < LECTURA_TIBIA_MIN ? 'tibia' : 'fria';
  });

  /** Minutos desde el último parte de Gómez; null si no hay (o fecha futura). */
  private minutosDesdeUltimoParte(): number | null {
    const f = this.cobertura()?.ultimaActividad;
    if (!f) {
      return null;
    }
    const minutos = (this.reloj.ahoraMs() - new Date(f).getTime()) / 60_000;
    return minutos >= 0 ? minutos : null;
  }
}
