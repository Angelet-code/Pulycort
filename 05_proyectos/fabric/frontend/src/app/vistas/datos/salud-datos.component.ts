import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, timer } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { FabricApi } from '../../core/fabric-api';
import { FuenteDatosService } from '../../core/fuente-datos.service';
import { ETIQUETA_INCIDENCIA } from '../../core/etiquetas';
import {
  formatFechaHora,
  formatFechaHoraAnio,
  formatNumero,
  formatRelativo
} from '../../core/format';
import { EstadoFuente, FuenteDato, GrupoFuente, LecturaTelar, SaludTelar } from '../../core/models';
import { KpiTileComponent } from '../../shared/kpi-tile.component';
import { DataBadgeComponent } from '../../shared/data-badge.component';
import { MetricaComponent } from '../../shared/metrica.component';

/**
 * Salud del dato: qué lecturas llegan corruptas, de qué telar y por qué.
 * Que el telar 2 salga impecable y el 4 no, ES información: localiza qué
 * sensor o integración hay que arreglar antes de fiarse de los KPIs.
 */
@Component({
  selector: 'fabric-salud-datos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KpiTileComponent, DataBadgeComponent, MetricaComponent],
  template: `
    @if (error()) {
      <div class="banner-error" role="alert">
        ⚠ No se pudo actualizar desde la fuente ({{ error() }}). Reintentando cada 15 s…
      </div>
    }

    @if (salud(); as s) {
      @if (vista() === 'fuentes') {
        <section class="panel">
          <div class="panel-head">
            <h2>Fuentes</h2>
            <span class="soft">de dónde sale cada dato y cómo está funcionando</span>
          </div>
          @if (s.fuentes && s.fuentes.length > 0) {
            @for (grupo of gruposFuentes(s.fuentes); track grupo.titulo) {
              <div class="fuente-grupo">
                <div class="fuente-grupo-cab">
                  <h3>{{ grupo.titulo }}</h3>
                  @if (grupo.subtitulo) {
                    <span class="soft">{{ grupo.subtitulo }}</span>
                  }
                </div>
                <div class="fuentes-grid">
                  @for (fuente of grupo.fuentes; track fuente.tabla) {
                    <article class="fuente-card" [class]="'fuente-' + fuente.estado">
                      <div class="fuente-cab">
                        <span class="punto-fuente"></span>
                        <div class="fuente-id">
                          <h4>{{ fuente.nombre }}</h4>
                          <code>{{ fuente.tabla }}</code>
                        </div>
                        <span class="fuente-badge">{{ etiquetaEstado(fuente.estado) }}</span>
                      </div>
                      <p class="fuente-origen"><span class="soft">Lo introduce:</span> {{ fuente.origen }}</p>
                      <p class="fuente-desc">{{ fuente.descripcion }}</p>
                      <div class="fuente-metricas">
                        <span><span class="num">{{ numero(fuente.registros) }}</span> registros</span>
                        <span class="sep">·</span>
                        <span>actualizada {{ actualizacion(fuente.ultimaActualizacion) }}</span>
                      </div>
                      <p class="fuente-diag">{{ fuente.diagnostico }}</p>
                    </article>
                  }
                </div>
              </div>
            }
            <p class="nota-metodo pie-metodo">
              Todas las tablas de la base de datos que lee Fabric, agrupadas por origen.
              El backend lo calcula todo a partir de ellas y deja en "—" lo que la fuente
              no contiene; nada se estima ni se inventa.
            </p>
          } @else {
            <div class="estado-vacio">
              La fuente actual no informa del estado de sus tablas.
            </div>
          }
        </section>
      } @else {
        <section class="kpi-grid">
          @for (telar of s.telares; track telar.telarId) {
            <fabric-kpi
              [etiqueta]="telar.nombre + ' · lecturas fiables'"
              [valor]="telar.pctFiables"
              unidad="%"
              [decimales]="1"
              [nota]="notaTelar(telar)"
              [tono]="tono(telar.pctFiables)"
            />
          }
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Cuarentena</h2>
            <span class="soft">{{ s.cuarentena.length }} lecturas retenidas (máx. 60)</span>
          </div>
        @if (s.cuarentena.length > 0) {
          <div class="tabla-scroll">
            <table class="tabla tabla-cuarentena">
              <thead>
                <tr>
                  <th>Dato</th>
                  <th>Recibida</th>
                  <th>Telar</th>
                  <th>Fecha declarada</th>
                  <th>Estado</th>
                  <th class="derecha">Golpes</th>
                  <th class="derecha">Amperios</th>
                  <th class="derecha">Potencia</th>
                  <th class="derecha">Altura</th>
                  <th>Motivo del descarte</th>
                </tr>
              </thead>
              <tbody>
                @for (entrada of s.cuarentena; track entrada.lectura.id) {
                  <tr>
                    <td>
                      <fabric-data-badge [sospechosa]="true" [motivos]="entrada.motivos" />
                    </td>
                    <td>{{ fecha(entrada.lectura.recibidaEn) }}</td>
                    <td>
                      <span [style.color]="'var(--t' + entrada.lectura.telarId + ')'">
                        T{{ entrada.lectura.telarId }}
                      </span>
                    </td>
                    <td [class.dato-malo]="fechaSospechosa(entrada.lectura)">
                      {{ fechaAnio(entrada.lectura.fechaHora) }}
                    </td>
                    <td>{{ incidencia(entrada.lectura) }}</td>
                    <td class="derecha">
                      <fabric-metrica [valor]="entrada.lectura.golpesPorMinuto" unidad="golpes/min" [tam]="13" />
                    </td>
                    <td class="derecha">
                      <fabric-metrica [valor]="entrada.lectura.amperios" unidad="A" [tam]="13" />
                    </td>
                    <td class="derecha">
                      <fabric-metrica [valor]="entrada.lectura.potenciaKw" unidad="kW" [decimales]="1" [tam]="13" />
                    </td>
                    <td class="derecha">
                      <fabric-metrica [valor]="entrada.lectura.alturaActualMm" unidad="mm" [tam]="13" />
                    </td>
                    <td class="motivos">{{ entrada.motivos.join(' · ') }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="estado-vacio">Sin lecturas en cuarentena en los últimos 7 días</div>
        }
        <p class="nota-metodo pie-metodo">
          Las lecturas en cuarentena se excluyen de todos los KPIs y gráficos de Fabric; se
          conservan aquí, nunca se borran. Reglas del validador v1: fecha declarada incoherente
          con la recepción, incidencia sin mapear ("Sin nombre"), saltos de altura físicamente
          imposibles, potencia fuera de rango o desacoplada de los amperios, y golpes fuera del
          rango de la máquina.
        </p>
      </section>

      @if (s.partes; as p) {
        <section class="panel">
          <div class="panel-head">
            <h2>Salud de los partes de trabajo</h2>
            <span class="soft">tabla <code>parte_trabajo_mapeada</code> · histórico completo</span>
          </div>
          <div class="resumen-partes">
            <span class="num">{{ numero(p.total) }}</span> partes ·
            <span class="num" [class.dato-malo]="p.sospechosos > 0">{{ numero(p.sospechosos) }}</span>
            con problemas ({{ numero((p.sospechosos / p.total) * 100) }} %)
          </div>
          <table class="tabla tabla-motivos">
            <thead>
              <tr>
                <th>Motivo</th>
                <th class="derecha">Partes afectados</th>
              </tr>
            </thead>
            <tbody>
              @for (motivo of p.motivos; track motivo.motivo) {
                <tr>
                  <td>{{ motivo.motivo }}</td>
                  <td class="derecha num">{{ numero(motivo.numero) }}</td>
                </tr>
              }
            </tbody>
          </table>
          <p class="nota-metodo pie-metodo">
            Problemas detectados en los partes de operario, pendientes de revisar con
            TotWare (ver 00_gestion/TAREAS.md). Los partes con fecha corrupta se cruzan
            con las lecturas por el PM/lote (<code>n_bloque</code>), no por fecha, así que
            no contaminan los KPIs.
          </p>
        </section>
        }
      }
    } @else if (!error()) {
      <div class="cargando"></div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .tabla-cuarentena {
      min-width: 860px;
    }
    .motivos {
      white-space: normal;
      min-width: 230px;
      color: var(--text-muted);
      font-size: 12px;
    }
    .resumen-partes {
      padding: 4px 2px 12px;
      font-size: 13.5px;
      color: var(--text-muted);
    }
    .resumen-partes .num {
      color: var(--text);
      font-weight: 750;
    }
    .tabla-motivos {
      min-width: 360px;
      max-width: 640px;
    }
    .panel-head code {
      font-size: 11.5px;
      background: var(--surface-soft);
      padding: 1px 6px;
      border-radius: 6px;
    }
    .dato-malo {
      color: var(--amber);
      font-weight: 650;
    }
    .pie-metodo {
      margin-top: 12px;
    }

    /* ── Fuentes ──────────────────────────────────────────── */
    .fuente-grupo {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .fuente-grupo + .fuente-grupo {
      margin-top: 20px;
    }
    .fuente-grupo-cab {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--line);
    }
    .fuente-grupo-cab h3 {
      margin: 0;
      font-size: 12.5px;
      font-weight: 750;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text);
    }
    .fuente-grupo-cab .soft {
      font-size: 12px;
    }
    .fuentes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 12px;
    }
    .fuente-id h4 {
      margin: 0;
      font-size: 14.5px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--text);
    }
    .fuente-card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: var(--surface-soft);
      border: 1px solid var(--line);
      border-left: 3px solid var(--text-soft);
      border-radius: var(--radius-row);
      padding: 14px 16px;
    }
    .fuente-ok {
      border-left-color: var(--green);
    }
    .fuente-aviso {
      border-left-color: var(--amber);
    }
    .fuente-mal {
      border-left-color: var(--red);
    }
    .fuente-sin-datos {
      border-left-style: dashed;
    }
    .fuente-cab {
      display: flex;
      align-items: center;
      gap: 9px;
    }
    .punto-fuente {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      flex: none;
      background: var(--text-soft);
    }
    .fuente-ok .punto-fuente {
      background: var(--green);
    }
    .fuente-aviso .punto-fuente {
      background: var(--amber);
    }
    .fuente-mal .punto-fuente {
      background: var(--red);
    }
    .fuente-id {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 8px;
      flex: 1;
      min-width: 0;
    }
    .fuente-id code {
      font-size: 11px;
      color: var(--text-muted);
      background: var(--surface-soft);
      padding: 1px 6px;
      border-radius: 6px;
    }
    .fuente-badge {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: var(--text-soft);
      white-space: nowrap;
    }
    .fuente-ok .fuente-badge {
      color: var(--green);
    }
    .fuente-aviso .fuente-badge {
      color: var(--amber);
    }
    .fuente-mal .fuente-badge {
      color: var(--red);
    }
    .fuente-origen {
      font-size: 12.5px;
      color: var(--text);
    }
    .fuente-desc {
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--text-muted);
    }
    .fuente-metricas {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 12.5px;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }
    .fuente-metricas .num {
      color: var(--text);
      font-weight: 750;
    }
    .fuente-metricas .sep {
      color: var(--text-soft);
    }
    .fuente-diag {
      margin-top: auto;
      padding-top: 2px;
      font-size: 12.5px;
      line-height: 1.45;
      color: var(--text-muted);
    }
    .fuente-ok .fuente-diag {
      color: var(--green-text);
    }
    .fuente-aviso .fuente-diag {
      color: var(--amber-text);
    }
    .fuente-mal .fuente-diag {
      color: var(--red-text);
    }
  `
})
export class SaludDatosComponent {
  private readonly api = inject(FabricApi);
  private readonly fuenteDatos = inject(FuenteDatosService);

  /** Sub-pestaña activa de Salud, fijada por `data.vista` de la ruta. */
  readonly vista = input<'fuentes' | 'cuarentena'>('cuarentena');

  /** Mensaje del último fallo de lectura; null mientras la fuente responda. */
  readonly error = signal<string | null>(null);

  readonly salud = toSignal(
    // La fuente entra en el stream para refrescar al instante con el switch.
    toObservable(this.fuenteDatos.fuente).pipe(
      switchMap(() =>
        timer(0, 15_000).pipe(
          switchMap(() =>
            this.api.getSaludDatos().pipe(
              tap(() => this.error.set(null)),
              catchError((err: unknown) => {
                this.error.set(
                  err && typeof err === 'object' && 'status' in err
                    ? `HTTP ${(err as { status: number }).status}`
                    : 'sin conexión'
                );
                return EMPTY;
              })
            )
          )
        )
      )
    ),
    { initialValue: null }
  );

  /** Orden y rótulos de las familias de tablas en la pestaña Fuentes. */
  private readonly ordenGrupos: { clave: GrupoFuente; titulo: string; subtitulo: string }[] = [
    {
      clave: 'maquinas',
      titulo: 'Máquinas',
      subtitulo: 'lecturas y partes que emiten los telares y el disco puente'
    },
    {
      clave: 'inventario',
      titulo: 'Inventario (stock real de Odoo)',
      subtitulo: 'existencias, lotes y ubicaciones del almacén'
    },
    {
      clave: 'catalogo',
      titulo: 'Catálogo de productos (Odoo)',
      subtitulo: 'solo para resolver el nombre del material'
    },
    {
      clave: 'heredada',
      titulo: 'Heredada',
      subtitulo: 'tabla antigua con uso acotado; no fiarse como inventario'
    }
  ];

  /**
   * Reparte las fuentes en sus familias, en orden fijo, descartando los grupos
   * vacíos. Lo que no traiga grupo (backend antiguo) cae en "Otras fuentes".
   */
  gruposFuentes(
    fuentes: FuenteDato[]
  ): { titulo: string; subtitulo: string; fuentes: FuenteDato[] }[] {
    const grupos = this.ordenGrupos.map((g) => ({
      titulo: g.titulo,
      subtitulo: g.subtitulo,
      fuentes: fuentes.filter((f) => f.grupo === g.clave)
    }));
    const restantes = fuentes.filter(
      (f) => !this.ordenGrupos.some((g) => g.clave === f.grupo)
    );
    if (restantes.length > 0) {
      grupos.push({ titulo: 'Otras fuentes', subtitulo: '', fuentes: restantes });
    }
    return grupos.filter((g) => g.fuentes.length > 0);
  }

  tono(pct: number): '' | 'ok' | 'aviso' | 'mal' {
    if (pct >= 98) {
      return 'ok';
    }
    return pct >= 90 ? 'aviso' : 'mal';
  }

  notaTelar(telar: SaludTelar): string {
    return `${formatNumero(telar.fiables7d)} de ${formatNumero(telar.lecturas7d)} lecturas (7 d)`;
  }

  fecha(iso: string): string {
    return formatFechaHora(iso);
  }

  fechaAnio(iso: string): string {
    return formatFechaHoraAnio(iso);
  }

  numero(valor: number | null | undefined): string {
    return formatNumero(valor);
  }

  etiquetaEstado(estado: EstadoFuente): string {
    switch (estado) {
      case 'ok':
        return 'Al día';
      case 'aviso':
        return 'Con avisos';
      case 'mal':
        return 'Con problemas';
      default:
        return 'Sin datos';
    }
  }

  actualizacion(iso: string | null): string {
    return iso ? formatRelativo(iso) : 'sin marca de tiempo';
  }

  incidencia(lectura: LecturaTelar): string {
    return ETIQUETA_INCIDENCIA[lectura.incidencia];
  }

  fechaSospechosa(lectura: LecturaTelar): boolean {
    return (
      Math.abs(new Date(lectura.fechaHora).getTime() - new Date(lectura.recibidaEn).getTime()) >
      15 * 60_000
    );
  }
}
