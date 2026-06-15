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
import { PaginaPartesReforzadora } from '../../core/models';
import { MaterialDotComponent } from '../../shared/material-dot.component';
import { MetricaComponent } from '../../shared/metrica.component';

const LIMIT = 50;
const REFRESCO_MS = 60_000;

/**
 * Partes de la reforzadora de tablas: el registro de la máquina que refuerza las
 * tablas (malla + resina) tal cual está en la tabla real `reforzadora_mapeada`.
 * Valores en crudo, sin interpretar: `acabado` y `eventos` son códigos de TotWare
 * sin tabla de significados confirmada; `n_reforzadora` HOY solo trae '1' (no
 * separa REFORZADORA 1 de REFORZADORA 2 SEI). `m²` lo deriva el backend de
 * n_tablas × largo × alto. Lo que la fuente no trae se enseña como "—".
 */
@Component({
  selector: 'fabric-partes-reforzadora',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialDotComponent, MetricaComponent],
  template: `
    <section class="panel">
      <div class="panel-head filtros">
        <div class="fila-filtros">
          <select
            class="control"
            aria-label="Filtrar por reforzadora"
            [value]="reforzadora() ?? ''"
            (change)="setReforzadora(valorDe($event) || null)"
          >
            <option value="">Todas las reforzadoras</option>
            @for (r of reforzadoras(); track r) {
              <option [value]="r">Reforzadora {{ r }}</option>
            }
          </select>

          <select
            class="control"
            aria-label="Filtrar por acabado"
            [value]="acabado() ?? ''"
            (change)="setAcabado(valorDe($event) || null)"
          >
            <option value="">Todos los acabados</option>
            @for (a of acabados(); track a) {
              <option [value]="a">{{ nombreAcabado(a) }}</option>
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
            <input type="date" [value]="desde() ?? ''" (change)="setDesde(valorDe($event) || null)" />
          </label>
          <label class="control control-fecha">
            <span class="soft">Hasta</span>
            <input type="date" [value]="hasta() ?? ''" (change)="setHasta(valorDe($event) || null)" />
          </label>

          @if (hayFiltros()) {
            <button type="button" class="limpiar" (click)="limpiarFiltros()">
              ✕ Limpiar filtros
            </button>
          }
        </div>
        @if (pagina(); as p) {
          <span class="muted total num">{{ formatNumero(p.total) }} partes</span>
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
        @if (p.items.length === 0) {
          <div class="estado-vacio">No hay partes de la reforzadora para estos filtros.</div>
        } @else {
        <div class="tabla-scroll" [class.actualizando]="cargando()">
          <table class="tabla">
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Reforzadora</th>
                <th>Acabado</th>
                <th class="derecha">PM / lote</th>
                <th>Material</th>
                <th class="derecha">Tablas</th>
                <th class="derecha">Medidas tabla (cm)</th>
                <th class="derecha">m²</th>
                <th class="derecha">Evento</th>
              </tr>
            </thead>
            <tbody>
              @for (fila of p.items; track fila.id) {
                <tr>
                  <td class="num">
                    {{ fechaHora(fila.fechaHora) }}
                    @if (fila.sospechosa) {
                      <span class="aviso-bloque" [title]="fila.motivosSospecha.join(' · ')">⚠</span>
                    }
                  </td>
                  <td>
                    @if (fila.nReforzadora !== null) {
                      <button
                        type="button"
                        class="celda-clicable"
                        (click)="setReforzadora(fila.nReforzadora)"
                        title="Filtrar por la reforzadora {{ fila.nReforzadora }}"
                      >Reforzadora {{ fila.nReforzadora }}</button>
                    } @else {
                      <span class="soft">—</span>
                    }
                  </td>
                  <td>
                    @if (fila.acabado !== null) {
                      <button
                        type="button"
                        class="celda-clicable"
                        (click)="setAcabado(fila.acabado)"
                        title="Filtrar por este acabado"
                      >{{ nombreAcabado(fila.acabado) }}</button>
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
                  <td class="derecha"><fabric-metrica [valor]="fila.nTablas" unidad="tablas" [tam]="13" /></td>
                  <td class="derecha num">{{ medidas(fila.largo, fila.alto, fila.grueso) }}</td>
                  <td class="derecha"><fabric-metrica [valor]="fila.metrosCuadrados" unidad="m²" [decimales]="1" [tam]="13" /></td>
                  <td class="derecha num">{{ fila.eventos ?? '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="paginacion">
          <button type="button" [disabled]="offset() === 0" (click)="anterior()">← Anteriores</button>
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
    .total {
      font-size: 12.5px;
    }
    .aviso-bloque {
      margin-left: 5px;
      color: var(--amber);
      font-size: 11px;
      cursor: help;
    }
  `
})
export class PartesReforzadoraComponent {
  private readonly api = inject(FabricApi);
  readonly fuenteDatos = inject(FuenteDatosService);

  readonly formatNumero = formatNumero;

  readonly reforzadora = signal<string | null>(null);
  readonly material = signal<string | null>(null);
  readonly acabado = signal<string | null>(null);
  readonly desde = signal<string | null>(null);
  readonly hasta = signal<string | null>(null);
  readonly offset = signal(0);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly pagina = signal<PaginaPartesReforzadora | null>(null);

  readonly reforzadoras = computed(() => this.pagina()?.reforzadoras ?? []);

  readonly materiales = computed(() => {
    const lista = this.pagina()?.materiales ?? [];
    return [...lista].sort((a, b) =>
      materialPorId(String(a)).nombre.localeCompare(materialPorId(String(b)).nombre, 'es')
    );
  });

  readonly acabados = computed(() => this.pagina()?.acabados ?? []);

  readonly hayFiltros = computed(
    () =>
      this.reforzadora() !== null ||
      this.material() !== null ||
      this.acabado() !== null ||
      this.desde() !== null ||
      this.hasta() !== null
  );

  constructor() {
    // Recarga al cambiar cualquier filtro, la página o la fuente, y refresca
    // cada minuto.
    effect((onCleanup) => {
      const filtros = {
        reforzadora: this.reforzadora(),
        material: this.material(),
        acabado: this.acabado(),
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

  setReforzadora(r: string | null): void {
    if (this.reforzadora() === r) {
      return;
    }
    this.offset.set(0);
    this.reforzadora.set(r);
  }

  setMaterial(m: string | null): void {
    if (this.material() === m) {
      return;
    }
    this.offset.set(0);
    this.material.set(m);
  }

  setAcabado(a: string | null): void {
    if (this.acabado() === a) {
      return;
    }
    this.offset.set(0);
    this.acabado.set(a);
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
    this.reforzadora.set(null);
    this.material.set(null);
    this.acabado.set(null);
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
   * Medidas de tabla. El rango observado en `reforzadora_mapeada` (largo ~160-330,
   * grueso ~1-3) las respalda como cm, pero la unidad oficial está pendiente de
   * confirmar con TotWare (ver TAREAS.md): no se afirma como dato cerrado.
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

  /** Código de acabado sin tabla de significados confirmada (no se interpreta). */
  nombreAcabado(acabado: string): string {
    return `Acabado ${acabado}`;
  }

  fechaHora(iso: string | null): string {
    return formatFechaHoraAnio(iso);
  }

  private cargar(filtros: {
    reforzadora: string | null;
    material: string | null;
    acabado: string | null;
    desde: string | null;
    hasta: string | null;
    offset: number;
  }): void {
    this.cargando.set(true);
    this.api.getPartesReforzadora({ ...filtros, limit: LIMIT }).subscribe({
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
