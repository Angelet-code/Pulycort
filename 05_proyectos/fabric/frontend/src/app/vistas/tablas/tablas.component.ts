import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Inventario de tablas: vista en preparación. No hay todavía una fuente de
 * tablas cortadas conectada, así que no se inventa nada — solo se anuncia que
 * está por llegar (ver 00_gestion/TAREAS.md).
 */
@Component({
  selector: 'fabric-tablas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <div class="estado-vacio">
        Esta vista está en preparación: todavía no hay una fuente de tablas
        cortadas conectada a Fabric.
      </div>
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
  `
})
export class TablasComponent {}
