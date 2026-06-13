export type WindowMode = "today" | "shift";

export interface HealthResponse {
  status: "ok" | "degraded";
  data_mode: "mock" | "sql";
  read_only: boolean;
  database_connected: boolean;
  refresh_seconds: number;
  shift_schedule_configured: boolean;
  message: string;
}

export interface Dimensions {
  length_mm: number | null;
  height_mm: number | null;
  thickness_mm: number | null;
}

export interface ProductionRecord {
  id: string;
  commercial_order_id: string | null;
  order_id: string | null;
  order_title: string | null;
  order_description: string | null;
  client_name: string | null;
  order_planned_quantity: number | null;
  order_unit: string | null;
  order_sale_price_eur_m2: number | null;
  order_cost_price_eur_m2: number | null;
  order_currency_code: string | null;
  order_incoterm: string | null;
  order_destination: string | null;
  order_committed_date: string | null;
  machine_id: string;
  machine_name: string;
  timestamp: string;
  operators: string[];
  lot_id: string | null;
  pallet_in: string | null;
  pallet_out: string | null;
  material_code: string | null;
  material_name: string | null;
  material_family: string | null;
  dimensions: Dimensions;
  quantity: number;
  unit: string;
  operation_code: string | null;
  operation_label: string | null;
  finish_code: string | null;
  finish_label: string | null;
  consumption_kwh_total: number | null;
  consumption_kwh_delta: number | null;
  event_code: string | null;
  event_label: string | null;
  incidence_code: string | null;
  incidence_label: string | null;
  consumables: Record<string, number | null>;
  raw_payload: Record<string, unknown>;
}

export interface MachineStatus {
  id: string;
  name: string;
  family: string;
  unit: string;
  active: boolean;
  last_record_at: string | null;
  last_lot_id: string | null;
  records_today: number;
  quantity_today: number;
  area_m2_today: number;
  volume_m3_today: number;
  consumption_kwh_today: number;
  incidence_count_today: number;
}

export interface Kpi {
  label: string;
  value: number;
  unit: string;
  help: string;
}

export interface MachineSummary {
  machine_id: string;
  machine_name: string;
  records: number;
  quantity: number;
  area_m2: number;
  volume_m3: number;
  consumption_kwh: number;
  incidents: number;
}

export interface TimeBucket {
  bucket: string;
  machine_id: string;
  machine_name: string;
  quantity: number;
  area_m2: number;
  volume_m3: number;
  records: number;
}

export interface ProductionSummary {
  window: WindowMode;
  window_start: string;
  window_end: string;
  generated_at: string;
  kpis: Kpi[];
  by_machine: MachineSummary[];
  production_by_hour: TimeBucket[];
}

export type ProductionStatus = "sin_datos" | "en_cola" | "en_produccion" | "pausado" | "en_riesgo" | "completado";

export type StageStatus = "pending" | "active" | "done" | "blocked";

export interface OrderStage {
  label: string;
  status: StageStatus;
  produced_quantity: number;
  unit: string;
  machine_names: string[];
  last_record_at: string | null;
}

export type ActionPriority = "alta" | "media" | "baja" | "ninguna";

export interface NextAction {
  priority: ActionPriority;
  text: string;
  reason: string | null;
  owner: string | null;
  machine_name: string | null;
  operation: string | null;
  lot_id: string | null;
  pallet_id: string | null;
  incidence_code: string | null;
  incidence_label: string | null;
  last_signal_at: string | null;
}

export interface ProductionOrderLine {
  id: string;
  title: string;
  description: string;
  planned_quantity: number;
  produced_quantity: number;
  unit: string;
  percent_produced: number;
  sale_price_eur_m2: number | null;
  cost_price_eur_m2: number | null;
  sale_amount_eur: number | null;
  cost_amount_eur: number | null;
  margin_amount_eur: number | null;
  margin_percent: number | null;
  currency_code: string;
  material_code: string | null;
  material_name: string | null;
  material_family: string | null;
  linked_lot_ids: string[];
  linked_pallet_ids: string[];
}

export interface ProductionOrder {
  id: string;
  commercial_order_id: string | null;
  title: string;
  description: string;
  client: string;
  production_status: ProductionStatus;
  percent_produced: number;
  planned_quantity: number;
  produced_quantity: number;
  unit: string;
  sale_price_eur_m2: number | null;
  cost_price_eur_m2: number | null;
  sale_amount_eur: number | null;
  cost_amount_eur: number | null;
  margin_amount_eur: number | null;
  margin_percent: number | null;
  currency_code: string;
  incoterm: string | null;
  destination: string | null;
  material_code: string | null;
  material_name: string | null;
  material_family: string | null;
  committed_date: string | null;
  estimated_completion_at: string | null;
  last_activity_at: string | null;
  active_machine: string | null;
  last_machine_name: string | null;
  current_operation: string | null;
  incidence_count: number;
  pause_reason: string | null;
  pause_owner: string | null;
  next_action: NextAction | null;
  linked_lot_ids: string[];
  linked_pallet_ids: string[];
  stages: OrderStage[];
  lines: ProductionOrderLine[];
}

export interface TraceResponse {
  query: string;
  match_mode: "exact" | "partial" | "none";
  steps: ProductionRecord[];
}

export interface UnknownMapping {
  kind: "operation" | "finish" | "event" | "incidence";
  code: string;
  machine_id: string;
  machine_name: string;
  count: number;
  first_seen: string;
  last_seen: string;
  action: MappingAction;
  note: string | null;
  mapped_label: string | null;
  updated_at: string | null;
}

export type MappingAction = "pendiente" | "mapear" | "ignorar" | "preguntar_a_indasel";

export interface RecordFilters {
  machine_id: string;
  lot_id: string;
  pallet: string;
  material_code: string;
  operator: string;
  operation_code: string;
}
