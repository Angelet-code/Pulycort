import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { materialPorId, materialPorNombre } from '../core/materiales';

/** Círculo de color que identifica el material trabajado. */
@Component({
  selector: 'fabric-material-dot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="dot"
      [style.width.px]="tam()"
      [style.height.px]="tam()"
      [style.background]="material().color"
      [style.border-color]="material().colorBorde"
      [title]="material().nombre"
    ></span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
    }
    .dot {
      display: inline-block;
      border-radius: 50%;
      border: 1.5px solid;
      box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.35);
      flex: none;
    }
  `
})
export class MaterialDotComponent {
  /** Color por id de catálogo (telar, partes…). */
  readonly materialId = input<string | null>(null);
  /**
   * Color por nombre, para cuando el id no es del catálogo (inventario: las
   * altas recientes traen el id del producto "M3 BLOQUE X"). Si se da, prevalece.
   */
  readonly nombre = input<string | null>(null);
  readonly tam = input(14);

  readonly material = computed(() => {
    const nombre = this.nombre();
    return nombre !== null
      ? materialPorNombre(nombre)
      : materialPorId(this.materialId());
  });
}
