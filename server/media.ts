import express, { type Express, type Request, type Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { randomBytes } from "crypto";
import { requireAuth } from "./auth";

// Durable media store. Photos and voice notes captured on-device are uploaded
// here (as base64) so they survive reinstalling the app and are viewable on
// other devices. Files live under MEDIA_DIR and are served read-only at /uploads.
const MEDIA_DIR = path.resolve(process.cwd(), "media_uploads");

function ensureDir() {
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

const EXT_BY_TYPE: Record<string, string> = {
  photo: "jpg",
  video: "mp4",
  audio: "m4a",
};

function absoluteBase(req: Request): string {
  const proto = req.header("x-forwarded-proto") || req.protocol || "https";
  const host = req.header("x-forwarded-host") || req.get("host");
  return `${proto}://${host}`;
}

export function registerMediaRoutes(app: Express): void {
  ensureDir();

  // Serve uploaded media files.
  app.use(
    "/uploads",
    express.static(MEDIA_DIR, {
      maxAge: "30d",
      immutable: true,
    }),
  );

  // POST /api/media/upload — accepts { data: base64, mediaType } and returns a
  // durable, absolute URL the client can persist on a track.
  app.post("/api/media/upload", requireAuth, async (req: Request, res: Response) => {
    try {
      const { data, mediaType } = req.body ?? {};
      if (typeof data !== "string" || data.length === 0) {
        return res.status(400).json({ error: "Missing base64 data" });
      }
      const type = typeof mediaType === "string" && EXT_BY_TYPE[mediaType] ? mediaType : "photo";

      // Strip an optional data-URI prefix.
      const base64 = data.includes(",") ? data.slice(data.indexOf(",") + 1) : data;
      const buf = Buffer.from(base64, "base64");
      if (buf.length === 0) return res.status(400).json({ error: "Invalid base64 data" });
      if (buf.length > 25 * 1024 * 1024) {
        return res.status(413).json({ error: "File too large (max 25MB)" });
      }

      ensureDir();
      const filename = `${Date.now()}-${randomBytes(8).toString("hex")}.${EXT_BY_TYPE[type]}`;
      await fs.promises.writeFile(path.join(MEDIA_DIR, filename), buf);

      const url = `${absoluteBase(req)}/uploads/${filename}`;
      res.json({ ok: true, url });
    } catch (err) {
      console.error("[media] upload error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  });
}
