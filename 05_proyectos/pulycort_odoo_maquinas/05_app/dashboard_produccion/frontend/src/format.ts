export const numberFmt = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 2
});

export function formatNumber(value: number | null | undefined, unit = ""): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${numberFmt.format(value)}${unit ? ` ${unit}` : ""}`;
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${numberFmt.format(value)} EUR`;
}

export function formatCurrencyPerM2(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${numberFmt.format(value)} EUR/m2`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${numberFmt.format(value)}%`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatDimensions(length?: number | null, height?: number | null, thickness?: number | null): string {
  const parts = [length, height, thickness].filter((item) => item !== null && item !== undefined);
  if (parts.length === 0) {
    return "-";
  }
  return parts.map((item) => numberFmt.format(item as number)).join(" x ");
}
