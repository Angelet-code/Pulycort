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
import {
  BloqueInventario,
  PaginaInventario,
  TipoBloque
} from '../../core/models';
import { MaterialDotComponent } from '../../shared/material-dot.component';

const LIMIT = 50;
const REFRESCO_MS = 60_000;

/**
 * Inventario de bloques en existencias: los bloques que realmente hay ahora en
 * el almacén. Une dos eras (lo hace el backend/mock): `fuente='stock'` =
 * existencias on-hand del snapshot de Odoo (`stock_lot`+`stock_quant`) y
 * `fuente='alta'` = bloques recibidos recientemente (`lot_block_creation`) aún
 * sin existencias en el stock y sin cortar. Para cada bloque, la medida del
 * proveedor frente a la de fábrica (mrp; "—" mientras no se mida, se toma al
 * procesar). Las medidas vienen en metros; el m³ y la merma los deriva el
 * backend (o el mock) de esas medidas y aquí solo se pintan, con sus unidades al
 * lado. Valores en crudo, sin interpretar.
 */
@Component({
  selector: 'fabric-inventario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialDotComponent],
  template: `
    <section class="panel">
      <div class="panel-head filtros">
        <div class="fila-filtros">
          <input
            type="search"
            class="control control-busqueda"
            placeholder="Nº de bloque"
            aria-label="Buscar por nº de bloque"
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
              <option [value]="m">{{ m }}</option>
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
        <div class="banner-error" role="alert">
          ⚠ No se pudo leer de la fuente ({{ error() }}).
          @if (fuenteDatos.esReal()) {
            ¿Está arrancado el backend en <code>http://localhost:3000</code>?
          }
          Reintentando…
        </div>
      }
      @if (cargando() && !pagina()) {
        <div class="aviso">Cargando inventario…</div>
      } @else if (pagina()) {
        @if (pagina()!; as p) {
        <div class="tabla-scroll" [class.actualizando]="cargando()">
          <table class="tabla">
            <thead>
              <tr>
                <th>Alta</th>
                <th
                  class="derecha"
                  title="Número de bloque (stock_lot.name, la misma referencia que el telar)."
                >
                  Nº bloque
                </th>
                <th>Material</th>
                <th title="Clasificación del lote en Odoo (type_product_lot)">Tipo</th>
                <th title="Ubicación física en el almacén (stock_location)">Ubicación</th>
                <th class="derecha">Medidas proveedor</th>
                <th class="derecha" [title]="tituloM3">Volumen prov.</th>
                <th class="derecha">Medidas fábrica</th>
                <th class="derecha" [title]="tituloM3">Volumen fáb.</th>
                <th class="derecha" title="(m³ proveedor − m³ fábrica) / m³ proveedor × 100">
                  Merma
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
                        (click)="setMaterial(nombreMaterialFila(fila))"
                        title="Filtrar por {{ nombreMaterialFila(fila) }}"
                      >
                        <fabric-material-dot [nombre]="nombreMaterialFila(fila)" [tam]="11" />
                        {{ nombreMaterialFila(fila) }}
                      </button>
                    } @else {
                      <span class="soft">—</span>
                    }
                  </td>
                  <td>
                    <span class="tag-tipo">{{ etiquetaTipo(fila.tipo) }}</span>
                  </td>
                  <td>
                    @if (fila.ubicacion) {
                      {{ fila.ubicacion }}
                    } @else if (fila.fuente === 'alta') {
                      <span
                        class="tag-reciente"
                        title="Bloque recibido recientemente (registrado en el alta de recepción), aún sin existencias en el stock de Odoo. Se cuenta en el inventario hasta que se asierra o se da entrada al stock."
                        >Recepción reciente</span
                      >
                    } @else {
                      <span class="soft">—</span>
                    }
                  </td>
                  <td class="derecha num">
                    {{ medidas(fila.largoSupplier, fila.altoSupplier, fila.gruesoSupplier) }}
                  </td>
                  <td class="derecha num">
                    {{ vol(fila.m3Supplier, fila.m3SupplierImposible) }}
                    @if (fila.m3SupplierImposible) {
                      <span class="aviso-medidas" title="Medida de proveedor imposible (fuera de rango físico aun tras ajustar unidades cm/m): m³ no fiable, a revisar.">⚠</span>
                    }
                  </td>
                  <td class="derecha num">
                    {{ medidas(fila.largoMrp, fila.altoMrp, fila.gruesoMrp) }}
                  </td>
                  <td class="derecha num">
                    {{ vol(fila.m3Mrp, fila.m3MrpImposible) }}
                    @if (fila.m3MrpImposible) {
                      <span class="aviso-medidas" title="Medida de fábrica (mrp) imposible (fuera de rango físico aun tras ajustar unidades cm/m): m³ y merma no fiables, a revisar.">⚠</span>
                    }
                  </td>
                  <td class="derecha num">{{ pct1(fila.mermaPct) }}</td>
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
    /* Filtros, controles, celdas y paginación: globales en styles.css.
       Aquí solo lo propio de la vista (búsqueda, tag de tipo). */
    input.control-busqueda {
      width: 170px;
    }
    input.control-busqueda::placeholder {
      color: var(--text-muted);
    }
    .total {
      font-size: 12.5px;
    }
    .bloque {
      font-weight: 750;
    }
    .aviso-medidas {
      margin-left: 3px;
      color: var(--amber);
      font-size: 12px;
      cursor: help;
    }
    .tag-tipo {
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
    /* Procedencia "alta": bloque recibido aún sin existencias en el stock de Odoo. */
    .tag-reciente {
      display: inline-flex;
      align-items: center;
      padding: 1px 8px;
      border-radius: var(--radius-pill);
      border: 1px solid var(--amber);
      color: var(--amber);
      font-size: 11px;
      font-weight: 650;
      white-space: nowrap;
      cursor: help;
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
  readonly desde = signal<string | null>(null);
  readonly hasta = signal<string | null>(null);

  readonly offset = signal(0);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly pagina = signal<PaginaInventario | null>(null);

  readonly materiales = computed(() => {
    const lista = this.pagina()?.materiales ?? [];
    // El backend/mock ya ordena por nombre; se reordena por robustez.
    return [...lista].sort((a, b) => a.localeCompare(b, 'es'));
  });

  readonly hayFiltros = computed(
    () =>
      this.q() !== null ||
      this.material() !== null ||
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
        desde: this.desde(),
        hasta: this.hasta(),
        offset: this.offset()
      };
      const fuente = this.fuenteDatos.fuente();
      // El material (nombre del catálogo) es propio de cada fuente: al conmutar
      // Demo|Real deja de ser válido, así que se limpia en vez de dar 0 filas.
      if (
        this.fuenteAnterior !== null &&
        fuente !== this.fuenteAnterior &&
        filtros.material !== null
      ) {
        this.fuenteAnterior = fuente;
        untracked(() => {
          this.offset.set(0);
          this.material.set(null);
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
    this.desde.set(null);
    this.hasta.set(null);
  }

  anterior(): void {
    this.offset.set(Math.max(this.offset() - LIMIT, 0));
  }

  siguiente(): void {
    this.offset.set(this.offset() + LIMIT);
  }

  /**
   * Volumen en m³ con su unidad (lo deriva el backend/mock; aquí solo se pinta).
   * Si la medida es imposible (corrupción real), devuelve "—": el ⚠ de la celda
   * explica por qué, en vez de pintar un m³ que sabemos falso.
   */
  vol(valor: number | null, imposible = false): string {
    if (imposible) {
      return '—';
    }
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

  /** Etiqueta legible del `type_product_lot` (significado exacto pendiente de confirmar). */
  etiquetaTipo(tipo: TipoBloque): string {
    return tipo === 'block' ? 'Bloque' : 'Otro material';
  }

  /**
   * Etiqueta de material de la fila. El backend/mock ya entrega la etiqueta
   * final (nombre real o "Material {id}"); aquí solo se pinta, sin recomponerla.
   */
  nombreMaterialFila(fila: BloqueInventario): string {
    return fila.materialNombre ?? '—';
  }

  fechaHora(iso: string | null): string {
    return formatFechaHoraAnio(iso);
  }

  private cargar(filtros: {
    q: string | null;
    material: string | null;
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
