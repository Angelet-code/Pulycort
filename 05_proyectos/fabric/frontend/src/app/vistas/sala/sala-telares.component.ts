import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, timer } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { FabricApi } from '../../core/fabric-api';
import { FuenteDatosService } from '../../core/fuente-datos.service';
import { formatDuracionMin, formatNumero } from '../../core/format';
import { KpiTileComponent } from '../../shared/kpi-tile.component';
import { TickerEventosComponent } from '../../shared/ticker-eventos.component';
import { TarjetaTelarComponent } from './tarjeta-telar.component';

const ETIQUETA_TURNO: Record<string, string> = {
  manana: 'Turno mañana · 06:00–14:00',
  tarde: 'Turno tarde · 14:00–22:00',
  noche: 'Turno noche · 22:00–06:00'
};

/** Sala de telares: qué pasa AHORA en los 4 telares y cuánto les queda. */
@Component({
  selector: 'fabric-sala-telares',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KpiTileComponent, TickerEventosComponent, TarjetaTelarComponent],
  template: `
    @if (snapshot(); as s) {
      <div class="cabecera-vista">
        <div>
          <h1>Sala de telares</h1>
          <p class="muted subtitulo">
            Corte de bloques en tablas · lecturas de máquina cada 10 min
          </p>
        </div>
        <span
          class="chip"
          title="Turno actual según la hora (mañana 06–14, tarde 14–22, noche 22–06) y los operarios asignados, tomados de la última lectura. Si no hay operarios registrados, indica «marcha automática»."
        >
          <span class="punto" style="background: var(--stone)"></span>
          {{ turnoTexto() }}
        </span>
      </div>

      <section class="kpi-grid kpis-planta">
        <fabric-kpi
          etiqueta="Telares cortando"
          [valor]="s.kpis.telaresCortando"
          [unidad]="'de ' + s.kpis.telaresTotales"
          [tono]="s.kpis.telaresCortando >= 3 ? 'ok' : s.kpis.telaresCortando >= 2 ? '' : 'aviso'"
          ayuda="Cuántos de los 4 telares están en corte activo (estado «marcha») ahora mismo. Se recalcula con cada lectura de máquina, que llega aproximadamente cada 10 minutos."
        />
        <fabric-kpi
          etiqueta="Utilización hoy"
          [valor]="s.kpis.utilizacionHoyPct"
          unidad="%"
          nota="min en marcha / min disponibles"
          ayuda="Porcentaje de tiempo en corte frente al disponible hoy: minutos en marcha de los 4 telares / (4 × minutos transcurridos desde las 00:00). En el sistema real aún no se muestra: queda por definir qué tiempo cuenta como disponible."
        />
        <fabric-kpi
          etiqueta="Producción de hoy"
          [valor]="s.kpis.m2Hoy"
          unidad="m²"
          [decimales]="1"
          [nota]="notaProduccion()"
          ayuda="Metros cuadrados de tabla obtenidos hoy, sumando los partes reales de paquetes de los bloques terminados. Si a un bloque le falta el parte, se estima por su grueso (tablas de 2 cm + 0,8 cm de fleje) × largo × alto."
        />
        <fabric-kpi
          etiqueta="Paradas de hoy"
          [valor]="s.kpis.parosHoy"
          [unidad]="s.kpis.parosHoy === 1 ? 'parada' : 'paradas'"
          [nota]="notaParos()"
          [tono]="(s.kpis.minutosRoturaHoy ?? 0) > 0 ? 'aviso' : ''"
          ayuda="Nº de interrupciones de corte registradas hoy; la nota suma el tiempo total parado (los huecos de más de 25 min no se imputan) y, si hay roturas de fleje, desglosa ese tiempo aparte."
        />
      </section>

      <section class="rejilla-telares">
        @for (telar of s.telares; track telar.telarId) {
          <fabric-tarjeta-telar [telar]="telar" />
        }
      </section>

      @if (s.ultimosEventos.length > 0) {
        <section class="panel">
          <div class="panel-head">
            <h2>Últimos partes de trabajo</h2>
            <span class="soft">registrados por los operarios</span>
          </div>
          <fabric-ticker-eventos [eventos]="s.ultimosEventos" />
        </section>
      }
    } @else {
      <div class="cargando"></div>
      <div class="rejilla-telares">
        <div class="cargando"></div>
        <div class="cargando"></div>
        <div class="cargando"></div>
        <div class="cargando"></div>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .cabecera-vista .chip {
      max-width: 100%;
      white-space: normal;
      line-height: 1.35;
    }
    .rejilla-telares {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 14px;
    }
    @media (max-width: 480px) {
      .rejilla-telares {
        grid-template-columns: 1fr;
      }
    }
  `
})
export class SalaTelaresComponent {
  private readonly api = inject(FabricApi);
  private readonly fuenteDatos = inject(FuenteDatosService);

  readonly snapshot = toSignal(
    // La fuente entra en el stream para refrescar al instante con el switch.
    toObservable(this.fuenteDatos.fuente).pipe(
      switchMap(() =>
        timer(0, 5000).pipe(
          switchMap(() => this.api.getSnapshotPlanta().pipe(catchError(() => EMPTY)))
        )
      )
    ),
    { initialValue: null }
  );

  readonly formatNumero = formatNumero;

  readonly turnoTexto = computed(() => {
    const s = this.snapshot();
    if (!s || s.telares.length === 0) {
      return '';
    }
    const telar = s.telares[0];
    const etiqueta = ETIQUETA_TURNO[telar.turno] ?? '';
    const operarios = [telar.operario1, telar.operario2].filter(Boolean).join(' · ');
    return operarios ? `${etiqueta} — ${operarios}` : `${etiqueta} — marcha automática`;
  });

  readonly notaParos = computed(() => {
    const s = this.snapshot();
    if (!s) {
      return '';
    }
    const total = formatDuracionMin(s.kpis.minutosParoHoy);
    return (s.kpis.minutosRoturaHoy ?? 0) > 0
      ? `${total} acumulados · ${formatDuracionMin(s.kpis.minutosRoturaHoy)} por rotura`
      : `${total} acumulados`;
  });

  readonly notaProduccion = computed(() => {
    const s = this.snapshot();
    if (s?.kpis.tablasHoy == null) {
      return 'la fuente actual no trae partes de paquetes';
    }
    // En fuente real: partes reales de paquetes, estimación si falta parte.
    return this.fuenteDatos.esReal()
      ? `${formatNumero(s.kpis.tablasHoy)} tablas · partes reales (≈ si falta)`
      : `${formatNumero(s.kpis.tablasHoy)} tablas empaquetadas`;
  });
}
