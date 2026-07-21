import type React from "react";
import type { StyleProp, ViewStyle } from "react-native";

/* ──────────────────────────────────────────────────────────────────────────
 *  Shared, platform-agnostic types and data for AdventureMap.
 *  This file MUST NOT import react-native-maps (it is fully retired) nor any
 *  native-only module, so it is safe to bundle on web and inside the WebView.
 *  Both AdventureMap.tsx (native, WebView+Leaflet) and AdventureMap.web.tsx
 *  (iframe+Leaflet) re-export from here.
 * ────────────────────────────────────────────────────────────────────────── */

export type LatLng = { latitude: number; longitude: number };

export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type AdventureBaseLayer =
  | "satellite"
  | "topo"
  | "terrain"
  | "standard"
  | "hybrid";

/**
 * Raster tile sources used by the layer switcher (kept for the topo/terrain
 * attribution strings the UI shows). The WebView map uses LEAFLET_TILES below.
 *  - topo: OpenTopoMap — genuine contour lines, hill-shading (CC-BY-SA + ODbL)
 *  - terrain: Esri World Topo Map — relief, road network, place labels
 */
export const TILE_SOURCES: Partial<
  Record<AdventureBaseLayer, { url: string; maximumZ: number; attribution: string }>
> = {
  topo: {
    url: "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
    maximumZ: 17,
    attribution: "© OpenTopoMap (CC-BY-SA) · © OpenStreetMap contributors",
  },
  terrain: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    maximumZ: 19,
    attribution: "Esri · USGS · NOAA",
  },
};

/**
 * Full raster tile definitions for every base layer, rendered by Leaflet inside
 * the WebView. All sources are no-API-key and licensed for commercial use with
 * attribution. `overlay` adds a labels/reference layer on top (used by hybrid).
 */
export const LEAFLET_TILES: Record<
  AdventureBaseLayer,
  { url: string; maxZoom: number; attribution: string; overlay?: string }
> = {
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 19,
    attribution: "Esri · Maxar · Earthstar Geographics",
  },
  hybrid: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 19,
    attribution: "Esri · Maxar · Earthstar Geographics",
    overlay:
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  },
  standard: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 19,
    attribution: "Esri · HERE · Garmin",
  },
  topo: {
    url: "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
    maxZoom: 17,
    attribution: "© OpenTopoMap (CC-BY-SA) · © OpenStreetMap contributors",
  },
  terrain: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 19,
    attribution: "Esri · USGS · NOAA",
  },
};

/** Human-readable metadata for the layer switcher UI. */
export const LAYER_META: { value: AdventureBaseLayer; label: string; icon: string }[] = [
  { value: "satellite", label: "Satellite", icon: "globe-outline" },
  { value: "topo", label: "Topo", icon: "git-network-outline" },
  { value: "terrain", label: "Terrain", icon: "trail-sign-outline" },
];

/** Attribution string to display while a given layer is active (or null). */
export function getLayerAttribution(layer: AdventureBaseLayer): string | null {
  return LEAFLET_TILES[layer]?.attribution ?? null;
}

export interface AdventurePolyline {
  id: string;
  coordinates: LatLng[];
  color: string;
  width?: number;
  dashed?: boolean;
  /**
   * 0–1 stroke opacity for the visible line. Used to fade overlapping faint
   * routes by distance so a dense cluster stays distinguishable. The invisible
   * tap hit-area is unaffected (it is always fully transparent).
   */
  opacity?: number;
  lineCap?: "round" | "butt" | "square";
  /**
   * Optional contrasting casing drawn as a wider line beneath the visible line.
   * Used to keep the blue navigation route distinguishable when it overlaps a
   * trail line of a similar (blue) accent color.
   */
  outlineColor?: string;
  /**
   * Tap handler for the drawn route line. When set, an invisible wide hit-area
   * is rendered along the line so the route is easy to tap on touch screens.
   */
  onPress?: () => void;
  /**
   * Marks this line as eligible for the overlap chooser. When a tap lands where
   * 2+ chooser-eligible lines overlap, the engine reports all of their ids via
   * `onLinesPress` instead of silently firing the topmost line's `onPress`.
   * Lines without this flag (e.g. the bright selected route) keep single-tap
   * behaviour even when overlapping.
   */
  chooser?: boolean;
}

/**
 * Serializable marker visual. Replaces the old `child: ReactNode` because marker
 * views now live inside a WebView (Leaflet divIcon) and cannot be RN components.
 *  - "puck": direction-of-travel user position marker (halo + beam + dot).
 *  - "badge": a coloured circle with an Ionicon glyph and an optional label.
 *  - "waypoint": smart planning waypoint — diamond / start-flag / end-flag SVG.
 */
export interface MarkerIcon {
  kind: "puck" | "badge" | "waypoint";
  color: string;
  /**
   * Ionicon name (e.g. "flag", "car-sport").
   *  - "badge" kind: the glyph rendered inside the badge circle.
   *  - "waypoint" kind: when set, a category pin (coloured circle + glyph) is
   *    rendered instead of the numbered diamond / start-end flag.
   */
  glyph?: string;
  /** Optional text label rendered just below the badge. */
  label?: string;
  /** Always show the label (e.g. city names), even when not emphasized. */
  showLabel?: boolean;
  /** Larger, emphasised rendering (e.g. selected waypoint). */
  emphasized?: boolean;
  /** "waypoint" kind — which shape to render. */
  variant?: "start" | "end" | "regular";
  /** "waypoint" kind — number shown inside the diamond for "regular" markers. */
  waypointNumber?: number;
  /** "waypoint" kind — dim the marker while elevation data is being fetched. */
  loading?: boolean;
  /** "waypoint" kind — flag the marker (red glow) when elevation fetch failed. */
  error?: boolean;
}

export interface AdventureMarker {
  id: string;
  coordinate: LatLng;
  /** Serializable marker visual. Falls back to a default pin when omitted. */
  icon?: MarkerIcon;
  pinColor?: string;
  title?: string;
  description?: string;
  anchor?: { x: number; y: number };
  onPress?: () => void;
  zIndex?: number;
  /** Rotation in degrees — used for direction-of-travel pucks. */
  rotation?: number;
}

export interface AdventureMapHandle {
  animateToRegion: (region: MapRegion, duration?: number) => void;
  animateCamera: (
    camera: { center?: LatLng; heading?: number; pitch?: number; zoom?: number },
    duration?: number,
  ) => void;
  fitToCoordinates: (
    coords: LatLng[],
    padding?: { top: number; right: number; bottom: number; left: number },
  ) => void;
  /** Read the live camera (heading/zoom/center). Null if unavailable. */
  getCamera: () => Promise<{ heading: number; zoom: number; center: LatLng } | null>;
}

export interface AdventureMapProps {
  style?: StyleProp<ViewStyle>;
  initialRegion?: MapRegion;
  baseLayer?: AdventureBaseLayer;
  showsUserLocation?: boolean;
  followsUserLocation?: boolean;
  showsCompass?: boolean;
  showsScale?: boolean;
  rotateEnabled?: boolean;
  pitchEnabled?: boolean;
  /**
   * Night-drive style: dimmed base + dark tint for low-light navigation.
   * Only the MapLibre (custom-build) engine renders this; the Leaflet
   * fallback ignores it gracefully.
   */
  night?: boolean;
  /**
   * 3D terrain + camera pitch. Only the MapLibre (custom-build) engine renders
   * this; the Leaflet fallback (north-up, 2D) ignores it gracefully.
   */
  terrain?: boolean;
  polylines?: AdventurePolyline[];
  markers?: AdventureMarker[];
  onMapReady?: () => void;
  onPress?: (coordinate: LatLng) => void;
  onRegionChangeComplete?: (region: MapRegion) => void;
  children?: React.ReactNode;
  /**
   * When true every map tap fires onWaypointDrop instead of onPress.
   * Use this to let users drop planning waypoints by tapping.
   */
  waypointMode?: boolean;
  /** Called with the tapped coordinate when waypointMode is true. */
  onWaypointDrop?: (coordinate: LatLng) => void;
  /**
   * Called when a tap lands where 2+ chooser-eligible lines (see
   * `AdventurePolyline.chooser`) overlap. Receives the ids of every overlapping
   * line so the screen can offer a chooser instead of silently selecting one.
   * A tap that hits only a single line still fires that line's `onPress`.
   */
  onLinesPress?: (ids: string[]) => void;
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Tap-bridge helpers (shared by AdventureMap.web.tsx + AdventureMapLeaflet.tsx)
 *
 *  These encode the fragile, easy-to-break-silently contract behind tapping a
 *  route line / marker:
 *    onPress (RN closure)  →  onPressId:boolean (serialized, sent to Leaflet)
 *    Leaflet posts {type:"linePress", id[, ids]}  →  dispatched back to onPress.
 *  Keeping them here (one source of truth, no per-component copy) lets the bridge
 *  be unit-tested without a device or a browser, so a dropped `onPressId` or a
 *  mismatched id is caught before it ships.
 * ────────────────────────────────────────────────────────────────────────── */

/** Serialized marker shape sent across the bridge (onPress fn → onPressId flag). */
export interface SerializedMarker {
  id: string;
  coordinate: LatLng;
  icon?: MarkerIcon;
  pinColor?: string;
  anchor?: { x: number; y: number };
  zIndex?: number;
  rotation?: number;
  onPressId: boolean;
}

/** Serialized polyline shape sent across the bridge (onPress fn → onPressId flag). */
export interface SerializedPolyline {
  id: string;
  coordinates: LatLng[];
  color: string;
  width?: number;
  dashed?: boolean;
  opacity?: number;
  lineCap?: "round" | "butt" | "square";
  outlineColor?: string;
  onPressId: boolean;
  chooser: boolean;
}

/* ──────────────────────────────────────────────────────────────────────────
 *  MapLibre (GPU engine) camera wiring — pure, device-free helpers
 *
 *  The MapLibre engine's 3D tilt and rotation only render on a custom/dev build
 *  — never in Expo Go, on web, or in the screenshot tool — so the *camera*
 *  values it sends (pitch on terrain toggle; bearing/pitch/zoom on
 *  animateCamera) have no runtime coverage in the dev env, exactly like the
 *  night/hillshade/terrain STYLE half that tests/mapStyle.test.ts already
 *  guards. Extracting the two small, pure decisions here lets a unit test lock
 *  them down without a GPU surface, so a regression in which pitch/bearing/zoom
 *  reaches the map is caught before it ships. AdventureMapMaplibre consumes
 *  these so the tested logic IS the shipped logic.
 * ────────────────────────────────────────────────────────────────────────── */

/** Camera pitch (degrees) used for the 3D tilted view when terrain is on. */
export const TERRAIN_TILT_PITCH_DEG = 55;

/**
 * The camera pitch to apply for a given terrain state: a ~55° tilt into a 3D
 * view when terrain is enabled, flattened back to top-down (north-up) when off.
 * Pairs with the root `terrain` block buildMapStyle emits on the same flag.
 */
export function terrainCameraPitch(terrain: boolean): number {
  return terrain ? TERRAIN_TILT_PITCH_DEG : 0;
}

/** Camera input for animateCamera (matches AdventureMapHandle.animateCamera). */
export interface AdventureCamera {
  center?: LatLng;
  heading?: number;
  pitch?: number;
  zoom?: number;
}

/**
 * A MapLibre camera "stop" (the argument to CameraRef.setStop). Only the fields
 * the animateCamera mapping can produce are modelled here.
 */
export interface MaplibreCameraStop {
  center?: [number, number];
  zoom?: number;
  bearing?: number;
  pitch?: number;
  duration: number;
}

/**
 * Map an AdventureMapHandle.animateCamera request onto a MapLibre camera stop.
 * The mapping is deliberately field-by-field and easy to break silently:
 *   - heading → bearing (the map rotation),
 *   - pitch   → pitch   (the 3D tilt),
 *   - zoom    → zoom, but ONLY when zoom > 0 (0/undefined means "keep current"
 *               zoom; forwarding 0 would slam the camera fully zoomed out),
 *   - center  → [longitude, latitude] (MapLibre is lng/lat, our API is lat/lng),
 *   - duration is always carried through.
 * Fields left undefined are omitted so setStop preserves the current value.
 */
export function maplibreCameraStop(
  camera: AdventureCamera,
  duration: number,
): MaplibreCameraStop {
  const { center, heading, pitch, zoom } = camera;
  const stop: MaplibreCameraStop = {
    ...(typeof zoom === "number" && zoom > 0 ? { zoom } : {}),
    ...(typeof heading === "number" ? { bearing: heading } : {}),
    ...(typeof pitch === "number" ? { pitch } : {}),
    duration,
  };
  if (center) {
    stop.center = [center.longitude, center.latitude];
  }
  return stop;
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Route-line tap tolerance (single source of truth for EVERY engine)
 *
 *  A thin route line (a few px wide) is nearly impossible to tap precisely on a
 *  touch screen, and the overlap chooser must fire at the SAME tolerance no
 *  matter which renderer draws the map, or a tap that opens the chooser on one
 *  engine would silently pick a single trail on another. The two engines reach
 *  that tolerance differently:
 *    - Leaflet draws an invisible hit-area line `lineHitWeightPx` wide and
 *      measures the tap's distance to each chooser line against half of it.
 *    - MapLibre has no invisible hit line; it queries rendered features inside a
 *      box of `lineHitRadiusPx` around the tap to reproduce the same tolerance.
 *  Keeping the constants here (interpolated into the Leaflet HTML below and
 *  imported by the MapLibre engine) stops the two thresholds from drifting.
 * ────────────────────────────────────────────────────────────────────────── */
export const LINE_HIT_PADDING_PX = 20;
export const LINE_HIT_MIN_WEIGHT_PX = 24;

/** Full invisible hit-area width (px) for a route line of the given stroke width. */
export function lineHitWeightPx(width?: number): number {
  return Math.max((width ?? 4) + LINE_HIT_PADDING_PX, LINE_HIT_MIN_WEIGHT_PX);
}

/** Tap tolerance radius (px) — half the hit-area width. */
export function lineHitRadiusPx(width?: number): number {
  return lineHitWeightPx(width) / 2;
}

/**
 * A queried rendered line feature — the subset of a MapLibre `GeoJSON.Feature`
 * the overlap path reads. `properties.lineId` carries the polyline id we inject
 * onto each rendered line source so a queried feature maps back to its route.
 */
export interface QueriedLineFeature {
  properties?: { lineId?: unknown } | null;
}

/**
 * MapLibre (GPU engine) overlap-query descriptor: the pixel bbox to query and
 * the candidate line-layer ids, for a tap at `point` over `chooserLines`.
 *
 * The Leaflet engine gets its tap tolerance from an invisible hit-area line
 * `lineHitWeightPx` wide and measures the tap's point-to-segment distance
 * against half of it (`lineHitRadiusPx`). The GPU engine has no such hit line,
 * so it reproduces the SAME tolerance by querying rendered features inside a box
 * whose half-size is that identical `lineHitRadiusPx` (widened to the widest
 * chooser line under the tap, exactly as Leaflet uses each line's own radius).
 * Keeping this math here — next to `lineHitRadiusPx` — is what stops the two
 * engines' overlap thresholds from silently drifting apart.
 */
export function maplibreChooserQuery(
  point: [number, number],
  chooserLines: { id: string; width?: number }[],
): {
  bbox: [[number, number], [number, number]];
  layers: string[];
  radiusPx: number;
} {
  const [x, y] = point;
  const radiusPx = Math.max(
    lineHitRadiusPx(),
    ...chooserLines.map((cl) => lineHitRadiusPx(cl.width)),
  );
  return {
    bbox: [
      [x - radiusPx, y - radiusPx],
      [x + radiusPx, y + radiusPx],
    ],
    layers: chooserLines.map((cl) => `line-${cl.id}`),
    radiusPx,
  };
}

/**
 * Distinct, insertion-ordered polyline ids from the rendered line features a
 * MapLibre bbox query returned. When this yields more than one id the tap
 * overlaps several chooser lines and the screen must open the overlap chooser
 * (via `onLinesPress`); a single id falls through to that line's `onPress`.
 */
export function chooserIdsFromFeatures(feats: QueriedLineFeature[]): string[] {
  const ids: string[] = [];
  feats.forEach((f) => {
    const lid = (f?.properties as { lineId?: unknown } | null)?.lineId;
    if (typeof lid === "string" && ids.indexOf(lid) === -1) {
      ids.push(lid);
    }
  });
  return ids;
}

/** Drop the non-serializable onPress fn before sending markers to Leaflet. */
export function serializeMarkers(markers: AdventureMarker[]): SerializedMarker[] {
  return markers.map((m) => ({
    id: m.id,
    coordinate: m.coordinate,
    icon: m.icon,
    pinColor: m.pinColor,
    anchor: m.anchor,
    zIndex: m.zIndex,
    rotation: m.rotation,
    onPressId: !!m.onPress,
  }));
}

/** Drop the non-serializable onPress fn before sending polylines to Leaflet. */
export function serializePolylines(polylines: AdventurePolyline[]): SerializedPolyline[] {
  return polylines.map((p) => ({
    id: p.id,
    coordinates: p.coordinates,
    color: p.color,
    width: p.width,
    dashed: p.dashed,
    opacity: p.opacity,
    lineCap: p.lineCap,
    outlineColor: p.outlineColor,
    onPressId: !!p.onPress,
    chooser: !!p.chooser,
  }));
}

/**
 * Build the id → onPress map the host keeps so an inbound press event (which
 * only carries an id) can fire the original RN closure. Works for both markers
 * and polylines (both have `id` + optional `onPress`).
 */
export function buildPressHandlers<T extends { id: string; onPress?: () => void }>(
  items: T[],
): Record<string, (() => void) | undefined> {
  const map: Record<string, (() => void) | undefined> = {};
  items.forEach((it) => {
    if (it.onPress) map[it.id] = it.onPress;
  });
  return map;
}

/**
 * Resolve the raw overlapping line ids reported by `onLinesPress` into the
 * distinct domain entities a screen wants to offer in its chooser.
 *
 * `onLinesPress` fires with the ids of every chooser-eligible line under the
 * tap. Screens draw a line per entity (often with a prefix, e.g. a nearby
 * trail's line id is `nb-line-<trailId>`), so turning that id list into a
 * de-duplicated, ordered list of entities is the same on every screen:
 *   1. strip the optional line-id `prefix` to recover the entity id,
 *   2. drop duplicates (a single entity can back more than one reported id),
 *   3. look each entity up (unknown ids are skipped, never throw),
 *   4. optionally sort (e.g. nearest-first).
 *
 * Keeping this here (pure, no React/RN imports) lets any screen share the exact
 * same chooser semantics as the map, and lets the logic be unit-tested without
 * a device or browser.
 */
export function resolveOverlapSelection<T>(
  ids: string[],
  lookup: (entityId: string) => T | undefined,
  opts?: { prefix?: string; sort?: (a: T, b: T) => number },
): T[] {
  const prefix = opts?.prefix;
  const seen = new Set<string>();
  const items: T[] = [];
  ids.forEach((lineId) => {
    const entityId =
      prefix && lineId.startsWith(prefix) ? lineId.slice(prefix.length) : lineId;
    if (seen.has(entityId)) return;
    const item = lookup(entityId);
    if (item !== undefined) {
      seen.add(entityId);
      items.push(item);
    }
  });
  if (opts?.sort) items.sort(opts.sort);
  return items;
}

/**
 * The decision a screen makes after `onLinesPress` fires, expressed as a pure
 * value so it can be unit-tested without a device, browser, or React tree.
 *  - "chooser": the tap resolved to 2+ distinct entities → open the chooser.
 *  - "single":  exactly one entity resolved → preview it directly (no chooser).
 *  - "none":    nothing resolved (every reported id was unknown) → do nothing.
 */
export type OverlapIntent<T> =
  | { kind: "chooser"; items: T[] }
  | { kind: "single"; item: T }
  | { kind: "none" };

/**
 * Turn the raw overlapping line ids from `onLinesPress` into the concrete UI
 * intent a screen should act on. This is `resolveOverlapSelection` plus the
 * same count-based branch every screen wiring `onLinesPress` performs:
 *   - 2+ entities  → { kind: "chooser", items }   (open the chooser sheet)
 *   - 1 entity     → { kind: "single", item }      (preview it directly)
 *   - 0 entities   → { kind: "none" }              (all ids unknown; no-op)
 *
 * Keeping the branch here (not re-implemented per screen) guarantees a 2-id
 * overlap opens a 2-entry chooser everywhere — never a silent single-select or
 * an empty sheet — and lets that contract be tested in isolation.
 */
export function planOverlapSelection<T>(
  ids: string[],
  lookup: (entityId: string) => T | undefined,
  opts?: { prefix?: string; sort?: (a: T, b: T) => number },
): OverlapIntent<T> {
  const items = resolveOverlapSelection(ids, lookup, opts);
  if (items.length === 0) return { kind: "none" };
  if (items.length === 1) return { kind: "single", item: items[0] };
  return { kind: "chooser", items };
}

/**
 * Route an inbound `linePress` bridge message to the correct handler.
 *  - A tap overlapping 2+ chooser-eligible lines carries `ids` → onLinesPress.
 *  - A single hit fires that line's handler from the id → onPress map.
 * Unknown / missing ids are a no-op (never throws).
 */
export function dispatchLinePress(
  msg: { id?: string; ids?: string[] },
  lineHandlers: Record<string, (() => void) | undefined>,
  onLinesPress?: (ids: string[]) => void,
): void {
  if (msg.ids && msg.ids.length > 1 && onLinesPress) {
    onLinesPress(msg.ids);
  } else if (msg.id) {
    lineHandlers[msg.id]?.();
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 *  Leaflet HTML generator. Produces a self-contained HTML document that runs a
 *  Leaflet map and exposes a small bridge:
 *    RN  → WebView : window.AMap.<fn>(...)  (called via injectJavaScript)
 *    WebView → RN  : postMessage(JSON)      ({type:"ready"|"press"|"region"|
 *                                              "markerPress"|"camera"})
 *  Tiles/Leaflet/Ionicons load from CDN (the map already requires network).
 * ────────────────────────────────────────────────────────────────────────── */

const DEFAULT_REGION: MapRegion = {
  latitude: 24.4539,
  longitude: 54.3773,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

export function buildLeafletHtml(opts: {
  initialRegion?: MapRegion;
  baseLayer?: AdventureBaseLayer;
}): string {
  const region = opts.initialRegion ?? DEFAULT_REGION;
  const baseLayer = opts.baseLayer ?? "satellite";
  const initial = JSON.stringify({ region, baseLayer });
  const tiles = JSON.stringify(LEAFLET_TILES);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script type="module" src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.esm.js"></script>
<script nomodule src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.js"></script>
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #0b0b0b; }
  .leaflet-container { background: #0b0b0b; outline: none; }
  .leaflet-control-attribution { display: none; }
  .am-badge-wrap { display: flex; flex-direction: column; align-items: center; }
  .am-badge {
    display: flex; align-items: center; justify-content: center;
    border: 2.5px solid #fff; border-radius: 999px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.45);
    color: #fff;
  }
  .am-badge ion-icon { color: #fff; }
  .am-label {
    margin-top: 4px; padding: 2px 7px; border-radius: 7px;
    color: #fff; font: 600 11px -apple-system, system-ui, sans-serif;
    white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  }
  .am-wp-wrap { display: flex; flex-direction: column; align-items: center; }
  .am-wp-wrap .am-label { max-width: 116px; overflow: hidden; text-overflow: ellipsis; }
  .am-puck { width: 44px; height: 44px; position: relative; }
  .am-puck .halo { position: absolute; inset: 0; border-radius: 22px; }
  .am-puck .beam {
    position: absolute; top: 1px; left: 14px;
    width: 0; height: 0;
    border-left: 8px solid transparent; border-right: 8px solid transparent;
    border-bottom: 14px solid currentColor;
  }
  .am-puck .dot {
    position: absolute; top: 14px; left: 14px;
    width: 16px; height: 16px; border-radius: 8px;
    border: 2.5px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  }
  .am-user { width: 22px; height: 22px; }
  .am-user .dot {
    position:absolute; inset:3px; border-radius: 999px;
    background: #2D8CFF; border: 2.5px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.5);
  }
  .am-user .ring {
    position:absolute; inset:0; border-radius: 999px;
    background: rgba(45,140,255,0.25);
  }
  .am-wp-loading { opacity: 0.55; }
  .am-wp-error { filter: drop-shadow(0 0 3px #E74C3C) drop-shadow(0 0 2px #E74C3C); }
</style>
</head>
<body>
<div id="map"></div>
<script>
(function () {
  var INITIAL = ${initial};
  var TILES = ${tiles};

  function send(msg) {
    var s = JSON.stringify(msg);
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(s);
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage(s, "*");
    }
  }

  function regionToBounds(r) {
    var dLat = Math.max(r.latitudeDelta, 0.0008) / 2;
    var dLng = Math.max(r.longitudeDelta, 0.0008) / 2;
    return [
      [r.latitude - dLat, r.longitude - dLng],
      [r.latitude + dLat, r.longitude + dLng],
    ];
  }
  function boundsToRegion() {
    var b = map.getBounds(), c = b.getCenter();
    return {
      latitude: c.lat, longitude: c.lng,
      latitudeDelta: Math.abs(b.getNorth() - b.getSouth()),
      longitudeDelta: Math.abs(b.getEast() - b.getWest()),
    };
  }

  var map = L.map("map", {
    zoomControl: false, attributionControl: false,
    rotate: false, fadeAnimation: true,
  });
  map.fitBounds(regionToBounds(INITIAL.region));

  // ── Base + overlay tile layers ──
  var baseLayer = null, overlayLayer = null;
  function setBaseLayer(name) {
    var t = TILES[name] || TILES.satellite;
    if (baseLayer) { map.removeLayer(baseLayer); baseLayer = null; }
    if (overlayLayer) { map.removeLayer(overlayLayer); overlayLayer = null; }
    baseLayer = L.tileLayer(t.url, { maxZoom: t.maxZoom, maxNativeZoom: t.maxZoom, keepBuffer: 4 });
    baseLayer.addTo(map);
    if (t.overlay) {
      overlayLayer = L.tileLayer(t.overlay, { maxZoom: t.maxZoom, maxNativeZoom: t.maxZoom });
      overlayLayer.addTo(map);
    }
  }
  setBaseLayer(INITIAL.baseLayer);

  // ── Layer groups for dynamic content ──
  var lineGroup = L.layerGroup().addTo(map);
  var markerGroup = L.layerGroup().addTo(map);
  var userMarker = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function badgeHtml(icon, rotation) {
    if (icon.kind === "puck") {
      var col = esc(icon.color || "#D4763B");
      return '<div class="am-puck" style="color:' + col + ';transform:rotate(' + (rotation || 0) + 'deg);">'
        + '<div class="halo" style="background:' + col + '40;"></div>'
        + '<div class="beam"></div>'
        + '<div class="dot" style="background:' + col + ';"></div>'
        + '</div>';
    }
    var size = icon.emphasized ? 44 : 32;
    var iconSize = icon.emphasized ? 20 : 15;
    var col2 = esc(icon.color || "#D4763B");
    var glyph = icon.glyph ? '<ion-icon name="' + esc(icon.glyph) + '" style="font-size:' + iconSize + 'px;"></ion-icon>' : "";
    var label = icon.label && icon.emphasized
      ? '<div class="am-label" style="background:' + col2 + ';">' + esc(icon.label) + '</div>'
      : (icon.label && icon.kind === "badge" && icon.showLabel
          ? '<div class="am-label" style="background:' + col2 + ';">' + esc(icon.label) + '</div>' : "");
    return '<div class="am-badge-wrap">'
      + '<div class="am-badge" style="width:' + size + 'px;height:' + size + 'px;background:' + col2 + ';">' + glyph + '</div>'
      + label + '</div>';
  }

  function waypointIconHtml(icon) {
    var variant = icon.variant || "regular";
    var cls = [];
    if (icon.loading) cls.push("am-wp-loading");
    if (icon.error) cls.push("am-wp-error");
    var loading = cls.length ? ' class="' + cls.join(" ") + '"' : '';
    if (variant === "start") {
      return '<svg' + loading + ' xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 30 38">'
        + '<line x1="5" y1="3" x2="5" y2="36" stroke="rgba(255,255,255,0.9)" stroke-width="2.5" stroke-linecap="round"/>'
        + '<path d="M5,5 L28,11 L5,22 Z" fill="#27AE60" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>'
        + '<text x="16.5" y="18" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="-apple-system,system-ui,sans-serif">S</text>'
        + '</svg>';
    }
    if (variant === "end") {
      return '<svg' + loading + ' xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 30 38">'
        + '<line x1="5" y1="3" x2="5" y2="36" stroke="rgba(255,255,255,0.9)" stroke-width="2.5" stroke-linecap="round"/>'
        + '<path d="M5,5 L28,5 L16.5,20 Z" fill="#C0392B" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>'
        + '<text x="16.5" y="15" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="-apple-system,system-ui,sans-serif">E</text>'
        + '</svg>';
    }
    var col = esc(icon.color || "#D4763B");
    var num = icon.waypointNumber != null ? String(icon.waypointNumber) : "•";
    return '<svg' + loading + ' xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">'
      + '<polygon points="13,1 25,13 13,25 1,13" fill="' + col + '" stroke="rgba(255,255,255,0.9)" stroke-width="2"/>'
      + '<text x="13" y="17" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="-apple-system,system-ui,sans-serif">' + esc(num) + '</text>'
      + '</svg>';
  }

  // Category-tagged waypoint (water / camp / hazard / viewpoint / fuel): a
  // coloured circle carrying the category glyph, so the meaning reads at a
  // glance on the map before the pin is even tapped.
  function waypointCategoryHtml(icon) {
    var size = icon.emphasized ? 40 : 30;
    var glyphSize = icon.emphasized ? 21 : 16;
    var col = esc(icon.color || "#D4763B");
    var loading = (icon.loading ? " am-wp-loading" : "") + (icon.error ? " am-wp-error" : "");
    return '<div class="am-badge' + loading + '" style="width:' + size + 'px;height:' + size + 'px;background:' + col + ';">'
      + '<ion-icon name="' + esc(icon.glyph) + '" style="font-size:' + glyphSize + 'px;"></ion-icon>'
      + '</div>';
  }

  function makeIcon(m) {
    var icon = m.icon;
    var rotation = m.rotation || 0;
    if (!icon) {
      return L.divIcon({
        className: "am-pin", html: '<div class="am-badge" style="width:24px;height:24px;background:' + esc(m.pinColor || "#D4763B") + ';"></div>',
        iconSize: [24, 24], iconAnchor: [12, 12],
      });
    }
    if (icon.kind === "waypoint") {
      var variant = icon.variant || "regular";
      // An explicit category glyph wins over the start/end flag so user intent
      // (e.g. "this start point is a water source") shows on the map.
      var hasCat = !!icon.glyph;
      var svg = hasCat ? waypointCategoryHtml(icon) : waypointIconHtml(icon);
      var catSize = icon.emphasized ? 40 : 30;
      var wpLabel = icon.label
        ? '<div class="am-label" style="background:' + esc(icon.color || "#D4763B") + ';">' + esc(icon.label) + '</div>'
        : "";
      if (!icon.label) {
        if (hasCat) {
          return L.divIcon({ className: "am-x", html: svg, iconSize: [catSize, catSize], iconAnchor: [catSize / 2, catSize / 2] });
        }
        if (variant === "start" || variant === "end") {
          return L.divIcon({ className: "am-x", html: svg, iconSize: [30, 38], iconAnchor: [5, 36] });
        }
        return L.divIcon({ className: "am-x", html: svg, iconSize: [26, 26], iconAnchor: [13, 13] });
      }
      var W = 140;
      var wrap = '<div class="am-wp-wrap">' + svg + wpLabel + '</div>';
      if (hasCat) {
        return L.divIcon({ className: "am-x", html: wrap, iconSize: [W, catSize + 22], iconAnchor: [W / 2, catSize / 2] });
      }
      if (variant === "start" || variant === "end") {
        return L.divIcon({ className: "am-x", html: wrap, iconSize: [W, 60], iconAnchor: [W / 2 - 10, 36] });
      }
      return L.divIcon({ className: "am-x", html: wrap, iconSize: [W, 48], iconAnchor: [W / 2, 13] });
    }
    if (icon.kind === "puck") {
      return L.divIcon({ className: "am-x", html: badgeHtml(icon, rotation), iconSize: [44, 44], iconAnchor: [22, 22] });
    }
    var size = icon.emphasized ? 44 : 32;
    var hasLabel = !!(icon.label && (icon.emphasized || icon.showLabel));
    var totalH = size + (hasLabel ? 22 : 0);
    var ax = m.anchor ? m.anchor.x : 0.5;
    var ay = m.anchor ? m.anchor.y : 0.5;
    return L.divIcon({
      className: "am-x",
      html: badgeHtml(icon, rotation),
      iconSize: [Math.max(size, 80), totalH],
      iconAnchor: [Math.max(size, 80) * 0.5, size * ay],
    });
  }

  // Registry of chooser-eligible lines for the current frame, used to detect
  // when a tap lands where several of them overlap so the user can pick one.
  var chooserLines = [];

  // Collect the ids of every chooser-eligible line whose hit-area contains the
  // click point, so an overlapping tap can offer a chooser. Ordered nearest-to
  // -tap first; the screen re-sorts by trail distance for display.
  function overlappingChooserIds(clickPt) {
    var hits = [];
    chooserLines.forEach(function (cl) {
      var min = Infinity;
      for (var i = 0; i < cl.pts.length - 1; i++) {
        var a = map.latLngToContainerPoint(L.latLng(cl.pts[i][0], cl.pts[i][1]));
        var b = map.latLngToContainerPoint(L.latLng(cl.pts[i + 1][0], cl.pts[i + 1][1]));
        var d = L.LineUtil.pointToSegmentDistance(clickPt, a, b);
        if (d < min) min = d;
      }
      if (min <= cl.hitRadius) hits.push({ id: cl.id, d: min });
    });
    hits.sort(function (x, y) { return x.d - y.d; });
    return hits.map(function (h) { return h.id; });
  }

  function setPolylines(list) {
    lineGroup.clearLayers();
    chooserLines = [];
    (list || []).forEach(function (p) {
      if (!p.coordinates || p.coordinates.length < 2) return;
      var pts = p.coordinates.map(function (c) { return [c.latitude, c.longitude]; });
      // Wide, invisible hit-area drawn first so the route is easy to tap on a
      // touch screen even though the visible line is thin.
      if (p.onPressId) {
        var hitWeight = Math.max((p.width || 4) + ${LINE_HIT_PADDING_PX}, ${LINE_HIT_MIN_WEIGHT_PX});
        if (p.chooser) {
          chooserLines.push({ id: p.id, pts: pts, hitRadius: hitWeight / 2 });
        }
        L.polyline(pts, {
          color: "#000", weight: hitWeight,
          opacity: 0, lineCap: "round", lineJoin: "round", interactive: true,
        }).on("click", function (e) {
          if (e && e.originalEvent) { L.DomEvent.stopPropagation(e); }
          // When this line is chooser-eligible and a tap overlaps others, hand
          // the full list to RN so the user can pick; otherwise fire the single
          // line as before.
          if (p.chooser && e && e.containerPoint) {
            var ids = overlappingChooserIds(e.containerPoint);
            if (ids.length > 1) {
              send({ type: "linePress", id: p.id, ids: ids });
              return;
            }
          }
          send({ type: "linePress", id: p.id });
        }).addTo(lineGroup);
      }
      // Contrasting casing drawn beneath the visible line so a blue route stays
      // distinguishable when it overlaps a similarly-blue trail line.
      if (p.outlineColor) {
        L.polyline(pts, {
          color: p.outlineColor, weight: (p.width || 4) + 4,
          lineCap: p.lineCap || "round", lineJoin: "round",
          dashArray: p.dashed ? "8 6" : null,
          interactive: false,
        }).addTo(lineGroup);
      }
      L.polyline(pts, {
        color: p.color, weight: p.width || 4,
        opacity: typeof p.opacity === "number" ? p.opacity : 1,
        lineCap: p.lineCap || "round", lineJoin: "round",
        dashArray: p.dashed ? "8 6" : null,
        interactive: false,
      }).addTo(lineGroup);
    });
  }

  function setMarkers(list) {
    markerGroup.clearLayers();
    (list || []).forEach(function (m) {
      var mk = L.marker([m.coordinate.latitude, m.coordinate.longitude], {
        icon: makeIcon(m),
        zIndexOffset: (m.zIndex || 0) * 100,
        interactive: !!m.onPressId,
      });
      if (m.onPressId) {
        mk.on("click", function (e) {
          if (e && e.originalEvent) { L.DomEvent.stopPropagation(e); }
          send({ type: "markerPress", id: m.id });
        });
      }
      mk.addTo(markerGroup);
    });
  }

  function setUser(loc) {
    if (!loc) { if (userMarker) { map.removeLayer(userMarker); userMarker = null; } return; }
    var ll = [loc.latitude, loc.longitude];
    if (!userMarker) {
      userMarker = L.marker(ll, {
        icon: L.divIcon({ className: "am-x", html: '<div class="am-user"><div class="ring"></div><div class="dot"></div></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
        zIndexOffset: 2000, interactive: false,
      }).addTo(map);
    } else {
      userMarker.setLatLng(ll);
    }
  }

  // ── RN → WebView bridge ──
  window.AMap = {
    setBaseLayer: setBaseLayer,
    setPolylines: setPolylines,
    setMarkers: setMarkers,
    setUser: setUser,
    animateToRegion: function (r, duration) {
      map.flyToBounds(regionToBounds(r), { duration: Math.max((duration || 500) / 1000, 0.1) });
    },
    animateCamera: function (cam, duration) {
      var opts = { duration: Math.max((duration || 500) / 1000, 0.1) };
      if (cam.center) {
        if (typeof cam.zoom === "number" && cam.zoom > 0) map.flyTo([cam.center.latitude, cam.center.longitude], cam.zoom, opts);
        else map.panTo([cam.center.latitude, cam.center.longitude], opts);
      } else if (typeof cam.zoom === "number" && cam.zoom > 0) {
        map.setZoom(cam.zoom);
      }
    },
    fitToCoordinates: function (coords, padding) {
      if (!coords || !coords.length) return;
      var pts = coords.map(function (c) { return [c.latitude, c.longitude]; });
      var pad = padding || { top: 80, right: 60, bottom: 220, left: 60 };
      map.flyToBounds(L.latLngBounds(pts), {
        paddingTopLeft: [pad.left, pad.top], paddingBottomRight: [pad.right, pad.bottom], duration: 0.6,
      });
    },
    getCamera: function (requestId) {
      var c = map.getCenter();
      send({ type: "camera", requestId: requestId, camera: { heading: 0, zoom: map.getZoom(), center: { latitude: c.lat, longitude: c.lng } } });
    },
    applyInitial: function (state) {
      if (!state) return;
      if (state.baseLayer) setBaseLayer(state.baseLayer);
      if (state.polylines) setPolylines(state.polylines);
      if (state.markers) setMarkers(state.markers);
      if (state.user) setUser(state.user);
    },
  };

  // ── Waypoint-drop mode ──
  var waypointMode = false;
  window.AMap.setWaypointMode = function(v) { waypointMode = !!v; };

  // ── WebView → RN events ──
  map.on("click", function (e) {
    var coord = { latitude: e.latlng.lat, longitude: e.latlng.lng };
    if (waypointMode) {
      send({ type: "waypointDrop", coordinate: coord });
    } else {
      send({ type: "press", coordinate: coord });
    }
  });
  map.on("moveend", function () { send({ type: "region", region: boundsToRegion() }); });

  // For the web (iframe) path, accept updates via window message.
  window.addEventListener("message", function (ev) {
    try {
      var msg = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
      if (msg && msg.__amap && window.AMap[msg.fn]) window.AMap[msg.fn].apply(null, msg.args || []);
    } catch (err) {}
  });

  setTimeout(function () { send({ type: "ready" }); }, 0);
})();
</script>
</body>
</html>`;
}
