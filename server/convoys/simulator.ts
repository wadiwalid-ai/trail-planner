import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import {
  getConvoyById,
  getActiveMembership,
  getMembers,
  addGhosts,
  tickGhosts,
  removeGhosts,
} from "./storage";

// Default spawn center (Liwa, UAE) when no center + no caller location exists.
const DEFAULT_CENTER_LAT = 23.1;
const DEFAULT_CENTER_LNG = 53.78;

// ── Auto-tick timers (one per convoy) ────────────────────────────────────────
const timers = new Map<number, ReturnType<typeof setInterval>>();

function stopAuto(convoyId: number): void {
  const t = timers.get(convoyId);
  if (t) {
    clearInterval(t);
    timers.delete(convoyId);
  }
}

function startAuto(convoyId: number): void {
  stopAuto(convoyId);
  const t = setInterval(async () => {
    try {
      // Self-clear when the convoy is gone or has been ended.
      const convoy = await getConvoyById(convoyId);
      if (!convoy || !convoy.isActive) {
        stopAuto(convoyId);
        return;
      }
      await tickGhosts(convoyId);
    } catch (err) {
      console.error("[convoys/sim] auto-tick error:", err);
    }
  }, 3000);
  timers.set(convoyId, t);
}

// ── Validation ───────────────────────────────────────────────────────────────
const ghostsSchema = z.object({
  count: z.number().int().min(1).max(12).optional(),
  centerLat: z.number().min(-90).max(90).optional(),
  centerLng: z.number().min(-180).max(180).optional(),
});

const autoSchema = z.object({ on: z.boolean() });

function parseConvoyId(req: Request, res: Response): number | null {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid convoy ID" });
    return null;
  }
  return id;
}

/**
 * Resolve the convoy + caller's active membership, returning a spawn center
 * derived from the caller's last known position (falling back to a default).
 * Sends an error response and returns null when authz fails.
 */
async function resolveMember(
  req: Request,
  res: Response,
): Promise<{ convoyId: number; centerLat: number; centerLng: number } | null> {
  const convoyId = parseConvoyId(req, res);
  if (convoyId === null) return null;

  const membership = await getActiveMembership(convoyId, req.user!.id);
  if (!membership) {
    res.status(403).json({ error: "You are not a member of this convoy." });
    return null;
  }
  return {
    convoyId,
    centerLat: membership.lat ?? DEFAULT_CENTER_LAT,
    centerLng: membership.lng ?? DEFAULT_CENTER_LNG,
  };
}

/**
 * Dev-only convoy simulator. Mounted at /api/dev/convoys and ONLY registered
 * when NODE_ENV !== 'production' (guarded at the call site in server/routes.ts).
 */
export function registerConvoySimulator(app: Express): void {
  console.log("[convoys/sim] Dev ghost-rover simulator mounted at /api/dev/convoys");

  // ── POST /api/dev/convoys/:id/ghosts ───────────────────────────────────────
  app.post(
    "/api/dev/convoys/:id/ghosts",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const ctx = await resolveMember(req, res);
        if (!ctx) return;

        const parsed = ghostsSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({ error: "Invalid ghost parameters." });
        }
        const count = parsed.data.count ?? 3;
        const centerLat = parsed.data.centerLat ?? ctx.centerLat;
        const centerLng = parsed.data.centerLng ?? ctx.centerLng;

        const members = await addGhosts(ctx.convoyId, count, centerLat, centerLng);
        res.json({ members });
      } catch (err) {
        console.error("[convoys/sim] add ghosts error:", err);
        res.status(500).json({ error: "Could not add ghosts." });
      }
    },
  );

  // ── POST /api/dev/convoys/:id/ghosts/tick ──────────────────────────────────
  app.post(
    "/api/dev/convoys/:id/ghosts/tick",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const ctx = await resolveMember(req, res);
        if (!ctx) return;
        const members = await tickGhosts(ctx.convoyId);
        res.json({ members });
      } catch (err) {
        console.error("[convoys/sim] tick error:", err);
        res.status(500).json({ error: "Could not tick ghosts." });
      }
    },
  );

  // ── POST /api/dev/convoys/:id/ghosts/auto ──────────────────────────────────
  app.post(
    "/api/dev/convoys/:id/ghosts/auto",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const ctx = await resolveMember(req, res);
        if (!ctx) return;

        const parsed = autoSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: "Expected { on: boolean }." });
        }

        if (parsed.data.on) startAuto(ctx.convoyId);
        else stopAuto(ctx.convoyId);

        res.json({ ok: true, auto: parsed.data.on });
      } catch (err) {
        console.error("[convoys/sim] auto error:", err);
        res.status(500).json({ error: "Could not toggle auto mode." });
      }
    },
  );

  // ── DELETE /api/dev/convoys/:id/ghosts ─────────────────────────────────────
  app.delete(
    "/api/dev/convoys/:id/ghosts",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const ctx = await resolveMember(req, res);
        if (!ctx) return;
        stopAuto(ctx.convoyId);
        const members = await removeGhosts(ctx.convoyId);
        res.json({ members });
      } catch (err) {
        console.error("[convoys/sim] remove ghosts error:", err);
        res.status(500).json({ error: "Could not remove ghosts." });
      }
    },
  );
}
