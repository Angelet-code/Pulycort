# PulyTrack

Control de pedidos y produccion para Pulycort. La app esta pensada para ejecutarse en red local o VPN y leer una base SQL con usuario de solo lectura.

Nombre interno de carpeta: `dashboard_produccion`.

## Estado actual

- Backend FastAPI con endpoints del plan: salud, maquinas, resumen, registros, trazabilidad y codigos pendientes. La API es exclusivamente `GET`.
- Catalogo completo de las 18 maquinas documentadas de planta (telares 1-4, externo y monohilo, reforzadoras de bloques y tablas, cortabloques, pulidoras de tablas y losas, discos puente Terzago/Gomez/Canigo, control numerico Donatoni, biseladora, recuperadora y taller).
- Cache interna con TTL (`APP_REFRESH_SECONDS`): una sola lectura del SQL de maquinas por ciclo de refresco aunque el frontend consulte varios endpoints.
- Frontend React/Vite con navegacion por vistas: `#inicio`, `#pedidos`, `#maquinas`, `#trazabilidad` y `#datos`.
- La UI es un tracker de solo lectura: permite navegar, filtrar, buscar y refrescar, pero no expone acciones operativas ni escritura local.
- Modo demo activado por defecto (`DATABASE_URL=mock://pulycort`) hasta recibir acceso SQL real.
- Adaptador SQL configurable por JSON para mapear tablas/columnas reales de TotWare/INDASEL (admite tablas con esquema, ej. `dbo.registro_telar_1`).
- Pruebas unitarias de fechas compactas, turnos, calculos de pedidos, adaptador SQL, cache del servicio y bloqueo de consultas no `SELECT`.

## UX tracker

PulyTrack esta orientado a contestar rapido estas preguntas sin ejecutar acciones desde la app:

- Que pedido esta parado o en riesgo.
- Donde esta un lote/PM, palet o cajon.
- Que maquina tiene senal reciente.
- Que datos faltan por traducir o revisar fuera de PulyTrack.

La navegacion usa el mismo modelo en desktop y movil. En desktop se muestra una barra sticky bajo los controles globales. En movil se muestra como dock inferior. Las vistas principales son:

- `Inicio`: excepciones, KPIs y estado de solo lectura.
- `Pedidos`: listado, detalle, partidas, fases y senales a revisar.
- `Maquinas`: produccion por hora y estado por maquina.
- `Trazabilidad`: busqueda de lote/PM, palet o cajon.
- `Datos`: ultimos registros y codigos desconocidos en modo lectura.

## Seguimiento de pedidos

La app ya trabaja con una entidad `ProductionOrder` orientada al pedido:

- ID de pedido.
- ID comercial de pedido cuando una misma venta se divide en varias lineas de fabricacion.
- Titulo, descripcion y cliente.
- Estado de produccion: `en_cola`, `en_produccion`, `pausado`, `en_riesgo` o `completado`.
- Porcentaje producido.
- Cantidad prevista frente a cantidad producida.
- Precio de venta, coste previsto, venta total y margen por linea en `EUR/m2`.
- Fecha comprometida con el cliente (`committed_date`) y fecha/hora estimada de finalizacion.
- Lotes/PM y palets asociados.
- Fases de la cadena completa: refuerzo bloque, aserrado, refuerzo tabla, acabado tabla, corte a losa, acabado losa y taller/biselado. Las fases auxiliares (refuerzo bloque, taller) no marcan el porcentaje de avance.

En modo demo los pedidos se declaran en `backend/app/mock_data.py`. El ejemplo principal simula un pedido de Arabia Construction con tres lineas: 1.000 m2 de Crema Marfil 60 x 30 x 2, 300 m2 de Crema Marfil 30 x 30 x 2 y 2.000 m2 de Negro Marquina 120 x 60 x 2, cada una con precio de venta y coste previsto. En modo SQL real hay dos caminos:

1. Una vista SQL ya cruzada con Odoo que incluya columnas opcionales `commercial_order_id`, `order_id`, `order_title`, `order_description`, `client_name`, `order_planned_quantity`, `order_unit`, `order_sale_price_eur_m2` y `order_cost_price_eur_m2`.
2. Mantener las maquinas como fuente de produccion y traer cabeceras/lineas de pedido desde Odoo en una integracion posterior.

El porcentaje no suma todas las fases, porque eso duplicaria la misma piedra al pasar por varias maquinas. Se toma la cantidad de la fase mas avanzada del pedido **en la misma unidad que la cantidad prevista**: los m3 de aserrado nunca se comparan contra un pedido vendido en m2. La semantica de la cantidad de cada parte se controla con `QUANTITY_MODE` (`cumulative` por defecto: cada parte trae el acumulado; `incremental`: cada parte trae solo lo de ese parte) y esta pendiente de confirmar con INDASEL.

Senales de atencion:

- `pausado`: el ultimo registro implica parada explicita, o el pedido lleva mas de `STALLED_AFTER_HOURS` horas sin senal **mientras la planta sigue registrando actividad** o dentro de un turno configurado (`SHIFT_SCHEDULE`). El silencio nocturno o de fin de semana con la planta parada no genera falsas pausas.
- `en_riesgo`: hay una incidencia "abierta" (el ultimo parte de una maquina del pedido es un evento/incidencia y no ha vuelto a registrar partes normales), la fecha comprometida ya vencio, o la finalizacion estimada supera la fecha comprometida. Las incidencias antiguas ya superadas no mantienen el pedido en riesgo.

## Arranque local

```powershell
cd A:\PROYECTOS\OPENCODE\Pulycort\05_proyectos\pulycort_odoo_maquinas\05_app\dashboard_produccion
Copy-Item .env.example .env
```

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Abrir `http://127.0.0.1:5174`.

Comprobacion rapida del pipeline sin levantar el servidor (desde `backend/`):

```powershell
.\.venv\Scripts\python.exe smoke_check.py
```

Esta app usa `5174` para no pisar otras apps Vite del proyecto que usen `5173`. El backend se deja en `8001` por el mismo motivo.

## Configuracion SQL real

Cuando TotWare/INDASEL entregue acceso:

1. Crear un usuario SQL de solo lectura.
2. Definir `DATABASE_URL` en `.env`.
3. Copiar `backend/config/sql_tables.example.json` a un fichero local no versionado.
4. Cambiar `SQL_TABLE_CONFIG` para apuntar a ese fichero.
5. Mapear cada maquina con su tabla y columnas reales.

Ejemplo de SQL Server:

```env
DATABASE_URL=mssql+pyodbc://usuario:password@SERVIDOR/BASE?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes
```

Para SQL Server instalar tambien:

```powershell
pip install -r backend/requirements-sqlserver.txt
```

No guardar credenciales reales en el repositorio.

## Preguntas pendientes para TotWare / INDASEL

- Motor SQL, version, host, puerto, nombre de base y driver recomendado.
- Tablas reales por maquina y claves primarias.
- Campo de fecha/hora real: columna unica o `fecha` + `hora` compactas; confirmar formato (DDMM vs MMDD) y si incluye segundos.
- La cantidad de cada parte (`n_tablas`, `n_losas`): acumulada por pedido/material o incremental por parte (define `QUANTITY_MODE`).
- Unidades de las dimensiones `largo`/`alto`/`grueso`: mm o cm.
- Tabla de equivalencias para operaciones, acabados, eventos e incidencias.
- Que codigos de evento implican parada real y cuales son rutinarios (cambio de palet, etc.).
- Semantica de consumo por maquina: acumulativo, reset por cambio de material o parte.
- Como identificar palet/cajon de entrada y salida en disco puente y pulidora de losas, y como se enlaza el palet de salida del disco con el cajon de entrada de la pulidora.
- Si existen tablas historicas, vistas ya preparadas o restricciones de rendimiento.

## Endpoints

- `GET /api/health`
- `GET /api/machines`
- `GET /api/production/summary?window=today|shift`
- `GET /api/orders`
- `GET /api/records`
- `GET /api/trace/{lote_o_palet}`
- `GET /api/mappings/unknowns`

## Cola local de codigos pendientes

Los codigos sin traducir se muestran en PulyTrack como incidencias de datos en modo lectura. La UI no permite `mapear`, `ignorar`, `preguntar a INDASEL` ni guardar notas desde el tracker, y la API no expone ningun endpoint de escritura.

El estado de revision de cada codigo vive en un JSON local (`MAPPING_ACTIONS_PATH`) que se edita fuera de la app (a mano o por script, usando `app.mapping_actions.MappingActionStore`); PulyTrack solo lo lee para mostrar el estado de cada codigo.

## Variables de entorno

- `DATABASE_URL` — `mock://pulycort` (demo) o cadena SQLAlchemy de solo lectura.
- `SQL_TABLE_CONFIG` — ruta al JSON de mapeo de tablas/columnas.
- `SQL_ROW_LIMIT` — filas maximas leidas por tabla de maquina (5000 por defecto).
- `APP_REFRESH_SECONDS` — ritmo de refresco del frontend y TTL de la cache del backend (30 por defecto).
- `SHIFT_SCHEDULE` — turnos, ej. `manana=06:00-14:00,tarde=14:00-22:00,noche=22:00-06:00`. Sin configurar, la vista "Turno" queda deshabilitada y la deteccion de pausas no usa horario.
- `QUANTITY_MODE` — `cumulative` (por defecto) o `incremental`; semantica de la cantidad de cada parte.
- `STALLED_AFTER_HOURS` — horas sin senal para considerar un pedido parado (6 por defecto).
- `MAPPING_ACTIONS_PATH` — JSON local de estados de codigos pendientes.
- `CORS_ORIGINS` — origenes permitidos para el frontend.

## Loop UX

En cada ciclo de mejora, probar con datos demo estas tres tareas:

1. Encontrar un pedido parado o en riesgo.
2. Localizar un lote/PM, palet o cajon.
3. Revisar codigos desconocidos sin intentar resolverlos desde la app.

Criterios de salida del ciclo:

- Cero scroll horizontal en `390x844`, `768x1024` y desktop.
- Ninguna accion operativa visible.
- Cada vista responde a una intencion clara.
- Primer vistazo muestra excepciones y estado de datos.
- El usuario entiende que PulyTrack observa, no ejecuta.

## Seguridad

- La app no escribe en maquinas, SQL industrial ni Odoo.
- El frontend no llama endpoints `POST` ni guarda decisiones operativas.
- El adaptador SQL solo construye consultas `SELECT`.
- Los nombres de tablas y columnas se validan con una lista estricta de identificadores.
- Los filtros de usuario se aplican en memoria sobre registros normalizados; no se interpolan en SQL.
