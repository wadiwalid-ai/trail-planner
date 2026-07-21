/* ──────────────────────────────────────────────────────────────────────────
 *  Convoy geo helpers — pure, offline, web-safe.
 *  Distance / bearing math + human-readable formatters used by the Convoy
 *  member list and map overlays. All functions are pure (no imports) so they
 *  bundle cleanly on native and web.
 * ────────────────────────────────────────────────────────────────────────── */

export interface GeoPoint {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from `a` to `b`, in degrees clockwise from true north (0–360). */
export function bearingDeg(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const COMPASS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** Map a bearing in degrees to an 8-point compass label (N/NE/E/...). */
export function bearingLabel(deg: number): string {
  if (!Number.isFinite(deg)) return "";
  const normalized = ((deg % 360) + 360) % 360;
  const idx = Math.round(normalized / 45) % 8;
  return COMPASS_8[idx];
}

/**
 * Format a distance in kilometres for display.
 *  - under 1 km → whole metres ("850 m")
 *  - 1–10 km    → one decimal ("1.4 km")
 *  - ≥ 10 km    → whole km ("23 km")
 */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "—";
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  if (km < 10) {
    return `${km.toFixed(1)} km`;
  }
  return `${Math.round(km)} km`;
}

/**
 * Compact "last seen" label relative to now.
 *  - < 45s   → "now"
 *  - < 60m   → "1m", "3m"
 *  - < 24h   → "2h"
 *  - else    → "3d"
 */
export function formatLastSeen(
  date: Date | string | number | null | undefined,
): string {
  if (date == null) return "—";
  const then =
    typeof date === "string" || typeof date === "number"
      ? new Date(date).getTime()
      : date.getTime();
  if (Number.isNaN(then)) return "—";

  const diffMs = Date.now() - then;
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 45) return "now";

  const min = Math.floor(sec / 60);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;

  const day = Math.floor(hr / 24);
  return `${day}d`;
}
