import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { CONVOY_STATUSES } from "../../shared/schema";
import {
  createConvoy,
  joinConvoyByCode,
  listConvoysForUser,
  getConvoyById,
  getMembers,
  getActiveMembership,
  updateHeartbeat,
  setMemberStatus,
  leaveConvoy,
  endConvoy,
} from "./storage";

// ── Validation ───────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  vehicleLabel: z.string().trim().max(80).optional(),
});

const joinSchema = z.object({
  code: z.string().trim().min(1).max(12),
  vehicleLabel: z.string().trim().max(80).optional(),
});

const heartbeatSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  heading: z.number().optional(),
  speed: z.number().optional(),
  status: z.enum(CONVOY_STATUSES).optional(),
});

const statusSchema = z.object({
  status: z.enum(CONVOY_STATUSES),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseConvoyId(req: Request, res: Response): number | null {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid convoy ID" });
    return null;
  }
  return id;
}

export function registerConvoyRoutes(app: Express): void {
  // ── POST /api/convoys ──────────────────────────────────────────────────────
  // Create a convoy; caller becomes the owner member (status moving).
  app.post("/api/convoys", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "A convoy name is required." });
      }
      const result = await createConvoy({
        ownerUserId: req.user!.id,
        name: parsed.data.name,
        displayName: req.user!.username,
        vehicleLabel: parsed.data.vehicleLabel ?? null,
      });
      res.json(result);
    } catch (err) {
      console.error("[convoys] POST /api/convoys error:", err);
      res.status(500).json({ error: "Could not create convoy." });
    }
  });

  // ── POST /api/convoys/join ─────────────────────────────────────────────────
  // Join an active convoy by invite code (reactivates a prior membership).
  app.post("/api/convoys/join", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = joinSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "An invite code is required." });
      }
      const result = await joinConvoyByCode({
        code: parsed.data.code.toUpperCase(),
        userId: req.user!.id,
        displayName: req.user!.username,
        vehicleLabel: parsed.data.vehicleLabel ?? null,
      });
      if (!result) {
        return res.status(404).json({ error: "No active convoy found for that code." });
      }
      res.json(result);
    } catch (err) {
      console.error("[convoys] POST /api/convoys/join error:", err);
      res.status(500).json({ error: "Could not join convoy." });
    }
  });

  // ── GET /api/convoys ───────────────────────────────────────────────────────
  // Active convoys the caller belongs to (not left).
  app.get("/api/convoys", requireAuth, async (req: Request, res: Response) => {
    try {
      const convoys = await listConvoysForUser(req.user!.id);
      res.json({ convoys });
    } catch (err) {
      console.error("[convoys] GET /api/convoys error:", err);
      res.status(500).json({ error: "Could not load convoys." });
    }
  });

  // ── GET /api/convoys/:id ───────────────────────────────────────────────────
  // Full convoy + member list. 403 unless caller is an active member.
  app.get("/api/convoys/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const convoyId = parseConvoyId(req, res);
      if (convoyId === null) return;

      const membership = await getActiveMembership(convoyId, req.user!.id);
      if (!membership) {
        return res.status(403).json({ error: "You are not a member of this convoy." });
      }
      const convoy = await getConvoyById(convoyId);
      if (!convoy) return res.status(404).json({ error: "Convoy not found." });

      const members = await getMembers(convoyId);
      res.json({ convoy, members });
    } catch (err) {
      console.error("[convoys] GET /api/convoys/:id error:", err);
      res.status(500).json({ error: "Could not load convoy." });
    }
  });

  // ── POST /api/convoys/:id/heartbeat ────────────────────────────────────────
  // Update caller position + lastSeenAt (+ optional status). Doubles as a live
  // refresh — returns the current convoy + member list.
  app.post(
    "/api/convoys/:id/heartbeat",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const convoyId = parseConvoyId(req, res);
        if (convoyId === null) return;

        const membership = await getActiveMembership(convoyId, req.user!.id);
        if (!membership) {
          return res.status(403).json({ error: "You are not a member of this convoy." });
        }

        const parsed = heartbeatSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({ error: "Invalid heartbeat payload." });
        }

        await updateHeartbeat(convoyId, req.user!.id, parsed.data);

        const convoy = await getConvoyById(convoyId);
        const members = await getMembers(convoyId);
        res.json({ convoy, members });
      } catch (err) {
        console.error("[convoys] POST /api/convoys/:id/heartbeat error:", err);
        res.status(500).json({ error: "Heartbeat failed." });
      }
    },
  );

  // ── PATCH /api/convoys/:id/status ──────────────────────────────────────────
  // Set caller status (help records helpAt; otherwise clears it).
  app.patch(
    "/api/convoys/:id/status",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const convoyId = parseConvoyId(req, res);
        if (convoyId === null) return;

        const membership = await getActiveMembership(convoyId, req.user!.id);
        if (!membership) {
          return res.status(403).json({ error: "You are not a member of this convoy." });
        }

        const parsed = statusSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: "Invalid status." });
        }

        await setMemberStatus(convoyId, req.user!.id, parsed.data.status);
        const members = await getMembers(convoyId);
        res.json({ members });
      } catch (err) {
        console.error("[convoys] PATCH /api/convoys/:id/status error:", err);
        res.status(500).json({ error: "Could not update status." });
      }
    },
  );

  // ── POST /api/convoys/:id/leave ────────────────────────────────────────────
  // Mark the caller as having left the convoy.
  app.post(
    "/api/convoys/:id/leave",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const convoyId = parseConvoyId(req, res);
        if (convoyId === null) return;

        const membership = await getActiveMembership(convoyId, req.user!.id);
        if (!membership) {
          return res.status(403).json({ error: "You are not a member of this convoy." });
        }

        await leaveConvoy(convoyId, req.user!.id);
        res.json({ ok: true });
      } catch (err) {
        console.error("[convoys] POST /api/convoys/:id/leave error:", err);
        res.status(500).json({ error: "Could not leave convoy." });
      }
    },
  );

  // ── POST /api/convoys/:id/end ──────────────────────────────────────────────
  // Owner-only: deactivate the convoy.
  app.post(
    "/api/convoys/:id/end",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const convoyId = parseConvoyId(req, res);
        if (convoyId === null) return;

        const convoy = await getConvoyById(convoyId);
        if (!convoy) return res.status(404).json({ error: "Convoy not found." });
        if (convoy.ownerUserId !== req.user!.id) {
          return res.status(403).json({ error: "Only the owner can end this convoy." });
        }

        await endConvoy(convoyId);
        res.json({ ok: true });
      } catch (err) {
        console.error("[convoys] POST /api/convoys/:id/end error:", err);
        res.status(500).json({ error: "Could not end convoy." });
      }
    },
  );
}
