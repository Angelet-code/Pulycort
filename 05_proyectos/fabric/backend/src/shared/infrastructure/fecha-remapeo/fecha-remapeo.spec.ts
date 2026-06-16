import { aplicarRemapeoFecha } from './fecha-remapeo';

/**
 * Fija la regla del remapeo de año: una lectura cuya `fecha_hora` va más de un
 * día por delante de su `create_date` (la inserción real) tiene el año mal y se
 * corrige restando 1 año. Lo demás se devuelve intacto. Casos tomados de los
 * datos reales (lote del 31-dic-2025 con jul–dic 2025 estampados como 2026).
 */
describe('aplicarRemapeoFecha', () => {
  it('corrige −1 año cuando fecha_hora va muy por delante de create_date (lote corrupto)', () => {
    const r = aplicarRemapeoFecha(
      new Date('2026-07-02T04:58:00Z'),
      new Date('2025-12-31T23:03:18Z'),
    );
    expect(r.remapeada).toBe(true);
    expect(r.fechaHora?.toISOString()).toBe('2025-07-02T04:58:00.000Z');
    expect(r.fechaHoraOriginal?.toISOString()).toBe('2026-07-02T04:58:00.000Z');
  });

  it('no toca una lectura normal (fecha_hora ~minutos antes de create_date)', () => {
    const fh = new Date('2026-06-15T09:43:00Z');
    const r = aplicarRemapeoFecha(fh, new Date('2026-06-15T09:47:56Z'));
    expect(r.remapeada).toBe(false);
    expect(r.fechaHora).toBe(fh);
  });

  it('tolera el desfase de reloj PLC↔Odoo dentro del margen de 1 día (no corrige)', () => {
    // Caso real de parte_trabajo: fecha_hora ~53 min por delante de create_date.
    const fh = new Date('2025-10-27T12:58:00Z');
    const r = aplicarRemapeoFecha(fh, new Date('2025-10-27T12:05:12Z'));
    expect(r.remapeada).toBe(false);
    expect(r.fechaHora).toBe(fh);
  });

  it('no es un offset fijo: el backfill de datos antiguos (fecha_hora anterior a create_date) no se toca', () => {
    const fh = new Date('2025-09-01T03:03:00Z');
    const r = aplicarRemapeoFecha(fh, new Date('2025-12-31T23:03:18Z'));
    expect(r.remapeada).toBe(false);
    expect(r.fechaHora).toBe(fh);
  });

  it('a prueba de futuro: una lectura real de 2026-07 con create_date también en 2026-07 no se remapea', () => {
    const fh = new Date('2026-07-15T10:00:00Z');
    const r = aplicarRemapeoFecha(fh, new Date('2026-07-15T10:03:00Z'));
    expect(r.remapeada).toBe(false);
    expect(r.fechaHora).toBe(fh);
  });

  it('devuelve la fecha intacta si falta fecha_hora o create_date', () => {
    expect(aplicarRemapeoFecha(null, new Date('2025-12-31T23:03:18Z')).remapeada).toBe(false);
    expect(aplicarRemapeoFecha(new Date('2026-07-02T04:58:00Z'), null).remapeada).toBe(false);
    expect(aplicarRemapeoFecha(null, null).fechaHora).toBeNull();
  });
});
