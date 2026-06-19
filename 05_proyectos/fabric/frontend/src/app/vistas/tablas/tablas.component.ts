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
  formatValorUnidad
} from '../../core/format';
import {
  PaginaInventarioTablas,
  TablaInventario,
  TipoTabla
} from '../../core/models';
import { MaterialDotComponent } from '../../shared/material-dot.component';

const LIMIT = 50;
const REFRESCO_MS = 60_000;

/**
 * Inventario de tablas en existencias, gemelo del de bloques: une tres procedencias (lo
 * hace el backend) — `fuente='stock'` = existencias on-hand del stock de Odoo
 * (`stock_lot`+`stock_quant`, `type_product_lot='tables'`) y `fuente='alta'` =
 * paquetes de tablas recibidos (`lot_tables_creation`) aún sin existencias en el
 * stock (se marcan "Recepción reciente"); `fuente='aserrado'` = partes reales de
 * paquetes pendientes de alta/depuración en Odoo. Las medidas llegan en metros (el backend
 * normaliza cm→m; el grueso trae unidades inconsistentes entre lotes, a confirmar)
 * y el nº de paquetes/tablas en crudo; el m² de aserrado viene del parte real:
 * no se interpreta nada que no esté en la fuente. Valores con
 * su unidad al lado; todo lo que la fuente no trae se pinta "—".
 */
@Component({
  selector: 'fabric-tablas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialDotComponent],
  template: `
    <section class="panel">
      <div class="panel-head filtros">
        <div class="fila-filtros">
          <input
            type="search"
            class="control control-busqueda"
            placeholder="Nº de lote"
            aria-label="Buscar por nº de lote"
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
            {{ formatNumero(p.total) }} tablas
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
                  title="Número de lote de la tabla (stock_lot.name o, en las altas, lot_tables_creation.name)."
                >
                  Nº lote
                </th>
                <th>Material</th>
                <th title="Clasificación del lote (type_product_lot)">Tipo</th>
                <th title="Ubicación física en el almacén (stock_location)">Ubicación</th>
                <th class="derecha" [title]="tituloMedidas">Medidas</th>
                <th class="derecha" title="Nº de paquetes del lote (packages_tables)">Paquetes</th>
                <th class="derecha" title="Nº de tablas del lote (qty_creation); significado exacto pendiente de confirmar">
                  Tablas
                </th>
                <th class="derecha" [title]="tituloM2">m²</th>
                <th title="Acabado del lote (finished)">Acabado</th>
              </tr>
            </thead>
            <tbody>
              @for (fila of p.items; track fila.id) {
                <tr>
                  <td class="num">{{ fechaHora(fila.createDate) }}</td>
                  <td class="derecha num lote">{{ fila.name ?? '—' }}</td>
                  <td>
                    @if (fila.materialNombre !== null) {
                      <button
                        type="button"
                        class="celda-clicable celda-material"
                        (click)="setMaterial(fila.materialNombre)"
                        title="Filtrar por {{ fila.materialNombre }}"
                      >
                        <fabric-material-dot [nombre]="fila.materialNombre" [tam]="11" />
                        {{ fila.materialNombre }}
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
                        title="Paquete de tablas recibido recientemente (registrado en el alta de entrada), aún sin existencias en el stock de Odoo. Se cuenta en el inventario hasta que se da entrada al stock o sale."
                        >Recepción reciente</span
                      >
                    } @else if (fila.fuente === 'aserrado') {
                      <span
                        class="tag-aserrado"
                        title="Tablas reales producidas en el parte de paquetes del telar, pendientes de alta o depuración en Odoo. No garantiza stock actual depurado."
                        >Aserrado pendiente de Odoo</span
                      >
                    } @else {
                      <span class="soft">—</span>
                    }
                  </td>
                  <td class="derecha num">{{ medidas(fila.largo, fila.alto, fila.grueso) }}</td>
                  <td class="derecha num">{{ entero(fila.paquetes) }}</td>
                  <td class="derecha num">{{ entero(fila.nTablas) }}</td>
                  <td class="derecha num">{{ areaM2(fila.m2) }}</td>
                  <td>
                    @if (fila.acabado) {
                      {{ fila.acabado }}
                    } @else {
                      <span class="soft">—</span>
                    }
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
    .lote {
      font-weight: 750;
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
    /* Procedencia sin ubicación Odoo: alta reciente o aserrado pendiente. */
    .tag-reciente,
    .tag-aserrado {
      display: inline-flex;
      align-items: center;
      padding: 1px 8px;
      border-radius: var(--radius-pill);
      font-size: 11px;
      font-weight: 650;
      white-space: nowrap;
      cursor: help;
    }
    .tag-reciente {
      border: 1px solid var(--amber);
      color: var(--amber);
    }
    .tag-aserrado {
      border: 1px solid var(--teal);
      color: var(--teal);
    }
  `
})
export class TablasComponent {
  private readonly api = inject(FabricApi);
  readonly fuenteDatos = inject(FuenteDatosService);

  readonly formatNumero = formatNumero;
  readonly tituloMedidas = 'largo × alto × grueso, en metros; el grueso llega con unidades inconsistentes en algunos lotes (a confirmar)';
  readonly tituloM2 = 'Superficie en m². En las altas = nº de tablas × largo × alto; en aserrado viene del parte real; en el stock on-hand va "—" hasta confirmar el recuento';

  readonly q = signal<string | null>(null);
  readonly material = signal<string | null>(null);
  readonly desde = signal<string | null>(null);
  readonly hasta = signal<string | null>(null);

  readonly offset = signal(0);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly pagina = signal<PaginaInventarioTablas | null>(null);

  readonly materiales = computed(() => {
    const lista = this.pagina()?.materiales ?? [];
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

  /** Superficie en m² con su unidad (lo trae el backend/mock); "—" si la fuente no la da. */
  areaM2(valor: number | null): string {
    return formatValorUnidad(valor, 'm²', 2);
  }

  /** Conteo entero (paquetes/tablas) en crudo; "—" si falta. */
  entero(valor: number | null): string {
    return valor == null ? '—' : formatNumero(valor, 0);
  }

  /**
   * Medidas de la tabla en metros (el backend ya normaliza). Decimales adaptativos
   * para no aplastar el grueso (ver doc de la clase sobre su unidad inconsistente).
   */
  medidas(largo: number | null, alto: number | null, grueso: number | null): string {
    if (largo == null && alto == null && grueso == null) {
      return '—';
    }
    const f = (v: number | null) =>
      v == null ? '—' : formatNumero(v, v !== 0 && Math.abs(v) < 10 ? 2 : 0);
    return `${f(largo)} × ${f(alto)} × ${f(grueso)} m`;
  }

  /** Etiqueta legible del `type_product_lot` (tablas o losas). */
  etiquetaTipo(tipo: TipoTabla): string {
    return tipo === 'slabs' ? 'Losa' : 'Tabla';
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
    this.api.getInventarioTablas({ ...filtros, limit: LIMIT }).subscribe({
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
