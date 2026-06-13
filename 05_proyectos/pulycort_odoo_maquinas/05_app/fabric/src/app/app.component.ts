import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { catchError, map, of, switchMap, timer } from 'rxjs';
import { FabricApi } from './core/fabric-api';
import { FuenteDatosService } from './core/fuente-datos.service';
import { RelojService } from './core/reloj.service';

/**
 * Armazón de Fabric: barra superior (marca, navegación, reloj y modo demo)
 * en escritorio y dock inferior en móvil. Las vistas cuelgan del router.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="marco">
      <header class="topbar">
        <a routerLink="/telares" class="marca">
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <rect x="3" y="4" width="3.4" height="16" rx="1.2" fill="var(--stone)" />
            <rect x="8.6" y="4" width="3.4" height="16" rx="1.2" fill="var(--stone)" opacity="0.75" />
            <rect x="14.2" y="4" width="3.4" height="11" rx="1.2" fill="var(--stone)" opacity="0.5" />
            <rect x="2" y="2" width="18" height="1.6" rx="0.8" fill="var(--text-muted)" />
          </svg>
          <span class="marca-texto">
            <strong>Fabric</strong>
            <span class="soft">Pulycort · producción</span>
          </span>
        </a>

        <nav class="nav-principal">
          <a routerLink="/telares" routerLinkActive="activa">Sala de telares</a>
          <a routerLink="/produccion" routerLinkActive="activa">Producción</a>
          <a routerLink="/partes" routerLinkActive="activa">Partes de producción</a>
          <a routerLink="/partes-trabajo" routerLinkActive="activa">Partes de trabajo</a>
          <a routerLink="/inventario" routerLinkActive="activa">Inventario</a>
          <a routerLink="/datos" routerLinkActive="activa">Salud del dato</a>
          <a routerLink="/sistema" routerLinkActive="activa">Salud del sistema</a>
        </nav>

        <div class="topbar-der">
          <div
            class="switch-fuente"
            role="group"
            aria-label="Fuente de datos"
            [title]="
              fuenteDatos.esReal()
                ? 'Leyendo de la base de datos real de las máquinas'
                : 'Datos simulados en memoria (demo)'
            "
          >
            <button
              type="button"
              class="fuente fuente-demo"
              [class.activa]="!fuenteDatos.esReal()"
              (click)="usarDemo()"
            >
              <span class="punto" style="background: var(--amber)"></span>
              Demo
            </button>
            <button
              type="button"
              class="fuente fuente-real"
              [class.activa]="fuenteDatos.esReal()"
              (click)="usarReal()"
            >
              <span class="punto" style="background: var(--green)"></span>
              Real
            </button>
          </div>
          <span class="reloj num">{{ horaTexto() }}</span>
          @if (!fuenteDatos.esReal()) {
            <button
              type="button"
              class="boton-demo"
              [class.activo]="reloj.factor() > 1"
              (click)="reloj.alternarDemo()"
              title="Acelera el reloj ×60 para ver avanzar los cortes (1 min real = 1 h de fábrica)"
            >
              {{ reloj.factor() > 1 ? '×60' : '×1' }}
            </button>
          }
        </div>
      </header>

      @if (backendEnDemo()) {
        <div class="aviso-backend-demo" role="alert">
          <strong>⚠ Datos de demostración.</strong>
          El modo Real está recibiendo el mock del backend (arrancado con
          DATABASE_PROVIDER=mock), no datos de fábrica. Reinicia fabric-backend en modo
          real para ver la planta.
        </div>
      }

      <main>
        <router-outlet />
      </main>

      <footer class="pie soft">
        @if (!fuenteDatos.esReal()) {
          Solo lectura · datos simulados en memoria (modo demo)
        } @else if (backendEnDemo()) {
          Solo lectura · ⚠ el backend está sirviendo datos de demostración
        } @else {
          Solo lectura · datos reales de la base de datos de las máquinas
        }
      </footer>

      <nav class="dock">
        <a routerLink="/telares" routerLinkActive="activa">
          <span class="dock-icono">▦</span>
          Telares
        </a>
        <a routerLink="/produccion" routerLinkActive="activa">
          <span class="dock-icono">▤</span>
          Producción
        </a>
        <a routerLink="/partes" routerLinkActive="activa">
          <span class="dock-icono">☰</span>
          Partes
        </a>
        <a routerLink="/partes-trabajo" routerLinkActive="activa">
          <span class="dock-icono">✎</span>
          Trabajo
        </a>
        <a routerLink="/inventario" routerLinkActive="activa">
          <span class="dock-icono">▣</span>
          Bloques
        </a>
        <a routerLink="/datos" routerLinkActive="activa">
          <span class="dock-icono">✓</span>
          Datos
        </a>
        <a routerLink="/sistema" routerLinkActive="activa">
          <span class="dock-icono">⚙</span>
          Sistema
        </a>
      </nav>
    </div>
  `,
  styles: `
    .marco {
      width: min(1440px, 100%);
      margin: 0 auto;
      padding: 14px clamp(12px, 2.5vw, 28px) 26px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 100vh;
    }
    .topbar {
      position: sticky;
      top: 10px;
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 10px 16px;
      background: rgba(10, 17, 32, 0.72);
      border: 1px solid var(--line);
      border-radius: var(--radius-panel);
      backdrop-filter: blur(18px);
      box-shadow: var(--shadow-soft);
    }
    .marca {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      flex: none;
    }
    .marca-texto {
      display: flex;
      flex-direction: column;
      line-height: 1.05;
    }
    .marca-texto strong {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 0.01em;
    }
    .marca-texto .soft {
      font-size: 10.5px;
    }
    .nav-principal {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .nav-principal a {
      padding: 7px 14px;
      border-radius: var(--radius-pill);
      font-size: 13.5px;
      font-weight: 650;
      color: var(--text-muted);
      transition: background 0.2s ease, color 0.2s ease;
    }
    .nav-principal a:hover {
      color: var(--text);
    }
    .nav-principal a.activa {
      background: var(--surface-strong);
      color: var(--text);
    }
    .topbar-der {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }
    .switch-fuente {
      display: inline-flex;
      gap: 2px;
      padding: 3px;
      border: 1px solid var(--line);
      border-radius: var(--radius-pill);
      background: var(--surface-soft);
    }
    .switch-fuente .fuente {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      border-radius: var(--radius-pill);
      padding: 4px 11px;
      font-size: 11.5px;
      font-weight: 700;
      transition: background 0.2s ease, color 0.2s ease;
    }
    .switch-fuente .fuente .punto {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      opacity: 0.45;
      transition: opacity 0.2s ease;
    }
    .switch-fuente .fuente.activa {
      background: var(--surface-strong);
      color: var(--text);
    }
    .switch-fuente .fuente.activa .punto {
      opacity: 1;
    }
    .reloj {
      font-size: 13.5px;
      font-weight: 700;
      color: var(--text-muted);
      min-width: 86px;
      text-align: right;
    }
    .boton-demo {
      border: 1px solid var(--line-strong);
      background: var(--surface-soft);
      color: var(--text-muted);
      border-radius: var(--radius-pill);
      padding: 5px 12px;
      font-size: 12.5px;
      font-weight: 750;
      transition: background 0.2s ease, color 0.2s ease;
    }
    .boton-demo.activo {
      background: var(--stone);
      border-color: var(--stone);
      color: #221c10;
    }
    .aviso-backend-demo {
      padding: 10px 16px;
      border: 1px solid var(--amber);
      border-radius: var(--radius-panel);
      background: color-mix(in srgb, var(--amber) 14%, transparent);
      font-size: 13px;
      line-height: 1.45;
    }
    .aviso-backend-demo strong {
      color: var(--amber);
    }
    main {
      flex: 1;
      min-width: 0;
    }
    .pie {
      text-align: center;
      font-size: 11.5px;
    }
    .dock {
      display: none;
    }
    @media (max-width: 760px) {
      .nav-principal,
      .reloj {
        display: none;
      }
      .marco {
        padding-bottom: 86px;
      }
      .dock {
        position: fixed;
        left: 12px;
        right: 12px;
        bottom: 12px;
        z-index: 30;
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 4px;
        padding: 8px;
        background: rgba(10, 17, 32, 0.88);
        border: 1px solid var(--line-strong);
        border-radius: 20px;
        backdrop-filter: blur(20px);
        box-shadow: var(--shadow);
      }
      .dock a {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 7px 4px;
        border-radius: 14px;
        font-size: 11px;
        font-weight: 650;
        color: var(--text-muted);
      }
      .dock a.activa {
        background: var(--surface-strong);
        color: var(--text);
      }
      .dock-icono {
        font-size: 16px;
        line-height: 1;
      }
    }
  `
})
export class AppComponent {
  readonly reloj = inject(RelojService);
  readonly fuenteDatos = inject(FuenteDatosService);
  private readonly api = inject(FabricApi);

  /**
   * Vigila que el modo Real reciba datos reales: si el backend declara
   * fuente='mock' (arrancado con DATABASE_PROVIDER=mock), el aviso impide
   * confundir la demo con la fábrica. Sondea cada 30 s solo en modo real;
   * un error de red no es aviso (la vista ya enseña su propio fallo).
   */
  readonly backendEnDemo = toSignal(
    toObservable(this.fuenteDatos.fuente).pipe(
      switchMap((fuente) =>
        fuente === 'real'
          ? timer(0, 30_000).pipe(
              switchMap(() =>
                this.api.getSnapshotPlanta().pipe(
                  map((planta) => planta.fuente === 'mock'),
                  catchError(() => of(false))
                )
              )
            )
          : of(false)
      )
    ),
    { initialValue: false }
  );

  usarDemo(): void {
    this.fuenteDatos.fijar('demo');
  }

  usarReal(): void {
    // El reloj acelerado solo tiene sentido sobre la simulación.
    if (this.reloj.factor() !== 1) {
      this.reloj.fijarFactor(1);
    }
    this.fuenteDatos.fijar('real');
  }

  readonly horaTexto = computed(() => {
    const fecha = new Date(this.reloj.ahoraMs());
    const dia = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric' }).format(fecha);
    const hora = new Intl.DateTimeFormat('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(fecha);
    return `${dia} · ${hora}`;
  });
}
