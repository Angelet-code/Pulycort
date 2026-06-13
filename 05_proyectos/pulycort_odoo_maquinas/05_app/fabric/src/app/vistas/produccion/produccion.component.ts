import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, combineLatest, timer } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { FabricApi } from '../../core/fabric-api';
import { FuenteDatosService } from '../../core/fuente-datos.service';
import {
  formatDiaSemanaCorto,
  formatFechaCorta,
  formatFechaHora,
  formatNumero
} from '../../core/format';
import { materialPorId } from '../../core/materiales';
import { CicloBloque, RangoEstadisticas } from '../../core/models';
import { KpiTileComponent } from '../../shared/kpi-tile.component';
import { SelectorPeriodoComponent } from '../../shared/selector-periodo.component';
import { BarraApilada, GraficoBarrasComponent } from '../../shared/grafico-barras.component';
import { BarrasHorizontalesComponent, ItemBarraH } from '../../shared/barras-horizontales.component';
import { LineaJornadaComponent } from '../../shared/linea-jornada.component';
import { MaterialDotComponent } from '../../shared/material-dot.component';
import { MetricaComponent } from '../../shared/metrica.component';

/** Producción y paros: cuánto se ha producido, de qué material y por qué paramos. */
@Component({
  selector: 'fabric-produccion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    KpiTileComponent,
    SelectorPeriodoComponent,
    GraficoBarrasComponent,
    BarrasHorizontalesComponent,
    LineaJornadaComponent,
    MaterialDotComponent,
    MetricaComponent
  ],
  template: `
    <div class="cabecera-vista">
      <div>
        <h1>Producción y paros</h1>
        <p class="muted subtitulo">calculado solo sobre lecturas verificadas</p>
      </div>
      <fabric-selector-periodo [valor]="rango()" (cambio)="rango.set($event)" />
    </div>

    @if (estadisticas(); as e) {
      <div class="contenido" [class.actualizando]="cambiandoRango()">
      <section class="kpi-grid">
        <fabric-kpi
          etiqueta="m² de tablas"
          [valor]="e.totalM2"
          unidad="m²"
          [decimales]="1"
          [nota]="notaPaquetes()"
        />
        <fabric-kpi
          etiqueta="Bloques aserrados"
          [valor]="e.totalBloques"
          [unidad]="e.totalBloques === 1 ? 'bloque' : 'bloques'"
          [nota]="formatNumero(e.totalM3Aserrados, 1) + ' m³ de piedra'"
        />
        <fabric-kpi
          etiqueta="Rendimiento"
          [valor]="e.rendimientoM2M3"
          unidad="m²/m³"
          [decimales]="2"
          [nota]="notaRendimiento()"
          [tono]="e.bloquesRendimientoDudosos * 2 > e.bloquesRendimiento ? 'aviso' : ''"
        />
        <fabric-kpi
          etiqueta="Tablas"
          [valor]="e.totalTablas"
          [unidad]="e.totalTablas === 1 ? 'tabla' : 'tablas'"
          [nota]="notaMerma()"
        />
        <fabric-kpi
          etiqueta="Tiempo en marcha"
          [valor]="e.pctMarchaGlobal"
          unidad="%"
          [nota]="'paro: ' + formatNumero(e.pctParoGlobal) + ' % del tiempo'"
          [tono]="e.pctMarchaGlobal >= 70 ? 'ok' : e.pctMarchaGlobal >= 50 ? '' : 'aviso'"
        />
        <fabric-kpi
          etiqueta="Lecturas en cuarentena"
          [valor]="e.lecturasSospechosas"
          [unidad]="e.lecturasSospechosas === 1 ? 'lectura' : 'lecturas'"
          nota="excluidas de estos KPI · ver Salud del dato"
          [tono]="e.lecturasSospechosas > 0 ? 'aviso' : 'ok'"
        />
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>m² por día</h2>
          <span class="leyenda">
            @for (telarId of telares; track telarId) {
              <span class="leyenda-item">
                <span class="cuadrito" [style.background]="'var(--t' + telarId + ')'"></span>
                T{{ telarId }}
              </span>
            }
          </span>
        </div>
        @if (e.produccionPorDia.length > 0) {
          <fabric-grafico-barras [barras]="barrasPorDia()" unidad="m²" />
        } @else {
          <div class="estado-vacio">
            La fuente actual no contiene los m² de los partes de paquetes
          </div>
        }
      </section>

      <section class="dos-columnas">
        <div class="panel">
          <div class="panel-head">
            <h2>Producción por material</h2>
            <span class="soft">{{ materialConM2() ? 'm² de tablas' : 'bloques completados' }}</span>
          </div>
          <fabric-barras-horizontales
            [items]="itemsMaterial()"
            [unidad]="materialConM2() ? 'm²' : 'bloques'"
            [decimales]="materialConM2() ? 1 : 0"
          />
        </div>
        <div class="panel">
          <div class="panel-head">
            <h2>Minutos de paro por telar</h2>
            <span class="soft">incluye roturas de fleje</span>
          </div>
          <fabric-barras-horizontales [items]="itemsParos()" unidad="min" />
        </div>
        @if (e.produccionPorOperario.length > 0) {
          <div class="panel">
            <div class="panel-head">
              <h2>Producción por operario</h2>
              <span class="soft">m² de partes de paquetes</span>
            </div>
            <fabric-barras-horizontales
              [items]="itemsOperarios()"
              unidad="m²"
              [decimales]="1"
            />
          </div>
        }
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Resumen por telar</h2>
          <span class="soft">{{ tituloPeriodo() }}</span>
        </div>
        <div class="tabla-scroll">
          <table class="tabla">
            <thead>
              <tr>
                <th>Telar</th>
                <th>Marcha / paro / cambio</th>
                <th class="derecha">Marcha</th>
                <th class="derecha">m²</th>
                <th class="derecha">Tablas</th>
                <th class="derecha">Bloques</th>
                <th class="derecha">Golpes medios</th>
                <th class="derecha">Descenso medio</th>
                <th class="derecha">Amperios medios</th>
              </tr>
            </thead>
            <tbody>
              @for (telar of e.telares; track telar.telarId) {
                <tr>
                  <td>
                    <span class="celda-telar" [style.color]="'var(--t' + telar.telarId + ')'">
                      {{ telar.nombre }}
                    </span>
                  </td>
                  <td>
                    <span class="barrita" [title]="tituloUtilizacion(telar.pctMarcha, telar.pctParo, telar.pctCambioBloque)">
                      <span [style.width.%]="telar.pctMarcha" style="background: var(--green)"></span>
                      <span [style.width.%]="telar.pctParo" style="background: var(--amber)"></span>
                      <span [style.width.%]="telar.pctCambioBloque" style="background: rgba(79,201,222,0.5)"></span>
                    </span>
                  </td>
                  <td class="derecha">
                    <fabric-metrica [valor]="telar.horasMarcha" unidad="h" [decimales]="1" [tam]="13" />
                  </td>
                  <td class="derecha">
                    <fabric-metrica [valor]="telar.m2" unidad="m²" [decimales]="1" [tam]="13" />
                  </td>
                  <td class="derecha">
                    <fabric-metrica [valor]="telar.tablas" unidad="tablas" [tam]="13" />
                  </td>
                  <td class="derecha">
                    <fabric-metrica [valor]="telar.bloquesCompletados" unidad="bloques" [tam]="13" />
                  </td>
                  <td class="derecha">
                    <fabric-metrica [valor]="telar.golpesMedios" unidad="golpes/min" [tam]="13" />
                  </td>
                  <td class="derecha">
                    <fabric-metrica [valor]="telar.velocidadMediaMmH" unidad="mm/h" [tam]="13" />
                  </td>
                  <td class="derecha">
                    <fabric-metrica [valor]="telar.amperiosMedios" unidad="A" [tam]="13" />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Jornada de hoy por telar</h2>
          <span class="leyenda">
            <span class="leyenda-item"><span class="cuadrito" style="background: rgba(53,217,157,0.75)"></span>marcha</span>
            <span class="leyenda-item"><span class="cuadrito" style="background: rgba(243,200,106,0.85)"></span>paro</span>
            <span class="leyenda-item"><span class="cuadrito" style="background: rgba(255,95,125,0.9)"></span>rotura</span>
            <span class="leyenda-item"><span class="cuadrito" style="background: rgba(79,201,222,0.45)"></span>cambio de bloque</span>
          </span>
        </div>
        <div class="carriles">
          @for (jornada of e.jornadaHoy; track jornada.telarId; let ultima = $last) {
            <div class="carril-fila">
              <span class="carril-nombre" [style.color]="'var(--t' + jornada.telarId + ')'">
                T{{ jornada.telarId }}
              </span>
              <fabric-linea-jornada
                [segmentos]="jornada.segmentos"
                [inicioDia]="inicioHoyIso()"
                [mostrarHoras]="ultima"
              />
            </div>
          }
        </div>
      </section>

      <section class="dos-columnas">
        <div class="panel">
          <div class="panel-head">
            <h2>Roturas de fleje</h2>
            <span class="soft">{{ notaRoturas() }}</span>
          </div>
          @if (e.roturas.length > 0) {
            <div class="tabla-scroll">
              <table class="tabla tabla-compacta">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Telar</th>
                    <th>Bloque</th>
                    <th>Material</th>
                    <th class="derecha">Duración</th>
                  </tr>
                </thead>
                <tbody>
                  @for (rotura of e.roturas.slice(0, 10); track rotura.fechaHora) {
                    <tr>
                      <td>{{ formatFechaHora(rotura.fechaHora) }}</td>
                      <td><span [style.color]="'var(--t' + rotura.telarId + ')'">T{{ rotura.telarId }}</span></td>
                      <td>{{ rotura.bloque ?? '—' }}</td>
                      <td>
                        <span class="celda-bloque">
                          <fabric-material-dot [materialId]="rotura.materialId" [tam]="11" />
                          {{ nombreMaterial(rotura.materialId) }}
                        </span>
                      </td>
                      <td class="derecha">
                        <fabric-metrica [valor]="rotura.minutos" unidad="min" [tam]="13" />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="estado-vacio">Sin roturas de fleje en el periodo</div>
          }
        </div>

        <div class="panel">
          <div class="panel-head">
            <h2>Ciclos completados</h2>
            <span class="soft">colocación → paquetes · los {{ e.ciclosCompletados.length }} más recientes</span>
          </div>
          <div class="tabla-scroll">
            <table class="tabla tabla-compacta">
              <thead>
                <tr>
                  <th>Telar</th>
                  <th>Bloque</th>
                  <th class="derecha">Corte</th>
                  <th class="derecha">Tablas</th>
                  <th class="derecha">m²</th>
                  <th class="derecha">Merma</th>
                </tr>
              </thead>
              <tbody>
                @for (ciclo of e.ciclosCompletados; track ciclo.id) {
                  <tr>
                    <td><span [style.color]="'var(--t' + ciclo.telarId + ')'">T{{ ciclo.telarId }}</span></td>
                    <td>
                      <span class="celda-bloque">
                        <fabric-material-dot [materialId]="ciclo.bloque.materialId" [tam]="11" />
                        {{ ciclo.bloque.numero }}
                        @if (ciclo.medidasIncoherentes) {
                          <span
                            class="aviso-medidas"
                            title="Las medidas de bloque de la máquina no encajan con el parte real: su m³ individual no es fiable (cuenta como dudoso en el rendimiento)"
                          >⚠</span>
                        }
                      </span>
                    </td>
                    <td class="derecha">
                      <fabric-metrica [valor]="ciclo.horasMarcha" unidad="h" [decimales]="1" [tam]="13" />
                    </td>
                    <td class="derecha">
                      @if (tablasCiclo(ciclo.tablasPrevistas, ciclo.paquetes?.numTablas); as t) {
                        <span class="metrica" style="font-size: 13px">
                          <span class="valor">{{ t }}</span>
                          @if (t !== '—') {
                            <span class="unidad">tablas</span>
                          }
                        </span>
                      }
                    </td>
                    <td class="derecha">
                      @if (m2Ciclo(ciclo); as m) {
                        <span class="metrica" style="font-size: 13px">
                          <span class="valor">{{ m }}</span>
                          @if (m !== '—') {
                            <span class="unidad">m²</span>
                          }
                        </span>
                      }
                    </td>
                    <td class="derecha">
                      <fabric-metrica [valor]="ciclo.mermaVolumenPct" unidad="%" [decimales]="1" [tam]="13" />
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6"><div class="estado-vacio">Sin ciclos completados en el periodo</div></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </section>
      </div>
    } @else {
      <div class="cargando"></div>
      <div class="cargando"></div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .contenido {
      display: flex;
      flex-direction: column;
      gap: 16px;
      transition: opacity 0.2s ease;
    }
    .contenido.actualizando {
      opacity: 0.45;
      pointer-events: none;
    }
    .dos-columnas {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 14px;
      align-items: start;
    }
    .leyenda {
      display: inline-flex;
      gap: 12px;
      flex-wrap: wrap;
      font-size: 12px;
      color: var(--text-muted);
    }
    .leyenda-item {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .cuadrito {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      display: inline-block;
    }
    .celda-telar {
      font-weight: 750;
    }
    .barrita {
      display: inline-flex;
      width: 130px;
      height: 9px;
      border-radius: 999px;
      overflow: hidden;
      background: var(--surface-soft);
      border: 1px solid var(--line);
    }
    .barrita span {
      display: inline-block;
      height: 100%;
    }
    .carriles {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .carril-fila {
      display: grid;
      grid-template-columns: 34px 1fr;
      gap: 8px;
      align-items: center;
    }
    .carril-nombre {
      font-size: 12.5px;
      font-weight: 750;
    }
    .celda-bloque {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .aviso-medidas {
      color: var(--amber);
      font-size: 12px;
      cursor: help;
    }
    .tabla-compacta {
      min-width: 420px;
    }
  `
})
export class ProduccionComponent {
  private readonly api = inject(FabricApi);
  private readonly fuenteDatos = inject(FuenteDatosService);

  readonly rango = signal<RangoEstadisticas>('7d');
  readonly telares = [1, 2, 3, 4];

  readonly estadisticas = toSignal(
    // La fuente entra en el stream para refrescar al instante con el switch.
    combineLatest([toObservable(this.rango), toObservable(this.fuenteDatos.fuente)]).pipe(
      switchMap(([rango]) =>
        timer(0, 15_000).pipe(
          switchMap(() => this.api.getEstadisticas(rango).pipe(catchError(() => EMPTY)))
        )
      )
    ),
    { initialValue: null }
  );

  /** Datos en pantalla de un rango distinto al pedido: atenuar mientras llega. */
  readonly cambiandoRango = computed(() => {
    const e = this.estadisticas();
    return e !== null && e.rango !== this.rango();
  });

  readonly formatNumero = formatNumero;
  readonly formatFechaHora = formatFechaHora;

  readonly inicioHoyIso = computed(() => {
    const e = this.estadisticas();
    const referencia = e ? new Date(e.hasta) : new Date();
    return new Date(
      referencia.getFullYear(),
      referencia.getMonth(),
      referencia.getDate()
    ).toISOString();
  });

  readonly barrasPorDia = computed<BarraApilada[]>(() => {
    const e = this.estadisticas();
    if (!e) {
      return [];
    }
    return e.produccionPorDia.map((dia) => ({
      etiqueta:
        e.rango === 'hoy'
          ? 'Hoy'
          : e.rango === '7d'
            ? formatDiaSemanaCorto(dia.fecha)
            : formatFechaCorta(dia.fecha),
      segmentos: this.telares.map((telarId) => ({
        valor: dia.m2PorTelar[telarId] ?? 0,
        color: `var(--t${telarId})`,
        nombre: `Telar ${telarId}`
      }))
    }));
  });

  /** ¿La fuente trae m² por material? Con datos reales aún no hay partes. */
  readonly materialConM2 = computed(() => {
    const e = this.estadisticas();
    return !!e && e.produccionPorMaterial.some((p) => p.m2 !== null);
  });

  readonly itemsMaterial = computed<ItemBarraH[]>(() => {
    const e = this.estadisticas();
    if (!e) {
      return [];
    }
    return e.produccionPorMaterial.map((produccion) => {
      const material = materialPorId(produccion.materialId);
      return {
        etiqueta: material.nombre,
        // Sin m² en la fuente, la barra representa bloques completados.
        valor: produccion.m2 ?? produccion.bloques,
        materialId: produccion.materialId,
        color: material.color,
        sufijo:
          produccion.m2 !== null
            ? `${formatNumero(produccion.bloques)} ${produccion.bloques === 1 ? 'bloque' : 'bloques'}`
            : ''
      };
    });
  });

  readonly itemsOperarios = computed<ItemBarraH[]>(() => {
    const e = this.estadisticas();
    if (!e) {
      return [];
    }
    return e.produccionPorOperario.slice(0, 8).map((p) => ({
      etiqueta: p.operario,
      valor: p.m2,
      color: 'var(--teal)',
      sufijo: `${formatNumero(p.partes)} ${p.partes === 1 ? 'parte' : 'partes'} · ${formatNumero(p.tablas)} tablas`
    }));
  });

  readonly itemsParos = computed<ItemBarraH[]>(() => {
    const e = this.estadisticas();
    if (!e) {
      return [];
    }
    return e.telares.map((telar) => {
      const porCausa = new Map(telar.parosPorCausa.map((p) => [p.causa, p]));
      const paro = porCausa.get('paro');
      const rotura = porCausa.get('rotura-fleje');
      const total = (paro?.minutos ?? 0) + (rotura?.minutos ?? 0);
      const tramos = (paro?.numero ?? 0) + (rotura?.numero ?? 0);
      return {
        etiqueta: telar.nombre,
        valor: total,
        color: 'var(--amber)',
        sufijo: `${formatNumero(tramos)} ${tramos === 1 ? 'tramo' : 'tramos'} · ${formatNumero(rotura?.minutos ?? 0)} min por rotura`
      };
    });
  });

  readonly notaMerma = computed(() => {
    const e = this.estadisticas();
    if (e?.mermaMediaPct != null) {
      return `merma media proveedor→fábrica: ${formatNumero(e.mermaMediaPct, 1)} %`;
    }
    if (e?.totalTablas == null) {
      return '';
    }
    return e.totalPaquetes != null
      ? 'de partes reales (≈ si falta parte)'
      : 'estimadas a partir del grueso del bloque';
  });

  /**
   * El rendimiento es un agregado sobre los bloques con parte real: bloque a
   * bloque las medidas de consola son ruido (llegan heredadas del anterior),
   * pero la suma de la ventana se compensa. La nota dice de cuántos bloques
   * sale el número y cuántos tienen medidas dudosas; si la mayoría de la
   * base es dudosa, el servidor manda null y se muestra "—".
   */
  readonly notaRendimiento = computed(() => {
    const e = this.estadisticas();
    if (!e) {
      return '';
    }
    if (e.rendimientoM2M3 === null) {
      return e.bloquesRendimiento > 0
        ? 'sin base fiable: todos los bloques con parte tienen medidas dudosas'
        : 'sin bloques con parte real en el periodo';
    }
    const base = `agregado de ${formatNumero(e.bloquesRendimiento)} ${
      e.bloquesRendimiento === 1 ? 'bloque con parte real' : 'bloques con parte real'
    }`;
    return e.bloquesRendimientoDudosos > 0
      ? `${base} · ${formatNumero(e.bloquesRendimientoDudosos)} con medidas dudosas`
      : base;
  });

  readonly notaPaquetes = computed(() => {
    const e = this.estadisticas();
    if (e?.totalPaquetes != null) {
      return `${formatNumero(e.totalPaquetes)} paquetes · de partes reales (≈ si falta parte)`;
    }
    if (e?.totalM2 != null) {
      return 'estimados: tablas ≈ grueso / 2,8 cm';
    }
    return 'la fuente actual no trae partes de paquetes';
  });

  /** Derivado del eco del servidor: nunca etiqueta datos de otro rango. */
  readonly tituloPeriodo = computed(() => {
    switch (this.estadisticas()?.rango) {
      case 'hoy':
        return 'desde las 00:00';
      case '7d':
        return 'últimos 7 días naturales';
      case '30d':
        return 'últimos 30 días naturales';
      default:
        return '';
    }
  });

  readonly notaRoturas = computed(() => {
    const e = this.estadisticas();
    if (!e) {
      return '';
    }
    const total = e.roturas.length;
    if (total > 10) {
      return `las 10 más recientes de ${formatNumero(total)}`;
    }
    return `${formatNumero(total)} en el periodo`;
  });

  nombreMaterial(materialId: string | null): string {
    return materialPorId(materialId).nombre;
  }

  // `reales` llega como null (no undefined) desde la plantilla: el `?.` de
  // Angular compila a null. Comparar con == null cubre ambos.
  tablasCiclo(previstas: number | null, reales: number | null | undefined): string {
    if (reales != null) {
      return `${formatNumero(reales)}`;
    }
    return previstas !== null ? `≈ ${formatNumero(previstas)}` : '—';
  }

  /** m² reales del parte si existen; si no, la estimación marcada con ≈. */
  m2Ciclo(ciclo: CicloBloque): string {
    if (ciclo.paquetes) {
      return formatNumero(ciclo.paquetes.metrosCuadrados, 1);
    }
    return ciclo.m2Previstos !== null ? `≈ ${formatNumero(ciclo.m2Previstos, 1)}` : '—';
  }

  tituloUtilizacion(marcha: number, paro: number, cambio: number): string {
    return `Marcha ${formatNumero(marcha)} % · Paro ${formatNumero(paro)} % · Cambio de bloque ${formatNumero(cambio)} %`;
  }
}
