/**
 * Seed the database with 12 curated trails with verified real-world GPS coordinates.
 * Coordinates sourced from field reports, AllTrails, official BLM/park data, and
 * GPS waypoint databases. OSM attribution: ODbL (where OSM data is used).
 */

import { insertTrailFull, getTrailCount } from "./storage";

// ── Display-string → numeric parsers (backfill for curated trails) ───────────
// Returns null for non-numeric values like "Open area".
function parseDistanceToMeters(str: string | null | undefined): number | null {
  if (!str) return null;
  const match = str.match(/([\d.,]+)/);
  if (!match) return null;
  const value = parseFloat(match[1].replace(/,/g, ""));
  if (isNaN(value)) return null;
  const lower = str.toLowerCase();
  if (lower.includes("mi")) return value * 1609.34;
  if (lower.includes("km")) return value * 1000;
  return null;
}

// Handles "N hrs"/"N–M hrs" (uses first N * 3600) and "N day(s)" (N * 86400).
function parseDurationToSeconds(str: string | null | undefined): number | null {
  if (!str) return null;
  const lower = str.toLowerCase();
  const match = lower.match(/([\d.]+)/);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (isNaN(value)) return null;
  if (lower.includes("day")) return value * 86400;
  if (lower.includes("hr") || lower.includes("hour")) return value * 3600;
  return null;
}

// Parse an elevation string ("4,763 ft", "355 m", "300 m dunes") to meters.
function parseElevationToMeters(str: string | null | undefined): number | null {
  if (!str) return null;
  const lower = str.toLowerCase();
  const match = lower.replace(/,/g, "").match(/([\d.]+)/);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (isNaN(value)) return null;
  if (lower.includes("ft") || lower.includes("feet")) return value * 0.3048;
  return value; // assume meters
}

// Compute cumulative elevation gain/loss (meters) from ordered waypoint elevations.
function computeElevationProfile(
  waypoints: { elevation?: string; sequenceNum: number }[],
): { gain: number | null; loss: number | null } {
  const elevations = [...waypoints]
    .sort((a, b) => a.sequenceNum - b.sequenceNum)
    .map((w) => parseElevationToMeters(w.elevation))
    .filter((e): e is number => e != null);
  if (elevations.length < 2) return { gain: null, loss: null };
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < elevations.length; i++) {
    const delta = elevations[i] - elevations[i - 1];
    if (delta > 0) gain += delta;
    else loss += -delta;
  }
  return { gain: Math.round(gain), loss: Math.round(loss) };
}

const CURATED_TRAILS = [
  // ── Hell's Revenge — Sand Flats Recreation Area, Moab UT ─────────────────
  // Trailhead verified: 38.5753°N 109.5226°W (Sand Flats Rd past fee station)
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
    description: "Iconic slickrock circuit through breathtaking red rock canyon country. Steep ledges, off-camber sections and Colorado River overlooks make this a Moab classic.",
    approachFrom: "Moab, UT",
    region: { latitude: 38.564, longitude: -109.509, latitudeDelta: 0.030, longitudeDelta: 0.042 },
    approachCoordinates: [
      { latitude: 38.5735, longitude: -109.5499 },
      { latitude: 38.5720, longitude: -109.5430 },
      { latitude: 38.5728, longitude: -109.5340 },
      { latitude: 38.5738, longitude: -109.5280 },
      { latitude: 38.5748, longitude: -109.5250 },
      { latitude: 38.5753, longitude: -109.5226 },
    ],
    trailCoordinates: [
      { latitude: 38.5753, longitude: -109.5226 },
      { latitude: 38.5722, longitude: -109.5180 },
      { latitude: 38.5688, longitude: -109.5115 },
      { latitude: 38.5648, longitude: -109.5052 },
      { latitude: 38.5610, longitude: -109.5002 },
      { latitude: 38.5575, longitude: -109.4972 },
      { latitude: 38.5545, longitude: -109.4958 },
      { latitude: 38.5515, longitude: -109.4978 },
      { latitude: 38.5498, longitude: -109.5048 },
      { latitude: 38.5522, longitude: -109.5130 },
      { latitude: 38.5575, longitude: -109.5185 },
      { latitude: 38.5640, longitude: -109.5215 },
      { latitude: 38.5700, longitude: -109.5225 },
      { latitude: 38.5753, longitude: -109.5226 },
    ],
    waypoints: [
      { waypointKey: "1-s", name: "Sand Flats Trailhead", description: "Register at the kiosk. Self-issue day-use permit ($5). Check tire pressure and diff-lock.", waypointType: "start", latitude: 38.5753, longitude: -109.5226, elevation: "4,458 ft", sequenceNum: 0 },
      { waypointKey: "1-p1", name: "Dinosaur Tracks", description: "50+ dinosaur footprints in the slickrock — about 0.5mi from TH. Protected site.", waypointType: "scenic", latitude: 38.5722, longitude: -109.5180, elevation: "4,480 ft", sequenceNum: 1 },
      { waypointKey: "1-p2", name: "Mickey's Hot Tub", description: "Iconic natural pothole — the only open water on the trail.", waypointType: "water", latitude: 38.5575, longitude: -109.4972, elevation: "4,520 ft", sequenceNum: 2 },
      { waypointKey: "1-p3", name: "Hell's Gate", description: "The notorious V-notch descent. Diff-lock required. Use a spotter.", waypointType: "technical", latitude: 38.5610, longitude: -109.5002, elevation: "4,560 ft", sequenceNum: 3 },
      { waypointKey: "1-p4", name: "Colorado River Overlook", description: "Staggering 600-ft drop to the Colorado River. Best view on the trail.", waypointType: "scenic", latitude: 38.5545, longitude: -109.4958, elevation: "4,763 ft", sequenceNum: 4 },
      { waypointKey: "1-p5", name: "Tip-Over Challenge", description: "30° off-camber slickrock ledge. Full commitment required.", waypointType: "technical", latitude: 38.5515, longitude: -109.4978, elevation: "4,630 ft", sequenceNum: 5 },
      { waypointKey: "1-e", name: "Loop Complete", description: "Loop rejoins Sand Flats Rd. Re-inflate tires.", waypointType: "end", latitude: 38.5753, longitude: -109.5226, elevation: "4,458 ft", sequenceNum: 6 },
    ],
  },

  // ── Rubicon Trail — El Dorado/Sierra Nevada, CA ───────────────────────────
  // Loon Lake TH verified: 39.003350°N 120.312450°W | East end: 39.027°N 120.100°W
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
    description: "California's most legendary off-road trail. Massive granite boulders, deep water crossings and dense pine forest across the Sierra Nevada.",
    approachFrom: "Georgetown, CA",
    region: { latitude: 39.015, longitude: -120.207, latitudeDelta: 0.060, longitudeDelta: 0.260 },
    approachCoordinates: [
      { latitude: 38.910, longitude: -120.893 },
      { latitude: 38.914, longitude: -120.600 },
      { latitude: 38.814, longitude: -120.375 },
      { latitude: 38.986, longitude: -120.330 },
      { latitude: 39.003, longitude: -120.311 },
      { latitude: 39.003, longitude: -120.312 },
    ],
    trailCoordinates: [
      { latitude: 39.003, longitude: -120.312 },
      { latitude: 39.003, longitude: -120.285 },
      { latitude: 39.004, longitude: -120.255 },
      { latitude: 39.007, longitude: -120.224 },
      { latitude: 39.010, longitude: -120.195 },
      { latitude: 39.014, longitude: -120.167 },
      { latitude: 39.018, longitude: -120.143 },
      { latitude: 39.022, longitude: -120.115 },
      { latitude: 39.025, longitude: -120.108 },
      { latitude: 39.027, longitude: -120.100 },
    ],
    waypoints: [
      { waypointKey: "2-s", name: "Loon Lake Trailhead", description: "Western terminus at 6,331 ft. Fuel up — no services for 22 miles.", waypointType: "start", latitude: 39.003, longitude: -120.312, elevation: "6,331 ft", sequenceNum: 0 },
      { waypointKey: "2-p1", name: "Rubicon Springs Camp", description: "Historic hot springs. Great mid-trail stop with seasonal water.", waypointType: "camp", latitude: 39.010, longitude: -120.195, elevation: "5,350 ft", sequenceNum: 1 },
      { waypointKey: "2-p2", name: "Soup Bowl", description: "Deep granite bowl with massive boulders. High-lift jack and lockers required.", waypointType: "technical", latitude: 39.018, longitude: -120.143, elevation: "5,200 ft", sequenceNum: 2 },
      { waypointKey: "2-p3", name: "Buck Island Lake", description: "Stunning alpine lake — perfect lunch stop.", waypointType: "scenic", latitude: 39.022, longitude: -120.115, elevation: "6,400 ft", sequenceNum: 3 },
      { waypointKey: "2-e", name: "Meeks Bay End", description: "Eastern terminus near Lake Tahoe. Pavement resumes.", waypointType: "end", latitude: 39.027, longitude: -120.100, elevation: "6,240 ft", sequenceNum: 4 },
    ],
  },

  // ── Black Bear Pass — San Juan Mountains / Telluride, CO ─────────────────
  // Trailhead: 37.8967°N 107.7133°W (Red Mountain Pass on US-550)
  // Summit: 37.8995°N 107.7430°W | Bridal Veil: 37.9206°N 107.7454°W
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
    description: "Colorado's most technical high-alpine route. Extreme switchbacks, sheer cliff edges and stunning 12,840-ft passes. Expert drivers only — one way descent.",
    approachFrom: "Silverton, CO",
    region: { latitude: 37.918, longitude: -107.762, latitudeDelta: 0.062, longitudeDelta: 0.125 },
    approachCoordinates: [
      { latitude: 37.812, longitude: -107.665 },
      { latitude: 37.835, longitude: -107.675 },
      { latitude: 37.862, longitude: -107.690 },
      { latitude: 37.885, longitude: -107.706 },
      { latitude: 37.897, longitude: -107.713 },
    ],
    trailCoordinates: [
      { latitude: 37.897, longitude: -107.713 },
      { latitude: 37.898, longitude: -107.725 },
      { latitude: 37.900, longitude: -107.743 },
      { latitude: 37.904, longitude: -107.750 },
      { latitude: 37.908, longitude: -107.752 },
      { latitude: 37.913, longitude: -107.750 },
      { latitude: 37.918, longitude: -107.748 },
      { latitude: 37.921, longitude: -107.745 },
      { latitude: 37.928, longitude: -107.762 },
      { latitude: 37.934, longitude: -107.782 },
      { latitude: 37.939, longitude: -107.808 },
    ],
    waypoints: [
      { waypointKey: "3-s", name: "Red Mountain Pass Trailhead", description: "One-way trail — descent toward Telluride only. 11,018 ft start. Check brakes.", waypointType: "start", latitude: 37.897, longitude: -107.713, elevation: "11,018 ft", sequenceNum: 0 },
      { waypointKey: "3-p1", name: "Black Bear Pass Summit", description: "Trail's highest point at 12,840 ft. Spectacular San Juan panorama.", waypointType: "summit", latitude: 37.900, longitude: -107.743, elevation: "12,840 ft", sequenceNum: 1 },
      { waypointKey: "3-p2", name: "Point of No Return", description: "One-way sign — you cannot reverse from here. Commit to the descent.", waypointType: "scenic", latitude: 37.908, longitude: -107.752, elevation: "12,200 ft", sequenceNum: 2 },
      { waypointKey: "3-p3", name: "The Steps", description: "Legendary stepped switchbacks above Telluride. Extreme exposure — spotter mandatory.", waypointType: "technical", latitude: 37.913, longitude: -107.750, elevation: "11,500 ft", sequenceNum: 3 },
      { waypointKey: "3-p4", name: "Bridal Veil Falls Overlook", description: "Colorado's tallest free-fall waterfall (365 ft) directly below the road.", waypointType: "scenic", latitude: 37.921, longitude: -107.745, elevation: "10,800 ft", sequenceNum: 4 },
      { waypointKey: "3-e", name: "Telluride Town End", description: "Trail ends in downtown Telluride at 8,750 ft. Celebrate accordingly.", waypointType: "end", latitude: 37.939, longitude: -107.808, elevation: "8,750 ft", sequenceNum: 5 },
    ],
  },

  // ── Dumont Dunes OHV — San Bernardino County, CA ─────────────────────────
  // Official BLM coordinates: 35.69138°N 116.23890°W
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
    description: "A sprawling OHV area in the Mojave Desert. Towering sand dunes up to 400 ft for all skill levels with dedicated play areas.",
    approachFrom: "Baker, CA",
    region: { latitude: 35.699, longitude: -116.235, latitudeDelta: 0.035, longitudeDelta: 0.048 },
    approachCoordinates: [
      { latitude: 35.264, longitude: -116.072 },
      { latitude: 35.370, longitude: -116.098 },
      { latitude: 35.480, longitude: -116.130 },
      { latitude: 35.580, longitude: -116.175 },
      { latitude: 35.647, longitude: -116.215 },
      { latitude: 35.675, longitude: -116.232 },
      { latitude: 35.691, longitude: -116.239 },
    ],
    trailCoordinates: [
      { latitude: 35.691, longitude: -116.239 },
      { latitude: 35.697, longitude: -116.233 },
      { latitude: 35.702, longitude: -116.226 },
      { latitude: 35.706, longitude: -116.221 },
      { latitude: 35.709, longitude: -116.230 },
      { latitude: 35.706, longitude: -116.242 },
      { latitude: 35.700, longitude: -116.249 },
      { latitude: 35.693, longitude: -116.245 },
      { latitude: 35.691, longitude: -116.239 },
    ],
    waypoints: [
      { waypointKey: "4-s", name: "OHV Staging Area", description: "BLM area — no fee. Lower tire pressure to 12–15 PSI before entering dunes.", waypointType: "start", latitude: 35.691, longitude: -116.239, elevation: "760 ft", sequenceNum: 0 },
      { waypointKey: "4-p1", name: "Main Dune Face", description: "400-ft primary dune face. Approach straight on the ridgeline — never sideways.", waypointType: "technical", latitude: 35.702, longitude: -116.226, elevation: "1,050 ft", sequenceNum: 1 },
      { waypointKey: "4-p2", name: "Summit Lookout", description: "Panorama of the Mojave Desert. Amargosa River valley visible to the east.", waypointType: "scenic", latitude: 35.706, longitude: -116.221, elevation: "1,180 ft", sequenceNum: 2 },
      { waypointKey: "4-e", name: "Return to Staging", description: "Re-inflate tires to street pressure before driving out on Hwy 127.", waypointType: "end", latitude: 35.691, longitude: -116.239, elevation: "760 ft", sequenceNum: 3 },
    ],
  },

  // ── Ouray Alpine Loop — San Juan Mountains, CO ───────────────────────────
  // Ouray: 38.023°N 107.671°W | Engineer Pass: 37.9815°N 107.5917°W
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
    description: "Sweeping mountain scenery across Engineer and Cinnamon passes. Historic mining sites, alpine meadows and dramatic ridge-line driving.",
    approachFrom: "Ouray, CO",
    region: { latitude: 37.990, longitude: -107.530, latitudeDelta: 0.120, longitudeDelta: 0.420 },
    approachCoordinates: [
      { latitude: 38.023, longitude: -107.671 },
      { latitude: 38.018, longitude: -107.658 },
      { latitude: 38.010, longitude: -107.645 },
    ],
    trailCoordinates: [
      { latitude: 38.010, longitude: -107.645 },
      { latitude: 38.002, longitude: -107.630 },
      { latitude: 37.995, longitude: -107.614 },
      { latitude: 37.988, longitude: -107.600 },
      { latitude: 37.982, longitude: -107.592 },
      { latitude: 37.978, longitude: -107.578 },
      { latitude: 37.970, longitude: -107.555 },
      { latitude: 37.962, longitude: -107.520 },
      { latitude: 37.950, longitude: -107.490 },
      { latitude: 37.940, longitude: -107.468 },
      { latitude: 37.933, longitude: -107.575 },
    ],
    waypoints: [
      { waypointKey: "5-s", name: "Ouray Alpine Loop Gate", description: "4WD-only gate south of Ouray. Alpine Loop permit required Jun–Sep.", waypointType: "start", latitude: 38.010, longitude: -107.645, elevation: "9,600 ft", sequenceNum: 0 },
      { waypointKey: "5-p1", name: "Engineer Mine", description: "Historic silver mine ruins from the 1870s.", waypointType: "scenic", latitude: 37.995, longitude: -107.614, elevation: "11,200 ft", sequenceNum: 1 },
      { waypointKey: "5-p2", name: "Engineer Pass", description: "12,800 ft summit. Snow possible Jun–Sep — check conditions.", waypointType: "summit", latitude: 37.982, longitude: -107.592, elevation: "12,800 ft", sequenceNum: 2 },
      { waypointKey: "5-p3", name: "American Flats", description: "Wide alpine meadow with summer wildflowers. Great dispersed camping.", waypointType: "camp", latitude: 37.970, longitude: -107.555, elevation: "12,100 ft", sequenceNum: 3 },
      { waypointKey: "5-p4", name: "Animas Forks Ghost Town", description: "Preserved 1870s mining town at the valley junction.", waypointType: "scenic", latitude: 37.940, longitude: -107.468, elevation: "11,200 ft", sequenceNum: 4 },
      { waypointKey: "5-e", name: "Lake City End", description: "Loop completes at Lake City (8,671 ft). Fuel available.", waypointType: "end", latitude: 38.029, longitude: -107.314, elevation: "8,671 ft", sequenceNum: 5 },
    ],
  },

  // ── King of the Hammers — Johnson Valley OHV, CA ─────────────────────────
  // Hammertown: 34.3733°N 116.5605°W | Jackhammer TH: 34.4145°N 116.4744°W
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
    description: "The world's toughest one-day off-road race. Desert wash at speed transitions into extreme rock crawling in the Hammers formation.",
    approachFrom: "Yucca Valley, CA",
    region: { latitude: 34.405, longitude: -116.500, latitudeDelta: 0.110, longitudeDelta: 0.175 },
    approachCoordinates: [
      { latitude: 34.114, longitude: -116.432 },
      { latitude: 34.175, longitude: -116.460 },
      { latitude: 34.240, longitude: -116.498 },
      { latitude: 34.310, longitude: -116.535 },
      { latitude: 34.373, longitude: -116.561 },
    ],
    trailCoordinates: [
      { latitude: 34.373, longitude: -116.561 },
      { latitude: 34.388, longitude: -116.548 },
      { latitude: 34.406, longitude: -116.528 },
      { latitude: 34.415, longitude: -116.474 },
      { latitude: 34.437, longitude: -116.475 },
      { latitude: 34.445, longitude: -116.452 },
      { latitude: 34.423, longitude: -116.435 },
      { latitude: 34.410, longitude: -116.460 },
      { latitude: 34.390, longitude: -116.490 },
      { latitude: 34.375, longitude: -116.520 },
      { latitude: 34.373, longitude: -116.561 },
    ],
    waypoints: [
      { waypointKey: "6-s", name: "Hammertown Start", description: "Race HQ (34.3733°N 116.5605°W). Sign waivers. Convoy briefing at 6 AM.", waypointType: "start", latitude: 34.373, longitude: -116.561, elevation: "2,800 ft", sequenceNum: 0 },
      { waypointKey: "6-p1", name: "Backdoor Desert Wash", description: "Opening high-speed desert wash. Massive whoops at race speeds.", waypointType: "technical", latitude: 34.406, longitude: -116.528, elevation: "3,050 ft", sequenceNum: 1 },
      { waypointKey: "6-p2", name: "Jackhammer", description: "First major rock obstacle. Named for the pounding your vehicle takes.", waypointType: "technical", latitude: 34.415, longitude: -116.474, elevation: "3,100 ft", sequenceNum: 2 },
      { waypointKey: "6-p3", name: "Chocolate Thunder", description: "Dark granite canyon crawl. 3-point turns required. Most photographed section.", waypointType: "technical", latitude: 34.423, longitude: -116.435, elevation: "3,400 ft", sequenceNum: 3 },
      { waypointKey: "6-p4", name: "The Pit", description: "Deep rock drop section. Extreme ledges — front-end damage common without proper approach.", waypointType: "technical", latitude: 34.390, longitude: -116.490, elevation: "3,200 ft", sequenceNum: 4 },
      { waypointKey: "6-e", name: "Hammertown Finish", description: "Finish line at Hammertown. You survived King of the Hammers.", waypointType: "end", latitude: 34.373, longitude: -116.561, elevation: "2,800 ft", sequenceNum: 5 },
    ],
  },

  // ── Wadi Shawka "Keep it tight" — Hajar Mountains, Ras Al Khaimah ──────────
  // GPS track: owner-recorded with MotionX GPS, Jan 8 2022 (9:14 am)
  // Start: 25.10245°N 56.06410°E | End: 25.10437°N 56.05552°E (9.7 km loop)
  // Elevation range: 314–382 m | Fully owned track — no licence restrictions
  {
    id: "7",
    name: "Wadi Shawka",
    location: "Ras Al Khaimah, UAE",
    difficulty: 6,
    terrain: "Wadi & Rock",
    distance: "9.7 km",
    duration: "3–4 hrs",
    accentColor: "#2D6A4F",
    elevation: "382 m",
    description: "Technical wadi loop through the Hajar Mountains known locally as 'Keep it tight'. Tight rock corridors, ledges and off-camber sections demand full lockers and a winch. Rock rails are a must — the walls will find your doors. Minimum 3-inch lift and 35-inch tyres. Best Oct–Apr.",
    approachFrom: "Dubai",
    region: { latitude: 25.099, longitude: 56.070, latitudeDelta: 0.028, longitudeDelta: 0.042 },
    approachCoordinates: [
      { latitude: 25.204, longitude: 55.270 },
      { latitude: 25.250, longitude: 55.385 },
      { latitude: 25.286, longitude: 55.610 },
      { latitude: 25.240, longitude: 55.790 },
      { latitude: 25.200, longitude: 55.900 },
      { latitude: 25.166, longitude: 55.985 },
      { latitude: 25.132, longitude: 56.025 },
      { latitude: 25.104, longitude: 56.047 },
      { latitude: 25.1024511, longitude: 56.0641018 },
    ],
    trailCoordinates: [
      { latitude: 25.1024511, longitude: 56.0641018 },
      { latitude: 25.1027106, longitude: 56.0651571 },
      { latitude: 25.1033431, longitude: 56.0660808 },
      { latitude: 25.1038769, longitude: 56.0670711 },
      { latitude: 25.103833,  longitude: 56.0682608 },
      { latitude: 25.103088,  longitude: 56.0686535 },
      { latitude: 25.1022011, longitude: 56.0695227 },
      { latitude: 25.1010935, longitude: 56.0695964 },
      { latitude: 25.0998548, longitude: 56.0701093 },
      { latitude: 25.0993725, longitude: 56.0713398 },
      { latitude: 25.097643,  longitude: 56.0715313 },
      { latitude: 25.0962682, longitude: 56.0727991 },
      { latitude: 25.0958243, longitude: 56.0740408 },
      { latitude: 25.0951334, longitude: 56.0753909 },
      { latitude: 25.0943578, longitude: 56.0765305 },
      { latitude: 25.093925,  longitude: 56.0780936 },
      { latitude: 25.0938251, longitude: 56.0782846 },
      { latitude: 25.0937384, longitude: 56.0790064 },
      { latitude: 25.094116,  longitude: 56.0802253 },
      { latitude: 25.0944566, longitude: 56.0817734 },
      { latitude: 25.0946585, longitude: 56.0832938 },
      { latitude: 25.0948831, longitude: 56.0843765 },
      { latitude: 25.0954907, longitude: 56.0851245 },
      { latitude: 25.0953759, longitude: 56.0832289 },
      { latitude: 25.0962303, longitude: 56.0831601 },
      { latitude: 25.0972648, longitude: 56.0827382 },
      { latitude: 25.0982063, longitude: 56.0826036 },
      { latitude: 25.0988822, longitude: 56.0828468 },
      { latitude: 25.098262,  longitude: 56.0826237 },
      { latitude: 25.0973423, longitude: 56.0827462 },
      { latitude: 25.0964523, longitude: 56.0831316 },
      { latitude: 25.0955793, longitude: 56.0832434 },
      { latitude: 25.0948826, longitude: 56.083059  },
      { latitude: 25.0951289, longitude: 56.0831481 },
      { latitude: 25.0967235, longitude: 56.0829994 },
      { latitude: 25.0976556, longitude: 56.0826266 },
      { latitude: 25.0988087, longitude: 56.0823856 },
      { latitude: 25.0993567, longitude: 56.0829275 },
      { latitude: 25.1003716, longitude: 56.083129  },
      { latitude: 25.101351,  longitude: 56.0825557 },
      { latitude: 25.1016547, longitude: 56.0813618 },
      { latitude: 25.1021511, longitude: 56.0803129 },
      { latitude: 25.1028655, longitude: 56.0792914 },
      { latitude: 25.1029392, longitude: 56.0779987 },
      { latitude: 25.1032002, longitude: 56.076856  },
      { latitude: 25.1032237, longitude: 56.0756666 },
      { latitude: 25.1027681, longitude: 56.0746781 },
      { latitude: 25.1024347, longitude: 56.0735043 },
      { latitude: 25.1025376, longitude: 56.0723172 },
      { latitude: 25.1026974, longitude: 56.0711221 },
      { latitude: 25.1030436, longitude: 56.0700814 },
      { latitude: 25.103642,  longitude: 56.0691031 },
      { latitude: 25.1038785, longitude: 56.0680331 },
      { latitude: 25.1037802, longitude: 56.06688   },
      { latitude: 25.1031787, longitude: 56.0658095 },
      { latitude: 25.1025614, longitude: 56.0648285 },
      { latitude: 25.1025268, longitude: 56.0635188 },
      { latitude: 25.1033176, longitude: 56.0628281 },
      { latitude: 25.1043377, longitude: 56.062598  },
      { latitude: 25.1042698, longitude: 56.0619161 },
      { latitude: 25.1033114, longitude: 56.0618697 },
      { latitude: 25.102309,  longitude: 56.061098  },
      { latitude: 25.1021307, longitude: 56.0598064 },
      { latitude: 25.1027906, longitude: 56.0590362 },
      { latitude: 25.1036461, longitude: 56.0591462 },
      { latitude: 25.1039114, longitude: 56.057905  },
      { latitude: 25.1041248, longitude: 56.0567764 },
      { latitude: 25.1045084, longitude: 56.0556891 },
      { latitude: 25.1043731, longitude: 56.0555223 },
    ],
    waypoints: [
      { waypointKey: "7-s", name: "Wadi Shawka Entry", description: "Park at Shawka Dam then drive east to trailhead. Deflate to 18 PSI. Engage 4L. Rock rails on before you start.", waypointType: "start", latitude: 25.1024511, longitude: 56.0641018, elevation: "337 m", sequenceNum: 0 },
      { waypointKey: "7-p1", name: "First Rock Section", description: "Trail tightens immediately. Tight corridor — rock rails will save your doors here.", waypointType: "technical", latitude: 25.1022011, longitude: 56.0695227, elevation: "343 m", sequenceNum: 1 },
      { waypointKey: "7-p2", name: "Deep Wadi Floor", description: "Lowest section of the loop. Wadi walls close in. Slow and steady — one line only.", waypointType: "technical", latitude: 25.0943578, longitude: 56.0765305, elevation: "320 m", sequenceNum: 2 },
      { waypointKey: "7-p3", name: "Far Turn — High Point", description: "Highest point of the loop at 382 m. Tight switchback — winch anchor rock on the left if needed.", waypointType: "summit", latitude: 25.0954907, longitude: 56.0851245, elevation: "382 m", sequenceNum: 3 },
      { waypointKey: "7-p4", name: "Return Ledge", description: "Off-camber ledge on the return leg. Lockers essential. Take the high line.", waypointType: "technical", latitude: 25.1032002, longitude: 56.0768560, elevation: "355 m", sequenceNum: 4 },
      { waypointKey: "7-e", name: "Loop Exit", description: "Trail rejoins the wadi floor. Re-inflate tires before driving back to the dam.", waypointType: "end", latitude: 25.1043731, longitude: 56.0555223, elevation: "330 m", sequenceNum: 5 },
    ],
    tags: {
      min_lift_inches: "3",
      min_tire_inches: "35",
      lockers: "front_and_back",
      winch: "recommended",
      rock_rails: "required",
      gpx_source: "owner_recorded",
      gpx_date: "2022-01-08",
    },
  },

  // ── Wadi Bih — RAK to Dibba mountain crossing ─────────────────────────────
  // RAK trailhead verified: 25.7760°N 56.0500°E | Pass: 25.7330°N 56.1700°E
  // Omani checkpoint: 25.7200°N 56.2300°E | Dibba: ~25.621°N 56.268°E
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
    description: "UAE's most popular mountain pass crossing. Paved start turns into gravel wash through dramatic Hajar gorges, ending on the Dibba coast.",
    approachFrom: "RAK City",
    region: { latitude: 25.699, longitude: 56.159, latitudeDelta: 0.200, longitudeDelta: 0.260 },
    approachCoordinates: [
      { latitude: 25.670, longitude: 55.761 },
      { latitude: 25.703, longitude: 55.820 },
      { latitude: 25.724, longitude: 55.880 },
      { latitude: 25.750, longitude: 55.960 },
      { latitude: 25.765, longitude: 56.020 },
      { latitude: 25.776, longitude: 56.050 },
    ],
    trailCoordinates: [
      { latitude: 25.776, longitude: 56.050 },
      { latitude: 25.760, longitude: 56.095 },
      { latitude: 25.748, longitude: 56.122 },
      { latitude: 25.740, longitude: 56.145 },
      { latitude: 25.733, longitude: 56.170 },
      { latitude: 25.727, longitude: 56.198 },
      { latitude: 25.720, longitude: 56.230 },
      { latitude: 25.710, longitude: 56.270 },
      { latitude: 25.685, longitude: 56.271 },
      { latitude: 25.655, longitude: 56.269 },
      { latitude: 25.621, longitude: 56.268 },
    ],
    waypoints: [
      { waypointKey: "8-s", name: "Wadi Bih RAK Trailhead", description: "Off E18 past the military base (25.776°N 56.050°E). Signed entry point.", waypointType: "start", latitude: 25.776, longitude: 56.050, elevation: "80 m", sequenceNum: 0 },
      { waypointKey: "8-p1", name: "Lower Wadi Gorge", description: "Deep canyon with towering Hajar limestone walls. Dramatic and photogenic.", waypointType: "scenic", latitude: 25.748, longitude: 56.122, elevation: "350 m", sequenceNum: 1 },
      { waypointKey: "8-p2", name: "Seasonal Stream Crossing", description: "Winter water flow can be significant — scout depth before crossing.", waypointType: "water", latitude: 25.740, longitude: 56.145, elevation: "520 m", sequenceNum: 2 },
      { waypointKey: "8-p3", name: "Mountain Pass Summit", description: "~1,000m pass (25.733°N 56.170°E). Views west to RAK and east to Gulf of Oman.", waypointType: "summit", latitude: 25.733, longitude: 56.170, elevation: "1,000 m", sequenceNum: 3 },
      { waypointKey: "8-p4", name: "Descent Switchbacks", description: "Steep hairpins on the Dibba side. Low range, engine braking. Loose stones.", waypointType: "technical", latitude: 25.710, longitude: 56.270, elevation: "600 m", sequenceNum: 4 },
      { waypointKey: "8-e", name: "Dibba Al Hisn Exit", description: "Trail emerges at Dibba coast (25.621°N 56.268°E). Beach and restaurants nearby.", waypointType: "end", latitude: 25.621, longitude: 56.268, elevation: "10 m", sequenceNum: 5 },
    ],
  },

  // ── Fossil Rock (Jebel Maleihah) — Sharjah desert, UAE ──────────────────
  // Summit/parking verified: 25.16747°N 55.84158°E (GPS field data)
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
    description: "Accessible desert loop around a dramatic rocky outcrop embedded with ancient marine fossils. Great for beginners and photography.",
    approachFrom: "Dubai",
    region: { latitude: 25.172, longitude: 55.842, latitudeDelta: 0.022, longitudeDelta: 0.032 },
    approachCoordinates: [
      { latitude: 25.204, longitude: 55.270 },
      { latitude: 25.280, longitude: 55.440 },
      { latitude: 25.285, longitude: 55.693 },
      { latitude: 25.248, longitude: 55.756 },
      { latitude: 25.210, longitude: 55.800 },
      { latitude: 25.167, longitude: 55.842 },
    ],
    trailCoordinates: [
      { latitude: 25.167, longitude: 55.842 },
      { latitude: 25.170, longitude: 55.848 },
      { latitude: 25.174, longitude: 55.849 },
      { latitude: 25.177, longitude: 55.845 },
      { latitude: 25.176, longitude: 55.839 },
      { latitude: 25.173, longitude: 55.835 },
      { latitude: 25.169, longitude: 55.835 },
      { latitude: 25.165, longitude: 55.838 },
      { latitude: 25.167, longitude: 55.842 },
    ],
    waypoints: [
      { waypointKey: "9-s", name: "Roadside Trailhead", description: "Park on E102 shoulder (25.1675°N 55.8416°E). Deflate to 18 PSI for sandy approach.", waypointType: "start", latitude: 25.167, longitude: 55.842, elevation: "150 m", sequenceNum: 0 },
      { waypointKey: "9-p1", name: "East Sand Approach", description: "Sandy desert approach to the rock base. Steady momentum required.", waypointType: "technical", latitude: 25.170, longitude: 55.848, elevation: "165 m", sequenceNum: 1 },
      { waypointKey: "9-p2", name: "Fossil Beds", description: "80 million-year-old marine fossils visible in the limestone — ancient seashells and coral.", waypointType: "scenic", latitude: 25.176, longitude: 55.839, elevation: "180 m", sequenceNum: 2 },
      { waypointKey: "9-p3", name: "Rock Summit", description: "360° desert panorama at 200m. Hajar Mountains NE, Dubai skyline SW on clear days.", waypointType: "summit", latitude: 25.173, longitude: 55.835, elevation: "200 m", sequenceNum: 3 },
      { waypointKey: "9-e", name: "Loop Return", description: "Complete the loop back to E102 parking. Re-inflate before the asphalt drive.", waypointType: "end", latitude: 25.167, longitude: 55.842, elevation: "150 m", sequenceNum: 4 },
    ],
  },

  // ── Jebel Jais Summit — Northern Hajar, Ras Al Khaimah ──────────────────
  // Summit verified: 25.9437°N 56.1404°E (UAE's highest peak)
  // Adventure Park base: ~25.880°N 56.075°E
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
    description: "Drive to the UAE's highest peak on a mix of paved and graded gravel roads. Jaw-dropping Hajar panoramas and cool mountain temperatures.",
    approachFrom: "RAK City",
    region: { latitude: 25.808, longitude: 55.952, latitudeDelta: 0.360, longitudeDelta: 0.460 },
    approachCoordinates: [
      { latitude: 25.670, longitude: 55.761 },
      { latitude: 25.710, longitude: 55.800 },
      { latitude: 25.746, longitude: 55.865 },
      { latitude: 25.793, longitude: 55.938 },
      { latitude: 25.833, longitude: 56.015 },
      { latitude: 25.868, longitude: 56.058 },
      { latitude: 25.880, longitude: 56.075 },
    ],
    trailCoordinates: [
      { latitude: 25.880, longitude: 56.075 },
      { latitude: 25.892, longitude: 56.087 },
      { latitude: 25.901, longitude: 56.095 },
      { latitude: 25.909, longitude: 56.105 },
      { latitude: 25.916, longitude: 56.112 },
      { latitude: 25.924, longitude: 56.120 },
      { latitude: 25.931, longitude: 56.127 },
      { latitude: 25.938, longitude: 56.134 },
      { latitude: 25.944, longitude: 56.140 },
    ],
    waypoints: [
      { waypointKey: "10-s", name: "Jais Adventure Base", description: "Start at Jebel Jais Adventure Park (25.880°N 56.075°E, ~500m). Facilities and water.", waypointType: "start", latitude: 25.880, longitude: 56.075, elevation: "500 m", sequenceNum: 0 },
      { waypointKey: "10-p1", name: "Hairpin Ridge Viewpoint", description: "First panorama — RAK coastline and the Gulf visible on clear days.", waypointType: "scenic", latitude: 25.901, longitude: 56.095, elevation: "900 m", sequenceNum: 1 },
      { waypointKey: "10-p2", name: "Technical Rocky Section", description: "Loose shale and boulders on the upper track. 4L recommended. Tyre sidewalls at risk.", waypointType: "technical", latitude: 25.909, longitude: 56.105, elevation: "1,250 m", sequenceNum: 2 },
      { waypointKey: "10-p3", name: "Cloud Ridge", description: "Often shrouded in cloud above 1,600m. Temperature under 15°C even in summer.", waypointType: "scenic", latitude: 25.924, longitude: 56.120, elevation: "1,600 m", sequenceNum: 3 },
      { waypointKey: "10-p4", name: "Near Summit Plateau", description: "Oman border visible. Musandam peninsula and Strait of Hormuz on clear days.", waypointType: "scenic", latitude: 25.931, longitude: 56.127, elevation: "1,800 m", sequenceNum: 4 },
      { waypointKey: "10-e", name: "Jebel Jais Summit", description: "UAE's highest accessible peak (25.9437°N 56.1404°E, 1,934m). Sign the summit register.", waypointType: "summit", latitude: 25.944, longitude: 56.140, elevation: "1,934 m", sequenceNum: 5 },
    ],
  },

  // ── Hatta Rock Pools — Hatta, Dubai enclave ──────────────────────────────
  // Rock Pools verified: 24.787°N 56.114°E | Hatta Dam: 24.801°N 56.111°E
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
    description: "Turquoise rock pools inside a dramatic wadi canyon on the Dubai–Oman border. Rocky descents, water crossings and stunning scenery.",
    approachFrom: "Dubai",
    region: { latitude: 24.763, longitude: 56.078, latitudeDelta: 0.068, longitudeDelta: 0.090 },
    approachCoordinates: [
      { latitude: 25.197, longitude: 55.280 },
      { latitude: 25.100, longitude: 55.450 },
      { latitude: 24.988, longitude: 55.643 },
      { latitude: 24.906, longitude: 55.810 },
      { latitude: 24.855, longitude: 55.965 },
      { latitude: 24.810, longitude: 56.080 },
      { latitude: 24.787, longitude: 56.114 },
    ],
    trailCoordinates: [
      { latitude: 24.787, longitude: 56.114 },
      { latitude: 24.781, longitude: 56.107 },
      { latitude: 24.774, longitude: 56.096 },
      { latitude: 24.766, longitude: 56.082 },
      { latitude: 24.757, longitude: 56.067 },
      { latitude: 24.749, longitude: 56.053 },
      { latitude: 24.738, longitude: 56.040 },
    ],
    waypoints: [
      { waypointKey: "11-s", name: "Rock Pools Car Park", description: "Start at 24.787°N 56.114°E near Hatta Heritage Village. No entry fee.", waypointType: "start", latitude: 24.787, longitude: 56.114, elevation: "355 m", sequenceNum: 0 },
      { waypointKey: "11-p1", name: "First Pool Crossing", description: "Shallow turquoise pool at the wadi mouth. Good 4x4 water crossing practice.", waypointType: "water", latitude: 24.781, longitude: 56.107, elevation: "365 m", sequenceNum: 1 },
      { waypointKey: "11-p2", name: "Canyon Narrows", description: "Walls close to 5m width. Striking layered limestone — look for fossil coral.", waypointType: "scenic", latitude: 24.774, longitude: 56.096, elevation: "375 m", sequenceNum: 2 },
      { waypointKey: "11-p3", name: "Rock Slide Section", description: "Polished rock descent — extremely slippery when wet. Walk the line before driving.", waypointType: "technical", latitude: 24.757, longitude: 56.067, elevation: "395 m", sequenceNum: 3 },
      { waypointKey: "11-p4", name: "Deep Blue Pools", description: "Main swimming pools — up to 3m deep with brilliant turquoise water.", waypointType: "water", latitude: 24.749, longitude: 56.053, elevation: "410 m", sequenceNum: 4 },
      { waypointKey: "11-e", name: "Wadi Highpoint", description: "Oman border begins here — do not proceed without valid Omani visa and permits.", waypointType: "end", latitude: 24.738, longitude: 56.040, elevation: "440 m", sequenceNum: 5 },
    ],
  },

  // ── Darkest Spot Arafa — Rub' al Khali, Abu Dhabi ───────────────────────
  // GPS track: owner-recorded with MotionX GPS, Nov 30 2024 (1:29 pm)
  // Start: 22.9694675°N 53.3745583°E | End: 22.9738592°N 53.4103583°E
  // Distance: 120.6 km | Elevation: 97–159 m | Source notes: see GPX desc
  {
    id: "13",
    name: "Darkest Spot Arafa",
    location: "Arada, Abu Dhabi, UAE",
    difficulty: 9,
    terrain: "Mega Dunes",
    distance: "120 km",
    duration: "Full day+",
    accentColor: "#C0392B",
    elevation: "159 m",
    description: "The darkest spot in the UAE — deepest Rub' al Khali, Arada region. Massive dunes, super-soft sand and countless ditches. Convoy of advanced drivers mandatory — minimum 3 vehicles, do not attempt alone or in two cars. Full recovery gear is a must. Winch strongly recommended. Carry extra water, fuel, oil and spare tyres. Modified or highly capable 4x4 only.",
    approachFrom: "Abu Dhabi",
    region: { latitude: 22.970, longitude: 53.248, latitudeDelta: 0.122, longitudeDelta: 0.346 },
    approachCoordinates: [
      { latitude: 24.453, longitude: 54.377 },
      { latitude: 24.050, longitude: 53.900 },
      { latitude: 23.606, longitude: 53.598 },
      { latitude: 23.134, longitude: 53.773 },
      { latitude: 23.072, longitude: 53.740 },
      { latitude: 22.9694675, longitude: 53.3745583 },
    ],
    trailCoordinates: [
      { latitude: 22.9694675, longitude: 53.3745583 },
      { latitude: 22.9703709, longitude: 53.3654388 },
      { latitude: 22.9704939, longitude: 53.3578531 },
      { latitude: 22.9726395, longitude: 53.3522842 },
      { latitude: 22.9718937, longitude: 53.3437647 },
      { latitude: 22.9753379, longitude: 53.3378483 },
      { latitude: 22.978274,  longitude: 53.3335533 },
      { latitude: 22.9792767, longitude: 53.329012  },
      { latitude: 22.9813157, longitude: 53.3212304 },
      { latitude: 22.980451,  longitude: 53.3140492 },
      { latitude: 22.9815921, longitude: 53.3072314 },
      { latitude: 22.9798491, longitude: 53.2998285 },
      { latitude: 22.9818657, longitude: 53.2896655 },
      { latitude: 22.9808176, longitude: 53.2799337 },
      { latitude: 22.980377,  longitude: 53.2732635 },
      { latitude: 22.9792274, longitude: 53.2649388 },
      { latitude: 22.9795779, longitude: 53.2557546 },
      { latitude: 22.9798526, longitude: 53.2491707 },
      { latitude: 22.9794678, longitude: 53.2416809 },
      { latitude: 22.9803613, longitude: 53.2348807 },
      { latitude: 22.981023,  longitude: 53.2306888 },
      { latitude: 22.9805999, longitude: 53.2262366 },
      { latitude: 22.9829483, longitude: 53.2170901 },
      { latitude: 22.9857334, longitude: 53.210147  },
      { latitude: 22.9886025, longitude: 53.209008  },
      { latitude: 22.9886985, longitude: 53.202584  },
      { latitude: 22.9880272, longitude: 53.1881687 },
      { latitude: 22.9864408, longitude: 53.1799778 },
      { latitude: 22.9918929, longitude: 53.1687025 },
      { latitude: 22.9952439, longitude: 53.1612609 },
      { latitude: 22.9975268, longitude: 53.1505478 },
      { latitude: 23.0023301, longitude: 53.1447543 },
      { latitude: 23.007227,  longitude: 53.1356102 },
      { latitude: 23.0069496, longitude: 53.1285638 },
      { latitude: 23.0128931, longitude: 53.1230368 },
      { latitude: 23.0161568, longitude: 53.1113624 },
      { latitude: 23.0211663, longitude: 53.1034698 },
      { latitude: 23.0178938, longitude: 53.0994007 },
      { latitude: 23.0065265, longitude: 53.0871178 },
      { latitude: 22.9947244, longitude: 53.0852063 },
      { latitude: 22.9931111, longitude: 53.0862866 },
      { latitude: 22.9970774, longitude: 53.0947926 },
      { latitude: 22.9965763, longitude: 53.1027776 },
      { latitude: 22.9897284, longitude: 53.1039681 },
      { latitude: 22.9846105, longitude: 53.1064765 },
      { latitude: 22.9850252, longitude: 53.116215  },
      { latitude: 22.9891899, longitude: 53.1274145 },
      { latitude: 22.9900188, longitude: 53.1367604 },
      { latitude: 22.9876581, longitude: 53.1476725 },
      { latitude: 22.9838502, longitude: 53.1543145 },
      { latitude: 22.9830948, longitude: 53.1571907 },
      { latitude: 22.9739182, longitude: 53.1642806 },
      { latitude: 22.9691434, longitude: 53.1661482 },
      { latitude: 22.9651273, longitude: 53.1702712 },
      { latitude: 22.9608745, longitude: 53.1755137 },
      { latitude: 22.9591799, longitude: 53.1835019 },
      { latitude: 22.9575082, longitude: 53.1902105 },
      { latitude: 22.9624482, longitude: 53.1982249 },
      { latitude: 22.9667559, longitude: 53.2060954 },
      { latitude: 22.9683864, longitude: 53.21028   },
      { latitude: 22.9721255, longitude: 53.2190224 },
      { latitude: 22.9683187, longitude: 53.2295468 },
      { latitude: 22.9670551, longitude: 53.233693  },
      { latitude: 22.9633107, longitude: 53.240455  },
      { latitude: 22.9555111, longitude: 53.2465363 },
      { latitude: 22.9476419, longitude: 53.2501039 },
      { latitude: 22.9410888, longitude: 53.2563171 },
      { latitude: 22.9353484, longitude: 53.263681  },
      { latitude: 22.9321858, longitude: 53.268901  },
      { latitude: 22.9263041, longitude: 53.2747914 },
      { latitude: 22.9210605, longitude: 53.2821195 },
      { latitude: 22.9200487, longitude: 53.290844  },
      { latitude: 22.9194904, longitude: 53.297149  },
      { latitude: 22.921965,  longitude: 53.307144  },
      { latitude: 22.9223207, longitude: 53.3134762 },
      { latitude: 22.928085,  longitude: 53.3160324 },
      { latitude: 22.9393471, longitude: 53.3234733 },
      { latitude: 22.9432778, longitude: 53.3487477 },
      { latitude: 22.9634347, longitude: 53.377672  },
      { latitude: 22.9739671, longitude: 53.3987107 },
      { latitude: 22.9738592, longitude: 53.4103583 },
    ],
    waypoints: [
      { waypointKey: "13-s", name: "Arada Desert Entry", description: "Last tarmac ends here. Convoy briefing point. Deflate to 8–12 PSI. Confirm all vehicles have full fuel, water and spare tyres.", waypointType: "start", latitude: 22.9694675, longitude: 53.3745583, elevation: "117 m", sequenceNum: 0 },
      { waypointKey: "13-p1", name: "First Mega Dune Field", description: "Largest dune complex begins. Very soft sand and sudden ditches. Single file, maintain momentum.", waypointType: "technical", latitude: 22.9813157, longitude: 53.3212304, elevation: "135 m", sequenceNum: 1 },
      { waypointKey: "13-p2", name: "Deep Desert Waypoint", description: "Westernmost point of the route — furthest from help. 60+ km to nearest paved road. Convoy check stop.", waypointType: "camp", latitude: 23.0128931, longitude: 53.1230368, elevation: "148 m", sequenceNum: 2 },
      { waypointKey: "13-p3", name: "Return Dune Ridge", description: "Exposed knife-edge dune ridge on the return leg. High risk of getting stuck — winch anchor points scarce.", waypointType: "technical", latitude: 22.9393471, longitude: 53.3234733, elevation: "142 m", sequenceNum: 3 },
      { waypointKey: "13-e", name: "Arafa Exit Point", description: "Trail rejoins desert track toward Liwa. Re-inflate all tyres. Check air filters before long drive back.", waypointType: "end", latitude: 22.9738592, longitude: 53.4103583, elevation: "120 m", sequenceNum: 4 },
    ],
    tags: {
      convoy_required: "yes",
      min_vehicles: "3",
      winch: "recommended",
      recovery_gear: "required",
      spare_fuel: "required",
      spare_tires: "required",
      modified_4x4: "required",
      gpx_source: "owner_recorded",
      gpx_date: "2024-11-30",
    },
  },

  // ── Al Qua' Dunes (Tal Moreeb) — Liwa Oasis, Abu Dhabi ─────────────────
  // Tal Moreeb race site: 23.072°N 53.740°E (south of Liwa town, Abu Dhabi desert)
  // Liwa Oasis center: 23.134°N 53.773°E | Madinat Zayed: 23.606°N 53.598°E
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
    description: "UAE's most extreme dune driving. Towering 300m mega-dunes near Liwa Oasis. Home of the famous Moreeb Hill (Tal Moreeb) race. Mandatory convoy, recovery gear and experienced lead driver.",
    approachFrom: "Abu Dhabi",
    region: { latitude: 23.072, longitude: 53.740, latitudeDelta: 0.040, longitudeDelta: 0.055 },
    approachCoordinates: [
      { latitude: 24.453, longitude: 54.377 },
      { latitude: 24.050, longitude: 53.900 },
      { latitude: 23.606, longitude: 53.598 },
      { latitude: 23.134, longitude: 53.773 },
      { latitude: 23.110, longitude: 53.755 },
      { latitude: 23.072, longitude: 53.740 },
    ],
    trailCoordinates: [
      { latitude: 23.072, longitude: 53.740 },
      { latitude: 23.077, longitude: 53.747 },
      { latitude: 23.082, longitude: 53.752 },
      { latitude: 23.086, longitude: 53.750 },
      { latitude: 23.086, longitude: 53.743 },
      { latitude: 23.082, longitude: 53.734 },
      { latitude: 23.076, longitude: 53.733 },
      { latitude: 23.074, longitude: 53.737 },
      { latitude: 23.072, longitude: 53.740 },
    ],
    waypoints: [
      { waypointKey: "12-s", name: "Tal Moreeb Base", description: "MANDATORY convoy — min 3 vehicles (23.072°N 53.740°E). Deflate to 8–12 PSI. Flag vehicle.", waypointType: "start", latitude: 23.072, longitude: 53.740, elevation: "200 m", sequenceNum: 0 },
      { waypointKey: "12-p1", name: "North Dune Approach", description: "Entry ramp to the mega-dune. Approach perfectly straight — any angle risks rollover.", waypointType: "technical", latitude: 23.082, longitude: 53.752, elevation: "350 m", sequenceNum: 1 },
      { waypointKey: "12-p2", name: "Dune Bowl", description: "Natural amphitheatre between dunes. Recovery operations stage here.", waypointType: "camp", latitude: 23.082, longitude: 53.734, elevation: "320 m", sequenceNum: 2 },
      { waypointKey: "12-p3", name: "Moreeb Summit", description: "UAE's highest dune (~300m above surrounding desert). Sunrise view is legendary.", waypointType: "summit", latitude: 23.086, longitude: 53.743, elevation: "500 m", sequenceNum: 3 },
      { waypointKey: "12-p4", name: "Return Ridge", description: "Knife-edge dune ridge — single file, slow speed. Wind erosion sculpts new shapes daily.", waypointType: "technical", latitude: 23.076, longitude: 53.733, elevation: "380 m", sequenceNum: 4 },
      { waypointKey: "12-e", name: "Base Camp Return", description: "Re-inflate ALL tyres to street pressure. Check for sand in air filters before the long drive.", waypointType: "end", latitude: 23.072, longitude: 53.740, elevation: "200 m", sequenceNum: 5 },
    ],
  },
];

export async function seedTrails() {
  const count = await getTrailCount();
  if (count > 0) {
    console.log(`[seed] Database already has ${count} trails — skipping seed.`);
    return;
  }
  console.log("[seed] Seeding 13 curated trails with verified GPS coordinates...");
  for (const t of CURATED_TRAILS) {
    const elevationProfile = computeElevationProfile(t.waypoints);
    await insertTrailFull({
      trail: {
        name: t.name,
        location: t.location,
        difficulty: t.difficulty,
        terrain: t.terrain,
        distance: t.distance,
        duration: t.duration,
        distanceMeters: parseDistanceToMeters(t.distance),
        durationSeconds: parseDurationToSeconds(t.duration),
        elevationGainMeters: elevationProfile.gain,
        elevationLossMeters: elevationProfile.loss,
        accentColor: t.accentColor,
        elevation: t.elevation,
        description: t.description,
        approachFrom: t.approachFrom,
        activityType: "offroad",
        source: "curated",
        status: "published",
        osmAttribution: false,
        tags: (t as any).tags ?? {},
        regionLat: t.region.latitude,
        regionLng: t.region.longitude,
        regionLatDelta: t.region.latitudeDelta,
        regionLngDelta: t.region.longitudeDelta,
      },
      approachCoordinates: t.approachCoordinates,
      trailCoordinates: t.trailCoordinates,
      waypoints: t.waypoints,
    });
  }
  console.log("[seed] Done — 13 trails seeded with verified GPS coordinates.");
}
