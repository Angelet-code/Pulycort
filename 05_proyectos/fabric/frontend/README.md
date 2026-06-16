# Fabric — visor de producción de telares

> 📁 Parte **frontend** del proyecto [`fabric/`](../) · backend en [`../backend`](../backend) · portada y control de entrega en [`../README.md`](../README.md) y [`../VERIFICACION.md`](../VERIFICACION.md).

Visor **de solo lectura** de los 4 telares de Pulycort/INDASEL: qué corta cada máquina,
cuánto le queda, cuánto se ha producido y qué lecturas llegan corruptas del sistema antiguo.
Es la "sala de máquinas" que complementa a PulyTrack (pedidos/trazabilidad): aquí lo que
importa es el ciclo operativo del PM/lote — *colocación → aserrado → salida → paquetes*.

> **Estado actual: dos fuentes de datos con switch en caliente.** El interruptor
> **Demo | Real** de la barra superior alterna entre la simulación en memoria
> (`MockFabricApi`) y el backend real (`HttpFabricApi` → `fabric-backend`, NestJS + Prisma
> sobre la tabla `produccion_mapeada` de la BD de las máquinas). Toda la app habla con la
> fachada `FabricApi`; un conmutador (`conmutador-fabric-api.ts`) delega cada llamada según
> la fuente elegida y las vistas se refrescan solas. Ningún componente depende de la
> implementación.
>
> **Modo real y honestidad de datos (VERIFICACION.md):** los m², tablas y paquetes vienen
> de los **partes reales** de `parte_trabajo_mapeada` (operación '4'), cruzados con los
> PM/lotes por telar + `n_bloque`; donde falta el parte se usa la estimación
> `tablas ≈ grueso / 2,8 cm`, siempre etiquetada ("≈", "prev."). Los operarios se resuelven
> a nombre real (`hr_employee`). Lo que sigue sin fuente (merma, roturas de fleje,
> utilización) se muestra como **"—"**, no se estima. Los códigos de incidencia (`1`=marcha,
> `2`=paro) y de operación (`1`-`4`) están confirmados (Pulycort 2026-06-16); el resto de
> inferencias (`consumo` = amperios, unidades, códigos sin mapear) sigue documentado en el
> backend y pendiente de confirmación en `00_gestion/TAREAS.md`.

> **Regla PM/lote:** en telares, partes y producción, `n_bloque` se presenta como
> **PM/lote** mediante el campo derivado `pmLote`. Los campos antiguos (`bloque`,
> `nBloque`) siguen en el contrato por compatibilidad. "Bloque" queda reservado para
> inventario físico (`stock_lot`, stock real on-hand) o para nombres técnicos heredados.

## Arranque

```powershell
npm install
npm start          # dev server en http://127.0.0.1:4200
npm run build      # producción → dist/fabric
```

Puerto reservado en este repositorio: **4200** (PulyTrack usa 8001/5174/4174; quedan libres
5173/8000 para otras apps).

## Vistas

| Ruta | Qué responde |
|---|---|
| `/telares` | ¿Qué pasa AHORA en los 4 telares y cuánto les queda? Tarjetas con estado, material (círculo de color), avance del corte y ETA, golpes/potencia/descenso, sparkline de potencia y ticker de partes. Bajo los 4 telares, en la misma lista y como filas más, el resto de máquinas de la fábrica (catálogo de 19 del doc 08): mismo aspecto de tarjeta, sin lectura en vivo — el disco puente Gómez enlaza a sus partes reales y las demás (incluidos los discos puente Terzago y Cáñigo, todavía sin PLC) se marcan «sin integrar» (sin inventar estado). |
| `/telares/:id` | Detalle: **Corte en curso** (sección SVG a escala con el bastidor descendiendo y las tablas naciendo), doble medida proveedor/fábrica con merma, gráficos de jornada (altura con proyección de ETA, velocidad de descenso, potencia, golpes), KPIs (tablas previstas, disponibilidad de turno, vigía del fleje **(solo Demo)**, latencia de datos, MTBF), Gantt de jornada, lecturas y ciclos anteriores. |
| `/partes` | **Partes de producción**: el registro "en crudo" de lecturas de los telares con las columnas de la tabla real `produccion_mapeada` — fecha, telar, PM/lote (`n_bloque`), material, largo/alto/grueso, potencia, velocidad, consumo, golpes/min, altura e incidencia. En fuente real pagina sobre la BD (107k+ filas); en demo, sobre la simulación con la misma forma. Filtros por telar, material y rango de fechas (también clicando el telar o el material de cualquier fila), y paginación. |
| `/partes-trabajo` | **Partes de trabajo**: los partes de operario de la tabla real `parte_trabajo_mapeada` (8,8k filas) — operación, PM/lote (`n_bloque`), material, medidas, m³ y, en los partes de paquetes (operación `4`, la única deducible de los datos), paquetes/tablas/medidas de tabla/m² reales. Filtros por telar, operación, material y fechas, con clic-para-filtrar. Códigos de operación/acción pendientes de la tabla de significados de TotWare. |
| `/partes/disco-puente` | **Partes del disco puente**: los partes de la máquina puente (recorta las tablas que salen del telar) de la tabla real `parte_discopuente_mapeada` (12,8k filas) — disco puente, operación, PM/lote (`n_bloque`), material, acabado, medidas fuente, paquetes/tablas y **m² de entrada/salida con su eficiencia** (ya calculados por el mapeador). Todos los partes son del **disco puente Gómez** (el único con PLC; Terzago y Cáñigo sin integrar); `disco_puente_n` es un flag de estado, no el número de máquina. Filtros por operación, material y fechas, con clic-para-filtrar; las lecturas con fecha imposible se marcan ⚠. Códigos de operación/acabado pendientes de la tabla de significados de TotWare. |
| `/partes/reforzadora` | **Partes de la reforzadora**: los partes de la máquina que refuerza las tablas (malla + resina) de la tabla real `reforzadora_mapeada` (42,7k filas) — reforzadora, acabado, PM/lote (`n_bloque`), material, n.º de tablas, medidas de tabla, **m² reforzados** (derivado en backend = n_tablas × largo × alto) y evento. Filtros por reforzadora, acabado, material y fechas, con clic-para-filtrar. `n_reforzadora` solo trae `1` (no separa REFORZADORA 1/2 SEI); acabado/eventos y la unidad de las medidas, pendientes de TotWare; `consumo` no se pinta (unidad sin confirmar). |
| `/salud/cobertura` | **Cobertura de máquinas**: el catálogo de las 19 máquinas de planta (M3 + sala M2) con su estado de integración en Fabric (integrada / parcial / pendiente), la tabla de datos que la alimenta y el volumen real (filas, lotes, última actividad). Lo no conectado va como pendiente, sin inventar. |
| `/produccion` | m² de tablas, m³ aserrados, **rendimiento m²/m³**, merma media, m² por periodo y telar, producción por material, paros por telar, jornada Gantt, roturas de fleje y ciclos completados. Periodos: hoy / 7 días / 30 días / 90 días / 1 año / histórico; el gráfico de barras se agrupa por **día** (hoy, 7 días), **semana** (30 y 90 días) o **mes** (1 año, histórico) según el periodo (lo decide el backend en `granularidad`). El rendimiento es un **agregado de PM/lotes con parte real** (la nota dice de cuántos sale y cuántos tienen medidas dudosas; "—" si la mayoría lo es) porque las medidas de consola llegan heredadas del lote anterior y el m³ lote a lote es ruido. |
| `/partes/bloques` | **Inventario de bloques**: los bloques que realmente hay ahora en el almacén, del stock REAL de Odoo (lote `stock_lot` con existencias on-hand vía `stock_quant` en ubicación interna) — fecha de alta, nº de bloque, material (nombre real de `product_template` por `stock_lot.product_id`), **tipo** (`type_product_lot`: bloque/otro material), **ubicación** (`stock_location`), **medida del proveedor frente a medida de fábrica** (mrp; "—" mientras no se mida, lo normal on-hand) con m³ y merma derivados. Búsqueda por nº de bloque, filtros por material y fechas, con clic-para-filtrar. |
| `/partes/tablas` | **Inventario de tablas**: vista en preparación (aún no hay una fuente de tablas cortadas conectada a Fabric). |
| `/inventario` | **Mapa de existencias** (treemap tipo WinDirStat): cada material es un rectángulo proporcional a su m³ en existencias (Bloques, del stock real `stock_lot` on-hand vía `stock_quant`); Tablas y Losas `pendiente` hasta conectar su fuente. Clic en un material para desglosarlo. |
| `/datos` | **Salud del dato**: % de lecturas fiables por telar (7 días), **apartado de Fuentes** (cada tabla que alimenta Fabric —`produccion_mapeada`, `parte_trabajo_mapeada`, `lot_block_creation`— con su origen, qué aporta y cómo está funcionando: nº de registros, última actualización y un veredicto derivado del dato) y cuarentena con el motivo exacto de cada descarte. Que el Telar 2 salga al ~100 % y el 4 no es información, no un error: replica la asimetría del sistema real. |
| `/sistema` | **Salud del sistema**: registro curado de los problemas detectados en máquinas, base de datos, cálculos y flujo de producción, con la evidencia, la solución recomendada y de quién depende cada arreglo (TotWare, producción, mantenimiento, Odoo, Fabric). Se mantiene a mano junto a `00_gestion/TAREAS.md`. |

Switch **Demo | Real** en la barra superior: cambia la fuente de datos en caliente (se
recuerda en `localStorage`). El botón **×60** (solo visible en demo) acelera el reloj
virtual (1 min real = 1 h de fábrica) para ver avanzar los cortes; al pasar a real el reloj
vuelve a ×1. El modo real requiere el backend arrancado (`fabric-backend`, puerto 3000).

## Unidades (siempre visibles en la UI)

- Medidas de telar/máquina (PM/lote en `produccion_mapeada`): **cm** (largo × alto ×
  grueso); son atributos de verificación del corte, no identificadores.
- Medidas de inventario físico (`stock_lot`, stock real on-hand): **metros** (m); cada bloque
  lleva **dos juegos** — medida del proveedor y medida real de fábrica — con m³ y merma derivados.
- Altura del bastidor: **mm** (desciende hasta ~0 al terminar el corte).
- Velocidad de descenso: **mm/h** — verificada contra el Telar 2 del sistema antiguo
  (con consigna 150 la altura baja ~534 mm en 3,6 h).
- Golpes: **golpes/min** (810–950 en marcha) · Potencia: **kW** (máx. 76) ·
  Amperios: **A** (~2× potencia).
- Tablas: espesor **2 cm** + kerf del fleje **8 mm** → `tablas ≈ grueso / 2,8 cm`.
- Producción: **m²** de tablas, **m³** de bloque, rendimiento **m²/m³**.

## Arquitectura

```
src/app/
├── core/
│   ├── models.ts          # dominio: lecturas, eventos, ciclos, snapshot, estadísticas
│   ├── materiales.ts      # catálogo de materiales con color (círculo de material)
│   ├── etiquetas.ts       # textos de incidencias/eventos/turnos
│   ├── format.ts          # números 1.234,56, fechas, duraciones, ETA (es-ES)
│   ├── reloj.service.ts   # reloj virtual (modo demo ×60)
│   ├── validador.ts       # reglas de calidad: fechas imposibles, saltos de altura...
│   ├── fabric-api.ts      # fachada abstracta (firma compartida demo/real)
│   ├── fuente-datos.service.ts  # señal demo/real del switch (persistida)
│   ├── http-fabric-api.ts       # implementación real contra fabric-backend (:3000)
│   ├── conmutador-fabric-api.ts # delega cada llamada según la fuente activa
│   └── mock/
│       ├── simulacion.ts      # mundo determinista: 31 días de histórico + 4 de futuro
│       └── mock-fabric-api.ts # "servidor": filtra lo emitido, valida y agrega
├── shared/                # componentes reutilizables (sin librerías de gráficos)
│   ├── material-dot, estado-chip, metrica, kpi-tile, data-badge
│   ├── sparkline, grafico-lineas, grafico-barras, barras-horizontales
│   ├── bloque-vivo, linea-jornada, barra-progreso
│   └── ticker-eventos, selector-periodo
└── vistas/
    ├── sala/        # /telares (fila-maquina en vivo + fila-maquina-catalogo para el resto de la nave)
    ├── telar/       # /telares/:id
    ├── partes/      # /partes (lecturas en crudo de produccion_mapeada)
    ├── partes-trabajo/ # /partes-trabajo (partes de operario)
    ├── partes-disco-puente/ # /partes/disco-puente (partes del disco puente)
    ├── partes-reforzadora/ # /partes/reforzadora (partes de la reforzadora de tablas)
    ├── produccion/  # /produccion
    ├── inventario/  # /partes/bloques (altas de bloque en almacén)
    ├── inventario-mapa/ # /inventario (mapa de existencias por material, treemap)
    ├── cobertura-maquinas/ # /salud/cobertura (mapa de integración de las 19 máquinas)
    ├── datos/       # /datos
    └── salud-sistema/ # /sistema (registro curado de problemas del sistema)
```

Angular 19, componentes standalone con signals, rutas lazy, sin dependencias de gráficos
(SVG propio). Todos los números con `font-variant-numeric: tabular-nums`.

### El mock se comporta como el servidor real

`simulacion.ts` genera una línea temporal determinista (seed fijo) anclada a la hora real:
ciclos de PM/lote encadenados con paros y roturas de fleje, lecturas cada 10 min con física
coherente (la altura solo baja en marcha) y partes de operario. `MockFabricApi` responde a
cada llamada filtrando "lo ya emitido" según el reloj virtual, con latencia HTTP simulada.

**Calidad de datos**: los telares 1, 3 y 4 corrompen un 3/5/8 % de sus lecturas (fechas en
2014/2099, incidencia "Sin nombre", saltos de altura imposibles, amperios desacoplados...),
el 2 emite limpio — como en el sistema real. Cada lectura lleva `fechaHora` (declarada por
la máquina, puede venir rota) y `recibidaEn` (sello del servidor, siempre fiable). El
validador marca las sospechosas; se **excluyen de todos los KPIs** y se enseñan en `/datos`
con su motivo. Nunca se ocultan ni rompen una vista.

## La API real (fabric-backend)

El backend (**fabric-backend**) vive en `../backend` (NestJS + Prisma 7, puerto **3000**). El módulo
`fabric` expone los mismos 5 endpoints que la fachada (`/api/planta/snapshot`,
`/api/telares/:id`, `/api/estadisticas?rango=`, `/api/salud-datos`, `/api/partes`) más
`/produccion-mapeada` (lecturas crudas paginadas), `/partes-trabajo` (partes de operario),
`/partes-disco-puente` (partes de `parte_discopuente_mapeada`), `/partes-reforzadora` (partes de
`reforzadora_mapeada`), `/bloques` (inventario de bloques en existencias: `stock_lot` on-hand vía
`stock_quant`) y `/cobertura-maquinas` (catálogo de las 19 máquinas con su estado de integración).
`PrismaFabricRepository` deriva todo
desde `produccion_mapeada`: estado por mapeo de incidencias, duraciones por **diferencia
de timestamps** (no lecturas × 10 min), ciclos de PM/lote por tramos del mismo `n_bloque`,
y validador de calidad portado del frontend. Respuestas cacheadas 20–60 s para que el
polling de la UI no castigue el Postgres del cliente.

```powershell
# desde 05_proyectos/fabric/backend
npm run start:dev    # http://127.0.0.1:3000 (necesita .env con DATABASE_URL)
```

## ⚠️ Antes de entregar: verificación de datos

Antes de entregar la app a la empresa, **ningún valor puede ser estimado o supuesto**: en
modo real lo no calculable se muestra como "—". La lista de control completa —cada cifra
que muestra Fabric, de dónde sale y qué falta confirmar— está en
[`VERIFICACION.md`](../VERIFICACION.md). Los códigos de incidencia (`1`=marcha, `2`=paro)
están confirmados (Pulycort 2026-06-16); el resto de inferencias del modo real (`consumo` =
amperios, unidades, códigos sin mapear) sigue pendiente de confirmación en
`00_gestion/TAREAS.md`. No se entrega hasta que ninguna fila quede pendiente.
