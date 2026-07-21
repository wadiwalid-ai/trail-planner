import type { Express, Request, Response } from "express";
import {
  getAllTrails,
  getTrailById,
  getTrailsNearby,
  insertTrailFull,
  insertTrailMedia,
  updateTrail,
  updateWaypoint,
  addWaypoint,
  getTrailOwnership,
} from "./storage";
import { runOsmSync } from "./osm-sync";
import { getUgcStatus } from "../cloud";
import { requireAuth, requireAdmin } from "../auth";

const VALID_ACTIVITY_TYPES = ["offroad", "hike", "bike", "drive", "run", "walk"];
const VALID_WAYPOINT_TYPES = [
  "start",
  "end",
  "scenic",
  "technical",
  "water",
  "camp",
  "summit",
  "hazard",
  "viewpoint",
  "fuel",
];

/**
 * TRAIL WRITE-ROUTE OWNERSHIP AUDIT
 * ---------------------------------
 * Every mutating /api/trails/* endpoint across the server was swept to confirm
 * it requires an authenticated session and (where it edits an existing trail)
 * enforces owner + community-source. Curated/OSM trails stay read-only.
 *
 * Verified — auth + ownership enforced:
 *   POST   /api/trails                              (this file) create; owner = req.user
 *   PATCH  /api/trails/:id                          (this file) owner + community
 *   POST   /api/trails/:id/waypoints               (this file) owner + community
 *   PATCH  /api/trails/:id/waypoints/:waypointId   (this file) owner + community
 *   POST   /api/trails/:id/ai-waypoints            (server/routes.ts) owner + community
 *   POST   /api/trails/:id/ai-summary              (server/routes.ts) owner + community (fixed here)
 *   POST   /api/trails/upload                       (server/trails/upload.ts) auth; owner = req.user (fixed here)
 *   PATCH  /api/trails/:id/visibility              (server/account-routes.ts) owner via setTrailVisibility
 *   POST   /api/trails/:id/share                    (server/account-routes.ts) owner via ensureShareToken
 *   POST   /api/media/upload                        (server/media.ts) auth (generic media, not trail-scoped)
 *
 * Intentionally public reads (no auth): GET /api/trails, /nearby, /:id
 *   (community privacy enforced inline), /api/route, GET /api/share/:token.
 *
 * Admin: POST /api/admin/osm-sync — gated behind requireAdmin (writes
 *   OSM-sourced, ownerless, read-only trails). Only DB-flagged admins
 *   (users.isAdmin) or usernames in the ADMIN_USERNAMES env allowlist may run
 *   this bulk import; everyone else gets 403. See the route comment below for the
 *   production-exposure recommendation.
 */
export function registerTrailRoutes(app: Express): void {
  // ── GET /api/trails ───────────────────────────────────────────────────────
  // Returns all published trails (list view — no coordinates, just metadata).
  app.get("/api/trails", async (_req, res) => {
    try {
      const trails = await getAllTrails();
      res.json({ trails });
    } catch (err) {
      console.error("[trails] GET /api/trails error:", err);
      res.status(500).json({ error: "Failed to fetch trails" });
    }
  });

  // ── GET /api/trails/nearby ────────────────────────────────────────────────
  // Returns published trails near a point, sorted by distance. Registered
  // before /:id so the literal "nearby" segment is never parsed as an ID.
  app.get("/api/trails/nearby", async (req, res) => {
    try {
      const lat = parseFloat(String(req.query.lat));
      const lon = parseFloat(String(req.query.lon));
      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: "lat and lon are required" });
      }
      const radiusKm = Math.min(
        Math.max(parseFloat(String(req.query.radiusKm)) || 250, 1),
        2000,
      );
      const limit = Math.min(
        Math.max(parseInt(String(req.query.limit), 10) || 12, 1),
        50,
      );
      const trails = await getTrailsNearby(lat, lon, radiusKm, limit);
      res.json({ trails });
    } catch (err) {
      console.error("[trails] GET /api/trails/nearby error:", err);
      res.status(500).json({ error: "Failed to fetch nearby trails" });
    }
  });

  // ── GET /api/trails/:id ───────────────────────────────────────────────────
  // Returns full trail detail including waypoints and GPS coordinates.
  app.get("/api/trails/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid trail ID" });

      const trail = await getTrailById(id);
      if (!trail) return res.status(404).json({ error: "Trail not found" });

      // Visibility guard: curated/OSM trails and public community trails are
      // open. Private or unlisted community trails are only readable by their
      // owner via this bare-ID route (unlisted is otherwise reachable through
      // the share-token route in account-routes).
      const isCommunity = trail.source === "community";
      const isPublic = trail.visibility === "public";
      const isOwner = !!req.user && trail.ownerId === req.user.id;
      if (isCommunity && !isPublic && !isOwner) {
        return res.status(404).json({ error: "Trail not found" });
      }

      res.json({ trail });
    } catch (err) {
      console.error("[trails] GET /api/trails/:id error:", err);
      res.status(500).json({ error: "Failed to fetch trail" });
    }
  });

  // ── POST /api/trails ─────────────────────────────────────────────────────
  // Saves a community-recorded trail (GPS track + waypoints) to the database.
  app.post("/api/trails", requireAuth, async (req, res) => {
    try {
      const { trail, trailCoordinates: coords, waypoints } = req.body;
      if (!trail?.name || !Array.isArray(coords) || coords.length < 2) {
        return res.status(400).json({ error: "Invalid trail data" });
      }

      const lats = coords.map((c: any) => c.latitude as number);
      const lons = coords.map((c: any) => c.longitude as number);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const minLon = Math.min(...lons), maxLon = Math.max(...lons);

      // Derive elevation gain/loss from per-point altitude samples when present.
      const altitudes = coords
        .map((c: any) => (typeof c.altitude === "number" ? (c.altitude as number) : null))
        .filter((a: number | null): a is number => a != null);
      let derivedGain: number | null = null;
      let derivedLoss: number | null = null;
      if (altitudes.length >= 2) {
        let gain = 0, loss = 0;
        for (let i = 1; i < altitudes.length; i++) {
          const delta = altitudes[i] - altitudes[i - 1];
          if (delta > 0) gain += delta;
          else loss += -delta;
        }
        derivedGain = Math.round(gain);
        derivedLoss = Math.round(loss);
      }

      const activityType = VALID_ACTIVITY_TYPES.includes(trail.activityType)
        ? trail.activityType
        : "offroad";

      // Recorded tracks are owned by the signed-in user (if any) and default to
      // private — they only appear in Explore once the owner makes them public.
      const ownerId = req.user!.id;
      let visibility: "private" | "unlisted" | "public" =
        trail.visibility === "public" || trail.visibility === "unlisted"
          ? trail.visibility
          : "private";

      // Publishing requires the owner to have accepted the UGC agreement. If they
      // haven't, save the track privately and tell the client so it can prompt.
      let publishBlocked = false;
      if (visibility !== "private") {
        const status = ownerId ? await getUgcStatus(ownerId) : { ugcAccepted: false };
        if (!status.ugcAccepted) {
          visibility = "private";
          publishBlocked = true;
        }
      }

      const id = await insertTrailFull({
        trail: {
          name: trail.name,
          location: trail.location ?? "UAE",
          description: trail.description ?? null,
          difficulty: trail.difficulty ?? 5,
          terrain: trail.terrain ?? "Off-Road Track",
          distance: trail.distance ?? null,
          duration: trail.duration ?? null,
          distanceMeters: trail.distanceMeters ?? null,
          durationSeconds: trail.durationSeconds ?? null,
          elevationGainMeters: trail.elevationGainMeters ?? derivedGain,
          elevationLossMeters: trail.elevationLossMeters ?? derivedLoss,
          accentColor: "#D4763B",
          activityType,
          source: "community",
          status: "published",
          uploaderUserId: ownerId,
          visibility,
          osmAttribution: false,
          tags: trail.tags ?? {},
          regionLat: (minLat + maxLat) / 2,
          regionLng: (minLon + maxLon) / 2,
          regionLatDelta: Math.max(maxLat - minLat + 0.01, 0.01),
          regionLngDelta: Math.max(maxLon - minLon + 0.01, 0.01),
        },
        approachCoordinates: [],
        trailCoordinates: coords.map((c: any) => ({
          latitude: c.latitude,
          longitude: c.longitude,
          altitude: typeof c.altitude === "number" ? c.altitude : null,
          timestampMs: typeof c.timestampMs === "number" ? c.timestampMs : null,
          speed: typeof c.speed === "number" ? c.speed : null,
          accuracy: typeof c.accuracy === "number" ? c.accuracy : null,
        })),
        waypoints: (waypoints ?? []).map((w: any, i: number) => ({
          waypointKey: w.waypointKey ?? `rec-${i}`,
          name: w.name,
          description: w.description ?? null,
          waypointType: w.type ?? "scenic",
          latitude: w.coordinate.latitude,
          longitude: w.coordinate.longitude,
          elevation: w.elevation ?? null,
          gpsAltitude: typeof w.gpsAltitude === "number" ? w.gpsAltitude : null,
          recordedAt: typeof w.timestamp === "string" ? w.timestamp : null,
          sequenceNum: i,
        })),
      });

      // Attach photos / voice notes captured along the track (durable URLs
      // uploaded via /api/media/upload by the client before this call).
      const media = req.body.media;
      if (Array.isArray(media) && media.length > 0) {
        await insertTrailMedia(
          id,
          media
            .filter((m: any) => m && typeof m.uri === "string")
            .map((m: any) => ({
              uri: m.uri,
              caption: typeof m.caption === "string" ? m.caption : null,
              mediaType: m.mediaType === "audio" || m.mediaType === "video" ? m.mediaType : "photo",
              latitude: typeof m.latitude === "number" ? m.latitude : null,
              longitude: typeof m.longitude === "number" ? m.longitude : null,
              takenAt: typeof m.takenAtMs === "number" ? new Date(m.takenAtMs) : null,
            })),
        );
      }

      res.json({ ok: true, id, visibility, publishBlocked });
    } catch (err) {
      console.error("[trails] POST /api/trails error:", err);
      res.status(500).json({ error: "Failed to save trail" });
    }
  });

  // ── PATCH /api/trails/:id ─────────────────────────────────────────────────
  // Edit a community trail's metadata (title, notes, difficulty, activity type).
  // Only the trail's owner may edit it.
  app.patch("/api/trails/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid trail ID" });

      const ownership = await getTrailOwnership(id);
      if (!ownership) return res.status(404).json({ error: "Trail not found" });
      if (ownership.source !== "community" || ownership.ownerId !== req.user!.id) {
        return res.status(403).json({ error: "You can only edit trails you own" });
      }

      const { name, description, difficulty, activityType, location } = req.body;
      const fields: Record<string, unknown> = {};
      if (typeof name === "string" && name.trim()) fields.name = name.trim();
      if (typeof description === "string") fields.description = description;
      if (typeof difficulty === "number" && difficulty >= 1 && difficulty <= 10) {
        fields.difficulty = Math.round(difficulty);
      }
      if (typeof activityType === "string" && VALID_ACTIVITY_TYPES.includes(activityType)) {
        fields.activityType = activityType;
      }
      if (typeof location === "string") fields.location = location.trim();

      if (Object.keys(fields).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      const ok = await updateTrail(id, fields);
      if (!ok) return res.status(404).json({ error: "Trail not found" });
      res.json({ ok: true });
    } catch (err) {
      console.error("[trails] PATCH /api/trails/:id error:", err);
      res.status(500).json({ error: "Failed to update trail" });
    }
  });

  // ── PATCH /api/trails/:id/waypoints/:waypointId ───────────────────────────
  // Edit a single waypoint's name, type, or coordinates.
  // Only the parent trail's owner may edit its waypoints.
  app.patch("/api/trails/:id/waypoints/:waypointId", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const waypointId = parseInt(String(req.params.waypointId), 10);
      if (isNaN(id) || isNaN(waypointId)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      const ownership = await getTrailOwnership(id);
      if (!ownership) return res.status(404).json({ error: "Trail not found" });
      if (ownership.source !== "community" || ownership.ownerId !== req.user!.id) {
        return res.status(403).json({ error: "You can only edit waypoints on trails you own" });
      }

      const { name, description, type, latitude, longitude } = req.body;
      const fields: Record<string, unknown> = {};
      if (typeof name === "string" && name.trim()) fields.name = name.trim();
      if (typeof description === "string") fields.description = description;
      if (typeof type === "string") {
        if (!VALID_WAYPOINT_TYPES.includes(type)) {
          return res.status(400).json({ error: "Invalid waypoint type" });
        }
        fields.type = type;
      }
      if (typeof latitude === "number" && latitude >= -90 && latitude <= 90) {
        fields.latitude = latitude;
      }
      if (typeof longitude === "number" && longitude >= -180 && longitude <= 180) {
        fields.longitude = longitude;
      }

      if (Object.keys(fields).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      const ok = await updateWaypoint(id, waypointId, fields);
      if (!ok) return res.status(404).json({ error: "Waypoint not found" });
      res.json({ ok: true });
    } catch (err) {
      console.error("[trails] PATCH waypoint error:", err);
      res.status(500).json({ error: "Failed to update waypoint" });
    }
  });

  // ── POST /api/trails/:id/waypoints ────────────────────────────────────────
  // Add a new waypoint to a community trail (e.g. accepting an AI suggestion).
  app.post("/api/trails/:id/waypoints", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid trail ID" });

      const ownership = await getTrailOwnership(id);
      if (!ownership) return res.status(404).json({ error: "Trail not found" });
      if (ownership.source !== "community" || ownership.ownerId !== req.user!.id) {
        return res.status(403).json({ error: "You can only add waypoints to trails you own" });
      }

      const { name, description, type, latitude, longitude, elevation } = req.body;
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "name is required" });
      }
      if (typeof type !== "string" || !VALID_WAYPOINT_TYPES.includes(type)) {
        return res.status(400).json({ error: "Invalid waypoint type" });
      }
      if (
        typeof latitude !== "number" ||
        latitude < -90 ||
        latitude > 90 ||
        typeof longitude !== "number" ||
        longitude < -180 ||
        longitude > 180
      ) {
        return res
          .status(400)
          .json({ error: "Valid latitude and longitude are required" });
      }

      const waypoint = await addWaypoint(id, {
        name: name.trim().slice(0, 80),
        description: typeof description === "string" ? description.slice(0, 400) : null,
        type,
        latitude,
        longitude,
        elevation: typeof elevation === "string" ? elevation : null,
      });
      if (!waypoint) {
        return res.status(404).json({ error: "Trail not found or not editable" });
      }
      res.json({ ok: true, waypoint });
    } catch (err) {
      console.error("[trails] POST waypoint error:", err);
      res.status(500).json({ error: "Failed to add waypoint" });
    }
  });

  // ── GET /api/route ────────────────────────────────────────────────────────
  // Driving route between two points. Proxies the public OSRM service (BSD —
  // commercial use OK). Returns the route geometry plus distance & duration so
  // the app can render a guidance line and ETA to a trailhead.
  app.get("/api/route", async (req, res) => {
    try {
      const fromLat = parseFloat(String(req.query.fromLat));
      const fromLon = parseFloat(String(req.query.fromLon));
      const toLat = parseFloat(String(req.query.toLat));
      const toLon = parseFloat(String(req.query.toLon));
      if ([fromLat, fromLon, toLat, toLon].some((n) => isNaN(n))) {
        return res
          .status(400)
          .json({ error: "fromLat, fromLon, toLat, toLon are required" });
      }

      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${fromLon},${fromLat};${toLon},${toLat}` +
        `?overview=full&geometries=geojson`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let data: any;
      try {
        const r = await fetch(url, { signal: controller.signal });
        if (!r.ok) throw new Error(`OSRM responded ${r.status}`);
        data = await r.json();
      } finally {
        clearTimeout(timeout);
      }

      const route = data?.routes?.[0];
      if (!route?.geometry?.coordinates?.length) {
        return res.status(502).json({ error: "No route found" });
      }

      const coordinates = (route.geometry.coordinates as [number, number][]).map(
        ([lon, lat]) => ({ latitude: lat, longitude: lon }),
      );

      res.json({
        coordinates,
        distanceMeters: Math.round(route.distance ?? 0),
        durationSeconds: Math.round(route.duration ?? 0),
        attribution: "Routing © OSRM · OpenStreetMap contributors",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[trails] GET /api/route error:", msg);
      res.status(502).json({ error: "Routing service unavailable" });
    }
  });

  // ── POST /api/admin/osm-sync ──────────────────────────────────────────────
  // Triggers a pull from OpenStreetMap Overpass API and upserts new trails.
  // One-way: we only read from OSM, never write back. This mutates the trails
  // table (creates OSM-sourced trails), so it must never be anonymous. It is a
  // heavy bulk import that hammers the public Overpass API and can flood the
  // trails table, so requireAuth alone is not enough — any signed-in account
  // could trigger it. It is gated behind requireAdmin: only users with the
  // isAdmin DB flag or a username in the ADMIN_USERNAMES env allowlist may run
  // it; everyone else gets 403. The imported trails are owned by no user
  // (source "osm") and remain read-only to everyone via the ownership checks.
  //
  // Production recommendation: this is an operational/maintenance job, not a
  // user-facing feature. It is safe to leave mounted because it is admin-only,
  // but it should be invoked deliberately (a manual admin action) or moved to a
  // scheduled/manual server task rather than being called from the client app.
  // Do NOT wire it to any normal user-facing button.
  app.post("/api/admin/osm-sync", requireAdmin, async (_req, res) => {
    try {
      console.log("[OSM sync] Starting sync...");
      const result = await runOsmSync();
      console.log("[OSM sync] Complete:", result);
      res.json({ ok: true, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[OSM sync] Error:", msg);
      res.status(500).json({ error: msg });
    }
  });
}
