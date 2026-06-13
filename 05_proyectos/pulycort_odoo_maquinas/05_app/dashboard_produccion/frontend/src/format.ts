export const numberFmt = {
  format: (value: number) => formatDecimal(value)
};

function formatDecimal(value: number): string {
  const fixed = value.toFixed(2).replace(/\.?0+$/, "");
  const [integerPart, decimalPart] = fixed.split(".");
  const sign = integerPart.startsWith("-") ? "-" : "";
  const integer = sign ? integerPart.slice(1) : integerPart;
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${grouped}${decimalPart ? `,${decimalPart}` : ""}`;
}

export function formatNumber(value: number | null | undefined, unit = ""): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  const formattedUnit = formatUnit(unit);
  return `${numberFmt.format(value)}${formattedUnit ? ` ${formattedUnit}` : ""}`;
}

export function formatCurrency(value: number | null | undefined, currencyCode = "EUR"): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  const symbol = currencySymbol(currencyCode);
  return symbol ? `${numberFmt.format(value)} ${symbol}` : numberFmt.format(value);
}

export function formatCurrencyPerM2(value: number | null | undefined, currencyCode = "EUR", unit = "M2"): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  const symbol = currencySymbol(currencyCode);
  return symbol ? `${numberFmt.format(value)} ${symbol}/${formatUnit(unit) || "m²"}` : `${numberFmt.format(value)}/${formatUnit(unit) || "m²"}`;
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

export function formatLongDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  const weekday = capitalize(new Intl.DateTimeFormat("es-ES", { weekday: "long" }).format(date));
  const day = new Intl.DateTimeFormat("es-ES", { day: "numeric" }).format(date);
  const month = capitalize(new Intl.DateTimeFormat("es-ES", { month: "long" }).format(date));
  const time = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
  return `${weekday} ${day} de ${month}, ${time}`;
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

export function formatUnit(unit = ""): string {
  const normalized = unit.trim().toLowerCase();
  if (normalized === "m2" || normalized === "m²") {
    return "m²";
  }
  if (normalized === "m3" || normalized === "m³") {
    return "m³";
  }
  return unit;
}

function currencySymbol(currencyCode = "EUR"): string {
  const normalized = currencyCode.trim().toUpperCase();
  if (normalized === "EUR") {
    return "€";
  }
  if (normalized === "USD") {
    return "US$";
  }
  if (normalized === "MIX") {
    return "";
  }
  return normalized;
}

function capitalize(value: string): string {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}
