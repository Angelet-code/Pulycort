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
import { PaginaPartesDiscoPuente, ParteDiscoPuenteCrudo } from '../../core/models';
import { MaterialDotComponent } from '../../shared/material-dot.component';
import { MaterialSelectComponent } from '../../shared/material-select.component';
import { MetricaComponent } from '../../shared/metrica.component';

const LIMIT = 50;
const REFRESCO_MS = 60_000;

/**
 * Partes del disco puente: el registro de la máquina puente (recorta las tablas
 * que salen del telar) tal cual está en la tabla real `parte_discopuente_mapeada`.
 * Valores en crudo, sin interpretar: `operacion` y `acabado` son códigos/textos
 * de TotWare sin tabla de significados confirmada; `metro2Entrada/Salida` y la
 * eficiencia llegan ya calculados por el mapeador. Lo que la fuente no trae se
 * enseña como "—" (no se inventa).
 */
@Component({
  selector: 'fabric-partes-disco-puente',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialDotComponent, MaterialSelectComponent, MetricaComponent],
  template: `
    <section class="panel">
      <div class="panel-head filtros">
        <div class="fila-filtros">
          <input
            type="search"
            class="control control-busqueda"
            placeholder="Nº de lote"
            aria-label="Buscar por nº de lote"
            [value]="lote() ?? ''"
            (change)="setLote(valorDe($event) || null)"
          />

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

          <fabric-material-select
            [materiales]="materiales()"
            [seleccion]="material()"
            (seleccionChange)="setMaterial($event)"
          />

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

      <p class="nota-gomez soft">
        Todos los partes son del disco puente Gómez, el único integrado (Terzago y
        Cáñigo aún sin PLC).
      </p>

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
        @if (p.items.length === 0) {
          <div class="estado-vacio">No hay partes del disco puente para estos filtros.</div>
        } @else {
        <div class="tabla-scroll" [class.actualizando]="cargando()">
          <table class="tabla">
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Operación</th>
                <th class="derecha">Nº de lote</th>
                <th>Material</th>
                <th>Acabado</th>
                <th class="derecha">Medidas fuente (cm)</th>
                <th class="derecha">Paq.</th>
                <th class="derecha">Tablas</th>
                <th class="derecha">m² entrada</th>
                <th class="derecha">m² salida</th>
                <th class="derecha">Eficiencia</th>
              </tr>
            </thead>
            <tbody>
              @for (fila of p.items; track fila.id) {
                <tr>
                  <td class="num">
                    {{ fechaHora(fila.fechaHora) }}
                    @if (fila.fechaRemapeada) {
                      <span class="es-remapeada" [title]="tituloRemapeo(fila)">↻ año corregido</span>
                    }
                    @if (fila.sospechosa) {
                      <span class="aviso-bloque" [title]="fila.motivosSospecha.join(' · ')">⚠</span>
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
                  <td>{{ fila.acabado ?? '—' }}</td>
                  <td class="derecha num">{{ medidas(fila.largo, fila.alto, fila.grueso) }}</td>
                  <td class="derecha"><fabric-metrica [valor]="fila.nPaquete" unidad="paq." [tam]="13" /></td>
                  <td class="derecha"><fabric-metrica [valor]="fila.nTablas" unidad="tablas" [tam]="13" /></td>
                  <td class="derecha"><fabric-metrica [valor]="fila.metro2Entrada" unidad="m²" [decimales]="1" [tam]="13" /></td>
                  <td class="derecha"><fabric-metrica [valor]="fila.metro2Salida" unidad="m²" [decimales]="1" [tam]="13" /></td>
                  <td class="derecha"><fabric-metrica [valor]="fila.eficienciaM2" unidad="%" [decimales]="1" [tam]="13" /></td>
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
      }
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    /* Filtros, controles, celdas y paginación: globales en styles.css. */
    .total {
      font-size: 12.5px;
    }
    .nota-gomez {
      margin: 0;
      font-size: 12px;
      line-height: 1.4;
      max-width: 70ch;
    }
    .aviso-bloque {
      margin-left: 5px;
      color: var(--amber);
      font-size: 11px;
      cursor: help;
    }
    .es-remapeada {
      margin-left: 6px;
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 10.5px;
      white-space: nowrap;
      color: var(--amber);
      border: 1px solid var(--amber);
      cursor: help;
    }
  `
})
export class PartesDiscoPuenteComponent {
  private readonly api = inject(FabricApi);
  readonly fuenteDatos = inject(FuenteDatosService);

  readonly formatNumero = formatNumero;

  readonly lote = signal<string | null>(null);
  readonly material = signal<string | null>(null);
  readonly operacion = signal<string | null>(null);
  readonly desde = signal<string | null>(null);
  readonly hasta = signal<string | null>(null);
  readonly offset = signal(0);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly pagina = signal<PaginaPartesDiscoPuente | null>(null);

  readonly materiales = computed(() => {
    const lista = this.pagina()?.materiales ?? [];
    return [...lista].sort((a, b) =>
      materialPorId(String(a)).nombre.localeCompare(materialPorId(String(b)).nombre, 'es')
    );
  });

  readonly operaciones = computed(() => this.pagina()?.operaciones ?? []);

  readonly hayFiltros = computed(
    () =>
      this.lote() !== null ||
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
        lote: this.lote(),
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

  setLote(l: string | null): void {
    if (this.lote() === l) {
      return;
    }
    this.offset.set(0);
    this.lote.set(l);
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
    this.lote.set(null);
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

  /** Código de operación sin tabla de significados confirmada (no se interpreta). */
  nombreOperacion(operacion: string): string {
    return `Op. ${operacion}`;
  }

  fechaHora(iso: string | null): string {
    return formatFechaHoraAnio(iso);
  }

  /**
   * Texto de la alerta de fecha remapeada: el parte llegó con el año mal
   * estampado (+1) en un lote de carga y el backend lo corrigió restando 1 año.
   */
  tituloRemapeo(fila: ParteDiscoPuenteCrudo): string {
    return (
      `Fecha remapeada: figuraba ${formatFechaHoraAnio(fila.fechaHoraOriginal)} ` +
      `(año mal estampado en un lote de carga); ` +
      `corregida a ${formatFechaHoraAnio(fila.fechaHora)} restando 1 año.`
    );
  }

  private cargar(filtros: {
    lote: string | null;
    material: string | null;
    operacion: string | null;
    desde: string | null;
    hasta: string | null;
    offset: number;
  }): void {
    this.cargando.set(true);
    this.api.getPartesDiscoPuente({ ...filtros, limit: LIMIT }).subscribe({
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
