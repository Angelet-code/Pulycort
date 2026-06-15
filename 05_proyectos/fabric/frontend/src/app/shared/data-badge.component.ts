import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Sello de calidad del dato: ✓ verificado o ⚠ sospechoso, con los motivos
 * del validador en el tooltip. Los datos malos se señalan, nunca se ocultan.
 */
@Component({
  selector: 'fabric-data-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="sello"
      [class.mal]="sospechosa()"
      role="img"
      [attr.aria-label]="titulo()"
      [title]="titulo()"
    >
      {{ sospechosa() ? '⚠' : '✓' }}
    </span>
  `,
  styles: `
    .sello {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: var(--radius-sm);
      font-size: 11px;
      color: var(--green);
      background: rgba(53, 217, 157, 0.12);
      border: 1px solid rgba(53, 217, 157, 0.3);
      cursor: default;
    }
    .sello.mal {
      color: var(--amber);
      background: rgba(243, 200, 106, 0.13);
      border-color: rgba(243, 200, 106, 0.4);
    }
  `
})
export class DataBadgeComponent {
  readonly sospechosa = input.required<boolean>();
  readonly motivos = input<string[]>([]);

  readonly titulo = computed(() =>
    this.sospechosa() ? this.motivos().join(' · ') || 'Lectura sospechosa' : 'Lectura verificada'
  );
}
