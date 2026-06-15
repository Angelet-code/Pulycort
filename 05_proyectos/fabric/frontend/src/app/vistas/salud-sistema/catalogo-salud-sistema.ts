/**
 * Registro curado de problemas detectados en el sistema de producción:
 * máquinas, base de datos, cálculos y flujo de trabajo. Cada entrada
 * distingue el problema (hecho documentado con su evidencia), la solución
 * recomendada (propuesta) y de quién depende arreglarla.
 *
 * Se mantiene A MANO, junto con `00_gestion/TAREAS.md` y
 * `fabric/VERIFICACION.md`: al confirmar o corregir algo, actualizar las dos
 * fuentes. Última revisión: 2026-06-15 (auditoría de coherencia entre pestañas
 * 2026-06-14 e integración de reforzadora, disco puente e inventario real).
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
    problema: 'Las medidas de consola no son fiables lote a lote',
    evidencia:
      'En 59 de 61 cortes de 30 días las medidas cambian a mitad de corte (cada lote ' +
      'arranca heredando las del anterior); 8 juegos de medidas idénticos entre los ' +
      'telares 2 y 3 en fechas solapadas; lotes cuyo parte real es geométricamente ' +
      'imposible con las medidas declaradas (ej.: PM/lote 47080 declara 2,37 m³ con un ' +
      'parte de 42 tablas y 143,75 m²).',
    solucion:
      'Que el operario introduzca y confirme las medidas al colocar cada lote y que el ' +
      'software las ligue al PM/lote (`n_bloque`), no a la consola. Mientras tanto, Fabric marca ' +
      'con ⚠ los lotes incompatibles con su parte y calcula el rendimiento como ' +
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
  {
    id: 'maquinas-flujo-no-separadas',
    area: 'maquinas',
    problema: 'El dato no distingue las máquinas físicas que comparten un mismo flujo',
    evidencia:
      'Disco puente: la columna disco_puente_n solo trae 0/1, nunca 2 ni 3, así que los tres ' +
      'discopuentes (Terzago, Gómez, Cáñigo) y el Donatoni llegan como un único flujo. ' +
      'Reforzadora: n_reforzadora solo trae "1", así que no separa la REFORZADORA 1 de la ' +
      'REFORZADORA 2 SEI. No se puede atribuir un corte a una máquina concreta sin inventar.',
    solucion:
      'Pedir que el dato etiquete la máquina física por registro (un identificador de máquina ' +
      'en el parte), o confirmar que comparten un solo autómata/flujo. Mientras tanto Fabric las ' +
      'modela como un flujo único y las marca como integración "parcial" en /salud/cobertura, ' +
      'mostrando el volumen combinado sin atribuirlo.',
    dependeDe: ['TotWare', 'Odoo / INDASEL'],
    estado: 'mitigado'
  },

  // ── Base de datos e integración ───────────────────────────────────────────
  {
    id: 'partes-fechas-corruptas',
    area: 'datos',
    problema: 'Partes con fechas imposibles o ausentes (trabajo y disco puente)',
    evidencia:
      'Fechas futuras por errata de año (hasta dic 2026): 26 filas en parte_trabajo_mapeada ' +
      '(+179 sin fecha declarada) y 434 en parte_discopuente_mapeada. Cualquier "última ' +
      'actividad" u orden por fecha_hora sin sanear puede colar dic-2026 como lo más reciente.',
    solucion:
      'Validar la fecha en el terminal del operario al grabar el parte. Fabric marca esas ' +
      'filas como sospechosas sin ocultarlas y, en el cruce lecturas-partes, sustituye la ' +
      'fecha corrupta por la de inserción (create_date). Pendiente extender ese respaldo a ' +
      'toda ordenación por fecha_hora (auditoría 2026-06-14).',
    dependeDe: ['TotWare'],
    estado: 'mitigado'
  },
  {
    id: 'partes-telar-corrupto',
    area: 'datos',
    problema: 'Partes con número de telar corrupto',
    evidencia:
      "Filas con PM/lotes en la columna de telar ('45971', '46002'...) y 164 " +
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
    problema: 'Los PM/lotes se reutilizan con el tiempo',
    evidencia:
      'Mismo telar + PM/lote con partes separados meses (ej.: PM/lote 46449 del ' +
      'telar 4 con partes en dic-2025 y may-2026). Sin acotar por fecha, el cruce sumaba ' +
      'm² de cortes antiguos (+306 m² en el total de 30 días).',
    solucion:
      'Usar un identificador único de corte si la fuente lo confirma. Fabric ya ' +
      'acota el cruce a la ventana temporal de cada corte.',
    dependeDe: ['TotWare', 'Odoo / INDASEL'],
    estado: 'mitigado'
  },
  {
    id: 'material-sospechoso',
    area: 'maquinas',
    problema: 'Los telares 1 y 2 (y la reforzadora) no registran el material por lectura',
    evidencia:
      'Verificado en BD (2026-06-13): el telar 1 (25.375 lecturas) y el telar 2 (23.358) ' +
      'tienen UN SOLO material en todo su histórico, clavado en 114 (Pietra Grey); los ' +
      'telares 3 (20 materiales distintos) y 4 (12) sí lo varían correctamente. Que dos ' +
      'máquinas queden fijas en el mismo valor el 100% del tiempo apunta a un fallo de ' +
      'sensor/configuración de esos telares, no a un despiste puntual del operario. El ' +
      'mismo patrón aparece en la reforzadora (verificado 2026-06-14): su material está ' +
      'clavado al 94,7% en 71 (Marfil).',
    solucion:
      'Confirmar con TotWare/producción si el origen es el sensor de los telares 1 y 2 o ' +
      'que el operario no lo introduce. Decisión (2026-06-13): el material del PM/lote se ' +
      'toma del parte de operario (parte_trabajo_mapeada, fiable por lote y en el mismo ' +
      'código que el catálogo), no de la lectura del telar; cubre el 94-99% de los lotes ' +
      'de 1 y 2. Para un telar estancado sin parte, el material queda como no confirmado en ' +
      'vez de enseñar el 114 erróneo (no se usa la lectura como respaldo). En la reforzadora ' +
      'aún no se aplica esa corrección: /partes/reforzadora muestra el material en crudo, ' +
      'pendiente de cruzarlo por PM/lote igual que en los telares.',
    dependeDe: ['TotWare', 'Producción'],
    estado: 'mitigado'
  },
  {
    id: 'metros-cubicos-vacio',
    area: 'datos',
    problema: 'Los partes no traen ni m³ ni medidas de lote completas',
    evidencia:
      'La columna metros_cubicos de parte_trabajo_mapeada llega siempre vacía y los ' +
      'partes de paquetes no rellenan largo/alto/grueso del lote: no hay segunda ' +
      'fuente para contrastar el volumen (ni para calcular merma).',
    solucion: 'Rellenar esas columnas al grabar el parte, o exponer la tabla origen que las tenga.',
    dependeDe: ['TotWare'],
    estado: 'pendiente'
  },
  {
    id: 'inventario-m3-infradimensionado',
    area: 'datos',
    problema: 'En algunos lotes el m³ del inventario y los m² del parte son incompatibles',
    evidencia:
      'El m³ del lote sale de lot_block_creation por PM; en varios lotes no da para la piedra ' +
      'que salió en tabla (m² del parte × espesor): no caben tantos m² en ese volumen. ' +
      'PM/lote 47156 (telar 4, MARFIL): parte real de 69 tablas y 204,9 m² a 2 cm = 4,10 m³ ' +
      'de tabla, pero el inventario declara 1,86 m³ → rendimiento 110 m²/m³, imposible (a ' +
      '2 cm el máximo físico es 1/0,02 = 50). PM/lote 47177 igual: 2,77 m³ frente a 3,04 m³ ' +
      'de tabla a 5 cm → 21,95 m²/m³ (techo 20). NO está demostrado cuál de los dos miente: ' +
      '1,86 m³ por sí solo es un bloque pequeño plausible (cola baja, por debajo del p10 ' +
      '~2,12 m³ del inventario), así que tanto puede estar infradimensionada la medida del ' +
      'alta como ser los m² de otro corte cruzado al lote (o lote multibloque). Cada dimensión ' +
      'suelta del bloque es plausible, por eso el chequeo de "bloque imposible" no lo detecta: ' +
      'solo el cruce con el parte lo delata.',
    solucion:
      'Verificar contra Odoo cuál de los dos falla: las tres dimensiones del alta de 47156 ' +
      '(¿bloque pequeño real o medida truncada?), si el parte agrega varios cortes y si el PM ' +
      'es multibloque; corregir la fuente que toque (medida en lot_block_creation o atribución ' +
      'del parte). Fabric ya marca con ⚠ el lote y NO calcula su rendimiento mientras m³ y ' +
      'parte sean incompatibles, para no pintar un m²/m³ por encima del techo físico.',
    dependeDe: ['Odoo / INDASEL'],
    estado: 'mitigado'
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
    problema: 'Faltan las tablas de códigos de las máquinas (operación, acción, acabado y eventos)',
    evidencia:
      'Operación 0-4 confirmada por producción (0 parada, 1 colocación, 2 aserrado, 3 salida, ' +
      '4 paquetes); pendientes operación 5/10/11 y toda la columna acción (0, 5-11). En las ' +
      'máquinas de tablas falta la tabla de acabado: es un entero pequeño (reforzadora 1-4, ' +
      'disco puente y pulidora 0-13) que no casa con ningún id del maestro de acabados de Odoo ' +
      '(product_attribute_value), y eventos de la reforzadora llega "99" en el 96,7% de las ' +
      'filas (centinela "sin evento"), con los reales 0-5 muy raros.',
    solucion:
      'Pedir a TotWare/INDASEL las tablas de códigos por máquina (acción, acabado y eventos). ' +
      'Mientras tanto las vistas muestran "Acabado {n}" / el evento en crudo, sin inventar el nombre.',
    dependeDe: ['TotWare', 'Odoo / INDASEL'],
    estado: 'pendiente'
  },
  {
    id: 'inventario-snapshot-congelado',
    area: 'datos',
    problema: 'El stock de bloques de Odoo es un snapshot congelado: el inventario infracontaba',
    evidencia:
      'Verificado en BD (2026-06-14): el stock on-hand (stock_quant) es una carga única del ' +
      '29-ago-2025 (134 bloques) y desde entonces no recibe altas. Los ~151 bloques recibidos ' +
      'después viven solo en lot_block_creation y nunca entran al stock de Odoo, así que ' +
      '/inventario mostraba 134 cuando en fábrica hay ≈285 bloques (~1.313 m³), faltando sobre ' +
      'todo Marfil (síntoma: no salía ningún Negro Marquina ni los bloques sin cortar del patio).',
    solucion:
      'Fabric une las dos eras: stock on-hand de stock_lot/stock_quant ∪ altas de ' +
      'lot_block_creation no consumidas (sin aserrado/salida en partes, ni producción, ni disco ' +
      'puente, ni entrega). Son disjuntas por nº de bloque, no se duplican. Pendiente confirmar ' +
      'por qué las recepciones recientes no entran a stock_quant (recepción no validada en Odoo ' +
      'desde ~ago-2025); el snapshot lleva ~9,5 meses congelado.',
    dependeDe: ['Odoo / INDASEL'],
    estado: 'mitigado'
  },
  {
    id: 'consumo-unidad-por-maquina',
    area: 'datos',
    problema: 'La columna consumo no significa lo mismo en todas las máquinas',
    evidencia:
      'En los telares está verificado como amperios (≈ 2 × potencia, fila a fila). En la ' +
      'reforzadora va de 0 a 15.501 sin correlación con el nº de tablas: ahí NO son amperios. ' +
      'El disco puente tampoco expone un consumo interpretable.',
    solucion:
      'Confirmar con TotWare/INDASEL la unidad y el significado por máquina. Mientras tanto se ' +
      'muestra como amperios solo en los telares (donde está verificado) y se retira la columna ' +
      'donde no se entiende (reforzadora), sin inventar la unidad.',
    dependeDe: ['TotWare', 'Odoo / INDASEL'],
    estado: 'mitigado'
  },
  {
    id: 'disco-eficiencia-no-fiable',
    area: 'datos',
    problema: 'La eficiencia del disco puente no es un KPI fiable con los datos actuales',
    evidencia:
      'En parte_discopuente_mapeada (12.855 filas) la columna eficiencia_m2 vale 0 en todas ' +
      '(mín = máx = 0) y 8.379 filas tienen metro2_salida > metro2_entrada × 1,05. Pintarla como ' +
      'porcentaje induce a una conclusión falsa.',
    solucion:
      'Confirmar con TotWare la semántica de metro2_entrada/salida y eficiencia_m2. Hasta ' +
      'entonces, ocultar/desactivar la columna o mostrarla como "pendiente de validar" en vez ' +
      'de como indicador.',
    dependeDe: ['TotWare', 'Fabric'],
    estado: 'pendiente'
  },

  // ── Cálculos de Fabric ────────────────────────────────────────────────────
  {
    id: 'rendimiento-denominador',
    area: 'calculos',
    problema: 'El rendimiento m²/m³ se distorsionaba por el denominador',
    evidencia:
      'Con las medidas de consola tal cual, el ratio por lote oscila entre 13,9 y ' +
      '122,9 m²/m³ (un día con un solo lote mostró 60). El AGREGADO sí es fiable: a 30 ' +
      'días el m³ declarado coincide ±3% con el volumen implícito de los partes a paso ' +
      '~2,4 cm/tabla (las medidas llegan con un lote de retraso y la suma se compensa).',
    solucion:
      'Calcular el ratio como agregado sobre PM/lotes con parte real (sin estimaciones), ' +
      'decir de cuántos lotes sale, marcar con ⚠ los de medidas imposibles y mostrar ' +
      '"—" cuando la mayoría de la base es dudosa.',
    dependeDe: ['Fabric'],
    estado: 'corregido'
  },
  {
    id: 'cruce-sin-fecha',
    area: 'calculos',
    problema: 'El cruce lecturas-partes no acotaba por fecha',
    evidencia:
      'Se buscaba por telar + PM/lote en todo el histórico: el PM/lote 46449 sumó un ' +
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
  {
    id: 'material-incoherente-entre-vistas',
    area: 'calculos',
    problema: 'El mismo PM/lote puede enseñar un material distinto según la pestaña',
    evidencia:
      'Auditoría de coherencia (2026-06-14): en 438 de 588 grupos PM+telar comparables el ' +
      'material de la lectura (produccion_mapeada) no coincide con el del parte de operario ' +
      '(ej.: telar 1, PM 47177, lectura 114 vs parte 99). /partes pinta el material crudo de la ' +
      'lectura, mientras sala, detalle y producción ya lo corrigen con el parte.',
    solucion:
      'En /partes exponer "material lectura" y, al lado, "material PM/parte" con aviso cuando ' +
      'discrepen, y usar el corregido para los filtros de negocio. No usar el material crudo de ' +
      'la lectura como fuente de negocio sin avisar.',
    dependeDe: ['Fabric'],
    estado: 'pendiente'
  },
  {
    id: 'produccion-doble-base-m3',
    area: 'calculos',
    problema: 'En /producción el ciclo por lote y el KPI agregado no usan el mismo m³',
    evidencia:
      'Auditoría de coherencia (2026-06-14): el m³/rendimiento de cada ciclo sale de la medida ' +
      'del bloque por PM en lot_block_creation (inventarioPorPm), pero el KPI agregado (total ' +
      'm³ aserrados, rendimiento global) sigue sumando volumen de las medidas de consola de ' +
      'produccion_mapeada. El lector espera una sola definición en el mismo panel.',
    solucion:
      'Alinear el agregado con el m³ por PM, o etiquetarlo explícitamente como "m³ consola" ' +
      '(se compensa en agregado pero no es la suma de los m³ por lote visibles). Tests con ' +
      'PM reales (47187, 47220, 47177, 45953).',
    dependeDe: ['Fabric'],
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
    problema: 'La trazabilidad PM/lote → tablas → pedido está incompleta',
    evidencia:
      'bloque_maquinas resultó ser solo una tabla puente (id ↔ nº de bloque (n_bloque, ' +
      'el PM/lote), sin PM ni ' +
      'nombre): faltan las tablas de Odoo que cuelgan de ella.',
    solucion:
      'Identificar la relación con los PM de "Dar entrada bloques" en Odoo para cerrar ' +
      'la cadena hasta el pedido.',
    dependeDe: ['Odoo / INDASEL', 'TotWare'],
    estado: 'pendiente'
  },
  {
    id: 'pm-en-varias-realidades',
    area: 'flujo',
    problema: 'Hay PM/lote que aparecen a la vez como stock, lote producido y pieza procesada',
    evidencia:
      'Auditoría de coherencia (2026-06-14): 1.423 PM aparecen en más de una fuente, 57 en más ' +
      'de un telar, 55 con solape temporal entre telares y 5 con vida en producción > 60 días. ' +
      'Casos en stock con actividad de máquina: 45953A/B (on-hand + producción telares 3/4 + ' +
      'partes + disco), 45493A y 45971 (este con n_telar=45971, columna contaminada).',
    solucion:
      'Revisar manualmente esos PM y decidir si son stock no descargado, duplicidad A/B, ' +
      'reproceso o semántica correcta. Confirmar si los sufijos A/B son bloques físicos dentro ' +
      'de una PM. Tratar el PM 0 como "sin PM/lote", no como un PM real.',
    dependeDe: ['Odoo / INDASEL', 'TotWare'],
    estado: 'pendiente'
  }
];
