import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { Router } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, combineLatest } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { FabricApi } from '../../core/fabric-api';
import { FuenteDatosService } from '../../core/fuente-datos.service';
import { ETIQUETA_INCIDENCIA } from '../../core/etiquetas';
import { formatFechaHora, formatNumero } from '../../core/format';
import { materialPorId } from '../../core/materiales';
import {
  BloqueDudoso,
  LecturaBloqueDudosa,
  LecturaTelar,
  MedidaBloqueFuente
} from '../../core/models';
import { KpiTileComponent } from '../../shared/kpi-tile.component';
import { DataBadgeComponent } from '../../shared/data-badge.component';
import { MaterialDotComponent } from '../../shared/material-dot.component';
import { MaterialSelectComponent } from '../../shared/material-select.component';
import { MetricaComponent } from '../../shared/metrica.component';

/** Banderas de medida dudosa por las que se puede filtrar (tipo de problema). */
type MotivoFlag =
  | 'medidasIncoherentes'
  | 'volumenImposible'
  | 'volumenIncompatibleParte'
  | 'pmDuplicado'
  | 'parteEnOtroTelar';

/**
 * Medidas dudosas: todos los bloques/lotes cuyas medidas no cuadran (consola del
 * telar incompatible con el parte, m³ menor que la piedra cortada, medida de
 * inventario imposible, PM duplicado o parte aparecido en otro telar). Cada fila
 * se despliega y reúne TODAS las fuentes de medida del bloque (proveedor de
 * inventario, fábrica/MRP, consola del telar y parte) y qué pasó en el telar,
 * para diagnosticar de dónde sale el ruido del dato y poder limpiarlo.
 */
@Component({
  selector: 'fabric-medidas-dudosas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    KpiTileComponent,
    DataBadgeComponent,
    MaterialDotComponent,
    MaterialSelectComponent,
    MetricaComponent
  ],
  template: `
    <div class="fila-filtros">
      <input
        type="search"
        class="control md-busqueda"
        placeholder="Nº de lote"
        aria-label="Buscar por nº de lote"
        [value]="lote() ?? ''"
        (change)="setLote(valorDe($event) || null)"
      />
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
      <fabric-material-select
        [materiales]="materiales()"
        [seleccion]="material()"
        (seleccionChange)="setMaterial($event)"
      />
      <select
        class="control"
        aria-label="Filtrar por tipo de problema"
        [value]="motivo() ?? ''"
        (change)="setMotivo(valorDe($event))"
      >
        <option value="">Todos los motivos</option>
        @for (m of MOTIVOS_FILTRO; track m.key) {
          <option [value]="m.key">{{ m.label }}</option>
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

    @if (error()) {
      <div class="banner-error" role="alert">
        ⚠ No se pudo actualizar desde la fuente ({{ error() }}).
      </div>
    }

    @if (pagina(); as p) {
      <section class="kpi-grid">
        <fabric-kpi
          etiqueta="Bloques con medidas dudosas"
          [valor]="p.total"
          [total]="p.totalBloques"
          [unidad]="p.totalBloques === 1 ? 'lote' : 'lotes'"
          [nota]="notaTotal()"
          [tono]="p.total > 0 ? 'aviso' : 'ok'"
        />
        <fabric-kpi
          etiqueta="Consola ≠ parte"
          [valor]="p.conteo.medidasIncoherentes"
          unidad="lotes"
          nota="medidas de consola incompatibles con el parte"
        />
        <fabric-kpi
          etiqueta="m³ < piedra cortada"
          [valor]="p.conteo.volumenIncompatibleParte"
          unidad="lotes"
          nota="el m³ de inventario no da para los m² del parte"
        />
        <fabric-kpi
          etiqueta="Medida imposible"
          [valor]="p.conteo.volumenImposible"
          unidad="lotes"
          nota="dimensión de inventario fuera de rango físico"
        />
        <fabric-kpi
          etiqueta="Nº de lote duplicado"
          [valor]="p.conteo.pmDuplicado"
          unidad="lotes"
          nota="el PM aparece en más de un bloque del inventario"
        />
        <fabric-kpi
          etiqueta="Parte en otro telar"
          [valor]="p.conteo.parteEnOtroTelar"
          unidad="lotes"
          nota="el parte de aserrado consta en otro telar"
        />
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Bloques con medidas dudosas</h2>
          <span class="soft">{{ notaCabecera(p) }}</span>
        </div>
        <div class="tabla-scroll">
          <table class="tabla md-tabla">
            <thead>
              <tr>
                <th class="md-exp" rowspan="2"></th>
                <th rowspan="2">Telar</th>
                <th rowspan="2">Nº de lote</th>
                <th rowspan="2">Material</th>
                <th rowspan="2">Motivos</th>
                <th class="derecha md-grupo" colspan="2">Inventario</th>
                <th class="derecha md-grupo" colspan="2">Consola</th>
                <th class="derecha" rowspan="2">m² parte</th>
                <th class="derecha" rowspan="2">Espesor</th>
                <th class="derecha" rowspan="2">Rendimiento</th>
                <th rowspan="2">Corte</th>
              </tr>
              <tr>
                <th class="derecha md-grupo">Medidas</th>
                <th class="derecha">m³</th>
                <th class="derecha md-grupo">Medidas</th>
                <th class="derecha">m³</th>
              </tr>
            </thead>
            <tbody>
              @for (b of bloquesFiltrados(); track b.id) {
                <tr class="md-fila" [class.md-abierta]="abierta() === b.id" (click)="toggle(b.id)">
                  <td class="md-exp">
                    <span class="md-flecha" [class.md-flecha-abierta]="abierta() === b.id">▸</span>
                  </td>
                  <td><span [style.color]="'var(--t' + b.telarId + ')'">T{{ b.telarId }}</span></td>
                  <td class="num">{{ b.pmLote }}</td>
                  <td>
                    <span class="md-celda">
                      <fabric-material-dot [materialId]="b.materialId" [tam]="11" />
                      {{ nombreMaterial(b.materialId) }}
                    </span>
                  </td>
                  <td>
                    <span class="md-motivos">
                      @for (m of b.motivos; track m) {
                        <span class="md-chip" [title]="m">{{ motivoCorto(m) }}</span>
                      }
                    </span>
                  </td>
                  <td class="derecha md-medida">{{ medidasTxt(b.inventario?.fabrica) }}</td>
                  <td class="derecha">
                    <fabric-metrica [valor]="b.inventario?.fabrica?.volumenM3 ?? null" unidad="m³" [decimales]="2" [tam]="13" />
                  </td>
                  <td class="derecha md-medida">
                    {{ medidasTxt(b.consola) }}
                    @if (b.consolaInestable) {
                      <span
                        class="md-warn"
                        [title]="'La medida de consola cambió (' + b.consolaMedidasDistintas + ' medidas distintas) durante el corte: medida heredada/ruido'"
                      >⚠</span>
                    }
                  </td>
                  <td class="derecha">
                    <fabric-metrica [valor]="b.consola.volumenM3" unidad="m³" [decimales]="2" [tam]="13" />
                  </td>
                  <td class="derecha">
                    <fabric-metrica [valor]="b.paquetes?.metrosCuadrados ?? null" unidad="m²" [decimales]="1" [tam]="13" />
                  </td>
                  <td class="derecha">
                    <fabric-metrica [valor]="b.espesorCorteCm" unidad="cm" [decimales]="1" [tam]="13" />
                  </td>
                  <td class="derecha">
                    <fabric-metrica [valor]="b.rendimientoM2M3" unidad="m²/m³" [decimales]="2" [tam]="13" />
                    @if (b.rendimientoSobreTechoPct !== null) {
                      <div class="md-techo" [class.md-warn]="b.rendimientoSobreTechoPct > 100" [title]="textoTecho(b)">
                        {{ b.rendimientoSobreTechoPct }} % del máx{{ b.rendimientoSobreTechoPct > 100 ? ' ⚠' : '' }}
                      </div>
                    }
                  </td>
                  <td class="md-fecha">{{ fecha(b.inicioCorte) }}</td>
                </tr>
                @if (abierta() === b.id) {
                  <tr class="md-detalle-fila">
                    <td colspan="13">
                      <div class="md-detalle">
                        <div class="md-paneles">
                          <div class="md-card">
                            <h3>Medidas del bloque por fuente</h3>
                            <table class="tabla md-comparativa">
                              <thead>
                                <tr>
                                  <th>Fuente</th>
                                  <th class="derecha">Largo</th>
                                  <th class="derecha">Alto</th>
                                  <th class="derecha">Grueso</th>
                                  <th class="derecha">Volumen</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td>
                                    Proveedor (entrada)
                                    @if (b.inventario) {
                                      <span class="md-sub">{{ b.inventario.fuente === 'alta' ? 'alta de almacén' : 'stock' }}</span>
                                    }
                                  </td>
                                  @if (b.inventario; as inv) {
                                    <td class="derecha"><fabric-metrica [valor]="inv.proveedor.largoM" unidad="m" [decimales]="2" [tam]="13" /></td>
                                    <td class="derecha"><fabric-metrica [valor]="inv.proveedor.altoM" unidad="m" [decimales]="2" [tam]="13" /></td>
                                    <td class="derecha"><fabric-metrica [valor]="inv.proveedor.gruesoM" unidad="m" [decimales]="2" [tam]="13" /></td>
                                    <td class="derecha">
                                      <fabric-metrica [valor]="inv.proveedor.volumenM3" unidad="m³" [decimales]="2" [tam]="13" />
                                      @if (inv.proveedor.imposible) { <span class="md-warn" title="Medida físicamente imposible">⚠</span> }
                                    </td>
                                  } @else {
                                    <td class="derecha" colspan="4"><span class="soft">sin alta en inventario</span></td>
                                  }
                                </tr>
                                <tr>
                                  <td>Inventario <span class="md-sub">medida de fábrica/MRP</span></td>
                                  @if (b.inventario; as inv) {
                                    <td class="derecha"><fabric-metrica [valor]="inv.fabrica.largoM" unidad="m" [decimales]="2" [tam]="13" /></td>
                                    <td class="derecha"><fabric-metrica [valor]="inv.fabrica.altoM" unidad="m" [decimales]="2" [tam]="13" /></td>
                                    <td class="derecha"><fabric-metrica [valor]="inv.fabrica.gruesoM" unidad="m" [decimales]="2" [tam]="13" /></td>
                                    <td class="derecha"><fabric-metrica [valor]="inv.fabrica.volumenM3" unidad="m³" [decimales]="2" [tam]="13" /></td>
                                  } @else {
                                    <td class="derecha" colspan="4"><span class="soft">—</span></td>
                                  }
                                </tr>
                                <tr>
                                  <td>
                                    Consola del telar
                                    <span class="md-sub">
                                      @if (b.loteBloqueAnterior !== null) {
                                        arrastrada del bloque anterior: lote {{ b.loteBloqueAnterior }}
                                      } @else {
                                        arrastrada del bloque anterior = ruido
                                      }
                                    </span>
                                  </td>
                                  <td class="derecha"><fabric-metrica [valor]="b.consola.largoM" unidad="m" [decimales]="2" [tam]="13" /></td>
                                  <td class="derecha"><fabric-metrica [valor]="b.consola.altoM" unidad="m" [decimales]="2" [tam]="13" /></td>
                                  <td class="derecha"><fabric-metrica [valor]="b.consola.gruesoM" unidad="m" [decimales]="2" [tam]="13" /></td>
                                  <td class="derecha">
                                    <fabric-metrica [valor]="b.consola.volumenM3" unidad="m³" [decimales]="2" [tam]="13" />
                                    @if (b.consola.imposible) { <span class="md-warn" title="Medida físicamente imposible">⚠</span> }
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                            <p class="md-nota">
                              Merma de compra (proveedor→inventario):
                              <strong><fabric-metrica [valor]="b.inventario?.mermaPct ?? null" unidad="%" [decimales]="1" [tam]="13" /></strong>
                              @if (b.inventario && b.inventario.bloques > 1) {
                                · <span class="md-warn">el nº de lote aparece en {{ b.inventario.bloques }} filas del inventario</span>
                              }
                            </p>
                          </div>

                          <div class="md-card">
                            <h3>Parte y producción</h3>
                            <div class="md-datos">
                              <div class="md-ancho"><span class="soft">Operario(s)</span><span class="md-valor-txt">{{ b.operarios.length ? b.operarios.join(', ') : '—' }}</span></div>
                              <div><span class="soft">m² del parte</span><fabric-metrica [valor]="b.paquetes?.metrosCuadrados ?? null" unidad="m²" [decimales]="1" [tam]="14" /></div>
                              <div><span class="soft">Tablas</span><fabric-metrica [valor]="b.paquetes?.numTablas ?? null" unidad="tablas" [tam]="14" /></div>
                              <div><span class="soft">Paquetes</span><fabric-metrica [valor]="b.paquetes?.numPaquetes ?? null" unidad="paq." [tam]="14" /></div>
                              <div><span class="soft">Largo de tabla</span><fabric-metrica [valor]="b.paquetes?.largoTablaM ?? null" unidad="m" [decimales]="2" [tam]="14" /></div>
                              <div><span class="soft">Alto de tabla</span><fabric-metrica [valor]="b.paquetes?.altoTablaM ?? null" unidad="m" [decimales]="2" [tam]="14" /></div>
                              <div><span class="soft">Espesor de corte</span><fabric-metrica [valor]="b.espesorCorteCm" unidad="cm" [decimales]="1" [tam]="14" /></div>
                              <div><span class="soft">m³ del lote (inventario)</span><fabric-metrica [valor]="b.volumenInventarioM3" unidad="m³" [decimales]="2" [tam]="14" /></div>
                              <div><span class="soft">Rendimiento</span><fabric-metrica [valor]="b.rendimientoM2M3" unidad="m²/m³" [decimales]="2" [tam]="14" /></div>
                              <div><span class="soft">Horas marcha</span><fabric-metrica [valor]="b.horasMarcha" unidad="h" [decimales]="1" [tam]="14" /></div>
                              <div><span class="soft">Horas paro</span><fabric-metrica [valor]="b.horasParo" unidad="h" [decimales]="1" [tam]="14" /></div>
                              <div><span class="soft">Paros</span><fabric-metrica [valor]="b.numParos" [tam]="14" /></div>
                              <div><span class="soft">Lecturas</span><fabric-metrica [valor]="b.numLecturas" [tam]="14" /></div>
                            </div>
                            <p class="md-nota">
                              Corte: {{ fecha(b.inicioCorte) }} → {{ b.finCorte ? fecha(b.finCorte) : 'en curso' }}
                              @if (b.numLecturasConAlertas > 0) {
                                · {{ b.numLecturasConAlertas }} lecturas con avisos
                              }
                              @if (b.numLecturasSospechosas > 0) {
                                · {{ b.numLecturasSospechosas }} en cuarentena
                              }
                            </p>
                          </div>

                          <div class="md-card">
                            <h3>Coherencia física</h3>
                            <div class="md-datos">
                              <div><span class="soft">Piedra cortada (m²×grosor)</span><fabric-metrica [valor]="b.piedraCortadaM3" unidad="m³" [decimales]="2" [tam]="14" /></div>
                              <div><span class="soft">m³ del bloque</span><fabric-metrica [valor]="b.volumenInventarioM3" unidad="m³" [decimales]="2" [tam]="14" /></div>
                              <div>
                                <span class="soft">Merma de aserrado</span>
                                <span [class.md-warn]="(b.mermaAserradoPct ?? 0) < 0">
                                  <fabric-metrica [valor]="b.mermaAserradoPct" unidad="%" [decimales]="1" [tam]="14" />
                                </span>
                              </div>
                              <div><span class="soft">Máx. a este grosor (1/grosor)</span><fabric-metrica [valor]="b.techoRendimientoM2M3" unidad="m²/m³" [decimales]="1" [tam]="14" /></div>
                              <div>
                                <span class="soft">Rendimiento / máx</span>
                                <span class="md-valor-txt" [class.md-warn]="(b.rendimientoSobreTechoPct ?? 0) > 100">
                                  {{ b.rendimientoSobreTechoPct !== null ? b.rendimientoSobreTechoPct + ' %' : '—' }}
                                </span>
                              </div>
                              <div><span class="soft">Tablas previstas / reales</span><span class="md-valor-txt">{{ tablasPrevReal(b) }}</span></div>
                              <div>
                                <span class="soft">Medidas de consola distintas</span>
                                <span class="md-valor-txt" [class.md-warn]="b.consolaInestable">{{ b.consolaMedidasDistintas }}</span>
                              </div>
                            </div>
                            <p class="md-nota">
                              La piedra que sale en tabla (m² × grosor) no puede ocupar más que el m³ del
                              bloque: merma de aserrado negativa o rendimiento &gt; 100 % del máximo = dato
                              imposible (revisar el m³ del lote o los m² del parte).
                            </p>
                          </div>
                        </div>

                        <div class="md-card">
                          <h3>Lecturas del telar para este lote <span class="soft">({{ b.lecturas.length }})</span></h3>
                          <div class="md-lecturas-scroll">
                            <table class="tabla md-lecturas">
                              <thead>
                                <tr>
                                  <th>Dato</th>
                                  <th>Recibida</th>
                                  <th>Estado</th>
                                  <th>Medida consola</th>
                                  <th class="derecha">Potencia</th>
                                  <th class="derecha">Amperios</th>
                                  <th class="derecha">Golpes</th>
                                  <th class="derecha">Velocidad</th>
                                  <th class="derecha">Altura</th>
                                </tr>
                              </thead>
                              <tbody>
                                @for (l of b.lecturas; track l.lectura.id) {
                                  <tr>
                                    <td>
                                      <fabric-data-badge
                                        [sospechosa]="l.lectura.sospechosa"
                                        [motivos]="l.lectura.motivosSospecha"
                                        [alertas]="l.lectura.alertas"
                                      />
                                    </td>
                                    <td class="md-fecha">{{ fecha(l.lectura.recibidaEn) }}</td>
                                    <td>{{ incidencia(l.lectura) }}</td>
                                    <td class="num">{{ medidaConsola(l) }}</td>
                                    <td class="derecha"><fabric-metrica [valor]="l.lectura.potenciaKw" unidad="kW" [decimales]="1" [tam]="13" /></td>
                                    <td class="derecha"><fabric-metrica [valor]="l.lectura.amperios" unidad="A" [tam]="13" /></td>
                                    <td class="derecha"><fabric-metrica [valor]="l.lectura.golpesPorMinuto" unidad="g/min" [tam]="13" /></td>
                                    <td class="derecha"><fabric-metrica [valor]="l.lectura.velocidadMmH" unidad="mm/h" [tam]="13" /></td>
                                    <td class="derecha"><fabric-metrica [valor]="l.lectura.alturaActualMm" unidad="mm" [tam]="13" /></td>
                                  </tr>
                                } @empty {
                                  <tr><td colspan="9" class="md-vacia">Sin lecturas para este lote en la ventana</td></tr>
                                }
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                }
              } @empty {
                <tr>
                  <td colspan="13" class="md-vacia">
                    Sin bloques con medidas dudosas en el periodo
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="nota-metodo pie-metodo">
          Un bloque entra aquí si alguna de sus medidas no cuadra: la medida de consola del telar
          incompatible con el parte, el m³ de inventario menor que la piedra cortada (m² × espesor),
          una medida de inventario imposible, un nº de lote (PM) duplicado, o el parte de aserrado
          aparecido en otro telar. Se reúnen todas las fuentes de medida del bloque para localizar el
          origen del descuadre; nada se estima ni se corrige automáticamente.
        </p>
      </section>
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
    /* Control segmentado de telar: igual que en /partes. Local porque el nombre
       .seg colisiona con el de linea-jornada (utilidad global sin scope). */
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
    .md-tabla {
      min-width: 1020px;
    }
    .md-grupo {
      border-left: 1px solid var(--line);
    }
    .md-medida {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      font-size: 12.5px;
    }
    .md-techo {
      font-size: 11px;
      color: var(--text-soft);
      white-space: nowrap;
    }
    .md-techo.md-warn {
      color: var(--amber);
    }
    .md-fila {
      cursor: pointer;
    }
    .md-fila:hover {
      background: var(--surface-soft);
    }
    .md-abierta {
      background: var(--surface-soft);
    }
    .md-exp {
      width: 22px;
      text-align: center;
    }
    .md-flecha {
      display: inline-block;
      color: var(--text-muted);
      transition: transform 0.15s ease;
    }
    .md-flecha-abierta {
      transform: rotate(90deg);
      color: var(--text);
    }
    .md-busqueda {
      min-width: 180px;
    }
    .md-celda {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .md-motivos {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      /* Columna estrecha (~mitad): los chips se reparten en varias líneas en vez
         de estirar la columna a una sola fila. */
      max-width: 150px;
    }
    .md-chip {
      font-size: 11px;
      line-height: 1.4;
      padding: 1px 7px;
      border-radius: 999px;
      background: rgba(243, 200, 106, 0.14);
      border: 1px solid rgba(243, 200, 106, 0.4);
      color: var(--amber-text, var(--amber));
      /* Etiqueta corta en una sola línea; la frase completa va en el title
         (tooltip al pasar el ratón), de ahí el cursor de ayuda. */
      white-space: nowrap;
      cursor: help;
    }
    .md-fecha {
      white-space: nowrap;
      font-size: 12px;
      color: var(--text-muted);
    }
    .md-detalle-fila > td {
      padding: 0;
      background: var(--bg, var(--surface-soft));
    }
    .md-detalle {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px 16px 18px;
      /* El detalle vive dentro de un <td> de la tabla y .tabla td impone
         white-space: nowrap (global, sin scope), que SE HEREDA: sin esto los
         operarios, las notas y las etiquetas no parten línea y se desbordan
         sobre la tarjeta vecina. Las tablas internas (.md-comparativa,
         .md-lecturas) reaplican su propio nowrap por celda. */
      white-space: normal;
    }
    .md-paneles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 12px;
      align-items: start;
    }
    .md-card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius-row);
      padding: 12px 14px;
    }
    .md-card h3 {
      margin: 0 0 8px;
      font-size: 12.5px;
      font-weight: 750;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: var(--text);
    }
    .md-comparativa {
      min-width: 0;
      width: 100%;
    }
    .md-comparativa td,
    .md-comparativa th {
      padding: 5px 8px;
    }
    /* La primera columna (fuente + subtexto) SÍ parte línea: .tabla td impone
       nowrap global y, sin esto, el subtexto largo ("heredada del bloque
       anterior: lote …") ensancha la columna y arrincona las cifras contra el
       borde de la tarjeta. Las columnas numéricas siguen en nowrap. */
    .md-comparativa td:first-child,
    .md-comparativa th:first-child {
      white-space: normal;
    }
    .md-sub {
      display: block;
      font-size: 11px;
      color: var(--text-soft);
      font-weight: 400;
    }
    .md-datos {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 8px 14px;
    }
    .md-datos > div {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .md-datos .soft {
      font-size: 11px;
    }
    .md-ancho {
      grid-column: 1 / -1;
    }
    .md-valor-txt {
      font-size: 13px;
      font-weight: 650;
      color: var(--text);
    }
    .md-nota {
      margin-top: 10px;
      font-size: 12px;
      color: var(--text-muted);
    }
    .md-warn {
      color: var(--amber);
    }
    .md-lecturas-scroll {
      max-height: 320px;
      overflow: auto;
    }
    .md-lecturas {
      min-width: 720px;
    }
    .md-lecturas td,
    .md-lecturas th {
      padding: 4px 8px;
    }
    .md-vacia {
      text-align: center;
      color: var(--text-muted);
      font-size: 12.5px;
      padding: 16px 0;
    }
    .pie-metodo {
      margin-top: 12px;
    }
  `
})
export class MedidasDudosasComponent {
  private readonly api = inject(FabricApi);
  private readonly fuenteDatos = inject(FuenteDatosService);
  private readonly router = inject(Router);

  readonly telares = [1, 2, 3, 4];

  /**
   * Etiqueta corta (2-3 palabras) para el chip de cada motivo; la frase completa
   * (la que da el backend) va en el `title` del chip. Las claves son las cadenas
   * de `motivosDeBloqueDudoso` del backend; si llegara una nueva sin mapear, se
   * recorta a las 3 primeras palabras (fallback, sin inventar significado).
   */
  private readonly MOTIVO_CORTO: Record<string, string> = {
    'Medidas de consola incompatibles con el parte': 'Consola ≠ parte',
    'Medida de inventario físicamente imposible': 'Medida imposible',
    'm³ de inventario menor que la piedra cortada (m² × espesor)': 'm³ < piedra',
    'Nº de lote (PM) duplicado en el inventario': 'Lote duplicado',
    'El parte de aserrado de este lote consta en otro telar': 'Otro telar'
  };

  constructor() {
    // Medidas dudosas es un diagnóstico de datos REALES: en Demo no hay
    // corrupción de medida que diagnosticar. Si la fuente es Demo —entrada
    // directa por URL o conmutación en caliente— se sale a Fuentes; la
    // subpestaña tampoco se ofrece en Demo (ver soloReal en seccion-layout).
    effect(() => {
      if (!this.fuenteDatos.esReal()) {
        void this.router.navigate(['/salud/fuentes']);
      }
    });
  }

  readonly telar = signal<number | null>(null);
  readonly lote = signal<string | null>(null);
  readonly material = signal<string | null>(null);
  readonly motivo = signal<MotivoFlag | null>(null);
  readonly desde = signal<string | null>(null);
  readonly hasta = signal<string | null>(null);
  readonly abierta = signal<string | null>(null);

  /** Tipos de problema para el desplegable de motivos (etiqueta corta + bandera). */
  readonly MOTIVOS_FILTRO: { key: MotivoFlag; label: string }[] = [
    { key: 'medidasIncoherentes', label: 'Consola ≠ parte' },
    { key: 'volumenImposible', label: 'Medida imposible' },
    { key: 'volumenIncompatibleParte', label: 'm³ < piedra' },
    { key: 'pmDuplicado', label: 'Lote duplicado' },
    { key: 'parteEnOtroTelar', label: 'Otro telar' }
  ];

  readonly error = signal<string | null>(null);

  /** Vista de análisis: se recarga al cambiar filtros o fuente, sin polling. */
  readonly pagina = toSignal(
    combineLatest([
      toObservable(this.desde),
      toObservable(this.hasta),
      toObservable(this.telar),
      toObservable(this.fuenteDatos.fuente)
    ]).pipe(
      switchMap(([desde, hasta, telar]) =>
        this.api.getMedidasDudosas(desde, hasta, telar).pipe(
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
    ),
    { initialValue: null }
  );

  /** Ids de material presentes en los bloques dudosos, ordenados por nombre. */
  readonly materiales = computed<string[]>(() => {
    const p = this.pagina();
    if (!p) {
      return [];
    }
    return [...new Set(p.bloques.map((b) => b.materialId))].sort((a, b) =>
      this.nombreMaterial(a).localeCompare(this.nombreMaterial(b), 'es')
    );
  });

  readonly hayFiltros = computed(
    () =>
      this.lote() !== null ||
      this.telar() !== null ||
      this.material() !== null ||
      this.motivo() !== null ||
      this.desde() !== null ||
      this.hasta() !== null
  );

  readonly bloquesFiltrados = computed<BloqueDudoso[]>(() => {
    const p = this.pagina();
    if (!p) {
      return [];
    }
    let items = p.bloques;
    const q = this.lote()?.trim();
    if (q) {
      items = items.filter((b) => String(b.pmLote).includes(q));
    }
    const material = this.material();
    if (material !== null) {
      items = items.filter((b) => b.materialId === material);
    }
    const motivo = this.motivo();
    if (motivo !== null) {
      items = items.filter((b) => b[motivo]);
    }
    return items;
  });

  notaTotal(): string {
    const p = this.pagina();
    if (!p) {
      return '';
    }
    return p.truncado
      ? `de ${formatNumero(p.totalBloques)} aserrados · mostrando ${p.bloques.length} más recientes`
      : 'de los lotes aserrados en el periodo';
  }

  notaCabecera(p: { total: number; truncado: boolean; bloques: BloqueDudoso[] }): string {
    const visibles = this.bloquesFiltrados().length;
    const base = `${formatNumero(visibles)} de ${formatNumero(p.total)} lotes`;
    return p.truncado ? `${base} · lista recortada a los más recientes` : base;
  }

  toggle(id: string): void {
    this.abierta.set(this.abierta() === id ? null : id);
  }

  nombreMaterial(materialId: string | null): string {
    return materialPorId(materialId).nombre;
  }

  /** Etiqueta corta del motivo para el chip (la frase completa va en su tooltip). */
  motivoCorto(motivo: string): string {
    return this.MOTIVO_CORTO[motivo] ?? motivo.split(' ').slice(0, 3).join(' ');
  }

  fecha(iso: string): string {
    return formatFechaHora(iso);
  }

  incidencia(lectura: LecturaTelar): string {
    return ETIQUETA_INCIDENCIA[lectura.incidencia];
  }

  /** Tooltip del rendimiento vs techo físico (1/grosor). */
  textoTecho(b: BloqueDudoso): string {
    if (b.techoRendimientoM2M3 === null || b.rendimientoSobreTechoPct === null) {
      return '';
    }
    const base = `máx. a ${formatNumero(b.espesorCorteCm, 1)} cm = ${formatNumero(
      b.techoRendimientoM2M3,
      1
    )} m²/m³ · este lote rinde el ${b.rendimientoSobreTechoPct} % del máximo`;
    return b.rendimientoSobreTechoPct > 100
      ? `${base} → físicamente imposible (revisar el m³ del lote o los m² del parte)`
      : base;
  }

  /** "≈previstas / reales" de tablas; "—" donde falte el dato. */
  tablasPrevReal(b: BloqueDudoso): string {
    const prev = b.tablasPrevistas !== null ? `≈${formatNumero(b.tablasPrevistas)}` : '—';
    const real = b.paquetes?.numTablas != null ? formatNumero(b.paquetes.numTablas) : '—';
    return `${prev} / ${real}`;
  }

  /** Medidas de una fuente como "largo×alto×grueso m" (en metros), o "—" si no las trae. */
  medidasTxt(f: MedidaBloqueFuente | null | undefined): string {
    if (!f || (f.largoM === null && f.altoM === null && f.gruesoM === null)) {
      return '—';
    }
    const d = (v: number | null): string => (v === null ? '?' : formatNumero(v, 2));
    return `${d(f.largoM)}×${d(f.altoM)}×${d(f.gruesoM)} m`;
  }

  /** Medida de bloque de una lectura, "largo×alto×grueso cm" o "—" si no la trae. */
  medidaConsola(l: LecturaBloqueDudosa): string {
    if (l.largoCm <= 0 && l.altoCm <= 0 && l.gruesoCm <= 0) {
      return '—';
    }
    return `${formatNumero(l.largoCm)}×${formatNumero(l.altoCm)}×${formatNumero(l.gruesoCm)} cm`;
  }

  valorDe(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLSelectElement).value;
  }

  setLote(l: string | null): void {
    this.lote.set(l);
  }

  setTelar(t: number | null): void {
    this.telar.set(t);
  }

  setMaterial(m: string | null): void {
    this.material.set(m);
  }

  setMotivo(valor: string): void {
    this.motivo.set(valor === '' ? null : (valor as MotivoFlag));
  }

  setDesde(fecha: string | null): void {
    this.desde.set(fecha);
  }

  setHasta(fecha: string | null): void {
    this.hasta.set(fecha);
  }

  limpiarFiltros(): void {
    this.lote.set(null);
    this.telar.set(null);
    this.material.set(null);
    this.motivo.set(null);
    this.desde.set(null);
    this.hasta.set(null);
  }
}
