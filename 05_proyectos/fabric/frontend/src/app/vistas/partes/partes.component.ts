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
import { formatFechaHoraAnio, formatNumero } from '../../core/format';
import { materialPorId } from '../../core/materiales';
import { PaginaLecturas } from '../../core/models';
import { MaterialDotComponent } from '../../shared/material-dot.component';
import { MetricaComponent } from '../../shared/metrica.component';

const LIMIT = 50;
const REFRESCO_MS = 60_000;
const TELARES = ['1', '2', '3', '4'] as const;

/**
 * Partes de producción: el registro en crudo de lecturas de los telares, con
 * las columnas de la tabla real `produccion_mapeada`. En fuente real los
 * datos vienen de la BD de las máquinas; en demo, de la simulación con la
 * misma forma. Valores sin interpretar (códigos y unidades de la máquina).
 */
@Component({
  selector: 'fabric-partes',
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
            {{ formatNumero(p.total) }} lecturas
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
        <div class="aviso">Cargando lecturas…</div>
      } @else if (pagina()) {
        @if (pagina()!; as p) {
        <div class="tabla-scroll" [class.actualizando]="cargando()">
          <table class="tabla">
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Telar</th>
                <th class="derecha">PM / lote</th>
                <th>Material</th>
                <th class="derecha" title="medida de consola, unidad cm asumida (pendiente de confirmar)">Largo</th>
                <th class="derecha" title="medida de consola, unidad cm asumida (pendiente de confirmar)">Alto</th>
                <th class="derecha" title="medida de consola, unidad cm asumida (pendiente de confirmar)">Grueso</th>
                <th class="derecha">Potencia</th>
                <th class="derecha">Velocidad</th>
                <th class="derecha" title="se asume amperios (pendiente de confirmar)">Consumo</th>
                <th class="derecha">Golpes</th>
                <th class="derecha">Altura act.</th>
                <th>Incid.</th>
              </tr>
            </thead>
            <tbody>
              @for (fila of p.items; track fila.id) {
                <tr>
                  <td class="num">{{ fechaHora(fila.fechaHora) }}</td>
                  <td>
                    @if (fila.telarN) {
                      <button
                        type="button"
                        class="celda-clicable telar"
                        [style.color]="'var(--t' + fila.telarN + ')'"
                        (click)="setTelar(fila.telarN)"
                        title="Filtrar por el telar {{ fila.telarN }}"
                      >T{{ fila.telarN }}</button>
                    } @else {
                      <span class="soft">—</span>
                    }
                  </td>
                  <td class="derecha num">{{ num(fila.pmLote ?? fila.nBloque) }}</td>
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
                  <td class="derecha"><fabric-metrica [valor]="fila.largo" unidad="cm" [tam]="13" /></td>
                  <td class="derecha"><fabric-metrica [valor]="fila.alto" unidad="cm" [tam]="13" /></td>
                  <td class="derecha"><fabric-metrica [valor]="fila.grueso" unidad="cm" [tam]="13" /></td>
                  <td class="derecha"><fabric-metrica [valor]="fila.potencia" unidad="kW" [decimales]="1" [tam]="13" /></td>
                  <td class="derecha"><fabric-metrica [valor]="fila.velocidad" unidad="mm/h" [tam]="13" /></td>
                  <td class="derecha"><fabric-metrica [valor]="fila.consumo" unidad="A" [tam]="13" /></td>
                  <td class="derecha"><fabric-metrica [valor]="fila.golpesXMinuto" unidad="golpes/min" [tam]="13" /></td>
                  <td class="derecha"><fabric-metrica [valor]="fila.alturaActual" unidad="mm" [tam]="13" /></td>
                  <td class="soft">{{ fila.incidencia ?? '—' }}</td>
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
  `
})
export class PartesComponent {
  private readonly api = inject(FabricApi);
  readonly fuenteDatos = inject(FuenteDatosService);

  readonly telares = TELARES;
  readonly formatNumero = formatNumero;

  readonly telar = signal<string | null>(null);
  readonly material = signal<string | null>(null);
  readonly desde = signal<string | null>(null);
  readonly hasta = signal<string | null>(null);
  readonly offset = signal(0);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly pagina = signal<PaginaLecturas | null>(null);

  /** Materiales de toda la fuente (vienen en la página), ordenados por nombre. */
  readonly materiales = computed(() => {
    const lista = this.pagina()?.materiales ?? [];
    return [...lista].sort((a, b) =>
      materialPorId(String(a)).nombre.localeCompare(materialPorId(String(b)).nombre, 'es')
    );
  });

  readonly hayFiltros = computed(
    () =>
      this.telar() !== null ||
      this.material() !== null ||
      this.desde() !== null ||
      this.hasta() !== null
  );

  constructor() {
    // Recarga al cambiar cualquier filtro, la página o la fuente de datos,
    // y refresca cada minuto (las lecturas llegan cada ~10 min).
    effect((onCleanup) => {
      const filtros = {
        telarN: this.telar(),
        material: this.material(),
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

  idMaterial(valor: number | string): string {
    return String(valor);
  }

  nombreMaterial(valor: number | string): string {
    return materialPorId(String(valor)).nombre;
  }

  fechaHora(iso: string | null): string {
    return formatFechaHoraAnio(iso);
  }

  private cargar(filtros: {
    telarN: string | null;
    material: string | null;
    desde: string | null;
    hasta: string | null;
    offset: number;
  }): void {
    this.cargando.set(true);
    this.api.getLecturas({ ...filtros, limit: LIMIT }).subscribe({
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
