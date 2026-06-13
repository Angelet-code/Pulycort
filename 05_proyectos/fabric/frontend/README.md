# Fabric — visor de producción de telares

> 📁 Parte **frontend** del proyecto [`fabric/`](../) · backend en [`../backend`](../backend) · portada y control de entrega en [`../README.md`](../README.md) y [`../VERIFICACION.md`](../VERIFICACION.md).

Visor **de solo lectura** de los 4 telares de Pulycort/INDASEL: qué corta cada máquina,
cuánto le queda, cuánto se ha producido y qué lecturas llegan corruptas del sistema antiguo.
Es la "sala de máquinas" que complementa a PulyTrack (pedidos/trazabilidad): aquí lo que
importa es el ciclo físico del bloque — *colocación → aserrado → salida → paquetes*.

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
> bloques por telar + nº de bloque; donde falta el parte se usa la estimación
> `tablas ≈ grueso / 2,8 cm`, siempre etiquetada ("≈", "prev."). Los operarios se resuelven
> a nombre real (`hr_employee`). Lo que sigue sin fuente (merma, roturas de fleje,
> utilización) se muestra como **"—"**, no se estima. Las inferencias aplicadas (códigos de
> incidencia y de operación, `consumo` = amperios, unidades) están documentadas en el
> backend y pendientes de confirmación en `00_gestion/TAREAS.md`.

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
| `/telares` | ¿Qué pasa AHORA en los 4 telares y cuánto les queda? Tarjetas con estado, material (círculo de color), avance del corte y ETA, golpes/potencia/descenso, sparkline de potencia y ticker de partes. |
| `/telares/:id` | Detalle: **Bloque Vivo** (sección SVG a escala con el bastidor descendiendo y las tablas naciendo), doble medida proveedor/fábrica con merma, gráficos de jornada (altura con proyección de ETA, potencia, golpes), KPIs (tablas previstas, disponibilidad de turno, vigía del fleje **(solo Demo)**, latencia de datos, MTBF), Gantt de jornada, lecturas y ciclos anteriores. |
| `/partes` | **Partes de producción**: el registro "en crudo" de lecturas de los telares con las columnas de la tabla real `produccion_mapeada` — fecha, telar, bloque, material, largo/alto/grueso, potencia, velocidad, consumo, golpes/min, altura e incidencia. En fuente real pagina sobre la BD (107k+ filas); en demo, sobre la simulación con la misma forma. Filtros por telar, material y rango de fechas (también clicando el telar o el material de cualquier fila), y paginación. |
| `/partes-trabajo` | **Partes de trabajo**: los partes de operario de la tabla real `parte_trabajo_mapeada` (8,8k filas) — operación, bloque, material, medidas, m³ y, en los partes de paquetes (operación `4`, la única deducible de los datos), paquetes/tablas/medidas de tabla/m² reales. Filtros por telar, operación, material y fechas, con clic-para-filtrar. Códigos de operación/acción pendientes de la tabla de significados de TotWare. |
| `/produccion` | m² de tablas, m³ aserrados, **rendimiento m²/m³**, merma media, m²/día por telar, producción por material, paros por telar, jornada Gantt, roturas de fleje y ciclos completados. Periodos: hoy / 7 días / 30 días. El rendimiento es un **agregado de bloques con parte real** (la nota dice de cuántos sale y cuántos tienen medidas dudosas; "—" si la mayoría lo es) porque las medidas de consola llegan heredadas del bloque anterior y el m³ bloque a bloque es ruido. |
| `/inventario` | **Inventario de bloques**: las altas de bloque en almacén de la tabla real `lot_block_creation` de Odoo — fecha de alta, nº de bloque/ref., material (`product_id_tmpl`), proveedor, **medida del proveedor frente a medida de fábrica** (mrp; "—" mientras no se mida) con m³ y merma derivados, y estado de entrada/lote. Búsqueda por nº/ref., filtros por material, proveedor y fechas, con clic-para-filtrar. Unidades de las medidas y nombres de proveedor pendientes de confirmar. |
| `/datos` | **Salud del dato**: % de lecturas fiables por telar (7 días) y cuarentena con el motivo exacto de cada descarte. Que el Telar 2 salga al ~100 % y el 4 no es información, no un error: replica la asimetría del sistema real. |
| `/sistema` | **Salud del sistema**: registro curado de los problemas detectados en máquinas, base de datos, cálculos y flujo de producción, con la evidencia, la solución recomendada y de quién depende cada arreglo (TotWare, producción, mantenimiento, Odoo, Fabric). Se mantiene a mano junto a `00_gestion/TAREAS.md`. |

Switch **Demo | Real** en la barra superior: cambia la fuente de datos en caliente (se
recuerda en `localStorage`). El botón **×60** (solo visible en demo) acelera el reloj
virtual (1 min real = 1 h de fábrica) para ver avanzar los cortes; al pasar a real el reloj
vuelve a ×1. El modo real requiere el backend arrancado (`fabric-backend`, puerto 3000).

## Unidades (siempre visibles en la UI)

- Medidas de bloque: **cm** (largo × alto × grueso); cada bloque lleva **dos juegos**:
  medida del proveedor y medida real de fábrica.
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
    ├── sala/        # /telares (+ tarjeta-telar)
    ├── telar/       # /telares/:id
    ├── partes/      # /partes (lecturas en crudo de produccion_mapeada)
    ├── partes-trabajo/ # /partes-trabajo (partes de operario)
    ├── produccion/  # /produccion
    ├── inventario/  # /inventario (altas de bloque en almacén)
    ├── datos/       # /datos
    └── salud-sistema/ # /sistema (registro curado de problemas del sistema)
```

Angular 19, componentes standalone con signals, rutas lazy, sin dependencias de gráficos
(SVG propio). Todos los números con `font-variant-numeric: tabular-nums`.

### El mock se comporta como el servidor real

`simulacion.ts` genera una línea temporal determinista (seed fijo) anclada a la hora real:
ciclos de bloque encadenados con paros y roturas de fleje, lecturas cada 10 min con física
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
`/produccion-mapeada` (lecturas crudas paginadas), `/partes-trabajo` (partes de operario)
y `/bloques` (inventario de `lot_block_creation`). `PrismaFabricRepository` deriva todo
desde `produccion_mapeada`: estado por mapeo de incidencias, duraciones por **diferencia
de timestamps** (no lecturas × 10 min), ciclos de bloque por tramos del mismo `n_bloque`,
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
[`VERIFICACION.md`](../VERIFICACION.md), y las inferencias aplicadas al modo real (códigos
de incidencia, `consumo` = amperios, unidades) están pendientes de confirmación en
`00_gestion/TAREAS.md`. No se entrega hasta que ninguna fila quede pendiente.
