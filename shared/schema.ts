import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  serial,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Existing: Users ──────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ── Admin audit log ──────────────────────────────────────────────────────────
// Immutable trail of every admin-power change made via PATCH /api/admin/users/:id.
// We snapshot both the acting admin and the target's usernames (not just ids) so
// the history stays readable even if an account is later renamed or removed —
// hence no cascading FK on the id columns. `oldIsAdmin`/`newIsAdmin` capture the
// before/after values so promotions and demotions are both self-describing.
export const adminAuditLog = pgTable("admin_audit_log", {
  id: serial("id").primaryKey(),
  actingUserId: varchar("acting_user_id").notNull(),
  actingUsername: text("acting_username").notNull(),
  targetUserId: varchar("target_user_id").notNull(),
  targetUsername: text("target_username").notNull(),
  oldIsAdmin: boolean("old_is_admin").notNull(),
  newIsAdmin: boolean("new_is_admin").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLog).omit({
  id: true,
  createdAt: true,
});
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;
export type AdminAuditLog = typeof adminAuditLog.$inferSelect;

// ── AI Insights ──────────────────────────────────────────────────────────────
// Structured AI-generated trip report stored on a recorded track. Persisted as
// jsonb on the trails table so it can be regenerated and displayed without
// recomputing. `summary` is markdown; `terrainTags` are short human-readable
// labels refining the Phase 3 heuristic technical-section flags.
export interface AiTrailInsights {
  summary: string; // markdown narrative trip report
  difficultyAssessment: string; // 1–2 sentence difficulty read of the stats
  terrainTags: string[]; // e.g. ["soft sand", "rocky wadi", "steep climbs"]
  generatedAt: string; // ISO timestamp
}

// ── Sessions ─────────────────────────────────────────────────────────────────
// Token-based auth sessions. A login/signup issues an opaque token stored on the
// client (AsyncStorage) and sent as `Authorization: Bearer <token>`.
export const sessions = pgTable("sessions", {
  token: varchar("token").primaryKey(),
  userId: varchar("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export type Session = typeof sessions.$inferSelect;

// ── Trips ────────────────────────────────────────────────────────────────────
// Cloud-synced saved trip itineraries. Mirrors the local client Trip shape so a
// user's planned trips follow them across devices. `clientId` is the id the
// client generated locally — used to de-duplicate on upload.
export const trips = pgTable("trips", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  clientId: text("client_id").notNull(),
  title: text("title").notNull(),
  destination: text("destination").default(""),
  vehicle: text("vehicle").default(""),
  terrain: text("terrain").default(""),
  duration: text("duration").default(""),
  difficulty: integer("difficulty").default(5),
  notes: text("notes").default(""),
  savedAt: timestamp("saved_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type TripRow = typeof trips.$inferSelect;

// ── Trails ───────────────────────────────────────────────────────────────────
// Stores both OSM-sourced and community-uploaded trails in one table.
// source: 'osm' = pulled from OpenStreetMap (ODbL licence, attribution required)
// source: 'community' = user-uploaded GPX track
export const trails = pgTable("trails", {
  id: serial("id").primaryKey(),
  externalId: text("external_id"), // OSM way/relation ID; null for community
  source: text("source").notNull().default("osm"), // 'osm' | 'community'
  status: text("status").notNull().default("published"), // 'published' | 'pending' | 'draft' | 'rejected'
  name: text("name").notNull(),
  description: text("description"),
  location: text("location"),
  difficulty: integer("difficulty"), // 1–10
  terrain: text("terrain"),
  distance: text("distance"), // human-readable e.g. "30 km"
  duration: text("duration"), // human-readable e.g. "4–5 hrs"
  elevation: text("elevation"), // e.g. "650 m"
  // Structured numeric fields (additive — nullable; string fields above are fallback)
  distanceMeters: doublePrecision("distance_meters"),
  elevationGainMeters: doublePrecision("elevation_gain_meters"),
  elevationLossMeters: doublePrecision("elevation_loss_meters"),
  durationSeconds: integer("duration_seconds"),
  accentColor: text("accent_color").default("#D4763B"),
  activityType: text("activity_type").notNull().default("offroad"), // 'offroad' | 'hiking' | 'mixed'
  approachFrom: text("approach_from"), // nearest city/town name
  uploaderUserId: text("uploader_user_id"), // null for OSM trails
  // Visibility for community tracks: 'private' (owner only), 'unlisted' (anyone
  // with the share link), 'public' (listed in Explore). Curated/OSM are always
  // treated as public regardless of this column.
  visibility: text("visibility").notNull().default("private"),
  shareToken: text("share_token"), // opaque token for shareable links; null = no link yet
  osmAttribution: boolean("osm_attribution").default(false), // show © OSM contributors
  tags: jsonb("tags").$type<Record<string, string>>().default({}),
  // AI-generated trip report (narrative + difficulty + terrain tags). Null until
  // the user generates it from the recorded track's telemetry.
  aiInsights: jsonb("ai_insights").$type<AiTrailInsights>(),
  // Map region for initial map zoom
  regionLat: doublePrecision("region_lat"),
  regionLng: doublePrecision("region_lng"),
  regionLatDelta: doublePrecision("region_lat_delta"),
  regionLngDelta: doublePrecision("region_lng_delta"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTrailSchema = createInsertSchema(trails).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTrail = z.infer<typeof insertTrailSchema>;
export type Trail = typeof trails.$inferSelect;

// ── Trail GPS Coordinates ─────────────────────────────────────────────────────
// Polyline points for both the trail route and the approach route from the city.
// coordinateType: 'trail' | 'approach'
export const trailCoordinates = pgTable("trail_coordinates", {
  id: serial("id").primaryKey(),
  trailId: integer("trail_id")
    .references(() => trails.id, { onDelete: "cascade" })
    .notNull(),
  sequenceNum: integer("sequence_num").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  coordinateType: text("coordinate_type").notNull().default("trail"), // 'trail' | 'approach'
  // Additive nullable telemetry fields
  altitude: doublePrecision("altitude"),
  timestampMs: doublePrecision("timestamp_ms"),
  speed: doublePrecision("speed"),
  accuracy: doublePrecision("accuracy"),
});

export type TrailCoordinate = typeof trailCoordinates.$inferSelect;

// ── Trail Waypoints ──────────────────────────────────────────────────────────
// Named points of interest along the trail.
// waypointType: start | end | scenic | technical | water | camp | summit | hazard | viewpoint | fuel
export const trailWaypoints = pgTable("trail_waypoints", {
  id: serial("id").primaryKey(),
  trailId: integer("trail_id")
    .references(() => trails.id, { onDelete: "cascade" })
    .notNull(),
  waypointKey: text("waypoint_key"), // stable local key e.g. "7-p1"
  name: text("name").notNull(),
  description: text("description"),
  waypointType: text("waypoint_type").notNull().default("scenic"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  elevation: text("elevation"),
  // Smart-waypoint metadata (nullable — populated from device + Open-Topo-Data)
  gpsAltitude: doublePrecision("gps_altitude"),
  recordedAt: timestamp("recorded_at"),
  sequenceNum: integer("sequence_num").notNull().default(0),
});

export type TrailWaypoint = typeof trailWaypoints.$inferSelect;

// ── Activity types ───────────────────────────────────────────────────────────
// DB column stays `text` for extensibility; this constant constrains the UI.
export const ACTIVITY_TYPES = ["offroad", "hike", "bike", "drive", "run", "walk"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

// ── Recording Sessions ───────────────────────────────────────────────────────
// A live/recorded track session captured in the Track Recorder.
export const recordingSessions = pgTable("recording_sessions", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  trailId: integer("trail_id").references(() => trails.id),
  name: text("name"),
  activityType: text("activity_type").default("offroad"),
  status: text("status").default("completed"), // 'recording' | 'paused' | 'completed'
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  distanceMeters: doublePrecision("distance_meters"),
  elevationGainMeters: doublePrecision("elevation_gain_meters"),
  elevationLossMeters: doublePrecision("elevation_loss_meters"),
  durationSeconds: integer("duration_seconds"),
  avgSpeed: doublePrecision("avg_speed"),
  maxSpeed: doublePrecision("max_speed"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRecordingSessionSchema = createInsertSchema(recordingSessions).omit({ id: true, createdAt: true });
export type InsertRecordingSession = z.infer<typeof insertRecordingSessionSchema>;
export type RecordingSession = typeof recordingSessions.$inferSelect;

// ── Track Points ─────────────────────────────────────────────────────────────
// Raw GPS samples belonging to a recording session.
export const trackPoints = pgTable("track_points", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .references(() => recordingSessions.id, { onDelete: "cascade" })
    .notNull(),
  sequenceNum: integer("sequence_num").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  altitude: doublePrecision("altitude"),
  speed: doublePrecision("speed"),
  accuracy: doublePrecision("accuracy"),
  heading: doublePrecision("heading"),
  timestampMs: doublePrecision("timestamp_ms"),
});

export const insertTrackPointSchema = createInsertSchema(trackPoints).omit({ id: true });
export type InsertTrackPoint = z.infer<typeof insertTrackPointSchema>;
export type TrackPoint = typeof trackPoints.$inferSelect;

// ── Track Media ──────────────────────────────────────────────────────────────
// Photos/videos captured along a session or attached to a trail/waypoint.
export const trackMedia = pgTable("track_media", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => recordingSessions.id, { onDelete: "cascade" }),
  trailId: integer("trail_id").references(() => trails.id),
  waypointId: integer("waypoint_id").references(() => trailWaypoints.id),
  uri: text("uri").notNull(),
  thumbnailUri: text("thumbnail_uri"),
  caption: text("caption"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  mediaType: text("media_type").default("photo"), // 'photo' | 'video'
  takenAt: timestamp("taken_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTrackMediaSchema = createInsertSchema(trackMedia).omit({ id: true, createdAt: true });
export type InsertTrackMedia = z.infer<typeof insertTrackMediaSchema>;
export type TrackMedia = typeof trackMedia.$inferSelect;

// ════════════════════════════════════════════════════════════════════════════
// PHASE 2: SIGNUP — Do NOT expose in UI until auth MVP is complete.
// Schema, storage, and routes are fully built; they are just not registered
// in the active route tree. Wire them up when the sign-up flow is added.
// ════════════════════════════════════════════════════════════════════════════

// ── Upload Prerequisites ─────────────────────────────────────────────────────
// A user must satisfy all prerequisites before their uploaded track goes live.
// Filled out during the signup/onboarding flow — hidden until then.
export const uploadPrerequisites = pgTable("upload_prerequisites", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  vehicleType: text("vehicle_type"), // e.g. "Toyota Land Cruiser 200"
  vehicleLiftMm: integer("vehicle_lift_mm"), // suspension lift in mm
  hasLockingDiffs: boolean("has_locking_diffs").default(false),
  hasRecoveryGear: boolean("has_recovery_gear").default(false), // MaxTrax/snatch strap/winch
  hasEmergencyContact: boolean("has_emergency_contact").default(false),
  hasFirstAid: boolean("has_first_aid").default(false),
  hasNavigation: boolean("has_navigation").default(false), // offline maps/GPS unit
  hasConvoyExperience: boolean("has_convoy_experience").default(false),
  driveExperienceYears: integer("drive_experience_years"),
  prerequisitesMet: boolean("prerequisites_met").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPrerequisitesSchema = createInsertSchema(uploadPrerequisites).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPrerequisites = z.infer<typeof insertPrerequisitesSchema>;
export type UploadPrerequisites = typeof uploadPrerequisites.$inferSelect;

// ── UGC Agreements ───────────────────────────────────────────────────────────
// Users must accept the UGC content licence at sign-up before they can upload.
// Each boolean represents a distinct clause so audit trails are clear.
export const ugcAgreements = pgTable("ugc_agreements", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),

  // Clause 1 — Content Licence
  // "I grant [App Name] a non-exclusive, royalty-free, worldwide licence to display,
  //  distribute, and sublicense my uploaded GPS tracks and waypoints within the app."
  agreedToContentLicense: boolean("agreed_to_content_license").notNull().default(false),

  // Clause 2 — Data Distribution
  // "I understand my tracks may be shown to other users of the app."
  agreedToDataDistribution: boolean("agreed_to_data_distribution").notNull().default(false),

  // Clause 3 — Originality
  // "I confirm I personally recorded this track and have the right to upload it.
  //  I have not copied it from AllTrails, Wikiloc, Komoot or any other platform."
  confirmsOriginalContent: boolean("confirms_original_content").notNull().default(false),

  // Clause 4 — Accuracy Disclaimer
  // "I acknowledge that trail conditions change. [App Name] is not liable for
  //  decisions made using data I upload."
  acknowledgesAccuracyDisclaimer: boolean("acknowledges_accuracy_disclaimer").notNull().default(false),

  // Clause 5 — OSM Attribution
  // "I understand that trails sourced from OpenStreetMap are © OpenStreetMap
  //  contributors and licensed under ODbL."
  acknowledgesOsmAttribution: boolean("acknowledges_osm_attribution").notNull().default(false),

  agreedAt: timestamp("agreed_at"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUgcAgreementSchema = createInsertSchema(ugcAgreements).omit({ id: true, createdAt: true });
export type InsertUgcAgreement = z.infer<typeof insertUgcAgreementSchema>;
export type UgcAgreement = typeof ugcAgreements.$inferSelect;

// ════════════════════════════════════════════════════════════════════════════
// CONVOY — real-time, multi-user group tracking
// ════════════════════════════════════════════════════════════════════════════

// Allowed per-member live status. Shared with the client status grid.
export const CONVOY_STATUSES = ["moving", "stopped", "stuck", "retry", "help"] as const;
export type ConvoyStatus = (typeof CONVOY_STATUSES)[number];

// ── Convoys ──────────────────────────────────────────────────────────────────
// A live group "session" owned by the user who created it. Members join via the
// 6-character invite code. A convoy stays active until its owner ends it.
export const convoys = pgTable("convoys", {
  id: serial("id").primaryKey(),
  ownerUserId: varchar("owner_user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(), // 6 uppercase alnum
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const insertConvoySchema = createInsertSchema(convoys).omit({
  id: true,
  createdAt: true,
  endedAt: true,
});
export type InsertConvoy = z.infer<typeof insertConvoySchema>;
export type Convoy = typeof convoys.$inferSelect;

// ── Convoy Members ───────────────────────────────────────────────────────────
// One row per participant in a convoy. `userId` is null for dev "ghost" rovers
// produced by the simulator. Position + status are updated by heartbeats.
export const convoyMembers = pgTable("convoy_members", {
  id: serial("id").primaryKey(),
  convoyId: integer("convoy_id")
    .references(() => convoys.id, { onDelete: "cascade" })
    .notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }), // NULL for ghosts
  displayName: text("display_name").notNull(),
  vehicleLabel: text("vehicle_label"),
  role: text("role").notNull().default("member"), // 'owner' | 'member'
  status: text("status").notNull().default("moving"), // 'moving'|'stopped'|'stuck'|'retry'|'help'
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  heading: doublePrecision("heading"),
  speed: doublePrecision("speed"),
  isGhost: boolean("is_ghost").notNull().default(false),
  helpAt: timestamp("help_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow(),
  leftAt: timestamp("left_at", { withTimezone: true }),
});

export const insertConvoyMemberSchema = createInsertSchema(convoyMembers).omit({
  id: true,
  joinedAt: true,
  lastSeenAt: true,
});
export type InsertConvoyMember = z.infer<typeof insertConvoyMemberSchema>;
export type ConvoyMember = typeof convoyMembers.$inferSelect;
