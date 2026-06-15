import {
  bloqueImposible,
  dimensionBloqueAMetros,
  volumenBloqueM3,
} from './medidas-bloque';

describe('medidas-bloque · normalización de unidades del inventario', () => {
  describe('dimensionBloqueAMetros', () => {
    it('deja intactas las cotas ya en metros (≤ 10)', () => {
      expect(dimensionBloqueAMetros(2.8)).toBe(2.8);
      expect(dimensionBloqueAMetros(1.5)).toBe(1.5);
      expect(dimensionBloqueAMetros(0.85)).toBe(0.85);
    });

    it('pasa a metros las cotas en cm (> 10)', () => {
      expect(dimensionBloqueAMetros(85)).toBeCloseTo(0.85, 6);
      expect(dimensionBloqueAMetros(285)).toBeCloseTo(2.85, 6);
    });
  });

  describe('volumenBloqueM3', () => {
    it('PM 47220: grueso en cm (85) → 2,17 m³, no 216,75', () => {
      expect(volumenBloqueM3(1.7, 1.5, 85)).toBeCloseTo(2.17, 2);
    });

    it('serie 464xx: las tres dimensiones en cm → m³ plausible', () => {
      // 285·160·180 cm = 2,85 × 1,6 × 1,8 m
      expect(volumenBloqueM3(285, 160, 180)).toBeCloseTo(8.21, 2);
    });

    it('bloque ya en metros: multiplicación directa', () => {
      expect(volumenBloqueM3(2.8, 1.6, 1.9)).toBeCloseTo(8.51, 2);
    });

    it('sin medida (alguna cota ≤ 0): 0 m³', () => {
      expect(volumenBloqueM3(0, 1.6, 1.9)).toBe(0);
      expect(volumenBloqueM3(2.8, 0, 1.9)).toBe(0);
    });
  });

  describe('bloqueImposible', () => {
    it('los casos cm/m reales NO son imposibles (se recuperan al normalizar)', () => {
      expect(bloqueImposible(1.7, 1.5, 85)).toBe(false);
      expect(bloqueImposible(285, 160, 180)).toBe(false);
    });

    it('un bloque sano en metros no es imposible', () => {
      expect(bloqueImposible(2.8, 1.6, 1.9)).toBe(false);
    });

    it('una cota en la zona ambigua (5–10, ni metros ni cm) es imposible', () => {
      // 7 no supera el umbral (>10) → no se normaliza, queda como 7 m: imposible.
      expect(bloqueImposible(7, 2, 2)).toBe(true);
    });

    it('un volumen absurdo tras normalizar es imposible', () => {
      // 4 × 4 × 2 = 32 m³ (cotas ≤ 5 pero volumen > 20).
      expect(bloqueImposible(4, 4, 2)).toBe(true);
    });

    it('sin medida no es "imposible" sino "ausente" → false', () => {
      expect(bloqueImposible(0, 0, 0)).toBe(false);
    });
  });
});
