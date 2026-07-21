import type { LatLng } from "@/components/AdventureMap";
import { getApiUrl } from "@/lib/query-client";

/* ──────────────────────────────────────────────────────────────────────────
 *  Thin client for the server-side routing proxy (/api/route → OSRM).
 *  Used to route a driver from their current position to a trailhead.
 *  Requires connectivity; off-route detection & breadcrumb retrace work
 *  offline once a route (or recorded track) is in hand.
 * ────────────────────────────────────────────────────────────────────────── */

export interface RouteResult {
  coordinates: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  attribution: string;
}

export async function fetchRoute(from: LatLng, to: LatLng): Promise<RouteResult> {
  const url = new URL("/api/route", getApiUrl());
  url.searchParams.set("fromLat", String(from.latitude));
  url.searchParams.set("fromLon", String(from.longitude));
  url.searchParams.set("toLat", String(to.latitude));
  url.searchParams.set("toLon", String(to.longitude));

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Routing service unavailable");
  }
  const data = (await res.json()) as RouteResult;
  if (!Array.isArray(data.coordinates) || data.coordinates.length < 2) {
    throw new Error("No route found");
  }
  return data;
}
