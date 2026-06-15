/**
 * Catálogo de máquinas de la nave de Pulycort / INDASEL.
 *
 * Dato de dominio (no de la simulación): la lista oficial de máquinas y su
 * papel en la cadena bloque → tabla → losa, tomada del documento de negocio
 * «08 Maquinas operaciones y produccion» (catálogo de 19 máquinas con su
 * código y unidad). La sala de máquinas pinta los 4 telares en vivo (lecturas
 * de `produccion_mapeada`) y el resto de la nave a partir de este catálogo,
 * marcando con honestidad qué fuente de datos tiene cada máquina.
 */

export type FaseProduccion = 'bloque' | 'tabla' | 'losa';

/**
 * Estado de INTEGRACIÓN de la máquina en Fabric (no su estado operativo):
 * - `en-vivo`: lecturas en tiempo real — los 4 telares (`produccion_mapeada`).
 * - `con-partes`: tiene partes reales propios pero todavía sin estado en vivo —
 *   los discos puente (`parte_discopuente_mapeada`).
 * - `sin-integrar`: aún sin ninguna fuente de datos conectada.
 */
export type IntegracionMaquina = 'en-vivo' | 'con-partes' | 'sin-integrar';

export interface MaquinaCatalogo {
  /** Código oficial del catálogo de negocio (doc 08). */
  codigo: number;
  nombre: string;
  /** Unidad de medida de la máquina. */
  unidad: 'm³' | 'm²';
  /** Etapa de la cadena de producción a la que pertenece. */
  fase: FaseProduccion;
  integracion: IntegracionMaquina;
  /** Id de telar en vivo; solo en los 4 telares internos. */
  telarId?: number;
  /** Ruta a sus partes, cuando los tiene (discos puente). */
  enlacePartes?: string;
  /** Papel de la máquina en la cadena, en una línea. */
  descripcion: string;
}

/** Título legible de cada fase de la cadena, en orden de proceso. */
export const FASES: Record<FaseProduccion, string> = {
  bloque: 'Bloque · refuerzo, hilo y aserrado',
  tabla: 'Tabla · corte, refuerzo y acabado',
  losa: 'Losa · corte y acabados'
};

/** Orden de las fases en la cadena de producción. */
export const ORDEN_FASE: readonly FaseProduccion[] = ['bloque', 'tabla', 'losa'];

/**
 * Las 19 máquinas del catálogo oficial, en el orden del documento de negocio.
 * El `codigo` casa una a una con el doc 08; los nombres se muestran en forma
 * legible conservando la marca de cada máquina.
 */
export const CATALOGO_MAQUINAS: readonly MaquinaCatalogo[] = [
  {
    codigo: 1,
    nombre: 'Reforzadora de bloques',
    unidad: 'm³',
    fase: 'bloque',
    integracion: 'sin-integrar',
    descripcion: 'Refuerzo de bloques con riesgo estructural antes de aserrar.'
  },
  {
    codigo: 2,
    nombre: 'Monohilo',
    unidad: 'm³',
    fase: 'bloque',
    integracion: 'sin-integrar',
    descripcion: 'Corte de hilo en bloques.'
  },
  {
    codigo: 3,
    nombre: 'Telar 1',
    unidad: 'm³',
    fase: 'bloque',
    integracion: 'en-vivo',
    telarId: 1,
    descripcion: 'Aserrado de bloques en tablas.'
  },
  {
    codigo: 4,
    nombre: 'Telar 2',
    unidad: 'm³',
    fase: 'bloque',
    integracion: 'en-vivo',
    telarId: 2,
    descripcion: 'Aserrado de bloques en tablas.'
  },
  {
    codigo: 5,
    nombre: 'Telar 3',
    unidad: 'm³',
    fase: 'bloque',
    integracion: 'en-vivo',
    telarId: 3,
    descripcion: 'Aserrado de bloques en tablas.'
  },
  {
    codigo: 6,
    nombre: 'Telar 4',
    unidad: 'm³',
    fase: 'bloque',
    integracion: 'en-vivo',
    telarId: 4,
    descripcion: 'Aserrado de bloques en tablas.'
  },
  {
    codigo: 7,
    nombre: 'Telar externo',
    unidad: 'm³',
    fase: 'bloque',
    integracion: 'sin-integrar',
    descripcion: 'Aserrado de bloques subcontratado fuera de la nave.'
  },
  {
    codigo: 8,
    nombre: 'Cortabloques',
    unidad: 'm²',
    fase: 'bloque',
    integracion: 'sin-integrar',
    descripcion: 'Corte de bloques inferiores o con microfisuras en bandas.'
  },
  {
    codigo: 9,
    nombre: 'Reforzadora 1',
    unidad: 'm²',
    fase: 'tabla',
    integracion: 'sin-integrar',
    descripcion: 'Filtrado, masillado y refuerzo (epoxi / poliéster) de tablas.'
  },
  {
    codigo: 10,
    nombre: 'Reforzadora 2 SEI',
    unidad: 'm²',
    fase: 'tabla',
    integracion: 'sin-integrar',
    descripcion: 'Filtrado y refuerzo (epoxi / poliéster) de tablas.'
  },
  {
    codigo: 11,
    nombre: 'Pulidora de tabla SIMEC',
    unidad: 'm²',
    fase: 'tabla',
    integracion: 'sin-integrar',
    descripcion: 'Acabados de tabla: pulido, apomazado, abujardado, arenado…'
  },
  {
    codigo: 12,
    nombre: 'Disco puente 1 Terzago',
    unidad: 'm²',
    fase: 'losa',
    integracion: 'con-partes',
    enlacePartes: '/partes/disco-puente',
    descripcion: 'Corte de tablas en losas (Terzago).'
  },
  {
    codigo: 13,
    nombre: 'Disco puente 2 Gómez',
    unidad: 'm²',
    fase: 'losa',
    integracion: 'con-partes',
    enlacePartes: '/partes/disco-puente',
    descripcion: 'Corte de tablas en losas (Gómez).'
  },
  {
    codigo: 14,
    nombre: 'Disco puente 3 Cáñigo',
    unidad: 'm²',
    fase: 'losa',
    integracion: 'con-partes',
    enlacePartes: '/partes/disco-puente',
    descripcion: 'Corte de tablas en losas (Cáñigo).'
  },
  {
    codigo: 15,
    nombre: 'Control numérico Donatoni',
    unidad: 'm²',
    fase: 'losa',
    integracion: 'sin-integrar',
    descripcion: 'Corte por control numérico (Donatoni).'
  },
  {
    codigo: 16,
    nombre: 'Pulidora de losa',
    unidad: 'm²',
    fase: 'losa',
    integracion: 'sin-integrar',
    descripcion: 'Acabados de losa: pulido, apomazado, envejecido, arenado…'
  },
  {
    codigo: 17,
    nombre: 'Biseladora',
    unidad: 'm²',
    fase: 'losa',
    integracion: 'sin-integrar',
    descripcion: 'Biselado y clasificación de losas.'
  },
  {
    codigo: 18,
    nombre: 'Recuperadora',
    unidad: 'm²',
    fase: 'losa',
    integracion: 'sin-integrar',
    descripcion: 'Recuperación de losas y reaprovechamiento del material de corte.'
  },
  {
    codigo: 19,
    nombre: 'Taller',
    unidad: 'm²',
    fase: 'losa',
    integracion: 'sin-integrar',
    descripcion: 'Trabajos especiales: cantos, aristas, taladros, cortes y embalaje.'
  }
];
