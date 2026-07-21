import { and, eq, desc } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "./db";
import {
  trips,
  trails,
  ugcAgreements,
  uploadPrerequisites,
  type TripRow,
} from "../shared/schema";

// ── UGC / upload-prerequisite status ──────────────────────────────────────────

export async function getUgcStatus(userId: string) {
  const [ugc] = await db
    .select()
    .from(ugcAgreements)
    .where(eq(ugcAgreements.userId, userId))
    .limit(1);
  const [prereq] = await db
    .select()
    .from(uploadPrerequisites)
    .where(eq(uploadPrerequisites.userId, userId))
    .limit(1);

  const ugcAccepted = !!(
    ugc &&
    ugc.agreedToContentLicense &&
    ugc.agreedToDataDistribution &&
    ugc.confirmsOriginalContent &&
    ugc.acknowledgesAccuracyDisclaimer &&
    ugc.acknowledgesOsmAttribution
  );

  return {
    ugcAccepted,
    prerequisitesMet: !!prereq?.prerequisitesMet,
  };
}

/**
 * Record full acceptance of the UGC agreement for a user (all clauses true).
 * Called at sign-up so consent is captured once, up front, rather than per
 * trail. Idempotent — upserts on the user's existing row.
 */
export async function recordUgcAgreement(
  userId: string,
  meta?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<void> {
  const accepted = {
    agreedToContentLicense: true,
    agreedToDataDistribution: true,
    confirmsOriginalContent: true,
    acknowledgesAccuracyDisclaimer: true,
    acknowledgesOsmAttribution: true,
    agreedAt: new Date(),
    ipAddress: meta?.ipAddress ?? null,
    userAgent: meta?.userAgent ?? null,
  };
  await db
    .insert(ugcAgreements)
    .values({ userId, ...accepted })
    .onConflictDoUpdate({ target: ugcAgreements.userId, set: accepted });
}

// ── Trips (cloud-synced itineraries) ──────────────────────────────────────────

export interface TripPayload {
  clientId: string;
  title: string;
  destination?: string;
  vehicle?: string;
  terrain?: string;
  duration?: string;
  difficulty?: number;
  notes?: string;
  savedAt?: string;
}

export function serializeTrip(row: TripRow) {
  return {
    id: row.clientId,
    title: row.title,
    destination: row.destination ?? "",
    vehicle: row.vehicle ?? "",
    terrain: row.terrain ?? "",
    duration: row.duration ?? "",
    difficulty: row.difficulty ?? 5,
    notes: row.notes ?? "",
    savedAt: (row.savedAt ?? row.createdAt ?? new Date()).toISOString(),
  };
}

export async function listTrips(userId: string) {
  const rows = await db
    .select()
    .from(trips)
    .where(eq(trips.userId, userId))
    .orderBy(desc(trips.savedAt));
  return rows.map(serializeTrip);
}

/** Upsert a single trip for a user, keyed on (userId, clientId). */
export async function upsertTrip(userId: string, t: TripPayload) {
  const savedAt = t.savedAt ? new Date(t.savedAt) : new Date();
  const existing = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.userId, userId), eq(trips.clientId, t.clientId)))
    .limit(1);

  const values = {
    title: t.title,
    destination: t.destination ?? "",
    vehicle: t.vehicle ?? "",
    terrain: t.terrain ?? "",
    duration: t.duration ?? "",
    difficulty: typeof t.difficulty === "number" ? t.difficulty : 5,
    notes: t.notes ?? "",
    savedAt,
  };

  if (existing.length > 0) {
    await db.update(trips).set(values).where(eq(trips.id, existing[0].id));
  } else {
    await db.insert(trips).values({ userId, clientId: t.clientId, ...values });
  }
}

export async function deleteTrip(userId: string, clientId: string): Promise<boolean> {
  const result = await db
    .delete(trips)
    .where(and(eq(trips.userId, userId), eq(trips.clientId, clientId)))
    .returning({ id: trips.id });
  return result.length > 0;
}

// ── Trail ownership / visibility / sharing ────────────────────────────────────

export async function setTrailVisibility(
  trailId: number,
  userId: string,
  visibility: "private" | "unlisted" | "public",
): Promise<boolean> {
  const result = await db
    .update(trails)
    .set({ visibility, updatedAt: new Date() })
    .where(and(eq(trails.id, trailId), eq(trails.uploaderUserId, userId)))
    .returning({ id: trails.id });
  return result.length > 0;
}

/**
 * Ensure a trail has a share token (creating one if needed) and that it is at
 * least unlisted so the link works. Only the owner may share. Returns the token
 * or null if the trail isn't owned by the user.
 */
export async function ensureShareToken(
  trailId: number,
  userId: string,
): Promise<string | null> {
  const [trail] = await db
    .select()
    .from(trails)
    .where(and(eq(trails.id, trailId), eq(trails.uploaderUserId, userId)))
    .limit(1);
  if (!trail) return null;

  let token = trail.shareToken;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (!token) {
    token = randomBytes(12).toString("hex");
    patch.shareToken = token;
  }
  // Bump private → unlisted so the link is viewable. Leave public as-is.
  if (trail.visibility === "private") {
    patch.visibility = "unlisted";
  }
  await db.update(trails).set(patch).where(eq(trails.id, trailId));
  return token;
}

export async function getTrailIdByShareToken(token: string): Promise<number | null> {
  const [trail] = await db
    .select({ id: trails.id })
    .from(trails)
    .where(eq(trails.shareToken, token))
    .limit(1);
  return trail ? trail.id : null;
}
