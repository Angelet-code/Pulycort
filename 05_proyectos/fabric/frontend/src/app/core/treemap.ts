/**
 * Treemap "squarified" (Bruls, Huizing & van Wijk, 2000): coloca cada elemento
 * como un rectángulo de área proporcional a su valor, manteniéndolos lo más
 * cuadrados posible (como WinDirStat). Es pura geometría de presentación —el
 * dato ya viene agregado del backend—, así que vive en el frontend.
 */

/** Rectángulo resultado, en las mismas unidades que el ancho/alto dados. */
export interface RectTreemap<T> {
  item: T;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Reparte `items` en `ancho × alto`. `valor` da la magnitud de cada item (los
 * de valor ≤ 0 se descartan). No exige orden, pero el resultado es más limpio
 * con los items de mayor a menor valor.
 */
export function squarify<T>(
  items: readonly T[],
  valor: (item: T) => number,
  ancho: number,
  alto: number
): RectTreemap<T>[] {
  const limpio = items.filter((it) => valor(it) > 0);
  const total = limpio.reduce((suma, it) => suma + valor(it), 0);
  if (limpio.length === 0 || total <= 0 || ancho <= 0 || alto <= 0) {
    return [];
  }

  // Áreas escaladas para que la suma ocupe exactamente el lienzo.
  const escala = (ancho * alto) / total;
  const areas = limpio.map((it) => valor(it) * escala);
  const out: RectTreemap<T>[] = [];

  // Peor relación de aspecto de una fila colocada a lo largo de `lado`.
  const peor = (fila: number[], lado: number): number => {
    const suma = fila.reduce((a, b) => a + b, 0);
    const max = Math.max(...fila);
    const min = Math.min(...fila);
    return Math.max((lado * lado * max) / (suma * suma), (suma * suma) / (lado * lado * min));
  };

  const colocar = (i0: number, x: number, y: number, w: number, h: number): void => {
    if (i0 >= areas.length) {
      return;
    }
    const lado = Math.min(w, h);
    const fila: number[] = [];
    const idx: number[] = [];
    let i = i0;
    while (i < areas.length) {
      // Añadimos a la fila mientras no empeore su relación de aspecto.
      if (fila.length > 0 && peor(fila.concat(areas[i]), lado) > peor(fila, lado)) {
        break;
      }
      fila.push(areas[i]);
      idx.push(i);
      i++;
    }
    const suma = fila.reduce((a, b) => a + b, 0);
    if (w >= h) {
      const stripW = suma / h;
      let yy = y;
      for (let k = 0; k < fila.length; k++) {
        const ch = (fila[k] / suma) * h;
        out.push({ item: limpio[idx[k]], x, y: yy, w: stripW, h: ch });
        yy += ch;
      }
      colocar(i, x + stripW, y, w - stripW, h);
    } else {
      const stripH = suma / w;
      let xx = x;
      for (let k = 0; k < fila.length; k++) {
        const cw = (fila[k] / suma) * w;
        out.push({ item: limpio[idx[k]], x: xx, y, w: cw, h: stripH });
        xx += cw;
      }
      colocar(i, x, y + stripH, w, h - stripH);
    }
  };

  colocar(0, 0, 0, ancho, alto);
  return out;
}

/**
 * Color de texto legible sobre un fondo hex (#rrggbb): tinta oscura sobre
 * piedras claras, clara sobre las oscuras. Umbral de luminancia perceptual.
 */
export function tintaSobre(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) {
    return '#f2f6fd';
  }
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 148 ? '#16110a' : '#f2f6fd';
}
