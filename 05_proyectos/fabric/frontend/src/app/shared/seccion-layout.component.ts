import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';
import { filter, map } from 'rxjs';
import { FuenteDatosService } from '../core/fuente-datos.service';

/** Una sub-pestaña de sección: etiqueta y ruta absoluta de destino. */
export interface SubPestana {
  label: string;
  link: string;
  /**
   * Solo se ofrece con datos reales: vistas de diagnóstico que no tienen sentido
   * en Demo (p. ej. Medidas dudosas, que diagnostica corrupción de datos reales).
   */
  soloReal?: boolean;
}

/** Rutas cuyo contenido no depende de la fuente (no llevan el chip Demo/Real). */
const VISTAS_SIN_FUENTE = ['/detecciones'];

/**
 * Armazón de una sección con sub-pestañas (Partes, Inventario, Salud): pinta la
 * fila de sub-pestañas (con el indicador de fuente a la derecha) y debajo la
 * vista hija activa. Las sub-pestañas llegan por `data.subpestanas` de la ruta
 * padre, así que el layout es genérico.
 */
@Component({
  selector: 'fabric-seccion-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="barra-sub">
      <nav class="subpestanas" aria-label="Sub-secciones">
        @for (tab of subpestanasVisibles(); track tab.link) {
          <a [routerLink]="tab.link" routerLinkActive="activa" class="subtab">{{ tab.label }}</a>
        }
      </nav>
      @if (mostrarFuente()) {
        @if (fuenteDatos.esReal()) {
          <span class="chip chip-fuente chip-real">
            <span class="punto"></span>
            Datos reales de BD
          </span>
        } @else {
          <span class="chip chip-fuente chip-demo">
            <span class="punto"></span>
            Datos demo
          </span>
        }
      }
    </div>
    <router-outlet />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .barra-sub {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    /* .subpestanas / .subtab: estilo compartido en styles.css. */
  `
})
export class SeccionLayoutComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly fuenteDatos = inject(FuenteDatosService);

  /** Sub-pestañas declaradas en `data.subpestanas` de la ruta de la sección. */
  readonly subpestanas = toSignal(
    this.route.data.pipe(map((d) => (d['subpestanas'] as SubPestana[] | undefined) ?? [])),
    { initialValue: [] as SubPestana[] }
  );

  /** Las que se ofrecen según la fuente: las `soloReal` se ocultan en Demo. */
  readonly subpestanasVisibles = computed(() => {
    const reales = this.fuenteDatos.esReal();
    return this.subpestanas().filter((tab) => reales || !tab.soloReal);
  });

  /** URL actual; el chip de fuente solo aplica a las vistas que leen de la BD. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url)
    ),
    { initialValue: this.router.url }
  );

  readonly mostrarFuente = computed(() => {
    const u = this.url();
    return !VISTAS_SIN_FUENTE.some((sufijo) => u.includes(sufijo));
  });
}
