# Fabric — verificación de datos antes de la entrega

> **Principio de entrega (no negociable).** Cuando Fabric se conecte al servidor real
> y se entregue a la empresa, **ningún valor en pantalla puede ser estimado, supuesto o
> inventado**. Cada cifra debe salir de un dato real de la máquina/parte o de un cálculo
> trazable sobre esos datos. Lo que no se pueda calcular ni obtener, **se quita**.
>
> La app tiene un switch **Demo | Real**. El modo **Demo** (simulación en memoria del
> frontend) es un **sustituto temporal**: reproduce forma y rangos del sistema antiguo para
> enseñar cómo se verá la app cuando lleguen los datos reales. El modo **Real**
> (fabric-backend sobre `produccion_mapeada`) ya sirve datos de la BD de producción, pero
> pinta **"—" en todo lo que la fuente real aún no expone** (m²/tablas/merma/roturas, códigos
> de incidencia/operación sin tabla, denominador de utilización…). El objetivo es que **esos
> datos reales lleguen y reemplacen** tanto el modo Demo como cada "—": la demo no debe
> volverse permanente. El backend ya no tiene modo mock (retirado 2026-06-13). Este documento
> es la lista de control para pasar de "maqueta creíble" a "app fiable".

> **Regla PM/lote (2026-06-14).** PM / lote es la matrícula operativa; bloque físico solo
> cuando la fuente lo identifica como tal. Fabric sigue leyendo la columna fuente
> `n_bloque`, pero la expone como `pmLote` y la UI la presenta como PM/lote en telares,
> partes y producción. No se crean sub-bloques ni se usan las medidas como identificador.

Leyenda de estado:

- ✅ **Real** — se muestra o calcula directamente con columnas que ya existen en los datos. Solo falta confirmar unidad/semántica.
- ⚠️ **Depende de supuesto** — se puede calcular, pero el resultado depende de una decisión o cadencia que hay que confirmar antes de fiarse.
- ⛔ **Inventado** — hoy no tiene base en los datos. No se entrega sin una fuente real, o se elimina.

---

## 0. Lo que ya está cruzado contra tus capturas (confirmado por los datos)

Esto no hace falta verificarlo de nuevo, lo medí directamente en las capturas del Telar 2 (el limpio):

- **amperios ≈ 2 × potencia** — visto en Telar 1: 46→93, 44→88, 45→90, 50→101, 51→102.
- **velocidad de descenso está en mm/h** — del 12:37 (altura 1.644) al 16:14 (altura 1.110) del Telar 2: bajó 534 mm en ~3,6 h ≈ **148 mm/h**, y la columna "Velocidad" de esas filas marca **150**. Cuadra. La velocidad real de la máquina es fiable.
- **altura actual desciende con el corte** — en el Telar 2 la altura baja de forma sostenida a lo largo del día.
- **rangos**: golpes/min 810–950 · velocidad en valores discretos 0/110/130/150/170/300 · potencia hasta ~76 kW.
- **catálogo de operarios, incidencias y operaciones** — son los textos reales del sistema.

---

## 1. Auditoría por valor mostrado

### Cadencia de lectura — el supuesto que afecta a CASI TODO ⚠️ (crítico)

Toda métrica de **tiempo** (utilización, minutos de paro, horas de marcha, MTBF, disponibilidad de turno) se calcula hoy como **nº de lecturas × 10 min**, asumiendo que la máquina emite una lectura cada 10 minutos exactos.

- En las capturas la cadencia **no es regular**: hay lecturas a :19, :10, :00, :50, :39, :28… y a veces dos en el mismo minuto.
- **Riesgo**: si la cadencia varía, contar "lecturas × 10 min" da minutos falsos.
- **Acción correcta**: calcular las duraciones por **diferencia entre marcas de tiempo consecutivas**, no por conteo. Eso solo es posible con una marca de tiempo fiable (ver §2).
- **Hasta confirmarlo, ninguna métrica de minutos/horas es entregable.**

### Vista `/telares` — Sala

| Valor | Cómo se obtiene | Estado | Qué falta |
|---|---|---|---|
| Estado del telar (marcha/paro/rotura) | mapeo de la columna `Incidencia` de la última lectura | ✅ | Confirmar lista cerrada de incidencias reales y su mapeo |
| Estado **"Cambio de lote"** | lecturas sin PM/lote (`n_bloque`) | ⛔ | El sistema real no tiene esta incidencia; me la inventé para los huecos entre lotes. Hay que confirmar **cómo representa el sistema real un telar sin lote en corte** (¿incidencia concreta? ¿`n_bloque` vacío?) o quitar el estado |
| Estado **"Sin señal"** | sin lectura válida en 25 min | ⚠️ | El umbral de 25 min es inventado; depende de la cadencia real |
| Círculo de color del material | nombre real, **color asignado por mí** | ⚠️ | El color es diseño (aceptable), pero hay que fijar el **catálogo real de materiales y sus códigos** que usan los telares (ver §2) |
| Medidas del lote (fuente) | columnas largo/alto/grueso | ⚠️ | Son atributos/verificación del PM/lote, no identificador físico. Confirmar unidad (se asume cm) y semántica |
| **Avance del corte (%)** | (altura_inicial − altura_actual) / altura_inicial | ⚠️ | Depende de que "altura actual" llegue a ~0 al terminar y de cuál es la altura inicial (1ª lectura del lote). Verificar el ciclo completo de un PM/lote |
| **ETA "Termina ~…"** | ahora + altura_actual / velocidad | ✅ | Cálculo trazable con columnas reales (altura mm ÷ velocidad mm/h). Solo confirmar unidades |
| Golpes / Potencia / Descenso | columnas directas | ✅ | Solo display |
| Desvío de ritmo (real vs consigna) | Δaltura / Δt frente a velocidad | ✅ | Cálculo trazable |
| Utilización hoy (%) | Σ min marcha / (telares × min desde 00:00) | ⛔/⚠️ | Doble problema: cadencia (§cadencia) **y** el denominador. ¿"Disponible" = 24 h naturales, horas de turno, u horas planificadas de corte? Sin definirlo, el % no significa nada. **Decisión de negocio pendiente** |
| Producción hoy (m²) | Σ "Metros cuadrados tablas" de partes "Hacer paquetes" de hoy | ✅ | Confirmar que el m² del parte es fiable y si es por paquete o acumulado |
| Tablas hoy | Σ "Nº de Tablas" | ✅ | Igual |
| Paros hoy (nº y minutos) | tramos consecutivos de incidencia paro | ⚠️ | Minutos dependen de cadencia; "qué cuenta como un paro" hay que definirlo |
| Operarios / turno | campos operario reales + etiqueta de turno | ⚠️ | Los operarios son reales; los **horarios de turno (06-14/14-22) y el turno de noche** los inferí — confirmar el calendario real |

### Vista `/telares/:id` — Detalle

| Valor | Cómo se obtiene | Estado | Qué falta |
|---|---|---|---|
| Doble medida proveedor / fábrica | dos juegos de columnas | ⚠️ | Mapear qué columna es cada una |
| **Δ volumen (merma de compra) %** | (m³prov − m³fab) / m³prov | ✅ | Trazable si tenemos las dos medidas; confirmar si usamos la columna "Metros cúbicos" real o la calculamos |
| Corte en curso (sección SVG) | dibuja la altura real | ✅* | El descenso es real; el dibujo de "tablas con kerf" es decorativo (espesor/kerf inventados, ver abajo) |
| Gráficos altura / potencia / golpes | series de columnas reales | ✅ | Solo display |
| Proyección del ETA (línea discontinua) | altura / velocidad | ✅ | Trazable |
| **Tablas previstas** | ⌊grueso / (2 cm + 0,8 cm)⌋ | ⛔ | Espesor de tabla (2 cm) y kerf del fleje (8 mm) **inventados**. Además el "Nº de Tablas" real ya viene en el parte. Confirmar espesor/kerf estándar **o eliminar la previsión** y mostrar solo tablas reales |
| **m² previstos** | tablas previstas × largo × alto | ⛔ | Hereda lo anterior |
| Disponibilidad de turno (%) | min marcha / min de turno | ⚠️ | Cadencia + horario de turno |
| **Vigía del fleje** (fatiga) | ratio amperios/velocidad, aviso si +15% sobre la mediana | ✅ (retirado de Real) | **Concepto, ratio y umbral inventados por completo.** **Retirado del modo Real el 2026-06-13** (`vigiaFleje: null` → el tile no se pinta); sobrevive solo en Demo como heurística temporal. **Retirada temporal: reintroducir en Real en cuanto se pueda**, validándolo con el histórico real de roturas (§2.10) |
| Latencia de datos (min) | ahora − última lectura | ✅ | Trazable; el umbral de aviso (12 min) depende de la cadencia real |
| **MTBF del fleje (7 d)** | horas marcha / nº roturas | ⚠️ | Las roturas SÍ se identifican ("Paro telar por rotura…"); las horas de marcha dependen de la cadencia |
| Gantt de jornada | tramos por incidencia | ✅ | Real |
| Tabla de últimas lecturas | columnas directas | ✅ | Real |
| Ciclo del lote (partes) | eventos reales agrupados por `n_bloque` | ✅ | Real a nivel PM/lote |
| Últimos lotes aserrados: corte (h), paros | duraciones | ⚠️ | Cadencia |
| Últimos lotes aserrados: tablas prev→real, m², merma | mezcla | ⚠️/⛔ | "prev" hereda el problema de tablas previstas |

### Vista `/produccion`

| Valor | Estado | Qué falta |
|---|---|---|
| m² de tablas, tablas, paquetes, m³ aserrados | ✅ | Sumas de columnas reales de partes |
| **Rendimiento m²/m³** | ✅ | m² / m³ a nivel PM/lote cuando la agrupación viene de `n_bloque`. No promete rendimiento por bloque físico si no hay identificador físico separado |
| **m³ y Rendimiento POR LOTE** (tabla "Últimos lotes aserrados") | ✅/⚠️ | [IMPLEMENTADO 2026-06-14] El m³ sale de la medida REAL del bloque en `lot_block_creation` por PM (no de la consola): 1 bloque → **exacto**; multibloque (PM repetido, 1:N confirmado por Ángel) → suma marcada **≈ "estimación"**; respaldo a medida de proveedor → ≈; PM sin alta en inventario → **"—" con ⚠**. La consola queda como **punto de control** (`medidasIncoherentes`). PENDIENTE de verificar contra datos reales (no bloquea entrega): cobertura PM telar↔inventario y calidad de medidas (0×0×0 se muestra tal cual, decisión de negocio) |
| Merma media % | ✅ | Si tenemos las dos medidas |
| m²/día por telar | ✅ | Real |
| Producción por material | ✅ | Real |
| % tiempo en marcha global | ⛔/⚠️ | Cadencia + definición del denominador |
| Minutos de paro por telar | ⚠️ | Cadencia |
| Golpes/velocidad/amperios medios | ✅ | Medias de columnas reales |
| Roturas de fleje (listado) | ✅ | Identificables por incidencia |
| Jornada Gantt | ✅ | Real |

### Vista `/partes-trabajo` — Partes de trabajo

Es el registro "en crudo" de los partes de operario, con las mismas columnas del sistema
antiguo. No introduce cálculos nuevos: muestra los campos de cada evento. Por tanto hereda las
verificaciones de medidas de lote, m³ y datos de paquetes ya listadas arriba. Específico de
esta vista:

| Elemento | Estado | Qué falta |
|---|---|---|
| Operación (colocación/aserrado/salida/paquetes) | ✅ | Mapeo de las operaciones reales del parte |
| **"Fin de jornada"** | ⛔ | Hoy el mock **sintetiza** un fin de jornada por telar a las 14:00 y 22:00. En el sistema real es un registro que mete el operario. Confirmar que ese evento existe en los partes reales y cuándo/quién lo genera |
| Operario en partes de noche | ⚠️ | Cuando no hay turno (noche, marcha automática) el mock rellena con el equipo de mañana. Confirmar qué operario figura realmente en un parte nocturno |
| Medidas de lote / m³ / datos de tabla por fila | ⚠️/✅ | Mismas verificaciones que en las otras vistas (mapeo de columnas, unidades). Medidas = atributo, no identificador |

### Vista `/partes/bloques` (lista) y `/inventario` (treemap) — Inventario de bloques

Los bloques que **realmente hay ahora** en el almacén. El inventario UNE **dos eras de datos
disjuntas** (verificado contra BD el 2026-06-14; ninguna sola es completa):

- **Era `stock`** — lote `stock_lot` on-hand (`stock_quant.quantity > 0` en ubicación interna,
  `stock_location.usage = 'internal'`). Es un **snapshot histórico** de Odoo (nº de bloque ≤ 45999,
  cargado el 2025-08-29): `stock_quant` dejó de recibir bloques nuevos, así que **por sí solo
  infracuenta** (134 bloques).
- **Era `alta`** — bloque recibido reciente (nº ≥ 46003) de `lot_block_creation` (el log VIVO de
  recepción) que **no consta consumido**: sin aserrado/salida (`parte_trabajo_mapeada` op 2/3), ni en
  `produccion_mapeada`/`parte_discopuente_mapeada`, ni `delivery_done`. Son los bloques sin cortar en
  patio (~151) que el stock de Odoo todavía no refleja.

Las dos series de nº de bloque son disjuntas, así que unirlas **no duplica** (además se deduplica por
nº por seguridad). Solo cuentan los bloques (`type_product_lot` ∈ {`block`, `othermaterial`} en el
stock; las altas son bloques por definición); `tables`/`slabs` quedan fuera. El m³ se deriva de las
medidas del propio lote/alta.

| Valor | Cómo se obtiene | Estado | Qué falta |
|---|---|---|---|
| Procedencia | `fuente` = `stock` (on-hand de Odoo) o `alta` (recepción reciente, sin existencias aún en Odoo) | ✅ | Confirmar por qué los bloques nuevos no entran en `stock_quant` (recepción no validada desde ~ago-2025) |
| Medidas proveedor / fábrica | columnas `largo/alto/grueso_supplier` y `_mrp` ("—" si NULL) | ✅ | Unidad **metros**; la de fábrica (`_mrp`) casi siempre falta (se mide al procesar el bloque) |
| m³ prov. / m³ fáb. | largo × alto × grueso (metros → m³ directo; `volumenBloqueM3` normaliza algún cm suelto) | ✅ | — |
| Merma % | (m³ prov − m³ fáb) / m³ prov × 100, solo con ambas medidas | ⚠️ | Casi nunca disponible (falta la medida de fábrica) |
| Material | nombre real de `product_template` por `product_id` (stock) o `product_id` ?? `product_id_tmpl` (altas); resuelve plantilla y variante; sin "M3 BLOQUE" | ✅ | Id sin nombre en Odoo → "Material N" |
| Tipo | `type_product_lot` (`block` / `othermaterial`) en el stock; `block` en las altas | ⚠️ | Confirmar qué distingue ambos en el stock |
| Ubicación | `stock_location.complete_name` del quant on-hand (p. ej. "WH/Stock"); "—" en las altas (aún sin ubicación Odoo) | ✅ | — |

Comprobado contra el endpoint real (2026-06-14): **285 bloques / 26 materiales** (134 on-hand +
~151 altas no consumidas), ~1.313 m³. m³ y merma salen de las medidas del propio lote/alta; no se
inventa nada. Incertidumbres registradas en `00_gestion/TAREAS.md` (snapshot congelado ~9,5 meses;
15 altas sin medida usable; `othermaterial`).

### Vista `/datos` — Salud del dato

La vista es valiosa y conceptualmente correcta, pero las **reglas concretas del validador** las fijé yo y hay que acordarlas con producción/informática. Reglas actuales y lo que cada una necesita:

| Regla del validador | Umbral actual | Qué confirmar |
|---|---|---|
| Fecha declarada imposible | difiere >15 min del sello de recepción | **Que exista un sello de recepción fiable** distinto de la fecha de la máquina (§2). Sin él, no se pueden cazar las "fechas imposibles" |
| Incidencia sin mapear | texto = "Sin nombre" | Confirmar la lista cerrada de incidencias válidas |
| Potencia fuera de rango | <0 o >76 kW | Confirmar el máximo real de cada telar |
| Amperios desacoplados | |A − 2·kW| > 35% | Confirmar la relación A↔kW por telar (puede variar) |
| Golpes fuera de rango | ≠0 y fuera de 700–1000 | Confirmar rango real por telar |
| Altura sobre el tope físico | > 2.250 mm | Confirmar la **altura máxima real del bastidor** (asumí 2.150 + margen) |
| Salto de altura imposible | sube en corte, o baja > 1,5× velocidad máx | Confirmar velocidad máxima real (asumí 310 mm/h) |
| % lecturas fiables por telar | — | Es un % real una vez acordadas las reglas de arriba |

**Pestaña "Fuentes"** (Salud → Fuentes): lista **las 11 tablas reales que lee Fabric**, agrupadas por origen, con su descripción, quién las introduce y un veredicto de salud **derivado del dato real**, no supuesto: nº de registros (`count`), última actualización (registro más reciente) y el diagnóstico. Lo calcula el backend (`getSaludDatos` → `fuentesDatos`); si una tabla no se puede leer, su tarjeta degrada a "—"/"sin datos" sin tumbar la página. Los grupos:

- **Máquinas** — `produccion_mapeada` (lecturas de telar, veredicto = fiabilidad en 7 días), `parte_trabajo_mapeada` (partes de operario, veredicto = % con problemas de formato), `parte_discopuente_mapeada` (partes del disco puente), `reforzadora_mapeada` (partes de la reforzadora de tablas), `bloque_maquinas` (padrón de nº de bloque de máquina).
- **Inventario** — dos eras que se unen: `stock_lot` (maestro de lotes, snapshot on-hand histórico) + `stock_quant` (existencias on-hand) + `stock_location` (ubicaciones), y **`lot_block_creation`** (log VIVO de recepción de los bloques recientes que aún no entran al stock de Odoo). El inventario suma las dos; `lot_block_creation` aporta además la medida de bloque por PM/lote para el m³ y el rendimiento de Producción (`inventarioPorPm`).
- **Catálogo de productos (Odoo)** — `product_template` y `product_product` (solo resuelven el nombre del material).

---

## 2. Datos que pedimos a la empresa / a quien gestione el servidor

Para poder marcar en verde lo que hoy está en ámbar o rojo, necesitaríamos confirmar/aportar:

1. **Cadencia real de emisión** de cada telar (¿fija cada X min? ¿por evento?). Es lo más importante: condiciona toda métrica de tiempo.
2. **Marca de tiempo fiable de recepción en servidor**, independiente de la fecha que declara la máquina. Es lo que permite detectar las fechas corruptas de los telares 1/3/4.
3. **Mapeo de columnas de medidas**: cuáles son la medida del proveedor y cuáles la de fábrica.
4. **Unidades oficiales** de: altura del bastidor, velocidad de descenso, dimensiones de bloque, potencia, amperios. (Tengo cruzado que velocidad es mm/h y amperios≈2·kW, pero conviene confirmarlo formalmente.)
5. **Semántica de "Altura actual"**: ¿es la posición del bastidor que baja hasta 0 al acabar el corte? ¿Cuál es la altura máxima (reposo) real?
6. **Lista cerrada de incidencias** que emite la máquina y cuáles significan parada real vs. rutina. Y cómo se representa un telar **sin PM/lote en corte / entre lotes** (para sustituir mi estado inventado "Cambio de lote").
7. **Calendario de turnos** real (horas de inicio/fin, si hay turno de noche, festivos) y si la utilización debe medirse sobre 24 h, sobre horas de turno o sobre horas planificadas de corte. **Decisión de negocio.**
8. **Catálogo real de materiales** que se cortan en telar, con sus códigos (¿son los mismos códigos 100–903 de PulyTrack?), para fijar nombre y color de forma oficial.
9. **Espesor de tabla y kerf (anchura de corte) del fleje** estándar — solo si queremos mantener "tablas/m² previstos"; si no, los quitamos y mostramos solo el dato real del parte.
10. **Histórico de roturas de fleje** (si existe): el "vigía del fleje" está **retirado del modo Real** (2026-06-13) por ser una heurística sin base. **Es una retirada temporal: hay que reintroducirlo en cuanto se pueda**, en cuanto este histórico permita validar el ratio y el umbral con datos reales.
11. Confirmar si la **m² y m³** que queremos mostrar son los de las columnas del parte ("Metros cuadrados tablas", "Metros cúbicos") o se recalculan, y si son acumulados o por registro.
12. **Evento "Fin de jornada"**: confirmar que existe como registro en los partes reales, en qué momento se genera y qué operario figura (hoy el mock lo sintetiza a las 14:00/22:00). Y qué operario consta en un parte de turno de noche.

---

## 3. Qué se quita o se gatea si NO se puede confirmar

Para cumplir el principio de "ningún dato supuesto en la entrega", si llegado el momento algo no tiene fuente real:

- **Tablas previstas / m² previstos** → quitar; mostrar solo tablas y m² reales del parte.
- **Vigía del fleje** → ~~quitar~~ **hecho (2026-06-13): retirado del modo Real** (`vigiaFleje: null`); solo se calcula en Demo. **Retirada temporal: reintroducir en cuanto se pueda**, en cuanto haya histórico de roturas que valide el ratio/umbral.
- **Estado "Cambio de lote"** → sustituir por lo que diga el dato real, o fundir en "Sin lote".
- **Utilización / % en marcha** → no mostrar hasta acordar el denominador; alternativamente mostrar solo **horas de marcha absolutas** (dato duro) en vez de un % cuyo 100% es discutible.
- **Cualquier métrica de minutos/horas** → recalcular por diferencia de marcas de tiempo antes de mostrarse.

---

## 4. Cómo está montado para que esto sea fácil de cumplir

- Todo lo dudoso está concentrado: la simulación en `core/mock/`, las reglas en `core/validador.ts`, las constantes físicas en `core/dominio.ts`. La UI **no inventa**: solo pinta lo que la fachada `FabricApi` le entrega.
- Al conectar la API real (`HttpFabricApi`), cada KPI que se confirme se calcula igual; cada KPI que no, se elimina de la respuesta y desaparece de la vista sin tocar componentes.
- Este documento se revisa entero antes de dar la app por entregable: no debe quedar ninguna fila en ⚠️ ni ⛔.
