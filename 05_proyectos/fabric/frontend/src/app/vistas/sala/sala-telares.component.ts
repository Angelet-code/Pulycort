import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, combineLatest, timer } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { FabricApi } from '../../core/fabric-api';
import { FuenteDatosService } from '../../core/fuente-datos.service';
import { formatDuracionMin, formatNumero } from '../../core/format';
import { TickerEventosComponent } from '../../shared/ticker-eventos.component';
import { BarraApilada, GraficoBarrasComponent } from '../../shared/grafico-barras.component';
import { SelectorPeriodoComponent } from '../../shared/selector-periodo.component';
import { GraficoDistribucionConsumoComponent } from '../../shared/grafico-distribucion-consumo.component';
import { FilaMaquinaCatalogoComponent } from './fila-maquina-catalogo.component';
import { FilaMaquinaComponent } from './fila-maquina.component';
import {
  abreviaturaMaquina,
  CATALOGO_MAQUINAS,
  CATALOGO_MAQUINAS_ORDENADO,
  MaquinaCatalogo
} from '../../core/catalogo-maquinas';
import { CoberturaMaquina, RangoEstadisticas } from '../../core/models';

/**
 * Máquinas de la nave sin lectura en vivo (todo el catálogo menos los telares),
 * en el orden de presentación: primero los discos puente (con partes) y al final
 * todas las que siguen sin integrar. Ver `CATALOGO_MAQUINAS_ORDENADO`.
 */
const MAQUINAS_RESTO: MaquinaCatalogo[] = CATALOGO_MAQUINAS_ORDENADO.filter(
  (m) => m.integracion !== 'en-vivo'
);

const ETIQUETA_TURNO: Record<string, string> = {
  manana: 'Turno mañana · 06:00–14:00',
  tarde: 'Turno tarde · 14:00–22:00',
  noche: 'Turno noche · 22:00–06:00'
};

/** Texto del periodo para el subtítulo del gráfico de consumo. */
const PERIODO_TEXTO: Record<RangoEstadisticas, string> = {
  hoy: 'hoy',
  '7d': 'últimos 7 días',
  '30d': 'últimos 30 días',
  '90d': 'últimos 90 días',
  '1a': 'último año',
  todo: 'histórico'
};

/** Máquinas: qué pasa AHORA en los 4 telares, en una lista que se despliega. */
@Component({
  selector: 'fabric-sala-telares',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TickerEventosComponent,
    GraficoBarrasComponent,
    SelectorPeriodoComponent,
    GraficoDistribucionConsumoComponent,
    FilaMaquinaComponent,
    FilaMaquinaCatalogoComponent
  ],
  template: `
    @if (error()) {
      <div class="banner-error" role="alert">
        ⚠ No se pudo actualizar desde la fuente ({{ error() }}). Reintentando cada 5 s…
      </div>
    }
    @if (snapshot(); as s) {
      <div class="barra-turno">
        <span
          class="chip"
          title="Turno actual según la hora (mañana 06–14, tarde 14–22, noche 22–06) y los operarios asignados, tomados de la última lectura. Si no hay operarios registrados, indica «marcha automática»."
        >
          <span class="punto" style="background: var(--stone)"></span>
          {{ turnoTexto() }}
        </span>
      </div>

      <section class="resumen" aria-label="Resumen de la planta">
        <div
          class="resumen-item"
          [class.tono-ok]="s.kpis.telaresCortando >= 3"
          [class.tono-aviso]="s.kpis.telaresCortando < 2"
          title="Cuántos de los 4 telares están en corte activo (estado «marcha») ahora mismo. Se recalcula con cada lectura de máquina (~10 min)."
        >
          <span class="resumen-etiqueta">Cortando</span>
          <span class="resumen-valor num">
            {{ s.kpis.telaresCortando }}<span class="resumen-unidad">de {{ s.kpis.telaresTotales }}</span>
          </span>
        </div>
        <div
          class="resumen-item"
          title="Porcentaje de tiempo en corte frente al disponible hoy: min en marcha de los 4 telares / (4 × min desde las 00:00). En real aún no se muestra: falta definir qué tiempo cuenta como disponible."
        >
          <span class="resumen-etiqueta">Utilización hoy</span>
          <span class="resumen-valor num">{{ valor(s.kpis.utilizacionHoyPct) }}<span class="resumen-unidad">%</span></span>
        </div>
        <div
          class="resumen-item"
          title="Metros cuadrados de tabla obtenidos hoy, sumando los partes reales de paquetes de los PM/lotes terminados. Si a un lote le falta el parte, se estima por su grueso."
        >
          <span class="resumen-etiqueta">Producción hoy</span>
          <span class="resumen-valor num">{{ valor(s.kpis.m2Hoy, 1) }}<span class="resumen-unidad">m²</span></span>
        </div>
        <div
          class="resumen-item"
          [class.tono-aviso]="(s.kpis.minutosRoturaHoy ?? 0) > 0"
          title="Nº de interrupciones de corte registradas hoy; la nota suma el tiempo total parado (los huecos de más de 25 min no se imputan)."
        >
          <span class="resumen-etiqueta">Paradas hoy</span>
          <span class="resumen-valor num">{{ s.kpis.parosHoy }}<span class="resumen-unidad">{{ notaParos() }}</span></span>
        </div>
      </section>

      <section class="lista-telares">
        @for (telar of s.telares; track telar.telarId) {
          <fabric-fila-maquina
            [telar]="telar"
            [abierta]="abierta() === ('telar-' + telar.telarId)"
            (alternar)="alternarFila('telar-' + telar.telarId)"
          />
        }
        @for (maquina of maquinasResto; track maquina.codigo) {
          <fabric-fila-maquina-catalogo
            [maquina]="maquina"
            [cobertura]="coberturaPorCodigo().get(maquina.codigo) ?? null"
            [abierta]="abierta() === ('maquina-' + maquina.codigo)"
            (alternar)="alternarFila('maquina-' + maquina.codigo)"
          />
        }
      </section>

      <section class="panel">
        <div class="panel-head">
          <div class="cabecera-consumo">
            <h2>Consumo eléctrico medio por máquina</h2>
            <span class="soft">{{ subtituloConsumo() }}</span>
          </div>
          <fabric-selector-periodo
            [valor]="rangoConsumo()"
            (cambio)="rangoConsumo.set($event)"
          />
        </div>
        @if (estadisticasConsumo()) {
          @if (hayConsumo()) {
            <fabric-grafico-barras
              [barras]="barrasConsumo()"
              unidad="kW"
              [etiquetasCompletas]="true"
            />
          } @else {
            <div class="estado-vacio">Sin lecturas en marcha en el periodo</div>
          }
        } @else {
          <div class="cargando cargando-grafico"></div>
        }
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>¿Cómo detectamos consumos atípicos?</h2>
        </div>
        <fabric-grafico-distribucion-consumo />
        <p class="dist-explica">
          Cada telar tiene su propio consumo normal. Sobre sus lecturas en marcha
          (ignorando las de menos de 5 kW, que es el telar casi parado) marcamos como
          atípico el consumo de la cola alta: el 16 % más alto es «consumo alto», el
          2,3 % «inusualmente alto» y el 0,13 % «MUY alto, conviene revisar». El corte
          se hace por percentil de cada telar, así que el aviso se adapta a máquinas que
          consumen distinto y no supone que el consumo siga una campana perfecta.
        </p>
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
    } @else if (!error()) {
      <div class="cargando cargando-cabecera"></div>
      <div class="lista-telares">
        <div class="cargando cargando-fila"></div>
        <div class="cargando cargando-fila"></div>
        <div class="cargando cargando-fila"></div>
        <div class="cargando cargando-fila"></div>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .barra-turno {
      display: flex;
      justify-content: flex-end;
    }
    .barra-turno .chip {
      max-width: 100%;
      white-space: normal;
      line-height: 1.35;
    }

    /* Resumen compacto de la planta: una tira de cifras en vez de tiles grandes. */
    .resumen {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1px;
      background: var(--line);
      border: 1px solid var(--line);
      border-radius: var(--radius-row);
      overflow: hidden;
    }
    .resumen-item {
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 11px 16px;
      background: var(--surface);
      cursor: help;
    }
    .resumen-etiqueta {
      font-size: 10.5px;
      font-weight: 650;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--text-soft);
    }
    .resumen-valor {
      font-size: 22px;
      font-weight: 800;
      line-height: 1.1;
      display: inline-flex;
      align-items: baseline;
      gap: 5px;
    }
    .resumen-unidad {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      letter-spacing: 0;
      text-transform: none;
    }
    .resumen-item.tono-ok .resumen-valor {
      color: var(--green);
    }
    .resumen-item.tono-aviso .resumen-valor {
      color: var(--amber);
    }

    .lista-telares {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    /* Cabecera del gráfico de consumo: título + subtítulo apilados a la
       izquierda, dejando el selector de periodo a la derecha. */
    .cabecera-consumo {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .cargando-cabecera {
      height: 64px;
    }
    .cargando-grafico {
      height: 230px;
    }
    .cargando-fila {
      height: 66px;
    }

    .dist-explica {
      margin: 14px 0 0;
      color: var(--text-muted);
      font-size: 13.5px;
      line-height: 1.6;
      max-width: 70ch;
    }

    @media (max-width: 640px) {
      .resumen {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `
})
export class SalaTelaresComponent {
  private readonly api = inject(FabricApi);
  private readonly fuenteDatos = inject(FuenteDatosService);

  /** Mensaje del último fallo de lectura; null mientras la fuente responda. */
  readonly error = signal<string | null>(null);

  readonly snapshot = toSignal(
    // La fuente entra en el stream para refrescar al instante con el switch.
    toObservable(this.fuenteDatos.fuente).pipe(
      switchMap(() =>
        timer(0, 5000).pipe(
          switchMap(() =>
            this.api.getSnapshotPlanta().pipe(
              tap(() => this.error.set(null)),
              catchError((err: unknown) => {
                // No se pierde el último snapshot: el polling se recupera
                // solo en el siguiente tick (cada 5 s).
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

  /**
   * Cobertura real por máquina (volumen, último material, m² de hoy). Hoy solo la
   * consume la tarjeta del disco puente Gómez. Se refresca cada 30 s (el backend
   * cachea 60 s) y al cambiar la fuente; si falla, conserva el último valor.
   */
  private readonly coberturaSrc = toSignal(
    toObservable(this.fuenteDatos.fuente).pipe(
      switchMap(() =>
        timer(0, 30000).pipe(
          switchMap(() =>
            this.api.getCoberturaMaquinas().pipe(catchError(() => EMPTY))
          )
        )
      )
    ),
    { initialValue: null }
  );

  /** Cobertura indexada por código de máquina, para pasarla a cada tarjeta. */
  readonly coberturaPorCodigo = computed(() => {
    const c = this.coberturaSrc();
    const mapa = new Map<number, CoberturaMaquina>();
    if (c) {
      for (const m of c.maquinas) {
        mapa.set(m.codigo, m);
      }
    }
    return mapa;
  });

  /** Resto de máquinas de la nave, en fila bajo los telares (sin lectura en vivo). */
  readonly maquinasResto = MAQUINAS_RESTO;

  /** Rango del gráfico de consumo medio (mismo selector que Producción). */
  readonly rangoConsumo = signal<RangoEstadisticas>('7d');

  /**
   * Estadísticas del rango elegido, de donde sale el consumo medio por máquina.
   * El backend ya calcula la media en marcha por telar (`potenciaMediaKw`,
   * descartando lo parado); aquí solo se elige el periodo. Refresca al cambiar
   * de rango o de fuente y cada 60 s; si falla, conserva el último resultado.
   */
  readonly estadisticasConsumo = toSignal(
    combineLatest([
      toObservable(this.rangoConsumo),
      toObservable(this.fuenteDatos.fuente)
    ]).pipe(
      switchMap(([rango]) =>
        timer(0, 60_000).pipe(
          switchMap(() => this.api.getEstadisticas(rango).pipe(catchError(() => EMPTY)))
        )
      )
    ),
    { initialValue: null }
  );

  /**
   * Consumo eléctrico medio en marcha (kW) de cada máquina del catálogo, para
   * el gráfico de barras verticales del rango elegido. Orden: las integradas
   * primero y las sin integrar al final (convención de Ángel); dentro de cada
   * grupo, de mayor a menor consumo. Solo los telares tienen lectura eléctrica,
   * así que el resto del catálogo aparece sin barra (consumo null): no se
   * inventa un consumo que la fuente no da. La media la calcula el backend;
   * aquí solo se mapea y ordena para pintar.
   */
  readonly barrasConsumo = computed<BarraApilada[]>(() => {
    const e = this.estadisticasConsumo();
    if (!e) {
      return [];
    }
    const porTelar = new Map(e.telares.map((t) => [t.telarId, t]));
    return [...CATALOGO_MAQUINAS]
      .map((maquina) => {
        const telar = maquina.telarId != null ? porTelar.get(maquina.telarId) : undefined;
        const consumo = telar?.potenciaMediaKw ?? null;
        return { maquina, consumo };
      })
      .sort((a, b) => {
        const sinA = a.maquina.integracion === 'sin-integrar';
        const sinB = b.maquina.integracion === 'sin-integrar';
        // Integradas primero, sin integrar al final.
        if (sinA !== sinB) {
          return sinA ? 1 : -1;
        }
        // Dentro del grupo: mayor consumo primero (sin lectura va al final).
        const ca = a.consumo ?? -1;
        const cb = b.consumo ?? -1;
        if (cb !== ca) {
          return cb - ca;
        }
        // Empate (p. ej. todo sin lectura): orden estable por catálogo.
        return a.maquina.codigo - b.maquina.codigo;
      })
      .map(({ maquina, consumo }) => ({
        etiqueta: abreviaturaMaquina(maquina),
        segmentos: [
          {
            valor: consumo ?? 0,
            color: maquina.telarId != null ? `var(--t${maquina.telarId})` : 'var(--text-soft)',
            nombre: maquina.nombre
          }
        ]
      }));
  });

  /** ¿Alguna máquina con consumo medio en el periodo? Si no, gráfico vacío. */
  readonly hayConsumo = computed(() =>
    this.barrasConsumo().some((b) => b.segmentos[0].valor > 0)
  );

  /** Subtítulo del gráfico: qué mide y de qué periodo, según el rango elegido. */
  readonly subtituloConsumo = computed(
    () => `media en marcha (kW) · ${PERIODO_TEXTO[this.rangoConsumo()]}`
  );

  /** Fila desplegada (acordeón: una sola, telar o máquina, a la vez). */
  readonly abierta = signal<string | null>(null);

  alternarFila(clave: string): void {
    this.abierta.update((actual) => (actual === clave ? null : clave));
  }

  valor(v: number | null | undefined, decimales = 0): string {
    return formatNumero(v ?? null, decimales);
  }

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

  /** Sufijo de la cifra de paradas: "paradas · 1 h 10" con el tiempo acumulado. */
  readonly notaParos = computed(() => {
    const s = this.snapshot();
    if (!s) {
      return '';
    }
    const noun = s.kpis.parosHoy === 1 ? 'parada' : 'paradas';
    return s.kpis.minutosParoHoy > 0
      ? `${noun} · ${formatDuracionMin(s.kpis.minutosParoHoy)}`
      : noun;
  });
}
