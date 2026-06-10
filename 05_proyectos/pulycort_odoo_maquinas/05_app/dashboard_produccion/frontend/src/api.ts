import type {
  HealthResponse,
  MachineStatus,
  ProductionOrder,
  ProductionRecord,
  ProductionSummary,
  RecordFilters,
  TraceResponse,
  UnknownMapping,
  WindowMode
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} al cargar ${path}`);
  }
  return response.json() as Promise<T>;
}

function params(input: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const value = search.toString();
  return value ? `?${value}` : "";
}

export function getHealth(): Promise<HealthResponse> {
  return fetchJson<HealthResponse>("/api/health");
}

export function getMachines(): Promise<MachineStatus[]> {
  return fetchJson<MachineStatus[]>("/api/machines");
}

export function getSummary(window: WindowMode): Promise<ProductionSummary> {
  return fetchJson<ProductionSummary>(`/api/production/summary${params({ window })}`);
}

export function getOrders(): Promise<ProductionOrder[]> {
  return fetchJson<ProductionOrder[]>("/api/orders");
}

export function getRecords(window: WindowMode, filters: RecordFilters): Promise<ProductionRecord[]> {
  return fetchJson<ProductionRecord[]>(
    `/api/records${params({
      window,
      limit: 250,
      machine_id: filters.machine_id,
      lot_id: filters.lot_id,
      pallet: filters.pallet,
      material_code: filters.material_code,
      operator: filters.operator,
      operation_code: filters.operation_code
    })}`
  );
}

export function getTrace(query: string): Promise<TraceResponse> {
  return fetchJson<TraceResponse>(`/api/trace/${encodeURIComponent(query)}`);
}

export function getUnknownMappings(): Promise<UnknownMapping[]> {
  return fetchJson<UnknownMapping[]>("/api/mappings/unknowns");
}
