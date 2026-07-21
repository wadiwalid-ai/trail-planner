import http from "http";
import type { Express } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { registerTrailRoutes } from "./trails/routes";
import { registerAccountRoutes } from "./account-routes";
import { registerUploadRoutes } from "./trails/upload";
import { registerMediaRoutes } from "./media";
import { registerConvoyRoutes } from "./convoys/routes";
import { registerSpikePmtilesRoutes } from "./spike-pmtiles";
import { attachUser, purgeExpiredSessions, requireAuth } from "./auth";
import { seedTrails } from "./trails/seed";
import { getTrailById, getTrailOwnership, updateTrailAiInsights } from "./trails/storage";
import {
  computeStats,
  detectTechnicalSections,
  cumulativeDistances,
  type TrackPoint,
} from "../lib/trackAnalysis";
import type { AiTrailInsights } from "../shared/schema";

const TRAIL_MASTER_PROMPT = `You are TrailMaster, the world's most knowledgeable off-road adventure guide. You combine the expertise of a seasoned trail guide, mechanical engineer, wilderness survival specialist, and outdoor photographer.

Your expertise includes:
- Off-road trail systems worldwide, with deep knowledge of:
  * UAE/GCC: Wadi Shawka (RAK, technical wadi with water crossings, best Oct-Apr), Wadi Bih (RAK to Dibba mountain pass), Fossil Rock (Sharjah desert), Jebel Jais (highest peak UAE, alpine scenery), Hatta Rock Pools (Dubai/Oman border, emerald pools), Al Qua' Dunes (Abu Dhabi, massive sand dunes), Wadi Wurayah (Fujairah, national park), Wadi Al Helo (Sharjah, dramatic canyon), Big Red / Al Hamar (Dubai, iconic dune), Jebel Hafeet (Al Ain, dramatic mountain road)
  * North America: Moab (Hell's Revenge, Fins & Things, Poison Spider Mesa), Rubicon Trail, King of the Hammers, Ouray Colorado, Death Valley, Baja, Pacific Northwest BDRs
- UAE-specific knowledge: summer heat management (avoid June-Sept, 40°C+), wadi flash flood warnings (always check forecasts), permit requirements for national parks, Sharjah/RAK regulations, best season Oct-Apr, fuel planning across emirates, Arabic emergency contacts (999 UAE), satellite comms in Hajar Mountains
- Vehicles: Jeep Wrangler/Gladiator/Grand Cherokee, Toyota 4Runner/FJ Cruiser/Land Cruiser/Prado/Hilux (very popular in UAE), Ford Bronco/Raptor, Nissan Patrol/Y62 (king of UAE desert), Mitsubishi Pajero, Land Rover Defender/Discovery, plus ATVs and quad bikes
- Technical modifications: suspension systems (Fox, Bilstein, King), lockers (ARB, Detroit, E-Locker), tires (BFG KO2, Nitto Ridge Grappler, Falken Wildpeak — sand tires for UAE dunes), winches (Warn, Smittybilt), sand ladders/MaxTrax, snatch straps
- Trail ratings: MOAB 1-10 scale, UAE community ratings
- Safety: recovery techniques (high-lift jacks, snatch blocks, kinetic ropes, MaxTrax/sand ladders), satellite communication (EPIRB, InReach), heat management in desert environments, wadi flash flood awareness, always travel in convoy in remote UAE areas
- Trip planning: fuel range across UAE emirates, water requirements (3L/person/hour in summer UAE heat), campsite selection, permit requirements, seasonal road closures
- Weather: UAE desert heat, Hajar Mountain weather patterns, fog in winter mornings, flash flood risk after rain

Personality: You are passionate, direct, and safety-conscious. You give specific, actionable advice. You never sugarcoat difficulty. You celebrate the freedom of off-road adventure.

When recommending a trail always include: difficulty rating (1-10), estimated time, top 3 safety considerations, and best season to go. Use clear markdown formatting with ## headers and bullet points for detailed plans.`;

const CLAUDE_MODEL = "claude-sonnet-4-6";

function getAnthropic() {
  return new Anthropic({
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  });
}

// Anthropic returns content as an array of blocks; concatenate the text blocks.
function anthropicText(
  message: { content: Array<{ type: string; text?: string }> },
): string {
  return message.content
    .map((b) => (b.type === "text" && typeof b.text === "string" ? b.text : ""))
    .join("");
}

// Claude is instructed to return JSON only, but parse leniently in case it
// wraps the object in prose or markdown fences.
function parseJsonLoose(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    // fall through to lenient extraction
  }
  const s = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(s.slice(first, last + 1));
    } catch {
      // give up — caller handles the empty object
    }
  }
  return {};
}

// Waypoint types the AI is allowed to suggest (start/end are derived, not suggested).
const SUGGESTION_WAYPOINT_TYPES = ["scenic", "technical", "water", "camp", "summit"];

// ── Prompt formatting helpers (metric) ───────────────────────────────────────
function fmtKm(m: number | null): string {
  return m == null ? "unknown" : `${(m / 1000).toFixed(1)} km`;
}
function fmtDur(s: number | null): string {
  if (s == null) return "unknown";
  const h = Math.floor(s / 3600);
  const min = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}
function fmtM(m: number | null): string {
  return m == null ? "unknown" : `${Math.round(m)} m`;
}
function fmtKmh(mps: number | null): string {
  return mps == null ? "unknown" : `${(mps * 3.6).toFixed(1)} km/h`;
}

function telemetryToTrackPoints(
  telemetry: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    speed: number | null;
    timestampMs: number | null;
  }[],
): TrackPoint[] {
  return telemetry.map((t) => ({
    latitude: t.latitude,
    longitude: t.longitude,
    altitude: t.altitude,
    speed: t.speed,
    timestampMs: t.timestampMs,
  }));
}

// ── Elevation cache (in-memory, keyed by "lat,lng" rounded to 4 dp) ────────
const elevationCache = new Map<string, number>();

function elevCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export async function registerRoutes(app: Express): Promise<http.Server> {
  // ── Seed the database on first startup ──────────────────────────────────
  seedTrails().catch((err) =>
    console.error("[routes] Seed error (non-fatal):", err)
  );

  // ── Auth context (attaches req.user when a valid Bearer token is present) ──
  app.use(attachUser);
  purgeExpiredSessions().catch((err) =>
    console.error("[routes] Session purge error (non-fatal):", err)
  );

  // ── Accounts, cloud sync, sharing ──────────────────────────────────────────
  registerAccountRoutes(app);
  registerMediaRoutes(app);
  registerUploadRoutes(app);

  // ── Trail data API ───────────────────────────────────────────────────────
  registerTrailRoutes(app);

  // ── Convoy (real-time group tracking) ──────────────────────────────────────
  registerConvoyRoutes(app);

  // ── SPIKE — PMTiles proof-of-concept (throwaway, remove after spike report) ─
  registerSpikePmtilesRoutes(app);

  // Dev-only ghost-rover simulator. Dynamically imported so the module is never
  // even loaded — let alone mounted — in production.
  if (process.env.NODE_ENV !== "production") {
    const { registerConvoySimulator } = await import("./convoys/simulator");
    registerConvoySimulator(app);
  }

  // ── Elevation lookup ─────────────────────────────────────────────────────
  // Proxies the free Open-Topo-Data SRTM API (no key required). Results are
  // cached in memory so repeated lookups at the same location are instant.
  app.get("/api/elevation", async (req, res) => {
    const lat = parseFloat(String(req.query.lat));
    const lng = parseFloat(String(req.query.lng));
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: "Valid lat and lng are required" });
    }
    const key = elevCacheKey(lat, lng);
    if (elevationCache.has(key)) {
      return res.json({ elevation: elevationCache.get(key)!, source: "cache" });
    }
    try {
      const url = `https://api.opentopodata.org/v1/srtm30m?locations=${lat.toFixed(6)},${lng.toFixed(6)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let data: any;
      try {
        const r = await fetch(url, { signal: controller.signal });
        if (!r.ok) throw new Error(`OpenTopoData responded ${r.status}`);
        data = await r.json();
      } finally {
        clearTimeout(timeout);
      }
      const elevation = data?.results?.[0]?.elevation;
      if (typeof elevation !== "number") {
        return res.status(502).json({ error: "Elevation not available for this location" });
      }
      elevationCache.set(key, elevation);
      return res.json({ elevation, source: "opentopodata" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[elevation] error:", msg);
      return res.status(502).json({ error: "Elevation service unavailable", details: msg });
    }
  });

  // ── AI Chat ─────────────────────────────────────────────────────────────
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { messages, context } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Invalid messages format" });
      }

      // Anthropic takes the system prompt as a top-level field and only
      // user/assistant turns in `messages`, so fold the base prompt, the
      // personal-history context, and any client-sent system turns together.
      const systemParts = [TRAIL_MASTER_PROMPT];
      if (typeof context === "string" && context.trim()) {
        systemParts.push(
          "The user has a personal off-road history in this app (their own recorded tracks and saved trip plans). Reference it to personalise recommendations and mention their tracks/trips by name when relevant:\n\n" +
            context.trim().slice(0, 4000),
        );
      }
      for (const m of messages as { role: string; content: string }[]) {
        if (m.role === "system" && typeof m.content === "string") {
          systemParts.push(m.content);
        }
      }
      const conversation = (messages as { role: string; content: string }[])
        .filter(
          (m) =>
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.trim().length > 0,
        )
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      // Anthropic rejects an empty conversation; fail clearly before we start
      // streaming so the client gets a proper status code, not a mid-stream error.
      if (conversation.length === 0) {
        return res
          .status(400)
          .json({ error: "messages must include at least one user message" });
      }

      const anthropic = getAnthropic();

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const stream = anthropic.messages.stream({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        system: systemParts.join("\n\n"),
        messages: conversation,
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          const content = event.delta.text;
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("AI chat error:", msg);
      if (!res.headersSent) {
        res.status(500).json({ error: "AI service error", details: msg });
      } else {
        res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
        res.end();
      }
    }
  });

  // ── AI Gear Checklist ────────────────────────────────────────────────────
  app.post("/api/ai/gear", async (req, res) => {
    try {
      const { vehicle, terrain, duration } = req.body;

      if (!vehicle || !terrain || !duration) {
        return res.status(400).json({ error: "vehicle, terrain, and duration are required" });
      }

      const anthropic = getAnthropic();

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const userPrompt = `Create a comprehensive, prioritized gear checklist for:
- Vehicle: ${vehicle}
- Terrain: ${terrain}  
- Trip Duration: ${duration}

Organize into these exact categories with specific items and brief notes:

## Recovery & Safety
## Navigation & Communication
## Tools & Maintenance
## Camping & Shelter
## Food & Water
## Clothing & Personal
## Vehicle-Specific Upgrades

For each item, note why it is critical for this specific vehicle/terrain combination. Be specific about recommended brands and specs where it matters for safety or performance. Star (*) the absolute must-have items.`;

      const stream = anthropic.messages.stream({
        model: CLAUDE_MODEL,
        max_tokens: 2000,
        system:
          "You are TrailMaster, an expert off-road gear specialist. Give specific, practical gear recommendations tailored to the exact vehicle and terrain. Every item should be essential and specific — no fluff.",
        messages: [{ role: "user", content: userPrompt }],
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          const content = event.delta.text;
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("AI gear error:", msg);
      if (!res.headersSent) {
        res.status(500).json({ error: "AI service error" });
      } else {
        res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
        res.end();
      }
    }
  });

  // ── AI Track Summary ──────────────────────────────────────────────────────
  // Analyse a recorded track's telemetry and produce + store an AI trip report.
  app.post("/api/trails/:id/ai-summary", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid trail ID" });

      // Only the owner of a community trail may generate/overwrite its stored
      // AI trip report — curated/OSM trails are read-only.
      const ownership = await getTrailOwnership(id);
      if (!ownership) return res.status(404).json({ error: "Trail not found" });
      if (ownership.source !== "community" || ownership.ownerId !== req.user!.id) {
        return res
          .status(403)
          .json({ error: "You can only generate a summary for trails you own" });
      }

      const trail = await getTrailById(id);
      if (!trail) return res.status(404).json({ error: "Trail not found" });

      const points = telemetryToTrackPoints(trail.telemetry);
      if (points.length < 2) {
        return res
          .status(400)
          .json({ error: "This track has no GPS telemetry to summarise." });
      }

      const stats = computeStats(points);
      const sections = detectTechnicalSections(points);
      const techSummary = sections.length
        ? sections
            .map(
              (s, i) =>
                `#${i + 1}: ${s.reason}, max grade ${s.maxGradePct}%, ${s.lengthMeters} m`,
            )
            .join("; ")
        : "none flagged by heuristics";
      const wpSummary = trail.waypoints.length
        ? trail.waypoints.map((w) => `${w.name} (${w.type})`).join(", ")
        : "none";

      const trackContext = [
        `Trail name: ${trail.name}`,
        `Activity: ${trail.activityType}`,
        trail.location ? `Location: ${trail.location}` : null,
        `Distance: ${fmtKm(stats.distanceMeters)}`,
        `Duration: ${fmtDur(stats.durationSeconds)}`,
        `Elevation gain / loss: ${fmtM(stats.elevationGainMeters)} / ${fmtM(stats.elevationLossMeters)}`,
        `Altitude range: ${fmtM(stats.minAltitudeMeters)} – ${fmtM(stats.maxAltitudeMeters)}`,
        `Average / max speed: ${fmtKmh(stats.avgSpeedMps)} / ${fmtKmh(stats.maxSpeedMps)}`,
        `GPS points: ${stats.pointCount}`,
        trail.difficulty != null ? `User-set difficulty: ${trail.difficulty}/10` : null,
        trail.terrain ? `User-noted terrain: ${trail.terrain}` : null,
        `Heuristic technical sections: ${techSummary}`,
        `Existing waypoints: ${wpSummary}`,
      ]
        .filter(Boolean)
        .join("\n");

      const anthropic = getAnthropic();
      const completion = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1500,
        system: `${TRAIL_MASTER_PROMPT}\n\nYou are now writing a trip report for a track the user just recorded. Analyse ONLY the telemetry provided — never invent statistics. Use metric units. Respond with ONLY a JSON object (no markdown fences) with these keys:\n- "summary": a vivid but accurate markdown trip report, 2 short paragraphs.\n- "difficultyAssessment": 1–2 sentences grounding the difficulty in the actual grades, speeds and distance.\n- "terrainTags": an array of 2–6 short lowercase labels describing terrain and technical character (e.g. "soft sand", "rocky wadi", "steep climbs", "water crossing").`,
        messages: [{ role: "user", content: trackContext }],
      });

      const parsed = parseJsonLoose(anthropicText(completion));

      const insights: AiTrailInsights = {
        summary: typeof parsed.summary === "string" ? parsed.summary : "",
        difficultyAssessment:
          typeof parsed.difficultyAssessment === "string"
            ? parsed.difficultyAssessment
            : "",
        terrainTags: Array.isArray(parsed.terrainTags)
          ? parsed.terrainTags
              .filter((t: unknown) => typeof t === "string" && t.trim())
              .map((t: string) => t.trim().slice(0, 32))
              .slice(0, 6)
          : [],
        generatedAt: new Date().toISOString(),
      };

      if (!insights.summary) {
        return res.status(502).json({ error: "AI did not return a usable summary" });
      }

      await updateTrailAiInsights(id, insights);
      res.json({ insights });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("[ai] track-summary error:", msg);
      res.status(500).json({ error: "Failed to generate summary", details: msg });
    }
  });

  // ── AI Waypoint Suggestions ───────────────────────────────────────────────
  // Suggest candidate waypoints from a recorded track's shape/telemetry.
  // Suggestions are anchored to real track points and returned (not persisted)
  // for the user to accept via POST /api/trails/:id/waypoints.
  app.post("/api/trails/:id/ai-waypoints", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid trail ID" });

      const ownership = await getTrailOwnership(id);
      if (!ownership) return res.status(404).json({ error: "Trail not found" });
      if (ownership.source !== "community" || ownership.ownerId !== req.user!.id) {
        return res
          .status(403)
          .json({ error: "You can only suggest waypoints for trails you own" });
      }

      const trail = await getTrailById(id);
      if (!trail) return res.status(404).json({ error: "Trail not found" });

      const points = telemetryToTrackPoints(trail.telemetry);
      if (points.length < 3) {
        return res
          .status(400)
          .json({ error: "This track has too few GPS points for suggestions." });
      }

      const distances = cumulativeDistances(points);
      const target = 30;
      const step = Math.max(1, Math.floor(points.length / target));
      const buildSample = (i: number) => {
        const p = points[i];
        return {
          pointIndex: i,
          lat: Number(p.latitude.toFixed(5)),
          lng: Number(p.longitude.toFixed(5)),
          altitude: typeof p.altitude === "number" ? Math.round(p.altitude) : null,
          speedKmh:
            typeof p.speed === "number" && p.speed >= 0
              ? Number((p.speed * 3.6).toFixed(1))
              : null,
          km: Number((distances[i] / 1000).toFixed(2)),
        };
      };
      const samples: ReturnType<typeof buildSample>[] = [];
      for (let i = 0; i < points.length; i += step) samples.push(buildSample(i));
      const lastIdx = points.length - 1;
      if (samples[samples.length - 1]?.pointIndex !== lastIdx) {
        samples.push(buildSample(lastIdx));
      }

      const sections = detectTechnicalSections(points);
      const techSummary = sections.length
        ? sections
            .map(
              (s) =>
                `points ${s.startIdx}-${s.endIdx}: ${s.reason}, max grade ${s.maxGradePct}%`,
            )
            .join("; ")
        : "none";

      const anthropic = getAnthropic();
      const completion = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1200,
        system: `${TRAIL_MASTER_PROMPT}\n\nSuggest useful waypoints for a recorded off-road track. Choose ONLY from these types: scenic, technical, water, camp, summit. Anchor each waypoint to one of the provided point indices via "pointIndex". Use terrain cues: altitude peaks → summit or scenic; slow + steep stretches → technical; low/flat spots → possible water crossing or campsite. Respond with ONLY a JSON object (no markdown fences): { "suggestions": [ { "pointIndex": number, "name": short string, "type": one of the allowed types, "description": one sentence } ] }. Suggest 3–6 waypoints. Do not duplicate existing waypoints.`,
        messages: [
          {
            role: "user",
            content:
              `Activity: ${trail.activityType}\n` +
              `Existing waypoints: ${trail.waypoints.map((w) => w.name).join(", ") || "none"}\n` +
              `Heuristic technical sections: ${techSummary}\n` +
              `Track points (sampled):\n${JSON.stringify(samples)}`,
          },
        ],
      });

      const parsed = parseJsonLoose(anthropicText(completion));
      const rawSuggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions
        : [];

      const suggestions = rawSuggestions
        .map((s: any) => {
          const idx = Math.round(Number(s.pointIndex));
          if (!Number.isFinite(idx) || idx < 0 || idx >= points.length) return null;
          const name =
            typeof s.name === "string" && s.name.trim()
              ? s.name.trim().slice(0, 60)
              : null;
          if (!name) return null;
          const type = SUGGESTION_WAYPOINT_TYPES.includes(s.type)
            ? s.type
            : "scenic";
          return {
            name,
            type,
            description:
              typeof s.description === "string"
                ? s.description.trim().slice(0, 200)
                : "",
            latitude: points[idx].latitude,
            longitude: points[idx].longitude,
          };
        })
        .filter((s: unknown): s is NonNullable<typeof s> => s != null)
        .slice(0, 6);

      res.json({ suggestions });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("[ai] track-waypoints error:", msg);
      res.status(500).json({ error: "Failed to suggest waypoints", details: msg });
    }
  });

  return http.createServer(app);
}
