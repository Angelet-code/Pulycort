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

if (!databaseUrl) {
  throw new Error('DATABASE_URL no encontrado en backend/.env');
}

const outDir = path.join(repo, '04_analisis_y_entregables/outputs/auditoria_fabric_2026-06-14');

const client = new Client({ connectionString: databaseUrl });

const queries = [
  {
    name: '00_contexto_bd',
    sql: `
      select current_database() as db, current_schema() as schema, now() as now_utc
    `,
  },
  {
    name: '01_resumen_tablas',
    sql: `
      select 'produccion_mapeada' as tabla,
             count(*)::int as filas,
             count(distinct n_bloque)::int as pm_distintos,
             count(*) filter (where fecha_hora is null)::int as sin_fecha_hora,
             min(fecha_hora) as primera_fecha_hora,
             max(fecha_hora) as ultima_fecha_hora
      from produccion_mapeada
      union all
      select 'parte_trabajo_mapeada',
             count(*)::int,
             count(distinct n_bloque)::int,
             count(*) filter (where fecha_hora is null)::int,
             min(fecha_hora),
             max(fecha_hora)
      from parte_trabajo_mapeada
      union all
      select 'parte_discopuente_mapeada',
             count(*)::int,
             count(distinct n_bloque)::int,
             count(*) filter (where fecha_hora is null)::int,
             min(fecha_hora),
             max(fecha_hora)
      from parte_discopuente_mapeada
      union all
      select 'lot_block_creation',
             count(*)::int,
             count(distinct nullif(regexp_replace(coalesce(name,''), '\\D', '', 'g'), '')::int)::int,
             0,
             min(create_date),
             max(create_date)
      from lot_block_creation
      union all
      select 'bloque_maquinas',
             count(*)::int,
             count(distinct n_bloque)::int,
             0,
             min(create_date),
             max(create_date)
      from bloque_maquinas
      union all
      select 'stock_lot_onhand_bloques',
             count(*)::int,
             count(distinct nullif(regexp_replace(sl.name, '\\D', '', 'g'), '')::int)::int,
             0,
             min(sl.create_date),
             max(sl.create_date)
      from stock_lot sl
      where sl.type_product_lot in ('block', 'othermaterial')
        and exists (
          select 1
          from stock_quant sq
          join stock_location loc on loc.id = sq.location_id
          where sq.lot_id = sl.id
            and sq.quantity > 0
            and loc.usage = 'internal'
        )
    `,
  },
  {
    name: '02_ultima_actividad_por_maquina',
    sql: `
      select 'produccion' as fuente,
             telar_n as maquina,
             count(*)::int as filas,
             count(distinct n_bloque)::int as pm_distintos,
             min(fecha_hora) as primera,
             max(fecha_hora) as ultima,
             extract(epoch from (now() - max(fecha_hora))) / 3600 as horas_desde_ultima
      from produccion_mapeada
      group by telar_n
      union all
      select 'partes_telar',
             n_telar,
             count(*)::int,
             count(distinct n_bloque)::int,
             min(fecha_hora),
             max(fecha_hora),
             extract(epoch from (now() - max(fecha_hora))) / 3600
      from parte_trabajo_mapeada
      group by n_telar
      union all
      select 'disco_puente',
             disco_puente_n,
             count(*)::int,
             count(distinct n_bloque)::int,
             min(fecha_hora),
             max(fecha_hora),
             extract(epoch from (now() - max(fecha_hora))) / 3600
      from parte_discopuente_mapeada
      group by disco_puente_n
      order by fuente, maquina nulls last
    `,
  },
  {
    name: '03_codigos_maquina_invalidos',
    sql: `
      select 'produccion_mapeada.telar_n' as campo,
             coalesce(telar_n, '<NULL>') as valor,
             count(*)::int as filas,
             count(distinct n_bloque)::int as pm_distintos,
             min(fecha_hora) as primera,
             max(fecha_hora) as ultima
      from produccion_mapeada
      where telar_n is null or telar_n !~ '^[1-4]$'
      group by telar_n
      union all
      select 'parte_trabajo_mapeada.n_telar',
             coalesce(n_telar, '<NULL>'),
             count(*)::int,
             count(distinct n_bloque)::int,
             min(fecha_hora),
             max(fecha_hora)
      from parte_trabajo_mapeada
      where n_telar is null or n_telar !~ '^[1-4]$'
      group by n_telar
      union all
      select 'parte_discopuente_mapeada.disco_puente_n',
             coalesce(disco_puente_n, '<NULL>'),
             count(*)::int,
             count(distinct n_bloque)::int,
             min(fecha_hora),
             max(fecha_hora)
      from parte_discopuente_mapeada
      where disco_puente_n is null or disco_puente_n !~ '^\\d+$'
      group by disco_puente_n
      order by campo, filas desc
    `,
  },
  {
    name: '04_fechas_anomalas_resumen',
    sql: `
      select 'produccion_mapeada' as tabla,
             count(*) filter (where fecha_hora > now())::int as futuras,
             count(*) filter (where fecha_hora < timestamp '2024-01-01')::int as demasiado_antiguas,
             count(*) filter (where fecha_hora is null)::int as nulas,
             count(*) filter (where create_date is not null and fecha_hora is not null and abs(extract(epoch from (fecha_hora - create_date))) > 900)::int as separacion_create_gt_15m,
             min(fecha_hora) as min_fecha,
             max(fecha_hora) as max_fecha
      from produccion_mapeada
      union all
      select 'parte_trabajo_mapeada',
             count(*) filter (where fecha_hora > now())::int,
             count(*) filter (where fecha_hora < timestamp '2024-01-01')::int,
             count(*) filter (where fecha_hora is null)::int,
             count(*) filter (where create_date is not null and fecha_hora is not null and abs(extract(epoch from (fecha_hora - create_date))) > 900)::int,
             min(fecha_hora),
             max(fecha_hora)
      from parte_trabajo_mapeada
      union all
      select 'parte_discopuente_mapeada',
             count(*) filter (where fecha_hora > now())::int,
             count(*) filter (where fecha_hora < timestamp '2024-01-01')::int,
             count(*) filter (where fecha_hora is null)::int,
             count(*) filter (where create_date is not null and fecha_hora is not null and abs(extract(epoch from (fecha_hora - create_date))) > 900)::int,
             min(fecha_hora),
             max(fecha_hora)
      from parte_discopuente_mapeada
    `,
  },
  {
    name: '04b_fechas_futuras_ejemplos',
    sql: `
      select 'parte_trabajo_mapeada' as tabla, id, n_telar as maquina, n_bloque, material, operacion,
             fecha_hora, create_date
      from parte_trabajo_mapeada
      where fecha_hora > now()
      union all
      select 'parte_discopuente_mapeada', id, disco_puente_n, n_bloque, material, operacion,
             fecha_hora, create_date
      from parte_discopuente_mapeada
      where fecha_hora > now()
      order by fecha_hora desc
      limit 100
    `,
  },
  {
    name: '05_material_produccion_por_telar',
    sql: `
      select telar_n,
             count(*)::int as filas,
             count(distinct material)::int as materiales_distintos,
             array_agg(distinct material order by material) filter (where material is not null) as materiales,
             count(distinct n_bloque)::int as pm_distintos,
             min(fecha_hora) as primera,
             max(fecha_hora) as ultima
      from produccion_mapeada
      group by telar_n
      order by telar_n
    `,
  },
  {
    name: '06_mismatch_material_produccion_vs_partes',
    sql: `
      with prod as (
        select telar_n::int as telar,
               n_bloque as pm,
               array_agg(distinct material order by material) filter (where material is not null) as materiales_produccion,
               count(*)::int as filas_produccion,
               min(fecha_hora) as prod_primera,
               max(fecha_hora) as prod_ultima
        from produccion_mapeada
        where telar_n ~ '^[1-4]$' and n_bloque is not null
        group by telar_n::int, n_bloque
      ),
      partes as (
        select n_telar::int as telar,
               n_bloque as pm,
               array_agg(distinct material order by material) filter (where material is not null) as materiales_partes,
               count(*)::int as filas_partes,
               min(fecha_hora) as parte_primera,
               max(fecha_hora) as parte_ultima
        from parte_trabajo_mapeada
        where n_telar ~ '^[1-4]$' and n_bloque is not null
        group by n_telar::int, n_bloque
      )
      select p.telar, p.pm,
             p.materiales_produccion,
             t.materiales_partes,
             p.filas_produccion,
             t.filas_partes,
             p.prod_primera,
             p.prod_ultima,
             t.parte_primera,
             t.parte_ultima
      from prod p
      join partes t on t.telar = p.telar and t.pm = p.pm
      where coalesce(p.materiales_produccion::text, '{}') <> coalesce(t.materiales_partes::text, '{}')
      order by greatest(p.prod_ultima, t.parte_ultima) desc nulls last
      limit 200
    `,
  },
  {
    name: '07_mismatch_medidas_produccion_vs_partes',
    sql: `
      with prod as (
        select telar_n::int as telar,
               n_bloque as pm,
               array_agg(distinct concat_ws('x',
                 round(coalesce(largo, 0)::numeric, 2),
                 round(coalesce(alto, 0)::numeric, 2),
                 round(coalesce(grueso, 0)::numeric, 2)
               ) order by concat_ws('x',
                 round(coalesce(largo, 0)::numeric, 2),
                 round(coalesce(alto, 0)::numeric, 2),
                 round(coalesce(grueso, 0)::numeric, 2)
               )) as dims_produccion,
               count(*)::int as filas_produccion,
               max(fecha_hora) as prod_ultima
        from produccion_mapeada
        where telar_n ~ '^[1-4]$' and n_bloque is not null
        group by telar_n::int, n_bloque
      ),
      partes as (
        select n_telar::int as telar,
               n_bloque as pm,
               array_agg(distinct concat_ws('x',
                 round(coalesce(largo, 0)::numeric, 2),
                 round(coalesce(alto, 0)::numeric, 2),
                 round(coalesce(grueso, 0)::numeric, 2)
               ) order by concat_ws('x',
                 round(coalesce(largo, 0)::numeric, 2),
                 round(coalesce(alto, 0)::numeric, 2),
                 round(coalesce(grueso, 0)::numeric, 2)
               )) as dims_partes,
               count(*)::int as filas_partes,
               max(fecha_hora) as parte_ultima
        from parte_trabajo_mapeada
        where n_telar ~ '^[1-4]$' and n_bloque is not null
        group by n_telar::int, n_bloque
      )
      select p.telar, p.pm, p.dims_produccion, t.dims_partes,
             p.filas_produccion, t.filas_partes, p.prod_ultima, t.parte_ultima
      from prod p
      join partes t on t.telar = p.telar and t.pm = p.pm
      where p.dims_produccion::text <> t.dims_partes::text
      order by greatest(p.prod_ultima, t.parte_ultima) desc nulls last
      limit 200
    `,
  },
  {
    name: '08_pm_en_varias_fuentes',
    sql: `
      with stock_onhand as (
        select nullif(regexp_replace(sl.name, '\\D', '', 'g'), '')::int as pm,
               count(*)::int as filas,
               min(sl.create_date) as primera,
               max(sl.write_date) as ultima
        from stock_lot sl
        where sl.type_product_lot in ('block', 'othermaterial')
          and nullif(regexp_replace(sl.name, '\\D', '', 'g'), '') is not null
          and exists (
            select 1
            from stock_quant sq
            join stock_location loc on loc.id = sq.location_id
            where sq.lot_id = sl.id
              and sq.quantity > 0
              and loc.usage = 'internal'
          )
        group by pm
      ),
      fuentes as (
        select n_bloque as pm, 'produccion_telar' as fuente, count(*)::int as filas, min(fecha_hora) as primera, max(fecha_hora) as ultima
        from produccion_mapeada where n_bloque is not null group by n_bloque
        union all
        select n_bloque, 'partes_telar', count(*)::int, min(fecha_hora), max(fecha_hora)
        from parte_trabajo_mapeada where n_bloque is not null group by n_bloque
        union all
        select n_bloque, 'disco_puente', count(*)::int, min(fecha_hora), max(fecha_hora)
        from parte_discopuente_mapeada where n_bloque is not null group by n_bloque
        union all
        select nullif(regexp_replace(name, '\\D', '', 'g'), '')::int, 'lot_block_creation', count(*)::int, min(create_date), max(write_date)
        from lot_block_creation
        where nullif(regexp_replace(coalesce(name,''), '\\D', '', 'g'), '') is not null
        group by nullif(regexp_replace(name, '\\D', '', 'g'), '')::int
        union all
        select n_bloque, 'bloque_maquinas', count(*)::int, min(create_date), max(write_date)
        from bloque_maquinas where n_bloque is not null group by n_bloque
        union all
        select pm, 'stock_onhand_bloques', filas, primera, ultima
        from stock_onhand
      )
      select pm,
             array_agg(fuente order by fuente) as fuentes,
             sum(filas)::int as filas_total,
             min(primera) as primera,
             max(ultima) as ultima
      from fuentes
      group by pm
      having count(distinct fuente) > 1
      order by max(ultima) desc nulls last, pm desc
      limit 300
    `,
  },
  {
    name: '09_stock_onhand_con_actividad_maquina',
    sql: `
      with stock_onhand as (
        select sl.id as stock_lot_id,
               nullif(regexp_replace(sl.name, '\\D', '', 'g'), '')::int as pm,
               sl.name,
               sl.product_id,
               sl.type_product_lot,
               sl.largo_supplier,
               sl.alto_supplier,
               sl.grueso_supplier,
               sl.largo_mrp,
               sl.alto_mrp,
               sl.grueso_mrp,
               sl.create_date,
               sl.write_date
        from stock_lot sl
        where sl.type_product_lot in ('block', 'othermaterial')
          and nullif(regexp_replace(sl.name, '\\D', '', 'g'), '') is not null
          and exists (
            select 1
            from stock_quant sq
            join stock_location loc on loc.id = sq.location_id
            where sq.lot_id = sl.id
              and sq.quantity > 0
              and loc.usage = 'internal'
          )
      ),
      prod as (
        select n_bloque as pm, array_agg(distinct telar_n order by telar_n) as telares,
               max(fecha_hora) as ultima_produccion, count(*)::int as filas_produccion
        from produccion_mapeada where n_bloque is not null group by n_bloque
      ),
      partes as (
        select n_bloque as pm, array_agg(distinct n_telar order by n_telar) as telares_partes,
               max(fecha_hora) as ultimo_parte, count(*)::int as filas_partes
        from parte_trabajo_mapeada where n_bloque is not null group by n_bloque
      ),
      disco as (
        select n_bloque as pm, array_agg(distinct disco_puente_n order by disco_puente_n) as discos,
               max(fecha_hora) as ultimo_disco, count(*)::int as filas_disco
        from parte_discopuente_mapeada where n_bloque is not null group by n_bloque
      )
      select s.pm, s.name, s.stock_lot_id, s.product_id, s.type_product_lot,
             concat_ws('x', s.largo_supplier, s.alto_supplier, s.grueso_supplier) as medida_stock_supplier,
             concat_ws('x', s.largo_mrp, s.alto_mrp, s.grueso_mrp) as medida_stock_mrp,
             s.create_date as alta_stock_lot,
             p.telares, p.ultima_produccion, p.filas_produccion,
             t.telares_partes, t.ultimo_parte, t.filas_partes,
             d.discos, d.ultimo_disco, d.filas_disco
      from stock_onhand s
      left join prod p on p.pm = s.pm
      left join partes t on t.pm = s.pm
      left join disco d on d.pm = s.pm
      where p.pm is not null or t.pm is not null or d.pm is not null
      order by greatest(p.ultima_produccion, t.ultimo_parte, d.ultimo_disco) desc nulls last
      limit 200
    `,
  },
  {
    name: '10_mismatches_id_bloque_y_flags',
    sql: `
      with trabajo as (
        select 'parte_trabajo_mapeada' as tabla,
               count(*)::int as filas,
               count(*) filter (where p.id_bloque is not null and bi.id is null)::int as id_bloque_sin_registro,
               count(*) filter (where p.id_bloque is not null and bi.id is not null and bi.n_bloque is distinct from p.n_bloque)::int as id_bloque_apunta_a_otro_numero,
               count(*) filter (where p.bloque_existe = false and bn.n_bloque is not null)::int as flag_false_pero_bloque_maquinas_conoce,
               count(*) filter (where p.bloque_existe = true and bn.n_bloque is null)::int as flag_true_pero_bloque_maquinas_no_conoce,
               count(*) filter (where p.n_bloque is null)::int as filas_sin_pm
        from parte_trabajo_mapeada p
        left join bloque_maquinas bi on bi.id = p.id_bloque
        left join bloque_maquinas bn on bn.n_bloque = p.n_bloque
      ),
      disco as (
        select 'parte_discopuente_mapeada' as tabla,
               count(*)::int as filas,
               count(*) filter (where p.id_bloque is not null and bi.id is null)::int as id_bloque_sin_registro,
               count(*) filter (where p.id_bloque is not null and bi.id is not null and bi.n_bloque is distinct from p.n_bloque)::int as id_bloque_apunta_a_otro_numero,
               count(*) filter (where p.bloque_existe = false and bn.n_bloque is not null)::int as flag_false_pero_bloque_maquinas_conoce,
               count(*) filter (where p.bloque_existe = true and bn.n_bloque is null)::int as flag_true_pero_bloque_maquinas_no_conoce,
               count(*) filter (where p.n_bloque is null)::int as filas_sin_pm
        from parte_discopuente_mapeada p
        left join bloque_maquinas bi on bi.id = p.id_bloque
        left join bloque_maquinas bn on bn.n_bloque = p.n_bloque
      )
      select * from trabajo
      union all
      select * from disco
    `,
  },
  {
    name: '10b_mismatches_id_bloque_y_flags_ejemplos',
    sql: `
      select 'parte_trabajo_mapeada' as tabla,
             p.id, p.n_bloque, p.id_bloque, p.bloque_existe,
             bi.n_bloque as n_bloque_por_id,
             (bn.n_bloque is not null) as conocido_por_numero,
             p.fecha_hora
      from parte_trabajo_mapeada p
      left join bloque_maquinas bi on bi.id = p.id_bloque
      left join bloque_maquinas bn on bn.n_bloque = p.n_bloque
      where (p.id_bloque is not null and bi.id is null)
         or (p.id_bloque is not null and bi.id is not null and bi.n_bloque is distinct from p.n_bloque)
         or (p.bloque_existe = false and bn.n_bloque is not null)
         or (p.bloque_existe = true and bn.n_bloque is null)
      union all
      select 'parte_discopuente_mapeada',
             p.id, p.n_bloque, p.id_bloque, p.bloque_existe,
             bi.n_bloque,
             (bn.n_bloque is not null),
             p.fecha_hora
      from parte_discopuente_mapeada p
      left join bloque_maquinas bi on bi.id = p.id_bloque
      left join bloque_maquinas bn on bn.n_bloque = p.n_bloque
      where (p.id_bloque is not null and bi.id is null)
         or (p.id_bloque is not null and bi.id is not null and bi.n_bloque is distinct from p.n_bloque)
         or (p.bloque_existe = false and bn.n_bloque is not null)
         or (p.bloque_existe = true and bn.n_bloque is null)
      order by fecha_hora desc nulls last
      limit 200
    `,
  },
  {
    name: '11_cobertura_pm_por_maestros',
    sql: `
      with pm_fuente as (
        select 'produccion_mapeada' as fuente, n_bloque as pm
        from produccion_mapeada where n_bloque is not null
        union all
        select 'parte_trabajo_mapeada', n_bloque
        from parte_trabajo_mapeada where n_bloque is not null
        union all
        select 'parte_discopuente_mapeada', n_bloque
        from parte_discopuente_mapeada where n_bloque is not null
      ),
      stock_all as (
        select distinct nullif(regexp_replace(name, '\\D', '', 'g'), '')::int as pm
        from stock_lot
        where nullif(regexp_replace(name, '\\D', '', 'g'), '') is not null
      ),
      stock_onhand as (
        select distinct nullif(regexp_replace(sl.name, '\\D', '', 'g'), '')::int as pm
        from stock_lot sl
        where nullif(regexp_replace(sl.name, '\\D', '', 'g'), '') is not null
          and sl.type_product_lot in ('block', 'othermaterial')
          and exists (
            select 1
            from stock_quant sq
            join stock_location loc on loc.id = sq.location_id
            where sq.lot_id = sl.id
              and sq.quantity > 0
              and loc.usage = 'internal'
          )
      ),
      lbc as (
        select distinct nullif(regexp_replace(coalesce(name,''), '\\D', '', 'g'), '')::int as pm
        from lot_block_creation
        where nullif(regexp_replace(coalesce(name,''), '\\D', '', 'g'), '') is not null
      ),
      bm as (
        select distinct n_bloque as pm from bloque_maquinas where n_bloque is not null
      )
      select f.fuente,
             count(distinct f.pm)::int as pm_distintos,
             count(distinct f.pm) filter (where bm.pm is not null)::int as en_bloque_maquinas,
             count(distinct f.pm) filter (where lbc.pm is not null)::int as en_lot_block_creation,
             count(distinct f.pm) filter (where sa.pm is not null)::int as en_stock_lot_cualquier_tipo,
             count(distinct f.pm) filter (where so.pm is not null)::int as en_stock_lot_onhand_bloques,
             count(distinct f.pm) filter (where bm.pm is null and lbc.pm is null and sa.pm is null)::int as sin_maestro_detectado
      from pm_fuente f
      left join bm on bm.pm = f.pm
      left join lbc on lbc.pm = f.pm
      left join stock_all sa on sa.pm = f.pm
      left join stock_onhand so on so.pm = f.pm
      group by f.fuente
      order by f.fuente
    `,
  },
  {
    name: '12_lot_block_creation_vs_stock_lot_medidas',
    sql: `
      with lbc as (
        select nullif(regexp_replace(coalesce(name,''), '\\D', '', 'g'), '')::int as pm,
               count(*)::int as filas_lbc,
               array_agg(distinct concat_ws('x',
                 round(coalesce(largo_supplier, 0)::numeric, 3),
                 round(coalesce(alto_supplier, 0)::numeric, 3),
                 round(coalesce(grueso_supplier, 0)::numeric, 3)
               ) order by concat_ws('x',
                 round(coalesce(largo_supplier, 0)::numeric, 3),
                 round(coalesce(alto_supplier, 0)::numeric, 3),
                 round(coalesce(grueso_supplier, 0)::numeric, 3)
               )) as medidas_lbc_supplier,
               array_agg(distinct product_id order by product_id) filter (where product_id is not null) as productos_lbc
        from lot_block_creation
        where nullif(regexp_replace(coalesce(name,''), '\\D', '', 'g'), '') is not null
        group by pm
      ),
      stock as (
        select nullif(regexp_replace(coalesce(name,''), '\\D', '', 'g'), '')::int as pm,
               count(*)::int as filas_stock,
               array_agg(distinct concat_ws('x',
                 round(coalesce(largo_supplier, 0)::numeric, 3),
                 round(coalesce(alto_supplier, 0)::numeric, 3),
                 round(coalesce(grueso_supplier, 0)::numeric, 3)
               ) order by concat_ws('x',
                 round(coalesce(largo_supplier, 0)::numeric, 3),
                 round(coalesce(alto_supplier, 0)::numeric, 3),
                 round(coalesce(grueso_supplier, 0)::numeric, 3)
               )) as medidas_stock_supplier,
               array_agg(distinct product_id order by product_id) filter (where product_id is not null) as productos_stock,
               bool_or(type_product_lot in ('block','othermaterial')) as es_bloque_o_material
        from stock_lot
        where nullif(regexp_replace(coalesce(name,''), '\\D', '', 'g'), '') is not null
        group by pm
      )
      select l.pm, l.filas_lbc, s.filas_stock,
             l.productos_lbc, s.productos_stock,
             l.medidas_lbc_supplier, s.medidas_stock_supplier,
             s.es_bloque_o_material
      from lbc l
      join stock s on s.pm = l.pm
      where coalesce(l.medidas_lbc_supplier::text, '{}') <> coalesce(s.medidas_stock_supplier::text, '{}')
         or coalesce(l.productos_lbc::text, '{}') <> coalesce(s.productos_stock::text, '{}')
      order by l.pm desc
      limit 200
    `,
  },
  {
    name: '13_pm_reutilizados_o_periodos_largos',
    sql: `
      with prod as (
        select n_bloque as pm,
               array_agg(distinct telar_n order by telar_n) as telares,
               count(*)::int as filas,
               count(distinct date_trunc('month', fecha_hora))::int as meses_distintos,
               min(fecha_hora) as primera,
               max(fecha_hora) as ultima,
               extract(epoch from (max(fecha_hora) - min(fecha_hora))) / 86400 as dias_span
        from produccion_mapeada
        where n_bloque is not null and fecha_hora is not null
        group by n_bloque
      )
      select *
      from prod
      where dias_span > 60 or array_length(telares, 1) > 1
      order by dias_span desc nulls last, filas desc
      limit 200
    `,
  },
  {
    name: '14_solapes_pm_entre_telares',
    sql: `
      with prod as (
        select telar_n::int as telar,
               n_bloque as pm,
               min(fecha_hora) as primera,
               max(fecha_hora) as ultima,
               count(*)::int as filas
        from produccion_mapeada
        where telar_n ~ '^[1-4]$' and n_bloque is not null and fecha_hora is not null
        group by telar_n::int, n_bloque
      )
      select a.pm,
             a.telar as telar_a, a.primera as primera_a, a.ultima as ultima_a, a.filas as filas_a,
             b.telar as telar_b, b.primera as primera_b, b.ultima as ultima_b, b.filas as filas_b
      from prod a
      join prod b on b.pm = a.pm and b.telar > a.telar
      where a.primera <= b.ultima and b.primera <= a.ultima
      order by greatest(a.ultima, b.ultima) desc
      limit 200
    `,
  },
  {
    name: '15_calidad_produccion_resumen',
    sql: `
      select telar_n,
             count(*)::int as filas,
             count(*) filter (where n_bloque is null)::int as sin_pm,
             count(*) filter (where incidencia is null or incidencia not in ('0','1','2'))::int as incidencia_no_mapeada_por_backend,
             count(*) filter (where potencia < 0 or potencia > 76)::int as potencia_fuera_rango,
             count(*) filter (where potencia > 5 and abs(consumo - potencia * 2) > potencia * 2 * 0.35)::int as consumo_desacoplado,
             count(*) filter (where golpesxminuto <> 0 and (golpesxminuto < 700 or golpesxminuto > 1000))::int as golpes_fuera_rango,
             count(*) filter (where velocidad < 0 or velocidad > 310)::int as velocidad_fuera_rango,
             count(*) filter (where altura_actual > 2250)::int as altura_sobre_tope,
             min(fecha_hora) as primera,
             max(fecha_hora) as ultima
      from produccion_mapeada
      group by telar_n
      order by telar_n
    `,
  },
  {
    name: '16_incidencias_por_telar',
    sql: `
      select telar_n,
             coalesce(incidencia, '<NULL>') as incidencia,
             count(*)::int as filas,
             count(distinct n_bloque)::int as pm_distintos,
             min(fecha_hora) as primera,
             max(fecha_hora) as ultima
      from produccion_mapeada
      group by telar_n, incidencia
      order by telar_n, filas desc
    `,
  },
  {
    name: '17_partes_operacion_4_sin_produccion_real',
    sql: `
      select operacion,
             count(*)::int as filas,
             count(*) filter (where n_tablas is null or n_tablas <= 0)::int as sin_tablas_validas,
             count(*) filter (where metros_cuadrados_tablas is null or metros_cuadrados_tablas <= 0)::int as sin_m2_validos,
             count(*) filter (where n_paquete is null or n_paquete <= 0)::int as sin_paquete_valido,
             count(distinct n_bloque)::int as pm_distintos
      from parte_trabajo_mapeada
      group by operacion
      order by operacion nulls last
    `,
  },
  {
    name: '18_unidades_mixtas_tablas_partes',
    sql: `
      select 'parte_trabajo_mapeada' as tabla,
             count(*) filter (where largo_tablas is not null and largo_tablas > 10)::int as largo_tablas_parece_cm,
             count(*) filter (where largo_tablas is not null and largo_tablas > 0 and largo_tablas <= 10)::int as largo_tablas_parece_m,
             count(*) filter (where alto_tablas is not null and alto_tablas > 10)::int as alto_tablas_parece_cm,
             count(*) filter (where alto_tablas is not null and alto_tablas > 0 and alto_tablas <= 10)::int as alto_tablas_parece_m,
             count(*) filter (where grueso_tablas is not null and grueso_tablas > 0.5)::int as grueso_tablas_parece_cm,
             count(*) filter (where grueso_tablas is not null and grueso_tablas > 0 and grueso_tablas <= 0.5)::int as grueso_tablas_parece_m
      from parte_trabajo_mapeada
    `,
  },
  {
    name: '19_snapshot_actual_cruce',
    sql: `
      with latest_prod as (
        select distinct on (telar_n)
               telar_n, id, n_bloque, material, largo, alto, grueso, incidencia,
               potencia, velocidad, consumo, golpesxminuto, altura_actual,
               fecha_hora, create_date
        from produccion_mapeada
        where telar_n ~ '^[1-4]$'
        order by telar_n, fecha_hora desc nulls last, id desc
      ),
      latest_part as (
        select distinct on (n_telar, n_bloque)
               n_telar, n_bloque, material, operacion, n_tablas,
               metros_cuadrados_tablas, fecha_hora
        from parte_trabajo_mapeada
        where n_telar ~ '^[1-4]$' and n_bloque is not null
        order by n_telar, n_bloque, fecha_hora desc nulls last, id desc
      ),
      stock_onhand as (
        select distinct nullif(regexp_replace(sl.name, '\\D', '', 'g'), '')::int as pm
        from stock_lot sl
        where nullif(regexp_replace(sl.name, '\\D', '', 'g'), '') is not null
          and sl.type_product_lot in ('block', 'othermaterial')
          and exists (
            select 1
            from stock_quant sq
            join stock_location loc on loc.id = sq.location_id
            where sq.lot_id = sl.id
              and sq.quantity > 0
              and loc.usage = 'internal'
          )
      ),
      lbc as (
        select distinct nullif(regexp_replace(coalesce(name,''), '\\D', '', 'g'), '')::int as pm
        from lot_block_creation
        where nullif(regexp_replace(coalesce(name,''), '\\D', '', 'g'), '') is not null
      ),
      bm as (
        select distinct n_bloque as pm from bloque_maquinas where n_bloque is not null
      )
      select p.telar_n as telar,
             p.id as lectura_id,
             p.fecha_hora as ultima_lectura,
             extract(epoch from (now() - p.fecha_hora)) / 3600 as horas_antiguedad,
             p.n_bloque as pm,
             p.material as material_en_produccion,
             lp.material as material_ultimo_parte,
             lp.operacion as ultima_operacion_parte,
             lp.n_tablas,
             lp.metros_cuadrados_tablas,
             p.largo, p.alto, p.grueso,
             p.incidencia, p.potencia, p.velocidad, p.consumo, p.golpesxminuto, p.altura_actual,
             (so.pm is not null) as aparece_en_stock_onhand_bloques,
             (lbc.pm is not null) as aparece_en_lot_block_creation,
             (bm.pm is not null) as aparece_en_bloque_maquinas
      from latest_prod p
      left join latest_part lp on lp.n_telar = p.telar_n and lp.n_bloque = p.n_bloque
      left join stock_onhand so on so.pm = p.n_bloque
      left join lbc on lbc.pm = p.n_bloque
      left join bm on bm.pm = p.n_bloque
      order by p.telar_n
    `,
  },
  {
    name: '20_discopuente_eficiencias_y_fechas',
    sql: `
      select disco_puente_n,
             count(*)::int as filas,
             count(*) filter (where fecha_hora > now())::int as fechas_futuras,
             count(*) filter (where metro2_entrada is not null and metro2_salida is not null and metro2_salida > metro2_entrada * 1.05)::int as salida_m2_mayor_entrada_5pct,
             count(*) filter (where eficiencia_m2 is not null and (eficiencia_m2 < 0 or eficiencia_m2 > 1.05))::int as eficiencia_fuera_0_105,
             min(eficiencia_m2) as eficiencia_min,
             max(eficiencia_m2) as eficiencia_max,
             min(fecha_hora) as primera,
             max(fecha_hora) as ultima
      from parte_discopuente_mapeada
      group by disco_puente_n
      order by disco_puente_n
    `,
  },
];

function toCsv(rows) {
  if (rows.length === 0) {
    return '';
  }
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    if (v == null) return '';
    const s = Array.isArray(v) ? v.join('|') : String(v);
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(';'), ...rows.map((row) => cols.map((c) => esc(row[c])).join(';'))].join('\n');
}

await client.connect();
try {
  const results = {};
  for (const query of queries) {
    const res = await client.query(query.sql);
    results[query.name] = res.rows;
    await fs.writeFile(path.join(outDir, `${query.name}.csv`), toCsv(res.rows), 'utf8');
  }
  await fs.writeFile(
    path.join(outDir, 'auditoria_fabric_resultados.json'),
    JSON.stringify(results, null, 2),
    'utf8',
  );
  console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.length])), null, 2));
} finally {
  await client.end();
}
