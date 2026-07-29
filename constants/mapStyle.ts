import { LEAFLET_TILES, type AdventureBaseLayer } from "@/components/adventureMapShared";

/* ──────────────────────────────────────────────────────────────────────────
 *  Branded MapLibre style builder (custom-build engine).
 *  This module is intentionally free of any native import so it is safe to
 *  bundle everywhere (web, Expo Go, custom builds). It only produces plain
 *  MapLibre GL style JSON, consumed by the MapLibre engine and by the offline
 *  region downloader (which serialises it for OfflineManager.createPack).
 *
 *  Tile sources:
 *   - vector (online): MapTiler GL styles — sharp at every zoom, ~half the size
 *     of raster. Requires MAPTILER_API_KEY injected via app.config.js extra.
 *   - raster fallback: LEAFLET_TILES (OpenTopoMap / Esri) — used when no key,
 *     for offline packs, and for night-drive mode (custom tinting).
 *   - DEM: AWS Terrain Tiles (terrarium encoding) → hillshade + 3D terrain
 * ────────────────────────────────────────────────────────────────────────── */

/** AWS open-data terrain tiles (terrarium-encoded elevation), no API key. */
export const TERRARIUM_DEM_TILES =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

export const MAPLIBRE_ATTRIBUTION =
  "© MapTiler · © OpenStreetMap contributors · AWS Terrain Tiles";

/* ──────────────────────────────────────────────────────────────────────────
 *  MapTiler vector styles
 *  Each entry is a hosted GL style URL served by MapTiler. The key is
 *  injected at EAS build time from the MAPTILER_API_KEY secret (app.config.js).
 *  Commercial use: free tier ≤ 100 k map loads/month; scales to self-hosted
 *  Protomaps CDN at volume.
 * ────────────────────────────────────────────────────────────────────────── */

/** MapTiler style IDs per base layer (non-satellite). */
const MAPTILER_STYLE_IDS: Partial<Record<AdventureBaseLayer, string>> = {
  topo: "outdoor-v2",      // Contours, hiking trails, terrain shading — best for off-road
  terrain: "topo-v2",      // Detailed topo with relief shading
  standard: "streets-v2",  // Road network with place labels
  hybrid: "hybrid",        // Satellite imagery + vector labels
  satellite: "satellite",  // Satellite imagery via MapTiler
};

/**
 * Returns the MapTiler hosted style URL for a given layer and API key, or
 * null when the layer has no vector equivalent or the key is absent.
 *
 * Night mode intentionally falls back to the raster builder (which applies a
 * custom tint) because MapTiler's dark variants don't cover outdoor/topo.
 */
export function getMapTilerStyleUrl(
  layer: AdventureBaseLayer,
  key: string | null | undefined,
  night = false,
): string | null {
  if (!key || night) return null;
  const id = MAPTILER_STYLE_IDS[layer];
  if (!id) return null;
  return `https://api.maptiler.com/maps/${id}/style.json?key=${key}`;
}

export interface MapStyleOptions {
  baseLayer?: AdventureBaseLayer;
  /** Night-drive mode: dimmed base + dark tint for low-light navigation. */
  night?: boolean;
  /** Slope-angle relief shading from the DEM. */
  hillshade?: boolean;
  /** 3D terrain exaggeration (rendered where the build supports it). */
  terrain?: boolean;
}

/** OpenTopoMap is served from a/b/c subdomains; expand for tile parallelism. */
function rasterTilesFor(url: string): string[] {
  if (url.includes("a.tile.opentopomap.org")) {
    return ["a", "b", "c"].map((s) =>
      url.replace("a.tile.opentopomap.org", `${s}.tile.opentopomap.org`),
    );
  }
  return [url];
}

/**
 * Build a self-contained MapLibre GL style. Returned as a plain object so it can
 * be passed directly to <Map mapStyle> or JSON-stringified for offline packs.
 */
export function buildMapStyle(opts: MapStyleOptions = {}): Record<string, unknown> {
  const baseLayer = opts.baseLayer ?? "satellite";
  const night = !!opts.night;
  const hillshade = opts.hillshade ?? true;
  const terrain = !!opts.terrain;

  const base = LEAFLET_TILES[baseLayer] ?? LEAFLET_TILES.satellite;

  const sources: Record<string, unknown> = {
    base: {
      type: "raster",
      tiles: rasterTilesFor(base.url),
      tileSize: 256,
      maxzoom: base.maxZoom,
      attribution: base.attribution,
    },
    dem: {
      type: "raster-dem",
      tiles: [TERRARIUM_DEM_TILES],
      tileSize: 256,
      encoding: "terrarium",
      maxzoom: 15,
    },
  };
  if (base.overlay) {
    sources.overlay = {
      type: "raster",
      tiles: rasterTilesFor(base.overlay),
      tileSize: 256,
      maxzoom: base.maxZoom,
    };
  }

  const layers: Record<string, unknown>[] = [
    {
      id: "bg",
      type: "background",
      paint: { "background-color": night ? "#05080c" : "#0b0b0b" },
    },
    {
      id: "base",
      type: "raster",
      source: "base",
      paint: night
        ? { "raster-brightness-max": 0.72, "raster-saturation": -0.28, "raster-contrast": 0.1 }
        : { "raster-brightness-max": 1, "raster-saturation": 0, "raster-contrast": 0 },
    },
  ];

  if (base.overlay) {
    layers.push({
      id: "overlay",
      type: "raster",
      source: "overlay",
      paint: { "raster-opacity": night ? 0.65 : 1 },
    });
  }

  if (hillshade) {
    layers.push({
      id: "hillshade",
      type: "hillshade",
      source: "dem",
      paint: {
        "hillshade-exaggeration": night ? 0.35 : 0.45,
        "hillshade-shadow-color": night ? "#000000" : "#3a2a1c",
        "hillshade-highlight-color": night ? "#1b2433" : "#fff7ec",
        "hillshade-accent-color": "#5a4632",
      },
    });
  }

  if (night) {
    // Full-screen dark tint on top → the "night-drive" look on any base layer.
    layers.push({
      id: "night-tint",
      type: "background",
      paint: { "background-color": "#040a14", "background-opacity": 0.34 },
    });
  }

  const style: Record<string, unknown> = {
    version: 8,
    name: night ? "Trail Planner Night" : "Trail Planner Topo",
    // MapLibre v11 validates the presence of glyphs on startup and renders
    // black without it — even for pure raster maps that never use text layers.
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sprite: "https://demotiles.maplibre.org/style/osm-bright-gl-style/sprite",
    sources,
    layers,
  };
  if (terrain) {
    style.terrain = { source: "dem", exaggeration: 1.4 };
  }
  return style;
}
