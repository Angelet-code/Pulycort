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
import {
  CoberturaMaquina,
  CoberturaMaquinas,
  EstadoIntegracion
} from '../../core/models';
import { rangoPresentacionMaquina } from '../../core/catalogo-maquinas';

const REFRESCO_MS = 60_000;

const ETIQUETA_ESTADO: Record<EstadoIntegracion, string> = {
  integrada: 'Integrada',
  parcial: 'Parcial',
  pendiente: 'Pendiente'
};

/**
 * Mapa de cobertura de las máquinas de planta: para cada máquina del catálogo
 * (sala de aserrado M3 + sala de máquinas M2) muestra de qué tabla real sale su
 * dato y en qué estado está su integración en Fabric. El catálogo y el volumen
 * (filas/lotes/última actividad) los da el backend; aquí solo se pintan. Lo que
 * no tiene fuente llega en null y se pinta como "—": no se inventa cobertura.
 */
@Component({
  selector: 'fabric-cobertura-maquinas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <div class="panel-head">
        <p class="intro soft">
          Una fila por máquina del catálogo de planta. La fuente de datos y el
          volumen real (filas, lotes, última actividad) los calcula el backend;
          lo que aún no tiene fuente conectada queda como pendiente, sin inventar.
        </p>
        @if (cobertura(); as c) {
          <div class="resumen">
            <span class="chip-estado estado-integrada">
              {{ conteo('integrada') }} integradas
            </span>
            <span class="chip-estado estado-parcial">
              {{ conteo('parcial') }} parciales
            </span>
            <span class="chip-estado estado-pendiente">
              {{ conteo('pendiente') }} pendientes
            </span>
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
      @if (cargando() && !cobertura()) {
        <div class="aviso">Cargando el catálogo de máquinas…</div>
      } @else if (cobertura()) {
        <div class="tabla-scroll" [class.actualizando]="cargando()">
          <table class="tabla">
            <thead>
              <tr>
                <th class="derecha">#</th>
                <th>Máquina</th>
                <th>Estado</th>
                <th>Fuente de datos</th>
                <th class="derecha">Filas</th>
                <th class="derecha">Lotes</th>
                <th class="derecha">Última actividad</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              @for (m of maquinasOrdenadas(); track m.codigo) {
                <tr>
                  <td class="derecha num soft">{{ m.codigo }}</td>
                  <td class="nombre">{{ m.nombre }}</td>
                  <td>
                    <span class="chip-estado" [class]="claseEstado(m.estado)">
                      {{ etiquetaEstado(m.estado) }}
                    </span>
                  </td>
                  <td>
                    @if (m.fuenteDatos) {
                      <code class="fuente">{{ m.fuenteDatos }}</code>
                    } @else {
                      <span class="soft">—</span>
                    }
                  </td>
                  <td class="derecha num">{{ num(m.filas) }}</td>
                  <td class="derecha num">{{ num(m.lotes) }}</td>
                  <td class="derecha num">{{ fecha(m.ultimaActividad) }}</td>
                  <td class="nota soft">{{ m.nota ?? '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .intro {
      margin: 0;
      max-width: 70ch;
      font-size: 12.5px;
      line-height: 1.45;
    }
    .panel-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .resumen {
      display: inline-flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .nombre {
      font-weight: 600;
    }
    .fuente {
      font-family: var(--font-mono);
      font-size: 11.5px;
      color: var(--text-muted);
    }
    .nota {
      font-size: 11.5px;
      line-height: 1.4;
      max-width: 46ch;
      white-space: normal;
    }
    .chip-estado {
      display: inline-flex;
      align-items: center;
      padding: 3px 9px;
      border-radius: var(--radius-pill);
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 650;
      white-space: nowrap;
      border: 1px solid transparent;
    }
    .estado-integrada {
      color: var(--green);
      border-color: color-mix(in srgb, var(--green) 45%, transparent);
      background: color-mix(in srgb, var(--green) 14%, transparent);
    }
    .estado-parcial {
      color: var(--amber);
      border-color: color-mix(in srgb, var(--amber) 45%, transparent);
      background: color-mix(in srgb, var(--amber) 14%, transparent);
    }
    .estado-pendiente {
      color: var(--text-muted);
      border-color: var(--line-strong);
      background: var(--surface-soft);
    }
  `
})
export class CoberturaMaquinasComponent {
  private readonly api = inject(FabricApi);
  readonly fuenteDatos = inject(FuenteDatosService);

  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly cobertura = signal<CoberturaMaquinas | null>(null);

  /**
   * Máquinas en orden de presentación: las que ya tienen datos primero (telar →
   * discopuente → reforzadora → resto) y las pendientes al final. Mismo criterio
   * que la sala de máquinas (`rangoPresentacionMaquina`), en una lista única.
   */
  readonly maquinasOrdenadas = computed<CoberturaMaquina[]>(() =>
    [...(this.cobertura()?.maquinas ?? [])].sort(
      (a, b) =>
        rangoPresentacionMaquina(a.familia, a.estado === 'pendiente', a.codigo) -
        rangoPresentacionMaquina(b.familia, b.estado === 'pendiente', b.codigo)
    )
  );

  constructor() {
    // Recarga al cambiar la fuente de datos y refresca cada minuto.
    effect((onCleanup) => {
      this.fuenteDatos.fuente();
      this.cargar();
      const intervalo = setInterval(() => this.cargar(), REFRESCO_MS);
      onCleanup(() => clearInterval(intervalo));
    });
  }

  conteo(estado: EstadoIntegracion): number {
    return (this.cobertura()?.maquinas ?? []).filter((m) => m.estado === estado).length;
  }

  claseEstado(estado: EstadoIntegracion): string {
    return `estado-${estado}`;
  }

  etiquetaEstado(estado: EstadoIntegracion): string {
    return ETIQUETA_ESTADO[estado];
  }

  num(valor: number | null): string {
    return formatNumero(valor);
  }

  fecha(iso: string | null): string {
    return formatFechaHoraAnio(iso);
  }

  private cargar(): void {
    this.cargando.set(true);
    this.api.getCoberturaMaquinas().subscribe({
      next: (cobertura) => {
        this.cobertura.set(cobertura);
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
