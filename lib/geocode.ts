import type { LatLng } from "@/components/AdventureMap";

export interface PlaceResult {
  id: string;
  name: string;
  detail: string;
  latitude: number;
  longitude: number;
}

/**
 * Parse a raw coordinate string into a LatLng, or null if it isn't one.
 * Accepts decimal degrees in many shapes:
 *   "38.5733, -109.5498"  ·  "38.5733 -109.5498"
 *   "25.3°N, 56.1°E"      ·  "25.3 N 56.1 E"
 */
export function parseCoordinates(raw: string): LatLng | null {
  const s = raw.trim();
  if (!s) return null;

  // Capture two signed decimals, each optionally followed by a hemisphere letter.
  const re =
    /^\s*(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([NSns])?\s*[,;]?\s+(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([EWew])?\s*$/;
  const m = s.match(re);
  if (!m) return null;

  let lat = parseFloat(m[1]);
  let lon = parseFloat(m[3]);
  const latHemi = m[2]?.toUpperCase();
  const lonHemi = m[4]?.toUpperCase();

  if (latHemi === "S") lat = -Math.abs(lat);
  if (latHemi === "N") lat = Math.abs(lat);
  if (lonHemi === "W") lon = -Math.abs(lon);
  if (lonHemi === "E") lon = Math.abs(lon);

  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  return { latitude: lat, longitude: lon };
}

interface OpenMeteoResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
  feature_code?: string;
}

/**
 * Forward-geocode a place name using the Open-Meteo geocoding API.
 * Free, key-less, web-compatible, commercial-use OK (CC-BY).
 */
export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    q,
  )}&count=8&language=en&format=json`;

  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: OpenMeteoResult[] };
  if (!data.results) return [];

  return data.results.map((r) => ({
    id: String(r.id),
    name: r.name,
    detail: [r.admin1, r.country].filter(Boolean).join(", "),
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}

/** Great-circle distance between two points in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
