/**
 * SPIKE — PMTiles tile serving + UAE test region file generation.
 * Throwaway code. Remove after spike report is written.
 *
 * Routes:
 *   GET  /api/spike/status            — source info + readiness check
 *   GET  /api/spike/tiles/:z/:x/:y.pbf — serve individual tiles (range-reads CDN)
 *   GET  /api/spike/tilejson.json     — TileJSON for MapLibre source
 *   GET  /api/spike/uae-region.pmtiles — generate + return a small UAE PMTiles file
 *                                        for device-local offline spike testing
 */
import type { Express } from "express";
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { PMTiles, zxyToTileId } from "pmtiles";

// ─── Config ───────────────────────────────────────────────────────────────────

const PMTILES_URL =
  "https://data.source.coop/protomaps/openstreetmap/tiles/v3.pmtiles";

const SPIKE_DIR = path.join(process.cwd(), ".spike-data");
const UAE_REGION_FILE = path.join(SPIKE_DIR, "uae-region.pmtiles");

// UAE bounding box with a small buffer
const UAE = { minLon: 51.5, maxLon: 56.5, minLat: 22.5, maxLat: 26.3 };

// Initialised on first use
let pm: PMTiles | null = null;

function getPM(): PMTiles {
  if (!pm) pm = new PMTiles(PMTILES_URL);
  return pm;
}

// ─── PMTiles v3 writer ────────────────────────────────────────────────────────
// Minimal implementation of the PMTiles v3 binary spec for spike test file
// generation. Not production-quality — lacks leaf-directory splitting, clustered
// run-length optimisation, and error recovery. Spike use only.
//
// Spec: https://github.com/protomaps/PMTiles/blob/spec-v3/spec/v3/spec.md

function writeVarint(buf: number[], value: number): void {
  while (value > 0x7f) {
    buf.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  buf.push(value & 0x7f);
}

function tileBoundsAtZoom(z: number): {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
} {
  const n = 1 << z;
  const xMin = Math.max(0, Math.floor(((UAE.minLon + 180) / 360) * n));
  const xMax = Math.min(n - 1, Math.floor(((UAE.maxLon + 180) / 360) * n));
  const toY = (lat: number) =>
    Math.floor(
      ((1 -
        Math.log(
          Math.tan((lat * Math.PI) / 180) +
            1 / Math.cos((lat * Math.PI) / 180),
        ) /
          Math.PI) /
        2) *
        n,
    );
  const yMin = Math.max(0, toY(UAE.maxLat)); // north → smaller y
  const yMax = Math.min(n - 1, toY(UAE.minLat)); // south → larger y
  return { xMin, xMax, yMin, yMax };
}

async function buildUAEPMTiles(): Promise<Buffer> {
  const p = getPM();

  // 1. Collect tiles for z0-z8
  const collected: Array<{ tileId: number; data: Buffer }> = [];
  for (let z = 0; z <= 8; z++) {
    const { xMin, xMax, yMin, yMax } = tileBoundsAtZoom(z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        try {
          const tile = await p.getZxy(z, x, y);
          if (tile && tile.data.byteLength > 0) {
            collected.push({
              tileId: zxyToTileId(z, x, y),
              data: Buffer.from(tile.data),
            });
          }
        } catch (_) {
          /* skip failed tiles */
        }
      }
    }
  }

  // 2. Sort by tile_id (required by PMTiles spec for clustered archives)
  collected.sort((a, b) => a.tileId - b.tileId);

  // 3. Build tile data section + directory entries
  const tileDataChunks: Buffer[] = [];
  let tileDataLength = 0;

  interface Entry {
    tileId: number;
    offset: number;
    length: number;
  }
  const entries: Entry[] = [];

  for (const t of collected) {
    entries.push({ tileId: t.tileId, offset: tileDataLength, length: t.data.length });
    tileDataChunks.push(t.data);
    tileDataLength += t.data.length;
  }

  // 4. Encode root directory (varint, clustered delta-encoding)
  const dirBytes: number[] = [];
  let lastId = 0;
  let lastEndOffset = 0;

  for (const e of entries) {
    writeVarint(dirBytes, e.tileId - lastId); // Δ tile_id
    lastId = e.tileId;
    writeVarint(dirBytes, 1);               // run_length = 1 (one tile per entry)
    writeVarint(dirBytes, e.length);
    writeVarint(dirBytes, e.offset - lastEndOffset); // Δ from end of previous tile
    lastEndOffset = e.offset + e.length;
  }

  // 5. Gzip the directory + metadata (internal_compression = 1)
  const rootDirRaw = Buffer.from(dirBytes);
  const rootDir = zlib.gzipSync(rootDirRaw);

  const metaJson = JSON.stringify({
    name: "UAE Spike Test",
    description: "Spike test — UAE region z0-z8, generated from Protomaps OSM v3",
    minzoom: 0,
    maxzoom: 8,
    bounds: [UAE.minLon, UAE.minLat, UAE.maxLon, UAE.maxLat],
  });
  const metadata = zlib.gzipSync(Buffer.from(metaJson, "utf-8"));

  // 6. Calculate section offsets
  const rootDirOffset = 127;
  const metadataOffset = rootDirOffset + rootDir.length;
  const leafDirsOffset = metadataOffset + metadata.length;
  const tileDataOffset = leafDirsOffset; // no leaf dirs for this small archive

  // 7. Write 127-byte header
  const header = Buffer.alloc(127);
  header.write("PMTiles", 0, "ascii");
  header[7] = 3;                                              // version
  header.writeBigUInt64LE(BigInt(rootDirOffset), 8);         // root_dir_offset
  header.writeBigUInt64LE(BigInt(rootDir.length), 16);       // root_dir_length
  header.writeBigUInt64LE(BigInt(metadataOffset), 24);       // metadata_offset
  header.writeBigUInt64LE(BigInt(metadata.length), 32);      // metadata_length
  header.writeBigUInt64LE(BigInt(leafDirsOffset), 40);       // leaf_dirs_offset
  header.writeBigUInt64LE(0n, 48);                           // leaf_dirs_length = 0
  header.writeBigUInt64LE(BigInt(tileDataOffset), 56);       // tile_data_offset
  header.writeBigUInt64LE(BigInt(tileDataLength), 64);       // tile_data_length
  header.writeBigUInt64LE(BigInt(entries.length), 72);       // n_addressed_tiles
  header.writeBigUInt64LE(BigInt(entries.length), 80);       // n_tile_entries
  header.writeBigUInt64LE(BigInt(entries.length), 88);       // n_tile_contents
  header[96] = 1;                                            // clustered = true
  header[97] = 1;                                            // internal_compression = gzip
  header[98] = 1;                                            // tile_compression = gzip
  header[99] = 1;                                            // tile_type = MVT
  header[100] = 0;                                           // min_zoom
  header[101] = 8;                                           // max_zoom
  header.writeInt32LE(Math.round(UAE.minLon * 1e7), 102);    // min_lon_e7
  header.writeInt32LE(Math.round(UAE.minLat * 1e7), 106);    // min_lat_e7
  header.writeInt32LE(Math.round(UAE.maxLon * 1e7), 110);    // max_lon_e7
  header.writeInt32LE(Math.round(UAE.maxLat * 1e7), 114);    // max_lat_e7
  header[118] = 6;                                           // center_zoom
  header.writeInt32LE(Math.round(54.0 * 1e7), 119);          // center_lon
  header.writeInt32LE(Math.round(24.4 * 1e7), 123);          // center_lat

  // 8. Concatenate and return
  return Buffer.concat([header, rootDir, metadata, ...tileDataChunks]);
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerSpikePmtilesRoutes(app: Express) {
  // Ensure .spike-data directory exists
  fs.mkdirSync(SPIKE_DIR, { recursive: true });

  // ── Status ──────────────────────────────────────────────────────────────────
  app.get("/api/spike/status", async (_req, res) => {
    try {
      const h = await getPM().getHeader();
      const uaeExists = fs.existsSync(UAE_REGION_FILE);
      const uaeSize = uaeExists
        ? (fs.statSync(UAE_REGION_FILE).size / 1024).toFixed(1) + " KB"
        : null;
      res.json({
        ready: true,
        source: PMTILES_URL,
        mode: "range-request (no full download)",
        minZoom: h.minZoom,
        maxZoom: h.maxZoom,
        uaeRegionFile: uaeExists ? "exists" : "not generated",
        uaeRegionSize: uaeSize,
      });
    } catch (err: unknown) {
      res.status(503).json({ ready: false, error: String(err) });
    }
  });

  // ── Individual tiles ─────────────────────────────────────────────────────────
  app.get("/api/spike/tiles/:z/:x/:yext", async (req, res) => {
    const z = Number(req.params.z);
    const x = Number(req.params.x);
    const y = Number((req.params.yext ?? "").split(".")[0]);
    if (isNaN(z) || isNaN(x) || isNaN(y)) {
      return res.status(400).json({ error: "Invalid z/x/y" });
    }
    try {
      const tile = await getPM().getZxy(z, x, y);
      if (!tile) {
        return res
          .status(204)
          .setHeader("Access-Control-Allow-Origin", "*")
          .end();
      }
      res
        .setHeader("Content-Type", "application/x-protobuf")
        .setHeader("Content-Encoding", "gzip")
        .setHeader("Access-Control-Allow-Origin", "*")
        .setHeader("Cache-Control", "public, max-age=86400")
        .end(Buffer.from(tile.data));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── TileJSON ─────────────────────────────────────────────────────────────────
  app.get("/api/spike/tilejson.json", async (req, res) => {
    const proto = req.header("x-forwarded-proto") ?? req.protocol ?? "https";
    const host = req.header("x-forwarded-host") ?? req.get("host") ?? "localhost:5000";
    const base = `${proto}://${host}`;
    let minzoom = 0, maxzoom = 15;
    try {
      const h = await getPM().getHeader();
      minzoom = h.minZoom;
      maxzoom = h.maxZoom;
    } catch (_) {}
    res.setHeader("Access-Control-Allow-Origin", "*").json({
      tilejson: "2.2.0",
      name: "PMTiles Spike — Protomaps OSM v3",
      scheme: "xyz",
      tiles: [`${base}/api/spike/tiles/{z}/{x}/{y}.pbf`],
      minzoom,
      maxzoom,
      bounds: [-180, -85, 180, 85],
    });
  });

  // ── UAE region file (approach B local spike) ─────────────────────────────────
  // Fetches UAE tiles at z0-z8 from the planet PMTiles via range requests,
  // assembles a PMTiles v3 archive, caches to disk, and returns it.
  // First request takes ~15–30 seconds; subsequent requests return the cached file.
  app.get("/api/spike/uae-region.pmtiles", async (_req, res) => {
    // Serve from cache if already generated
    if (fs.existsSync(UAE_REGION_FILE)) {
      const size = fs.statSync(UAE_REGION_FILE).size;
      res
        .setHeader("Content-Type", "application/octet-stream")
        .setHeader("Content-Length", size)
        .setHeader("Access-Control-Allow-Origin", "*")
        .setHeader("Cache-Control", "public, max-age=3600");
      return fs.createReadStream(UAE_REGION_FILE).pipe(res);
    }

    console.log("[spike] Generating UAE region PMTiles (z0-z8) — first request only…");
    const start = Date.now();

    try {
      const buf = await buildUAEPMTiles();
      fs.writeFileSync(UAE_REGION_FILE, buf);

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(
        `[spike] UAE region generated: ${(buf.length / 1024).toFixed(0)} KB in ${elapsed}s`,
      );

      res
        .setHeader("Content-Type", "application/octet-stream")
        .setHeader("Content-Length", buf.length)
        .setHeader("Access-Control-Allow-Origin", "*")
        .end(buf);
    } catch (err) {
      console.error("[spike] UAE region generation failed:", err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Delete cached UAE region (for re-generation) ────────────────────────────
  app.delete("/api/spike/uae-region.pmtiles", (_req, res) => {
    if (fs.existsSync(UAE_REGION_FILE)) {
      fs.unlinkSync(UAE_REGION_FILE);
      res.json({ ok: true, message: "Deleted cached UAE region file" });
    } else {
      res.json({ ok: true, message: "No cached file to delete" });
    }
  });

  console.log("[spike] PMTiles routes registered at /api/spike/*");
  console.log(`[spike] Source: ${PMTILES_URL} (range-request mode)`);
}
