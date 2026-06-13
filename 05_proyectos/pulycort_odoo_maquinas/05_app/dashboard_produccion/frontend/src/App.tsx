import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Database,
  Euro,
  Factory,
  Filter,
  Layers,
  ListChecks,
  MapPin,
  PackageCheck,
  PauseCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Ship,
  Timer,
  TrendingUp,
  UserRound
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { getHealth, getMachines, getOrders, getRecords, getSummary, getTrace, getUnknownMappings } from "./api";
import { formatCurrency, formatCurrencyPerM2, formatDateTime, formatDimensions, formatLongDateTime, formatNumber, formatPercent, formatTime } from "./format";
import { resolveMaterialVisual } from "./materialVisuals";
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

type TrackerView = "inicio" | "pedidos" | "maquinas" | "trazabilidad" | "datos";

interface TrackerNavItem {
  id: TrackerView;
  label: string;
  shortLabel: string;
  icon: ReactNode;
}

const trackerViews: TrackerNavItem[] = [
  { id: "inicio", label: "Inicio", shortLabel: "Inicio", icon: <Activity size={20} /> },
  { id: "pedidos", label: "Pedidos", shortLabel: "Pedidos", icon: <ClipboardList size={20} /> },
  { id: "maquinas", label: "Maquinas", shortLabel: "Maq.", icon: <Factory size={20} /> },
  { id: "trazabilidad", label: "Trazabilidad", shortLabel: "Traza", icon: <Search size={20} /> },
  { id: "datos", label: "Datos", shortLabel: "Datos", icon: <ListChecks size={20} /> }
];

const emptyFilters: RecordFilters = {
  machine_id: "",
  lot_id: "",
  pallet: "",
  material_code: "",
  operator: "",
  operation_code: ""
};

function viewFromHash(): TrackerView {
  if (typeof window === "undefined") {
    return "inicio";
  }
  const raw = window.location.hash.replace("#", "").trim().toLowerCase();
  const aliases: Record<string, TrackerView> = {
    inicio: "inicio",
    pedidos: "pedidos",
    maquinas: "maquinas",
    produccion: "maquinas",
    metricas: "maquinas",
    trazabilidad: "trazabilidad",
    traza: "trazabilidad",
    datos: "datos",
    codigos: "datos",
    registros: "datos"
  };
  return aliases[raw] ?? "inicio";
}

export function App() {
  const [activeView, setActiveView] = useState<TrackerView>(() => viewFromHash());
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
  const [traceQuery, setTraceQuery] = useState("");
  const [trace, setTrace] = useState<TraceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectView = useCallback((view: TrackerView) => {
    setActiveView(view);
    if (typeof window === "undefined") {
      return;
    }
    const nextHash = `#${view}`;
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
    }
  }, []);

  useEffect(() => {
    const syncView = () => setActiveView(viewFromHash());
    window.addEventListener("hashchange", syncView);
    window.addEventListener("popstate", syncView);
    return () => {
      window.removeEventListener("hashchange", syncView);
      window.removeEventListener("popstate", syncView);
    };
  }, []);

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
      setError(err instanceof Error ? err.message : "No se pudo cargar PulyTrack.");
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
        order.incoterm ?? "",
        order.destination ?? "",
        order.production_status,
        ...order.linked_lot_ids,
        ...order.linked_pallet_ids,
        ...order.lines.flatMap((line) => [line.id, line.title, line.description, ...line.linked_lot_ids, ...line.linked_pallet_ids])
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

  const orderBuckets = useMemo(() => {
    const producing = orders.filter((order) => ["en_produccion", "en_riesgo"].includes(order.production_status)).length;
    const paused = orders.filter((order) => order.production_status === "pausado").length;
    const queued = orders.filter((order) => order.production_status === "en_cola").length;
    const completed = orders.filter((order) => order.production_status === "completado").length;
    const average = orders.length ? orders.reduce((total, order) => total + order.percent_produced, 0) / orders.length : 0;
    return { producing, paused, queued, completed, average };
  }, [orders]);

  const activeMachines = useMemo(() => machines.filter((machine) => machine.active).length, [machines]);

  const exceptionStats = useMemo(() => {
    const paused = orders.filter((order) => order.production_status === "pausado").length;
    const incidents = orders.reduce((total, order) => total + order.incidence_count, 0);
    const now = Date.now();
    const committedRisk = orders.filter((order) => {
      if (!order.committed_date || order.production_status === "completado") {
        return false;
      }
      const committed = new Date(order.committed_date).getTime();
      if (committed < now) {
        return true;
      }
      return order.estimated_completion_at ? new Date(order.estimated_completion_at).getTime() > committed : false;
    }).length;
    return { paused, incidents, unknown: unknowns.length, committedRisk };
  }, [orders, unknowns]);

  useEffect(() => {
    if (visibleOrders.length > 0 && !visibleOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(visibleOrders[0].id);
    }
  }, [selectedOrderId, visibleOrders]);

  async function runTrace() {
    if (!traceQuery.trim()) {
      setTrace(null);
      return;
    }
    try {
      setTrace(await getTrace(traceQuery.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la trazabilidad.");
    }
  }

  async function traceOrder(order: ProductionOrder) {
    const query = order.linked_pallet_ids[0] ?? order.linked_lot_ids[0];
    selectView("trazabilidad");
    if (!query) {
      setTrace(null);
      return;
    }
    setTraceQuery(query);
    try {
      setTrace(await getTrace(query));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la trazabilidad del pedido.");
    }
  }

  return (
    <main className="app-shell">
      <div className="ambient-layer" aria-hidden="true" />

      <header className="topbar">
        <div className="hero-copy">
          <p className="eyebrow">PulyTrack</p>
          <h1>Seguimiento de planta</h1>
          <p className="hero-subtitle">
            Tracker de solo lectura para pedidos, lotes/PM, palets/cajones, maquinas y senales de produccion.
          </p>
        </div>
        <div className="topbar-actions">
          <div className="hero-emblem" aria-hidden="true">
            <Factory size={30} />
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
          <button
            className={windowMode === "shift" ? "active" : ""}
            type="button"
            disabled={!health?.shift_schedule_configured}
            title={health?.shift_schedule_configured ? undefined : "Sin turnos configurados (SHIFT_SCHEDULE): la ventana de turno equivaldria a Hoy"}
            onClick={() => setWindowMode("shift")}
          >
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

      <TrackerNav activeView={activeView} onSelectView={selectView} />

      {error ? (
        <section className="notice error">
          <AlertTriangle size={20} />
          <span>{error}</span>
        </section>
      ) : null}

      <section className={`view-shell view-${activeView}`} aria-label={viewLabel(activeView)}>
        {activeView === "inicio" ? (
          <HomeView
            stats={exceptionStats}
            summary={summary}
            health={health}
            orders={orders}
            unknowns={unknowns}
            activeMachines={activeMachines}
            machineCount={machines.length}
            onSelectView={selectView}
          />
        ) : null}

        {activeView === "pedidos" ? (
          <OrdersSection
            orders={visibleOrders}
            selectedOrder={selectedOrder}
            orderQuery={orderQuery}
            buckets={orderBuckets}
            onQueryChange={setOrderQuery}
            onSelect={setSelectedOrderId}
            onTraceOrder={traceOrder}
          />
        ) : null}

        {activeView === "maquinas" ? <MachinesView machines={machines} summary={summary} /> : null}

        {activeView === "trazabilidad" ? (
          <TraceSection traceQuery={traceQuery} trace={trace} onQueryChange={setTraceQuery} onRunTrace={runTrace} />
        ) : null}

        {activeView === "datos" ? (
          <DataView
            records={records}
            filters={filters}
            machines={machineOptions}
            unknowns={unknowns}
            onFiltersChange={setFilters}
            onClearFilters={() => setFilters(emptyFilters)}
          />
        ) : null}
      </section>
    </main>
  );
}

function viewLabel(view: TrackerView): string {
  return trackerViews.find((item) => item.id === view)?.label ?? "Vista";
}

function TrackerNav({ activeView, onSelectView }: { activeView: TrackerView; onSelectView: (view: TrackerView) => void }) {
  return (
    <nav className="tracker-nav" aria-label="Vistas de PulyTrack">
      {trackerViews.map((item) => (
        <button
          className={activeView === item.id ? "active" : ""}
          type="button"
          key={item.id}
          aria-current={activeView === item.id ? "page" : undefined}
          onClick={() => onSelectView(item.id)}
        >
          {item.icon}
          <span className="nav-label-full">{item.label}</span>
          <span className="nav-label-short">{item.shortLabel}</span>
        </button>
      ))}
    </nav>
  );
}

function HomeView({
  stats,
  summary,
  health,
  orders,
  unknowns,
  activeMachines,
  machineCount,
  onSelectView
}: {
  stats: { paused: number; incidents: number; unknown: number; committedRisk: number };
  summary: ProductionSummary | null;
  health: HealthResponse | null;
  orders: ProductionOrder[];
  unknowns: UnknownMapping[];
  activeMachines: number;
  machineCount: number;
  onSelectView: (view: TrackerView) => void;
}) {
  const attentionOrders = orders
    .filter((order) => ["pausado", "en_riesgo"].includes(order.production_status))
    .slice(0, 4);

  return (
    <div className="home-grid">
      <ExceptionTray stats={stats} activeMachines={activeMachines} machineCount={machineCount} onSelectView={onSelectView} />

      <section className="kpi-grid home-kpis" aria-label="KPIs de produccion">
        {(summary?.kpis ?? []).map((kpi) => (
          <article className="kpi-card" key={kpi.label} title={kpi.help}>
            <p>{kpi.label}</p>
            <strong>{formatNumber(kpi.value, kpi.unit)}</strong>
          </article>
        ))}
      </section>

      <section className="panel home-panel">
        <div className="panel-header">
          <div>
            <h2>Pedidos que mirar primero</h2>
            <p>Pausas, incidencias y compromisos en riesgo detectados desde los registros de maquina.</p>
          </div>
          <PauseCircle size={18} />
        </div>
        {attentionOrders.length ? (
          <div className="watch-list">
            {attentionOrders.map((order) => (
              <button className="watch-row" type="button" key={order.id} onClick={() => onSelectView("pedidos")}>
                <span className={`status-dot ${order.production_status}`} />
                <span>
                  <strong>{order.client}</strong>
                  <small>{order.id} - {order.last_machine_name ?? "Sin maquina reciente"}</small>
                </span>
                <span className={`status-badge ${order.production_status}`}>{statusLabel(order.production_status)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-state">Sin pedidos con senales de atencion en esta ventana.</div>
        )}
      </section>

      <section className="panel home-panel">
        <div className="panel-header">
          <div>
            <h2>Estado del tracker</h2>
            <p>Estado de datos y limites de uso visibles para planta.</p>
          </div>
          <ShieldCheck size={18} />
        </div>
        <div className="tracker-state-grid">
          <DetailMetric icon={<Database size={16} />} label="Modo datos" value={health?.data_mode?.toUpperCase() ?? "Conectando"} />
          <DetailMetric icon={<ShieldCheck size={16} />} label="Permiso" value={health?.read_only ? "Solo lectura" : "Escritura detectada"} />
          <DetailMetric icon={<Clock size={16} />} label="Refresco" value={`${health?.refresh_seconds ?? 30}s`} />
          <DetailMetric icon={<ListChecks size={16} />} label="Datos pendientes" value={`${unknowns.length} codigos`} />
        </div>
      </section>
    </div>
  );
}

function ExceptionTray({
  stats,
  activeMachines,
  machineCount,
  onSelectView
}: {
  stats: { paused: number; incidents: number; unknown: number; committedRisk: number };
  activeMachines: number;
  machineCount: number;
  onSelectView: (view: TrackerView) => void;
}) {
  const items = [
    { label: "Pausados", value: stats.paused, tone: stats.paused ? "danger" : "ok", icon: <PauseCircle size={18} />, view: "pedidos" as TrackerView },
    { label: "Incidencias", value: stats.incidents, tone: stats.incidents ? "warn" : "ok", icon: <AlertTriangle size={18} />, view: "pedidos" as TrackerView },
    { label: "Codigos", value: stats.unknown, tone: stats.unknown ? "warn" : "ok", icon: <ListChecks size={18} />, view: "datos" as TrackerView },
    { label: "Compromisos", value: stats.committedRisk, tone: stats.committedRisk ? "danger" : "ok", icon: <Timer size={18} />, view: "pedidos" as TrackerView }
  ];
  return (
    <div className="exception-tray" aria-label="Bandeja de excepciones">
      {items.map((item) => (
        <button className={`exception-tile ${item.tone}`} type="button" onClick={() => onSelectView(item.view)} key={item.label}>
          <span>{item.icon}</span>
          <strong>{item.value}</strong>
          <small>{item.label}</small>
        </button>
      ))}
      <button className="exception-tile live" type="button" onClick={() => onSelectView("maquinas")}>
        <span><Factory size={18} /></span>
        <strong>{activeMachines}/{machineCount || "-"}</strong>
        <small>Maquinas activas ahora</small>
      </button>
    </div>
  );
}

function OrdersSection({
  orders,
  selectedOrder,
  orderQuery,
  buckets,
  onQueryChange,
  onSelect,
  onTraceOrder
}: {
  orders: ProductionOrder[];
  selectedOrder: ProductionOrder | null;
  orderQuery: string;
  buckets: { producing: number; paused: number; queued: number; completed: number; average: number };
  onQueryChange: (query: string) => void;
  onSelect: (orderId: string) => void;
  onTraceOrder: (order: ProductionOrder) => Promise<void>;
}) {
  return (
    <section className="orders-board" id="pedidos" aria-label="Seguimiento de pedidos">
      <div className="order-list-panel">
        <div className="panel-header">
          <div>
            <h2>Pedidos en produccion</h2>
            <p>ID, cliente, partidas, precios, estado, avance y finalizacion estimada desde registros de maquina.</p>
          </div>
          <ClipboardList size={18} />
        </div>
        <div className="order-search">
          <Search size={16} />
          <input value={orderQuery} onChange={(event) => onQueryChange(event.target.value)} placeholder="Buscar pedido, cliente, partida, lote o palet" />
        </div>
        <div className="order-stat-row">
          <div>
            <span>Produciendo</span>
            <strong>{buckets.producing}</strong>
          </div>
          <div>
            <span>Pausados</span>
            <strong>{buckets.paused}</strong>
          </div>
          <div>
            <span>En cola</span>
            <strong>{buckets.queued}</strong>
          </div>
          <div>
            <span>Completados</span>
            <strong>{buckets.completed}</strong>
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
            <strong>{order.client}</strong>
            <span>{order.lines.length > 1 ? `${order.id} - ${order.lines.length} partidas` : order.id}</span>
          </span>
          <span className="order-row-meta">
            <span className={`status-badge order-row-status ${order.production_status}`}>{statusLabel(order.production_status)}</span>
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
      : `${formatCurrency(order.margin_amount_eur, order.currency_code)} (${formatPercent(order.margin_percent)})`;
  return (
    <article className="order-detail-panel">
      <div className="order-detail-header">
        <div className="order-detail-copy">
          <p className="eyebrow">Pedido {order.id}</p>
          <h2>{order.title}</h2>
          <OrderLines order={order} />
        </div>
        <div className="order-headline-actions">
          <span className={`status-badge ${order.production_status}`}>{statusLabel(order.production_status)}</span>
          <div className="order-progress-orb" style={progressStyle} aria-label={`Producido ${formatPercent(order.percent_produced)}`}>
            <strong>{formatPercent(order.percent_produced)}</strong>
            <span>producido</span>
          </div>
        </div>
      </div>

      <NextActionCard order={order} />

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
        <DetailMetric icon={<MapPin size={16} />} label="Destino" value={order.destination ?? "-"} />
        <DetailMetric icon={<Ship size={16} />} label="Incoterm" value={order.incoterm ?? "-"} />
        <DetailMetric icon={<Clock size={16} />} label="Compromiso cliente" value={formatLongDateTime(order.committed_date)} />
        <DetailMetric icon={<Timer size={16} />} label="Finalizacion estimada" value={formatLongDateTime(order.estimated_completion_at)} />
        <DetailMetric icon={<PackageCheck size={16} />} label="Cantidad" value={`${formatNumber(order.produced_quantity, order.unit)} / ${formatNumber(order.planned_quantity, order.unit)}`} />
      </div>

      <div className="commercial-detail-grid">
        <DetailMetric icon={<TrendingUp size={16} />} label="Venta prevista" value={formatCurrency(order.sale_amount_eur, order.currency_code)} />
        <DetailMetric icon={<TrendingUp size={16} />} label="Margen previsto" value={marginValue} />
        <DetailMetric icon={<Euro size={16} />} label="Venta media / m2" value={formatCurrencyPerM2(order.sale_price_eur_m2, order.currency_code, order.unit)} />
        <DetailMetric icon={<Euro size={16} />} label="Coste medio / m2" value={formatCurrencyPerM2(order.cost_price_eur_m2, order.currency_code, order.unit)} />
      </div>

      <OrderBusinessDescription order={order} />

      <div className="chip-block">
        <span>Lotes / PM</span>
        <div className="chip-row">
          {(order.linked_lot_ids.length ? order.linked_lot_ids : ["-"]).map((lot) => (
            <span className="chip" key={lot}>{lot}</span>
          ))}
        </div>
      </div>
      <div className="chip-block">
        <span>Palets / cajones</span>
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
        Ver trazabilidad
      </button>
    </article>
  );
}

function NextActionCard({ order }: { order: ProductionOrder }) {
  const action = order.next_action;
  if (!action) {
    return null;
  }
  const affectedTrace = [action.lot_id ? `Lote ${action.lot_id}` : "", action.pallet_id ? `Palet ${action.pallet_id}` : ""].filter(Boolean).join(" - ") || "-";
  const issue = action.incidence_label ?? action.incidence_code ?? (order.incidence_count ? `${order.incidence_count} incidencia(s)` : "-");
  return (
    <section className={`next-action-card priority-${action.priority}`}>
      <div className="next-action-head">
        <div>
          <span>Senal a revisar</span>
          <strong>{action.text}</strong>
        </div>
        <span className={`priority-pill ${action.priority}`}>{priorityLabel(action.priority)}</span>
      </div>
      {action.reason ? <p>{action.reason}</p> : null}
      <dl className="next-action-grid">
        <div>
          <dt>Area detectada</dt>
          <dd>{action.owner ?? order.pause_owner ?? "-"}</dd>
        </div>
        <div>
          <dt>Maquina</dt>
          <dd>{action.machine_name ?? order.last_machine_name ?? "-"}</dd>
        </div>
        <div>
          <dt>Operacion</dt>
          <dd>{action.operation ?? order.current_operation ?? "-"}</dd>
        </div>
        <div>
          <dt>Lote / palet</dt>
          <dd>{affectedTrace}</dd>
        </div>
        <div>
          <dt>Incidencia</dt>
          <dd>{issue}</dd>
        </div>
        <div>
          <dt>Ultima senal</dt>
          <dd>{formatDateTime(action.last_signal_at ?? order.last_activity_at)}</dd>
        </div>
      </dl>
    </section>
  );
}

function OrderBusinessDescription({ order }: { order: ProductionOrder }) {
  const lineCount = order.lines.length || 1;
  const pendingQuantity = Math.max(0, order.planned_quantity - order.produced_quantity);
  const saleText = formatCurrency(order.sale_amount_eur, order.currency_code);
  const marginText =
    order.margin_amount_eur === null || order.margin_amount_eur === undefined
      ? null
      : `${formatCurrency(order.margin_amount_eur, order.currency_code)} (${formatPercent(order.margin_percent)})`;
  const traceParts = [
    order.linked_lot_ids.length ? `${order.linked_lot_ids.length} lotes/PM` : "",
    order.linked_pallet_ids.length ? `${order.linked_pallet_ids.length} palets/cajones` : ""
  ].filter(Boolean);
  const traceText = traceParts.length ? traceParts.join(" y ") : "los identificadores de produccion disponibles";
  const routeText =
    order.incoterm || order.destination
      ? `Condicion comercial ${order.incoterm ?? "pendiente"}${order.destination ? ` con destino ${order.destination}` : ""}.`
      : "Condicion comercial y destino pendientes de completar.";

  return (
    <section className="business-description">
      <span>Descripcion operativa</span>
      <p>
        Pedido comercial de {lineCount} {lineCount === 1 ? "partida" : "partidas"} para {order.client}: se han fabricado{" "}
        {formatNumber(order.produced_quantity, order.unit)} de {formatNumber(order.planned_quantity, order.unit)} y quedan{" "}
        {formatNumber(pendingQuantity, order.unit)} por completar. La venta prevista es {saleText}
        {marginText ? ` con un margen previsto de ${marginText}` : ""}, con trazabilidad sobre {traceText}. {routeText}
      </p>
    </section>
  );
}

function OrderLines({ order }: { order: ProductionOrder }) {
  const lines: ProductionOrder["lines"] = order.lines.length
    ? order.lines
    : [
        {
          id: order.id,
          title: order.title,
          description: order.description,
          planned_quantity: order.planned_quantity,
          produced_quantity: order.produced_quantity,
          unit: order.unit,
          percent_produced: order.percent_produced,
          sale_price_eur_m2: order.sale_price_eur_m2,
          cost_price_eur_m2: order.cost_price_eur_m2,
          sale_amount_eur: order.sale_amount_eur,
          cost_amount_eur: order.cost_amount_eur,
          margin_amount_eur: order.margin_amount_eur,
          margin_percent: order.margin_percent,
          currency_code: order.currency_code,
          material_code: order.material_code,
          material_name: order.material_name,
          material_family: order.material_family,
          linked_lot_ids: order.linked_lot_ids,
          linked_pallet_ids: order.linked_pallet_ids
        }
      ];
  return (
    <div className="order-lines-block">
      <span>Partidas</span>
      <div className="order-lines-cards" aria-label="Partidas">
        {lines.map((line) => {
          const materialVisual = resolveMaterialVisual({
            code: line.material_code,
            name: line.material_name,
            family: line.material_family,
            fallbackText: line.title
          });
          return (
            <article className="order-line-card" key={line.id}>
              <div className="order-line-card-header">
                <img className="material-avatar" src={materialVisual.textureUrl} alt="" title={materialVisual.label} />
                <div className="order-line-card-title">
                  <strong>{line.title}</strong>
                </div>
                <LineStateBadge line={line} />
              </div>
              <dl className="order-line-card-metrics">
                <div>
                  <dt>Cantidad</dt>
                  <dd>{formatNumber(line.planned_quantity, line.unit)}</dd>
                </div>
                <div>
                  <dt>Avance</dt>
                  <dd>{formatPercent(line.percent_produced)}</dd>
                </div>
                <div>
                  <dt>Venta</dt>
                  <dd>{formatCurrencyPerM2(line.sale_price_eur_m2, line.currency_code, line.unit)}</dd>
                </div>
                <div>
                  <dt>Coste</dt>
                  <dd>{formatCurrencyPerM2(line.cost_price_eur_m2, line.currency_code, line.unit)}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function LineStateBadge({ line }: { line: ProductionOrder["lines"][number] }) {
  const completed = line.percent_produced >= 99.5;
  const started = line.produced_quantity > 0 || line.percent_produced > 0;
  const stateKey = completed ? "done" : started ? "active" : "pending";
  const stateLabel = completed ? "Completada" : started ? "En curso" : "Pendiente";
  return (
    <span className={`line-state ${stateKey}`} title={stateLabel} aria-label={stateLabel}>
      {completed ? <CheckCircle2 size={15} /> : started ? <Clock size={15} /> : <ClipboardList size={15} />}
      <span>{stateLabel}</span>
    </span>
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
            <span>{statusLabelForStage(stage.status)}</span>
          </div>
          <small>{stage.produced_quantity ? formatNumber(stage.produced_quantity, stage.unit) : formatTime(stage.last_record_at)}</small>
        </div>
      ))}
    </div>
  );
}

function MachinesView({ machines, summary }: { machines: MachineStatus[]; summary: ProductionSummary | null }) {
  return (
    <section className="machine-view" id="maquinas" aria-label="Estado por maquina">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Produccion por hora</h2>
            <p>Lectura agregada por maquina; el aserrado se muestra como m2 equivalentes (39 m2 por m3).</p>
          </div>
          <Activity size={18} />
        </div>
        <HourlyChart summary={summary} />
      </section>

      {machines.length ? (
        <section className="machines-grid" aria-label="Maquinas">
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
                  <dt>Ultima senal</dt>
                  <dd>{formatTime(machine.last_record_at)}</dd>
                </div>
                <div>
                  <dt>Lote / PM</dt>
                  <dd>{machine.last_lot_id ?? "-"}</dd>
                </div>
                <div>
                  <dt>Produccion</dt>
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
      ) : (
        <section className="panel">
          <div className="empty-state">Sin senales de maquinas en esta ventana.</div>
        </section>
      )}
    </section>
  );
}

function DataView({
  records,
  filters,
  machines,
  unknowns,
  onFiltersChange,
  onClearFilters
}: {
  records: ProductionRecord[];
  filters: RecordFilters;
  machines: Array<{ id: string; name: string }>;
  unknowns: UnknownMapping[];
  onFiltersChange: (filters: RecordFilters) => void;
  onClearFilters: () => void;
}) {
  return (
    <section className="data-view" id="datos" aria-label="Datos del tracker">
      <section className="panel data-unknowns-panel">
        <div className="panel-header">
          <div>
            <h2>Codigos pendientes</h2>
            <p>Lectura de operaciones, acabados, eventos o incidencias sin traducir. Se resuelven fuera de PulyTrack.</p>
          </div>
          <AlertTriangle size={18} />
        </div>
        <UnknownsList unknowns={unknowns} />
      </section>

      <section className="panel data-records-panel">
        <div className="panel-header">
          <div>
            <h2>Ultimos registros</h2>
            <p>Filtros de consulta para lote/PM, palet/cajon, material, operario y operacion.</p>
          </div>
          <Filter size={18} />
        </div>
        <FilterBar filters={filters} machines={machines} onChange={onFiltersChange} onClear={onClearFilters} />
        <RecordsTable records={records} />
      </section>
    </section>
  );
}

function TraceSection({
  traceQuery,
  trace,
  onQueryChange,
  onRunTrace
}: {
  traceQuery: string;
  trace: TraceResponse | null;
  onQueryChange: (query: string) => void;
  onRunTrace: () => Promise<void>;
}) {
  return (
    <section className="panel trace-panel" id="trazabilidad">
      <div className="panel-header">
        <div>
          <h2>Trazabilidad lote / palet</h2>
          <p>Busca un PM, lote, palet o cajon y revisa su recorrido cronologico por maquinas.</p>
        </div>
        <Search size={18} />
      </div>
      <div className="trace-search">
        <input value={traceQuery} onChange={(event) => onQueryChange(event.target.value)} placeholder="Ej. CM-48120 o AC1048-60-001" />
        <button type="button" onClick={() => void onRunTrace()}>
          <Search size={16} />
          Buscar
        </button>
      </div>
      <TraceTimeline trace={trace} />
    </section>
  );
}

function statusLabel(status: ProductionStatus): string {
  const labels: Record<ProductionStatus, string> = {
    sin_datos: "Sin datos",
    en_cola: "En cola",
    en_produccion: "Produciendo",
    pausado: "Pausado",
    en_riesgo: "En riesgo",
    completado: "Completado"
  };
  return labels[status];
}

function priorityLabel(priority: "alta" | "media" | "baja" | "ninguna"): string {
  return {
    alta: "Alta",
    media: "Media",
    baja: "Baja",
    ninguna: "Sin senal"
  }[priority];
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

// Rendimiento documentado del aserrado: 38-40 m2 de tabla por m3 de bloque.
const M2_EQUIVALENT_PER_M3 = 39;

function HourlyChart({ summary }: { summary: ProductionSummary | null }) {
  const buckets = summary?.production_by_hour ?? [];
  const maxValue = Math.max(1, ...buckets.map((bucket) => bucket.area_m2 + bucket.volume_m3 * M2_EQUIVALENT_PER_M3));
  if (buckets.length === 0) {
    return <div className="empty-state">Sin registros para graficar en esta ventana.</div>;
  }
  return (
    <div className="bar-chart">
      {buckets.map((bucket) => {
        const value = bucket.area_m2 + bucket.volume_m3 * M2_EQUIVALENT_PER_M3;
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
    return <div className="empty-state">Sin codigos pendientes en los datos cargados.</div>;
  }

  return (
    <div className="unknown-list readonly">
      {unknowns.map((item) => (
        <div className={`unknown-row ${item.action}`} key={`${item.kind}-${item.machine_id}-${item.code}`}>
          <div className="unknown-main">
            <span>{unknownKindLabel(item.kind)}</span>
            <strong>{item.code}</strong>
            <small>{item.machine_name} - {item.count} registro(s)</small>
            <small>Primero {formatDateTime(item.first_seen)} - ultimo {formatDateTime(item.last_seen)}</small>
          </div>
          <span className={`mapping-state ${item.action}`}>{unknownStateLabel(item)}</span>
        </div>
      ))}
    </div>
  );
}

function unknownKindLabel(kind: UnknownMapping["kind"]): string {
  return {
    operation: "Operacion",
    finish: "Acabado",
    event: "Evento",
    incidence: "Incidencia"
  }[kind];
}

function unknownStateLabel(item: UnknownMapping): string {
  if (item.mapped_label) {
    return item.mapped_label;
  }
  if (item.action === "preguntar_a_indasel") {
    return "Pendiente INDASEL";
  }
  if (item.action === "mapear") {
    return "Etiqueta local";
  }
  if (item.action === "ignorar") {
    return "Revisado fuera";
  }
  return "Pendiente fuera de PulyTrack";
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
    return <div className="empty-state">Introduce un lote/PM o palet/cajon para ver su recorrido.</div>;
  }
  if (trace.steps.length === 0) {
    return <div className="empty-state">Sin movimientos para {trace.query}.</div>;
  }
  return (
    <>
      {trace.match_mode === "partial" ? (
        <div className="empty-state">
          Sin coincidencia exacta para {trace.query}: se muestran identificadores que la contienen.
        </div>
      ) : null}
      <div className="timeline">
      {trace.steps.map((step) => (
        <div className="timeline-step" key={step.id}>
          <div className="timeline-marker" />
          <div>
            <p>{formatDateTime(step.timestamp)} - {step.machine_name}</p>
            <strong>{step.operation_label ?? step.finish_label ?? step.operation_code ?? step.finish_code ?? "Registro"}</strong>
            <span>
              Lote/PM {step.lot_id ?? "-"} - Palet/cajon {[step.pallet_in, step.pallet_out].filter(Boolean).join(" -> ") || "-"} - {formatNumber(step.quantity, step.unit)}
            </span>
          </div>
        </div>
      ))}
      </div>
    </>
  );
}
