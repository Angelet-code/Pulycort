# PulyTrack

Control de pedidos y produccion para Pulycort. La app esta pensada para ejecutarse en red local o VPN y leer una base SQL con usuario de solo lectura.

Nombre interno de carpeta: `dashboard_produccion`.

## Estado actual

- Backend FastAPI con endpoints del plan: salud, maquinas, resumen, registros, trazabilidad y codigos pendientes.
- Frontend React/Vite con seguimiento de pedidos, KPIs, estado por maquina, graficas, filtros y busqueda por lote o palet.
- Modo demo activado por defecto (`DATABASE_URL=mock://pulycort`) hasta recibir acceso SQL real.
- Adaptador SQL configurable por JSON para mapear tablas/columnas reales de TotWare/INDASEL.
- Pruebas unitarias de fechas compactas, turnos, calculos de pedidos y bloqueo de consultas no `SELECT`.

## Seguimiento de pedidos

La app ya trabaja con una entidad `ProductionOrder` orientada al pedido:

- ID de pedido.
- ID comercial de pedido cuando una misma venta se divide en varias lineas de fabricacion.
- Titulo, descripcion y cliente.
- Estado de produccion: `en_cola`, `en_produccion`, `pausado`, `en_riesgo` o `completado`.
- Porcentaje producido.
- Cantidad prevista frente a cantidad producida.
- Precio de venta, coste previsto, venta total y margen por linea en `EUR/m2`.
- Fecha/hora estimada de finalizacion.
- Lotes/PM y palets asociados.
- Fase actual: aserrado, refuerzo, acabado tabla, corte a losa o acabado losa.

En modo demo los pedidos se declaran en `backend/app/mock_data.py`. El ejemplo principal simula un pedido de Arabia Construction con tres lineas: 1.000 m2 de Crema Marfil 60 x 30 x 2, 300 m2 de Crema Marfil 30 x 30 x 2 y 2.000 m2 de Negro Marquina 120 x 60 x 2, cada una con precio de venta y coste previsto. En modo SQL real hay dos caminos:

1. Una vista SQL ya cruzada con Odoo que incluya columnas opcionales `commercial_order_id`, `order_id`, `order_title`, `order_description`, `client_name`, `order_planned_quantity`, `order_unit`, `order_sale_price_eur_m2` y `order_cost_price_eur_m2`.
2. Mantener las maquinas como fuente de produccion y traer cabeceras/lineas de pedido desde Odoo en una integracion posterior.

El porcentaje no suma todas las fases, porque eso duplicaria la misma piedra al pasar por varias maquinas. Para el MVP se toma la cantidad de la fase mas avanzada del pedido y se compara contra la cantidad prevista.

De momento los eventos/incidencias demo no cambian el pedido a `en_riesgo`: se mantienen como `Produciendo` y el contador de eventos queda visible para revisar.

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
- Campo de fecha/hora real: columna unica o `fecha` + `hora` compactas.
- Tabla de equivalencias para operaciones, acabados, eventos e incidencias.
- Semantica de consumo por maquina: acumulativo, reset por cambio de material o parte.
- Como identificar palet/cajon de entrada y salida en disco puente y pulidora de losas.
- Si existen tablas historicas, vistas ya preparadas o restricciones de rendimiento.

## Endpoints

- `GET /api/health`
- `GET /api/machines`
- `GET /api/production/summary?window=today|shift`
- `GET /api/orders`
- `GET /api/records`
- `GET /api/trace/{lote_o_palet}`
- `GET /api/mappings/unknowns`

## Seguridad

- La app no escribe en maquinas, SQL industrial ni Odoo.
- El adaptador SQL solo construye consultas `SELECT`.
- Los nombres de tablas y columnas se validan con una lista estricta de identificadores.
- Los filtros de usuario se aplican en memoria sobre registros normalizados; no se interpolan en SQL.
