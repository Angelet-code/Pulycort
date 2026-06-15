import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { catchError, filter, map, of, switchMap, timer } from 'rxjs';
import { FabricApi } from './core/fabric-api';
import { FuenteDatosService } from './core/fuente-datos.service';
import { RelojService } from './core/reloj.service';

/**
 * Armazón de Fabric: una barra de navegación tipo pastilla centrada (logo
 * redondo + secciones) y, fuera de ella, los controles de fuente/reloj. En
 * móvil la navegación pasa al dock inferior. Las vistas cuelgan del router.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink],
  template: `
    <div class="marco">
      <header class="topbar">
        <nav class="barra-nav" aria-label="Secciones">
          <a routerLink="/telares" class="marca-logo" aria-label="Pulycort — inicio">
            <span class="logo-circulo" aria-hidden="true">
              <img class="logo-p" src="pulycort-p.svg" alt="" width="15" height="15" />
            </span>
          </a>
          <a routerLink="/telares" class="tab" [class.activa]="seccion() === 'maquinas'">Máquinas</a>
          <a routerLink="/produccion" class="tab" [class.activa]="seccion() === 'produccion'">
            Producción
          </a>
          <a routerLink="/partes" class="tab" [class.activa]="seccion() === 'partes'">Partes</a>
          <a routerLink="/inventario" class="tab" [class.activa]="seccion() === 'inventario'">
            Inventario
          </a>
          <a routerLink="/salud" class="tab" [class.activa]="seccion() === 'salud'">Salud</a>
        </nav>

        <div class="controles">
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
              [attr.aria-label]="
                reloj.factor() > 1
                  ? 'Reloj de demo acelerado ×60; pulsa para volver a tiempo real'
                  : 'Acelerar el reloj de demo a ×60'
              "
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
        <a routerLink="/telares" [class.activa]="seccion() === 'maquinas'">
          <span class="dock-icono" aria-hidden="true">▦</span>
          Máquinas
        </a>
        <a routerLink="/produccion" [class.activa]="seccion() === 'produccion'">
          <span class="dock-icono" aria-hidden="true">▤</span>
          Producción
        </a>
        <a routerLink="/partes" [class.activa]="seccion() === 'partes'">
          <span class="dock-icono" aria-hidden="true">☰</span>
          Partes
        </a>
        <a routerLink="/inventario" [class.activa]="seccion() === 'inventario'">
          <span class="dock-icono" aria-hidden="true">▣</span>
          Inventario
        </a>
        <a routerLink="/salud" [class.activa]="seccion() === 'salud'">
          <span class="dock-icono" aria-hidden="true">✓</span>
          Salud
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

    /* Cabecera: la pastilla de navegación va centrada y flota sobre el fondo;
       los controles de fuente/reloj quedan a la derecha, fuera de la pastilla. */
    .topbar {
      position: sticky;
      top: 10px;
      z-index: var(--z-bar);
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 12px;
    }
    .barra-nav {
      grid-column: 2;
      justify-self: center;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 5px;
      background: rgba(10, 17, 32, 0.72);
      border: 1px solid var(--line);
      border-radius: var(--radius-pill);
      backdrop-filter: blur(var(--blur-bar));
      box-shadow: var(--shadow-soft);
    }
    .marca-logo {
      display: inline-flex;
      align-items: center;
      flex: none;
      margin-right: 5px;
    }
    .logo-circulo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: #ffffff;
      color: #0a1120;
      overflow: hidden;
      box-shadow: inset 0 0 0 1px rgba(10, 17, 32, 0.06);
    }
    .logo-p {
      display: block;
      width: 15px;
      height: 15px;
    }
    .tab {
      padding: 7px 15px;
      border-radius: var(--radius-pill);
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--text-muted);
      white-space: nowrap;
      transition: background 0.2s ease, color 0.2s ease;
    }
    .tab:hover {
      color: var(--text);
    }
    .tab.activa {
      background: var(--text);
      color: #0a1120;
      font-weight: 700;
    }

    .controles {
      grid-column: 3;
      justify-self: end;
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
      backdrop-filter: blur(var(--blur-bar));
    }
    .switch-fuente .fuente {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      border-radius: var(--radius-pill);
      padding: 5px 12px;
      min-height: 32px;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 600;
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
      font-family: var(--font-mono);
      font-size: 12.5px;
      font-weight: 600;
      color: var(--text-muted);
      min-width: 96px;
      text-align: right;
    }
    .boton-demo {
      border: 1px solid var(--line-strong);
      background: var(--surface-soft);
      color: var(--text-muted);
      border-radius: var(--radius-pill);
      padding: 5px 12px;
      min-height: 32px;
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 650;
      transition: background 0.2s ease, color 0.2s ease;
    }
    .boton-demo.activo {
      background: var(--stone);
      border-color: var(--stone);
      color: var(--on-stone);
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
      font-family: var(--font-mono);
      font-size: 11px;
      letter-spacing: -0.01em;
    }
    .dock {
      display: none;
    }

    /* Móvil: la pastilla deja solo el logo (la navegación pasa al dock) y los
       controles de fuente quedan a la derecha. */
    @media (max-width: 760px) {
      .topbar {
        grid-template-columns: auto 1fr;
      }
      .barra-nav {
        grid-column: 1;
        justify-self: start;
        padding: 4px;
      }
      .barra-nav .tab {
        display: none;
      }
      .marca-logo {
        margin-right: 0;
      }
      .controles {
        grid-column: 2;
        justify-self: end;
      }
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
        z-index: var(--z-dock);
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 4px;
        padding: 8px;
        background: rgba(10, 17, 32, 0.88);
        border: 1px solid var(--line-strong);
        border-radius: 20px;
        backdrop-filter: blur(var(--blur-dock));
        box-shadow: var(--shadow);
      }
      .dock a {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 9px 4px;
        border-radius: 14px;
        font-family: var(--font-mono);
        font-size: 10.5px;
        font-weight: 600;
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
  private readonly router = inject(Router);

  /** URL actual como señal, para resaltar la sección activa de la pastilla. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url)
    ),
    { initialValue: this.router.url }
  );

  /** Sección de la barra a la que pertenece la ruta actual. */
  readonly seccion = computed<'maquinas' | 'produccion' | 'partes' | 'inventario' | 'salud'>(() => {
    const u = this.url();
    if (u.startsWith('/inventario')) {
      return 'inventario';
    }
    if (u.startsWith('/produccion')) {
      return 'produccion';
    }
    if (u.startsWith('/partes')) {
      return 'partes';
    }
    if (u.startsWith('/salud') || u.startsWith('/datos') || u.startsWith('/sistema')) {
      return 'salud';
    }
    return 'maquinas';
  });

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
