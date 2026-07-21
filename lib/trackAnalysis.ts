/**
 * Pure track-analysis helpers shared by the recorder, the track-detail screen,
 * and the server. No React or react-native-maps imports so it is safe to bundle
 * everywhere (native, web, and Node).
 */

export interface TrackPoint {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  speed?: number | null; // meters/second
  timestampMs?: number | null;
  accuracy?: number | null;
}

const R_EARTH_M = 6371000;

export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R_EARTH_M * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Cumulative along-track distance in meters at each point (point 0 = 0). */
export function cumulativeDistances(points: TrackPoint[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    out.push(out[i - 1] + haversineMeters(points[i - 1], points[i]));
  }
  return out;
}

export interface TrackStats {
  pointCount: number;
  distanceMeters: number;
  durationSeconds: number | null;
  elevationGainMeters: number | null;
  elevationLossMeters: number | null;
  minAltitudeMeters: number | null;
  maxAltitudeMeters: number | null;
  avgSpeedMps: number | null;
  maxSpeedMps: number | null;
  startTimeMs: number | null;
  endTimeMs: number | null;
}

/** Small noise floor so GPS jitter doesn't inflate elevation gain. */
const ELEV_NOISE_FLOOR_M = 1.5;

export function computeStats(points: TrackPoint[]): TrackStats {
  const distances = cumulativeDistances(points);
  const distanceMeters = distances[distances.length - 1] ?? 0;

  const times = points
    .map((p) => (typeof p.timestampMs === "number" ? p.timestampMs : null))
    .filter((t): t is number => t != null);
  const startTimeMs = times.length > 0 ? Math.min(...times) : null;
  const endTimeMs = times.length > 0 ? Math.max(...times) : null;
  const durationSeconds =
    startTimeMs != null && endTimeMs != null
      ? Math.round((endTimeMs - startTimeMs) / 1000)
      : null;

  const alts = points
    .map((p) => (typeof p.altitude === "number" ? p.altitude : null))
    .filter((a): a is number => a != null);

  let elevationGainMeters: number | null = null;
  let elevationLossMeters: number | null = null;
  let minAltitudeMeters: number | null = null;
  let maxAltitudeMeters: number | null = null;
  if (alts.length >= 2) {
    let gain = 0;
    let loss = 0;
    for (let i = 1; i < alts.length; i++) {
      const delta = alts[i] - alts[i - 1];
      if (delta > ELEV_NOISE_FLOOR_M) gain += delta;
      else if (delta < -ELEV_NOISE_FLOOR_M) loss += -delta;
    }
    elevationGainMeters = Math.round(gain);
    elevationLossMeters = Math.round(loss);
    minAltitudeMeters = Math.round(Math.min(...alts));
    maxAltitudeMeters = Math.round(Math.max(...alts));
  }

  // Prefer device-reported speed; fall back to distance/time average.
  const speeds = points
    .map((p) => (typeof p.speed === "number" && p.speed >= 0 ? p.speed : null))
    .filter((s): s is number => s != null);
  const maxSpeedMps = speeds.length > 0 ? Math.max(...speeds) : null;
  let avgSpeedMps: number | null = null;
  if (durationSeconds && durationSeconds > 0) {
    avgSpeedMps = distanceMeters / durationSeconds;
  } else if (speeds.length > 0) {
    avgSpeedMps = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  }

  return {
    pointCount: points.length,
    distanceMeters,
    durationSeconds,
    elevationGainMeters,
    elevationLossMeters,
    minAltitudeMeters,
    maxAltitudeMeters,
    avgSpeedMps,
    maxSpeedMps,
    startTimeMs,
    endTimeMs,
  };
}

/**
 * A contiguous run of track points flagged as technically demanding.
 * Indices are inclusive and reference the original points array.
 */
export interface TechnicalSection {
  startIdx: number;
  endIdx: number;
  reason: "steep" | "slow" | "steep+slow";
  maxGradePct: number; // signed-magnitude max |grade| in the section, as %
  lengthMeters: number;
}

const STEEP_GRADE_PCT = 12; // |slope| above this is "steep"
const SLOW_SPEED_MPS = 1.4; // crawling pace while still moving (~5 km/h)
const MOVING_SPEED_MPS = 0.4; // below this we treat as stopped, not "slow"
const MIN_SECTION_METERS = 25; // ignore single-sample blips shorter than this

/** Per-segment grade in percent (0 when altitude/horizontal data missing). */
function segmentGradePct(a: TrackPoint, b: TrackPoint, horizM: number): number {
  if (
    horizM < 1 ||
    typeof a.altitude !== "number" ||
    typeof b.altitude !== "number"
  ) {
    return 0;
  }
  return ((b.altitude - a.altitude) / horizM) * 100;
}

/** Effective speed of a segment (device speed if present, else distance/time). */
function segmentSpeedMps(a: TrackPoint, b: TrackPoint, horizM: number): number | null {
  const sa = typeof a.speed === "number" && a.speed >= 0 ? a.speed : null;
  const sb = typeof b.speed === "number" && b.speed >= 0 ? b.speed : null;
  if (sa != null && sb != null) return (sa + sb) / 2;
  if (sb != null) return sb;
  if (sa != null) return sa;
  if (
    typeof a.timestampMs === "number" &&
    typeof b.timestampMs === "number" &&
    b.timestampMs > a.timestampMs
  ) {
    return horizM / ((b.timestampMs - a.timestampMs) / 1000);
  }
  return null;
}

/**
 * Heuristically flag technical sections from per-segment slope and speed.
 * A segment is "steep" when |grade| exceeds STEEP_GRADE_PCT, and "slow" when the
 * vehicle is moving but crawling. Adjacent flagged segments are merged and runs
 * shorter than MIN_SECTION_METERS are discarded so isolated GPS blips are ignored.
 */
export function detectTechnicalSections(points: TrackPoint[]): TechnicalSection[] {
  if (points.length < 3) return [];

  type SegFlag = { steep: boolean; slow: boolean; gradePct: number; lenM: number };
  const segs: SegFlag[] = [];
  for (let i = 1; i < points.length; i++) {
    const horizM = haversineMeters(points[i - 1], points[i]);
    const gradePct = segmentGradePct(points[i - 1], points[i], horizM);
    const speed = segmentSpeedMps(points[i - 1], points[i], horizM);
    const steep = Math.abs(gradePct) >= STEEP_GRADE_PCT;
    const slow =
      speed != null && speed >= MOVING_SPEED_MPS && speed <= SLOW_SPEED_MPS;
    segs.push({ steep, slow, gradePct, lenM: horizM });
  }

  const sections: TechnicalSection[] = [];
  let run: { start: number; end: number; steep: boolean; slow: boolean; maxGrade: number; len: number } | null =
    null;

  const flush = () => {
    if (!run) return;
    if (run.len >= MIN_SECTION_METERS) {
      const reason: TechnicalSection["reason"] =
        run.steep && run.slow ? "steep+slow" : run.steep ? "steep" : "slow";
      sections.push({
        startIdx: run.start,
        endIdx: run.end,
        reason,
        maxGradePct: Math.round(run.maxGrade * 10) / 10,
        lengthMeters: Math.round(run.len),
      });
    }
    run = null;
  };

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const flagged = seg.steep || seg.slow;
    // segment i connects point i and point i+1
    if (flagged) {
      if (!run) {
        run = {
          start: i,
          end: i + 1,
          steep: seg.steep,
          slow: seg.slow,
          maxGrade: Math.abs(seg.gradePct),
          len: seg.lenM,
        };
      } else {
        run.end = i + 1;
        run.steep = run.steep || seg.steep;
        run.slow = run.slow || seg.slow;
        run.maxGrade = Math.max(run.maxGrade, Math.abs(seg.gradePct));
        run.len += seg.lenM;
      }
    } else {
      flush();
    }
  }
  flush();

  return sections;
}

export interface ProfileSample {
  /** Distance from start in meters. */
  distanceMeters: number;
  altitudeMeters: number | null;
  speedMps: number | null;
}

/** Build aligned distance/altitude/speed samples for graphing. */
export function buildProfile(points: TrackPoint[]): ProfileSample[] {
  const distances = cumulativeDistances(points);
  return points.map((p, i) => ({
    distanceMeters: distances[i],
    altitudeMeters: typeof p.altitude === "number" ? p.altitude : null,
    speedMps: typeof p.speed === "number" && p.speed >= 0 ? p.speed : null,
  }));
}

export function hasElevationData(points: TrackPoint[]): boolean {
  return points.filter((p) => typeof p.altitude === "number").length >= 2;
}

export function hasSpeedData(points: TrackPoint[]): boolean {
  return points.filter((p) => typeof p.speed === "number" && p.speed >= 0).length >= 2;
}
