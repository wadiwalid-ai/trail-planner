/**
 * OSM Overpass API sync
 *
 * Pulls off-road trail data from OpenStreetMap under the ODbL licence.
 * All trails imported here must display "© OpenStreetMap contributors"
 * attribution somewhere visible in the app (osmAttribution = true).
 *
 * This is a one-way pull: we never send data back to OSM.
 * Rate: we cache on our DB, so we only hit Overpass once per sync run.
 */

import { upsertOsmTrail } from "./storage";
import type { InsertTrail } from "../../shared/schema";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// ── Overpass queries ──────────────────────────────────────────────────────────

// UAE: bounding box covers all seven emirates
const UAE_QUERY = `
[out:json][timeout:90][bbox:22.5,51.5,26.5,56.5];
(
  way["highway"="track"]["name"]["4wd_only"="yes"];
  way["highway"="track"]["name"]["surface"~"sand|gravel|dirt|ground|unpaved",i];
  way["highway"="track"]["name"]["name"~"Wadi|Jebel|Ras ",i];
);
out body geom;
`;

// North America — Moab & Southern Utah
const MOAB_QUERY = `
[out:json][timeout:60][bbox:37.8,-110.2,38.9,-109.0];
(
  way["highway"="track"]["name"]["4wd_only"="yes"];
  way["highway"="track"]["name"]["surface"~"sand|gravel|dirt|rock",i];
  relation["route"="mtb"]["name"];
);
out body geom;
`;

// North America — Colorado high country
const COLORADO_QUERY = `
[out:json][timeout:60][bbox:37.5,-108.5,38.6,-106.8];
(
  way["highway"="track"]["name"]["4wd_only"="yes"];
  way["highway"="track"]["name"];
  relation["route"="mtb"]["name"];
);
out body geom;
`;

interface OsmNode {
  lat: number;
  lon: number;
}

interface OsmWay {
  type: "way";
  id: number;
  tags: Record<string, string>;
  geometry: OsmNode[];
}

interface OsmRelationMember {
  type: string;
  ref: number;
  role: string;
  geometry?: OsmNode[];
}

interface OsmRelation {
  type: "relation";
  id: number;
  tags: Record<string, string>;
  members: OsmRelationMember[];
}

interface OverpassResponse {
  elements: (OsmWay | OsmRelation | { type: "node" })[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchOverpass(query: string): Promise<OverpassResponse> {
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`Overpass API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<OverpassResponse>;
}

function estimateDifficulty(tags: Record<string, string>): number {
  let d = 3; // default moderate
  if (tags["4wd_only"] === "yes") d += 2;
  if (tags.surface === "sand") d += 2;
  if (tags.surface === "rock") d += 2;
  if (tags.tracktype === "grade4" || tags.tracktype === "grade5") d += 2;
  if (tags.incline && parseInt(tags.incline) > 15) d += 1;
  if (tags.smoothness === "very_bad" || tags.smoothness === "horrible") d += 1;
  return Math.min(10, Math.max(1, d));
}

function inferTerrain(tags: Record<string, string>): string {
  const surface = tags.surface?.toLowerCase() ?? "";
  const name = (tags.name ?? "").toLowerCase();
  if (surface.includes("sand")) return "Sand Dunes";
  if (surface.includes("rock") || surface.includes("stone")) return "Rock Crawling";
  if (name.includes("wadi")) return "Wadi & Mountain";
  if (name.includes("jebel") || name.includes("mountain")) return "High Mountain";
  if (surface.includes("gravel") || surface.includes("dirt")) return "Gravel Track";
  return "Off-Road Track";
}

function inferAccentColor(difficulty: number): string {
  if (difficulty >= 9) return "#C0392B";
  if (difficulty >= 7) return "#D4763B";
  if (difficulty >= 5) return "#E8B74D";
  return "#2D6A4F";
}

function calcDistanceKm(nodes: OsmNode[]): string {
  if (nodes.length < 2) return "—";
  let total = 0;
  for (let i = 1; i < nodes.length; i++) {
    const dLat = (nodes[i].lat - nodes[i - 1].lat) * (Math.PI / 180);
    const dLon = (nodes[i].lon - nodes[i - 1].lon) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(nodes[i - 1].lat * (Math.PI / 180)) *
        Math.cos(nodes[i].lat * (Math.PI / 180)) *
        Math.sin(dLon / 2) ** 2;
    total += 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return `${Math.round(total)} km`;
}

function buildRegion(nodes: OsmNode[]) {
  if (nodes.length === 0) return null;
  const lats = nodes.map((n) => n.lat);
  const lons = nodes.map((n) => n.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const pad = 0.01;
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: maxLat - minLat + pad * 2,
    longitudeDelta: maxLon - minLon + pad * 2,
  };
}

function sampleCoords(nodes: OsmNode[], maxPoints = 60): OsmNode[] {
  if (nodes.length <= maxPoints) return nodes;
  const step = Math.ceil(nodes.length / maxPoints);
  const sampled = nodes.filter((_, i) => i % step === 0);
  // Always keep first and last
  if (sampled[sampled.length - 1] !== nodes[nodes.length - 1]) {
    sampled.push(nodes[nodes.length - 1]);
  }
  return sampled;
}

function buildAutoWaypoints(nodes: OsmNode[], name: string) {
  if (nodes.length === 0) return [];
  const waypoints = [];
  waypoints.push({
    waypointKey: `osm-start`,
    name: `${name} — Trailhead`,
    description: "Trail start. Downloaded from OpenStreetMap.",
    waypointType: "start",
    latitude: nodes[0].lat,
    longitude: nodes[0].lon,
    sequenceNum: 0,
  });
  if (nodes.length > 2) {
    const mid = nodes[Math.floor(nodes.length / 2)];
    waypoints.push({
      waypointKey: `osm-mid`,
      name: "Midpoint",
      description: "Halfway point along the trail.",
      waypointType: "scenic",
      latitude: mid.lat,
      longitude: mid.lon,
      sequenceNum: 1,
    });
  }
  waypoints.push({
    waypointKey: `osm-end`,
    name: `${name} — End`,
    description: "Trail end. Source: © OpenStreetMap contributors (ODbL).",
    waypointType: "end",
    latitude: nodes[nodes.length - 1].lat,
    longitude: nodes[nodes.length - 1].lon,
    sequenceNum: 2,
  });
  return waypoints;
}

// ── Per-query sync ────────────────────────────────────────────────────────────

async function syncQuery(
  query: string,
  region: string,
  location: string
): Promise<{ imported: number; skipped: number; errors: number }> {
  const data = await fetchOverpass(query);
  const ways = data.elements.filter((el): el is OsmWay => el.type === "way" && "geometry" in el);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const way of ways) {
    const name =
      way.tags["name:en"] || way.tags.name;
    if (!name || way.geometry.length < 2) {
      skipped++;
      continue;
    }

    const nodes = way.geometry;
    const sampled = sampleCoords(nodes);
    const difficulty = estimateDifficulty(way.tags);
    const terrain = inferTerrain(way.tags);
    const distance = calcDistanceKm(nodes);
    const regionData = buildRegion(sampled);
    const waypoints = buildAutoWaypoints(sampled, name);

    const trailData: InsertTrail = {
      externalId: `osm-way-${way.id}`,
      source: "osm",
      status: "published",
      name,
      description: `Trail imported from OpenStreetMap. ${
        way.tags.description ?? ""
      }`.trim(),
      location,
      difficulty,
      terrain,
      distance,
      duration: null,
      elevation: way.tags.ele ? `${way.tags.ele} m` : null,
      accentColor: inferAccentColor(difficulty),
      approachFrom: region,
      osmAttribution: true,
      tags: way.tags,
      regionLat: regionData?.latitude ?? null,
      regionLng: regionData?.longitude ?? null,
      regionLatDelta: regionData?.latitudeDelta ?? null,
      regionLngDelta: regionData?.longitudeDelta ?? null,
    };

    try {
      await upsertOsmTrail({
        externalId: `osm-way-${way.id}`,
        trail: trailData,
        approachCoordinates: [],
        trailCoordinates: sampled.map((n) => ({ latitude: n.lat, longitude: n.lon })),
        waypoints,
      });
      imported++;
    } catch (err) {
      console.error(`OSM sync error for way ${way.id}:`, err);
      errors++;
    }
  }

  return { imported, skipped, errors };
}

// ── Public sync entry point ───────────────────────────────────────────────────

export interface SyncResult {
  totalImported: number;
  totalSkipped: number;
  totalErrors: number;
  regions: { region: string; imported: number; skipped: number; errors: number }[];
}

export async function runOsmSync(): Promise<SyncResult> {
  const queries = [
    { query: UAE_QUERY, region: "UAE", location: "UAE" },
    { query: MOAB_QUERY, region: "Moab, UT", location: "Moab, Utah" },
    { query: COLORADO_QUERY, region: "Colorado, CO", location: "Colorado" },
  ];

  const regions = [];
  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const { query, region, location } of queries) {
    console.log(`[OSM sync] Querying ${region}...`);
    try {
      const result = await syncQuery(query, region, location);
      regions.push({ region, ...result });
      totalImported += result.imported;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
      console.log(
        `[OSM sync] ${region}: ${result.imported} imported, ${result.skipped} skipped, ${result.errors} errors`
      );
    } catch (err) {
      console.error(`[OSM sync] Failed for region ${region}:`, err);
      regions.push({ region, imported: 0, skipped: 0, errors: 1 });
      totalErrors++;
    }
  }

  return { totalImported, totalSkipped, totalErrors, regions };
}
