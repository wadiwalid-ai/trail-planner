export type UnitSystem = "metric" | "imperial";
export type TempUnit = "C" | "F";

const M_PER_MI = 1609.344;
const M_PER_FT = 0.3048;

function fmtNum(n: number, decimals: number): string {
  const fixed = n.toFixed(decimals);
  // Strip trailing ".0" for whole numbers
  const trimmed = decimals > 0 ? fixed.replace(/\.0+$/, "") : fixed;
  // Thousands separators
  const [intPart, decPart] = trimmed.split(".");
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart ? `${withSep}.${decPart}` : withSep;
}

/**
 * Format a distance given in meters. Returns null if the input is null/undefined
 * so callers can fall back to a legacy display string.
 */
export function formatDistance(
  meters: number | null | undefined,
  system: UnitSystem,
): string | null {
  if (meters == null || isNaN(meters)) return null;
  if (system === "imperial") {
    const mi = meters / M_PER_MI;
    if (mi < 0.1) return `${Math.round(meters / M_PER_FT)} ft`;
    return `${fmtNum(mi, mi < 10 ? 1 : 0)} mi`;
  }
  const km = meters / 1000;
  if (km < 1) return `${Math.round(meters)} m`;
  return `${fmtNum(km, km < 10 ? 1 : 0)} km`;
}

/**
 * Format an elevation/altitude value given in meters.
 */
export function formatElevation(
  meters: number | null | undefined,
  system: UnitSystem,
): string | null {
  if (meters == null || isNaN(meters)) return null;
  if (system === "imperial") {
    return `${fmtNum(Math.round(meters / M_PER_FT), 0)} ft`;
  }
  return `${fmtNum(Math.round(meters), 0)} m`;
}

/**
 * Format a speed given in meters/second.
 */
export function formatSpeed(
  metersPerSecond: number | null | undefined,
  system: UnitSystem,
): string | null {
  if (metersPerSecond == null || isNaN(metersPerSecond)) return null;
  const safe = Math.max(0, metersPerSecond);
  if (system === "imperial") {
    return `${fmtNum((safe * 3600) / M_PER_MI, 1)} mph`;
  }
  return `${fmtNum((safe * 3600) / 1000, 1)} km/h`;
}

/**
 * Format a duration given in seconds as a compact human label, e.g. "4h 12m".
 */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || isNaN(seconds)) return null;
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m} min`;
  return `${s}s`;
}

/**
 * Format a duration as a clock timer (used while recording): "MM:SS" or "H:MM:SS".
 */
export function formatTimer(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(seconds ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Format a temperature given in degrees Celsius (the canonical unit we store)
 * into the user's chosen unit. Returns null for null/NaN input.
 */
export function formatTemperature(
  celsius: number | null | undefined,
  unit: TempUnit,
): string | null {
  if (celsius == null || isNaN(celsius)) return null;
  if (unit === "F") {
    return `${Math.round((celsius * 9) / 5 + 32)}°F`;
  }
  return `${Math.round(celsius)}°C`;
}

export const unitLabels = {
  distanceShort: (system: UnitSystem) => (system === "imperial" ? "mi" : "km"),
  elevationShort: (system: UnitSystem) => (system === "imperial" ? "ft" : "m"),
  speedShort: (system: UnitSystem) => (system === "imperial" ? "mph" : "km/h"),
  temperatureShort: (unit: TempUnit) => (unit === "F" ? "°F" : "°C"),
};
