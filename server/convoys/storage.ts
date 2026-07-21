import { and, eq, isNull, sql } from "drizzle-orm";
import { randomInt } from "crypto";
import { db } from "../db";
import {
  convoys,
  convoyMembers,
  type Convoy,
  type ConvoyMember,
  type ConvoyStatus,
} from "../../shared/schema";

// ── Serialized shapes returned to the API layer ─────────────────────────────

export interface ConvoyView {
  id: number;
  ownerUserId: string;
  name: string;
  inviteCode: string;
  isActive: boolean;
  createdAt: string | null;
  endedAt: string | null;
}

export interface ConvoyMemberView {
  id: number;
  userId: string | null;
  displayName: string;
  vehicleLabel: string | null;
  role: string;
  status: string;
  lat: number | null;
  lng: number | null;
  heading: number | null;
  speed: number | null;
  isGhost: boolean;
  helpAt: string | null;
  lastSeenAt: string | null;
  joinedAt: string | null;
}

function toConvoyView(c: Convoy): ConvoyView {
  return {
    id: c.id,
    ownerUserId: c.ownerUserId,
    name: c.name,
    inviteCode: c.inviteCode,
    isActive: c.isActive,
    createdAt: c.createdAt ? c.createdAt.toISOString() : null,
    endedAt: c.endedAt ? c.endedAt.toISOString() : null,
  };
}

function toMemberView(m: ConvoyMember): ConvoyMemberView {
  return {
    id: m.id,
    userId: m.userId ?? null,
    displayName: m.displayName,
    vehicleLabel: m.vehicleLabel ?? null,
    role: m.role,
    status: m.status,
    lat: m.lat ?? null,
    lng: m.lng ?? null,
    heading: m.heading ?? null,
    speed: m.speed ?? null,
    isGhost: m.isGhost,
    helpAt: m.helpAt ? m.helpAt.toISOString() : null,
    lastSeenAt: m.lastSeenAt ? m.lastSeenAt.toISOString() : null,
    joinedAt: m.joinedAt ? m.joinedAt.toISOString() : null,
  };
}

// ── Invite codes ────────────────────────────────────────────────────────────

// Unambiguous alphabet (no 0/O/1/I) so codes are easy to read aloud / type.
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomInviteCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  }
  return code;
}

async function generateUniqueInviteCode(): Promise<string> {
  // Practically never collides, but loop a bounded number of times to be safe.
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = randomInviteCode();
    const [existing] = await db
      .select({ id: convoys.id })
      .from(convoys)
      .where(eq(convoys.inviteCode, code))
      .limit(1);
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique invite code");
}

// ── Queries ─────────────────────────────────────────────────────────────────

/** Active (non-left) members of a convoy, owner first by join order. */
export async function getMembers(convoyId: number): Promise<ConvoyMemberView[]> {
  const rows = await db
    .select()
    .from(convoyMembers)
    .where(and(eq(convoyMembers.convoyId, convoyId), isNull(convoyMembers.leftAt)))
    .orderBy(convoyMembers.joinedAt, convoyMembers.id);
  return rows.map(toMemberView);
}

export async function getConvoyById(convoyId: number): Promise<ConvoyView | null> {
  const [row] = await db
    .select()
    .from(convoys)
    .where(eq(convoys.id, convoyId))
    .limit(1);
  return row ? toConvoyView(row) : null;
}

async function getActiveConvoyByCode(code: string): Promise<Convoy | null> {
  const [row] = await db
    .select()
    .from(convoys)
    .where(and(eq(convoys.inviteCode, code), eq(convoys.isActive, true)))
    .limit(1);
  return row ?? null;
}

/**
 * The caller's active membership row (leftAt null) for a convoy, used for
 * authorization on :id routes. Returns null when the caller is not a member.
 */
export async function getActiveMembership(
  convoyId: number,
  userId: string,
): Promise<ConvoyMember | null> {
  const [row] = await db
    .select()
    .from(convoyMembers)
    .where(
      and(
        eq(convoyMembers.convoyId, convoyId),
        eq(convoyMembers.userId, userId),
        isNull(convoyMembers.leftAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Active convoys the user is an active member of, with a live member count. */
export async function listConvoysForUser(
  userId: string,
): Promise<{ convoy: ConvoyView; memberCount: number }[]> {
  const rows = await db
    .select({ convoy: convoys })
    .from(convoyMembers)
    .innerJoin(convoys, eq(convoyMembers.convoyId, convoys.id))
    .where(
      and(
        eq(convoyMembers.userId, userId),
        isNull(convoyMembers.leftAt),
        eq(convoys.isActive, true),
      ),
    )
    .orderBy(convoys.createdAt);

  const result: { convoy: ConvoyView; memberCount: number }[] = [];
  for (const r of rows) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(convoyMembers)
      .where(
        and(eq(convoyMembers.convoyId, r.convoy.id), isNull(convoyMembers.leftAt)),
      );
    result.push({ convoy: toConvoyView(r.convoy), memberCount: count });
  }
  return result;
}

// ── Mutations ───────────────────────────────────────────────────────────────

export async function createConvoy(params: {
  ownerUserId: string;
  name: string;
  displayName: string;
  vehicleLabel?: string | null;
}): Promise<{ convoy: ConvoyView; members: ConvoyMemberView[] }> {
  const inviteCode = await generateUniqueInviteCode();
  const [convoy] = await db
    .insert(convoys)
    .values({
      ownerUserId: params.ownerUserId,
      name: params.name,
      inviteCode,
      isActive: true,
    })
    .returning();

  await db.insert(convoyMembers).values({
    convoyId: convoy.id,
    userId: params.ownerUserId,
    displayName: params.displayName,
    vehicleLabel: params.vehicleLabel ?? null,
    role: "owner",
    status: "moving",
    isGhost: false,
  });

  const members = await getMembers(convoy.id);
  return { convoy: toConvoyView(convoy), members };
}

/**
 * Join an active convoy by invite code. If the caller already has a membership
 * row (even one they previously left), it is reactivated; otherwise a new member
 * row is inserted. Returns null when no active convoy exists for the code.
 */
export async function joinConvoyByCode(params: {
  code: string;
  userId: string;
  displayName: string;
  vehicleLabel?: string | null;
}): Promise<{ convoy: ConvoyView; members: ConvoyMemberView[] } | null> {
  const convoy = await getActiveConvoyByCode(params.code);
  if (!convoy) return null;

  const [existing] = await db
    .select()
    .from(convoyMembers)
    .where(
      and(
        eq(convoyMembers.convoyId, convoy.id),
        eq(convoyMembers.userId, params.userId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(convoyMembers)
      .set({
        leftAt: null,
        lastSeenAt: new Date(),
        displayName: params.displayName,
        vehicleLabel: params.vehicleLabel ?? existing.vehicleLabel ?? null,
      })
      .where(eq(convoyMembers.id, existing.id));
  } else {
    await db.insert(convoyMembers).values({
      convoyId: convoy.id,
      userId: params.userId,
      displayName: params.displayName,
      vehicleLabel: params.vehicleLabel ?? null,
      role: "member",
      status: "moving",
      isGhost: false,
    });
  }

  const members = await getMembers(convoy.id);
  return { convoy: toConvoyView(convoy), members };
}

export interface HeartbeatPayload {
  lat?: number;
  lng?: number;
  heading?: number;
  speed?: number;
  status?: ConvoyStatus;
}

/** Update the caller's position + lastSeenAt (+ optional status). */
export async function updateHeartbeat(
  convoyId: number,
  userId: string,
  payload: HeartbeatPayload,
): Promise<void> {
  const patch: Partial<typeof convoyMembers.$inferInsert> = {
    lastSeenAt: new Date(),
  };
  if (payload.lat !== undefined) patch.lat = payload.lat;
  if (payload.lng !== undefined) patch.lng = payload.lng;
  if (payload.heading !== undefined) patch.heading = payload.heading;
  if (payload.speed !== undefined) patch.speed = payload.speed;
  if (payload.status !== undefined) {
    patch.status = payload.status;
    patch.helpAt = payload.status === "help" ? new Date() : null;
  }

  await db
    .update(convoyMembers)
    .set(patch)
    .where(
      and(
        eq(convoyMembers.convoyId, convoyId),
        eq(convoyMembers.userId, userId),
        isNull(convoyMembers.leftAt),
      ),
    );
}

/**
 * Set the caller's status. `help` records helpAt=now; any other status clears
 * helpAt. lastSeenAt is always refreshed.
 */
export async function setMemberStatus(
  convoyId: number,
  userId: string,
  status: ConvoyStatus,
): Promise<void> {
  await db
    .update(convoyMembers)
    .set({
      status,
      helpAt: status === "help" ? new Date() : null,
      lastSeenAt: new Date(),
    })
    .where(
      and(
        eq(convoyMembers.convoyId, convoyId),
        eq(convoyMembers.userId, userId),
        isNull(convoyMembers.leftAt),
      ),
    );
}

/** Mark the caller as having left the convoy. */
export async function leaveConvoy(convoyId: number, userId: string): Promise<void> {
  await db
    .update(convoyMembers)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(convoyMembers.convoyId, convoyId),
        eq(convoyMembers.userId, userId),
        isNull(convoyMembers.leftAt),
      ),
    );
}

/** End a convoy (owner-only authz enforced by the route). */
export async function endConvoy(convoyId: number): Promise<void> {
  await db
    .update(convoys)
    .set({ isActive: false, endedAt: new Date() })
    .where(eq(convoys.id, convoyId));
}

// ── Dev simulator support (ghost rovers) ────────────────────────────────────

const GHOST_NAMES = [
  "Rashid",
  "Omar",
  "Yusuf",
  "Khalid",
  "Salem",
  "Hamad",
  "Faisal",
  "Nasser",
];
const GHOST_VEHICLES = [
  "Nissan Patrol",
  "Toyota LC76",
  "Jeep Wrangler",
  "Ford Bronco",
  "Land Rover Defender",
  "Toyota Hilux",
  "Mitsubishi Pajero",
  "Toyota 4Runner",
];
// Status cycle used by both spawn variety and the tick walker (excludes "help").
const GHOST_STATUS_CYCLE: ConvoyStatus[] = ["moving", "stopped", "stuck", "retry"];

/**
 * Insert `count` ghost members spread on a ring around a center point. Ghosts
 * have userId=null and isGhost=true. Returns the refreshed member list.
 */
export async function addGhosts(
  convoyId: number,
  count: number,
  centerLat: number,
  centerLng: number,
): Promise<ConvoyMemberView[]> {
  const existing = await db
    .select({ id: convoyMembers.id })
    .from(convoyMembers)
    .where(and(eq(convoyMembers.convoyId, convoyId), eq(convoyMembers.isGhost, true)));
  const base = existing.length;

  const rows: (typeof convoyMembers.$inferInsert)[] = [];
  for (let i = 0; i < count; i++) {
    const idx = base + i;
    const angle = (i / Math.max(count, 1)) * Math.PI * 2 + idx * 0.6;
    const radiusDeg = 0.004 + (idx % 3) * 0.003; // ~0.4–1 km
    rows.push({
      convoyId,
      userId: null,
      displayName: GHOST_NAMES[idx % GHOST_NAMES.length],
      vehicleLabel: GHOST_VEHICLES[idx % GHOST_VEHICLES.length],
      role: "member",
      status: GHOST_STATUS_CYCLE[idx % GHOST_STATUS_CYCLE.length],
      lat: centerLat + Math.cos(angle) * radiusDeg,
      lng: centerLng + Math.sin(angle) * radiusDeg,
      heading: ((angle * 180) / Math.PI + 360) % 360,
      speed: 25 + (idx % 4) * 8,
      isGhost: true,
    });
  }

  if (rows.length > 0) {
    await db.insert(convoyMembers).values(rows);
  }
  return getMembers(convoyId);
}

/**
 * Advance every ghost a single deterministic step: nudge along its heading,
 * gently turn, occasionally cycle status, and refresh lastSeenAt.
 */
export async function tickGhosts(convoyId: number): Promise<ConvoyMemberView[]> {
  const ghosts = await db
    .select()
    .from(convoyMembers)
    .where(
      and(
        eq(convoyMembers.convoyId, convoyId),
        eq(convoyMembers.isGhost, true),
        isNull(convoyMembers.leftAt),
      ),
    );

  const now = new Date();
  const phase = Math.floor(now.getTime() / 3000);

  for (const g of ghosts) {
    const lat = g.lat ?? 0;
    const lng = g.lng ?? 0;
    // Deterministic gentle turn derived from the ghost's id.
    let heading = g.heading ?? (g.id * 47) % 360;
    heading = (heading + ((g.id % 7) - 3) * 2 + 360) % 360;
    const stepDeg = 0.0006; // ~60 m per tick
    const hr = (heading * Math.PI) / 180;
    const newLat = lat + Math.cos(hr) * stepDeg;
    const newLng = lng + Math.sin(hr) * stepDeg;

    // Occasionally cycle status (deterministic given phase + id).
    let status = g.status;
    if ((phase + g.id) % 5 === 0) {
      const curIdx = GHOST_STATUS_CYCLE.indexOf(status as ConvoyStatus);
      const nextIdx = (curIdx + 1) % GHOST_STATUS_CYCLE.length;
      status = GHOST_STATUS_CYCLE[nextIdx];
    }

    await db
      .update(convoyMembers)
      .set({ lat: newLat, lng: newLng, heading, status, lastSeenAt: now })
      .where(eq(convoyMembers.id, g.id));
  }

  return getMembers(convoyId);
}

/** Remove all ghost members from a convoy. */
export async function removeGhosts(convoyId: number): Promise<ConvoyMemberView[]> {
  await db
    .delete(convoyMembers)
    .where(and(eq(convoyMembers.convoyId, convoyId), eq(convoyMembers.isGhost, true)));
  return getMembers(convoyId);
}
