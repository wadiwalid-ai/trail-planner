/**
 * PHASE 2: SIGNUP — Community trail upload routes.
 *
 * These routes ARE registered in the active route tree (see registerRoutes in
 * server/routes.ts). All mutating routes require an authenticated session and
 * derive the owner from req.user — a userId in the request body is never
 * trusted for authorization.
 */

import type { Express, Request, Response } from "express";
import { db } from "../db";
import {
  trails,
  trailCoordinates,
  trailWaypoints,
  uploadPrerequisites,
  ugcAgreements,
  insertPrerequisitesSchema,
  insertUgcAgreementSchema,
} from "../../shared/schema";
import { eq } from "drizzle-orm";
import { insertTrailFull } from "./storage";
import { requireAuth } from "../auth";
import { z } from "zod";

// ── UGC Terms text (shown at sign-up) ────────────────────────────────────────
// Keep this in sync with the ugcAgreements schema columns.
export const UGC_CLAUSES = [
  {
    key: "agreedToContentLicense",
    title: "Content Licence",
    text: "I grant [App Name] a non-exclusive, royalty-free, worldwide licence to display, distribute, and sublicense my uploaded GPS tracks and waypoints within the app and its services.",
  },
  {
    key: "agreedToDataDistribution",
    title: "Data Sharing",
    text: "I understand my uploaded tracks may be made visible to other users of the app.",
  },
  {
    key: "confirmsOriginalContent",
    title: "Original Content",
    text: "I confirm I personally recorded this GPS track and have the right to upload it. I have not copied tracks from AllTrails, Wikiloc, Komoot, or any other platform.",
  },
  {
    key: "acknowledgesAccuracyDisclaimer",
    title: "Accuracy Disclaimer",
    text: "I acknowledge that trail conditions change. [App Name] is not liable for any decisions made by other users based on data I upload. Tracks are shared as-is.",
  },
  {
    key: "acknowledgesOsmAttribution",
    title: "OpenStreetMap Attribution",
    text: "I understand that trails sourced from OpenStreetMap are © OpenStreetMap contributors and are licensed under the Open Database Licence (ODbL).",
  },
];

// ── Prerequisites schema ─────────────────────────────────────────────────────
const submitPrerequisitesSchema = insertPrerequisitesSchema.extend({
  userId: z.string().min(1),
  vehicleType: z.string().min(2),
  driveExperienceYears: z.number().min(0).max(50),
  vehicleLiftMm: z.number().min(0).max(500).optional(),
  hasLockingDiffs: z.boolean(),
  hasRecoveryGear: z.boolean(),
  hasEmergencyContact: z.boolean(),
  hasFirstAid: z.boolean(),
  hasNavigation: z.boolean(),
  hasConvoyExperience: z.boolean(),
});

function allPrerequisitesMet(data: z.infer<typeof submitPrerequisitesSchema>): boolean {
  return (
    data.hasRecoveryGear &&
    data.hasEmergencyContact &&
    data.hasFirstAid &&
    data.hasNavigation &&
    (data.driveExperienceYears ?? 0) >= 1
  );
}

// ── UGC agreement schema ─────────────────────────────────────────────────────
const submitUgcSchema = z.object({
  userId: z.string().min(1),
  agreedToContentLicense: z.boolean(),
  agreedToDataDistribution: z.boolean(),
  confirmsOriginalContent: z.boolean(),
  acknowledgesAccuracyDisclaimer: z.boolean(),
  acknowledgesOsmAttribution: z.boolean(),
});

// ── GPX upload schema ────────────────────────────────────────────────────────
const uploadTrailSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(2).max(100),
  description: z.string().max(1000).optional(),
  location: z.string().max(100).optional(),
  difficulty: z.number().min(1).max(10),
  terrain: z.string().max(50).optional(),
  distance: z.string().max(20).optional(),
  duration: z.string().max(20).optional(),
  coordinates: z.array(
    z.object({ latitude: z.number(), longitude: z.number() })
  ).min(2),
  waypoints: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        waypointType: z.enum(["start", "end", "scenic", "technical", "water", "camp", "summit", "hazard", "viewpoint", "fuel"]),
        latitude: z.number(),
        longitude: z.number(),
        elevation: z.string().optional(),
        sequenceNum: z.number(),
      })
    )
    .optional()
    .default([]),
});

// ── Route registration ───────────────────────────────────────────────────────

export function registerUploadRoutes(app: Express): void {
  // GET /api/ugc-clauses — returns the UGC clause text for the sign-up UI
  app.get("/api/ugc-clauses", (_req, res) => {
    res.json({ clauses: UGC_CLAUSES });
  });

  // POST /api/user/ugc-agreement — record UGC agreement at sign-up
  app.post("/api/user/ugc-agreement", requireAuth, async (req: Request, res: Response) => {
    req.body = { ...req.body, userId: req.user!.id };
    const parsed = submitUgcSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
    }
    const data = parsed.data;

    const allAgreed =
      data.agreedToContentLicense &&
      data.agreedToDataDistribution &&
      data.confirmsOriginalContent &&
      data.acknowledgesAccuracyDisclaimer &&
      data.acknowledgesOsmAttribution;

    if (!allAgreed) {
      return res.status(400).json({ error: "All UGC clauses must be agreed to." });
    }

    await db.insert(ugcAgreements).values({
      userId: data.userId,
      agreedToContentLicense: data.agreedToContentLicense,
      agreedToDataDistribution: data.agreedToDataDistribution,
      confirmsOriginalContent: data.confirmsOriginalContent,
      acknowledgesAccuracyDisclaimer: data.acknowledgesAccuracyDisclaimer,
      acknowledgesOsmAttribution: data.acknowledgesOsmAttribution,
      agreedAt: new Date(),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    }).onConflictDoUpdate({
      target: ugcAgreements.userId,
      set: {
        agreedToContentLicense: data.agreedToContentLicense,
        agreedToDataDistribution: data.agreedToDataDistribution,
        confirmsOriginalContent: data.confirmsOriginalContent,
        acknowledgesAccuracyDisclaimer: data.acknowledgesAccuracyDisclaimer,
        acknowledgesOsmAttribution: data.acknowledgesOsmAttribution,
        agreedAt: new Date(),
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
    });

    res.json({ ok: true });
  });

  // POST /api/user/prerequisites — submit upload prerequisites
  app.post("/api/user/prerequisites", requireAuth, async (req: Request, res: Response) => {
    req.body = { ...req.body, userId: req.user!.id };
    const parsed = submitPrerequisitesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
    }
    const data = parsed.data;
    const met = allPrerequisitesMet(data);

    await db.delete(uploadPrerequisites).where(eq(uploadPrerequisites.userId, data.userId));
    await db.insert(uploadPrerequisites).values({ ...data, prerequisitesMet: met });

    res.json({
      ok: true,
      prerequisitesMet: met,
      message: met
        ? "All prerequisites met. You can now submit trails."
        : "Some prerequisites are not met. Complete them to unlock trail uploading.",
    });
  });

  // POST /api/trails/upload — submit a community trail
  // Requires: authenticated session + UGC agreement + prerequisites met.
  // The owner is always the signed-in user — never trust a userId from the body.
  app.post("/api/trails/upload", requireAuth, async (req: Request, res: Response) => {
    req.body = { ...req.body, userId: req.user!.id };
    const parsed = uploadTrailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
    }
    const { userId, waypoints, coordinates, ...trailFields } = parsed.data;

    // Check UGC agreement
    const [ugc] = await db.select().from(ugcAgreements).where(eq(ugcAgreements.userId, userId)).limit(1);
    if (!ugc || !ugc.agreedToContentLicense) {
      return res.status(403).json({ error: "UGC agreement not accepted. Complete sign-up first." });
    }

    // Check prerequisites
    const [prereqs] = await db
      .select()
      .from(uploadPrerequisites)
      .where(eq(uploadPrerequisites.userId, userId))
      .limit(1);
    if (!prereqs?.prerequisitesMet) {
      return res.status(403).json({ error: "Upload prerequisites not met." });
    }

    const trailId = await insertTrailFull({
      trail: {
        externalId: null,
        source: "community",
        status: "pending", // Goes through review before 'published'
        uploaderUserId: userId,
        osmAttribution: false,
        tags: {},
        ...trailFields,
        regionLat: coordinates[Math.floor(coordinates.length / 2)]?.latitude ?? null,
        regionLng: coordinates[Math.floor(coordinates.length / 2)]?.longitude ?? null,
        regionLatDelta: 0.05,
        regionLngDelta: 0.05,
      },
      approachCoordinates: [],
      trailCoordinates: coordinates,
      waypoints: waypoints.map((w) => ({ ...w, description: w.description ?? "" })),
    });

    res.json({ ok: true, trailId, status: "pending", message: "Trail submitted for review." });
  });

  // GET /api/user/:userId/trails — list user's submitted trails
  app.get("/api/user/:userId/trails", async (req: Request, res: Response) => {
    const { userId } = req.params;
    const userTrails = await db
      .select()
      .from(trails)
      .where(eq(trails.uploaderUserId, String(userId)));

    res.json({ trails: userTrails });
  });
}
