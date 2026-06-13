# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este repositorio

Repositorio mixto de **conocimiento empresarial + proyectos de software** para Pulycort / INDASEL
(corte y pulido de piedra natural / mármol). No es un único proyecto de código: combina
documentación de negocio, salidas automáticas (transcripciones, informes) y varias apps.

Antes de actuar, identifica **qué tipo de material** estás tocando. El idioma de trabajo del
repositorio es español; mantén nombres de archivos, docs y commits en español.

## Estructura de carpetas (numeradas por flujo)

- `00_gestion/` — roadmap, `TAREAS.md` (tareas/dudas abiertas), decisiones de organización.
- `01_entrada/` — bandeja de documentos recibidos **sin procesar**. No modificar las fuentes originales.
- `02_conocimiento/` — bóveda Obsidian y mapas mentales. Arranque: `02_conocimiento/obsidian/00 Inicio.md`.
- `03_documentacion_curada/` — documentación ya ordenada. Índice maestro: `03_documentacion_curada/INDICE.md`.
- `04_analisis_y_entregables/` — `informes/` (salidas elaboradas con fuentes citadas) y `outputs/` (logs/transcripciones/capturas brutas).
- `05_proyectos/` — apps e integraciones, cada una con su propio `README.md`.
- `90_tools/` — scripts de soporte (transcripción, PDF/DOCX, previews). No son fuente de verdad de negocio.
- `.cache/`, `.vendor/`, `No Tocar/` — soporte técnico local; no tratar como conocimiento de negocio.

## Reglas de trabajo (de AGENTS.md)

- No borrar fuentes originales ni versiones previas sin confirmación explícita.
- Distinguir siempre entre **hecho documentado**, **inferencia** y **propuesta**.
- Si dos fuentes discrepan, conserva la discrepancia y añade una tarea en `00_gestion/TAREAS.md`.
- Al incorporar documentación nueva, actualiza `03_documentacion_curada/INDICE.md`.
- No mezclar logs, audios, capturas o salidas brutas con documentación curada.
- Cada app vive en `05_proyectos/` con README propio; extrae a módulo compartido antes de duplicar lógica.
- Antes de arrancar una app, revisa qué puertos locales están ocupados para no pisar otros servicios.

## Proyectos en 05_proyectos/

- `pulycort_odoo_maquinas/` — **proyecto activo principal**. Integración entre el software de las
  máquinas de producción y Odoo. Contiene las apps **PulyTrack** y **Fabric** (ver abajo).
- `visor_mapa_3d_instalaciones/` — visor 3D editable (Three.js + Vite) de las instalaciones.
- `control_compresor/`, `control_silo_prensa_barro/` — futuras apps (aún sin código relevante).

## PulyTrack — dashboard de producción

Ruta: `05_proyectos/pulycort_odoo_maquinas/05_app/dashboard_produccion/`
(nombre interno de carpeta `dashboard_produccion`, nombre de producto **PulyTrack**).

Tracker **de solo lectura** para producción y pedidos. Principio de diseño central: la app
**observa, no ejecuta** — sin endpoints de escritura en la UI, sin acciones operativas, solo
consultas `SELECT`. Respeta esto al añadir features.

### Arquitectura backend (FastAPI)

`backend/app/` con capas claras (todo tipado, `from __future__ import annotations`):

- `main.py` — endpoints FastAPI (`/api/health`, `/machines`, `/production/summary`, `/orders`,
  `/records`, `/trace/{id}`, `/mappings/unknowns`). Servicio cacheado vía `Depends(get_service)`.
- `config.py` — `Settings` (dataclass frozen) desde variables de entorno; `data_mode` es `mock`
  si `DATABASE_URL` empieza por `mock://`, si no `sql`.
- `service.py` — `ProductionService`: orquesta repositorio + métricas + tracking de pedidos.
  `get_repository()` elige `MockProductionRepository` o `SqlProductionRepository` según `data_mode`.
- `repository.py` — `ProductionRepository` (Protocol) con dos implementaciones. Filtrado de
  registros en memoria (`RecordFilters`), nunca interpolado en SQL.
- `sql_guard.py` — `assert_safe_identifier` / `assert_select_only`: barrera de seguridad SQL.
- `mock_data.py` — datos demo (pedidos, registros) usados en `data_mode=mock`.
- `metrics.py`, `order_tracking.py`, `timeutils.py`, `machine_catalog.py`, `models.py`,
  `mapping_actions.py` — métricas (m²/m³, KPIs, buckets horarios), construcción de pedidos,
  fechas/turnos compactos, catálogo de máquinas, modelos Pydantic, cola local de códigos.

Modo demo (`DATABASE_URL=mock://pulycort`) activo por defecto hasta tener acceso SQL real de
TotWare/INDASEL. El adaptador SQL real se configura con un JSON que mapea tablas/columnas
(`backend/config/sql_tables.example.json` → copia local vía `SQL_TABLE_CONFIG`).

### Arquitectura frontend (React + Vite + TypeScript)

`frontend/src/` — SPA con navegación por hash (`#inicio`, `#pedidos`, `#maquinas`,
`#trazabilidad`, `#datos`). `App.tsx` (vistas), `api.ts` (cliente HTTP), `types.ts`,
`format.ts`, `materialVisuals.ts`, `styles.css`. Sin librería de routing; estado de vista por hash.
Mismo modelo en desktop (barra sticky) y móvil (dock inferior). Objetivo UX: cero scroll
horizontal en `390x844`, `768x1024` y desktop.

## Fabric — visor de producción de telares

Ruta: `05_proyectos/pulycort_odoo_maquinas/05_app/fabric/`. Angular 19 (standalone + signals,
SVG propio sin librerías de gráficos), UI en español con unidades en todos los valores.
Visor de **solo lectura** de los 4 telares (corte de bloques en tablas): sala en vivo
(`/telares`), detalle con "Bloque Vivo" (`/telares/:id`), partes de producción en crudo
(`/partes`, las lecturas de la tabla real `produccion_mapeada`, paginadas), partes de
trabajo de operario (`/partes-trabajo`, tabla real `parte_trabajo_mapeada`: operaciones,
paquetes, tablas y m² reales), producción y paros (`/produccion`), inventario de bloques
(`/inventario`, tabla real `lot_block_creation`: altas de bloque en almacén con medida del
proveedor frente a medida de fábrica/mrp, m³ y merma derivados), salud del dato
(`/datos`, cuarentena de lecturas corruptas con su motivo) y salud del sistema
(`/sistema`, registro curado de problemas de máquinas/datos/cálculos con evidencia,
solución recomendada y responsable; mantener a mano junto a `00_gestion/TAREAS.md`).
El rendimiento m²/m³ de `/produccion` es un agregado de bloques con parte real: las
medidas de consola llegan heredadas del bloque anterior y el m³ bloque a bloque es ruido
(el cruce lecturas-partes va acotado a la ventana del corte; bloques imposibles marcados ⚠).

**Dos fuentes con switch Demo | Real en la barra superior**, detrás de la fachada
`FabricApi` (`core/fabric-api.ts`) vía `conmutador-fabric-api.ts`: la demo es la simulación
en memoria (`core/mock/simulacion.ts`, replica el sistema antiguo con la corrupción de los
telares 1/3/4; reloj virtual ×60 en `core/reloj.service.ts`) y la real es `HttpFabricApi`
contra **fabric-backend** (`05_app/fabric-backend/`, NestJS + Prisma 7, puerto 3000), cuyo
`PrismaFabricRepository` calcula todo desde `produccion_mapeada` y devuelve `null`/"—" para
lo que la tabla no contiene (m², tablas, merma, roturas) — principio de `VERIFICACION.md`:
no inventar. Las inferencias del modo real (códigos de incidencia, `consumo` = amperios,
unidades cm/mm) están pendientes de confirmar en `00_gestion/TAREAS.md`. El validador
(`core/validador.ts` y su copia backend) excluye las lecturas sospechosas de los KPIs.
Ver su `README.md`.

## Comandos

### PulyTrack — backend (desde `.../dashboard_produccion/backend/`)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt          # + requirements-sqlserver.txt para SQL Server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

Tests (stdlib `unittest`, ejecutar desde `backend/` para que resuelva el paquete `app`):

```powershell
python -m unittest discover -s tests          # todos los tests
python -m unittest tests.test_sql_guard       # un módulo
python -m unittest tests.test_metrics.MetricsTests.test_area   # un test concreto
```

### PulyTrack — frontend (desde `.../dashboard_produccion/frontend/`)

```powershell
npm install
npm run dev        # Vite en 127.0.0.1:5174 (strictPort)
npm run build      # tsc + vite build
npm run preview    # 127.0.0.1:4174
```

### Fabric (desde `05_proyectos/pulycort_odoo_maquinas/05_app/fabric/`)

```powershell
npm install
npm start          # dev server Angular en 127.0.0.1:4200
npm run build      # producción → dist/fabric
```

### Visor 3D (desde `05_proyectos/visor_mapa_3d_instalaciones/`)

```powershell
npm install
npm run dev        # Vite (Three.js)
npm run build; npm run serve   # demo sin watcher
```

### Tools (desde la raíz)

Scripts Python/Node sueltos en `90_tools/` (transcripción, generación de PDF/DOCX, previews).
Salidas elaboradas → `04_analisis_y_entregables/informes/`; salidas brutas → `.../outputs/`.

## Puertos locales (reservados para no pisarse)

- PulyTrack backend: **8001** · frontend dev: **5174** · preview: **4174**
- Fabric dev: **4200**
- El proyecto deja libre `5173`/`8000` para otras apps Vite/servidores del repo.

## Convenciones de configuración

- Variables de entorno en `.env` por app (nunca versionar; existe `.env.example`).
- `.gitignore` excluye `node_modules/`, `dist/`, `.venv/`, `*.sqlite*`, `backend/local_state/`,
  logs `*.log` y `.cache/` / `.vendor/`.
- No guardar credenciales SQL reales; el usuario SQL debe ser **solo lectura**.
