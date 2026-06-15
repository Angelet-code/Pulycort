# Auditoria de coherencia de Fabric

Fecha: 2026-06-14  
Audiencia: Pulycort / produccion / implantacion Fabric  
Tipo de material: auditoria de datos reales y coherencia entre vistas de una app de solo lectura.

## Resumen ejecutivo

- **Fabric tiene una arquitectura razonable, pero hoy una misma PM/lote puede verse distinta segun la pestana.** La causa principal no es una sola tabla mala, sino que cada vista prioriza una fuente diferente: `/partes` pinta la lectura cruda de `produccion_mapeada`, sala/detalle/produccion corrigen parte del dato con `parte_trabajo_mapeada`, y el inventario real ya viene de `stock_lot` mientras algunas tarjetas siguen llamando "inventario" a `lot_block_creation`.

- **El material es el ejemplo mas claro de incoherencia visible.** En 438 de 588 grupos comparables PM+telar, el material de `produccion_mapeada` no coincide con el material de los partes de operario. Esto explica que un empleado vea un PM con un material en `/partes` y otro material en `/telares` o `/produccion`. Ejemplo actual: Telar 1, PM 47177, lectura cruda material 114, ultimo parte material 99.

- **Las medidas no son fiables al nivel de fila/ciclo si no se declara la fuente.** En 588 de 588 grupos PM+telar comparables, las medidas de la lectura de telar y las de los partes no son identicas. Parte de la diferencia es unidad/tabla distinta, pero parte confirma lo ya documentado: la consola puede heredar medidas de otro bloque. Esto obliga a que cada m3/rendimiento diga de donde sale.

- **La mayor incoherencia de calculo esta en `/produccion`: el ciclo individual y el KPI agregado no usan exactamente el mismo denominador.** El ciclo por PM usa `lot_block_creation` para `volumenM3`/`rendimientoM2M3`, pero el agregado de `totalM3Aserrados` y `rendimientoM2M3` sigue sumando volumen de las medidas de consola (`produccion_mapeada`). Si la consola es "punto de control" y no fuente de m3 por lote, este agregado debe alinearse o etiquetarse de forma explicita.

- **Disco puente necesita cuarentena mas fuerte.** Hay 434 partes de disco con `fecha_hora` futura y 8.379 filas donde `metro2_salida` supera a `metro2_entrada` mas de un 5%, pero `eficiencia_m2` aparece siempre 0. En la UI se esta pintando `eficienciaM2` como porcentaje; con estos datos no deberia presentarse como indicador fiable.

## Alcance y fuentes

Consulta directa de solo lectura contra PostgreSQL `PULYCORT`, esquema `public`, el 2026-06-14 a las 19:21 UTC aprox. No se han modificado tablas.

Fuentes principales:

| Fuente | Uso en auditoria |
| --- | --- |
| `05_proyectos/fabric/README.md` | Regla PM/lote, alcance de Fabric y puertos. |
| `05_proyectos/fabric/VERIFICACION.md` | Lista de control de valores reales, supuestos e inventados. |
| `05_proyectos/fabric/backend/prisma/schema.prisma` | Modelos Prisma y tablas reales. |
| `05_proyectos/fabric/backend/src/modules/fabric/infrastructure/prisma-fabric.repository.ts` | Logica de sala, detalle, estadisticas, material corregido, salud de datos. |
| `05_proyectos/fabric/backend/src/modules/bloque-inventario/infrastructure/prisma-bloque-inventario.repository.ts` | Inventario real por `stock_lot` + `stock_quant`. |
| `05_proyectos/fabric/backend/src/modules/parte-trabajo/infrastructure/prisma-parte-trabajo.repository.ts` | Partes de trabajo. |
| `05_proyectos/fabric/backend/src/modules/parte-disco-puente/infrastructure/prisma-parte-disco-puente.repository.ts` | Partes de disco puente. |
| `05_proyectos/fabric/frontend/src/app/vistas/*` | Que pinta cada pestana. |
| `04_analisis_y_entregables/informes/investigacion_tablas_fabric_telares_2026-06-14.md` | Confirmacion de tablas comunes por proceso, no por telar. |
| `00_gestion/TAREAS.md` | Tareas ya abiertas sobre datos de Fabric. |

Resultados brutos y SQL reproducible:

- `04_analisis_y_entregables/outputs/auditoria_fabric_2026-06-14/auditar_fabric_datos.mjs`
- `04_analisis_y_entregables/outputs/auditoria_fabric_2026-06-14/auditoria_fabric_resultados.json`
- `04_analisis_y_entregables/outputs/auditoria_fabric_2026-06-14/auditar_fabric_conteos.mjs`
- `04_analisis_y_entregables/outputs/auditoria_fabric_2026-06-14/auditoria_fabric_conteos.json`

## Mapa de fuentes por pestana

| Pestana / ruta | Fuente principal real | Que puede confundir |
| --- | --- | --- |
| `/telares` | `produccion_mapeada`, enriquecida por partes y reglas del backend | El bloque mostrado es PM/lote operativo. Material corregido por parte si existe; no es el material crudo de la lectura. |
| `/telares/:id` | `produccion_mapeada` + `parte_trabajo_mapeada` + `lot_block_creation` para algunos datos de PM | Muestra medidas proveedor/fabrica iguales cuando la lectura no distingue ambas. Algunas tablas/m2 son estimacion marcada. |
| `/partes` | `produccion_mapeada` cruda | Pinta `material` crudo; en telares 1 y 2 esta clavado en 114. Esta vista no usa el material corregido por parte. |
| `/partes-trabajo` | `parte_trabajo_mapeada` | Tiene material, tablas y m2 reales de parte, pero tambien fechas futuras, `n_telar` corruptos y unidades mezcladas. |
| `/partes/disco-puente` | `parte_discopuente_mapeada` | Tiene 434 fechas futuras y `eficiencia_m2` no interpretable como indicador fiable. |
| `/produccion` | Runs de `produccion_mapeada`, partes de trabajo, `lot_block_creation` y medidas de consola | Ciclo individual y KPI agregado no usan el mismo m3. Hay estimaciones si falta parte. |
| `/partes/bloques` | `stock_lot` on-hand + `stock_quant` + `stock_location` | Esta SI es la vista de stock real actual de bloques. No equivale a `lot_block_creation`. |
| `/inventario` | Resumen de `stock_lot` on-hand | Correcto como stock de bloques; tablas/losas siguen pendientes. |
| `/datos` | `produccion_mapeada`, `parte_trabajo_mapeada`, `lot_block_creation` | Desfasada con el refuenteo de inventario: llama "Inventario de bloques" a `lot_block_creation`, no a `stock_lot`. |
| `/sistema` | Registro curado/manual | Es una buena capa de explicacion, pero debe mantenerse sincronizada con los hallazgos anteriores. |

## Hallazgos principales

### 1. El material cambia entre pestanas porque `/partes` usa el material crudo

Hecho medido:

- `produccion_mapeada` tiene 108.440 lecturas y 596 PM/lotes distintos.
- En Telar 1 y Telar 2, `produccion_mapeada.material` solo tiene un valor en todo el historico: `114`.
- En 438 de 588 grupos PM+telar comparables, el material de produccion no coincide con el material de los partes.
- El backend de sala/detalle/produccion ya intenta corregir esto: toma material del parte de operario y solo usa la lectura como respaldo si el telar no esta estancado.

Ejemplos:

| Telar | PM/lote | Material en `/partes` (`produccion_mapeada`) | Material en partes de operario | Lecturas produccion | Partes |
| ---: | ---: | --- | --- | ---: | ---: |
| 1 | 47177 | 114 | 99 | 47 | 2 |
| 2 | 47220 | 114 | 71/117 | 28 | 3 |
| 4 | 47187 | 71/72 | 72 | 200 | 2 |
| 1 | 47080 | 114 | 71 | 409 | 4 |
| 3 | 47048 | 71 | 72 | 210 | 3 |

Interpretacion:

El empleado no esta loco: esta viendo dos verdades de distinta calidad. `/partes` es "lectura cruda de maquina"; `/telares` y `/produccion` estan mas cerca del PM real porque usan el parte de operario para corregir material.

Implicacion:

No se debe usar `produccion_mapeada.material` como fuente de material en ninguna vista de negocio sin avisar. En `/partes`, si se mantiene la columna cruda, deberia mostrarse como "material lectura" y anadir "material PM/parte" al lado cuando exista.

### 2. Las medidas no son consistentes entre produccion y partes

Hecho medido:

- En 588 de 588 grupos PM+telar comparables, las medidas agregadas de `produccion_mapeada` y `parte_trabajo_mapeada` difieren.
- Hay motivos esperados: unidades distintas, partes con `0x0x0`, partes en metros frente a produccion en centimetros.
- Hay motivos preocupantes: en produccion un mismo PM+telar puede tener varias medidas dentro del run, lo que confirma que la consola hereda o actualiza tarde medidas.

Ejemplos:

| Telar | PM/lote | Medidas en produccion | Medidas en partes |
| ---: | ---: | --- | --- |
| 4 | 47187 | `315.00x145.00x105.00` | `0.00x0.00x0.00` y `3.15x1.45x1.05` |
| 2 | 47220 | `170.00x160.00x85.00` y `190.00x150.00x80.00` | `0.00x0.00x0.00` y `1.70x1.60x0.85` |
| 1 | 47177 | `180.00x130.00x140.00` y `190.00x160.00x100.00` | `0.00x0.00x0.00` |
| 4 | 46302 | `230.00x175.00x190.00` y `295.00x150.00x175.00` | `0.00x0.00x0.00` y `2.95x1.50x1.75` |

Interpretacion:

La comparacion bruta "medida de telar vs medida de parte" no debe leerse como error fila a fila, porque no estan en la misma unidad ni con la misma semantica. Pero si confirma una regla de producto: no se puede presentar m3/rendimiento sin declarar si sale de consola, parte, `lot_block_creation` o `stock_lot`.

### 3. `/produccion` mezcla dos bases de m3/rendimiento

Hecho documentado en codigo:

- Los ciclos individuales llaman a `inventarioPorPm()` y este lee `lotBlockCreation.findMany(...)`.
- En esos ciclos, `volumenM3` y `rendimientoM2M3` salen del volumen agrupado por PM en `lot_block_creation`.
- Pero en el agregado de estadisticas se calcula `volumenM3 = volumenM3De(ciclo.bloque.medidasFabrica)`, es decir, desde las medidas de consola de `produccion_mapeada`, y con eso se suma `totalM3` y `m3ConParte`.

Riesgo visible:

La tabla de "ultimos lotes aserrados" puede mostrar un m3 por PM de `lot_block_creation`, mientras el KPI superior "m3 de piedra" y el rendimiento agregado usan otra fuente. Aunque ambos sean aproximados, el lector espera que un mismo panel tenga una unica definicion.

Propuesta:

1. Alinear el KPI agregado con `ciclo.volumenM3` cuando haya inventario por PM.
2. Si se decide mantener el agregado por consola por compensacion estadistica, etiquetarlo como "m3 consola" y explicar que no es suma de los m3 visibles por PM.
3. Crear un test con PM reales de esta auditoria: 47187, 47220, 47177 y 45953.

### 4. `lot_block_creation` ya no debe llamarse inventario sin matiz

Hecho medido:

- `stock_lot_onhand_bloques`: 134 filas, 133 PM distintos. Es el stock real actual de bloques.
- `lot_block_creation`: 1.093 filas, 1.081 PM distintos. Es log/alta/medida por PM, no stock on-hand.
- Hay 504 PM presentes tanto en `lot_block_creation` como en `stock_lot`.
- Entre esos 504 PM, 21 tienen medidas distintas y 114 tienen producto distinto o ausente segun la fuente.

Interpretacion:

El refuenteo de `/inventario` a `stock_lot` es correcto. El problema es de lenguaje y de coherencia: `/datos` y algunos tooltips de `/produccion` siguen llamando inventario a `lot_block_creation`. Para Pulycort, "inventario" debe significar "lo que hay ahora"; `lot_block_creation` puede llamarse "alta/medida de PM".

### 5. Hay PM/lotes que parecen estar vivos en varias realidades a la vez

Hecho medido:

- 1.423 PM aparecen en mas de una fuente entre produccion, partes, disco, altas, stock on-hand y `bloque_maquinas`.
- 57 PM aparecen en mas de un telar dentro de `produccion_mapeada`.
- 55 PM tienen solape temporal entre telares.
- 5 PM tienen una vida en produccion superior a 60 dias.

Ejemplos de solape:

| PM/lote | Telares | Comentario |
| ---: | --- | --- |
| 46542 | 1 y 3 | Solape enero 2026 entre ambos telares. |
| 46365 | 1 y 2 | Solape diciembre 2025. |
| 46178 | 1 y 4 | Solape octubre 2025. |
| 46116 | 2 y 4 | Solape octubre 2025. |
| 45953 | 3 y 4 | Actividad de produccion, partes, disco y stock on-hand. |

Caso a revisar en stock:

| PM/lote | Stock actual | Actividad maquina |
| ---: | --- | --- |
| 45953A / 45953B | Dos lotes on-hand, producto 71, medidas `1.8x1x0.9` | 761 lecturas de produccion en telares 3/4, 8 partes de telar, 14 partes de disco, ultimo disco 2026-03-30. |
| 45493A | On-hand, producto 73 | 4 partes de telar, ultimo parte 2026-01-09. |
| 45971 | On-hand, producto 75 | 2 partes con `n_telar=45971`, que parece un error de columna. |

Interpretacion:

Esto no prueba por si solo que el stock este mal: puede haber PM multibloque, duplicidad A/B, reproceso, o que PM/lote no sea bloque fisico. Pero para un empleado, la experiencia es peligrosa: el mismo numero parece ser "bloque en almacen", "lote ya producido" y "pieza procesada en disco" sin una explicacion visual.

### 6. Fechas futuras y codigos de maquina contaminan ordenaciones y "ultimo dato"

Hecho medido:

| Tabla | Filas futuras | `fecha_hora` nula | Separacion `fecha_hora` vs `create_date` > 15 min |
| --- | ---: | ---: | ---: |
| `produccion_mapeada` | 0 | 0 | 20.061 |
| `parte_trabajo_mapeada` | 26 | 179 | 2.814 |
| `parte_discopuente_mapeada` | 434 | 0 | 5.394 |

Ejemplos:

- `parte_discopuente_mapeada.id=69970`, PM 45886, fecha declarada 2026-12-22 19:33, `create_date` 2026-01-01 00:03.
- `parte_trabajo_mapeada.id=52679`, Telar 3, PM 0, fecha declarada 2026-12-18 20:56, `create_date` 2026-01-01 00:00.

Ademas, en `parte_trabajo_mapeada.n_telar` hay:

| Valor `n_telar` | Filas | Lectura |
| --- | ---: | --- |
| `0` | 164 | No es un telar operativo normal. |
| `NULL` | 16 | Sin telar. |
| `45971` | 2 | Parece PM/lote escrito en la columna de telar. |
| `46002` | 1 | Parece PM/lote. |
| `46052` | 1 | Parece PM/lote. |

Implicacion:

Las vistas de detalle pueden marcarlo como sospechoso, pero cualquier catalogo, "ultima actividad" o filtro que use `fecha_hora` sin saneo puede traer datos de diciembre de 2026 como si fueran los mas recientes.

### 7. `bloque_existe` no significa "bloque real conocido"

Hecho medido:

| Tabla | Filas | `id_bloque` apunta a otro numero | `bloque_existe=false` pero `bloque_maquinas` conoce el PM | `bloque_existe=true` pero `bloque_maquinas` no lo conoce |
| --- | ---: | ---: | ---: | ---: |
| `parte_trabajo_mapeada` | 8.921 | 8 | 3.061 | 7 |
| `parte_discopuente_mapeada` | 12.855 | 23 | 7.137 | 0 |

Interpretacion:

Esto ya estaba apuntado en tareas y queda confirmado: `bloque_existe` es un check contra otra capa de inventario, no contra el padron real de maquinas. La app acierta al exponer `bloqueConocido` por `bloque_maquinas` y reetiquetar el flag antiguo como `enInventarioOdoo`.

Riesgo residual:

Hay que extender esta misma logica a `/partes` si se quiere que la lectura cruda tambien avise cuando el PM no esta en el padron.

### 8. Disco puente: m2 y eficiencia no son coherentes

Hecho medido:

- `parte_discopuente_mapeada`: 12.855 filas.
- Disco 1: 12.634 filas, 434 con fecha futura.
- 8.379 filas tienen `metro2_salida > metro2_entrada * 1,05`.
- `eficiencia_m2` aparece con minimo 0 y maximo 0.
- La UI pinta `eficienciaM2` como porcentaje.

Interpretacion:

Si `metro2_entrada/salida` estan invertidos, son acumulados, o miden cosas distintas, falta semantica. Si `eficiencia_m2` llega siempre a 0, no es un KPI. Mantenerlo en pantalla como porcentaje puede inducir a una conclusion falsa.

Propuesta:

Hasta confirmar con TotWare, mostrar `eficiencia_m2` como "pendiente" o sustituirla por una columna tecnica no KPI: `m2 entrada`, `m2 salida`, "calculo de eficiencia no validado".

## Que si esta bien encaminado

- La investigacion de tablas es coherente: no hay una tabla por telar; las tablas comunes se filtran por `telar_n`, `n_telar` o `disco_puente_n`.
- La regla "PM/lote es matricula operativa; bloque fisico solo cuando la fuente lo identifica" es correcta. Forzar subbloques inventados empeoraria la trazabilidad.
- `/partes/bloques` e `/inventario` ya leen el stock real on-hand desde `stock_lot` + `stock_quant`; esto corrigio el problema de Negro Marquina.
- El backend ya evita usar el material crudo de lectura en los telares estancados cuando construye sala/detalle/produccion.
- El estilo de no ocultar filas sospechosas es adecuado para Pulycort: se ve el dato, pero con motivo de cuarentena.

## Recomendaciones priorizadas

1. **Unificar la presentacion del material por PM/lote.** En `/partes`, anadir `materialCorregido` o `materialPM` y dejar `materialLectura` como dato crudo. Si ambos difieren, mostrar aviso. El filtro de material de negocio deberia usar el material corregido, no el crudo.

2. **Alinear m3/rendimiento en `/produccion`.** La tabla de ciclos y los KPI superiores deben compartir denominador, o el encabezado debe decir claramente "m3 consola" frente a "m3 PM/alta".

3. **Renombrar `lot_block_creation` en UI y salud de datos.** En vez de "Inventario de bloques", usar "Altas/medidas de PM". Anadir una fuente separada para `stock_lot on-hand` si `/datos` quiere medir salud del inventario real.

4. **Cuarentenar fechas futuras antes de ordenar y resumir.** En partes de trabajo y disco, usar `create_date` como respaldo para ordenacion operativa cuando `fecha_hora` sea futura o imposible. Mantener la fecha original visible como dato sospechoso.

5. **Ocultar o desactivar `eficiencia_m2` del disco puente hasta validarla.** La columna actual no es interpretable.

6. **Crear una vista/endpoint de coherencia por PM.** Para cada PM/lote: fuentes donde aparece, material por fuente, medidas por fuente, ultimo evento, si esta on-hand, si esta en `bloque_maquinas`, y alertas. Seria la forma mas directa de que un empleado entienda "por que este PM aparece diferente".

7. **Tratar PM 0 como estado especial, no como PM.** En informes y filtros, `0` debe ser "sin PM/lote" o "no informado"; no debe mezclarse con los PM reales.

8. **Revisar manualmente los PM on-hand con actividad de maquina.** Prioridad: 45953A/B, 45493A, 45971. Decidir si son stock no descargado, duplicidad A/B, reproceso o semantica correcta.

9. **Meter tests con ejemplos reales.** Cubrir al menos: PM 47177, 47220, 47187, 45953, un `n_telar=45971`, y un disco con fecha futura.

## Preguntas abiertas para Pulycort / TotWare

- Cuando un PM aparece en dos telares con solape temporal, ?es siempre error, o puede ser un lote multibloque trabajado en paralelo?
- ?`stock_lot.name` con sufijos A/B representa bloques fisicos dentro de una misma PM?
- ?`lot_block_creation.name` debe seguir siendo fuente de m3 para rendimiento, o el rendimiento debe ir contra `stock_lot`/otro maestro definitivo?
- ?Que significa exactamente `metro2_entrada`, `metro2_salida` y `eficiencia_m2` en disco puente?
- ?Que regla oficial sustituye a `fecha_hora` cuando el parte declara una fecha futura?
- ?Debe `/partes` ser deliberadamente cruda/forense, o debe comportarse como vista de negocio y mostrar el dato corregido?

## Limitaciones

- Esta auditoria no modifica la aplicacion ni la base de datos. Solo lee y cruza datos.
- Las discrepancias no prueban siempre error operativo. Algunas pueden ser semantica no documentada: PM multibloque, sufijos A/B, reprocesos, medidas en capas distintas o fechas reconstruidas.
- Los conteos de diferencias de medida son utiles para detectar riesgo, pero no deben leerse como "588 errores"; comparan columnas con unidades y propositos distintos.
- La auditoria usa la BD real disponible el 2026-06-14. Las fechas futuras dentro de la propia BD hacen que algunos "ultimos" por `fecha_hora` no sean operativamente fiables.
