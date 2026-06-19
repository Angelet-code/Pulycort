import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FabricApi } from '../../core/fabric-api';
import { FuenteDatos, FuenteDatosService } from '../../core/fuente-datos.service';
import { formatNumero, formatValorUnidad } from '../../core/format';
import { materialPorNombre } from '../../core/materiales';
import { RectTreemap, squarify, tintaSobre } from '../../core/treemap';
import {
  FormaInventario,
  InventarioVistaConjunta,
  ResumenInventario,
  ResumenMaterial
} from '../../core/models';
import { MaterialDotComponent } from '../../shared/material-dot.component';

const REFRESCO_MS = 60_000;

/** Lienzo del treemap en unidades del viewBox (el SVG escala al ancho real). */
const VB_W = 1000;
const VB_H = 620;
/** Separación entre cuadros: deja ver el fondo y redondea esquinas (no es borde). */
const GAP = 5;
/** Radio de esquina de cada cuadro (unidades del viewBox). */
const RX = 13;

const ETIQUETA_FORMA: Record<FormaInventario, string> = {
  bloques: 'Bloques',
  tablas: 'Tablas',
  losas: 'Losas'
};

/** Una forma con el dato del material seleccionado, para el nivel 2 (desglose). */
type DesgloseForma = {
  forma: FormaInventario;
  unidad: string;
  pendiente: boolean;
  mat: ResumenMaterial | null;
};

/**
 * Etiqueta de un rectángulo del treemap, centrada (nombre + valor debajo, al
 * estilo WinDirStat), con el cuerpo de letra adaptado a su tamaño: el nombre
 * solo se pinta si cabe entero a un cuerpo legible (si no, se oculta y queda el
 * tooltip) — así nunca se corta. `cx` es el centro horizontal del cuadro.
 */
type EtiquetaTile = {
  /** Nombre en 1 o 2 líneas (vacío si el cuadro es demasiado pequeño). */
  lineas: string[];
  nombreFs: number;
  /** Baseline de la primera línea del nombre. */
  nombreY: number;
  /** Alto de línea (para desplazar la 2ª línea). */
  lineH: number;
  valor: string;
  valorFs: number;
  valorY: number;
  cx: number;
};

/**
 * Rectángulo del treemap con su caja de dibujo (encogida por GAP para dejar el
 * fondo entre cuadros) y su etiqueta ya calculada.
 */
type TileEtiquetado = RectTreemap<ResumenMaterial> & {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  etq: EtiquetaTile;
};

/**
 * Mapa de existencias del inventario (treemap tipo WinDirStat): cada material es
 * un rectángulo cuyo tamaño es su proporción del total. El filtro de arriba
 * elige la forma —Bloques (m³), Tablas o Losas (m²)— y un clic en un material
 * abre el nivel 2: ese material desglosado por forma.
 *
 * Las tres formas tienen fuente real en modo Real: Bloques (m³, del stock REAL de
 * Odoo `stock_lot` on-hand vía `stock_quant`), Tablas (m², stock on-hand + altas de
 * `lot_tables_creation` + aserrado pendiente de Odoo desde partes de paquetes) y
 * Losas (m², stock on-hand + altas de `lot_slabs_creation`).
 * En Demo la simulación aún no modela losas → esa forma llega `pendiente`. Toda la
 * agregación la hace el backend/mock; aquí solo se dibuja, con su unidad al lado.
 */
@Component({
  selector: 'fabric-inventario-mapa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialDotComponent, RouterLink],
  template: `
    <section>
      <div class="barra">
        @if (materialSel(); as sel) {
          <div class="ruta">
            <button type="button" class="volver" (click)="cerrarDetalle()">‹ Inventario</button>
            <fabric-material-dot [nombre]="sel" [tam]="12" />
            <b class="ruta-mat">{{ sel }}</b>
            <span class="soft">desglose por forma</span>
          </div>
        } @else {
          <nav class="subpestanas" role="tablist" aria-label="Forma de existencia">
            @for (f of formas(); track f.forma) {
              <button
                type="button"
                role="tab"
                class="subtab"
                [class.activa]="forma() === f.forma"
                [attr.aria-selected]="forma() === f.forma"
                (click)="setForma(f.forma)"
              >
                {{ etiquetaForma(f.forma) }}
              </button>
            }
          </nav>
        }

        @if (vista() && !resumenActivo()?.pendiente) {
          <div class="detalle" aria-live="polite">
            @if (hoverMat(); as m) {
              <span class="dot" [style.background]="color(m.material)"></span>
              <b>{{ m.material }}</b>
              <span class="muted num">
                {{ valorTxt(m.cantidad, unidadActiva()) }} ·
                {{ pct(m.cantidad) }} · {{ formatNumero(m.piezas) }} {{ piezasEt() }}
              </span>
            } @else {
              <span class="soft">{{ pista() }}</span>
            }
          </div>
        }
      </div>

      @if (error()) {
        <div class="banner-error" role="alert">
          ⚠ No se pudo leer de la fuente ({{ error() }}).
          @if (fuenteDatos.esReal()) {
            ¿Está arrancado el backend en <code>http://localhost:3000</code>?
          }
          Reintentando…
        </div>
      }

      @if (cargando() && !vista()) {
        <div class="aviso">Cargando inventario…</div>
      } @else if (vista()) {
        @if (materialSel()) {
          <!-- Nivel 2: el material seleccionado desglosado por forma. -->
          <div class="nivel2">
            @for (d of desglose(); track d.forma) {
              <div
                class="forma-tile"
                [class.pend]="d.pendiente || !d.mat"
                [style.--c]="materialSel() ? color(materialSel()!) : 'var(--surface)'"
              >
                <span class="forma-nombre" [style.color]="d.pendiente || !d.mat ? null : tinta(materialSel()!)">
                  {{ etiquetaForma(d.forma) }}
                </span>
                @if (!d.pendiente && d.mat) {
                  <div class="forma-cifra" [style.color]="tinta(materialSel()!)">
                    <span class="forma-val num">{{ valorTxt(d.mat.cantidad, d.unidad) }}</span>
                    <span class="forma-piezas">{{ formatNumero(d.mat.piezas) }} {{ piezasDe(d.forma) }}</span>
                  </div>
                } @else {
                  <div class="forma-cifra">
                    <span class="pend-tag">pendiente</span>
                    <span class="soft">{{ d.unidad }} · sin fuente aún</span>
                  </div>
                }
              </div>
            }
          </div>
          <p class="nota-metodo">
            Bloques y tablas/losas no comparten escala (m³ frente a m²): cada forma se
            muestra con su unidad. Las pendientes llegarán a este mismo desglose.
            <a routerLink="/partes/bloques">Ver bloques en Partes →</a>
          </p>
        } @else if (resumenActivo()?.pendiente) {
          <!-- Forma sin fuente conectada todavía: armazón listo, dato por llegar. -->
          <div class="pendiente">
            <div class="pend-icono" aria-hidden="true">▦</div>
            <div class="pend-titulo">{{ etiquetaForma(forma()) }} — fuente aún no conectada</div>
            <p class="muted pend-texto">{{ textoPendiente() }}</p>
            <span class="soft pend-pie">El armazón ya está listo: solo falta enchufar el dato real.</span>
          </div>
        } @else {
          @if (resumenActivo(); as r) {
          @if (r.materiales.length === 0) {
            <div class="estado-vacio">No hay {{ etiquetaForma(r.forma).toLowerCase() }} en existencias.</div>
          } @else {
            <div class="mapa">
              <div class="col-izq">
                <div class="lista">
                  <div class="lista-titulo soft">Mayores existencias</div>
                  @for (m of top(); track m.material) {
                    <button
                      type="button"
                      class="fila"
                      [class.hot]="hover() === m.material"
                      (mouseenter)="hover.set(m.material)"
                      (mouseleave)="hover.set(null)"
                      (click)="abrirDetalle(m.material)"
                    >
                      <fabric-material-dot [nombre]="m.material" [tam]="11" />
                      <span class="fila-info">
                        <span class="fila-nombre">{{ m.material }}</span>
                        <span class="fila-barra" [style.width.%]="barra(m.cantidad)" [style.background]="color(m.material)"></span>
                      </span>
                      <span class="fila-val num">{{ valorTxt(m.cantidad, r.unidad) }}</span>
                    </button>
                  }
                </div>

                <div class="kpis">
                  <div class="kpi">
                    <span class="kpi-et">En existencias</span>
                    <span class="kpi-val num">{{ valorTxt(r.totalCantidad, r.unidad) }}</span>
                  </div>
                  <div class="kpi">
                    <span class="kpi-et">Materiales</span>
                    <span class="kpi-val num">{{ formatNumero(r.materiales.length) }}</span>
                  </div>
                  <div class="kpi">
                    <span class="kpi-et">{{ etiquetaForma(r.forma) }}</span>
                    <span class="kpi-val num">{{ formatNumero(r.totalPiezas) }}</span>
                  </div>
                </div>
              </div>

              <svg
                class="tree"
                [attr.viewBox]="'0 0 ' + VB_W + ' ' + VB_H"
                preserveAspectRatio="none"
                role="img"
                [attr.aria-label]="'Mapa de existencias de ' + etiquetaForma(r.forma).toLowerCase() + ' por material'"
              >
                @for (t of rects(); track t.item.material) {
                  <g
                    class="tile"
                    [class.hot]="hover() === t.item.material"
                    (mouseenter)="hover.set(t.item.material)"
                    (mouseleave)="hover.set(null)"
                    (click)="abrirDetalle(t.item.material)"
                  >
                    <title>{{ t.item.material }} · {{ valorTxt(t.item.cantidad, r.unidad) }} · {{ formatNumero(t.item.piezas) }} {{ piezasEt() }}</title>
                    <rect
                      [attr.x]="t.dx" [attr.y]="t.dy" [attr.width]="t.dw" [attr.height]="t.dh"
                      [attr.rx]="RX" [attr.ry]="RX"
                      [attr.fill]="color(t.item.material)"
                    />
                    @for (ln of t.etq.lineas; track $index) {
                      <text class="t-nombre" text-anchor="middle" [attr.x]="t.etq.cx" [attr.y]="t.etq.nombreY + $index * t.etq.lineH" [attr.font-size]="t.etq.nombreFs" [attr.fill]="tinta(t.item.material)">
                        {{ ln }}
                      </text>
                    }
                    @if (t.etq.valor) {
                      <text class="t-valor" text-anchor="middle" [attr.x]="t.etq.cx" [attr.y]="t.etq.valorY" [attr.font-size]="t.etq.valorFs" [attr.fill]="tinta(t.item.material)">
                        {{ t.etq.valor }}
                      </text>
                    }
                  </g>
                }
              </svg>
            </div>
          }
          }
        }
      }

      @if (vista() && materialSel() === null && !resumenActivo()?.pendiente) {
        <footer class="metodo-inventario">
          <div class="lista-titulo soft">Cómo se calcula</div>
          @switch (forma()) {
            @case ('bloques') {
              <p class="metodo-texto">
                <b>Bloques (m³).</b> Existencias reales de Odoo: lotes de
                <code>stock_lot</code> con cantidad on-hand en <code>stock_quant</code>
                (ubicación interna), unidos a las altas de recepción de
                <code>lot_block_creation</code> que aún no constan cortadas. El nombre del
                material sale de <code>product_template</code>. El m³ de cada bloque =
                largo × alto × grueso (medida del proveedor, en metros).
              </p>
            }
            @case ('tablas') {
              <p class="metodo-texto">
                <b>Tablas (m²).</b> Lotes de tabla on-hand de <code>stock_lot</code>
                (tipo <code>tables</code>) vía <code>stock_quant</code>, más las altas de
                entrada de <code>lot_tables_creation</code> que aún no han salido y los
                partes de paquetes de telar pendientes de Odoo. El material sale de
                <code>product_template</code>. El m² de cada alta = nº de tablas
                (<code>n_tables</code>) × largo × alto; en aserrado viene del parte real.
              </p>
            }
            @case ('losas') {
              <p class="metodo-texto">
                <b>Losas (m²).</b> Lotes de losa on-hand de <code>stock_lot</code>
                (tipo <code>slabs</code>) vía <code>stock_quant</code>, más las altas de
                <code>lot_slabs_creation</code>. El material sale de
                <code>product_template</code>. El m² de cada alta =
                nº de losas (<code>n_slabs</code>) × largo × alto.
              </p>
            }
          }
          <p class="metodo-pie soft">
            Si a una pieza le falta una medida fiable, cuenta en el recuento pero no
            suma superficie ni volumen (no se estima lo que no está en el dato).
          </p>
        </footer>
      }
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    section {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .kpis {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding-top: 14px;
      border-top: 1px solid var(--line);
    }
    .kpi {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .kpi-et {
      font-size: 11px;
      font-weight: 650;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-soft);
    }
    .kpi-val {
      font-size: 20px;
      font-weight: 780;
      letter-spacing: -0.01em;
    }
    .barra {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .ruta {
      display: flex;
      align-items: center;
      gap: 9px;
      font-size: 13.5px;
    }
    .ruta-mat {
      font-weight: 750;
    }
    .volver {
      border: 1px solid var(--line);
      background: var(--surface-soft);
      color: var(--text);
      border-radius: var(--radius-pill);
      padding: 5px 13px;
      font-size: 12.5px;
      font-weight: 650;
    }
    .volver:hover {
      background: var(--surface-strong);
    }
    .detalle {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12.5px;
      min-height: 20px;
    }
    .detalle .dot {
      width: 11px;
      height: 11px;
      border-radius: 50%;
      border: 1.5px solid rgba(0, 0, 0, 0.3);
      box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.35);
    }

    .mapa {
      display: grid;
      grid-template-columns: 232px 1fr;
      gap: 16px;
      align-items: start;
    }
    .col-izq {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }
    .lista {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
    }
    .lista-titulo {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 0 6px 8px;
    }
    .fila {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 7px 7px;
      border: none;
      background: transparent;
      color: var(--text);
      border-radius: var(--radius-sm);
      text-align: left;
      transition: background 0.12s ease;
    }
    .fila:hover,
    .fila.hot {
      background: var(--surface-soft);
    }
    .fila-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .fila-nombre {
      font-size: 12.5px;
      font-weight: 650;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .fila-barra {
      height: 5px;
      border-radius: 3px;
      min-width: 3px;
    }
    .fila-val {
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }

    .tree {
      width: 100%;
      height: auto;
      aspect-ratio: 1000 / 620;
      display: block;
      border-radius: var(--radius-row);
      border: 1px solid var(--line);
      background: rgba(0, 0, 0, 0.18);
      overflow: hidden;
    }
    .tile {
      cursor: pointer;
    }
    .tile rect {
      transition: filter 0.12s ease;
    }
    .tile:hover rect,
    .tile.hot rect {
      filter: brightness(1.12);
      stroke: var(--text);
      stroke-width: 3;
    }
    .t-nombre {
      font-weight: 700;
      letter-spacing: -0.01em;
      pointer-events: none;
    }
    .t-valor {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      pointer-events: none;
      opacity: 0.86;
    }

    .nivel2 {
      display: grid;
      grid-template-columns: 1.6fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 12px;
      min-height: 340px;
    }
    .forma-tile {
      position: relative;
      border-radius: var(--radius-row);
      background: var(--c);
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
    }
    .forma-tile:first-child {
      grid-row: span 2;
    }
    .forma-tile.pend {
      background: var(--surface-soft);
      border: 1px dashed var(--line-strong);
      box-shadow: none;
    }
    .forma-nombre {
      font-size: 15px;
      font-weight: 750;
      color: var(--text);
    }
    .forma-cifra {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .forma-val {
      font-size: 24px;
      font-weight: 780;
      letter-spacing: -0.01em;
    }
    .forma-piezas {
      font-size: 12px;
      font-weight: 600;
      opacity: 0.85;
    }
    .pend-tag {
      font-size: 12.5px;
      font-weight: 700;
      color: var(--amber);
    }

    .pendiente {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      min-height: 340px;
      border: 1px dashed var(--line-strong);
      border-radius: var(--radius-row);
      text-align: center;
      padding: 0 28px;
    }
    .pend-icono {
      font-size: 28px;
      opacity: 0.5;
    }
    .pend-titulo {
      font-size: 15px;
      font-weight: 700;
    }
    .pend-texto {
      max-width: 460px;
      font-size: 13px;
      line-height: 1.5;
    }
    .pend-pie {
      font-size: 11.5px;
    }
    .nota-metodo a {
      color: var(--text);
      font-weight: 650;
      text-decoration: underline;
      text-underline-offset: 2px;
      margin-left: 6px;
    }

    /* Cómo se calcula cada forma de existencia (al pie de la vista). */
    .metodo-inventario {
      margin-top: 4px;
      padding-top: 14px;
      border-top: 1px solid var(--line);
    }
    .metodo-texto {
      margin: 8px 0 0;
      font-size: 12.5px;
      line-height: 1.55;
      color: var(--text-muted);
    }
    .metodo-texto b {
      color: var(--text);
    }
    .metodo-pie {
      margin: 8px 0 0;
      font-size: 11.5px;
    }

    @media (max-width: 720px) {
      .mapa {
        grid-template-columns: 1fr;
      }
      .kpis {
        gap: 16px;
      }
    }
  `
})
export class InventarioMapaComponent {
  private readonly api = inject(FabricApi);
  readonly fuenteDatos = inject(FuenteDatosService);

  readonly formatNumero = formatNumero;
  readonly VB_W = VB_W;
  readonly VB_H = VB_H;
  readonly RX = RX;

  readonly forma = signal<FormaInventario>('bloques');
  readonly materialSel = signal<string | null>(null);
  readonly hover = signal<string | null>(null);

  readonly vista = signal<InventarioVistaConjunta | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  /** Formas disponibles (siempre [bloques, tablas, losas]); para el filtro. */
  readonly formas = computed<ResumenInventario[]>(() => this.vista()?.formas ?? []);

  readonly resumenActivo = computed<ResumenInventario | null>(
    () => this.vista()?.formas.find((f) => f.forma === this.forma()) ?? null
  );

  readonly unidadActiva = computed(() => this.resumenActivo()?.unidad ?? '');

  /** Top materiales de la forma activa para la lista lateral. */
  readonly top = computed<ResumenMaterial[]>(
    () => this.resumenActivo()?.materiales.slice(0, 10) ?? []
  );

  /** Treemap de la forma activa (vacío en nivel 2 o si la forma está pendiente). */
  readonly rects = computed<TileEtiquetado[]>(() => {
    const r = this.resumenActivo();
    if (!r || r.pendiente || this.materialSel() !== null) {
      return [];
    }
    const base = squarify(r.materiales, (m) => m.cantidad, VB_W, VB_H).map((t) => {
      // Encogemos cada cuadro por GAP: el hueco deja ver el fondo y, con rx,
      // redondea las esquinas sin pintar borde alguno.
      const dx = t.x + GAP;
      const dy = t.y + GAP;
      const dw = Math.max(0, t.w - 2 * GAP);
      const dh = Math.max(0, t.h - 2 * GAP);
      return { ...t, dx, dy, dw, dh };
    });

    // Cuerpo "natural" de cada cuadro y techo MONÓTONO por área: recorriendo de
    // mayor a menor, ningún cuadro puede llevar una letra mayor que otro más
    // grande (p. ej. un nombre corto que cabría más grande que un vecino igual
    // con nombre largo de una sola palabra). Así cuadros iguales = misma letra.
    const natural = base.map(
      (t) => this.calcEtiqueta(t.dx, t.dy, t.dw, t.dh, t.item, r.unidad, Infinity).nombreFs
    );
    const orden = base
      .map((t, i) => ({ i, area: t.dw * t.dh }))
      .sort((a, b) => b.area - a.area);
    const techo = new Array<number>(base.length);
    let cap = Infinity;
    for (const { i } of orden) {
      techo[i] = cap;
      cap = Math.min(cap, natural[i]);
    }

    return base.map((t, i) => ({
      ...t,
      etq: this.calcEtiqueta(t.dx, t.dy, t.dw, t.dh, t.item, r.unidad, techo[i])
    }));
  });

  /** El material bajo el cursor (de la lista o del mapa), para la línea de detalle. */
  readonly hoverMat = computed<ResumenMaterial | null>(() => {
    const r = this.resumenActivo();
    const h = this.hover();
    if (!r || h === null) {
      return null;
    }
    return r.materiales.find((m) => m.material === h) ?? null;
  });

  /** Nivel 2: el material seleccionado visto en cada forma. */
  readonly desglose = computed<DesgloseForma[]>(() => {
    const v = this.vista();
    const sel = this.materialSel();
    if (!v || sel === null) {
      return [];
    }
    return v.formas.map((f) => ({
      forma: f.forma,
      unidad: f.unidad,
      pendiente: f.pendiente,
      mat: f.materiales.find((m) => m.material === sel) ?? null
    }));
  });

  private fuenteAnterior: FuenteDatos | null = null;

  constructor() {
    effect((onCleanup) => {
      const fuente = this.fuenteDatos.fuente();
      // Al conmutar Demo|Real cambian los nombres de material: salir del drill.
      if (this.fuenteAnterior !== null && fuente !== this.fuenteAnterior) {
        untracked(() => this.materialSel.set(null));
      }
      this.fuenteAnterior = fuente;
      this.cargar();
      const intervalo = setInterval(() => this.cargar(), REFRESCO_MS);
      onCleanup(() => clearInterval(intervalo));
    });
  }

  setForma(forma: FormaInventario): void {
    this.materialSel.set(null);
    this.hover.set(null);
    this.forma.set(forma);
  }

  abrirDetalle(material: string): void {
    this.hover.set(null);
    this.materialSel.set(material);
  }

  cerrarDetalle(): void {
    this.materialSel.set(null);
  }

  etiquetaForma(forma: FormaInventario): string {
    return ETIQUETA_FORMA[forma];
  }

  /** "bloques" en la forma de bloques, "tablas"/"losas" en m². */
  piezasEt(): string {
    return this.forma() === 'bloques' ? 'bloques' : 'piezas';
  }

  piezasDe(forma: FormaInventario): string {
    return forma === 'bloques' ? 'bloques' : 'piezas';
  }

  color(material: string): string {
    return materialPorNombre(material).color;
  }

  tinta(material: string): string {
    return tintaSobre(materialPorNombre(material).color);
  }

  /** m³ con 1 decimal, m² sin decimales; siempre con su unidad. */
  valorTxt(cantidad: number, unidad: string): string {
    return formatValorUnidad(cantidad, unidad, unidad === 'm³' ? 1 : 0);
  }

  pct(cantidad: number): string {
    const total = this.resumenActivo()?.totalCantidad ?? 0;
    if (total <= 0) {
      return '—';
    }
    return `${Math.round((cantidad / total) * 100)} %`;
  }

  /** Anchura de la barra de la lista, relativa al mayor material (mín. visible). */
  barra(cantidad: number): number {
    const max = this.top()[0]?.cantidad ?? 0;
    if (max <= 0) {
      return 0;
    }
    return Math.max(4, (cantidad / max) * 100);
  }

  /**
   * Etiqueta CENTRADA (nombre + valor debajo, al estilo WinDirStat). El cuerpo lo
   * fija el TAMAÑO del cuadro (área), no el nombre: cuadros iguales llevan la misma
   * letra y uno más pequeño nunca la tiene mayor que otro más grande. El salto a 2
   * líneas solo sirve para que el nombre quepa a ese cuerpo, nunca para agrandarlo;
   * si ni así entra (palabra larga), se encoge —nunca se corta—. `dx/dy/dw/dh` es
   * la caja de dibujo (ya con GAP).
   */
  private calcEtiqueta(
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    item: ResumenMaterial,
    unidad: string,
    techoFs: number
  ): EtiquetaTile {
    const CHAR = 0.66; // anchura media de carácter relativa al cuerpo (mayúsc. en negrita)
    const MIN_FS = 6; // suelo: hasta los cuadros pequeños muestran el nombre
    const MAX_FS = 26;
    const LINE_GAP = 5;
    const AREA_K = 0.115; // cuerpo objetivo = √área × k (cuadros iguales, letra igual)
    const AREA_VALOR = 8000; // a partir de esta área el cuadro muestra también el m³
    const pad = Math.max(3, Math.min(12, dw * 0.1, dh * 0.18));
    const innerW = dw - pad * 2;
    const nombre = item.material;
    const valor = this.valorTxt(item.cantidad, unidad);
    const cx = dx + dw / 2;
    const cy = dy + dh / 2;

    // Cuerpo OBJETIVO por tamaño del cuadro, acotado por el techo monótono (ningún
    // cuadro supera a otro más grande). La letra no crece por encima de esto aunque
    // sobre sitio (así "respira" y es coherente entre cuadros iguales).
    const objetivo = Math.min(MAX_FS, techoFs, Math.sqrt(dw * dh) * AREA_K);

    // Mejor partición en dos líneas (minimiza la línea más larga).
    const palabras = nombre.split(' ');
    let mejor: { l1: string; l2: string; larga: number } | null = null;
    for (let i = 1; i < palabras.length; i++) {
      const l1 = palabras.slice(0, i).join(' ');
      const l2 = palabras.slice(i).join(' ');
      const larga = Math.max(l1.length, l2.length);
      if (!mejor || larga < mejor.larga) {
        mejor = { l1, l2, larga };
      }
    }

    // Cuerpo que cabe en 1 y en 2 líneas, sin pasar del objetivo.
    const unaFs = Math.min(objetivo, innerW / Math.max(1, nombre.length * CHAR), dh * 0.5);
    const dosFs = mejor
      ? Math.min(objetivo, innerW / Math.max(1, mejor.larga * CHAR), (dh * 0.85 - LINE_GAP) / 2)
      : 0;

    // Solo se parte en dos líneas si una línea queda apretada (cuerpo bajo) y el
    // partido recupera tamaño apreciable; los cuadros holgados van en una línea.
    let lineas: string[];
    let nombreFs: number;
    if (mejor && unaFs < 14 && dosFs > unaFs * 1.15) {
      lineas = [mejor.l1, mejor.l2];
      nombreFs = dosFs;
    } else {
      lineas = [nombre];
      nombreFs = unaFs;
    }

    // Suelo de visibilidad: si no llega al mínimo pero cabe a MIN_FS, se enseña a
    // MIN_FS (los cuadros pequeños conservan el nombre) eligiendo 1 ó 2 líneas.
    let verNombre = innerW > 6 && nombreFs >= MIN_FS;
    if (!verNombre && innerW > 6) {
      const cabeDos =
        !!mejor &&
        mejor.larga * CHAR * MIN_FS <= innerW &&
        2 * MIN_FS + LINE_GAP <= dh * 0.9;
      const cabeUna = nombre.length * CHAR * MIN_FS <= innerW && MIN_FS <= dh * 0.7;
      if (cabeDos) {
        lineas = [mejor!.l1, mejor!.l2];
        nombreFs = MIN_FS;
        verNombre = true;
      } else if (cabeUna) {
        lineas = [nombre];
        nombreFs = MIN_FS;
        verNombre = true;
      }
    }

    const altoNombre = lineas.length * nombreFs + (lineas.length - 1) * LINE_GAP;
    const valorFs = Math.min(nombreFs * 0.8, innerW / Math.max(1, valor.length * CHAR));
    // El m³ solo en cuadros grandes (a partir de AREA_VALOR) y si sobra alto: en
    // los pequeños queda apretado, así que ahí va solo el nombre.
    const verValor =
      verNombre && dw * dh >= AREA_VALOR && dh > altoNombre + LINE_GAP + valorFs + pad;

    // Bloque (1-2 líneas de nombre + valor opcional) centrado verticalmente.
    const bloque = altoNombre + (verValor ? LINE_GAP + valorFs : 0);
    const top = cy - bloque / 2;

    return {
      lineas: verNombre ? lineas : [],
      nombreFs: Math.round(nombreFs * 10) / 10,
      nombreY: Math.round(top + nombreFs),
      lineH: Math.round((nombreFs + LINE_GAP) * 10) / 10,
      valor: verValor ? valor : '',
      valorFs: Math.round(valorFs * 10) / 10,
      valorY: Math.round(top + altoNombre + LINE_GAP + valorFs),
      cx: Math.round(cx)
    };
  }

  pista(): string {
    return this.materialSel() !== null
      ? 'Cada forma se muestra con su propia unidad.'
      : 'Pasa el ratón por un material · haz clic para desglosarlo.';
  }

  textoPendiente(): string {
    return this.forma() === 'tablas'
      ? 'En cuanto Fabric reciba las tablas cortadas con sus m², aparecerán aquí con el mismo mapa: una pieza por material, dimensionada por m².'
      : 'Cuando se controle cuántas losas hay y de qué tamaño, este mapa mostrará los m² por material; más adelante se podrá entrar al detalle de cada formato.';
  }

  private cargar(): void {
    this.cargando.set(true);
    this.api.getResumenInventario().subscribe({
      next: (vista) => {
        this.vista.set(vista);
        this.error.set(null);
        this.cargando.set(false);
      },
      error: (err: unknown) => {
        const mensaje =
          err && typeof err === 'object' && 'status' in err
            ? `HTTP ${(err as { status: number }).status}`
            : 'sin conexión';
        this.error.set(mensaje);
        this.cargando.set(false);
      }
    });
  }
}
