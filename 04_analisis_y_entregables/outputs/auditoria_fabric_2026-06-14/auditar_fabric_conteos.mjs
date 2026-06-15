import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const repo = 'A:/PROYECTOS/OPENCODE/Pulycort';
const backend = path.join(repo, '05_proyectos/fabric/backend');
const require = createRequire(path.join(backend, 'package.json'));
const { Client } = require('pg');

const envText = await fs.readFile(path.join(backend, '.env'), 'utf8');
const databaseUrl = envText
  .split(/\r?\n/)
  .find((line) => line.startsWith('DATABASE_URL='))
  ?.replace(/^DATABASE_URL=/, '')
  .replace(/^"|"$/g, '');

const client = new Client({ connectionString: databaseUrl });
const outDir = path.join(repo, '04_analisis_y_entregables/outputs/auditoria_fabric_2026-06-14');

const queries = [
  {
    name: 'conteo_mismatch_material_prod_partes',
    sql: `
      with prod as (
        select telar_n::int as telar, n_bloque as pm,
               array_agg(distinct material order by material) filter (where material is not null) as mats
        from produccion_mapeada
        where telar_n ~ '^[1-4]$' and n_bloque is not null
        group by telar_n::int, n_bloque
      ),
      partes as (
        select n_telar::int as telar, n_bloque as pm,
               array_agg(distinct material order by material) filter (where material is not null) as mats
        from parte_trabajo_mapeada
        where n_telar ~ '^[1-4]$' and n_bloque is not null
        group by n_telar::int, n_bloque
      )
      select count(*)::int as grupos_pm_telar_comparables,
             count(*) filter (where coalesce(prod.mats::text, '{}') <> coalesce(partes.mats::text, '{}'))::int as grupos_con_material_distinto
      from prod
      join partes on partes.telar = prod.telar and partes.pm = prod.pm
    `,
  },
  {
    name: 'conteo_mismatch_medidas_prod_partes',
    sql: `
      with prod as (
        select telar_n::int as telar, n_bloque as pm,
               array_agg(distinct concat_ws('x',
                 round(coalesce(largo,0)::numeric,2), round(coalesce(alto,0)::numeric,2), round(coalesce(grueso,0)::numeric,2)
               ) order by concat_ws('x',
                 round(coalesce(largo,0)::numeric,2), round(coalesce(alto,0)::numeric,2), round(coalesce(grueso,0)::numeric,2)
               )) as dims
        from produccion_mapeada
        where telar_n ~ '^[1-4]$' and n_bloque is not null
        group by telar_n::int, n_bloque
      ),
      partes as (
        select n_telar::int as telar, n_bloque as pm,
               array_agg(distinct concat_ws('x',
                 round(coalesce(largo,0)::numeric,2), round(coalesce(alto,0)::numeric,2), round(coalesce(grueso,0)::numeric,2)
               ) order by concat_ws('x',
                 round(coalesce(largo,0)::numeric,2), round(coalesce(alto,0)::numeric,2), round(coalesce(grueso,0)::numeric,2)
               )) as dims
        from parte_trabajo_mapeada
        where n_telar ~ '^[1-4]$' and n_bloque is not null
        group by n_telar::int, n_bloque
      )
      select count(*)::int as grupos_pm_telar_comparables,
             count(*) filter (where prod.dims::text <> partes.dims::text)::int as grupos_con_medidas_distintas
      from prod
      join partes on partes.telar = prod.telar and partes.pm = prod.pm
    `,
  },
  {
    name: 'conteo_pm_multi_fuente',
    sql: `
      with stock_onhand as (
        select nullif(regexp_replace(sl.name, '\\D', '', 'g'), '')::int as pm
        from stock_lot sl
        where sl.type_product_lot in ('block', 'othermaterial')
          and nullif(regexp_replace(sl.name, '\\D', '', 'g'), '') is not null
          and exists (
            select 1 from stock_quant sq join stock_location loc on loc.id=sq.location_id
            where sq.lot_id=sl.id and sq.quantity>0 and loc.usage='internal'
          )
        group by pm
      ),
      fuentes as (
        select n_bloque as pm, 'produccion' fuente from produccion_mapeada where n_bloque is not null group by n_bloque
        union all select n_bloque, 'partes' from parte_trabajo_mapeada where n_bloque is not null group by n_bloque
        union all select n_bloque, 'disco' from parte_discopuente_mapeada where n_bloque is not null group by n_bloque
        union all select nullif(regexp_replace(name,'\\D','','g'),'')::int, 'lot_block_creation' from lot_block_creation where nullif(regexp_replace(coalesce(name,''),'\\D','','g'),'') is not null group by 1
        union all select n_bloque, 'bloque_maquinas' from bloque_maquinas where n_bloque is not null group by n_bloque
        union all select pm, 'stock_onhand' from stock_onhand
      )
      select count(*)::int as pm_en_mas_de_una_fuente
      from (
        select pm from fuentes group by pm having count(distinct fuente)>1
      ) x
    `,
  },
  {
    name: 'conteo_stock_onhand_con_actividad',
    sql: `
      with stock_onhand as (
        select sl.id as stock_lot_id,
               nullif(regexp_replace(sl.name, '\\D', '', 'g'), '')::int as pm
        from stock_lot sl
        where sl.type_product_lot in ('block', 'othermaterial')
          and nullif(regexp_replace(sl.name, '\\D', '', 'g'), '') is not null
          and exists (
            select 1 from stock_quant sq join stock_location loc on loc.id=sq.location_id
            where sq.lot_id=sl.id and sq.quantity>0 and loc.usage='internal'
          )
      ),
      act as (
        select n_bloque as pm from produccion_mapeada where n_bloque is not null group by n_bloque
        union select n_bloque from parte_trabajo_mapeada where n_bloque is not null group by n_bloque
        union select n_bloque from parte_discopuente_mapeada where n_bloque is not null group by n_bloque
      )
      select count(*)::int as filas_stock_onhand_con_actividad,
             count(distinct s.pm)::int as pm_stock_onhand_con_actividad
      from stock_onhand s
      join act on act.pm=s.pm
    `,
  },
  {
    name: 'conteo_lbc_vs_stock_lot',
    sql: `
      with lbc as (
        select nullif(regexp_replace(coalesce(name,''),'\\D','','g'),'')::int as pm,
               array_agg(distinct concat_ws('x',
                 round(coalesce(largo_supplier,0)::numeric,3),
                 round(coalesce(alto_supplier,0)::numeric,3),
                 round(coalesce(grueso_supplier,0)::numeric,3)
               ) order by concat_ws('x',
                 round(coalesce(largo_supplier,0)::numeric,3),
                 round(coalesce(alto_supplier,0)::numeric,3),
                 round(coalesce(grueso_supplier,0)::numeric,3)
               )) as medidas,
               array_agg(distinct product_id order by product_id) filter (where product_id is not null) as productos
        from lot_block_creation
        where nullif(regexp_replace(coalesce(name,''),'\\D','','g'),'') is not null
        group by pm
      ),
      stock as (
        select nullif(regexp_replace(coalesce(name,''),'\\D','','g'),'')::int as pm,
               array_agg(distinct concat_ws('x',
                 round(coalesce(largo_supplier,0)::numeric,3),
                 round(coalesce(alto_supplier,0)::numeric,3),
                 round(coalesce(grueso_supplier,0)::numeric,3)
               ) order by concat_ws('x',
                 round(coalesce(largo_supplier,0)::numeric,3),
                 round(coalesce(alto_supplier,0)::numeric,3),
                 round(coalesce(grueso_supplier,0)::numeric,3)
               )) as medidas,
               array_agg(distinct product_id order by product_id) filter (where product_id is not null) as productos
        from stock_lot
        where nullif(regexp_replace(coalesce(name,''),'\\D','','g'),'') is not null
        group by pm
      )
      select count(*)::int as pm_en_ambas,
             count(*) filter (where coalesce(lbc.medidas::text,'{}') <> coalesce(stock.medidas::text,'{}'))::int as medidas_distintas,
             count(*) filter (where coalesce(lbc.productos::text,'{}') <> coalesce(stock.productos::text,'{}'))::int as productos_distintos
      from lbc join stock on stock.pm=lbc.pm
    `,
  },
  {
    name: 'conteo_pm_reutilizados_solapes',
    sql: `
      with prod as (
        select n_bloque as pm,
               count(distinct telar_n)::int as telares,
               min(fecha_hora) as primera,
               max(fecha_hora) as ultima,
               extract(epoch from (max(fecha_hora)-min(fecha_hora)))/86400 as dias_span
        from produccion_mapeada
        where n_bloque is not null and fecha_hora is not null
        group by n_bloque
      ),
      bloques_telar as (
        select telar_n::int as telar, n_bloque as pm, min(fecha_hora) primera, max(fecha_hora) ultima
        from produccion_mapeada
        where telar_n ~ '^[1-4]$' and n_bloque is not null and fecha_hora is not null
        group by telar_n::int, n_bloque
      ),
      solapes as (
        select a.pm
        from bloques_telar a
        join bloques_telar b on b.pm=a.pm and b.telar>a.telar
        where a.primera <= b.ultima and b.primera <= a.ultima
        group by a.pm
      )
      select count(*) filter (where dias_span>60)::int as pm_span_mayor_60d,
             count(*) filter (where telares>1)::int as pm_en_mas_de_un_telar,
             (select count(*)::int from solapes) as pm_con_solape_entre_telares
      from prod
    `,
  },
];

await client.connect();
try {
  const results = {};
  for (const q of queries) {
    results[q.name] = (await client.query(q.sql)).rows;
  }
  await fs.writeFile(path.join(outDir, 'auditoria_fabric_conteos.json'), JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify(results, null, 2));
} finally {
  await client.end();
}
