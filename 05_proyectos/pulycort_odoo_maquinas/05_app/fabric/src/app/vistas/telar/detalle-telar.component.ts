import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, combineLatest, timer } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { FabricApi } from '../../core/fabric-api';
import { FuenteDatosService } from '../../core/fuente-datos.service';
import { TELAR_IDS } from '../../core/dominio';
import { ETIQUETA_INCIDENCIA, ETIQUETA_EVENTO } from '../../core/etiquetas';
import {
  formatEta,
  formatFechaHora,
  formatMedidasCm,
  formatNumero,
  formatHora
} from '../../core/format';
import { materialPorId } from '../../core/materiales';
import { Bloque, CicloBloque, EventoParte, LecturaTelar } from '../../core/models';
import { RelojService } from '../../core/reloj.service';
import { EstadoChipComponent } from '../../shared/estado-chip.component';
import { MaterialDotComponent } from '../../shared/material-dot.component';
import { MetricaComponent } from '../../shared/metrica.component';
import { KpiTileComponent } from '../../shared/kpi-tile.component';
import { BloqueVivoComponent } from '../../shared/bloque-vivo.component';
import { GraficoLineasComponent, ProyeccionLinea } from '../../shared/grafico-lineas.component';
import { LineaJornadaComponent } from '../../shared/linea-jornada.component';
import { DataBadgeComponent } from '../../shared/data-badge.component';

/** Detalle de un telar: cómo va este corte y por qué el telar va como va. */
@Component({
  selector: 'fabric-detalle-telar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    EstadoChipComponent,
    MaterialDotComponent,
    MetricaComponent,
    KpiTileComponent,
    BloqueVivoComponent,
    GraficoLineasComponent,
    LineaJornadaComponent,
    DataBadgeComponent
  ],
  template: `
    <a class="volver muted" routerLink="/telares">← Sala de telares</a>

    @if (detalle(); as d) {
      <div class="cabecera-vista">
        <div class="hero-izq">
          <h1>{{ d.snapshot.nombre }}</h1>
          <div class="hero-info">
            <fabric-estado-chip [estado]="d.snapshot.estado" [causa]="d.snapshot.causaParo" />
            @if (d.snapshot.bloque; as bloque) {
              <span class="bloque-info">
                <fabric-material-dot [materialId]="bloque.materialId" [tam]="15" />
                {{ nombreMaterial(bloque) }} · Bloque {{ bloque.numero }}
              </span>
            }
          </div>
        </div>
        @if (d.snapshot.progresoPct !== null) {
          <div class="hero-progreso">
            <fabric-metrica [valor]="d.snapshot.progresoPct" unidad="%" [decimales]="1" [tam]="44" />
            <span class="muted">{{ etaTexto() }}</span>
          </div>
        }
      </div>

      @if (d.snapshot.bloque; as bloque) {
        <section class="panel medidas-panel">
          <div class="medida">
            <span class="micro-etiqueta">Medida del proveedor</span>
            <span class="num medida-valor">{{ medidas(bloque, 'proveedor') }}</span>
            <span class="soft">{{ volumen(bloque, 'proveedor') }}</span>
          </div>
          <div class="medida">
            <span class="micro-etiqueta">Medida de fábrica (real)</span>
            <span class="num medida-valor">{{ medidas(bloque, 'fabrica') }}</span>
            <span class="soft">{{ volumen(bloque, 'fabrica') }}</span>
          </div>
          <div class="medida">
            <span class="micro-etiqueta">Δ volumen (merma de compra)</span>
            <fabric-metrica [valor]="mermaPct(bloque)" unidad="%" [decimales]="1" [tam]="22" />
            <span class="soft">el sistema antiguo mezclaba ambas medidas</span>
          </div>
        </section>

        <section class="dos-columnas">
          <div class="panel">
            <div class="panel-head">
              <h2>Bloque vivo</h2>
              <span class="soft">sección a escala · grueso × alto</span>
            </div>
            @if (d.snapshot.alturaInicialMm !== null) {
              <fabric-bloque-vivo
                [bloque]="bloque"
                [alturaInicialMm]="d.snapshot.alturaInicialMm"
                [alturaActualMm]="alturaActualMm()"
                [enMarcha]="d.snapshot.estado === 'marcha'"
              />
              <p class="nota-metodo leyenda-bloque">
                {{ leyendaBloque() }}
              </p>
            }
          </div>

          <div class="columna-graficos">
            <div class="panel">
              <div class="panel-head">
                <h2>Descenso del bastidor</h2>
                <span class="soft">altura (mm) · la discontinua proyecta el fin de corte</span>
              </div>
              <fabric-grafico-lineas
                [serie]="d.serieAltura"
                [desde]="inicioJornadaIso()"
                [hasta]="finDominioAltura()"
                [bandas]="d.segmentosJornada"
                [proyeccion]="proyeccionAltura()"
                color="var(--stone)"
                unidad="mm"
              />
            </div>
            <div class="panel">
              <div class="panel-head">
                <h2>Potencia</h2>
                <span class="soft">kW · las caídas a 0 son paros</span>
              </div>
              <fabric-grafico-lineas
                [serie]="d.seriePotencia"
                [desde]="inicioJornadaIso()"
                [hasta]="ahoraIso()"
                [bandas]="d.segmentosJornada"
                [yMaxFijo]="76"
                [area]="true"
                color="var(--blue)"
                unidad="kW"
              />
            </div>
            <div class="panel">
              <div class="panel-head">
                <h2>Golpes del bastidor</h2>
                <span class="soft">golpes/min</span>
              </div>
              <fabric-grafico-lineas
                [serie]="d.serieGolpes"
                [desde]="inicioJornadaIso()"
                [hasta]="ahoraIso()"
                [yMaxFijo]="1000"
                color="var(--violet)"
                unidad="golpes/min"
              />
            </div>
          </div>
        </section>
      } @else {
        <section class="panel">
          <div class="estado-vacio">
            Sin bloque en la bancada — el telar está entre ciclos (cambio de bloque).
          </div>
        </section>
      }

      <section class="kpi-grid">
        <fabric-kpi
          etiqueta="Tablas previstas"
          [valor]="d.snapshot.tablasPrevistas"
          unidad="tablas"
          [nota]="notaTablas()"
        />
        <fabric-kpi
          etiqueta="Disponibilidad del turno"
          [valor]="d.disponibilidadTurnoPct"
          unidad="%"
          nota="min en marcha / min de turno"
        />
        @if (d.vigiaFleje; as vigia) {
          <fabric-kpi
            etiqueta="Vigía del fleje"
            [valor]="vigia.ratioActual"
            unidad="A·h/mm"
            [decimales]="2"
            [nota]="notaVigia()"
            [tono]="vigia.fatigado ? 'aviso' : ''"
          />
        }
        <fabric-kpi
          etiqueta="Latencia de datos"
          [valor]="d.latenciaDatosMin"
          unidad="min"
          [nota]="d.latenciaDatosMin === null ? 'sin lecturas fiables en 24 h' : 'cadencia esperada: 10 min'"
          [tono]="d.latenciaDatosMin === null ? 'mal' : d.latenciaDatosMin > 12 ? 'aviso' : 'ok'"
        />
        <fabric-kpi
          etiqueta="MTBF del fleje (7 d)"
          [valor]="d.mtbfFleje7dHoras"
          unidad="h/rotura"
          [decimales]="1"
          [nota]="notaMtbf()"
          [tono]="d.roturas7d === 0 ? 'ok' : ''"
        />
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Jornada de hoy</h2>
          <span class="soft">estados del telar · 00:00–24:00</span>
        </div>
        <fabric-linea-jornada [segmentos]="d.segmentosJornada" [inicioDia]="inicioJornadaIso()" />
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Últimas lecturas</h2>
          <span class="soft">las 30 más recientes · cadencia de 10 min</span>
        </div>
        <div class="tabla-scroll">
          <table class="tabla">
            <thead>
              <tr>
                <th>Recibida</th>
                <th>Estado</th>
                <th class="derecha">Golpes</th>
                <th class="derecha">Amperios</th>
                <th class="derecha">Potencia</th>
                <th class="derecha">Descenso</th>
                <th class="derecha">Altura</th>
                <th>Dato</th>
              </tr>
            </thead>
            <tbody>
              @for (lectura of d.lecturasRecientes; track lectura.id) {
                <tr [class.sospechosa]="lectura.sospechosa">
                  <td>{{ fechaHora(lectura.recibidaEn) }}</td>
                  <td>{{ incidencia(lectura) }}</td>
                  <td class="derecha">
                    <fabric-metrica [valor]="lectura.golpesPorMinuto" unidad="golpes/min" [tam]="13" />
                  </td>
                  <td class="derecha">
                    <fabric-metrica [valor]="lectura.amperios" unidad="A" [tam]="13" />
                  </td>
                  <td class="derecha">
                    <fabric-metrica [valor]="lectura.potenciaKw" unidad="kW" [decimales]="1" [tam]="13" />
                  </td>
                  <td class="derecha">
                    <fabric-metrica [valor]="lectura.velocidadMmH" unidad="mm/h" [tam]="13" />
                  </td>
                  <td class="derecha">
                    <fabric-metrica [valor]="lectura.alturaActualMm" unidad="mm" [tam]="13" />
                  </td>
                  <td class="sin-tachar">
                    <fabric-data-badge
                      [sospechosa]="lectura.sospechosa"
                      [motivos]="lectura.motivosSospecha"
                    />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="dos-columnas">
        <div class="panel">
          <div class="panel-head">
            <h2>Ciclo del bloque actual</h2>
            <span class="soft">partes de trabajo</span>
          </div>
          @if (d.eventosCicloActual.length > 0) {
            <ol class="linea-tiempo">
              @for (evento of d.eventosCicloActual; track evento.id) {
                <li>
                  <span class="punto-evento"></span>
                  <span class="num hora-evento">{{ hora(evento) }}</span>
                  <span>
                    <strong>{{ tipoEvento(evento) }}</strong>
                    @if (evento.paquetes; as paquetes) {
                      <span class="muted">
                        — {{ numero(paquetes.numPaquetes) }} paquetes ·
                        {{ numero(paquetes.numTablas) }} tablas ·
                        {{ numero(paquetes.metrosCuadrados, 1) }} m²
                      </span>
                    }
                  </span>
                </li>
              }
            </ol>
          } @else {
            <div class="estado-vacio">Sin partes para el bloque actual todavía</div>
          }
        </div>

        <div class="panel">
          <div class="panel-head">
            <h2>Últimos bloques cortados</h2>
            <span class="soft">previsto frente a real</span>
          </div>
          <div class="tabla-scroll">
            <table class="tabla">
              <thead>
                <tr>
                  <th>Bloque</th>
                  <th>Colocación</th>
                  <th class="derecha">Corte</th>
                  <th class="derecha">Paros</th>
                  <th class="derecha">Tablas</th>
                  <th class="derecha">m² reales</th>
                  <th class="derecha">Merma</th>
                </tr>
              </thead>
              <tbody>
                @for (ciclo of d.historialCiclos; track ciclo.id) {
                  <tr>
                    <td>
                      <span class="celda-bloque">
                        <fabric-material-dot [materialId]="ciclo.bloque.materialId" [tam]="11" />
                        {{ ciclo.bloque.numero }}
                      </span>
                    </td>
                    <td>{{ fechaHora(ciclo.colocacion) }}</td>
                    <td class="derecha">
                      <fabric-metrica [valor]="ciclo.horasMarcha" unidad="h" [decimales]="1" [tam]="13" />
                    </td>
                    <td class="derecha">{{ parosCiclo(ciclo.numParos, ciclo.horasParo) }}</td>
                    <td class="derecha">{{ tablasCiclo(ciclo.tablasPrevistas, ciclo.paquetes?.numTablas) }}</td>
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
                    <td colspan="7"><div class="estado-vacio">Sin ciclos completados aún</div></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </section>
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
    .volver {
      font-size: 13.5px;
      font-weight: 650;
      width: fit-content;
    }
    .volver:hover {
      color: var(--text);
    }
    .hero-izq {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .hero-info {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .bloque-info {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-size: 14px;
      font-weight: 650;
    }
    .hero-progreso {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
    }
    .medidas-panel {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 14px;
    }
    .medida {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 13px;
    }
    .medida-valor {
      font-size: 16.5px;
      font-weight: 720;
    }
    .micro-etiqueta {
      font-size: 10.5px;
      font-weight: 650;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--text-soft);
    }
    .dos-columnas {
      display: grid;
      grid-template-columns: minmax(280px, 5fr) minmax(300px, 7fr);
      gap: 14px;
      align-items: start;
    }
    .columna-graficos {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-width: 0;
    }
    .leyenda-bloque {
      margin-top: 10px;
    }
    .linea-tiempo {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .linea-tiempo li {
      display: flex;
      align-items: baseline;
      gap: 10px;
      font-size: 13.5px;
    }
    .punto-evento {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--stone);
      flex: none;
      align-self: center;
    }
    .hora-evento {
      color: var(--text-soft);
      font-weight: 650;
      flex: none;
    }
    .celda-bloque {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    @media (max-width: 900px) {
      .dos-columnas {
        grid-template-columns: 1fr;
      }
    }
  `
})
export class DetalleTelarComponent {
  private readonly api = inject(FabricApi);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly reloj = inject(RelojService);
  private readonly fuenteDatos = inject(FuenteDatosService);

  readonly detalle = toSignal(
    // La fuente entra en el stream para refrescar al instante con el switch.
    combineLatest([
      this.ruta.paramMap.pipe(map((params) => Number(params.get('id')))),
      toObservable(this.fuenteDatos.fuente)
    ]).pipe(
      switchMap(([id]) => {
        if (!TELAR_IDS.includes(id)) {
          // /telares/abc o /telares/9: fuera, a la sala.
          this.router.navigate(['/telares']);
          return EMPTY;
        }
        return timer(0, 5000).pipe(
          // Un fallo puntual no mata el polling: se reintenta al siguiente tick.
          switchMap(() => this.api.getDetalleTelar(id).pipe(catchError(() => EMPTY)))
        );
      })
    ),
    { initialValue: null }
  );

  readonly ahoraIso = computed(() => new Date(this.reloj.ahoraMs()).toISOString());

  readonly inicioJornadaIso = computed(() => {
    const ahora = new Date(this.reloj.ahoraMs());
    return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).toISOString();
  });

  /** Dominio del gráfico de altura: hasta el ETA si cae más tarde que ahora. */
  readonly finDominioAltura = computed(() => {
    const d = this.detalle();
    const ahora = this.reloj.ahoraMs();
    const eta = d?.snapshot.etaFinCorte ? new Date(d.snapshot.etaFinCorte).getTime() : 0;
    return new Date(Math.max(ahora, eta)).toISOString();
  });

  readonly proyeccionAltura = computed<ProyeccionLinea | null>(() => {
    const d = this.detalle();
    const lectura = d?.snapshot.ultimaLectura;
    if (!d || !lectura || !d.snapshot.etaFinCorte || d.snapshot.estado !== 'marcha') {
      return null;
    }
    return {
      t1: lectura.recibidaEn,
      v1: lectura.alturaActualMm,
      t2: d.snapshot.etaFinCorte,
      v2: 0
    };
  });

  /** Altura continua para el Bloque Vivo (entre lecturas también baja). */
  readonly alturaActualMm = computed(() => {
    const d = this.detalle();
    if (!d || d.snapshot.alturaInicialMm === null || d.snapshot.progresoPct === null) {
      return d?.snapshot.ultimaLectura?.alturaActualMm ?? 0;
    }
    return d.snapshot.alturaInicialMm * (1 - d.snapshot.progresoPct / 100);
  });

  readonly etaTexto = computed(() => {
    const d = this.detalle();
    if (!d?.snapshot.etaFinCorte) {
      return 'avance del corte';
    }
    return `termina ~${formatEta(d.snapshot.etaFinCorte, this.reloj.ahoraMs())}`;
  });

  readonly leyendaBloque = computed(() => {
    const d = this.detalle();
    const snapshot = d?.snapshot;
    if (!snapshot?.bloque || snapshot.alturaInicialMm === null) {
      return '';
    }
    const velocidad = snapshot.ultimaLectura?.velocidadMmH ?? 0;
    return (
      `El bastidor baja a ${formatNumero(velocidad)} mm/h. ` +
      `Cada lámina es una tabla de 2 cm; el hueco entre ellas, el kerf del fleje (8 mm).`
    );
  });

  readonly notaTablas = computed(() => {
    const m2 = this.detalle()?.snapshot.m2Previstos;
    return m2 != null ? `≈ ${formatNumero(m2, 1)} m² previstos` : '';
  });

  readonly notaVigia = computed(() => {
    const vigia = this.detalle()?.vigiaFleje;
    if (!vigia || vigia.ratioActual === null) {
      return 'sin corte activo';
    }
    return vigia.fatigado
      ? 'fleje fatigado — revisar'
      : `mediana del corte: ${formatNumero(vigia.ratioMediana, 2)}`;
  });

  readonly notaMtbf = computed(() => {
    const d = this.detalle();
    if (!d) {
      return '';
    }
    if (d.roturas7d === null) {
      return 'la fuente actual no identifica roturas';
    }
    return d.roturas7d === 0
      ? 'sin roturas en 7 días'
      : `${formatNumero(d.roturas7d)} ${d.roturas7d === 1 ? 'rotura' : 'roturas'} en 7 días`;
  });

  nombreMaterial(bloque: Bloque): string {
    return materialPorId(bloque.materialId).nombre;
  }

  medidas(bloque: Bloque, tipo: 'proveedor' | 'fabrica'): string {
    const medidas = tipo === 'proveedor' ? bloque.medidasProveedor : bloque.medidasFabrica;
    return formatMedidasCm(medidas.largoCm, medidas.altoCm, medidas.gruesoCm);
  }

  volumen(bloque: Bloque, tipo: 'proveedor' | 'fabrica'): string {
    const medidas = tipo === 'proveedor' ? bloque.medidasProveedor : bloque.medidasFabrica;
    const m3 = (medidas.largoCm * medidas.altoCm * medidas.gruesoCm) / 1_000_000;
    return `${formatNumero(m3, 2)} m³`;
  }

  mermaPct(bloque: Bloque): number {
    const proveedor = bloque.medidasProveedor;
    const fabrica = bloque.medidasFabrica;
    const m3Proveedor = proveedor.largoCm * proveedor.altoCm * proveedor.gruesoCm;
    const m3Fabrica = fabrica.largoCm * fabrica.altoCm * fabrica.gruesoCm;
    return m3Proveedor > 0 ? ((m3Proveedor - m3Fabrica) / m3Proveedor) * 100 : 0;
  }

  incidencia(lectura: LecturaTelar): string {
    return ETIQUETA_INCIDENCIA[lectura.incidencia];
  }

  tipoEvento(evento: EventoParte): string {
    return ETIQUETA_EVENTO[evento.tipo];
  }

  hora(evento: EventoParte): string {
    return formatHora(evento.fechaHora);
  }

  fechaHora(iso: string): string {
    return formatFechaHora(iso);
  }

  numero(valor: number | null | undefined, decimales = 0): string {
    return formatNumero(valor ?? null, decimales);
  }

  parosCiclo(numParos: number, horasParo: number): string {
    return `${formatNumero(numParos)} · ${formatNumero(horasParo, 1)} h`;
  }

  /** m² reales del parte si existen; si no, la estimación marcada con ≈. */
  m2Ciclo(ciclo: CicloBloque): string {
    if (ciclo.paquetes) {
      return formatNumero(ciclo.paquetes.metrosCuadrados, 1);
    }
    return ciclo.m2Previstos !== null ? `≈ ${formatNumero(ciclo.m2Previstos, 1)}` : '—';
  }

  // `reales` llega como null (no undefined) desde la plantilla: el `?.` de
  // Angular compila a null. Comparar con == null cubre ambos.
  tablasCiclo(previstas: number | null, reales: number | null | undefined): string {
    if (previstas === null) {
      return reales == null ? '—' : `${formatNumero(reales)}`;
    }
    if (reales == null) {
      return `≈ ${formatNumero(previstas)}`;
    }
    return `${formatNumero(previstas)} prev. → ${formatNumero(reales)} reales`;
  }
}
