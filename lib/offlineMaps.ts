import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildMapStyle } from "@/constants/mapStyle";
import type { AdventureBaseLayer, MapRegion } from "@/components/adventureMapShared";

/* ──────────────────────────────────────────────────────────────────────────
 *  Offline region service.
 *  Thin wrapper over MapLibre's OfflineManager. The native module is only
 *  available in a custom build, so every entry point degrades gracefully when
 *  it is missing (Expo Go / web): OFFLINE_SUPPORTED is false and the screen
 *  shows an explanatory state instead of crashing. The native packs themselves
 *  are the source of truth — each pack carries its name/baseLayer/zoom range in
 *  its metadata, so no separate persistence is required.
 * ────────────────────────────────────────────────────────────────────────── */

/** True only where the MapLibre native module can run (custom dev/prod build). */
export const OFFLINE_SUPPORTED =
  Platform.OS !== "web" &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

export type OfflineRegionState = "inactive" | "active" | "complete" | "unknown";

export interface OfflineRegion {
  id: string;
  name: string;
  baseLayer: AdventureBaseLayer;
  bounds: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  createdAt: number;
  state: OfflineRegionState;
  percentage: number;
  sizeBytes: number;
  tileCount: number;
}

export type PackType = "area" | "corridor";
export type TerrainKind = "dune" | "mountain" | "mixed";

/** A predefined named region the user can download in one tap. */
export interface RegionPreset {
  id: string;
  name: string;
  description: string;
  packType: PackType;
  terrain: TerrainKind;
  /** [west, south, east, north] in decimal degrees */
  bounds: [number, number, number, number];
  /** Recommended max zoom for this pack type (area packs use lower zoom; corridors use higher). */
  recommendedMaxZoom: number;
  /** Rough size label shown before download (based on playbook estimates). */
  sizeLabel: string;
}

/**
 * Pre-defined UAE off-road regions.
 * Dune/sand areas → PackType "area" (full terrain polygon, wider bounds).
 * Mountain/wadi areas → PackType "corridor" (tighter bounds, higher zoom for trail detail).
 */
export const UAE_REGION_PRESETS: RegionPreset[] = [
  {
    id: "liwa-empty-quarter",
    name: "Liwa & Empty Quarter",
    description: "Liwa oasis, Moreeb Dune & Rub' al Khali dune sea",
    packType: "area",
    terrain: "dune",
    bounds: [53.2, 22.8, 55.0, 24.0],
    recommendedMaxZoom: 14,
    sizeLabel: "~120 MB",
  },
  {
    id: "hajar-mountains",
    name: "Hajar Mountains & Wadis",
    description: "Wadi Shawka, Hatta, Wadi Bih & mountain trails",
    packType: "corridor",
    terrain: "mountain",
    bounds: [55.7, 24.8, 56.5, 25.7],
    recommendedMaxZoom: 15,
    sizeLabel: "~80 MB",
  },
  {
    id: "al-qudra-dubai-desert",
    name: "Al Qudra & Dubai Desert",
    description: "Al Qudra dunes, Al Marmoom & desert camps",
    packType: "area",
    terrain: "dune",
    bounds: [55.1, 24.8, 55.5, 25.1],
    recommendedMaxZoom: 14,
    sizeLabel: "~45 MB",
  },
  {
    id: "jebel-hafeet-al-ain",
    name: "Jebel Hafeet & Al Ain",
    description: "Jebel Hafeet summit road & Al Ain desert trails",
    packType: "corridor",
    terrain: "mountain",
    bounds: [55.6, 23.9, 55.95, 24.25],
    recommendedMaxZoom: 15,
    sizeLabel: "~35 MB",
  },
  {
    id: "uae-overview",
    name: "UAE Overview",
    description: "Full UAE — all regions, lower detail",
    packType: "area",
    terrain: "mixed",
    bounds: [51.5, 22.5, 56.5, 26.2],
    recommendedMaxZoom: 12,
    sizeLabel: "~400 MB",
  },
];

/** Convert [west, south, east, north] bounds to a MapRegion centre + delta. */
export function boundsToRegion(bounds: [number, number, number, number]): MapRegion {
  const [west, south, east, north] = bounds;
  return {
    latitude: (south + north) / 2,
    longitude: (west + east) / 2,
    latitudeDelta: north - south,
    longitudeDelta: east - west,
  };
}

export interface DownloadRegionOptions {
  name: string;
  /** Pass either region (centre + delta) or bounds directly. */
  region?: MapRegion;
  bounds?: [number, number, number, number];
  baseLayer: AdventureBaseLayer;
  minZoom?: number;
  maxZoom?: number;
  night?: boolean;
  packType?: PackType;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let manager: any = null;
function getManager(): any {
  if (!OFFLINE_SUPPORTED) return null;
  if (!manager) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      manager = require("@maplibre/maplibre-react-native").OfflineManager;
    } catch {
      manager = null;
    }
  }
  return manager;
}

function regionToBounds(r: MapRegion): [number, number, number, number] {
  const dLat = Math.max(r.latitudeDelta, 0.0008) / 2;
  const dLng = Math.max(r.longitudeDelta, 0.0008) / 2;
  return [r.longitude - dLng, r.latitude - dLat, r.longitude + dLng, r.latitude + dLat];
}

/** Rough Web-Mercator tile count for a bbox across a zoom range. */
export function estimateTiles(
  bounds: [number, number, number, number],
  minZoom: number,
  maxZoom: number,
): number {
  const [w, s, e, n] = bounds;
  const lon2x = (lon: number, z: number) =>
    Math.floor(((lon + 180) / 360) * 2 ** z);
  const lat2y = (lat: number, z: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(
      ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z,
    );
  };
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const x0 = lon2x(w, z);
    const x1 = lon2x(e, z);
    const y0 = lat2y(n, z); // north → smaller y
    const y1 = lat2y(s, z);
    total += (Math.abs(x1 - x0) + 1) * (Math.abs(y1 - y0) + 1);
  }
  return total;
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Per-tile size calibration.
 *  We start from a rough 28 KB/tile guess, then learn the real average from
 *  completed packs (sizeBytes / tileCount) and persist it. This keeps the size
 *  estimate — and therefore the storage warnings below — honest over time.
 * ────────────────────────────────────────────────────────────────────────── */

const CALIBRATION_KEY = "offline.tileCalibration.v1";
const DEFAULT_BYTES_PER_TILE = 28 * 1024;
/** Clamp band so one weird pack can't poison the running estimate. */
const MIN_BYTES_PER_TILE = 4 * 1024;
const MAX_BYTES_PER_TILE = 256 * 1024;
/** Cap the running-average weight so calibration keeps adapting to recent packs. */
const MAX_SAMPLE_WEIGHT = 12;

interface Calibration {
  bytesPerTile: number;
  samples: number;
  sampledIds: string[];
}

let calibration: Calibration = {
  bytesPerTile: DEFAULT_BYTES_PER_TILE,
  samples: 0,
  sampledIds: [],
};
let calibrationLoaded = false;

function clampPerTile(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_BYTES_PER_TILE;
  return Math.min(MAX_BYTES_PER_TILE, Math.max(MIN_BYTES_PER_TILE, v));
}

/** Load the persisted calibration once. Safe to call repeatedly. */
export async function loadCalibration(): Promise<number> {
  if (calibrationLoaded) return calibration.bytesPerTile;
  try {
    const raw = await AsyncStorage.getItem(CALIBRATION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Calibration>;
      calibration = {
        bytesPerTile: clampPerTile(parsed.bytesPerTile ?? DEFAULT_BYTES_PER_TILE),
        samples: typeof parsed.samples === "number" ? parsed.samples : 0,
        sampledIds: Array.isArray(parsed.sampledIds) ? parsed.sampledIds.slice(-50) : [],
      };
    }
  } catch {
    /* keep defaults */
  }
  calibrationLoaded = true;
  return calibration.bytesPerTile;
}

/** Current learned per-tile size (synchronous; call loadCalibration first). */
export function getBytesPerTile(): number {
  return calibration.bytesPerTile;
}

async function persistCalibration(): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CALIBRATION_KEY,
      JSON.stringify({
        bytesPerTile: calibration.bytesPerTile,
        samples: calibration.samples,
        sampledIds: calibration.sampledIds.slice(-50),
      }),
    );
  } catch {
    /* non-fatal */
  }
}

/**
 * Fold any newly-completed packs into the running per-tile average. Each pack is
 * only counted once (tracked by id). Returns the (possibly updated) per-tile size.
 */
export async function calibrateFromRegions(regions: OfflineRegion[]): Promise<number> {
  await loadCalibration();
  const seen = new Set(calibration.sampledIds);
  let changed = false;
  for (const r of regions) {
    if (r.state !== "complete") continue;
    if (r.tileCount <= 0 || r.sizeBytes <= 0) continue;
    if (seen.has(r.id)) continue;
    const sample = clampPerTile(r.sizeBytes / r.tileCount);
    const weight = Math.min(calibration.samples, MAX_SAMPLE_WEIGHT);
    calibration.bytesPerTile = clampPerTile(
      (calibration.bytesPerTile * weight + sample) / (weight + 1),
    );
    calibration.samples += 1;
    seen.add(r.id);
    calibration.sampledIds.push(r.id);
    changed = true;
  }
  if (changed) {
    calibration.sampledIds = calibration.sampledIds.slice(-50);
    await persistCalibration();
  }
  return calibration.bytesPerTile;
}

/** Size estimate using the learned per-tile average (28 KB/tile until calibrated). */
export function estimateSizeBytes(
  tiles: number,
  bytesPerTile: number = getBytesPerTile(),
): number {
  return tiles * bytesPerTile;
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Download ceilings.
 *  A download past WARN should prompt a confirmation; past MAX it is refused so
 *  a user can't silently fill their device. Whichever limit (tiles or bytes) is
 *  hit first decides the level, since calibration shifts the byte estimate.
 * ────────────────────────────────────────────────────────────────────────── */

export const OFFLINE_WARN_BYTES = 350 * 1024 * 1024; // ~350 MB
export const OFFLINE_MAX_BYTES = 1200 * 1024 * 1024; // ~1.2 GB
export const OFFLINE_WARN_TILES = 12_000;
export const OFFLINE_MAX_TILES = 45_000;

export type DownloadLevel = "ok" | "warn" | "block";

export function assessDownload(tiles: number, bytes: number): DownloadLevel {
  if (tiles >= OFFLINE_MAX_TILES || bytes >= OFFLINE_MAX_BYTES) return "block";
  if (tiles >= OFFLINE_WARN_TILES || bytes >= OFFLINE_WARN_BYTES) return "warn";
  return "ok";
}

export async function listRegions(): Promise<OfflineRegion[]> {
  const mgr = getManager();
  if (!mgr) return [];
  try {
    const packs: any[] = await mgr.getPacks();
    const regions = await Promise.all(
      packs.map(async (p) => {
        let status: any = null;
        try {
          status = await p.status();
        } catch {
          status = null;
        }
        const meta = p.metadata ?? {};
        return {
          id: p.id ?? meta.name ?? String(meta.createdAt ?? Math.random()),
          name: meta.name ?? "Saved region",
          baseLayer: (meta.baseLayer ?? "satellite") as AdventureBaseLayer,
          bounds: p.bounds as [number, number, number, number],
          minZoom: meta.minZoom ?? 10,
          maxZoom: meta.maxZoom ?? 14,
          createdAt: meta.createdAt ?? 0,
          state: (status?.state ?? "unknown") as OfflineRegionState,
          percentage: status?.percentage ?? 0,
          sizeBytes: status?.completedResourceSize ?? 0,
          tileCount: status?.completedTileCount ?? 0,
        } as OfflineRegion;
      }),
    );
    return regions.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function downloadRegion(
  opts: DownloadRegionOptions,
  onProgress?: (percentage: number) => void,
  onError?: (message: string) => void,
): Promise<void> {
  const mgr = getManager();
  if (!mgr) throw new Error("Offline maps require a custom build of the app.");

  // MapLibre defaults to a 6 000-tile cap and silently stops past it. Raise it to
  // our enforced ceiling so the in-app warning is the single source of truth.
  if (typeof mgr.setTileCountLimit === "function") {
    try {
      mgr.setTileCountLimit(OFFLINE_MAX_TILES);
    } catch {
      /* non-fatal */
    }
  }

  const minZoom = opts.minZoom ?? 10;
  const maxZoom = opts.maxZoom ?? 15;
  // Accept either explicit bounds or a MapRegion centre+delta.
  const bounds: [number, number, number, number] = opts.bounds
    ? opts.bounds
    : regionToBounds(opts.region ?? { latitude: 25.2, longitude: 55.3, latitudeDelta: 0.4, longitudeDelta: 0.4 });
  const style = buildMapStyle({
    baseLayer: opts.baseLayer,
    night: opts.night,
    hillshade: true,
    terrain: false,
  });

  await mgr.createPack(
    {
      mapStyle: JSON.stringify(style),
      bounds,
      minZoom,
      maxZoom,
      metadata: {
        name: opts.name,
        baseLayer: opts.baseLayer,
        minZoom,
        maxZoom,
        createdAt: Date.now(),
      },
    },
    (_pack: any, status: any) => onProgress?.(status?.percentage ?? 0),
    (_pack: any, err: any) =>
      onError?.(typeof err === "string" ? err : err?.message ?? "Download failed"),
  );
}

export async function deleteRegion(id: string): Promise<void> {
  const mgr = getManager();
  if (!mgr) return;
  try {
    await mgr.deletePack(id);
  } catch {
    /* already gone */
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
