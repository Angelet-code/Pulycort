/**
 * Registro curado de problemas detectados en el sistema de producción:
 * máquinas, base de datos, cálculos y flujo de trabajo. Cada entrada
 * distingue el problema (hecho documentado con su evidencia), la solución
 * recomendada (propuesta) y de quién depende arreglarla.
 *
 * Se mantiene A MANO, junto con `00_gestion/TAREAS.md` y
 * `fabric/VERIFICACION.md`: al confirmar o corregir algo, actualizar las dos
 * fuentes. Última revisión: 2026-06-13 (incidente del backend en modo mock
 * bajo el switch Real).
 */

export type AreaSistema = 'maquinas' | 'datos' | 'calculos' | 'flujo';

export type EstadoProblema = 'pendiente' | 'mitigado' | 'corregido';

export interface ProblemaSistema {
  id: string;
  area: AreaSistema;
  problema: string;
  /** Hechos observados que lo demuestran (con números cuando los hay). */
  evidencia: string;
  solucion: string;
  dependeDe: string[];
  estado: EstadoProblema;
}

export const ETIQUETA_AREA: Record<AreaSistema, string> = {
  maquinas: 'Máquinas y sensores',
  datos: 'Base de datos e integración',
  calculos: 'Cálculos de Fabric',
  flujo: 'Flujo de producción'
};

export const ETIQUETA_ESTADO: Record<EstadoProblema, string> = {
  pendiente: 'Pendiente',
  mitigado: 'Mitigado en Fabric',
  corregido: 'Corregido'
};

export const PROBLEMAS_SISTEMA: ProblemaSistema[] = [
  // ── Máquinas y sensores ───────────────────────────────────────────────────
  {
    id: 'medidas-bloque-consola',
    area: 'maquinas',
    problema: 'Las medidas de bloque tecleadas en la consola no son fiables bloque a bloque',
    evidencia:
      'En 59 de 61 cortes de 30 días las medidas cambian a mitad de corte (cada bloque ' +
      'arranca heredando las del anterior); 8 juegos de medidas idénticos entre los ' +
      'telares 2 y 3 en fechas solapadas; bloques cuyo parte real es geométricamente ' +
      'imposible con las medidas declaradas (ej.: bloque 47080 declara 2,37 m³ con un ' +
      'parte de 42 tablas y 143,75 m²).',
    solucion:
      'Que el operario introduzca y confirme las medidas al colocar cada bloque y que el ' +
      'software las ligue al nº de bloque (no a la consola). Mientras tanto, Fabric marca ' +
      'con ⚠ los bloques incompatibles con su parte y calcula el rendimiento como ' +
      'agregado, que sí se compensa.',
    dependeDe: ['Producción', 'TotWare'],
    estado: 'mitigado'
  },
  {
    id: 'telar4-sin-codigo',
    area: 'maquinas',
    problema: 'El telar 4 no envía código de incidencia (emite siempre 0)',
    evidencia:
      'Todas sus filas históricas llegan con incidencia 0; marcha/paro se infiere por ' +
      'potencia (≥ 10 kW = marcha), que es una aproximación.',
    solucion: 'Revisar el PLC o el mapeador para que envíe el código real de incidencia.',
    dependeDe: ['TotWare'],
    estado: 'pendiente'
  },
  {
    id: 'telar4-sensores-congelados',
    area: 'maquinas',
    problema: 'El telar 4 emite sensores congelados',
    evidencia:
      'Altura fija por tramos (p. ej. 1668 mm clavada mientras corta) y a 0 al parar; ' +
      'consumo clavado en ~190 A aunque la potencia varíe.',
    solucion:
      'Revisar el sensor de altura (encoder) y la sonda de consumo, o el mapeador si el ' +
      'fallo es de integración. El validador de Fabric ya aparta esas lecturas.',
    dependeDe: ['Mantenimiento', 'TotWare'],
    estado: 'mitigado'
  },
  {
    id: 'codigos-incidencia-sin-tabla',
    area: 'maquinas',
    problema: 'Los códigos de incidencia 3, 4 y 5 no tienen significado documentado',
    evidencia:
      'Solo se han verificado por física de los datos el 1 (marcha) y el 2 (paro). Las ' +
      'lecturas con 3/4/5 van a cuarentena y no se sabe cuál es la rotura de fleje.',
    solucion: 'Pedir a TotWare la tabla oficial de códigos de incidencia.',
    dependeDe: ['TotWare'],
    estado: 'pendiente'
  },

  // ── Base de datos e integración ───────────────────────────────────────────
  {
    id: 'partes-fechas-corruptas',
    area: 'datos',
    problema: 'Partes de trabajo con fechas imposibles o ausentes',
    evidencia:
      'Fechas futuras por errata de año (hasta dic 2026) y 179 filas sin fecha declarada ' +
      'en parte_trabajo_mapeada.',
    solucion:
      'Validar la fecha en el terminal del operario al grabar el parte. Fabric ya usa la ' +
      'fecha de inserción cuando la declarada es futura.',
    dependeDe: ['TotWare'],
    estado: 'mitigado'
  },
  {
    id: 'partes-telar-corrupto',
    area: 'datos',
    problema: 'Partes con número de telar corrupto',
    evidencia:
      "Filas con números de bloque en la columna de telar ('45971', '46002'...) y 164 " +
      "filas con telar '0'. Esos partes no se pueden cruzar con ningún telar.",
    solucion: 'Validación de rango (1-4) en el origen al grabar el parte.',
    dependeDe: ['TotWare'],
    estado: 'pendiente'
  },
  {
    id: 'unidades-mezcladas',
    area: 'datos',
    problema: 'Unidades mezcladas en las medidas de tabla de los partes',
    evidencia:
      'Hay filas en metros (2,45) y filas en centímetros (290) en las mismas columnas ' +
      'largo/alto/grueso_tablas.',
    solucion:
      'Fijar una unidad única en el terminal de los operarios. Fabric normaliza por ' +
      'umbral (un largo > 10 solo puede ser cm), pero es un parche.',
    dependeDe: ['TotWare', 'Producción'],
    estado: 'mitigado'
  },
  {
    id: 'bloques-reutilizados',
    area: 'datos',
    problema: 'Los números de bloque se reutilizan con el tiempo',
    evidencia:
      'Mismo telar + nº de bloque con partes separados meses (ej.: bloque 46449 del ' +
      'telar 4 con partes en dic-2025 y may-2026). Sin acotar por fecha, el cruce sumaba ' +
      'm² de cortes antiguos (+306 m² en el total de 30 días).',
    solucion:
      'Usar un identificador único de bloque (id_bloque) en partes y lecturas. Fabric ya ' +
      'acota el cruce a la ventana temporal de cada corte.',
    dependeDe: ['TotWare', 'Odoo / INDASEL'],
    estado: 'mitigado'
  },
  {
    id: 'material-sospechoso',
    area: 'maquinas',
    problema: 'Los telares 1 y 2 no registran el material de cada bloque (sensor/consola)',
    evidencia:
      'Verificado en BD (2026-06-13): el telar 1 (25.375 lecturas) y el telar 2 (23.358) ' +
      'tienen UN SOLO material en todo su histórico, clavado en 114 (Pietra Grey); los ' +
      'telares 3 (20 materiales distintos) y 4 (12) sí lo varían correctamente. Que dos ' +
      'máquinas queden fijas en el mismo valor el 100% del tiempo apunta a un fallo de ' +
      'sensor/configuración de esos telares, no a un despiste puntual del operario.',
    solucion:
      'Confirmar con TotWare/producción si el origen es el sensor de los telares 1 y 2 o ' +
      'que el operario no lo introduce. Decisión (2026-06-13): el material del bloque se ' +
      'toma del parte de operario (parte_trabajo_mapeada, fiable por bloque y en el mismo ' +
      'código que el catálogo), no de la lectura del telar; cubre el 94-99% de los bloques ' +
      'de 1 y 2. Para un telar estancado sin parte, el material queda como no confirmado en ' +
      'vez de enseñar el 114 erróneo (no se usa la lectura como respaldo).',
    dependeDe: ['TotWare', 'Producción'],
    estado: 'mitigado'
  },
  {
    id: 'metros-cubicos-vacio',
    area: 'datos',
    problema: 'Los partes no traen ni m³ ni medidas de bloque',
    evidencia:
      'La columna metros_cubicos de parte_trabajo_mapeada llega siempre vacía y los ' +
      'partes de paquetes no rellenan largo/alto/grueso del bloque: no hay segunda ' +
      'fuente para contrastar el volumen (ni para calcular merma).',
    solucion: 'Rellenar esas columnas al grabar el parte, o exponer la tabla origen que las tenga.',
    dependeDe: ['TotWare'],
    estado: 'pendiente'
  },
  {
    id: 'backend-mock-sin-aviso',
    area: 'datos',
    problema: 'El backend podía servir datos de demostración bajo el modo Real sin avisar',
    evidencia:
      'Incidente 2026-06-13: el telar 1 salía "En marcha" con lecturas congeladas de ' +
      '12 h antes porque fabric-backend corría con DATABASE_PROVIDER=mock (npm run ' +
      'start:mock). El mock no era solo de telares: los 5 módulos servían demo, así que ' +
      'toda la pantalla eran datos falsos presentados como reales.',
    solucion:
      'Retirada completa de la demo del backend (borrados los 5 repos mock; barrera en ' +
      'PrismaService que falla si se pide DATABASE_PROVIDER=mock). La demo vive solo en ' +
      'el frontend (switch Demo). Como tripwire, el snapshot declara su fuente y la UI ' +
      'avisa con un banner si alguna vez recibiera mock en modo Real.',
    dependeDe: ['Fabric'],
    estado: 'corregido'
  },
  {
    id: 'codigos-operacion-sin-tabla',
    area: 'datos',
    problema: 'Los códigos de operación y acción de los partes no están documentados',
    evidencia:
      "De los datos solo se deduce que la operación '4' es hacer paquetes (la única con " +
      'tablas y m²). El resto (0-5, 10, 11) está sin mapear y los ciclos se infieren por ' +
      'cambio de nº de bloque.',
    solucion: 'Pedir a TotWare la tabla de códigos de operacion y accion.',
    dependeDe: ['TotWare'],
    estado: 'pendiente'
  },

  // ── Cálculos de Fabric ────────────────────────────────────────────────────
  {
    id: 'rendimiento-denominador',
    area: 'calculos',
    problema: 'El rendimiento m²/m³ se distorsionaba por el denominador',
    evidencia:
      'Con las medidas de consola tal cual, el ratio por bloque oscila entre 13,9 y ' +
      '122,9 m²/m³ (un día con un solo bloque mostró 60). El AGREGADO sí es fiable: a 30 ' +
      'días el m³ declarado coincide ±3% con el volumen implícito de los partes a paso ' +
      '~2,4 cm/tabla (las medidas llegan con un bloque de retraso y la suma se compensa).',
    solucion:
      'Calcular el ratio como agregado sobre bloques con parte real (sin estimaciones), ' +
      'decir de cuántos bloques sale, marcar con ⚠ los de medidas imposibles y mostrar ' +
      '"—" cuando la mayoría de la base es dudosa.',
    dependeDe: ['Fabric'],
    estado: 'corregido'
  },
  {
    id: 'cruce-sin-fecha',
    area: 'calculos',
    problema: 'El cruce lecturas-partes no acotaba por fecha',
    evidencia:
      'Se buscaba por telar + nº de bloque en todo el histórico: el bloque 46449 sumó un ' +
      'parte de diciembre de 2025 a un corte de mayo de 2026.',
    solucion: 'Acotar el cruce a la ventana del corte (desde 2 días antes hasta 15 después).',
    dependeDe: ['Fabric'],
    estado: 'corregido'
  },
  {
    id: 'kerf-asumido',
    area: 'calculos',
    problema: 'El espesor de tabla y el kerf de las estimaciones son supuestos',
    evidencia:
      'Se estima con 2 cm + 0,8 cm de kerf (sistema antiguo), pero el recorrido del ' +
      'bastidor dividido por las tablas reales sugiere un paso de ~2,4 cm (kerf ~0,4).',
    solucion:
      'Confirmar con producción el kerf real por telar/fleje y el espesor por pedido, y ' +
      'parametrizarlos. La UI ya etiqueta estos valores como estimación.',
    dependeDe: ['Producción'],
    estado: 'pendiente'
  },
  {
    id: 'lectura-futura-reciente',
    area: 'calculos',
    problema: 'Una lectura con fecha futura dejaba el estado del telar congelado',
    evidencia:
      'El umbral de "Sin señal" comparaba ahora − t ≤ 25 min, condición que una fecha ' +
      'FUTURA (reloj de consola corrupto en filas sin create_date) cumple durante horas. ' +
      'Hoy produccion_mapeada no tiene filas futuras, pero parte_trabajo_mapeada ya ha ' +
      'mostrado fechas de hasta dic 2026: el riesgo era real.',
    solucion:
      'Umbral en valor absoluto (|ahora − t| ≤ 25 min) con test de regresión en ' +
      'fabric-backend (prisma-fabric.repository.spec.ts).',
    dependeDe: ['Fabric'],
    estado: 'corregido'
  },
  {
    id: 'utilizacion-sin-denominador',
    area: 'calculos',
    problema: 'El KPI "Utilización hoy" no tiene denominador definido',
    evidencia:
      '¿24 h naturales o turnos planificados? Sin esa decisión de negocio el porcentaje ' +
      'no significa nada, así que se muestra "—" en modo real.',
    solucion: 'Definir el denominador con dirección y producción.',
    dependeDe: ['Dirección', 'Producción'],
    estado: 'pendiente'
  },

  // ── Flujo de producción ───────────────────────────────────────────────────
  {
    id: 'referencia-rendimiento',
    area: 'flujo',
    problema: 'La cifra de referencia del rendimiento no está validada',
    evidencia:
      'Los audios de la empresa citan 38-40 m²/m³ en telar; los partes reales dan ~43 ' +
      '(30 días). Puede ser mejora real (kerf menor), grosor distinto o un sesgo de datos.',
    solucion: 'Validar con producción la referencia correcta y a qué grosor de tabla aplica.',
    dependeDe: ['Producción'],
    estado: 'pendiente'
  },
  {
    id: 'catalogo-materiales',
    area: 'flujo',
    problema: 'El catálogo de materiales está incompleto',
    evidencia:
      'Resuelto 2026-06-13: la columna `material` de las tablas de máquina es el ' +
      '`product_template.id` de Odoo. Volcadas por consulta directa las 72 piedras del ' +
      'catálogo (id → nombre real → default_code 100-903), que incluyen los 23 códigos en ' +
      'uso real. El nombre ya no se inventa; un código nuevo se sigue mostrando como ' +
      '"Material {código}".',
    solucion: 'Catálogo volcado a core/materiales.ts. Pendiente solo revisarlo con INDASEL.',
    dependeDe: ['Odoo / INDASEL'],
    estado: 'mitigado'
  },
  {
    id: 'trazabilidad-incompleta',
    area: 'flujo',
    problema: 'La trazabilidad bloque → tablas → pedido está incompleta',
    evidencia:
      'bloque_maquinas resultó ser solo una tabla puente (id ↔ nº de bloque, sin PM ni ' +
      'nombre): faltan las tablas de Odoo que cuelgan de ella.',
    solucion:
      'Identificar la relación con los PM de "Dar entrada bloques" en Odoo para cerrar ' +
      'la cadena hasta el pedido.',
    dependeDe: ['Odoo / INDASEL', 'TotWare'],
    estado: 'pendiente'
  }
];
