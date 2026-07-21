import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "./storage";
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  requireAuth,
  requireAdmin,
  hasAllowlistAdmins,
  publicUser,
} from "./auth";
import {
  listTrips,
  upsertTrip,
  deleteTrip,
  setTrailVisibility,
  ensureShareToken,
  getTrailIdByShareToken,
  getUgcStatus,
  recordUgcAgreement,
} from "./cloud";
import { getTrailsForUser, getTrailById } from "./trails/storage";

const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(40),
  password: z.string().min(6).max(200),
});

// Sign-up additionally requires one-time acceptance of the content agreement.
const signupSchema = credentialsSchema.extend({
  agreedToTerms: z.literal(true),
});

const tripSchema = z.object({
  clientId: z.string().min(1),
  title: z.string().min(1).max(200),
  destination: z.string().max(300).optional(),
  vehicle: z.string().max(200).optional(),
  terrain: z.string().max(200).optional(),
  duration: z.string().max(100).optional(),
  difficulty: z.number().min(1).max(10).optional(),
  notes: z.string().max(5000).optional(),
  savedAt: z.string().optional(),
});

const visibilitySchema = z.object({
  visibility: z.enum(["private", "unlisted", "public"]),
});

const adminFlagSchema = z.object({
  isAdmin: z.boolean(),
});

function adminUser(user: { id: string; username: string; isAdmin: boolean }) {
  return { id: user.id, username: user.username, isAdmin: user.isAdmin };
}

export function registerAccountRoutes(app: Express): void {
  // ── Auth ────────────────────────────────────────────────────────────────────
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) {
        const agreementMissing = parsed.error.issues.some((i) =>
          i.path.includes("agreedToTerms"),
        );
        return res.status(400).json({
          error: agreementMissing
            ? "You must accept the content agreement to sign up."
            : "Username (3+ chars) and password (6+ chars) required.",
        });
      }
      const username = parsed.data.username;
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ error: "That username is already taken." });
      }
      const password = await hashPassword(parsed.data.password);
      const user = await storage.createUser({ username, password });
      // Capture content-agreement consent once, at sign-up.
      await recordUgcAgreement(user.id, {
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
      const token = await createSession(user.id);
      res.json({ token, user: publicUser(user) });
    } catch (err) {
      console.error("[auth] signup error:", err);
      res.status(500).json({ error: "Could not create account." });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const parsed = credentialsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Enter your username and password." });
      }
      const user = await storage.getUserByUsername(parsed.data.username);
      if (!user || !(await verifyPassword(parsed.data.password, user.password))) {
        return res.status(401).json({ error: "Incorrect username or password." });
      }
      const token = await createSession(user.id);
      res.json({ token, user: publicUser(user) });
    } catch (err) {
      console.error("[auth] login error:", err);
      res.status(500).json({ error: "Could not log in." });
    }
  });

  app.post("/api/auth/logout", requireAuth, async (req: Request, res: Response) => {
    try {
      if (req.authToken) await destroySession(req.authToken);
      res.json({ ok: true });
    } catch (err) {
      console.error("[auth] logout error:", err);
      res.status(500).json({ error: "Could not log out." });
    }
  });

  app.get("/api/auth/me", requireAuth, (req: Request, res: Response) => {
    res.json({ user: publicUser(req.user!) });
  });

  // ── Admin: browse / search accounts ─────────────────────────────────────────
  // List accounts (id, username, isAdmin) so an admin can find the right target
  // for the PATCH promote/demote endpoint without a manual DB lookup. Optional
  // `query` param filters by case-insensitive username substring. Gated behind
  // requireAdmin — only existing admins may enumerate accounts.
  app.get(
    "/api/admin/users",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const query = typeof req.query.query === "string" ? req.query.query : "";
        const users = await storage.searchUsers(query);
        res.json({ users: users.map(adminUser) });
      } catch (err) {
        console.error("[admin] list users error:", err);
        res.status(500).json({ error: "Could not load accounts." });
      }
    },
  );

  // ── Admin: manage other users' admin access ─────────────────────────────────
  // Toggle another account's `isAdmin` flag. Gated behind requireAdmin so only
  // existing admins can promote/demote. Guards against an admin demoting
  // themselves when they are the last remaining admin (which would lock everyone
  // out of admin-only operations).
  app.patch(
    "/api/admin/users/:id",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = String(req.params.id);
        const parsed = adminFlagSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: "Provide isAdmin (true or false)." });
        }
        const target = await storage.getUser(id);
        if (!target) {
          return res.status(404).json({ error: "User not found." });
        }

        // Demotion guard: don't allow removing the last admin. We consider both
        // DB-flagged admins and the ADMIN_USERNAMES allowlist so we never leave
        // the system with zero admins.
        if (!parsed.data.isAdmin && target.isAdmin) {
          const dbAdmins = await storage.countAdmins();
          if (dbAdmins <= 1 && !hasAllowlistAdmins()) {
            const message =
              target.id === req.user!.id
                ? "You are the last admin and cannot demote yourself."
                : "Cannot remove the last admin. Promote another admin first.";
            return res.status(409).json({ error: message });
          }
        }

        const previousIsAdmin = target.isAdmin;
        const updated = await storage.setUserAdmin(id, parsed.data.isAdmin);
        if (!updated) {
          return res.status(404).json({ error: "User not found." });
        }

        // Audit trail: record who changed whom, the before/after value, and when.
        // Only meaningful transitions are logged (a no-op toggle to the same value
        // records nothing). A failed audit write must not fail the request — the
        // access change already happened — so we log and continue.
        if (previousIsAdmin !== updated.isAdmin) {
          try {
            await storage.recordAdminAudit({
              actingUserId: req.user!.id,
              actingUsername: req.user!.username,
              targetUserId: updated.id,
              targetUsername: updated.username,
              oldIsAdmin: previousIsAdmin,
              newIsAdmin: updated.isAdmin,
            });
          } catch (auditErr) {
            console.error("[admin] audit log write failed:", auditErr);
          }
        }

        res.json({ user: adminUser(updated) });
      } catch (err) {
        console.error("[admin] set user admin error:", err);
        res.status(500).json({ error: "Could not update admin access." });
      }
    },
  );

  // ── Admin: review the admin-power change history ─────────────────────────────
  // Recent promotions/demotions, most recent first. Gated behind requireAdmin so
  // only existing admins can review who granted or revoked access.
  app.get(
    "/api/admin/audit-log",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const rawLimit = Number(req.query.limit);
        const limit =
          Number.isFinite(rawLimit) && rawLimit > 0
            ? Math.min(Math.floor(rawLimit), 200)
            : 50;
        const entries = await storage.listAdminAudit(limit);
        res.json({ entries });
      } catch (err) {
        console.error("[admin] list audit log error:", err);
        res.status(500).json({ error: "Could not load audit history." });
      }
    },
  );

  // ── My tracks ─────────────────────────────────────────────────────────────
  app.get("/api/me/trails", requireAuth, async (req: Request, res: Response) => {
    try {
      const trails = await getTrailsForUser(req.user!.id);
      res.json({ trails });
    } catch (err) {
      console.error("[me] trails error:", err);
      res.status(500).json({ error: "Could not load your tracks." });
    }
  });

  // ── Trips cloud sync ────────────────────────────────────────────────────────
  app.get("/api/me/trips", requireAuth, async (req: Request, res: Response) => {
    try {
      const trips = await listTrips(req.user!.id);
      res.json({ trips });
    } catch (err) {
      console.error("[trips] list error:", err);
      res.status(500).json({ error: "Could not load trips." });
    }
  });

  // Upsert a trip (used for create + bulk push from local store).
  app.post("/api/me/trips", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = req.body;
      const items = Array.isArray(body?.trips) ? body.trips : [body];
      const parsed = z.array(tripSchema).safeParse(items);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid trip data" });
      }
      for (const t of parsed.data) {
        await upsertTrip(req.user!.id, t);
      }
      const trips = await listTrips(req.user!.id);
      res.json({ ok: true, trips });
    } catch (err) {
      console.error("[trips] upsert error:", err);
      res.status(500).json({ error: "Could not save trip." });
    }
  });

  app.delete("/api/me/trips/:clientId", requireAuth, async (req: Request, res: Response) => {
    try {
      await deleteTrip(req.user!.id, String(req.params.clientId));
      res.json({ ok: true });
    } catch (err) {
      console.error("[trips] delete error:", err);
      res.status(500).json({ error: "Could not delete trip." });
    }
  });

  // ── UGC / upload-prerequisite status ───────────────────────────────────────
  app.get("/api/me/ugc-status", requireAuth, async (req: Request, res: Response) => {
    try {
      const status = await getUgcStatus(req.user!.id);
      res.json(status);
    } catch (err) {
      console.error("[ugc] status error:", err);
      res.status(500).json({ error: "Could not load agreement status." });
    }
  });

  // ── Trail visibility + sharing ────────────────────────────────────────────
  app.patch("/api/trails/:id/visibility", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid trail ID" });
      const parsed = visibilitySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid visibility" });
      // Publishing (public/unlisted) requires the user to have accepted the UGC
      // agreement — gate it server-side so the client can launch onboarding.
      if (parsed.data.visibility !== "private") {
        const status = await getUgcStatus(req.user!.id);
        if (!status.ugcAccepted) {
          return res
            .status(403)
            .json({ error: "Accept the content agreement first.", code: "ugc_required" });
        }
      }
      const ok = await setTrailVisibility(id, req.user!.id, parsed.data.visibility);
      if (!ok) return res.status(404).json({ error: "Track not found or not yours." });
      res.json({ ok: true, visibility: parsed.data.visibility });
    } catch (err) {
      console.error("[trails] visibility error:", err);
      res.status(500).json({ error: "Could not update visibility." });
    }
  });

  // Create / fetch a shareable link for a track (owner only).
  app.post("/api/trails/:id/share", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid trail ID" });
      const status = await getUgcStatus(req.user!.id);
      if (!status.ugcAccepted) {
        return res
          .status(403)
          .json({ error: "Accept the content agreement first.", code: "ugc_required" });
      }
      const token = await ensureShareToken(id, req.user!.id);
      if (!token) return res.status(404).json({ error: "Track not found or not yours." });
      const proto = req.header("x-forwarded-proto") || req.protocol || "https";
      const host = req.header("x-forwarded-host") || req.get("host");
      res.json({ ok: true, token, url: `${proto}://${host}/share/${token}` });
    } catch (err) {
      console.error("[trails] share error:", err);
      res.status(500).json({ error: "Could not create share link." });
    }
  });

  // Public read of a shared track by token — no auth required.
  app.get("/api/share/:token", async (req: Request, res: Response) => {
    try {
      const id = await getTrailIdByShareToken(String(req.params.token));
      if (id == null) return res.status(404).json({ error: "Shared track not found." });
      const trail = await getTrailById(id);
      if (!trail) return res.status(404).json({ error: "Shared track not found." });
      res.json({ trail });
    } catch (err) {
      console.error("[share] read error:", err);
      res.status(500).json({ error: "Could not load shared track." });
    }
  });
}
