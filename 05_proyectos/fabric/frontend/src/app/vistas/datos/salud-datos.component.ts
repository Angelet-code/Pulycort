import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, timer } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { FabricApi } from '../../core/fabric-api';
import { FuenteDatosService } from '../../core/fuente-datos.service';
import { ETIQUETA_INCIDENCIA } from '../../core/etiquetas';
import { formatFechaHora, formatFechaHoraAnio, formatNumero } from '../../core/format';
import { LecturaTelar, SaludTelar } from '../../core/models';
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
    <div class="cabecera-vista">
      <div>
        <h1>Salud del dato</h1>
        <p class="muted subtitulo">
          lecturas en cuarentena de los últimos 7 días y por qué se descartaron
        </p>
      </div>
    </div>

    @if (salud(); as s) {
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
            con los bloques por nº de bloque, no por fecha, así que no contaminan los KPIs.
          </p>
        </section>
      }
    } @else {
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
  `
})
export class SaludDatosComponent {
  private readonly api = inject(FabricApi);
  private readonly fuenteDatos = inject(FuenteDatosService);

  readonly salud = toSignal(
    // La fuente entra en el stream para refrescar al instante con el switch.
    toObservable(this.fuenteDatos.fuente).pipe(
      switchMap(() =>
        timer(0, 15_000).pipe(
          switchMap(() => this.api.getSaludDatos().pipe(catchError(() => EMPTY)))
        )
      )
    ),
    { initialValue: null }
  );

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

  numero(valor: number): string {
    return formatNumero(valor);
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
