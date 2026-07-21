import { eq, and, or, ne, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  trails,
  trailCoordinates,
  trailWaypoints,
  trackMedia,
  type Trail,
  type InsertTrail,
  type TrailCoordinate,
  type TrailWaypoint,
  type AiTrailInsights,
} from "../../shared/schema";

// ── Types returned to the API layer ─────────────────────────────────────────

export interface TrailListItem {
  id: string;
  name: string;
  location: string | null;
  difficulty: number | null;
  terrain: string | null;
  distance: string | null;
  duration: string | null;
  accentColor: string | null;
  elevation: string | null;
  distanceMeters: number | null;
  elevationGainMeters: number | null;
  elevationLossMeters: number | null;
  durationSeconds: number | null;
  source: string;
  osmAttribution: boolean | null;
  activityType: string;
  visibility: string;
  ownerId: string | null;
}

export interface TrailTelemetryPoint {
  latitude: number;
  longitude: number;
  altitude: number | null;
  speed: number | null;
  timestampMs: number | null;
  accuracy: number | null;
}

export interface TrailMediaItem {
  id: string;
  uri: string;
  thumbnailUri: string | null;
  caption: string | null;
  mediaType: string; // 'photo' | 'video' | 'audio'
  latitude: number | null;
  longitude: number | null;
  takenAt: string | null;
}

export interface TrailDetail extends TrailListItem {
  description: string | null;
  shareToken: string | null;
  approachFrom: string | null;
  approachCoordinates: { latitude: number; longitude: number }[];
  trailCoordinates: { latitude: number; longitude: number }[];
  /** Per-point GPS telemetry for trail-type coordinates (recorded tracks). */
  telemetry: TrailTelemetryPoint[];
  media: TrailMediaItem[];
  waypoints: {
    id: string;
    name: string;
    description: string | null;
    type: string;
    coordinate: { latitude: number; longitude: number };
    elevation: string | null;
    gpsAltitude: number | null;
    recordedAt: string | null;
  }[];
  region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null;
  /** AI-generated trip report (narrative + difficulty + terrain tags). */
  aiInsights: AiTrailInsights | null;
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function getTrailCount(): Promise<number> {
  const result = await db.select({ id: trails.id }).from(trails).limit(1);
  if (result.length === 0) return 0;
  const full = await db.select({ id: trails.id }).from(trails);
  return full.length;
}

function toListItem(t: typeof trails.$inferSelect): TrailListItem {
  return {
    id: String(t.id),
    name: t.name,
    location: t.location,
    difficulty: t.difficulty,
    terrain: t.terrain,
    distance: t.distance,
    duration: t.duration,
    accentColor: t.accentColor,
    elevation: t.elevation,
    distanceMeters: t.distanceMeters ?? null,
    elevationGainMeters: t.elevationGainMeters ?? null,
    elevationLossMeters: t.elevationLossMeters ?? null,
    durationSeconds: t.durationSeconds ?? null,
    source: t.source,
    osmAttribution: t.osmAttribution,
    activityType: t.activityType ?? "offroad",
    visibility: t.visibility ?? "private",
    ownerId: t.uploaderUserId ?? null,
  };
}

// Explore listing: curated/OSM trails (always visible) plus community trails
// that have been made public. A user's own private/unlisted tracks are NOT
// listed here — they are returned by getTrailsForUser instead.
export async function getAllTrails(): Promise<TrailListItem[]> {
  const rows = await db
    .select()
    .from(trails)
    .where(
      and(
        eq(trails.status, "published"),
        or(ne(trails.source, "community"), eq(trails.visibility, "public")),
      ),
    );

  return rows.map(toListItem);
}

// All trails owned by a given user, regardless of visibility.
export async function getTrailsForUser(userId: string): Promise<TrailListItem[]> {
  const rows = await db
    .select()
    .from(trails)
    .where(eq(trails.uploaderUserId, userId))
    .orderBy(trails.createdAt);
  return rows.map(toListItem);
}

export interface NearbyTrail extends TrailListItem {
  latitude: number;
  longitude: number;
  distanceKm: number;
  /**
   * Simplified (downsampled) route geometry so the map can draw a faint line
   * for every nearby trail — tappable to preview — without shipping the full
   * point cloud. Empty when the trail has no stored route.
   */
  trailCoordinates: { latitude: number; longitude: number }[];
}

/**
 * Downsample a coordinate list to at most `max` points, always keeping the
 * first and last so the line still spans the full route. Cheap evenly-spaced
 * stride sampling — enough to render a recognisable shape at map scale while
 * keeping the nearby payload small.
 */
function simplifyRoute(
  coords: { latitude: number; longitude: number }[],
  max: number,
): { latitude: number; longitude: number }[] {
  if (coords.length <= max) return coords;
  const out: { latitude: number; longitude: number }[] = [];
  const stride = (coords.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    out.push(coords[Math.round(i * stride)]);
  }
  return out;
}

/**
 * Return published trails near a point, sorted by great-circle distance.
 * Only trails with a stored region centre are considered. Each result carries
 * a simplified route polyline so the map can draw and tap it directly.
 */
export async function getTrailsNearby(
  lat: number,
  lon: number,
  radiusKm: number,
  limit: number,
): Promise<NearbyTrail[]> {
  const rows = await db
    .select()
    .from(trails)
    .where(
      and(
        eq(trails.status, "published"),
        or(ne(trails.source, "community"), eq(trails.visibility, "public")),
      ),
    );

  const toRad = (d: number) => (d * Math.PI) / 180;
  const distanceKm = (aLat: number, aLon: number) => {
    const R = 6371;
    const dLat = toRad(aLat - lat);
    const dLon = toRad(aLon - lon);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat)) * Math.cos(toRad(aLat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  const ranked = rows
    .filter((t) => t.regionLat != null && t.regionLng != null)
    .map((t) => ({
      row: t,
      distanceKm: distanceKm(t.regionLat!, t.regionLng!),
    }))
    .filter((t) => t.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);

  // Batch-load route geometry for just the trails we're returning, then
  // downsample server-side so the payload stays light.
  const ids = ranked.map((r) => r.row.id);
  const routesById = new Map<number, { latitude: number; longitude: number }[]>();
  if (ids.length > 0) {
    const coordRows = await db
      .select({
        trailId: trailCoordinates.trailId,
        latitude: trailCoordinates.latitude,
        longitude: trailCoordinates.longitude,
      })
      .from(trailCoordinates)
      .where(
        and(
          inArray(trailCoordinates.trailId, ids),
          eq(trailCoordinates.coordinateType, "trail"),
        ),
      )
      .orderBy(trailCoordinates.trailId, trailCoordinates.sequenceNum);

    for (const c of coordRows) {
      const list = routesById.get(c.trailId) ?? [];
      list.push({ latitude: c.latitude, longitude: c.longitude });
      routesById.set(c.trailId, list);
    }
  }

  return ranked.map(({ row, distanceKm: dKm }) => ({
    ...toListItem(row),
    latitude: row.regionLat!,
    longitude: row.regionLng!,
    distanceKm: dKm,
    trailCoordinates: simplifyRoute(routesById.get(row.id) ?? [], 48),
  }));
}

export async function getTrailById(id: number): Promise<TrailDetail | null> {
  const [trail] = await db.select().from(trails).where(eq(trails.id, id)).limit(1);
  if (!trail) return null;

  const coords = await db
    .select()
    .from(trailCoordinates)
    .where(eq(trailCoordinates.trailId, id))
    .orderBy(trailCoordinates.coordinateType, trailCoordinates.sequenceNum);

  const wps = await db
    .select()
    .from(trailWaypoints)
    .where(eq(trailWaypoints.trailId, id))
    .orderBy(trailWaypoints.sequenceNum);

  const mediaRows = await db
    .select()
    .from(trackMedia)
    .where(eq(trackMedia.trailId, id));

  const approachCoords = coords
    .filter((c) => c.coordinateType === "approach")
    .map((c) => ({ latitude: c.latitude, longitude: c.longitude }));

  const trailTypeCoords = coords.filter((c) => c.coordinateType === "trail");
  const trailCoords = trailTypeCoords.map((c) => ({
    latitude: c.latitude,
    longitude: c.longitude,
  }));

  const telemetry = trailTypeCoords.map((c) => ({
    latitude: c.latitude,
    longitude: c.longitude,
    altitude: c.altitude ?? null,
    speed: c.speed ?? null,
    timestampMs: c.timestampMs ?? null,
    accuracy: c.accuracy ?? null,
  }));

  const media = mediaRows.map((m) => ({
    id: String(m.id),
    uri: m.uri,
    thumbnailUri: m.thumbnailUri ?? null,
    caption: m.caption ?? null,
    mediaType: m.mediaType ?? "photo",
    latitude: m.latitude ?? null,
    longitude: m.longitude ?? null,
    takenAt: m.takenAt ? m.takenAt.toISOString() : null,
  }));

  const waypoints = wps.map((w) => ({
    id: String(w.id),
    name: w.name,
    description: w.description,
    type: w.waypointType,
    coordinate: { latitude: w.latitude, longitude: w.longitude },
    elevation: w.elevation,
    gpsAltitude: w.gpsAltitude ?? null,
    recordedAt: w.recordedAt ? w.recordedAt.toISOString() : null,
  }));

  const hasRegion =
    trail.regionLat != null &&
    trail.regionLng != null &&
    trail.regionLatDelta != null &&
    trail.regionLngDelta != null;

  return {
    id: String(trail.id),
    name: trail.name,
    location: trail.location,
    difficulty: trail.difficulty,
    terrain: trail.terrain,
    distance: trail.distance,
    duration: trail.duration,
    accentColor: trail.accentColor,
    elevation: trail.elevation,
    distanceMeters: trail.distanceMeters ?? null,
    elevationGainMeters: trail.elevationGainMeters ?? null,
    elevationLossMeters: trail.elevationLossMeters ?? null,
    durationSeconds: trail.durationSeconds ?? null,
    source: trail.source,
    osmAttribution: trail.osmAttribution,
    activityType: trail.activityType ?? "offroad",
    visibility: trail.visibility ?? "private",
    ownerId: trail.uploaderUserId ?? null,
    shareToken: trail.shareToken ?? null,
    description: trail.description,
    approachFrom: trail.approachFrom,
    approachCoordinates: approachCoords,
    trailCoordinates: trailCoords,
    telemetry,
    media,
    waypoints,
    region: hasRegion
      ? {
          latitude: trail.regionLat!,
          longitude: trail.regionLng!,
          latitudeDelta: trail.regionLatDelta!,
          longitudeDelta: trail.regionLngDelta!,
        }
      : null,
    aiInsights: trail.aiInsights ?? null,
  };
}

// ── Inserts ──────────────────────────────────────────────────────────────────

export interface InsertTrailFull {
  trail: InsertTrail;
  approachCoordinates: { latitude: number; longitude: number }[];
  trailCoordinates: {
    latitude: number;
    longitude: number;
    altitude?: number | null;
    timestampMs?: number | null;
    speed?: number | null;
    accuracy?: number | null;
  }[];
  waypoints: {
    waypointKey?: string;
    name: string;
    description?: string;
    waypointType: string;
    latitude: number;
    longitude: number;
    elevation?: string;
    gpsAltitude?: number | null;
    recordedAt?: string | null;
    sequenceNum: number;
  }[];
}

export async function insertTrailFull(data: InsertTrailFull): Promise<number> {
  const [inserted] = await db.insert(trails).values(data.trail).returning({ id: trails.id });
  const trailId = inserted.id;

  const coordRows: (typeof trailCoordinates.$inferInsert)[] = [
    ...data.approachCoordinates.map((c, i) => ({
      trailId,
      sequenceNum: i,
      latitude: c.latitude,
      longitude: c.longitude,
      coordinateType: "approach" as const,
    })),
    ...data.trailCoordinates.map((c, i) => ({
      trailId,
      sequenceNum: i,
      latitude: c.latitude,
      longitude: c.longitude,
      coordinateType: "trail" as const,
      altitude: c.altitude ?? null,
      timestampMs: c.timestampMs ?? null,
      speed: c.speed ?? null,
      accuracy: c.accuracy ?? null,
    })),
  ];

  if (coordRows.length > 0) {
    await db.insert(trailCoordinates).values(coordRows);
  }

  if (data.waypoints.length > 0) {
    await db.insert(trailWaypoints).values(
      data.waypoints.map((w) => ({
        trailId,
        waypointKey: w.waypointKey,
        name: w.name,
        description: w.description,
        waypointType: w.waypointType,
        latitude: w.latitude,
        longitude: w.longitude,
        elevation: w.elevation,
        gpsAltitude: w.gpsAltitude ?? null,
        recordedAt: w.recordedAt ? new Date(w.recordedAt) : null,
        sequenceNum: w.sequenceNum,
      }))
    );
  }

  return trailId;
}

// ── Edits ────────────────────────────────────────────────────────────────────

/**
 * Lightweight lookup of a trail's source + owner, used to authorize edits
 * without loading the full detail payload. Returns null when the trail does
 * not exist.
 */
export async function getTrailOwnership(
  id: number,
): Promise<{ source: string; ownerId: string | null } | null> {
  const [row] = await db
    .select({ source: trails.source, ownerId: trails.uploaderUserId })
    .from(trails)
    .where(eq(trails.id, id))
    .limit(1);
  if (!row) return null;
  return { source: row.source, ownerId: row.ownerId ?? null };
}

export interface UpdateTrailFields {
  name?: string;
  description?: string | null;
  difficulty?: number;
  activityType?: string;
  location?: string | null;
}

/** Patch editable metadata on a trail. Only community trails should be edited. */
export async function updateTrail(
  id: number,
  fields: UpdateTrailFields,
): Promise<boolean> {
  const patch: Partial<typeof trails.$inferInsert> = { updatedAt: new Date() };
  if (fields.name !== undefined) patch.name = fields.name;
  if (fields.description !== undefined) patch.description = fields.description;
  if (fields.difficulty !== undefined) patch.difficulty = fields.difficulty;
  if (fields.activityType !== undefined) patch.activityType = fields.activityType;
  if (fields.location !== undefined) patch.location = fields.location;

  // Only community (user-recorded) trails are editable — curated/OSM are read-only.
  const result = await db
    .update(trails)
    .set(patch)
    .where(and(eq(trails.id, id), eq(trails.source, "community")))
    .returning({ id: trails.id });
  return result.length > 0;
}

export interface UpdateWaypointFields {
  name?: string;
  description?: string | null;
  type?: string;
  latitude?: number;
  longitude?: number;
}

/** Patch a single waypoint that belongs to the given trail. */
export async function updateWaypoint(
  trailId: number,
  waypointId: number,
  fields: UpdateWaypointFields,
): Promise<boolean> {
  const patch: Partial<typeof trailWaypoints.$inferInsert> = {};
  if (fields.name !== undefined) patch.name = fields.name;
  if (fields.description !== undefined) patch.description = fields.description;
  if (fields.type !== undefined) patch.waypointType = fields.type;
  if (fields.latitude !== undefined) patch.latitude = fields.latitude;
  if (fields.longitude !== undefined) patch.longitude = fields.longitude;
  if (Object.keys(patch).length === 0) return false;

  // Only allow editing waypoints whose parent trail is community-sourced.
  const parent = await db
    .select({ id: trails.id })
    .from(trails)
    .where(and(eq(trails.id, trailId), eq(trails.source, "community")))
    .limit(1);
  if (parent.length === 0) return false;

  const result = await db
    .update(trailWaypoints)
    .set(patch)
    .where(and(eq(trailWaypoints.id, waypointId), eq(trailWaypoints.trailId, trailId)))
    .returning({ id: trailWaypoints.id });
  return result.length > 0;
}

/** Store/refresh the AI-generated trip report on a trail. */
export async function updateTrailAiInsights(
  id: number,
  insights: AiTrailInsights,
): Promise<boolean> {
  const result = await db
    .update(trails)
    .set({ aiInsights: insights, updatedAt: new Date() })
    .where(eq(trails.id, id))
    .returning({ id: trails.id });
  return result.length > 0;
}

export interface NewWaypointFields {
  name: string;
  description?: string | null;
  type: string;
  latitude: number;
  longitude: number;
  elevation?: string | null;
}

export interface CreatedWaypoint {
  id: string;
  name: string;
  description: string | null;
  type: string;
  coordinate: { latitude: number; longitude: number };
  elevation: string | null;
}

/**
 * Append a new waypoint to a community trail (e.g. an accepted AI suggestion).
 * Returns the created waypoint, or null when the trail is not editable.
 */
export async function addWaypoint(
  trailId: number,
  fields: NewWaypointFields,
): Promise<CreatedWaypoint | null> {
  // Only community (user-recorded) trails can gain waypoints.
  const parent = await db
    .select({ id: trails.id })
    .from(trails)
    .where(and(eq(trails.id, trailId), eq(trails.source, "community")))
    .limit(1);
  if (parent.length === 0) return null;

  const existing = await db
    .select({ seq: trailWaypoints.sequenceNum })
    .from(trailWaypoints)
    .where(eq(trailWaypoints.trailId, trailId));
  const nextSeq =
    existing.reduce((max, w) => Math.max(max, w.seq ?? 0), -1) + 1;

  const [created] = await db
    .insert(trailWaypoints)
    .values({
      trailId,
      name: fields.name,
      description: fields.description ?? null,
      waypointType: fields.type,
      latitude: fields.latitude,
      longitude: fields.longitude,
      elevation: fields.elevation ?? null,
      sequenceNum: nextSeq,
    })
    .returning();

  return {
    id: String(created.id),
    name: created.name,
    description: created.description,
    type: created.waypointType,
    coordinate: { latitude: created.latitude, longitude: created.longitude },
    elevation: created.elevation,
  };
}

// ── Media ────────────────────────────────────────────────────────────────────

export interface InsertTrailMediaItem {
  uri: string;
  thumbnailUri?: string | null;
  caption?: string | null;
  mediaType?: string; // 'photo' | 'video' | 'audio'
  latitude?: number | null;
  longitude?: number | null;
  takenAt?: Date | null;
}

/** Attach media (photos / voice notes) captured along a recorded track. */
export async function insertTrailMedia(
  trailId: number,
  items: InsertTrailMediaItem[],
): Promise<void> {
  if (items.length === 0) return;
  await db.insert(trackMedia).values(
    items.map((m) => ({
      trailId,
      uri: m.uri,
      thumbnailUri: m.thumbnailUri ?? null,
      caption: m.caption ?? null,
      mediaType: m.mediaType ?? "photo",
      latitude: m.latitude ?? null,
      longitude: m.longitude ?? null,
      takenAt: m.takenAt ?? null,
    })),
  );
}

// Upsert by externalId — used by the OSM sync to avoid duplicates.
export async function upsertOsmTrail(data: InsertTrailFull & { externalId: string }): Promise<void> {
  const existing = await db
    .select({ id: trails.id })
    .from(trails)
    .where(eq(trails.externalId, data.externalId))
    .limit(1);

  if (existing.length > 0) {
    // Already imported — skip for now (future: update changed fields)
    return;
  }

  await insertTrailFull({ ...data, trail: { ...data.trail, externalId: data.externalId } });
}
