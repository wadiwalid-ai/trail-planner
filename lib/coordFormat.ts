import type { LatLng } from "@/components/AdventureMap";

/* ──────────────────────────────────────────────────────────────────────────
 *  Offline coordinate formatting & sharing helpers.
 *  - Decimal & DMS coordinate strings
 *  - Open Location Code (plus codes) — open, offline, no API key, the open
 *    alternative to proprietary grid services like what3words.
 *  All functions are pure and web-safe.
 * ────────────────────────────────────────────────────────────────────────── */

/** Format a coordinate pair as signed decimal degrees. */
export function formatDecimal(c: LatLng, places = 5): string {
  return `${c.latitude.toFixed(places)}, ${c.longitude.toFixed(places)}`;
}

function dmsPart(value: number, positive: string, negative: string): string {
  const hemi = value >= 0 ? positive : negative;
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = (minFloat - min) * 60;
  return `${deg}°${min}'${sec.toFixed(1)}"${hemi}`;
}

/** Format a coordinate pair as degrees-minutes-seconds, e.g. 25°07'12.3"N. */
export function formatDMS(c: LatLng): string {
  return `${dmsPart(c.latitude, "N", "S")} ${dmsPart(c.longitude, "E", "W")}`;
}

// ── Open Location Code (plus codes) ──────────────────────────────────────────
// Canonical integer implementation of the open OLC spec (Apache-2.0). Runs
// fully offline — the open alternative to proprietary grid services.
const OLC_DIGITS = "23456789CFGHJMPQRVWX";
const OLC_BASE = 20;
const OLC_LAT_MAX = 90;
const OLC_LON_MAX = 180;
const OLC_SEP_POS = 8;
const OLC_PAIR_LEN = 10;
const OLC_GRID_LEN = 5;
const OLC_GRID_COLS = 4;
const OLC_GRID_ROWS = 5;
const OLC_LAT_PRECISION = Math.pow(OLC_BASE, 3) * Math.pow(OLC_GRID_ROWS, OLC_GRID_LEN); // 25,000,000
const OLC_LNG_PRECISION = Math.pow(OLC_BASE, 3) * Math.pow(OLC_GRID_COLS, OLC_GRID_LEN); // 8,192,000

/**
 * Encode a coordinate as an Open Location Code (plus code).
 * Default length 11 gives roughly 3.5 m resolution.
 */
export function encodePlusCode(c: LatLng, codeLength = 11): string {
  let lat = Math.min(Math.max(c.latitude, -90), 90);
  const lon = (((c.longitude % 360) + 540) % 360) - 180; // normalise to [-180,180)
  if (lat === 90) lat = 89.9999999;

  let latVal = Math.floor(Math.round((lat + OLC_LAT_MAX) * OLC_LAT_PRECISION * 1e6) / 1e6);
  let lngVal = Math.floor(Math.round((lon + OLC_LON_MAX) * OLC_LNG_PRECISION * 1e6) / 1e6);

  let code = "";

  // Grid refinement digits (positions 11–15).
  if (codeLength > OLC_PAIR_LEN) {
    for (let i = 0; i < OLC_GRID_LEN; i++) {
      const latDigit = latVal % OLC_GRID_ROWS;
      const lngDigit = lngVal % OLC_GRID_COLS;
      code = OLC_DIGITS.charAt(latDigit * OLC_GRID_COLS + lngDigit) + code;
      latVal = Math.floor(latVal / OLC_GRID_ROWS);
      lngVal = Math.floor(lngVal / OLC_GRID_COLS);
    }
  } else {
    latVal = Math.floor(latVal / Math.pow(OLC_GRID_ROWS, OLC_GRID_LEN));
    lngVal = Math.floor(lngVal / Math.pow(OLC_GRID_COLS, OLC_GRID_LEN));
  }

  // Pair digits (latitude + longitude alternating), base 20.
  for (let i = 0; i < OLC_PAIR_LEN / 2; i++) {
    code = OLC_DIGITS.charAt(lngVal % OLC_BASE) + code;
    code = OLC_DIGITS.charAt(latVal % OLC_BASE) + code;
    latVal = Math.floor(latVal / OLC_BASE);
    lngVal = Math.floor(lngVal / OLC_BASE);
  }

  const withSep =
    code.substring(0, OLC_SEP_POS) + "+" + code.substring(OLC_SEP_POS);
  return withSep.substring(0, codeLength + 1);
}

/** Google Maps deep link for a coordinate (opens any maps app via share). */
export function mapsLink(c: LatLng): string {
  return `https://maps.google.com/?q=${c.latitude.toFixed(6)},${c.longitude.toFixed(6)}`;
}

export interface LocationMessageInput {
  coord: LatLng;
  altitude?: number | null;
  accuracy?: number | null;
  plusCode?: string;
  landmark?: string | null;
  /** Prefix the body as an emergency SOS message. */
  sos?: boolean;
}

/** Build a plain-text location message suitable for SMS or the share sheet. */
export function buildLocationMessage(input: LocationMessageInput): string {
  const { coord, altitude, accuracy, plusCode, landmark, sos } = input;
  const lines: string[] = [];
  if (sos) {
    lines.push("🆘 SOS — I need help. My current location:");
  } else {
    lines.push("📍 My current location:");
  }
  lines.push(formatDecimal(coord, 6));
  lines.push(formatDMS(coord));
  if (plusCode) lines.push(`Plus code: ${plusCode}`);
  if (typeof altitude === "number") lines.push(`Altitude: ${Math.round(altitude)} m`);
  if (typeof accuracy === "number") lines.push(`Accuracy: ±${Math.round(accuracy)} m`);
  if (landmark) lines.push(`Near: ${landmark}`);
  lines.push(mapsLink(coord));
  return lines.join("\n");
}
