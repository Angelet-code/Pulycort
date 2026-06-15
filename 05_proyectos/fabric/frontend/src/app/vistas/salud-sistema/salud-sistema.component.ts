import { ChangeDetectionStrategy, Component } from '@angular/core';
import { KpiTileComponent } from '../../shared/kpi-tile.component';
import {
  AreaSistema,
  ETIQUETA_AREA,
  ETIQUETA_ESTADO,
  PROBLEMAS_SISTEMA,
  ProblemaSistema
} from './catalogo-salud-sistema';

/**
 * Salud del sistema: registro de los problemas detectados en máquinas,
 * base de datos, cálculos y flujo de producción, con la solución recomendada
 * y de quién depende cada arreglo. Complementa a "Salud del dato" (lecturas
 * en cuarentena en vivo): aquí está el diagnóstico de fondo, allí el síntoma
 * del día a día.
 */
@Component({
  selector: 'fabric-salud-sistema',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KpiTileComponent],
  template: `
    <section class="kpi-grid">
      <fabric-kpi
        etiqueta="Problemas registrados"
        [valor]="total"
        [unidad]="total === 1 ? 'problema' : 'problemas'"
        nota="registro curado a mano · ver 00_gestion/TAREAS.md"
      />
      <fabric-kpi
        etiqueta="Pendientes"
        [valor]="pendientes"
        unidad="por resolver"
        nota="necesitan acción fuera de Fabric"
        [tono]="pendientes > 0 ? 'aviso' : 'ok'"
      />
      <fabric-kpi
        etiqueta="Mitigados en Fabric"
        [valor]="mitigados"
        unidad="con parche"
        nota="Fabric los esquiva, pero la causa de fondo sigue"
      />
      <fabric-kpi
        etiqueta="Corregidos"
        [valor]="corregidos"
        unidad="resueltos"
        nota="arreglados en el propio Fabric"
        [tono]="'ok'"
      />
    </section>

    @for (area of areas; track area) {
      <section class="panel">
        <div class="panel-head">
          <h2>{{ etiquetaArea[area] }}</h2>
          <span class="soft">{{ porArea(area).length }} {{ porArea(area).length === 1 ? 'problema' : 'problemas' }}</span>
        </div>
        <div class="tabla-scroll">
          <table class="tabla tabla-sistema">
            <thead>
              <tr>
                <th>Problema</th>
                <th>Solución recomendada</th>
                <th>Depende de</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              @for (problema of porArea(area); track problema.id) {
                <tr>
                  <td class="celda-problema">
                    <strong>{{ problema.problema }}</strong>
                    <span class="evidencia">{{ problema.evidencia }}</span>
                  </td>
                  <td class="celda-solucion">{{ problema.solucion }}</td>
                  <td>
                    <span class="responsables">
                      @for (quien of problema.dependeDe; track quien) {
                        <span class="pill-quien">{{ quien }}</span>
                      }
                    </span>
                  </td>
                  <td>
                    <span class="pill-estado" [class]="'estado-' + problema.estado">
                      {{ etiquetaEstado[problema.estado] }}
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }

    <p class="nota-metodo">
      Registro curado a mano a partir de la auditoría de datos reales (2026-06-12), de
      00_gestion/TAREAS.md y de fabric/VERIFICACION.md. La evidencia de cada fila es un
      hecho documentado; la solución es una propuesta. Al confirmar o corregir algo,
      actualizar este registro y TAREAS.md a la vez.
    </p>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .tabla-sistema {
      min-width: 860px;
    }
    .tabla-sistema td {
      vertical-align: top;
      white-space: normal;
    }
    .celda-problema {
      min-width: 260px;
      max-width: 420px;
    }
    .celda-problema strong {
      display: block;
      margin-bottom: 4px;
    }
    .evidencia {
      display: block;
      color: var(--text-muted);
      font-size: 12px;
      line-height: 1.45;
    }
    .celda-solucion {
      min-width: 240px;
      max-width: 380px;
      color: var(--text-muted);
      font-size: 12.5px;
      line-height: 1.45;
    }
    .responsables {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      min-width: 110px;
    }
    .pill-quien {
      padding: 2px 9px;
      border-radius: var(--radius-pill);
      border: 1px solid var(--line-strong);
      background: var(--surface-soft);
      font-size: 11.5px;
      font-weight: 650;
      white-space: nowrap;
    }
    .pill-estado {
      display: inline-block;
      padding: 2px 9px;
      border-radius: var(--radius-pill);
      font-size: 11.5px;
      font-weight: 700;
      white-space: nowrap;
    }
    .estado-pendiente {
      background: rgba(243, 200, 106, 0.14);
      color: var(--amber);
      border: 1px solid rgba(243, 200, 106, 0.35);
    }
    .estado-mitigado {
      background: rgba(79, 201, 222, 0.12);
      color: var(--teal);
      border: 1px solid rgba(79, 201, 222, 0.3);
    }
    .estado-corregido {
      background: rgba(53, 217, 157, 0.12);
      color: var(--green);
      border: 1px solid rgba(53, 217, 157, 0.3);
    }
  `
})
export class SaludSistemaComponent {
  readonly etiquetaArea = ETIQUETA_AREA;
  readonly etiquetaEstado = ETIQUETA_ESTADO;
  readonly areas: AreaSistema[] = ['maquinas', 'datos', 'calculos', 'flujo'];

  readonly total = PROBLEMAS_SISTEMA.length;
  readonly pendientes = PROBLEMAS_SISTEMA.filter((p) => p.estado === 'pendiente').length;
  readonly mitigados = PROBLEMAS_SISTEMA.filter((p) => p.estado === 'mitigado').length;
  readonly corregidos = PROBLEMAS_SISTEMA.filter((p) => p.estado === 'corregido').length;

  porArea(area: AreaSistema): ProblemaSistema[] {
    return PROBLEMAS_SISTEMA.filter((p) => p.area === area);
  }
}
