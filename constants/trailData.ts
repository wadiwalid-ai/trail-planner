import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

export type WaypointType = "start" | "scenic" | "technical" | "water" | "camp" | "summit" | "end";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

// Shared waypoint styling — keep trail detail, Explore map and any other
// waypoint renderer visually consistent by sourcing colors/icons from here.
export const WP_CONFIG: Record<WaypointType, { color: string; icon: IoniconName; label: string }> = {
  start:     { color: "#2D6A4F", icon: "flag",     label: "Start"     },
  end:       { color: "#1B4332", icon: "flag",     label: "End"       },
  scenic:    { color: "#E8B74D", icon: "camera",   label: "Scenic"    },
  technical: { color: "#D4763B", icon: "warning",  label: "Technical" },
  water:     { color: "#3B82F6", icon: "water",    label: "Water"     },
  camp:      { color: "#9B59B6", icon: "moon",     label: "Camp"      },
  summit:    { color: "#C0392B", icon: "triangle", label: "Summit"    },
};

export const VALID_WAYPOINT_TYPES: WaypointType[] = [
  "start", "end", "scenic", "technical", "water", "camp", "summit",
];

export function toWaypointType(s: string): WaypointType {
  return VALID_WAYPOINT_TYPES.includes(s as WaypointType)
    ? (s as WaypointType)
    : "scenic";
}

// Maps an ordered waypoint to its planning marker shape: a start flag, an end
// flag, or an intermediate numbered diamond. Explicit "start"/"end" types win;
// otherwise position in the route decides (first = start, last = end). Shared
// across the record, trail detail and Explore map screens so a planned route
// looks identical everywhere.
export function wpVariant(
  idx: number,
  total: number,
  type?: WaypointType,
): "start" | "end" | "regular" {
  if (type === "start") return "start";
  if (type === "end") return "end";
  if (total <= 1 || idx === 0) return "start";
  if (idx === total - 1) return "end";
  return "regular";
}

// User-selectable waypoint categories. These drive a distinct glyph/colour on
// every map (planning, trail detail, Explore) and are serialised as the
// waypoint `type`. Kept in sync with the backend's VALID_WAYPOINT_TYPES
// (server/trails/routes.ts). Note: hazard/viewpoint/fuel are persisted by the
// backend but are NOT in the frontend WaypointType union, so the raw stored
// type must be consulted (via getWaypointCategoryMeta) rather than the coerced
// WaypointType.
export type WaypointCategory = "water" | "camp" | "hazard" | "viewpoint" | "fuel";

export const WAYPOINT_CATEGORY_META: Record<
  WaypointCategory,
  { label: string; glyph: IoniconName; color: string }
> = {
  water:     { label: "Water",     glyph: "water",     color: "#2D8CFF" },
  camp:      { label: "Campsite",  glyph: "bonfire",   color: "#E67E22" },
  hazard:    { label: "Hazard",    glyph: "warning",   color: "#E74C3C" },
  viewpoint: { label: "Viewpoint", glyph: "telescope", color: "#9B59B6" },
  fuel:      { label: "Fuel",      glyph: "flame",     color: "#16A085" },
};

const WAYPOINT_CATEGORY_KEYS = new Set<string>([
  "water", "camp", "hazard", "viewpoint", "fuel",
]);

// Returns the category glyph/colour for a stored waypoint type when it is one
// of the recognised categories (water/camp/hazard/viewpoint/fuel), else null so
// legacy/unknown types (start/end/scenic/technical/summit) keep their existing
// numbered-diamond / start-end-flag rendering. Pass the RAW stored type string
// here — not the coerced WaypointType, which collapses hazard/viewpoint/fuel to
// "scenic".
export function getWaypointCategoryMeta(
  rawType: string | null | undefined,
): { label: string; glyph: IoniconName; color: string } | null {
  if (rawType && WAYPOINT_CATEGORY_KEYS.has(rawType)) {
    return WAYPOINT_CATEGORY_META[rawType as WaypointCategory];
  }
  return null;
}

export interface TrailWaypoint {
  id: string;
  name: string;
  description: string;
  type: WaypointType;
  /**
   * The raw waypoint type as stored by the backend, before coercion to the
   * frontend WaypointType union. Preserved so map renderers can show the
   * category glyph for types absent from the union (hazard/viewpoint/fuel).
   */
  rawType?: string;
  coordinate: { latitude: number; longitude: number };
  elevation?: string;
}

export interface Trail {
  id: string;
  name: string;
  location: string;
  difficulty: number;
  terrain: string;
  distance: string;
  duration: string;
  accentColor: string;
  elevation?: string;
  description: string;
  activityType: string;
}

export interface TrailMapData {
  id: string;
  approachFrom: string;
  approachCoordinates: { latitude: number; longitude: number }[];
  trailCoordinates: { latitude: number; longitude: number }[];
  waypoints: TrailWaypoint[];
  region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
}

export const TRAILS: Trail[] = [
  {
    id: "1",
    name: "Hell's Revenge",
    location: "Moab, Utah",
    difficulty: 8,
    terrain: "Rock Crawling",
    distance: "12 mi",
    duration: "4–6 hrs",
    accentColor: "#D4763B",
    elevation: "4,763 ft",
    activityType: "offroad",
    description:
      "Iconic slickrock circuit through breathtaking red rock canyon country. Steep ledges, off-camber sections and Colorado River overlooks make this a Moab classic.",
  },
  {
    id: "2",
    name: "Rubicon Trail",
    location: "Georgetown, CA",
    difficulty: 7,
    terrain: "Rock & Forest",
    distance: "22 mi",
    duration: "2 days",
    accentColor: "#2D6A4F",
    elevation: "7,200 ft",
    activityType: "offroad",
    description:
      "California's most legendary off-road trail. Massive granite boulders, deep water crossings and dense pine forest across the Sierra Nevada.",
  },
  {
    id: "3",
    name: "Black Bear Pass",
    location: "Telluride, CO",
    difficulty: 9,
    terrain: "High Alpine",
    distance: "9.9 mi",
    duration: "3–4 hrs",
    accentColor: "#5B7DB1",
    elevation: "12,840 ft",
    activityType: "offroad",
    description:
      "Colorado's most technical high-alpine route. Extreme switchbacks, sheer cliff edges and stunning 12,840-ft passes. Expert drivers only — one way descent.",
  },
  {
    id: "4",
    name: "Dumont Dunes",
    location: "Baker, CA",
    difficulty: 4,
    terrain: "Sand Dunes",
    distance: "Open area",
    duration: "Full day",
    accentColor: "#E8B74D",
    elevation: "1,200 ft",
    activityType: "offroad",
    description:
      "A sprawling OHV area in the Mojave Desert. Towering sand dunes up to 400 ft for all skill levels with dedicated play areas.",
  },
  {
    id: "5",
    name: "Ouray Alpine Loop",
    location: "Ouray, CO",
    difficulty: 6,
    terrain: "Mountain",
    distance: "65 mi loop",
    duration: "5–7 hrs",
    accentColor: "#9B59B6",
    elevation: "12,800 ft",
    activityType: "offroad",
    description:
      "Sweeping mountain scenery across Engineer and Cinnamon passes. Historic mining sites, alpine meadows and dramatic ridge-line driving.",
  },
  {
    id: "6",
    name: "King of the Hammers",
    location: "Johnson Valley, CA",
    difficulty: 10,
    terrain: "Desert & Rock",
    distance: "35 mi",
    duration: "8–12 hrs",
    accentColor: "#C0392B",
    elevation: "5,200 ft",
    activityType: "offroad",
    description:
      "The world's toughest one-day off-road race. Desert wash at speed transitions into extreme rock crawling in the Hammers formation.",
  },
  {
    id: "7",
    name: "Wadi Shawka",
    location: "Ras Al Khaimah, UAE",
    difficulty: 5,
    terrain: "Wadi & Mountain",
    distance: "30 km",
    duration: "4–5 hrs",
    accentColor: "#2D6A4F",
    elevation: "650 m",
    activityType: "offroad",
    description:
      "A scenic wadi trail winding through the Hajar Mountains with crystal-clear rock pools, shaded canyons and technical rocky sections. Best Oct–Apr.",
  },
  {
    id: "8",
    name: "Wadi Bih",
    location: "RAK to Dibba, UAE",
    difficulty: 4,
    terrain: "Mountain Pass",
    distance: "35 km",
    duration: "3–4 hrs",
    accentColor: "#5B7DB1",
    elevation: "1,000 m",
    activityType: "offroad",
    description:
      "UAE's most popular mountain pass crossing. Paved start turns into gravel wash through dramatic Hajar gorges, ending on the Dibba coast.",
  },
  {
    id: "9",
    name: "Fossil Rock",
    location: "Sharjah, UAE",
    difficulty: 3,
    terrain: "Desert & Rock",
    distance: "15 km",
    duration: "2–3 hrs",
    accentColor: "#E8B74D",
    elevation: "200 m",
    activityType: "offroad",
    description:
      "Accessible desert loop around a dramatic rocky outcrop embedded with ancient marine fossils. Great for beginners and photography.",
  },
  {
    id: "10",
    name: "Jebel Jais Summit",
    location: "Ras Al Khaimah, UAE",
    difficulty: 6,
    terrain: "High Mountain",
    distance: "25 km",
    duration: "5–6 hrs",
    accentColor: "#9B59B6",
    elevation: "1,934 m",
    activityType: "offroad",
    description:
      "Drive to the UAE's highest peak on a mix of paved and graded gravel roads. Jaw-dropping Hajar panoramas and cool mountain temperatures.",
  },
  {
    id: "11",
    name: "Hatta Rock Pools",
    location: "Hatta, Dubai",
    difficulty: 4,
    terrain: "Wadi & Rock",
    distance: "20 km",
    duration: "3–4 hrs",
    accentColor: "#D4763B",
    elevation: "400 m",
    activityType: "offroad",
    description:
      "Turquoise rock pools inside a dramatic wadi canyon on the Dubai–Oman border. Rocky descents, water crossings and stunning scenery.",
  },
  {
    id: "12",
    name: "Al Qua' Dunes",
    location: "Abu Dhabi, UAE",
    difficulty: 10,
    terrain: "Sand Dunes",
    distance: "Open area",
    duration: "Full day",
    accentColor: "#C0392B",
    elevation: "300 m dunes",
    activityType: "offroad",
    description:
      "UAE's most extreme dune driving. Towering 300m mega-dunes near Liwa Oasis. Home of the famous Moreeb Hill (Tal Moreeb) race. Mandatory convoy, recovery gear and experienced lead driver.",
  },
];

export const TRAIL_MAP_DATA: Record<string, TrailMapData> = {
  // ── Hell's Revenge — Sand Flats Recreation Area, Moab UT ──────────────────
  // Trailhead: 38.5753, -109.5226 (Sand Flats Rd, past fee station)
  "1": {
    id: "1",
    approachFrom: "Moab, UT",
    approachCoordinates: [
      { latitude: 38.5735, longitude: -109.5499 }, // Moab downtown
      { latitude: 38.5720, longitude: -109.5430 }, // 400 E St
      { latitude: 38.5728, longitude: -109.5340 }, // Sand Flats Rd turn
      { latitude: 38.5738, longitude: -109.5280 }, // Along Sand Flats Rd
      { latitude: 38.5748, longitude: -109.5250 }, // Near fee station
      { latitude: 38.5753, longitude: -109.5226 }, // Trailhead
    ],
    trailCoordinates: [
      { latitude: 38.5753, longitude: -109.5226 }, // Trailhead
      { latitude: 38.5722, longitude: -109.5180 },
      { latitude: 38.5688, longitude: -109.5115 },
      { latitude: 38.5648, longitude: -109.5052 },
      { latitude: 38.5610, longitude: -109.5002 }, // Hell's Gate approach
      { latitude: 38.5575, longitude: -109.4972 }, // Mickey's Hot Tub
      { latitude: 38.5545, longitude: -109.4958 }, // Colorado River rim
      { latitude: 38.5515, longitude: -109.4978 }, // Tip-Over Challenge
      { latitude: 38.5498, longitude: -109.5048 },
      { latitude: 38.5522, longitude: -109.5130 },
      { latitude: 38.5575, longitude: -109.5185 },
      { latitude: 38.5640, longitude: -109.5215 },
      { latitude: 38.5700, longitude: -109.5225 },
      { latitude: 38.5753, longitude: -109.5226 }, // Back to TH
    ],
    waypoints: [
      {
        id: "1-s",
        name: "Sand Flats Trailhead",
        description: "Register at the kiosk. Self-issue day-use permit ($5). Check tire pressure and diff-lock.",
        type: "start",
        coordinate: { latitude: 38.5753, longitude: -109.5226 },
        elevation: "4,458 ft",
      },
      {
        id: "1-p1",
        name: "Dinosaur Tracks",
        description: "50+ dinosaur footprints protected in the slickrock — about 0.5mi from TH.",
        type: "scenic",
        coordinate: { latitude: 38.5722, longitude: -109.5180 },
        elevation: "4,480 ft",
      },
      {
        id: "1-p2",
        name: "Mickey's Hot Tub",
        description: "Iconic natural pothole — the only open water on the trail. Optional rock slide into it.",
        type: "water",
        coordinate: { latitude: 38.5575, longitude: -109.4972 },
        elevation: "4,520 ft",
      },
      {
        id: "1-p3",
        name: "Hell's Gate",
        description: "The notorious V-notch descent. Diff-lock required. Use a spotter — no recovery possible mid-section.",
        type: "technical",
        coordinate: { latitude: 38.5610, longitude: -109.5002 },
        elevation: "4,560 ft",
      },
      {
        id: "1-p4",
        name: "Colorado River Overlook",
        description: "Staggering 600-ft drop to the Colorado River. Best panoramic view on the trail.",
        type: "scenic",
        coordinate: { latitude: 38.5545, longitude: -109.4958 },
        elevation: "4,763 ft",
      },
      {
        id: "1-p5",
        name: "Tip-Over Challenge",
        description: "30° off-camber slickrock ledge. Commit fully and keep momentum — stopping is dangerous.",
        type: "technical",
        coordinate: { latitude: 38.5515, longitude: -109.4978 },
        elevation: "4,630 ft",
      },
      {
        id: "1-e",
        name: "Loop Complete",
        description: "Loop rejoins Sand Flats Rd. Re-inflate tires. Slickrock Bike Trail crosses here — yield to cyclists.",
        type: "end",
        coordinate: { latitude: 38.5753, longitude: -109.5226 },
        elevation: "4,458 ft",
      },
    ],
    region: {
      latitude: 38.564,
      longitude: -109.509,
      latitudeDelta: 0.030,
      longitudeDelta: 0.042,
    },
  },

  // ── Rubicon Trail — El Dorado/Sierra Nevada, CA ───────────────────────────
  // Loon Lake Trailhead: 39.003350, -120.312450 (west end of trail)
  // East end (Tahoe): 39.02745, -120.10029
  "2": {
    id: "2",
    approachFrom: "Georgetown, CA",
    approachCoordinates: [
      { latitude: 38.910, longitude: -120.893 }, // Georgetown
      { latitude: 38.914, longitude: -120.600 }, // Ice House Rd junction
      { latitude: 38.814, longitude: -120.375 }, // Ice House Resort
      { latitude: 38.986, longitude: -120.330 }, // Trailer parking
      { latitude: 39.003, longitude: -120.311 }, // Loon Lake Dam
      { latitude: 39.003, longitude: -120.312 }, // Trailhead
    ],
    trailCoordinates: [
      { latitude: 39.003, longitude: -120.312 }, // Loon Lake TH
      { latitude: 39.003, longitude: -120.285 }, // Past dam heading east
      { latitude: 39.004, longitude: -120.255 },
      { latitude: 39.007, longitude: -120.224 }, // Wentworth Springs junction
      { latitude: 39.010, longitude: -120.195 }, // Rubicon Springs area
      { latitude: 39.014, longitude: -120.167 },
      { latitude: 39.018, longitude: -120.143 }, // Soup Bowl area
      { latitude: 39.022, longitude: -120.115 }, // Buck Island Lake
      { latitude: 39.025, longitude: -120.108 },
      { latitude: 39.027, longitude: -120.100 }, // East terminus
    ],
    waypoints: [
      {
        id: "2-s",
        name: "Loon Lake Trailhead",
        description: "Western terminus at 6,331 ft elevation. Fuel up — no services for 22 miles.",
        type: "start",
        coordinate: { latitude: 39.003, longitude: -120.312 },
        elevation: "6,331 ft",
      },
      {
        id: "2-p1",
        name: "Rubicon Springs Camp",
        description: "Historic hot springs and established camp. Great mid-trail stop with seasonal water.",
        type: "camp",
        coordinate: { latitude: 39.010, longitude: -120.195 },
        elevation: "5,350 ft",
      },
      {
        id: "2-p2",
        name: "Soup Bowl",
        description: "Deep granite bowl with massive boulders and ledges. High-lift jack and lockers required.",
        type: "technical",
        coordinate: { latitude: 39.018, longitude: -120.143 },
        elevation: "5,200 ft",
      },
      {
        id: "2-p3",
        name: "Buck Island Lake",
        description: "Stunning alpine lake — perfect lunch stop. Camping available nearby.",
        type: "scenic",
        coordinate: { latitude: 39.022, longitude: -120.115 },
        elevation: "6,400 ft",
      },
      {
        id: "2-e",
        name: "Meeks Bay End",
        description: "Eastern terminus near Lake Tahoe. Pavement resumes. Secure vehicle retrieval point.",
        type: "end",
        coordinate: { latitude: 39.027, longitude: -120.100 },
        elevation: "6,240 ft",
      },
    ],
    region: {
      latitude: 39.015,
      longitude: -120.207,
      latitudeDelta: 0.060,
      longitudeDelta: 0.260,
    },
  },

  // ── Black Bear Pass — San Juan Mountains / Telluride, CO ─────────────────
  // Trailhead: 37.8967, -107.7133 (Red Mountain Pass on US-550)
  // Summit: 37.8995, -107.7430
  // Bridal Veil: 37.9206, -107.7454
  // Telluride end: ~37.939, -107.808
  "3": {
    id: "3",
    approachFrom: "Silverton, CO",
    approachCoordinates: [
      { latitude: 37.812, longitude: -107.665 }, // Silverton
      { latitude: 37.835, longitude: -107.675 },
      { latitude: 37.862, longitude: -107.690 },
      { latitude: 37.885, longitude: -107.706 },
      { latitude: 37.897, longitude: -107.713 }, // Red Mountain Pass TH
    ],
    trailCoordinates: [
      { latitude: 37.897, longitude: -107.713 }, // Red Mountain Pass TH
      { latitude: 37.898, longitude: -107.725 },
      { latitude: 37.900, longitude: -107.743 }, // Black Bear Pass Summit (12,840 ft)
      { latitude: 37.904, longitude: -107.750 }, // Black Bear Lake area
      { latitude: 37.908, longitude: -107.752 }, // One-way sign / point of no return
      { latitude: 37.913, longitude: -107.750 }, // The Steps (hardest section)
      { latitude: 37.918, longitude: -107.748 },
      { latitude: 37.921, longitude: -107.745 }, // Bridal Veil Falls overlook
      { latitude: 37.928, longitude: -107.762 },
      { latitude: 37.934, longitude: -107.782 },
      { latitude: 37.939, longitude: -107.808 }, // Telluride end
    ],
    waypoints: [
      {
        id: "3-s",
        name: "Red Mountain Pass Trailhead",
        description: "One-way trail — descent toward Telluride only. 11,018 ft start. Check brakes.",
        type: "start",
        coordinate: { latitude: 37.897, longitude: -107.713 },
        elevation: "11,018 ft",
      },
      {
        id: "3-p1",
        name: "Black Bear Pass Summit",
        description: "Trail's highest point at 12,840 ft. Spectacular San Juan panorama.",
        type: "summit",
        coordinate: { latitude: 37.900, longitude: -107.743 },
        elevation: "12,840 ft",
      },
      {
        id: "3-p2",
        name: "Point of No Return",
        description: "One-way sign — once past here you cannot reverse. Commit to completing the descent.",
        type: "scenic",
        coordinate: { latitude: 37.908, longitude: -107.752 },
        elevation: "12,200 ft",
      },
      {
        id: "3-p3",
        name: "The Steps",
        description: "Legendary stepped switchbacks above Telluride. Extreme exposure — sheer cliff on left. Spotter mandatory.",
        type: "technical",
        coordinate: { latitude: 37.913, longitude: -107.750 },
        elevation: "11,500 ft",
      },
      {
        id: "3-p4",
        name: "Bridal Veil Falls Overlook",
        description: "Colorado's tallest free-fall waterfall (365 ft) directly below the road. Breathtaking.",
        type: "scenic",
        coordinate: { latitude: 37.921, longitude: -107.745 },
        elevation: "10,800 ft",
      },
      {
        id: "3-e",
        name: "Telluride Town End",
        description: "Trail ends in downtown Telluride at ~8,750 ft. Well done — celebrate accordingly.",
        type: "end",
        coordinate: { latitude: 37.939, longitude: -107.808 },
        elevation: "8,750 ft",
      },
    ],
    region: {
      latitude: 37.918,
      longitude: -107.762,
      latitudeDelta: 0.062,
      longitudeDelta: 0.125,
    },
  },

  // ── Dumont Dunes OHV — San Bernardino County, CA ─────────────────────────
  // Main OHV area: 35.69138, -116.23890 (official BLM coordinates)
  "4": {
    id: "4",
    approachFrom: "Baker, CA",
    approachCoordinates: [
      { latitude: 35.264, longitude: -116.072 }, // Baker on I-15
      { latitude: 35.370, longitude: -116.098 }, // Hwy 127 south
      { latitude: 35.480, longitude: -116.130 },
      { latitude: 35.580, longitude: -116.175 },
      { latitude: 35.647, longitude: -116.215 },
      { latitude: 35.675, longitude: -116.232 }, // Dunes access road
      { latitude: 35.691, longitude: -116.239 }, // OHV staging area
    ],
    trailCoordinates: [
      { latitude: 35.691, longitude: -116.239 }, // Staging area
      { latitude: 35.697, longitude: -116.233 },
      { latitude: 35.702, longitude: -116.226 }, // Dune face
      { latitude: 35.706, longitude: -116.221 }, // Summit area
      { latitude: 35.709, longitude: -116.230 },
      { latitude: 35.706, longitude: -116.242 }, // North dune area
      { latitude: 35.700, longitude: -116.249 }, // West side
      { latitude: 35.693, longitude: -116.245 },
      { latitude: 35.691, longitude: -116.239 }, // Back to staging
    ],
    waypoints: [
      {
        id: "4-s",
        name: "OHV Staging Area",
        description: "BLM area — no fee. Lower tire pressure to 12–15 PSI before entering dunes.",
        type: "start",
        coordinate: { latitude: 35.691, longitude: -116.239 },
        elevation: "760 ft",
      },
      {
        id: "4-p1",
        name: "Main Dune Face",
        description: "400-ft primary dune face. Approach straight on the ridgeline — never sideways.",
        type: "technical",
        coordinate: { latitude: 35.702, longitude: -116.226 },
        elevation: "1,050 ft",
      },
      {
        id: "4-p2",
        name: "Summit Lookout",
        description: "Panorama of the Mojave Desert. Amargosa River valley visible to the east.",
        type: "scenic",
        coordinate: { latitude: 35.706, longitude: -116.221 },
        elevation: "1,180 ft",
      },
      {
        id: "4-e",
        name: "Return to Staging",
        description: "Re-inflate tires to street pressure before driving out on Hwy 127.",
        type: "end",
        coordinate: { latitude: 35.691, longitude: -116.239 },
        elevation: "760 ft",
      },
    ],
    region: {
      latitude: 35.699,
      longitude: -116.235,
      latitudeDelta: 0.035,
      longitudeDelta: 0.048,
    },
  },

  // ── Ouray Alpine Loop — San Juan Mountains, CO ───────────────────────────
  // Ouray: 38.023, -107.671 | Engineer Pass: 37.9815, -107.5917
  "5": {
    id: "5",
    approachFrom: "Ouray, CO",
    approachCoordinates: [
      { latitude: 38.023, longitude: -107.671 }, // Ouray town center
      { latitude: 38.018, longitude: -107.658 }, // US-550 south
      { latitude: 38.010, longitude: -107.645 }, // 4WD gate off pavement
    ],
    trailCoordinates: [
      { latitude: 38.010, longitude: -107.645 }, // 4WD gate start
      { latitude: 38.002, longitude: -107.630 },
      { latitude: 37.995, longitude: -107.614 }, // Engineer Mine area
      { latitude: 37.988, longitude: -107.600 },
      { latitude: 37.982, longitude: -107.592 }, // Engineer Pass summit (12,800 ft)
      { latitude: 37.978, longitude: -107.578 }, // Descent toward Lake City
      { latitude: 37.970, longitude: -107.555 }, // American Flats
      { latitude: 37.962, longitude: -107.520 },
      { latitude: 37.950, longitude: -107.490 },
      { latitude: 37.940, longitude: -107.468 }, // Animas Forks ghost town
      { latitude: 37.933, longitude: -107.575 }, // Toward Silverton side
    ],
    waypoints: [
      {
        id: "5-s",
        name: "Ouray Alpine Loop Gate",
        description: "4WD-only gate south of Ouray. Alpine Loop permit required Jun–Sep.",
        type: "start",
        coordinate: { latitude: 38.010, longitude: -107.645 },
        elevation: "9,600 ft",
      },
      {
        id: "5-p1",
        name: "Engineer Mine",
        description: "Historic silver mine ruins from the 1870s. Fascinating industrial heritage.",
        type: "scenic",
        coordinate: { latitude: 37.995, longitude: -107.614 },
        elevation: "11,200 ft",
      },
      {
        id: "5-p2",
        name: "Engineer Pass",
        description: "12,800 ft summit. Expansive San Juan panorama. Snow possible Jun–Sep — check conditions.",
        type: "summit",
        coordinate: { latitude: 37.982, longitude: -107.592 },
        elevation: "12,800 ft",
      },
      {
        id: "5-p3",
        name: "American Flats",
        description: "Wide alpine meadow with summer wildflowers. Great dispersed camping.",
        type: "camp",
        coordinate: { latitude: 37.970, longitude: -107.555 },
        elevation: "12,100 ft",
      },
      {
        id: "5-p4",
        name: "Animas Forks Ghost Town",
        description: "Preserved 1870s mining town at the valley junction. Multiple loop route options.",
        type: "scenic",
        coordinate: { latitude: 37.940, longitude: -107.468 },
        elevation: "11,200 ft",
      },
      {
        id: "5-e",
        name: "Lake City End",
        description: "Loop completes at Lake City (8,671 ft). Fuel and lodging available.",
        type: "end",
        coordinate: { latitude: 38.029, longitude: -107.314 },
        elevation: "8,671 ft",
      },
    ],
    region: {
      latitude: 37.990,
      longitude: -107.530,
      latitudeDelta: 0.120,
      longitudeDelta: 0.420,
    },
  },

  // ── King of the Hammers — Johnson Valley OHV, CA ─────────────────────────
  // Hammertown: 34.3733, -116.5605 | Jackhammer TH: 34.4145, -116.4744
  "6": {
    id: "6",
    approachFrom: "Yucca Valley, CA",
    approachCoordinates: [
      { latitude: 34.114, longitude: -116.432 }, // Yucca Valley
      { latitude: 34.175, longitude: -116.460 }, // Hwy 247 north
      { latitude: 34.240, longitude: -116.498 }, // Old Woman Springs Rd
      { latitude: 34.310, longitude: -116.535 }, // Johnson Valley approach
      { latitude: 34.373, longitude: -116.561 }, // Hammertown
    ],
    trailCoordinates: [
      { latitude: 34.373, longitude: -116.561 }, // Hammertown HQ
      { latitude: 34.388, longitude: -116.548 }, // Desert wash start
      { latitude: 34.406, longitude: -116.528 }, // Backdoor section
      { latitude: 34.415, longitude: -116.474 }, // Jackhammer/Sledgehammer area
      { latitude: 34.437, longitude: -116.475 }, // Claw Hammer area
      { latitude: 34.445, longitude: -116.452 },
      { latitude: 34.423, longitude: -116.435 }, // Aftershock TH area
      { latitude: 34.410, longitude: -116.460 }, // Rock crawling section
      { latitude: 34.390, longitude: -116.490 }, // The Pit
      { latitude: 34.375, longitude: -116.520 },
      { latitude: 34.373, longitude: -116.561 }, // Hammertown finish
    ],
    waypoints: [
      {
        id: "6-s",
        name: "Hammertown Start",
        description: "Race HQ / spectator city at 34.3733°N 116.5605°W. Sign waivers. Convoy briefing at 6 AM.",
        type: "start",
        coordinate: { latitude: 34.373, longitude: -116.561 },
        elevation: "2,800 ft",
      },
      {
        id: "6-p1",
        name: "Backdoor Desert Wash",
        description: "Opening high-speed desert wash section. Massive whoops at race speeds.",
        type: "technical",
        coordinate: { latitude: 34.406, longitude: -116.528 },
        elevation: "3,050 ft",
      },
      {
        id: "6-p2",
        name: "Jackhammer",
        description: "First major rock obstacle. Named for the pounding your vehicle takes.",
        type: "technical",
        coordinate: { latitude: 34.415, longitude: -116.474 },
        elevation: "3,100 ft",
      },
      {
        id: "6-p3",
        name: "Chocolate Thunder",
        description: "Signature dark granite canyon crawl. 3-point turns required. Most photographed section.",
        type: "technical",
        coordinate: { latitude: 34.423, longitude: -116.435 },
        elevation: "3,400 ft",
      },
      {
        id: "6-p4",
        name: "The Pit",
        description: "Deep rock drop section. Extreme ledges — front-end damage common without proper approach.",
        type: "technical",
        coordinate: { latitude: 34.390, longitude: -116.490 },
        elevation: "3,200 ft",
      },
      {
        id: "6-e",
        name: "Hammertown Finish",
        description: "Finish line at Hammertown. You survived King of the Hammers.",
        type: "end",
        coordinate: { latitude: 34.373, longitude: -116.561 },
        elevation: "2,800 ft",
      },
    ],
    region: {
      latitude: 34.405,
      longitude: -116.500,
      latitudeDelta: 0.110,
      longitudeDelta: 0.175,
    },
  },

  // ── Wadi Shawka — Hajar Mountains, Ras Al Khaimah ────────────────────────
  // Shawka Dam parking: 25.104249, 56.046542 (verified GPS from field reports)
  // Pools entry: 25.094675, 56.065871
  // Campsite C1: 25.097887, 56.112270
  // Wadi Al Ijeli far end: 25.047862, 56.145681
  "7": {
    id: "7",
    approachFrom: "Dubai",
    approachCoordinates: [
      { latitude: 25.204, longitude: 55.270 }, // Dubai (Bur Dubai)
      { latitude: 25.250, longitude: 55.385 }, // Sharjah area
      { latitude: 25.286, longitude: 55.610 }, // E611 / Al Dhaid direction
      { latitude: 25.240, longitude: 55.790 }, // E102 Sharjah-Kalba Rd
      { latitude: 25.200, longitude: 55.900 }, // Toward mountains
      { latitude: 25.166, longitude: 55.985 }, // Foothills
      { latitude: 25.132, longitude: 56.025 }, // Shawka village approach
      { latitude: 25.104, longitude: 56.047 }, // Shawka Dam trailhead
    ],
    trailCoordinates: [
      { latitude: 25.104, longitude: 56.047 }, // Shawka Dam parking (verified)
      { latitude: 25.102, longitude: 56.055 },
      { latitude: 25.102, longitude: 56.060 }, // Pool parking (4x4 drive-up)
      { latitude: 25.098, longitude: 56.066 }, // Pools entry (verified)
      { latitude: 25.096, longitude: 56.075 },
      { latitude: 25.096, longitude: 56.085 },
      { latitude: 25.097, longitude: 56.095 },
      { latitude: 25.096, longitude: 56.104 }, // Campsite C2 (verified)
      { latitude: 25.097, longitude: 56.112 }, // Campsite C1 (verified)
      { latitude: 25.094, longitude: 56.122 },
      { latitude: 25.091, longitude: 56.133 },
      { latitude: 25.088, longitude: 56.143 },
      { latitude: 25.086, longitude: 56.152 }, // Upper wadi end
    ],
    waypoints: [
      {
        id: "7-s",
        name: "Shawka Dam Trailhead",
        description: "Park at Shawka Dam (25.1042°N 56.0465°E). Deflate to 18–22 PSI. 4L recommended for the rocky sections.",
        type: "start",
        coordinate: { latitude: 25.104, longitude: 56.047 },
        elevation: "130 m",
      },
      {
        id: "7-p1",
        name: "Lower Gravel Wash",
        description: "Wide gravel wadi floor — ideal warm-up section. Good visibility ahead.",
        type: "scenic",
        coordinate: { latitude: 25.102, longitude: 56.060 },
        elevation: "160 m",
      },
      {
        id: "7-p2",
        name: "Rock Pools Entry",
        description: "Crystal-clear natural pools — the highlight of the wadi. Swimming spot Oct–Apr.",
        type: "water",
        coordinate: { latitude: 25.095, longitude: 56.066 },
        elevation: "200 m",
      },
      {
        id: "7-p3",
        name: "Rock Garden",
        description: "Technical rocky scramble through large boulders. Low range, slow and steady. Lines matter.",
        type: "technical",
        coordinate: { latitude: 25.096, longitude: 56.085 },
        elevation: "330 m",
      },
      {
        id: "7-p4",
        name: "Mountain Campsite",
        description: "Established campsite perched above the wadi with stunning mountain views. C1 at 56.112°E.",
        type: "camp",
        coordinate: { latitude: 25.097, longitude: 56.112 },
        elevation: "450 m",
      },
      {
        id: "7-p5",
        name: "Upper Canyon Narrows",
        description: "Wadi walls narrow dramatically. Impressive layered geology and echo acoustics.",
        type: "scenic",
        coordinate: { latitude: 25.091, longitude: 56.133 },
        elevation: "540 m",
      },
      {
        id: "7-e",
        name: "Upper Wadi End",
        description: "Upper end of the navigable wadi track. Turnaround point. Re-inflate before return.",
        type: "end",
        coordinate: { latitude: 25.086, longitude: 56.152 },
        elevation: "640 m",
      },
    ],
    region: {
      latitude: 25.076,
      longitude: 56.097,
      latitudeDelta: 0.075,
      longitudeDelta: 0.120,
    },
  },

  // ── Wadi Bih — RAK → Dibba mountain crossing ─────────────────────────────
  // RAK Trailhead: 25.7760, 56.0500 | Pass: 25.7330, 56.1700 | Dibba: ~25.620, 56.268
  "8": {
    id: "8",
    approachFrom: "RAK City",
    approachCoordinates: [
      { latitude: 25.670, longitude: 55.761 }, // RAK City
      { latitude: 25.703, longitude: 55.820 }, // E11 northeast
      { latitude: 25.724, longitude: 55.880 }, // Khatt road
      { latitude: 25.750, longitude: 55.960 }, // Mountain approach
      { latitude: 25.765, longitude: 56.020 }, // Pre-trailhead
      { latitude: 25.776, longitude: 56.050 }, // Wadi Bih RAK trailhead
    ],
    trailCoordinates: [
      { latitude: 25.776, longitude: 56.050 }, // RAK trailhead (verified)
      { latitude: 25.760, longitude: 56.095 }, // Wadi Bih entry RAK side (verified)
      { latitude: 25.748, longitude: 56.122 },
      { latitude: 25.740, longitude: 56.145 },
      { latitude: 25.733, longitude: 56.170 }, // Mountain pass ~1,000m (verified)
      { latitude: 25.727, longitude: 56.198 },
      { latitude: 25.720, longitude: 56.230 }, // Omani checkpoint area (verified)
      { latitude: 25.710, longitude: 56.270 }, // Zighi Village (verified)
      { latitude: 25.685, longitude: 56.271 },
      { latitude: 25.655, longitude: 56.269 },
      { latitude: 25.621, longitude: 56.268 }, // Dibba Al Hisn exit
    ],
    waypoints: [
      {
        id: "8-s",
        name: "Wadi Bih RAK Trailhead",
        description: "Off E18 past the military base. Signed entry point on the RAK side.",
        type: "start",
        coordinate: { latitude: 25.776, longitude: 56.050 },
        elevation: "80 m",
      },
      {
        id: "8-p1",
        name: "Lower Wadi Gorge",
        description: "Deep canyon with towering Hajar limestone walls. Dramatic and photogenic.",
        type: "scenic",
        coordinate: { latitude: 25.748, longitude: 56.122 },
        elevation: "350 m",
      },
      {
        id: "8-p2",
        name: "Seasonal Stream Crossing",
        description: "Winter/spring water flow can be significant — scout depth before crossing.",
        type: "water",
        coordinate: { latitude: 25.740, longitude: 56.145 },
        elevation: "520 m",
      },
      {
        id: "8-p3",
        name: "Mountain Pass Summit",
        description: "Highest point at ~1,000m. Views west to RAK and east to the Gulf of Oman coastline.",
        type: "summit",
        coordinate: { latitude: 25.733, longitude: 56.170 },
        elevation: "1,000 m",
      },
      {
        id: "8-p4",
        name: "Descent Switchbacks",
        description: "Steep hairpin descent on the Dibba side. Low range and engine braking. Loose stones.",
        type: "technical",
        coordinate: { latitude: 25.710, longitude: 56.270 },
        elevation: "600 m",
      },
      {
        id: "8-e",
        name: "Dibba Al Hisn Exit",
        description: "Trail emerges at Dibba (Fujairah side). Beach and restaurants 5 min away.",
        type: "end",
        coordinate: { latitude: 25.621, longitude: 56.268 },
        elevation: "10 m",
      },
    ],
    region: {
      latitude: 25.699,
      longitude: 56.159,
      latitudeDelta: 0.200,
      longitudeDelta: 0.260,
    },
  },

  // ── Fossil Rock (Jebel Maleihah) — Sharjah desert, UAE ──────────────────
  // Summit/parking: 25.16747, 55.84158 (verified GPS)
  "9": {
    id: "9",
    approachFrom: "Dubai",
    approachCoordinates: [
      { latitude: 25.204, longitude: 55.270 }, // Dubai
      { latitude: 25.280, longitude: 55.440 }, // Sharjah / E611
      { latitude: 25.285, longitude: 55.693 }, // Al Dhaid area
      { latitude: 25.248, longitude: 55.756 }, // E102 Sharjah-Kalba Rd
      { latitude: 25.210, longitude: 55.800 },
      { latitude: 25.167, longitude: 55.842 }, // Fossil Rock parking
    ],
    trailCoordinates: [
      { latitude: 25.167, longitude: 55.842 }, // Trailhead parking (verified)
      { latitude: 25.170, longitude: 55.848 }, // East sand approach
      { latitude: 25.174, longitude: 55.849 },
      { latitude: 25.177, longitude: 55.845 }, // Northeast face
      { latitude: 25.176, longitude: 55.839 }, // Fossil beds (north face)
      { latitude: 25.173, longitude: 55.835 }, // Summit view area
      { latitude: 25.169, longitude: 55.835 },
      { latitude: 25.165, longitude: 55.838 }, // Southwest return
      { latitude: 25.167, longitude: 55.842 }, // Back to parking
    ],
    waypoints: [
      {
        id: "9-s",
        name: "Roadside Trailhead",
        description: "Park on E102 shoulder (25.1675°N 55.8416°E). Deflate to 18 PSI for sandy approach.",
        type: "start",
        coordinate: { latitude: 25.167, longitude: 55.842 },
        elevation: "150 m",
      },
      {
        id: "9-p1",
        name: "East Sand Approach",
        description: "Sandy desert approach to the rock base. Steady momentum — soft sand patches.",
        type: "technical",
        coordinate: { latitude: 25.170, longitude: 55.848 },
        elevation: "165 m",
      },
      {
        id: "9-p2",
        name: "Fossil Beds",
        description: "80 million-year-old marine fossils visible in the exposed limestone — ancient seashells and coral.",
        type: "scenic",
        coordinate: { latitude: 25.176, longitude: 55.839 },
        elevation: "180 m",
      },
      {
        id: "9-p3",
        name: "Rock Summit",
        description: "360° desert panorama at 200m. Hajar Mountains visible NE, Dubai skyline SW on clear days.",
        type: "summit",
        coordinate: { latitude: 25.173, longitude: 55.835 },
        elevation: "200 m",
      },
      {
        id: "9-e",
        name: "Loop Return",
        description: "Complete the loop back to E102 parking. Re-inflate before the asphalt drive.",
        type: "end",
        coordinate: { latitude: 25.167, longitude: 55.842 },
        elevation: "150 m",
      },
    ],
    region: {
      latitude: 25.172,
      longitude: 55.842,
      latitudeDelta: 0.022,
      longitudeDelta: 0.032,
    },
  },

  // ── Jebel Jais Summit — Northern Hajar, Ras Al Khaimah ──────────────────
  // Summit: 25.9437, 56.1404 (verified GPS — UAE's highest peak)
  // Adventure park base area: ~25.880, 56.075
  "10": {
    id: "10",
    approachFrom: "RAK City",
    approachCoordinates: [
      { latitude: 25.670, longitude: 55.761 }, // RAK City
      { latitude: 25.710, longitude: 55.800 }, // E11 northeast
      { latitude: 25.746, longitude: 55.865 }, // Toward Jais road
      { latitude: 25.793, longitude: 55.938 },
      { latitude: 25.833, longitude: 56.015 }, // Mountain road
      { latitude: 25.868, longitude: 56.058 }, // Adventure park approach
      { latitude: 25.880, longitude: 56.075 }, // Jais Adventure area
    ],
    trailCoordinates: [
      { latitude: 25.880, longitude: 56.075 }, // Adventure park / trail start
      { latitude: 25.892, longitude: 56.087 },
      { latitude: 25.901, longitude: 56.095 }, // First hairpin viewpoint
      { latitude: 25.909, longitude: 56.105 }, // Technical rocky section
      { latitude: 25.916, longitude: 56.112 },
      { latitude: 25.924, longitude: 56.120 }, // Cloud level
      { latitude: 25.931, longitude: 56.127 }, // Near summit plateau
      { latitude: 25.938, longitude: 56.134 },
      { latitude: 25.944, longitude: 56.140 }, // Jebel Jais summit (verified)
    ],
    waypoints: [
      {
        id: "10-s",
        name: "Jais Adventure Base",
        description: "Start at the Jebel Jais Adventure Park (25.880°N 56.075°E, ~500m). Facilities and water available.",
        type: "start",
        coordinate: { latitude: 25.880, longitude: 56.075 },
        elevation: "500 m",
      },
      {
        id: "10-p1",
        name: "Hairpin Ridge Viewpoint",
        description: "First panorama — RAK coastline and the Gulf visible on clear days.",
        type: "scenic",
        coordinate: { latitude: 25.901, longitude: 56.095 },
        elevation: "900 m",
      },
      {
        id: "10-p2",
        name: "Technical Rocky Section",
        description: "Loose shale and boulders on the upper track. 4L recommended. Tyre sidewalls at risk.",
        type: "technical",
        coordinate: { latitude: 25.909, longitude: 56.105 },
        elevation: "1,250 m",
      },
      {
        id: "10-p3",
        name: "Cloud Ridge",
        description: "Often shrouded in cloud above 1,600m. Temperature drops to under 15°C even in summer.",
        type: "scenic",
        coordinate: { latitude: 25.924, longitude: 56.120 },
        elevation: "1,600 m",
      },
      {
        id: "10-p4",
        name: "Near Summit Plateau",
        description: "Oman border visible. Musandam peninsula and Strait of Hormuz on clear days.",
        type: "scenic",
        coordinate: { latitude: 25.931, longitude: 56.127 },
        elevation: "1,800 m",
      },
      {
        id: "10-e",
        name: "Jebel Jais Summit",
        description: "UAE's highest accessible peak at 1,934m (25.9437°N 56.1404°E). Sign the summit register.",
        type: "summit",
        coordinate: { latitude: 25.944, longitude: 56.140 },
        elevation: "1,934 m",
      },
    ],
    region: {
      latitude: 25.808,
      longitude: 55.952,
      latitudeDelta: 0.360,
      longitudeDelta: 0.460,
    },
  },

  // ── Hatta Rock Pools — Hatta, Dubai enclave ──────────────────────────────
  // Rock Pools: 24.787, 56.114 (verified GPS) | Hatta Dam: 24.801, 56.111
  "11": {
    id: "11",
    approachFrom: "Dubai",
    approachCoordinates: [
      { latitude: 25.197, longitude: 55.280 }, // Dubai (Oud Metha)
      { latitude: 25.100, longitude: 55.450 }, // E44 Dubai-Hatta Rd
      { latitude: 24.988, longitude: 55.643 },
      { latitude: 24.906, longitude: 55.810 }, // Lahbab desert area
      { latitude: 24.855, longitude: 55.965 }, // Hatta border crossing
      { latitude: 24.810, longitude: 56.080 }, // Hatta heritage area
      { latitude: 24.787, longitude: 56.114 }, // Rock Pools parking
    ],
    trailCoordinates: [
      { latitude: 24.787, longitude: 56.114 }, // Rock Pools parking (verified)
      { latitude: 24.781, longitude: 56.107 }, // Into wadi
      { latitude: 24.774, longitude: 56.096 }, // Canyon narrows
      { latitude: 24.766, longitude: 56.082 }, // Mid-wadi
      { latitude: 24.757, longitude: 56.067 }, // Rocky section
      { latitude: 24.749, longitude: 56.053 }, // Deep pools area
      { latitude: 24.738, longitude: 56.040 }, // Wadi highpoint
    ],
    waypoints: [
      {
        id: "11-s",
        name: "Rock Pools Car Park",
        description: "Start at 24.787°N 56.114°E, near the Hatta Heritage Village. No entry fee.",
        type: "start",
        coordinate: { latitude: 24.787, longitude: 56.114 },
        elevation: "355 m",
      },
      {
        id: "11-p1",
        name: "First Pool Crossing",
        description: "Shallow turquoise pool at the wadi mouth. Great 4x4 water crossing practice.",
        type: "water",
        coordinate: { latitude: 24.781, longitude: 56.107 },
        elevation: "365 m",
      },
      {
        id: "11-p2",
        name: "Canyon Narrows",
        description: "Walls close to 5m width. Striking layered geology — look for fossil coral in the limestone.",
        type: "scenic",
        coordinate: { latitude: 24.774, longitude: 56.096 },
        elevation: "375 m",
      },
      {
        id: "11-p3",
        name: "Rock Slide Section",
        description: "Polished rock descent — extremely slippery when wet. Walk the line first before driving.",
        type: "technical",
        coordinate: { latitude: 24.757, longitude: 56.067 },
        elevation: "395 m",
      },
      {
        id: "11-p4",
        name: "Deep Blue Pools",
        description: "Main swimming destination — up to 3m deep with brilliant turquoise water. Seasonal rope swing.",
        type: "water",
        coordinate: { latitude: 24.749, longitude: 56.053 },
        elevation: "410 m",
      },
      {
        id: "11-e",
        name: "Wadi Highpoint",
        description: "Oman border begins here — do not proceed further without valid Omani visa and permits.",
        type: "end",
        coordinate: { latitude: 24.738, longitude: 56.040 },
        elevation: "440 m",
      },
    ],
    region: {
      latitude: 24.763,
      longitude: 56.078,
      latitudeDelta: 0.068,
      longitudeDelta: 0.090,
    },
  },

  // ── Al Qua' Dunes (Tal Moreeb) — Liwa Oasis, Abu Dhabi ─────────────────
  // Tal Moreeb race site: 23.072°N 53.740°E (south of Liwa town)
  // Liwa Oasis center: 23.134°N 53.773°E | Madinat Zayed: 23.606°N 53.598°E
  "12": {
    id: "12",
    approachFrom: "Abu Dhabi",
    approachCoordinates: [
      { latitude: 24.453, longitude: 54.377 }, // Abu Dhabi
      { latitude: 24.050, longitude: 53.900 }, // E11 southwest
      { latitude: 23.606, longitude: 53.598 }, // Madinat Zayed
      { latitude: 23.134, longitude: 53.773 }, // Liwa Oasis center
      { latitude: 23.110, longitude: 53.755 }, // South toward Tal Moreeb
      { latitude: 23.072, longitude: 53.740 }, // Tal Moreeb base
    ],
    trailCoordinates: [
      { latitude: 23.072, longitude: 53.740 }, // Tal Moreeb base
      { latitude: 23.077, longitude: 53.747 }, // North dune approach
      { latitude: 23.082, longitude: 53.752 }, // Dune mid-face
      { latitude: 23.086, longitude: 53.750 }, // Near summit
      { latitude: 23.086, longitude: 53.743 }, // Summit area
      { latitude: 23.082, longitude: 53.734 }, // Dune bowl (descent)
      { latitude: 23.076, longitude: 53.733 }, // Return ridge
      { latitude: 23.074, longitude: 53.737 },
      { latitude: 23.072, longitude: 53.740 }, // Back to base
    ],
    waypoints: [
      {
        id: "12-s",
        name: "Tal Moreeb Base",
        description: "MANDATORY convoy — minimum 3 vehicles (23.072°N 53.740°E). Deflate to 8–12 PSI. Flag your vehicle.",
        type: "start",
        coordinate: { latitude: 23.072, longitude: 53.740 },
        elevation: "200 m",
      },
      {
        id: "12-p1",
        name: "North Dune Approach",
        description: "Entry ramp to the mega-dune. Approach perfectly straight — any angle risks rollover.",
        type: "technical",
        coordinate: { latitude: 23.082, longitude: 53.752 },
        elevation: "350 m",
      },
      {
        id: "12-p2",
        name: "Dune Bowl",
        description: "Natural amphitheatre between dunes. Recovery operations stage here. Winch anchor point.",
        type: "camp",
        coordinate: { latitude: 23.082, longitude: 53.734 },
        elevation: "320 m",
      },
      {
        id: "12-p3",
        name: "Moreeb Summit",
        description: "UAE's highest dune at ~300m above surrounding desert. Sunrise view is legendary.",
        type: "summit",
        coordinate: { latitude: 23.086, longitude: 53.743 },
        elevation: "500 m",
      },
      {
        id: "12-p4",
        name: "Return Ridge",
        description: "Knife-edge dune ridge — single file, slow speed. Wind erosion sculpts new shapes daily.",
        type: "technical",
        coordinate: { latitude: 23.076, longitude: 53.733 },
        elevation: "380 m",
      },
      {
        id: "12-e",
        name: "Base Camp Return",
        description: "Re-inflate ALL tyres to street pressure. Check for sand in air filters before long drive.",
        type: "end",
        coordinate: { latitude: 23.072, longitude: 53.740 },
        elevation: "200 m",
      },
    ],
    region: {
      latitude: 23.072,
      longitude: 53.740,
      latitudeDelta: 0.040,
      longitudeDelta: 0.055,
    },
  },
};
