import type { LatLng } from "@/components/AdventureMap";

/* ──────────────────────────────────────────────────────────────────────────
 *  Pure navigation maths — no react-native-maps, web-safe.
 *  Used by route-to-trailhead, follow-route and retrace-to-car guidance.
 * ────────────────────────────────────────────────────────────────────────── */

const R = 6371000; // earth radius, metres
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance between two points in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Initial bearing from a → b, degrees clockwise from true north (0–360). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** Nearest 8-point compass label for a bearing in degrees. */
export function compass8(deg: number): string {
  const i = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return COMPASS_8[i];
}

/** Total length of a path in metres. */
export function pathLengthMeters(path: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += haversineMeters(path[i - 1], path[i]);
  return total;
}

/**
 * Project a point onto a segment a→b using a local equirectangular
 * approximation (accurate over the short distances we care about) and
 * return the closest point on the segment.
 */
function snapToSegment(p: LatLng, a: LatLng, b: LatLng): LatLng {
  const latRef = toRad((a.latitude + b.latitude) / 2);
  const ax = toRad(a.longitude) * Math.cos(latRef);
  const ay = toRad(a.latitude);
  const bx = toRad(b.longitude) * Math.cos(latRef);
  const by = toRad(b.latitude);
  const px = toRad(p.longitude) * Math.cos(latRef);
  const py = toRad(p.latitude);

  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return a;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}

export interface NearestOnPath {
  /** Closest point on the path to the query point. */
  snapped: LatLng;
  /** Index of the start vertex of the closest segment. */
  segmentIndex: number;
  /** Cross-track distance from the query point to the path, metres. */
  distanceMeters: number;
}

/** Find the closest point on a polyline path to a given point. */
export function nearestOnPath(point: LatLng, path: LatLng[]): NearestOnPath {
  if (path.length === 0) {
    return { snapped: point, segmentIndex: 0, distanceMeters: 0 };
  }
  if (path.length === 1) {
    return {
      snapped: path[0],
      segmentIndex: 0,
      distanceMeters: haversineMeters(point, path[0]),
    };
  }
  let best: NearestOnPath = {
    snapped: path[0],
    segmentIndex: 0,
    distanceMeters: Infinity,
  };
  for (let i = 0; i < path.length - 1; i++) {
    const snapped = snapToSegment(point, path[i], path[i + 1]);
    const d = haversineMeters(point, snapped);
    if (d < best.distanceMeters) {
      best = { snapped, segmentIndex: i, distanceMeters: d };
    }
  }
  return best;
}

export interface RouteState {
  /** Cross-track distance from the user to the route line, metres. */
  offsetMeters: number;
  /** Distance still to travel to the destination (end of path), metres. */
  remainingMeters: number;
  /** Next vertex on the path to steer toward. */
  nextPoint: LatLng;
  /** Final destination (last vertex of the path). */
  destination: LatLng;
  /** Bearing from the user to the next point, degrees from true north. */
  bearingToNext: number;
  /** True when the user has strayed further than the off-route threshold. */
  offRoute: boolean;
  /** True once the user is within arrivalRadius of the destination. */
  arrived: boolean;
}

export interface RouteStateOpts {
  /** Cross-track distance beyond which we flag "off route" (default 40 m). */
  offRouteMeters?: number;
  /** Distance within which we consider the destination reached (default 25 m). */
  arrivalMeters?: number;
}

/**
 * Compute live guidance state for a user position against a path.
 * The destination is always the LAST vertex of `path`, so callers pass the
 * forward route to follow it, or the reversed breadcrumb to retrace.
 */
export function routeState(
  user: LatLng,
  path: LatLng[],
  opts: RouteStateOpts = {},
): RouteState | null {
  if (path.length < 1) return null;
  const offRouteMeters = opts.offRouteMeters ?? 40;
  const arrivalMeters = opts.arrivalMeters ?? 25;
  const destination = path[path.length - 1];

  if (path.length === 1) {
    const d = haversineMeters(user, destination);
    return {
      offsetMeters: d,
      remainingMeters: d,
      nextPoint: destination,
      destination,
      bearingToNext: bearingDeg(user, destination),
      offRoute: false,
      arrived: d <= arrivalMeters,
    };
  }

  const near = nearestOnPath(user, path);
  // Remaining distance: from the snapped point to the end of the path.
  let remaining = haversineMeters(near.snapped, path[near.segmentIndex + 1]);
  for (let i = near.segmentIndex + 1; i < path.length - 1; i++) {
    remaining += haversineMeters(path[i], path[i + 1]);
  }

  const nextPoint = path[near.segmentIndex + 1] ?? destination;
  const distToDest = haversineMeters(user, destination);

  return {
    offsetMeters: near.distanceMeters,
    remainingMeters: remaining,
    nextPoint,
    destination,
    bearingToNext: bearingDeg(user, nextPoint),
    offRoute: near.distanceMeters > offRouteMeters,
    arrived: distToDest <= arrivalMeters,
  };
}
