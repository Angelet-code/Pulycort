# Investigacion de tablas Fabric: produccion y partes por telar

Fecha: 2026-06-14  
Consulta: lectura directa de metadatos y agregados en PostgreSQL `PULYCORT`, esquema `public`.  
Alcance: localizar si existen tablas separadas por telar o si los telares se distinguen por campos dentro de tablas comunes.

## Conclusion corta

No he encontrado tablas separadas por Telar 1, Telar 2, Telar 3 y Telar 4.

Lo que si existe es una tabla cruda comun para produccion (`producciont1`) y otra para partes de trabajo (`parte_trabajot1`). Aunque el sufijo `t1` puede inducir a pensar "telar 1", los datos demuestran que contienen registros de los cuatro telares, diferenciados por columna:

- `producciont1.telar_n`
- `parte_trabajot1.n_telar`

Las tablas que debe consumir Fabric/Odoo para trabajo normal son las mapeadas:

- `produccion_mapeada`, con `telar_n`
- `parte_trabajo_mapeada`, con `n_telar`

Por tanto, si la pregunta es "hay partes de produccion por telar?", la respuesta es si: estan en `parte_trabajo_mapeada`, pero no como una tabla por telar, sino como una tabla comun filtrable por `n_telar`.

## Evidencia de existencia de tablas

Comprobacion explicita de nombres esperables por telar:

| Tabla | Existe |
| --- | --- |
| `producciont1` | si |
| `producciont2` | no |
| `producciont3` | no |
| `producciont4` | no |
| `parte_trabajot1` | si |
| `parte_trabajot2` | no |
| `parte_trabajot3` | no |
| `parte_trabajot4` | no |
| `produccion_mapeada` | si |
| `parte_trabajo_mapeada` | si |

Tablas de maquina o proceso localizadas:

- `producciont1`
- `produccion_mapeada`
- `parte_trabajot1`
- `parte_trabajo_mapeada`
- `parte_disco_puente`
- `parte_discopuente_mapeada`
- `pulidora_losa`
- `pulidora_losa_mapeada`
- `pulidora_tablas`
- `pulidora_tablas_mapeada`
- `reforzadora`
- `reforzadora_mapeada`
- `bloque_maquinas`
- `bloque_discopuente`
- `bloque_trabajo`

Esto apunta a separacion por tipo de proceso/maquina, no por cada telar fisico.

## Produccion de telares

Tabla cruda `producciont1`, agrupada por `telar_n`:

| telar_n | Filas | PM/lotes distintos |
| ---: | ---: | ---: |
| 0 | 1 | 1 |
| 1 | 25.375 | 165 |
| 2 | 23.358 | 164 |
| 3 | 21.407 | 123 |
| 4 | 38.240 | 203 |

Tabla mapeada `produccion_mapeada`, agrupada por `telar_n`:

| telar_n | Filas | PM/lotes distintos | Primera lectura | Ultima lectura |
| ---: | ---: | ---: | --- | --- |
| 1 | 25.375 | 165 | 2025-05-05 01:59 UTC | 2026-06-13 08:39 UTC |
| 2 | 23.358 | 164 | 2025-06-04 04:39 UTC | 2026-06-13 08:43 UTC |
| 3 | 21.407 | 123 | 2025-06-04 04:39 UTC | 2026-06-13 08:43 UTC |
| 4 | 38.240 | 203 | 2024-12-31 22:01 UTC | 2026-06-14 07:09 UTC |

Lectura: `producciont1` no es "produccion del telar 1". Es una tabla comun de produccion de telares; `telar_n` contiene 1, 2, 3 y 4.

## Partes de trabajo de telares

Tabla cruda `parte_trabajot1`, agrupada por `n_telar`:

| n_telar | Filas | PM/lotes distintos | Operaciones distintas |
| ---: | ---: | ---: | ---: |
| 0 | 164 | 19 | 8 |
| 1 | 2.541 | 344 | 12 |
| 2 | 2.387 | 331 | 12 |
| 3 | 1.867 | 230 | 12 |
| 4 | 2.199 | 324 | 10 |

Tabla mapeada `parte_trabajo_mapeada`, agrupada por `n_telar`:

| n_telar | Filas | PM/lotes distintos | Operaciones distintas | Primera fecha_hora | Ultima fecha_hora |
| ---: | ---: | ---: | ---: | --- | --- |
| 0 | 164 | 19 | 7 | 2025-09-06 09:58 UTC | 2025-09-06 09:58 UTC |
| 1 | 2.463 | 340 | 5 | 2025-05-19 09:56 UTC | 2026-12-16 11:50 UTC |
| 2 | 2.339 | 330 | 5 | 2025-06-04 04:39 UTC | 2026-12-18 19:56 UTC |
| 3 | 1.825 | 230 | 5 | 2025-06-04 04:39 UTC | 2026-12-18 19:56 UTC |
| 4 | 2.110 | 323 | 5 | 2025-09-02 04:54 UTC | 2026-11-17 11:52 UTC |
| 45971 | 2 | 1 | 2 | 2025-09-01 02:10 UTC | 2025-09-01 15:00 UTC |
| 46002 | 1 | 1 | 1 | 2025-09-02 09:20 UTC | 2025-09-02 09:20 UTC |
| 46052 | 1 | 1 | 1 | 2025-09-11 13:00 UTC | 2025-09-11 13:00 UTC |
| null | 16 | 1 | 0 | null | null |

Lectura: la tabla de partes si separa los partes por telar mediante `n_telar`. Tambien confirma problemas de calidad ya anotados en tareas: hay `n_telar` corruptos que parecen PM/lotes (`45971`, `46002`, `46052`), 16 filas sin telar y fechas futuras en la mapeada.

## Relacion con Odoo

En `ir_model` aparecen como modelos Odoo:

- `producciont1`
- `produccion.mapeada`
- `parte.trabajot1`
- `parte.trabajo.mapeada`
- `parte.disco.puente`
- `parte.discopuente.mapeada`
- `bloque.maquinas`

Esto encaja con que Odoo tenga modelos/tablas comunes por flujo, no una tabla fisica distinta por cada telar.

## Recomendacion

1. Usar siempre las tablas `_mapeada` para Fabric e integracion funcional:
   - `produccion_mapeada`
   - `parte_trabajo_mapeada`
   - `parte_discopuente_mapeada`
2. Filtrar o agrupar telares por `telar_n` / `n_telar`; no buscar `producciont2`, `producciont3`, etc.
3. Tratar las crudas (`producciont1`, `parte_trabajot1`, `parte_disco_puente`, etc.) como fuente forense, no como fuente principal: tienen fecha/hora en formato antiguo, tipos menos fiables y menos columnas derivadas.
4. Pedir a TotWare/Indasel confirmacion del significado historico del sufijo `t1`, porque por datos no significa "solo Telar 1".
5. Mantener abierta la revision de calidad de `parte_trabajo_mapeada`: `n_telar` corrupto, filas sin telar y fechas futuras. Esta duda ya esta recogida en `00_gestion/TAREAS.md`.

## Fuentes usadas

- Base de datos PostgreSQL `PULYCORT`, esquema `public`, consulta de solo lectura del catalogo (`information_schema`, `pg_class`, `pg_stat_user_tables`) y agregados por telar.
- `05_proyectos/fabric/README.md`
- `05_proyectos/fabric/backend/prisma/schema.prisma`
- `05_proyectos/fabric/backend/src/modules/fabric/infrastructure/prisma-fabric.repository.ts`
- `05_proyectos/fabric/VERIFICACION.md`
- `00_gestion/TAREAS.md`
