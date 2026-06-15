# Fabric — visor de producción de telares

App **core** de Pulycort / INDASEL: visor de **solo lectura** de los 4 telares (corte de
PM/lotes de piedra en tablas). Qué corta cada máquina, cuánto le queda, cuánto se ha
producido y qué lecturas llegan corruptas del sistema antiguo. Es la "sala de máquinas"
que complementa a **PulyTrack** (pedidos/trazabilidad).

Promovida a proyecto propio en `05_proyectos/` por ser una app central; antes vivía dentro
de `pulycort_odoo_maquinas/05_app/`.

## Estructura

```
fabric/
├── frontend/        # Angular 19 (standalone + signals, SVG propio). Dev en :4200
├── backend/         # NestJS + Prisma 7 sobre produccion_mapeada. API en :3000
└── VERIFICACION.md  # control de entrega: cada cifra, su origen y qué falta confirmar
```

- **frontend/** — la app que ve el usuario. Detalle completo (vistas, arquitectura,
  calidad de datos) en [`frontend/README.md`](./frontend/README.md).
- **backend/** — la API real. `PrismaFabricRepository` deriva todo desde la tabla real
  `produccion_mapeada` y devuelve `null` / "—" para lo que la tabla no contiene
  (no inventa). Ver [`backend/README.md`](./backend/README.md).

## Regla PM/lote

**PM / lote es la matrícula operativa; bloque físico solo cuando la fuente lo identifica
como tal.** Fabric sigue leyendo la columna fuente heredada `n_bloque`, pero la API añade
`pmLote` y la UI lo presenta como PM/lote en telares, partes y producción. Los campos
antiguos (`bloque`, `nBloque`) se conservan por compatibilidad.

No se crean sub-bloques (`PM47177-01`, etc.) ni se usa el tamaño como identificador. Si dos
bloques físicos comparten el mismo PM/lote y la fuente no los diferencia, los cálculos de
rendimiento se interpretan a nivel PM/lote. Las medidas son atributos/verificación, no una
matrícula.

En disco puente, `pm_losa` se expone como `contenedorSalida`: palet/cajón de salida
pendiente de confirmación final con Indasel, no una losa individual. La capa confirmada es
`PM/lote -> palet/cajón`; no se enlaza todavía con pulidora de losas hasta tener campo
fuente confirmado.

## Arranque

Frontend (desde `frontend/`):

```powershell
npm install
npm start          # dev server Angular en 127.0.0.1:4200
npm run build      # producción → dist/fabric
```

Backend (desde `backend/`, necesita `.env` con `DATABASE_URL`):

```powershell
npm install
npm run start:dev  # NestJS en 127.0.0.1:3000
npm run build      # producción → dist/
```

El frontend funciona solo con su **switch Demo | Real** en la barra superior: en *Demo*
usa una simulación en memoria (no requiere backend); en *Real* habla con el backend
(:3000). El backend siempre sirve datos reales (el modo demo del backend se retiró el
2026-06-13).

## Puertos

Frontend dev **4200** · backend **3000**. (PulyTrack usa 8001/5174/4174; quedan libres
5173/8000 para otras apps del repo.)

## Antes de entregar

**Ningún valor puede ser estimado o supuesto**: en modo real lo no calculable se muestra
como "—". La lista de control maestra está en [`VERIFICACION.md`](./VERIFICACION.md) y las
inferencias pendientes de confirmar (códigos de incidencia/operación, `consumo` = amperios,
unidades) en [`00_gestion/TAREAS.md`](../../00_gestion/TAREAS.md). No se entrega hasta que
ninguna fila quede pendiente.
