import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { FabricApi } from '../../core/fabric-api';
import { FuenteDatosService } from '../../core/fuente-datos.service';
import { ETIQUETA_EVENTO } from '../../core/etiquetas';
import { formatFechaHoraAnio, formatNumero } from '../../core/format';
import { materialPorId } from '../../core/materiales';
import { PaginaPartesTrabajo, TipoEvento } from '../../core/models';
import { MaterialDotComponent } from '../../shared/material-dot.component';
import { MetricaComponent } from '../../shared/metrica.component';

const LIMIT = 50;
const REFRESCO_MS = 60_000;
const TELARES = ['1', '2', '3', '4'] as const;

/**
 * Partes de trabajo: el registro de los operarios tal cual está en la tabla
 * real `parte_trabajo_mapeada`. La operación '4' (la única con paquetes,
 * tablas y m²) es "hacer paquetes" deducido de los datos; el resto de
 * códigos de operación están pendientes de la tabla de significados
 * (00_gestion/TAREAS.md). Valores en crudo, sin interpretar.
 */
@Component({
  selector: 'fabric-partes-trabajo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialDotComponent, MetricaComponent],
  template: `
    <section class="panel">
      <div class="panel-head filtros">
        <div class="fila-filtros">
          <div class="seg" role="tablist" aria-label="Filtrar por telar">
            <button
              type="button"
              [class.activo]="telar() === null"
              (click)="setTelar(null)"
            >
              Todos
            </button>
            @for (t of telares; track t) {
              <button
                type="button"
                [class.activo]="telar() === t"
                [style.background-color]="telar() === t ? 'var(--t' + t + ')' : null"
                [attr.aria-label]="'Telar ' + t"
                [attr.title]="'Telar ' + t"
                (click)="setTelar(t)"
              >
                T{{ t }}
              </button>
            }
          </div>

          <select
            class="control"
            aria-label="Filtrar por operación"
            [value]="operacion() ?? ''"
            (change)="setOperacion(valorDe($event) || null)"
          >
            <option value="">Todas las operaciones</option>
            @for (o of operaciones(); track o) {
              <option [value]="o">{{ nombreOperacion(o) }}</option>
            }
          </select>

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
            {{ formatNumero(p.total) }} partes
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
        <div class="aviso">Cargando partes…</div>
      } @else if (pagina()) {
        @if (pagina()!; as p) {
        <div class="tabla-scroll" [class.actualizando]="cargando()">
          <table class="tabla">
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Telar</th>
                <th>Operación</th>
                <th class="derecha">PM / lote</th>
                <th>Material</th>
                <th class="derecha">Medidas fuente (cm)</th>
                <th class="derecha">m³</th>
                <th class="derecha">Paq.</th>
                <th class="derecha">Tablas</th>
                <th class="derecha">Medidas tabla</th>
                <th class="derecha">m² tablas</th>
              </tr>
            </thead>
            <tbody>
              @for (fila of p.items; track fila.id) {
                <tr>
                  <td class="num">{{ fechaHora(fila.fechaHora) }}</td>
                  <td>
                    @if (fila.nTelar && esTelarConocido(fila.nTelar)) {
                      <button
                        type="button"
                        class="celda-clicable telar"
                        [style.color]="'var(--t' + fila.nTelar + ')'"
                        (click)="setTelar(fila.nTelar)"
                        title="Filtrar por el telar {{ fila.nTelar }}"
                      >T{{ fila.nTelar }}</button>
                    } @else {
                      <span class="soft">{{ fila.nTelar ?? '—' }}</span>
                    }
                  </td>
                  <td>
                    @if (fila.operacion !== null) {
                      <button
                        type="button"
                        class="celda-clicable"
                        (click)="setOperacion(fila.operacion)"
                        title="Filtrar por esta operación"
                      >{{ nombreOperacion(fila.operacion) }}</button>
                    } @else {
                      <span class="soft">—</span>
                    }
                  </td>
                  <td class="derecha num">
                    {{ num(fila.pmLote ?? fila.nBloque) }}
                    @if (fila.nBloque !== null && fila.nBloque > 0 && !fila.bloqueConocido) {
                      <span
                        class="aviso-bloque"
                        title="PM/lote no registrado en el padrón de máquina (bloque_maquinas)"
                      >⚠</span>
                    }
                  </td>
                  <td>
                    @if (fila.material !== null) {
                      <button
                        type="button"
                        class="celda-clicable celda-material"
                        (click)="setMaterial(idMaterial(fila.material))"
                        title="Filtrar por {{ nombreMaterial(fila.material) }}"
                      >
                        <fabric-material-dot [materialId]="idMaterial(fila.material)" [tam]="11" />
                        {{ nombreMaterial(fila.material) }}
                      </button>
                    } @else {
                      <span class="soft">—</span>
                    }
                  </td>
                  <td class="derecha num">{{ medidas(fila.largo, fila.alto, fila.grueso) }}</td>
                  <td class="derecha"><fabric-metrica [valor]="fila.metrosCubicos" unidad="m³" [decimales]="2" [tam]="13" /></td>
                  <td class="derecha"><fabric-metrica [valor]="fila.nPaquete" unidad="paq." [tam]="13" /></td>
                  <td class="derecha"><fabric-metrica [valor]="fila.nTablas" unidad="tablas" [tam]="13" /></td>
                  <td class="derecha num">{{ medidas(fila.largoTablas, fila.altoTablas, fila.gruesoTablas) }}</td>
                  <td class="derecha"><fabric-metrica [valor]="fila.metrosCuadradosTablas" unidad="m²" [decimales]="1" [tam]="13" /></td>
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
       Aquí solo lo propio de la vista. El control segmentado .seg se queda
       local: ese nombre colisiona con el .seg de linea-jornada. */
    .seg {
      display: inline-flex;
      gap: 4px;
      padding: 4px;
      background: var(--surface-soft);
      border: 1px solid var(--line);
      border-radius: var(--radius-pill);
      flex-wrap: wrap;
    }
    .seg button {
      border: none;
      background: transparent;
      color: var(--text-muted);
      border-radius: var(--radius-pill);
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 650;
      transition: background 0.2s ease, color 0.2s ease;
    }
    .seg button:hover {
      color: var(--text);
    }
    .seg button.activo {
      background: var(--stone);
      color: var(--on-stone);
    }
    .total {
      font-size: 12.5px;
    }
    .telar {
      font-weight: 750;
    }
    .aviso-bloque {
      margin-left: 5px;
      color: var(--amber);
      font-size: 11px;
      cursor: help;
    }
  `
})
export class PartesTrabajoComponent {
  private readonly api = inject(FabricApi);
  readonly fuenteDatos = inject(FuenteDatosService);

  readonly telares = TELARES;
  readonly formatNumero = formatNumero;

  readonly telar = signal<string | null>(null);
  readonly material = signal<string | null>(null);
  readonly operacion = signal<string | null>(null);
  readonly desde = signal<string | null>(null);
  readonly hasta = signal<string | null>(null);
  readonly offset = signal(0);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly pagina = signal<PaginaPartesTrabajo | null>(null);

  readonly materiales = computed(() => {
    const lista = this.pagina()?.materiales ?? [];
    return [...lista].sort((a, b) =>
      materialPorId(String(a)).nombre.localeCompare(materialPorId(String(b)).nombre, 'es')
    );
  });

  readonly operaciones = computed(() => this.pagina()?.operaciones ?? []);

  readonly hayFiltros = computed(
    () =>
      this.telar() !== null ||
      this.material() !== null ||
      this.operacion() !== null ||
      this.desde() !== null ||
      this.hasta() !== null
  );

  constructor() {
    // Recarga al cambiar cualquier filtro, la página o la fuente de datos,
    // y refresca cada minuto.
    effect((onCleanup) => {
      const filtros = {
        telarN: this.telar(),
        material: this.material(),
        operacion: this.operacion(),
        desde: this.desde(),
        hasta: this.hasta(),
        offset: this.offset()
      };
      this.fuenteDatos.fuente();
      this.cargar(filtros);
      const intervalo = setInterval(() => this.cargar(filtros), REFRESCO_MS);
      onCleanup(() => clearInterval(intervalo));
    });
  }

  valorDe(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLSelectElement).value;
  }

  esTelarConocido(t: string): boolean {
    return (TELARES as readonly string[]).includes(t);
  }

  setTelar(t: string | null): void {
    if (this.telar() === t) {
      return;
    }
    this.offset.set(0);
    this.telar.set(t);
  }

  setMaterial(m: string | null): void {
    if (this.material() === m) {
      return;
    }
    this.offset.set(0);
    this.material.set(m);
  }

  setOperacion(o: string | null): void {
    if (this.operacion() === o) {
      return;
    }
    this.offset.set(0);
    this.operacion.set(o);
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
    this.telar.set(null);
    this.material.set(null);
    this.operacion.set(null);
    this.desde.set(null);
    this.hasta.set(null);
  }

  anterior(): void {
    this.offset.set(Math.max(this.offset() - LIMIT, 0));
  }

  siguiente(): void {
    this.offset.set(this.offset() + LIMIT);
  }

  num(valor: number | null): string {
    return formatNumero(valor);
  }

  /**
   * Medidas en crudo. La tabla real mezcla unidades (filas en cm y filas en
   * metros — TAREAS.md): decimales adaptativos para no aplastar los metros.
   */
  medidas(largo: number | null, alto: number | null, grueso: number | null): string {
    if (!largo && !alto && !grueso) {
      return '—';
    }
    const f = (v: number | null) =>
      v == null ? '—' : formatNumero(v, v !== 0 && Math.abs(v) < 10 ? 2 : 0);
    return `${f(largo)} × ${f(alto)} × ${f(grueso)}`;
  }

  idMaterial(valor: number | string): string {
    return String(valor);
  }

  nombreMaterial(valor: number | string): string {
    return materialPorId(String(valor)).nombre;
  }

  /** En demo la operación es el nombre del evento; en real, un código. */
  nombreOperacion(operacion: string): string {
    const etiqueta = ETIQUETA_EVENTO[operacion as TipoEvento];
    if (etiqueta) {
      return etiqueta;
    }
    // Código real sin tabla de significados; el '4' se deduce de los datos
    // (única operación con paquetes/tablas/m²). Pendiente de confirmar.
    return operacion === '4' ? 'Op. 4 · paquetes' : `Op. ${operacion}`;
  }

  fechaHora(iso: string | null): string {
    return formatFechaHoraAnio(iso);
  }

  private cargar(filtros: {
    telarN: string | null;
    material: string | null;
    operacion: string | null;
    desde: string | null;
    hasta: string | null;
    offset: number;
  }): void {
    this.cargando.set(true);
    this.api.getPartesTrabajo({ ...filtros, limit: LIMIT }).subscribe({
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
