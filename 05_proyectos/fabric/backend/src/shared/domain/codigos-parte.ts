/**
 * Códigos de `operacion` y `accion` del parte de operario, con su etiqueta.
 *
 * DÓNDE VIVE EL MAPEO (para no volver a buscarlo): NO está en columnas de datos
 * —`operacion`/`accion` llegan como enteros— sino en las OPCIONES DE SELECTION
 * de Odoo. Son campos `selection` de los modelos `parte.trabajo.mapeada`
 * (campos `operacion` y `accion`) y `parte.discopuente.mapeada` (campo
 * `operacion`); las etiquetas están en la tabla `ir_model_fields_selection`
 * (columna `name`, jsonb traducido), enlazada por `field_id` a
 * `ir_model_fields`. Verificado read-only contra la BD real (2026-06-16).
 *
 * Consulta de referencia:
 *   SELECT f.model, f.name campo, s.value codigo, s.name etiqueta
 *   FROM ir_model_fields f JOIN ir_model_fields_selection s ON s.field_id=f.id
 *   WHERE f.model IN ('parte.trabajo.mapeada','parte.discopuente.mapeada')
 *     AND f.name IN ('operacion','accion');
 *
 * Reglas de lectura (confirmadas por Pulycort):
 *  - Telar: `operacion` 1-4 son las fases de trabajo; cuando `operacion`=0 el
 *    motivo de parada está en `accion` (5-11). (`operacion` 5/10/11 aparecen en
 *    crudo en unas pocas filas viejas pero NO están en el selection: anomalías.)
 *  - Disco puente: el evento va directo en `operacion` (18-23); 0 = corte normal.
 *  - "Fin de jornada" dura hasta que vuelva a haber actividad; el resto de
 *    eventos, 20 min (decisión de presentación, ver tarjeta de máquina).
 */

/**
 * Fases de trabajo del telar (`parte_trabajo_mapeada.operacion`). El valor es el
 * rótulo del badge (preferido por Pulycort); entre paréntesis, la etiqueta exacta
 * del selection de Odoo de la que sale.
 */
export const TELAR_OPERACION: Readonly<Record<number, string>> = {
  1: 'Colocando', // Odoo: "Colocación bloque"
  2: 'Aserrando', // Odoo: "Aserrado de bloque"
  3: 'Salida de Bloque', // Odoo: "Salida telar"
  4: 'Haciendo Paquetes', // Odoo: "Hacer paquetes"
};

/** Motivos de parada del telar (`parte_trabajo_mapeada.accion`, cuando op=0). */
export const TELAR_ACCION: Readonly<Record<number, string>> = {
  5: 'Cambio de sierras',
  6: 'Cambio de espesor',
  7: 'Rotura de material',
  8: 'Rotura de máquina',
  9: 'Mantenimiento',
  10: 'Otros',
  11: 'Fin de jornada',
};

/** Operación/evento del disco puente Gómez (`parte_discopuente_mapeada.operacion`). */
export const DISCO_PUENTE_OPERACION: Readonly<Record<number, string>> = {
  18: 'Mantenimiento máquina',
  19: 'Rotura de tablas',
  20: 'Accidente de trabajo',
  21: 'Cambio de disco',
  22: 'Otros',
  23: 'Fin de jornada',
};

/** Código que indica "fin de jornada": el badge dura hasta que vuelva actividad. */
export const ACCION_FIN_JORNADA = 11;
export const DISCO_OPERACION_FIN_JORNADA = 23;
