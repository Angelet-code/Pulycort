import {
  Activity,
  AlertTriangle,
  ClipboardList,
  Clock,
  Database,
  Euro,
  Factory,
  Filter,
  Layers,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  Timer,
  TrendingUp,
  UserRound
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { getHealth, getMachines, getOrders, getRecords, getSummary, getTrace, getUnknownMappings } from "./api";
import { formatCurrency, formatCurrencyPerM2, formatDateTime, formatDimensions, formatNumber, formatPercent, formatTime } from "./format";
import type {
  HealthResponse,
  MachineStatus,
  ProductionOrder,
  ProductionRecord,
  ProductionSummary,
  ProductionStatus,
  RecordFilters,
  TraceResponse,
  UnknownMapping,
  WindowMode
} from "./types";

const emptyFilters: RecordFilters = {
  machine_id: "",
  lot_id: "",
  pallet: "",
  material_code: "",
  operator: "",
  operation_code: ""
};

export function App() {
  const [windowMode, setWindowMode] = useState<WindowMode>("today");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [summary, setSummary] = useState<ProductionSummary | null>(null);
  const [machines, setMachines] = useState<MachineStatus[]>([]);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [records, setRecords] = useState<ProductionRecord[]>([]);
  const [unknowns, setUnknowns] = useState<UnknownMapping[]>([]);
  const [filters, setFilters] = useState<RecordFilters>(emptyFilters);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderQuery, setOrderQuery] = useState("");
  const [traceQuery, setTraceQuery] = useState("CM-48120");
  const [trace, setTrace] = useState<TraceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthData, machineData, summaryData, orderData, recordData, unknownData] = await Promise.all([
        getHealth(),
        getMachines(),
        getSummary(windowMode),
        getOrders(),
        getRecords(windowMode, filters),
        getUnknownMappings()
      ]);
      setHealth(healthData);
      setMachines(machineData);
      setSummary(summaryData);
      setOrders(orderData);
      setRecords(recordData);
      setUnknowns(unknownData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el dashboard.");
    } finally {
      setLoading(false);
    }
  }, [filters, windowMode]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const intervalSeconds = health?.refresh_seconds ?? 30;
    const handle = window.setInterval(refresh, intervalSeconds * 1000);
    return () => window.clearInterval(handle);
  }, [health?.refresh_seconds, refresh]);

  const machineOptions = useMemo(
    () => machines.map((machine) => ({ id: machine.id, name: machine.name })),
    [machines]
  );

  const visibleOrders = useMemo(() => {
    const query = orderQuery.trim().toLowerCase();
    if (!query) {
      return orders;
    }
    return orders.filter((order) => {
      const haystack = [
        order.id,
        order.commercial_order_id ?? "",
        order.title,
        order.description,
        order.client,
        order.production_status,
        ...order.linked_lot_ids,
        ...order.linked_pallet_ids
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [orderQuery, orders]);

  const selectedOrder = useMemo(
    () => visibleOrders.find((order) => order.id === selectedOrderId) ?? visibleOrders[0] ?? null,
    [selectedOrderId, visibleOrders]
  );

  const orderStats = useMemo(() => {
    const active = orders.filter((order) => ["en_produccion", "en_riesgo", "pausado"].includes(order.production_status)).length;
    const queued = orders.filter((order) => order.production_status === "en_cola").length;
    const average = orders.length ? orders.reduce((total, order) => total + order.percent_produced, 0) / orders.length : 0;
    return { active, queued, average };
  }, [orders]);

  const activeMachines = useMemo(() => machines.filter((machine) => machine.active).length, [machines]);

  useEffect(() => {
    if (!selectedOrderId && orders.length > 0) {
      setSelectedOrderId(orders[0].id);
    }
  }, [orders, selectedOrderId]);

  async function runTrace() {
    if (!traceQuery.trim()) {
      setTrace(null);
      return;
    }
    setTrace(await getTrace(traceQuery.trim()));
  }

  async function traceOrder(order: ProductionOrder) {
    const query = order.linked_pallet_ids[0] ?? order.linked_lot_ids[0];
    if (!query) {
      return;
    }
    setTraceQuery(query);
    setTrace(await getTrace(query));
  }

  return (
    <main className="app-shell">
      <div className="ambient-layer" aria-hidden="true" />

      <header className="topbar">
        <div className="hero-copy">
          <p className="eyebrow">PulyTrack</p>
          <h1>Pedidos, lotes y maquinas en directo</h1>
          <p className="hero-subtitle">
            Vista de produccion para conectar pedidos, bloques, tablas, losas y registros de maquina.
          </p>
          <div className="hero-metrics" aria-label="Resumen principal">
            <div>
              <span>Pedidos activos</span>
              <strong>{orderStats.active}</strong>
            </div>
            <div>
              <span>Maquinas activas</span>
              <strong>
                {activeMachines}/{machines.length || "-"}
              </strong>
            </div>
            <div>
              <span>Avance medio</span>
              <strong>{formatPercent(orderStats.average)}</strong>
            </div>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="hero-emblem" aria-hidden="true">
            <Factory size={40} />
          </div>
          <div className={`connection-pill ${health?.status === "ok" ? "ok" : "warn"}`}>
            <Database size={16} />
            <span>{health ? `${health.data_mode.toUpperCase()} - ${health.read_only ? "solo lectura" : "escritura"}` : "conectando"}</span>
          </div>
          <button className="icon-button" type="button" onClick={refresh} title="Actualizar datos">
            <RefreshCw size={18} className={loading ? "spin" : ""} />
          </button>
        </div>
      </header>

      <section className="control-row glass-strip" aria-label="Controles principales">
        <div className="segmented" role="tablist" aria-label="Ventana temporal">
          <button className={windowMode === "today" ? "active" : ""} type="button" onClick={() => setWindowMode("today")}>
            Hoy
          </button>
          <button className={windowMode === "shift" ? "active" : ""} type="button" onClick={() => setWindowMode("shift")}>
            Turno
          </button>
        </div>
        <div className="status-line">
          <Clock size={16} />
          <span>
            {summary ? `${formatDateTime(summary.window_start)} - ${formatDateTime(summary.window_end)}` : "Sin ventana cargada"}
          </span>
        </div>
        <div className="status-line">
          <ShieldCheck size={16} />
          <span>{health?.message ?? "Preparando conexion"}</span>
        </div>
      </section>

      {error ? (
        <section className="notice error">
          <AlertTriangle size={20} />
          <span>{error}</span>
        </section>
      ) : null}

      <OrdersSection
        orders={visibleOrders}
        selectedOrder={selectedOrder}
        orderQuery={orderQuery}
        stats={orderStats}
        onQueryChange={setOrderQuery}
        onSelect={setSelectedOrderId}
        onTraceOrder={traceOrder}
      />

      <section className="kpi-grid" id="metricas" aria-label="KPIs de produccion">
        {(summary?.kpis ?? []).map((kpi) => (
          <article className="kpi-card" key={kpi.label} title={kpi.help}>
            <p>{kpi.label}</p>
            <strong>{formatNumber(kpi.value, kpi.unit)}</strong>
          </article>
        ))}
      </section>

      <section className="main-grid" id="produccion">
        <section className="panel span-8">
          <div className="panel-header">
            <div>
              <h2>Produccion por hora</h2>
              <p>Lectura agregada por maquina en la ventana seleccionada.</p>
            </div>
            <Activity size={18} />
          </div>
          <HourlyChart summary={summary} />
        </section>

        <section className="panel span-4">
          <div className="panel-header">
            <div>
              <h2>Codigos pendientes</h2>
              <p>Operaciones, acabados, eventos o incidencias sin traducir.</p>
            </div>
            <AlertTriangle size={18} />
          </div>
          <UnknownsList unknowns={unknowns} />
        </section>
      </section>

      <section className="machines-grid" id="maquinas" aria-label="Estado por maquina">
        {machines.map((machine) => (
          <article className="machine-tile" key={machine.id}>
            <div className="machine-title">
              <span className={`dot ${machine.active ? "active" : ""}`} />
              <div>
                <h3>{machine.name}</h3>
                <p>{machine.family}</p>
              </div>
            </div>
            <dl>
              <div>
                <dt>Ultimo</dt>
                <dd>{formatTime(machine.last_record_at)}</dd>
              </div>
              <div>
                <dt>Lote</dt>
                <dd>{machine.last_lot_id ?? "-"}</dd>
              </div>
              <div>
                <dt>Prod.</dt>
                <dd>{machine.unit === "M3" ? formatNumber(machine.volume_m3_today, "m3") : formatNumber(machine.area_m2_today, "m2")}</dd>
              </div>
              <div>
                <dt>Eventos</dt>
                <dd>{machine.incidence_count_today}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>

      <section className="panel" id="registros">
        <div className="panel-header">
          <div>
            <h2>Ultimos registros</h2>
            <p>Filtros pensados para lote/PM, palet, material, operario y operacion.</p>
          </div>
          <Filter size={18} />
        </div>
        <FilterBar filters={filters} machines={machineOptions} onChange={setFilters} onClear={() => setFilters(emptyFilters)} />
        <RecordsTable records={records} />
      </section>

      <section className="panel trace-panel" id="trazabilidad">
        <div className="panel-header">
          <div>
            <h2>Trazabilidad lote / palet</h2>
            <p>Busca un PM o palet y revisa su recorrido cronologico por maquinas.</p>
          </div>
          <Search size={18} />
        </div>
        <div className="trace-search">
          <input value={traceQuery} onChange={(event) => setTraceQuery(event.target.value)} placeholder="Ej. CM-48120 o AC1048-60-001" />
          <button type="button" onClick={runTrace}>
            <Search size={16} />
            Buscar
          </button>
        </div>
        <TraceTimeline trace={trace} />
      </section>

      <MobileDock />
    </main>
  );
}

function MobileDock() {
  return (
    <nav className="mobile-dock" aria-label="Navegacion movil">
      <a href="#pedidos">
        <ClipboardList size={22} />
        <span>Pedidos</span>
      </a>
      <a href="#produccion">
        <Activity size={22} />
        <span>Prod.</span>
      </a>
      <a href="#maquinas">
        <Factory size={22} />
        <span>Maquinas</span>
      </a>
      <a href="#trazabilidad">
        <Search size={22} />
        <span>Traza</span>
      </a>
    </nav>
  );
}

function OrdersSection({
  orders,
  selectedOrder,
  orderQuery,
  stats,
  onQueryChange,
  onSelect,
  onTraceOrder
}: {
  orders: ProductionOrder[];
  selectedOrder: ProductionOrder | null;
  orderQuery: string;
  stats: { active: number; queued: number; average: number };
  onQueryChange: (query: string) => void;
  onSelect: (orderId: string) => void;
  onTraceOrder: (order: ProductionOrder) => Promise<void>;
}) {
  return (
    <section className="orders-board" id="pedidos" aria-label="Seguimiento de pedidos">
      <div className="order-list-panel">
        <div className="panel-header">
          <div>
            <h2>Pedidos y lineas en produccion</h2>
            <p>ID, cliente, precios, estado, avance y ETA calculada desde registros de maquina.</p>
          </div>
          <ClipboardList size={18} />
        </div>
        <div className="order-search">
          <Search size={16} />
          <input value={orderQuery} onChange={(event) => onQueryChange(event.target.value)} placeholder="Buscar pedido, linea, cliente, lote o palet" />
        </div>
        <div className="order-stat-row">
          <div>
            <span>Activos</span>
            <strong>{stats.active}</strong>
          </div>
          <div>
            <span>En cola</span>
            <strong>{stats.queued}</strong>
          </div>
          <div>
            <span>Avance medio</span>
            <strong>{formatPercent(stats.average)}</strong>
          </div>
        </div>
        <OrderList orders={orders} selectedOrderId={selectedOrder?.id ?? null} onSelect={onSelect} />
      </div>

      <OrderDetail order={selectedOrder} onTraceOrder={onTraceOrder} />
    </section>
  );
}

function OrderList({
  orders,
  selectedOrderId,
  onSelect
}: {
  orders: ProductionOrder[];
  selectedOrderId: string | null;
  onSelect: (orderId: string) => void;
}) {
  if (orders.length === 0) {
    return <div className="empty-state">Sin pedidos con ese filtro.</div>;
  }
  return (
    <div className="order-list">
      {orders.map((order) => (
        <button className={`order-row ${order.id === selectedOrderId ? "selected" : ""}`} type="button" key={order.id} onClick={() => onSelect(order.id)}>
          <span className={`status-dot ${order.production_status}`} />
          <span className="order-row-main">
            <strong>{order.commercial_order_id ?? order.id}</strong>
            <span>{order.commercial_order_id ? `${order.id} - ${order.title}` : order.title}</span>
          </span>
          <span className="order-row-meta">
            <span>{statusLabel(order.production_status)}</span>
            <strong>{formatPercent(order.percent_produced)}</strong>
          </span>
          <span className="progress-track" aria-hidden="true">
            <span style={{ width: `${order.percent_produced}%` }} />
          </span>
        </button>
      ))}
    </div>
  );
}

function OrderDetail({
  order,
  onTraceOrder
}: {
  order: ProductionOrder | null;
  onTraceOrder: (order: ProductionOrder) => Promise<void>;
}) {
  if (!order) {
    return (
      <article className="order-detail-panel">
        <div className="empty-state">No hay pedidos cargados.</div>
      </article>
    );
  }
  const traceDisabled = order.linked_pallet_ids.length === 0 && order.linked_lot_ids.length === 0;
  const progressStyle = {
    "--progress": `${Math.max(0, Math.min(100, order.percent_produced))}%`
  } as CSSProperties;
  const marginValue =
    order.margin_amount_eur === null || order.margin_amount_eur === undefined
      ? "-"
      : `${formatCurrency(order.margin_amount_eur)} (${formatPercent(order.margin_percent)})`;
  return (
    <article className="order-detail-panel">
      <div className="order-detail-header">
        <div>
          <p className="eyebrow">{order.commercial_order_id ? `${order.commercial_order_id} - ${order.id}` : order.id}</p>
          <h2>{order.title}</h2>
          <p>{order.description || "Sin descripcion."}</p>
        </div>
        <div className="order-headline-actions">
          <span className={`status-badge ${order.production_status}`}>{statusLabel(order.production_status)}</span>
          <div className="order-progress-orb" style={progressStyle} aria-label={`Producido ${formatPercent(order.percent_produced)}`}>
            <strong>{formatPercent(order.percent_produced)}</strong>
            <span>producido</span>
          </div>
        </div>
      </div>

      <div className="order-meter">
        <div>
          <span>Producido</span>
          <strong>{formatPercent(order.percent_produced)}</strong>
        </div>
        <div className="progress-track large" aria-hidden="true">
          <span style={{ width: `${order.percent_produced}%` }} />
        </div>
      </div>

      <div className="order-detail-grid">
        <DetailMetric icon={<UserRound size={16} />} label="Cliente" value={order.client} />
        <DetailMetric icon={<PackageCheck size={16} />} label="Cantidad" value={`${formatNumber(order.produced_quantity, order.unit)} / ${formatNumber(order.planned_quantity, order.unit)}`} />
        <DetailMetric icon={<Euro size={16} />} label="Venta / m2" value={formatCurrencyPerM2(order.sale_price_eur_m2)} />
        <DetailMetric icon={<Euro size={16} />} label="Coste / m2" value={formatCurrencyPerM2(order.cost_price_eur_m2)} />
        <DetailMetric icon={<TrendingUp size={16} />} label="Venta prevista" value={formatCurrency(order.sale_amount_eur)} />
        <DetailMetric icon={<TrendingUp size={16} />} label="Margen previsto" value={marginValue} />
        <DetailMetric icon={<Timer size={16} />} label="ETA" value={formatDateTime(order.estimated_completion_at)} />
        <DetailMetric icon={<Factory size={16} />} label="Maquina" value={order.active_machine ?? "-"} />
        <DetailMetric icon={<Activity size={16} />} label="Operacion" value={order.current_operation ?? "-"} />
        <DetailMetric icon={<AlertTriangle size={16} />} label="Eventos" value={String(order.incidence_count)} />
      </div>

      <div className="chip-block">
        <span>Lotes</span>
        <div className="chip-row">
          {(order.linked_lot_ids.length ? order.linked_lot_ids : ["-"]).map((lot) => (
            <span className="chip" key={lot}>{lot}</span>
          ))}
        </div>
      </div>
      <div className="chip-block">
        <span>Palets</span>
        <div className="chip-row">
          {(order.linked_pallet_ids.length ? order.linked_pallet_ids : ["-"]).map((pallet) => (
            <span className="chip" key={pallet}>{pallet}</span>
          ))}
        </div>
      </div>

      <div className="stage-block">
        <div className="panel-header compact">
          <div>
            <h2>Fases</h2>
            <p>Avance por la fase mas avanzada del pedido.</p>
          </div>
          <Layers size={18} />
        </div>
        <StageRail order={order} />
      </div>

      <button className="trace-order-button" type="button" disabled={traceDisabled} onClick={() => void onTraceOrder(order)}>
        <Search size={16} />
        Trazar lote o palet
      </button>
    </article>
  );
}

function DetailMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="detail-metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StageRail({ order }: { order: ProductionOrder }) {
  return (
    <div className="stage-rail">
      {order.stages.map((stage) => (
        <div className={`stage-item ${stage.status}`} key={stage.label}>
          <span className="stage-marker" />
          <div>
            <strong>{stage.label}</strong>
            <span>{stage.machine_names.join(", ") || statusLabelForStage(stage.status)}</span>
          </div>
          <small>{stage.produced_quantity ? formatNumber(stage.produced_quantity, stage.unit) : formatTime(stage.last_record_at)}</small>
        </div>
      ))}
    </div>
  );
}

function statusLabel(status: ProductionStatus): string {
  const labels: Record<ProductionStatus, string> = {
    sin_datos: "Sin datos",
    en_cola: "En cola",
    en_produccion: "Produciendo",
    pausado: "Pausado",
    en_riesgo: "Produciendo",
    completado: "Completado"
  };
  return labels[status];
}

function statusLabelForStage(status: "pending" | "active" | "done" | "blocked"): string {
  return {
    pending: "Pendiente",
    active: "En curso",
    done: "Completada",
    blocked: "Revisar"
  }[status];
}

function FilterBar({
  filters,
  machines,
  onChange,
  onClear
}: {
  filters: RecordFilters;
  machines: Array<{ id: string; name: string }>;
  onChange: (filters: RecordFilters) => void;
  onClear: () => void;
}) {
  const update = (key: keyof RecordFilters, value: string) => onChange({ ...filters, [key]: value });
  return (
    <div className="filters">
      <select value={filters.machine_id} onChange={(event) => update("machine_id", event.target.value)}>
        <option value="">Todas las maquinas</option>
        {machines.map((machine) => (
          <option key={machine.id} value={machine.id}>
            {machine.name}
          </option>
        ))}
      </select>
      <input value={filters.lot_id} onChange={(event) => update("lot_id", event.target.value)} placeholder="Lote / PM" />
      <input value={filters.pallet} onChange={(event) => update("pallet", event.target.value)} placeholder="Palet / cajon" />
      <input value={filters.material_code} onChange={(event) => update("material_code", event.target.value)} placeholder="Material" />
      <input value={filters.operator} onChange={(event) => update("operator", event.target.value)} placeholder="Operario" />
      <input value={filters.operation_code} onChange={(event) => update("operation_code", event.target.value)} placeholder="Operacion" />
      <button type="button" className="secondary-button" onClick={onClear}>
        Limpiar
      </button>
    </div>
  );
}

function HourlyChart({ summary }: { summary: ProductionSummary | null }) {
  const buckets = summary?.production_by_hour ?? [];
  const maxValue = Math.max(1, ...buckets.map((bucket) => bucket.area_m2 + bucket.volume_m3 * 10));
  if (buckets.length === 0) {
    return <div className="empty-state">Sin registros para graficar en esta ventana.</div>;
  }
  return (
    <div className="bar-chart">
      {buckets.map((bucket) => {
        const value = bucket.area_m2 + bucket.volume_m3 * 10;
        return (
          <div className="bar-item" key={`${bucket.bucket}-${bucket.machine_id}`}>
            <div className="bar-track">
              <span style={{ height: `${Math.max(8, (value / maxValue) * 100)}%` }} />
            </div>
            <p>{formatTime(bucket.bucket)}</p>
            <small>{bucket.machine_name.replace("Disco Puente ", "DP ")}</small>
          </div>
        );
      })}
    </div>
  );
}

function UnknownsList({ unknowns }: { unknowns: UnknownMapping[] }) {
  if (unknowns.length === 0) {
    return <div className="empty-state">No hay codigos pendientes en los datos cargados.</div>;
  }
  return (
    <div className="unknown-list">
      {unknowns.slice(0, 8).map((item) => (
        <div className="unknown-row" key={`${item.kind}-${item.machine_id}-${item.code}`}>
          <span>{item.kind}</span>
          <strong>{item.code}</strong>
          <small>{item.machine_name} - {item.count}</small>
        </div>
      ))}
    </div>
  );
}

function RecordsTable({ records }: { records: ProductionRecord[] }) {
  if (records.length === 0) {
    return <div className="empty-state">No hay registros con estos filtros.</div>;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Hora</th>
            <th>Maquina</th>
            <th>Lote / PM</th>
            <th>Palet</th>
            <th>Material</th>
            <th>Medidas</th>
            <th>Cant.</th>
            <th>Operacion</th>
            <th>Consumo</th>
            <th>Evento</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td data-label="Hora">{formatDateTime(record.timestamp)}</td>
              <td data-label="Maquina">{record.machine_name}</td>
              <td data-label="Lote / PM">{record.lot_id ?? "-"}</td>
              <td data-label="Palet">{[record.pallet_in, record.pallet_out].filter(Boolean).join(" -> ") || "-"}</td>
              <td data-label="Material">
                <strong>{record.material_code ?? "-"}</strong>
                <span>{record.material_name ?? ""}</span>
              </td>
              <td data-label="Medidas">{formatDimensions(record.dimensions.length_mm, record.dimensions.height_mm, record.dimensions.thickness_mm)}</td>
              <td data-label="Cant.">{formatNumber(record.quantity, record.unit)}</td>
              <td data-label="Operacion">{record.operation_label ?? record.finish_label ?? record.operation_code ?? record.finish_code ?? "-"}</td>
              <td data-label="Consumo">{formatNumber(record.consumption_kwh_delta, "kWh")}</td>
              <td data-label="Evento">{record.event_label ?? record.incidence_label ?? record.event_code ?? record.incidence_code ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TraceTimeline({ trace }: { trace: TraceResponse | null }) {
  if (!trace) {
    return <div className="empty-state">Introduce un lote o palet para ver su recorrido.</div>;
  }
  if (trace.steps.length === 0) {
    return <div className="empty-state">Sin movimientos para {trace.query}.</div>;
  }
  return (
    <div className="timeline">
      {trace.steps.map((step) => (
        <div className="timeline-step" key={step.id}>
          <div className="timeline-marker" />
          <div>
            <p>{formatDateTime(step.timestamp)} - {step.machine_name}</p>
            <strong>{step.operation_label ?? step.finish_label ?? step.operation_code ?? step.finish_code ?? "Registro"}</strong>
            <span>
              Lote {step.lot_id ?? "-"} - Palet {[step.pallet_in, step.pallet_out].filter(Boolean).join(" -> ") || "-"} - {formatNumber(step.quantity, step.unit)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
