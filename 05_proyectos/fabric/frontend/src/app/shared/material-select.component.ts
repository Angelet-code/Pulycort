import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { materialPorId } from '../core/materiales';
import { MaterialDotComponent } from './material-dot.component';

/**
 * Filtro de material con el círculo de color del material junto al nombre.
 * Sustituye al `<select>` nativo (cuyos `<option>` solo admiten texto) por un
 * listbox propio para poder pintar el `<fabric-material-dot>` de cada material
 * en el desplegable. Es solo presentación del filtro: el valor que emite es el
 * id de material en crudo (string) o `null` para "todos", igual que enviaba el
 * `<select>` que reemplaza.
 */
@Component({
  selector: 'fabric-material-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialDotComponent],
  template: `
    <button
      type="button"
      class="control ms-trigger"
      aria-label="Filtrar por material"
      aria-haspopup="listbox"
      [attr.aria-expanded]="abierto()"
      [title]="nombreSeleccion() ?? 'Todos los materiales'"
      (click)="alternar()"
    >
      @if (seleccion(); as sel) {
        <fabric-material-dot [materialId]="sel" [tam]="11" />
        <span class="ms-texto">{{ nombreSeleccion() }}</span>
      } @else {
        <span class="ms-texto">Todos los materiales</span>
      }
      <span class="ms-chevron" aria-hidden="true">▾</span>
    </button>

    @if (abierto()) {
      <div class="ms-panel" role="listbox" aria-label="Materiales">
        <button
          type="button"
          class="ms-opcion"
          role="option"
          [attr.aria-selected]="seleccion() === null"
          [class.sel]="seleccion() === null"
          (click)="elegir(null)"
        >
          <span class="ms-hueco" aria-hidden="true"></span>
          Todos los materiales
        </button>
        @for (m of materiales(); track m) {
          <button
            type="button"
            class="ms-opcion"
            role="option"
            [attr.aria-selected]="seleccion() === idMaterial(m)"
            [class.sel]="seleccion() === idMaterial(m)"
            (click)="elegir(idMaterial(m))"
          >
            <fabric-material-dot [materialId]="idMaterial(m)" [tam]="12" />
            {{ nombreMaterial(m) }}
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-flex;
    }
    /* El look de pastilla lo aporta .control (global); aquí solo lo propio. */
    .ms-trigger {
      cursor: pointer;
      max-width: 220px;
    }
    .ms-texto {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ms-chevron {
      margin-left: auto;
      padding-left: 4px;
      font-size: 10px;
      color: var(--text-muted);
    }

    .ms-panel {
      position: absolute;
      top: calc(100% + 5px);
      left: 0;
      z-index: 40;
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 100%;
      max-width: 260px;
      max-height: 320px;
      overflow-y: auto;
      padding: 5px;
      background: var(--bg-2);
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-chip);
      box-shadow: var(--shadow);
    }

    .ms-opcion {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      border: none;
      background: transparent;
      color: var(--text);
      font: inherit;
      font-size: 12.5px;
      font-weight: 600;
      text-align: left;
      white-space: nowrap;
      padding: 7px 10px;
      border-radius: var(--radius-sm);
      cursor: pointer;
    }
    .ms-opcion:hover {
      background: var(--surface-soft);
    }
    .ms-opcion.sel {
      background: var(--stone);
      color: var(--on-stone);
    }
    /* Hueco del tamaño del dot para alinear el texto de "Todos" con el resto. */
    .ms-hueco {
      width: 12px;
      height: 12px;
      flex: none;
    }
  `
})
export class MaterialSelectComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Ids de material disponibles, tal cual llegan de la fuente. */
  readonly materiales = input<ReadonlyArray<string | number>>([]);
  /** Id de material seleccionado, o `null` para "todos los materiales". */
  readonly seleccion = input<string | null>(null);
  /** Emite el id seleccionado (string) o `null` al elegir "todos". */
  readonly seleccionChange = output<string | null>();

  readonly abierto = signal(false);

  /** Nombre del material seleccionado, o `null` cuando no hay filtro. */
  readonly nombreSeleccion = computed(() => {
    const sel = this.seleccion();
    return sel === null ? null : materialPorId(sel).nombre;
  });

  idMaterial(valor: string | number): string {
    return String(valor);
  }

  nombreMaterial(valor: string | number): string {
    return materialPorId(String(valor)).nombre;
  }

  alternar(): void {
    this.abierto.update((v) => !v);
  }

  elegir(valor: string | null): void {
    this.abierto.set(false);
    if (valor !== this.seleccion()) {
      this.seleccionChange.emit(valor);
    }
  }

  /** Cierra el desplegable al pulsar fuera del componente. */
  @HostListener('document:click', ['$event'])
  cerrarAlPulsarFuera(evento: MouseEvent): void {
    if (this.abierto() && !this.host.nativeElement.contains(evento.target as Node)) {
      this.abierto.set(false);
    }
  }

  /** Cierra el desplegable con Escape. */
  @HostListener('document:keydown.escape')
  cerrarConEscape(): void {
    if (this.abierto()) {
      this.abierto.set(false);
    }
  }
}
