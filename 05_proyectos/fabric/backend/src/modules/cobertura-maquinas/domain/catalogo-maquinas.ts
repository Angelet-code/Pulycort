import {
  EstadoIntegracion,
  FamiliaMaquina,
  SeccionPlanta,
} from './cobertura-maquinas.entity';

/**
 * Descriptor estático de una máquina del catálogo de planta. Es dato CURADO
 * (fuente: `02_conocimiento/obsidian/08 Maquinas operaciones y produccion.md`),
 * no se calcula. El repositorio enriquece cada uno con el volumen real de su
 * fuente cuando existe.
 */
export type DescriptorMaquina = {
  codigo: number;
  nombre: string;
  seccion: SeccionPlanta;
  familia: FamiliaMaquina;
  /** Tabla mapeada que alimenta esta máquina; null si aún no hay fuente. */
  fuenteDatos: string | null;
  estado: EstadoIntegracion;
  /** Valor de `telar_n` en `produccion_mapeada` cuando la máquina es un telar. */
  telarN?: string;
  /**
   * true SOLO para el disco puente Gómez: es el único con PLC, así que todo
   * `parte_discopuente_mapeada` es suyo y su volumen se le atribuye directamente.
   * Terzago y Cáñigo aún no están integrados (sin fuente).
   */
  esDiscoPuente?: boolean;
  /** true si la máquina vuelca al flujo compartido `reforzadora_mapeada`. */
  esReforzadora?: boolean;
  /** Nota fija de integración; disco puente/reforzadora la sustituyen por la del flujo real. */
  notaBase?: string;
};

const SIN_FUENTE = 'Sin fuente de datos conectada.';
const DATO_SIN_INTEGRAR =
  'Existe tabla de datos del sistema antiguo; pendiente de confirmar columnas con TotWare e integrar.';
const SIN_PLC =
  'Sin PLC ni integración todavía; no envía datos. De los tres discos puente solo Gómez está conectado.';

/**
 * Catálogo de planta: 19 máquinas en dos secciones — M3 (aserrado de bloque a
 * tabla) y M2 (sala de máquinas: tabla a losa, acabados y taller). El orden y
 * los nombres son los del catálogo curado. Solo telares y disco puente tienen
 * hoy fuente conectada; el resto queda `pendiente` (sin inventar cobertura).
 */
export const CATALOGO_MAQUINAS: readonly DescriptorMaquina[] = [
  // — Sección M3: aserrado de bloque —
  {
    codigo: 1,
    nombre: 'REFORZADORA BLOQUES',
    seccion: 'M3',
    familia: 'reforzadora',
    fuenteDatos: null,
    estado: 'pendiente',
    notaBase: SIN_FUENTE,
  },
  {
    codigo: 2,
    nombre: 'MONOHILO',
    seccion: 'M3',
    familia: 'corte',
    fuenteDatos: null,
    estado: 'pendiente',
    notaBase: SIN_FUENTE,
  },
  {
    codigo: 3,
    nombre: 'TELAR 1',
    seccion: 'M3',
    familia: 'telar',
    fuenteDatos: 'produccion_mapeada',
    estado: 'integrada',
    telarN: '1',
  },
  {
    codigo: 4,
    nombre: 'TELAR 2',
    seccion: 'M3',
    familia: 'telar',
    fuenteDatos: 'produccion_mapeada',
    estado: 'integrada',
    telarN: '2',
  },
  {
    codigo: 5,
    nombre: 'TELAR 3',
    seccion: 'M3',
    familia: 'telar',
    fuenteDatos: 'produccion_mapeada',
    estado: 'integrada',
    telarN: '3',
  },
  {
    codigo: 6,
    nombre: 'TELAR 4',
    seccion: 'M3',
    familia: 'telar',
    fuenteDatos: 'produccion_mapeada',
    estado: 'integrada',
    telarN: '4',
  },
  {
    codigo: 7,
    nombre: 'TELAR EXTERNO',
    seccion: 'M3',
    familia: 'telar',
    fuenteDatos: null,
    estado: 'pendiente',
    notaBase: 'Aserrado subcontratado; sin telemetría propia en la BD.',
  },

  // — Sección M2: sala de máquinas —
  {
    codigo: 8,
    nombre: 'CORTABLOQUES',
    seccion: 'M2',
    familia: 'corte',
    fuenteDatos: null,
    estado: 'pendiente',
    notaBase: SIN_FUENTE,
  },
  {
    codigo: 9,
    nombre: 'REFORZADORA 1',
    seccion: 'M2',
    familia: 'reforzadora',
    fuenteDatos: 'reforzadora_mapeada',
    estado: 'parcial',
    esReforzadora: true,
  },
  {
    codigo: 10,
    nombre: 'REFORZADORA 2 SEI',
    seccion: 'M2',
    familia: 'reforzadora',
    fuenteDatos: 'reforzadora_mapeada',
    estado: 'parcial',
    esReforzadora: true,
  },
  {
    codigo: 11,
    nombre: 'PULIDORA TABLA SIMEC',
    seccion: 'M2',
    familia: 'pulidora',
    fuenteDatos: null,
    estado: 'pendiente',
    notaBase: DATO_SIN_INTEGRAR,
  },
  {
    codigo: 12,
    nombre: 'DISCOPUENTE 1 TERZAGO',
    seccion: 'M2',
    familia: 'disco_puente',
    fuenteDatos: null,
    estado: 'pendiente',
    notaBase: SIN_PLC,
  },
  {
    // Único disco puente con PLC: todo `parte_discopuente_mapeada` es suyo.
    codigo: 13,
    nombre: 'DISCOPUENTE 2 GOMEZ',
    seccion: 'M2',
    familia: 'disco_puente',
    fuenteDatos: 'parte_discopuente_mapeada',
    estado: 'integrada',
    esDiscoPuente: true,
  },
  {
    codigo: 14,
    nombre: 'DISCOPUENTE 3 CANIGO',
    seccion: 'M2',
    familia: 'disco_puente',
    fuenteDatos: null,
    estado: 'pendiente',
    notaBase: SIN_PLC,
  },
  {
    codigo: 15,
    nombre: 'CONTROL NUMERICO DONATONI',
    seccion: 'M2',
    familia: 'cnc',
    fuenteDatos: null,
    estado: 'pendiente',
    notaBase:
      'También realiza corte de disco puente (catálogo). Sin fuente de datos conectada.',
  },
  {
    codigo: 16,
    nombre: 'PULIDORA LOSA',
    seccion: 'M2',
    familia: 'pulidora',
    fuenteDatos: null,
    estado: 'pendiente',
    notaBase: DATO_SIN_INTEGRAR,
  },
  {
    codigo: 17,
    nombre: 'BISELADORA',
    seccion: 'M2',
    familia: 'acabado',
    fuenteDatos: null,
    estado: 'pendiente',
    notaBase: SIN_FUENTE,
  },
  {
    codigo: 18,
    nombre: 'RECUPERADORA',
    seccion: 'M2',
    familia: 'corte',
    fuenteDatos: null,
    estado: 'pendiente',
    notaBase: SIN_FUENTE,
  },
  {
    codigo: 19,
    nombre: 'TALLER',
    seccion: 'M2',
    familia: 'taller',
    fuenteDatos: null,
    estado: 'pendiente',
    notaBase: SIN_FUENTE,
  },
];
