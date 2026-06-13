import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SnapshotTelar } from '../../core/models';
import { materialPorId } from '../../core/materiales';
import {
  formatDuracionMin,
  formatEta,
  formatMedidasCm,
  formatNumero,
  formatRelativo
} from '../../core/format';
import { RelojService } from '../../core/reloj.service';
import { EstadoChipComponent } from '../../shared/estado-chip.component';
import { MaterialDotComponent } from '../../shared/material-dot.component';
import { MetricaComponent } from '../../shared/metrica.component';
import { BarraProgresoComponent } from '../../shared/barra-progreso.component';
import { SparklineComponent } from '../../shared/sparkline.component';
import { DataBadgeComponent } from '../../shared/data-badge.component';

/** Tarjeta de telar de la sala: estado, bloque, avance con ETA y micro-métricas. */
@Component({
  selector: 'fabric-tarjeta-telar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    EstadoChipComponent,
    MaterialDotComponent,
    MetricaComponent,
    BarraProgresoComponent,
    SparklineComponent,
    DataBadgeComponent
  ],
  template: `
    <a class="tarjeta panel" [routerLink]="['/telares', telar().telarId]">
      <header>
        <h2>
          <span class="acento" [style.background]="'var(--t' + telar().telarId + ')'"></span>
          {{ telar().nombre }}
        </h2>
        <span class="cabecera-der">
          @if (telar().datosSospechosos) {
            <fabric-data-badge
              [sospechosa]="true"
              [motivos]="['Hay lecturas en cuarentena en las últimas 24 h (ver Salud del dato)']"
              title="Avisa de que alguna lectura de las últimas 24 h cayó en cuarentena: fecha imposible, potencia/amperios/golpes/velocidad fuera de rango o altura del bastidor incoherente. El detalle está en Salud del dato."
            />
          }
          <fabric-estado-chip
            [estado]="telar().estado"
            [causa]="telar().causaParo"
            title="Estado actual de la máquina según el código de incidencia de su última lectura (como mucho de hace 25 min). Si deja de emitir, pasa a «sin señal»."
          />
        </span>
      </header>

      @if (telar().bloque; as bloque) {
        <div class="bloque-linea">
          <span
            class="material-grupo"
            title="Tipo de piedra que se corta. Se toma del parte del operario (más fiable) y, si falta, de la lectura de la máquina; en telares con el material «clavado» solo vale el parte. Sin dato fiable: «desconocido»."
          >
            <fabric-material-dot [materialId]="bloque.materialId" [tam]="16" />
            <span class="material">{{ nombreMaterial() }}</span>
          </span>
          <span
            class="muted"
            title="Identificador del bloque de piedra en la bancada. Se deduce del número que repiten las lecturas de la máquina y se mantiene mientras se corta ese bloque."
            >Bloque {{ bloque.numero }}</span
          >
          <span
            class="soft medidas"
            title="Largo × alto × grueso del bloque (en cm), tomados de la última lectura de la máquina con las tres medidas completas. Es la base con la que se calcula el avance del corte."
            >{{ medidasFabrica() }}</span
          >
        </div>

        <div class="avance">
          <div class="avance-cifras">
            <span
              class="progreso-valor"
              title="Cuánto del bloque ya está cortado: lo que ha bajado el bastidor respecto a la altura inicial del bloque. Tope 100 %. Se actualiza con cada lectura (~10 min)."
            >
              <fabric-metrica [valor]="telar().progresoPct" unidad="%" [decimales]="1" [tam]="24" />
            </span>
            <span class="muted eta" [title]="etaAyuda()">{{ etaTexto() }}</span>
          </div>
          <fabric-barra-progreso [pct]="telar().progresoPct" [color]="colorProgreso()" />
        </div>
      } @else {
        <div class="estado-vacio sin-bloque">Sin bloque en la bancada</div>
      }

      <div class="micro-metricas">
        <div
          class="micro"
          title="Golpes del cabezal de sierra por minuto, tal cual los manda la máquina (cada ~10 min). En marcha lo normal es 700–1.000; fuera de ese rango (en marcha) la lectura pasa a cuarentena. En paro vale 0."
        >
          <span class="micro-etiqueta">Golpes</span>
          <fabric-metrica [valor]="lectura()?.golpesPorMinuto" unidad="golpes/min" [tam]="16" />
        </div>
        <div
          class="micro"
          title="Potencia que consume el telar en el instante de la lectura. En marcha ronda 45–75 kW; se marca en cuarentena si supera 76 kW, es negativa o no cuadra con los amperios (amperios ≈ 2 × potencia)."
        >
          <span class="micro-etiqueta">Potencia</span>
          <fabric-metrica [valor]="lectura()?.potenciaKw" unidad="kW" [tam]="16" />
        </div>
        <div
          class="micro"
          title="Velocidad de descenso del bastidor que la máquina lleva programada (consigna), no el ritmo realmente medido. A más dura la piedra, más lento: de ~90 a ~310 mm/h. Por encima de 310 pasa a cuarentena."
        >
          <span class="micro-etiqueta">Descenso</span>
          <span class="descenso">
            <fabric-metrica [valor]="lectura()?.velocidadMmH" unidad="mm/h" [tam]="16" />
            @if (desvioTexto(); as desvio) {
              <span
                class="desvio"
                [title]="
                  'Compara el ritmo real de bajada (mm bajados ÷ horas, últimas 6 lecturas en marcha del bloque) con la velocidad programada. ↑ baja más rápido que la consigna, ↓ más lento. Solo se muestra si supera ±10 %. ' +
                  ritmoRealTexto()
                "
                >{{ desvio }}</span
              >
            }
          </span>
        </div>
      </div>

      <div
        class="spark"
        title="Curva de la potencia de las últimas 2 horas (cada punto, una lectura). Solo entran lecturas válidas; las de cuarentena no aparecen. La escala llega a 76 kW."
      >
        <span class="micro-etiqueta">Potencia · últimas 2 h</span>
        <fabric-sparkline
          [puntos]="telar().seriePotencia"
          [yMax]="76"
          [color]="'var(--t' + telar().telarId + ')'"
        />
      </div>

      <footer class="muted">
        <span
          title="Personal a cargo del telar, tomado de la lectura más reciente; los nombres se resuelven desde Odoo (si no, se ven los códigos). Sin operarios registrados: «Turno noche · marcha automática»."
          >{{ operariosTexto() }}</span
        >
        <span
          class="soft"
          title="Tiempo desde la última lectura recibida de la máquina (sello de recepción del servidor). Lo normal es una cada ~10 minutos."
          >{{ ultimaLecturaTexto() }}</span
        >
      </footer>
    </a>
  `,
  styles: `
    .tarjeta {
      display: flex;
      flex-direction: column;
      gap: 12px;
      transition: transform 0.18s ease, border-color 0.18s ease;
    }
    .tarjeta:hover {
      transform: translateY(-2px);
      border-color: var(--line-strong);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .cabecera-der {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .acento {
      display: inline-block;
      width: 8px;
      height: 18px;
      border-radius: 4px;
      margin-right: 2px;
    }
    .bloque-linea {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 13.5px;
    }
    .material-grupo {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .material {
      font-weight: 720;
      letter-spacing: 0.01em;
    }
    .medidas {
      font-variant-numeric: tabular-nums;
    }
    .avance {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .avance-cifras {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
    }
    .eta {
      font-size: 12.5px;
    }
    .sin-bloque {
      padding: 18px;
    }
    .micro-metricas {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .micro {
      display: flex;
      flex-direction: column;
      gap: 2px;
      background: var(--surface-soft);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 8px 10px;
      min-width: 0;
    }
    .micro-etiqueta {
      font-size: 10.5px;
      font-weight: 650;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--text-soft);
    }
    .descenso {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
    }
    .desvio {
      font-size: 11.5px;
      font-weight: 700;
      color: var(--amber);
    }
    .spark {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    footer {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      font-size: 12px;
      flex-wrap: wrap;
    }
  `
})
export class TarjetaTelarComponent {
  private readonly reloj = inject(RelojService);

  readonly telar = input.required<SnapshotTelar>();

  readonly lectura = computed(() => this.telar().ultimaLectura);

  readonly nombreMaterial = computed(() =>
    materialPorId(this.telar().bloque?.materialId).nombre
  );

  readonly medidasFabrica = computed(() => {
    const medidas = this.telar().bloque?.medidasFabrica;
    return medidas
      ? `${formatMedidasCm(medidas.largoCm, medidas.altoCm, medidas.gruesoCm)} (fábrica)`
      : '';
  });

  readonly etaTexto = computed(() => {
    const telar = this.telar();
    const ahora = this.reloj.ahoraMs();
    switch (telar.estado) {
      case 'marcha':
        return telar.etaFinCorte ? `Termina ~${formatEta(telar.etaFinCorte, ahora)}` : '';
      case 'paro':
      case 'incidencia':
        return telar.estadoDesde
          ? `En paro ${minutosDesde(telar.estadoDesde, ahora)}`
          : 'En paro';
      case 'cambio-bloque':
        return 'Preparando la bancada';
      default:
        return 'Sin señal de la máquina';
    }
  });

  /** Tooltip de la línea de ETA/paro: cambia según el estado del telar. */
  readonly etaAyuda = computed(() => {
    switch (this.telar().estado) {
      case 'marcha':
        return 'Hora estimada de fin del corte: la altura que falta dividida por la velocidad consignada en la máquina. Solo mientras está en marcha; se recalcula en cada lectura.';
      case 'paro':
      case 'incidencia':
        return 'Tiempo que lleva el telar parado en este estado, desde la primera lectura de la racha. Si pasa más de 25 min sin señal, se considera que la racha se cortó.';
      case 'cambio-bloque':
        return 'Se está preparando la bancada para colocar el siguiente bloque.';
      default:
        return 'No llegan lecturas recientes de la máquina (más de 25 min sin señal).';
    }
  });

  readonly colorProgreso = computed(() => {
    switch (this.telar().estado) {
      case 'incidencia':
        return 'linear-gradient(90deg, var(--red), var(--amber))';
      case 'paro':
        return 'linear-gradient(90deg, var(--amber), var(--stone))';
      default:
        return 'linear-gradient(90deg, var(--teal), var(--green))';
    }
  });

  readonly desvioTexto = computed(() => {
    const desvio = this.telar().desvioRitmo;
    if (!desvio || Math.abs(desvio.desvioPct) <= 10 || this.telar().estado !== 'marcha') {
      return null;
    }
    const flecha = desvio.desvioPct > 0 ? '↑' : '↓';
    return `${flecha} ${formatNumero(Math.abs(desvio.desvioPct))} %`;
  });

  readonly ritmoRealTexto = computed(() => {
    const desvio = this.telar().desvioRitmo;
    return desvio ? `${formatNumero(desvio.realMmH)} mm/h frente a consigna` : '';
  });

  readonly operariosTexto = computed(() => {
    const telar = this.telar();
    if (!telar.operario1 && !telar.operario2) {
      return 'Turno noche · marcha automática';
    }
    return [telar.operario1, telar.operario2]
      .filter(Boolean)
      .map((nombre) => abreviar(nombre as string))
      .join(' · ');
  });

  readonly ultimaLecturaTexto = computed(() => {
    const lectura = this.lectura();
    return lectura ? `Lectura ${formatRelativo(lectura.recibidaEn, this.reloj.ahoraMs())}` : '';
  });
}

function minutosDesde(iso: string, ahora: number): string {
  const minutos = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60_000));
  return `desde hace ${formatDuracionMin(minutos)}`;
}

function abreviar(nombre: string): string {
  const partes = nombre.split(' ').filter(Boolean);
  if (partes.length <= 1) {
    return nombre;
  }
  return `${partes[0].charAt(0)}. ${partes.slice(1, 3).join(' ')}`;
}
