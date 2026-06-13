import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked
} from '@angular/core';
import { FabricApi } from '../../core/fabric-api';
import { FuenteDatos, FuenteDatosService } from '../../core/fuente-datos.service';
import {
  formatFechaHoraAnio,
  formatNumero,
  formatPorcentaje,
  formatValorUnidad
} from '../../core/format';
import { materialPorId } from '../../core/materiales';
import { EstadoCicloBloque, PaginaInventario } from '../../core/models';
import { MaterialDotComponent } from '../../shared/material-dot.component';

const LIMIT = 50;
const REFRESCO_MS = 60_000;

/**
 * Inventario de bloques: las altas de bloque en almacén tal cual están en la
 * tabla real `lot_block_creation` de Odoo, con la medida declarada por el
 * proveedor frente a la medida tomada en fábrica (mrp; "—" mientras no se
 * mida). Las medidas vienen en metros; el m³ y la merma los deriva el backend
 * (o el mock) de esas medidas y aquí solo se pintan, con sus unidades al lado.
 * La unidad metro sigue pendiente de confirmar oficialmente
 * (00_gestion/TAREAS.md). El proveedor es la columna `ref` (nombre legible; el
 * FK `supplier` viene vacío en real). Valores en crudo, sin interpretar.
 */
@Component({
  selector: 'fabric-inventario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialDotComponent],
  template: `
    <div class="cabecera-vista">
      <div>
        <h1>Inventario de bloques</h1>
        <p class="muted subtitulo">
          altas de bloque en almacén · tabla <code>lot_block_creation</code>
        </p>
      </div>
      @if (fuenteDatos.esReal()) {
        <span class="chip chip-fuente chip-real">
          <span class="punto"></span>
          Datos reales de BD
        </span>
      } @else {
        <span class="chip chip-fuente chip-demo">
          <span class="punto"></span>
          Datos demo
        </span>
      }
    </div>

    <section class="panel">
      <div class="panel-head filtros">
        <div class="fila-filtros">
          <input
            type="search"
            class="control control-busqueda"
            placeholder="Nº de bloque o proveedor"
            aria-label="Buscar por número de bloque o proveedor"
            [value]="q() ?? ''"
            (change)="setQ(valorDe($event) || null)"
          />

          <select
            class="control"
            aria-label="Filtrar por material"
            [value]="material() ?? ''"
            (change)="setMaterial(valorDe($event) || null)"
          >
            <option value="">Todos los materiales</option>
            @for (m of materiales(); track m) {
              <option [value]="m">{{ nombreMaterial(m) }}</option>
            }
          </select>

          <select
            class="control"
            aria-label="Filtrar por proveedor"
            [value]="proveedor() ?? ''"
            (change)="setProveedor(valorDe($event) || null)"
          >
            <option value="">Todos los proveedores</option>
            @for (p of proveedores(); track p) {
              <option [value]="p">{{ p }}</option>
            }
          </select>

          <select
            class="control"
            aria-label="Filtrar por estado del bloque"
            [value]="estado() ?? ''"
            (change)="setEstado(valorEstado($event))"
          >
            <option value="">Todos los estados</option>
            @for (e of estadosCiclo; track e) {
              <option [value]="e">{{ etiquetaCiclo(e) }}</option>
            }
          </select>

          <label class="control control-fecha">
            <span class="soft">Desde</span>
            <input
              type="date"
              [value]="desde() ?? ''"
              (change)="setDesde(valorDe($event) || null)"
            />
          </label>
          <label class="control control-fecha">
            <span class="soft">Hasta</span>
            <input
              type="date"
              [value]="hasta() ?? ''"
              (change)="setHasta(valorDe($event) || null)"
            />
          </label>

          @if (hayFiltros()) {
            <button type="button" class="limpiar" (click)="limpiarFiltros()">
              ✕ Limpiar filtros
            </button>
          }
        </div>
        @if (pagina(); as p) {
          <span class="muted total num">
            {{ formatNumero(p.total) }} bloques
          </span>
        }
      </div>

      @if (error()) {
        <div class="aviso aviso-error">
          No se pudo leer de la fuente de datos ({{ error() }}).
          @if (fuenteDatos.esReal()) {
            ¿Está arrancado el backend en <code>http://localhost:3000</code>?
          }
        </div>
      } @else if (cargando() && !pagina()) {
        <div class="aviso">Cargando inventario…</div>
      } @else if (pagina()) {
        @if (pagina()!; as p) {
        <div class="tabla-scroll" [class.actualizando]="cargando()">
          <table class="tabla">
            <thead>
              <tr>
                <th>Alta</th>
                <th class="derecha">Nº bloque</th>
                <th>Material</th>
                <th>Proveedor</th>
                <th class="derecha">Medidas proveedor</th>
                <th class="derecha" [title]="tituloM3">Volumen prov.</th>
                <th class="derecha">Medidas fábrica</th>
                <th class="derecha" [title]="tituloM3">Volumen fáb.</th>
                <th class="derecha" title="(m³ proveedor − m³ fábrica) / m³ proveedor × 100">
                  Merma
                </th>
                <th title="Estado de ciclo de vida del bloque (derivado de los partes de trabajo) y flags de logística de Odoo (entrada/lote)">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              @for (fila of p.items; track fila.id) {
                <tr>
                  <td class="num">{{ fechaHora(fila.createDate) }}</td>
                  <td class="derecha num bloque">{{ fila.name ?? '—' }}</td>
                  <td>
                    @if (fila.material !== null) {
                      <button
                        type="button"
                        class="celda-clicable celda-material"
                        (click)="setMaterial(aTexto(fila.material))"
                        title="Filtrar por {{ nombreMaterial(fila.material) }}"
                      >
                        <fabric-material-dot [materialId]="aTexto(fila.material)" [tam]="11" />
                        {{ nombreMaterial(fila.material) }}
                      </button>
                    } @else {
                      <span class="soft">—</span>
                    }
                  </td>
                  <td>
                    @if (fila.ref !== null) {
                      <button
                        type="button"
                        class="celda-clicable"
                        (click)="setProveedor(fila.ref!)"
                        title="Filtrar por este proveedor"
                      >{{ fila.ref }}</button>
                    } @else {
                      <span class="soft">—</span>
                    }
                    @if (fila.thirdPartyMaterial) {
                      <span class="tag-terceros" title="Material de terceros">terceros</span>
                    }
                  </td>
                  <td class="derecha num">
                    {{ medidas(fila.largoSupplier, fila.altoSupplier, fila.gruesoSupplier) }}
                  </td>
                  <td class="derecha num">{{ vol(fila.m3Supplier) }}</td>
                  <td class="derecha num">
                    {{ medidas(fila.largoMrp, fila.altoMrp, fila.gruesoMrp) }}
                  </td>
                  <td class="derecha num">{{ vol(fila.m3Mrp) }}</td>
                  <td class="derecha num">{{ pct1(fila.mermaPct) }}</td>
                  <td>
                    <div class="celda-estado">
                      @if (fila.estadoCiclo) {
                        <span class="badge-ciclo" [attr.data-estado]="fila.estadoCiclo">
                          <span class="punto-ciclo" aria-hidden="true"></span>
                          {{ etiquetaCiclo(fila.estadoCiclo) }}
                        </span>
                      }
                      <span class="estados-odoo">
                        <span class="estado" [class.ok]="fila.deliveryDone === true">
                          {{ marcaEstado(fila.deliveryDone) }} entrada
                        </span>
                        <span class="estado" [class.ok]="fila.createLotDone === true">
                          {{ marcaEstado(fila.createLotDone) }} lote
                        </span>
                      </span>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="paginacion">
          <button type="button" [disabled]="offset() === 0" (click)="anterior()">
            ← Anteriores
          </button>
          <span class="muted num">
            {{ formatNumero(offset() + 1) }}–{{ formatNumero(offset() + p.items.length) }}
            de {{ formatNumero(p.total) }}
          </span>
          <button
            type="button"
            [disabled]="offset() + p.items.length >= p.total"
            (click)="siguiente()"
          >
            Siguientes →
          </button>
        </div>
        }
      }
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .filtros {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .fila-filtros {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .control {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      border: 1px solid var(--line);
      background: var(--surface-soft);
      color: var(--text);
      border-radius: var(--radius-pill);
      padding: 5px 12px;
      font-size: 12.5px;
      font-weight: 600;
    }
    select.control {
      appearance: none;
      cursor: pointer;
      max-width: 220px;
    }
    select.control option {
      background: var(--bg-1);
      color: var(--text);
    }
    input.control-busqueda {
      width: 170px;
    }
    input.control-busqueda::placeholder {
      color: var(--text-muted);
    }
    .control-fecha .soft {
      font-size: 11.5px;
    }
    .control-fecha input {
      border: none;
      background: transparent;
      color: var(--text);
      font: inherit;
      color-scheme: dark;
      cursor: pointer;
    }
    .limpiar {
      border: 1px solid color-mix(in srgb, var(--red) 40%, transparent);
      background: transparent;
      color: var(--red);
      border-radius: var(--radius-pill);
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 650;
      transition: background 0.2s ease;
    }
    .limpiar:hover {
      background: color-mix(in srgb, var(--red) 12%, transparent);
    }
    .total {
      font-size: 12.5px;
    }
    .bloque {
      font-weight: 750;
    }
    .aviso {
      padding: 26px 18px;
      text-align: center;
      color: var(--text-muted);
      font-size: 13.5px;
    }
    .aviso-error {
      color: var(--red);
    }
    .aviso-error code {
      color: var(--text);
    }
    .tabla-scroll.actualizando {
      opacity: 0.55;
      transition: opacity 0.15s ease;
    }
    .celda-clicable {
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      padding: 0;
      cursor: pointer;
      border-radius: 6px;
    }
    .celda-clicable:hover {
      text-decoration: underline;
      text-underline-offset: 3px;
      text-decoration-style: dotted;
    }
    .celda-material {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }
    .tag-terceros {
      margin-left: 6px;
      padding: 1px 7px;
      border-radius: var(--radius-pill);
      border: 1px solid color-mix(in srgb, var(--amber) 45%, transparent);
      color: var(--amber);
      font-size: 10.5px;
      font-weight: 700;
      white-space: nowrap;
    }
    .celda-estado {
      display: inline-flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 5px;
    }
    .badge-ciclo {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 9px;
      border-radius: var(--radius-pill);
      border: 1px solid color-mix(in srgb, var(--c, var(--text-muted)) 45%, transparent);
      background: color-mix(in srgb, var(--c, var(--text-muted)) 12%, transparent);
      color: var(--c, var(--text-muted));
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }
    .punto-ciclo {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--c, var(--text-muted));
    }
    .badge-ciclo[data-estado='inventariado'] {
      --c: var(--text-muted);
    }
    .badge-ciclo[data-estado='moviendo-a-telar'] {
      --c: var(--violet);
    }
    .badge-ciclo[data-estado='aserrando'] {
      --c: var(--blue);
    }
    .badge-ciclo[data-estado='sacando-del-telar'] {
      --c: var(--teal);
    }
    .badge-ciclo[data-estado='almacenando'] {
      --c: var(--amber);
    }
    .badge-ciclo[data-estado='almacenado'] {
      --c: var(--green);
    }
    .badge-ciclo[data-estado='sin-lecturas'] {
      --c: var(--red);
    }
    .estado {
      display: inline-flex;
      align-items: center;
      padding: 1px 8px;
      border-radius: var(--radius-pill);
      border: 1px solid var(--line);
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 650;
      white-space: nowrap;
    }
    .estado + .estado {
      margin-left: 4px;
    }
    .estado.ok {
      border-color: color-mix(in srgb, var(--green) 45%, transparent);
      color: var(--green);
    }
    .paginacion {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
      padding: 14px 8px 4px;
      font-size: 12.5px;
    }
    .paginacion button {
      border: 1px solid var(--line-strong);
      background: var(--surface-soft);
      color: var(--text);
      border-radius: var(--radius-pill);
      padding: 6px 14px;
      font-size: 12.5px;
      font-weight: 650;
    }
    .paginacion button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  `
})
export class InventarioComponent {
  private readonly api = inject(FabricApi);
  readonly fuenteDatos = inject(FuenteDatosService);

  readonly formatNumero = formatNumero;
  readonly tituloM3 = 'largo × alto × grueso, en metros (unidad pendiente de confirmar)';

  readonly q = signal<string | null>(null);
  readonly material = signal<string | null>(null);
  readonly proveedor = signal<string | null>(null);
  readonly estado = signal<EstadoCicloBloque | null>(null);
  readonly desde = signal<string | null>(null);
  readonly hasta = signal<string | null>(null);

  /** Estados de ciclo en orden cronológico, para el desplegable del filtro. */
  readonly estadosCiclo: readonly EstadoCicloBloque[] = [
    'inventariado',
    'moviendo-a-telar',
    'aserrando',
    'sacando-del-telar',
    'almacenando',
    'almacenado',
    'sin-lecturas'
  ];
  readonly offset = signal(0);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly pagina = signal<PaginaInventario | null>(null);

  readonly materiales = computed(() => {
    const lista = this.pagina()?.materiales ?? [];
    return [...lista].sort((a, b) =>
      materialPorId(String(a)).nombre.localeCompare(materialPorId(String(b)).nombre, 'es')
    );
  });

  readonly proveedores = computed(() => this.pagina()?.proveedores ?? []);

  readonly hayFiltros = computed(
    () =>
      this.q() !== null ||
      this.material() !== null ||
      this.proveedor() !== null ||
      this.estado() !== null ||
      this.desde() !== null ||
      this.hasta() !== null
  );

  /** Última fuente vista por el effect, para detectar el conmutado Demo|Real. */
  private fuenteAnterior: FuenteDatos | null = null;

  constructor() {
    // Recarga al cambiar cualquier filtro, la página o la fuente de datos,
    // y refresca cada minuto.
    effect((onCleanup) => {
      const filtros = {
        q: this.q(),
        material: this.material(),
        proveedor: this.proveedor(),
        estado: this.estado(),
        desde: this.desde(),
        hasta: this.hasta(),
        offset: this.offset()
      };
      const fuente = this.fuenteDatos.fuente();
      // Material (código) y proveedor (nombre de `ref`) son valores del
      // catálogo de cada fuente: al conmutar Demo|Real dejan de ser válidos,
      // así que se limpian en vez de provocar un 400 o 0 filas.
      if (
        this.fuenteAnterior !== null &&
        fuente !== this.fuenteAnterior &&
        (filtros.material !== null || filtros.proveedor !== null)
      ) {
        this.fuenteAnterior = fuente;
        untracked(() => {
          this.offset.set(0);
          this.material.set(null);
          this.proveedor.set(null);
        });
        return; // la escritura relanza este effect ya con los filtros limpios
      }
      this.fuenteAnterior = fuente;
      this.cargar(filtros);
      const intervalo = setInterval(() => this.cargar(filtros), REFRESCO_MS);
      onCleanup(() => clearInterval(intervalo));
    });
  }

  valorDe(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLSelectElement).value;
  }

  setQ(texto: string | null): void {
    const limpio = texto?.trim() || null;
    if (this.q() === limpio) {
      return;
    }
    this.offset.set(0);
    this.q.set(limpio);
  }

  setMaterial(m: string | null): void {
    if (this.material() === m) {
      return;
    }
    this.offset.set(0);
    this.material.set(m);
  }

  setProveedor(p: string | null): void {
    if (this.proveedor() === p) {
      return;
    }
    this.offset.set(0);
    this.proveedor.set(p);
  }

  /** Valor del desplegable de estado (cadena vacía = todos → null). */
  valorEstado(evento: Event): EstadoCicloBloque | null {
    const valor = (evento.target as HTMLSelectElement).value;
    return valor === '' ? null : (valor as EstadoCicloBloque);
  }

  setEstado(e: EstadoCicloBloque | null): void {
    if (this.estado() === e) {
      return;
    }
    this.offset.set(0);
    this.estado.set(e);
  }

  setDesde(fecha: string | null): void {
    this.offset.set(0);
    this.desde.set(fecha);
  }

  setHasta(fecha: string | null): void {
    this.offset.set(0);
    this.hasta.set(fecha);
  }

  limpiarFiltros(): void {
    this.offset.set(0);
    this.q.set(null);
    this.material.set(null);
    this.proveedor.set(null);
    this.estado.set(null);
    this.desde.set(null);
    this.hasta.set(null);
  }

  anterior(): void {
    this.offset.set(Math.max(this.offset() - LIMIT, 0));
  }

  siguiente(): void {
    this.offset.set(this.offset() + LIMIT);
  }

  /** Volumen en m³ con su unidad (lo deriva el backend/mock; aquí solo se pinta). */
  vol(valor: number | null): string {
    return formatValorUnidad(valor, 'm³', 2);
  }

  pct1(valor: number | null): string {
    return formatPorcentaje(valor, 1);
  }

  /**
   * Medidas en metros con su unidad. Decimales adaptativos para no aplastar
   * los valores (la unidad metro sigue sin confirmar; ver doc de la clase).
   */
  medidas(largo: number | null, alto: number | null, grueso: number | null): string {
    if (largo == null && alto == null && grueso == null) {
      return '—';
    }
    const f = (v: number | null) =>
      v == null ? '—' : formatNumero(v, v !== 0 && Math.abs(v) < 10 ? 2 : 0);
    return `${f(largo)} × ${f(alto)} × ${f(grueso)} m`;
  }

  aTexto(valor: number | string): string {
    return String(valor);
  }

  /** Etiqueta legible del estado de ciclo (lo calcula el backend, aquí se pinta). */
  private readonly ETIQUETA_CICLO: Record<EstadoCicloBloque, string> = {
    inventariado: 'Inventariado',
    'moviendo-a-telar': 'Moviendo a telar',
    aserrando: 'Aserrando',
    'sacando-del-telar': 'Sacando del telar',
    almacenando: 'Almacenando',
    almacenado: 'Almacenado',
    'sin-lecturas': 'Sin lecturas'
  };

  etiquetaCiclo(estado: EstadoCicloBloque): string {
    return this.ETIQUETA_CICLO[estado];
  }

  /** '✓' hecho, '·' no hecho, '—' sin dato en la fuente (columna NULL). */
  marcaEstado(valor: boolean | null): string {
    if (valor === null) {
      return '—';
    }
    return valor ? '✓' : '·';
  }

  nombreMaterial(valor: number | string): string {
    return materialPorId(String(valor)).nombre;
  }

  fechaHora(iso: string | null): string {
    return formatFechaHoraAnio(iso);
  }

  private cargar(filtros: {
    q: string | null;
    material: string | null;
    proveedor: string | null;
    estado: EstadoCicloBloque | null;
    desde: string | null;
    hasta: string | null;
    offset: number;
  }): void {
    this.cargando.set(true);
    this.api.getInventario({ ...filtros, limit: LIMIT }).subscribe({
      next: (pagina) => {
        this.pagina.set(pagina);
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
