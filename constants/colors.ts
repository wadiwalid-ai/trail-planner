export type ThemeName = "dune" | "overland" | "apex" | "horizon";

const sharedRadius = {
  radius: 16,
  radiusSm: 10,
  radiusLg: 22,
  radiusXl: 28,
  radiusPill: 999,
};

// Default (dark) map panel treatment — floating glass cards over the live map.
// Light themes (overland/horizon) override these so panels stay legible over
// light cartographic tiles.
const sharedMap = {
  mapPanel: "rgba(18,26,21,0.62)",
  mapPanelStrong: "rgba(8,14,11,0.84)",
  mapPanelBorder: "rgba(255,255,255,0.14)",
  onMap: "#FFFFFF",
  onMapMuted: "rgba(255,255,255,0.7)",
};

// Semantic colors that carry meaning rather than theme styling: navigation/
// approach route (routeNav), technical-section overlays (technical), and media
// pins (mediaAudio/mediaPhoto). Kept as named tokens so they stay consistent in
// meaning across themes while each theme can tune the exact shade for contrast
// against its own map/surface backgrounds.
const sharedSemantic = {
  routeNav: "#3B82F6",
  technical: "#C0392B",
  mediaAudio: "#8E44AD",
  mediaPhoto: "#16A085",
};

// Contrast/light-mode roles. `mode` drives StatusBar bar-style + BlurView tint.
// onHero* = text/icons over the Explore hero (gradient/photo/map per theme).
// onPrimary* = text/icons/fills sitting on a saturated primary/accent surface
// (buttons, badges, the AI banner). White reads on most saturated accents
// (rust/sky), but bright accents (cyan/gold) need dark on-primary text, so
// apex/dune override these.
const sharedContrast = {
  mode: "dark" as "light" | "dark",
  onHero: "#FFFFFF",
  onHeroMuted: "rgba(255,255,255,0.7)",
  onPrimary: "#FFFFFF",
  onPrimaryMuted: "rgba(255,255,255,0.75)",
  onPrimaryFill: "rgba(255,255,255,0.2)",
  onPrimaryBorder: "rgba(255,255,255,0.3)",
};

const themes = {
  // ── DUNE — Dark Luxury (warm gold, textured) ────────────────────────────
  dune: {
    ...sharedRadius,
    ...sharedMap,
    ...sharedSemantic,
    ...sharedContrast,
    radius: 18,
    radiusSm: 12,
    radiusLg: 24,
    radiusXl: 30,
    radiusPill: 999,
    // Warmer route/technical/media so they stay legible over the warm map.
    routeNav: "#4A90E2",
    technical: "#E0584A",
    mediaAudio: "#A569BD",
    mediaPhoto: "#17A589",
    primary: "#D89F5C",
    primaryLight: "#F0C593",
    accent: "#D89F5C",
    accentLight: "#F0C593",
    gold: "#D89F5C",
    background: "#1C1511",
    backgroundSecondary: "#241A14",
    surface: "#2B201A",
    surfaceSecondary: "#3C2C23",
    border: "rgba(216,159,92,0.24)",
    text: "#F5ECE4",
    textSecondary: "#B8A698",
    textMuted: "rgba(184,166,152,0.6)",
    tint: "#D89F5C",
    tabIconDefault: "rgba(245,236,228,0.4)",
    tabIconSelected: "#D89F5C",
    success: "#9CB87A",
    warning: "#E8B74D",
    danger: "#D9594A",
    overlay: "rgba(0,0,0,0.74)",
    cardShadow: "rgba(0,0,0,0.55)",
    glass: "rgba(28,21,17,0.86)",
    glassStrong: "rgba(20,15,12,0.94)",
    glassBorder: "rgba(216,159,92,0.28)",
    glassHairline: "rgba(216,159,92,0.12)",
    glassTint: "dark" as "light" | "dark",
    onGlass: "#F5ECE4",
    onGlassMuted: "rgba(245,236,228,0.5)",
    scrim: "rgba(0,0,0,0.6)",
    tabAccentGlow: "rgba(216,159,92,0.3)",
    // Gold accent is light — buttons/badges need dark on-primary text.
    onPrimary: "#1C1511",
    onPrimaryMuted: "rgba(28,21,17,0.7)",
    onPrimaryFill: "rgba(28,21,17,0.12)",
    onPrimaryBorder: "rgba(28,21,17,0.22)",
  },

  // ── OVERLAND — Light Cartographic (warm paper, rust + brass) ─────────────
  overland: {
    ...sharedRadius,
    ...sharedMap,
    ...sharedSemantic,
    ...sharedContrast,
    radius: 6,
    radiusSm: 4,
    radiusLg: 8,
    radiusXl: 12,
    radiusPill: 6,
    routeNav: "#2F6FB0",
    technical: "#B33A2B",
    mediaAudio: "#7D5BA6",
    mediaPhoto: "#2E7D6B",
    mode: "light" as "light" | "dark",
    primary: "#A64B2A",
    primaryLight: "#C16A45",
    accent: "#A64B2A",
    accentLight: "#B88E52",
    gold: "#B88E52",
    background: "#EBE5D9",
    backgroundSecondary: "#E2DBCC",
    surface: "#F4F1EA",
    surfaceSecondary: "#FBF9F3",
    border: "rgba(44,42,38,0.12)",
    text: "#2C2A26",
    textSecondary: "#59554D",
    textMuted: "rgba(44,42,38,0.45)",
    tint: "#A64B2A",
    tabIconDefault: "rgba(44,42,38,0.4)",
    tabIconSelected: "#A64B2A",
    success: "#4F7942",
    warning: "#B88E52",
    danger: "#A6402A",
    overlay: "rgba(28,24,18,0.55)",
    cardShadow: "rgba(44,42,38,0.12)",
    glass: "rgba(244,241,234,0.82)",
    glassStrong: "rgba(244,241,234,0.95)",
    glassBorder: "rgba(44,42,38,0.1)",
    glassHairline: "rgba(44,42,38,0.06)",
    glassTint: "light" as "light" | "dark",
    onGlass: "#2C2A26",
    onGlassMuted: "rgba(44,42,38,0.5)",
    scrim: "rgba(28,24,18,0.45)",
    tabAccentGlow: "transparent",
    // Light map panels for the cartographic theme.
    mapPanel: "rgba(244,241,234,0.86)",
    mapPanelStrong: "rgba(244,241,234,0.96)",
    mapPanelBorder: "rgba(44,42,38,0.12)",
    onMap: "#2C2A26",
    onMapMuted: "rgba(44,42,38,0.6)",
    // Overland still uses the gradient header until its map-hero phase ships,
    // so hero text stays white (inherited from sharedContrast). The map phase
    // re-adds dark onHero/onHeroMuted overrides for the light cartographic block.
  },

  // ── APEX — Dark HUD (cyan glow, photographic) ────────────────────────────
  apex: {
    ...sharedRadius,
    ...sharedMap,
    ...sharedSemantic,
    ...sharedContrast,
    radius: 8,
    radiusSm: 4,
    radiusLg: 12,
    radiusXl: 16,
    radiusPill: 999,
    routeNav: "#4DA6FF",
    technical: "#FF453A",
    mediaAudio: "#B07CD6",
    mediaPhoto: "#1ABC9C",
    primary: "#22D3EE",
    primaryLight: "#67E8F9",
    accent: "#22D3EE",
    accentLight: "#67E8F9",
    gold: "#22D3EE",
    background: "#0A0A0C",
    backgroundSecondary: "#121214",
    surface: "#18181B",
    surfaceSecondary: "#1F1F23",
    border: "#27272A",
    text: "#FFFFFF",
    textSecondary: "rgba(255,255,255,0.65)",
    textMuted: "#737373",
    tint: "#22D3EE",
    tabIconDefault: "rgba(255,255,255,0.35)",
    tabIconSelected: "#22D3EE",
    success: "#34D399",
    warning: "#FBBF24",
    danger: "#EF4444",
    overlay: "rgba(0,0,0,0.85)",
    cardShadow: "rgba(0,0,0,0.8)",
    glass: "rgba(10,10,12,0.85)",
    glassStrong: "rgba(6,6,8,0.95)",
    glassBorder: "rgba(34,211,238,0.25)",
    glassHairline: "rgba(34,211,238,0.1)",
    glassTint: "dark" as "light" | "dark",
    onGlass: "#FFFFFF",
    onGlassMuted: "rgba(255,255,255,0.45)",
    scrim: "rgba(0,0,0,0.8)",
    tabAccentGlow: "rgba(34,211,238,0.35)",
    // Bright cyan accent — buttons/badges need dark on-primary text.
    onPrimary: "#0A0A0C",
    onPrimaryMuted: "rgba(10,10,12,0.7)",
    onPrimaryFill: "rgba(10,10,12,0.15)",
    onPrimaryBorder: "rgba(10,10,12,0.28)",
  },

  // ── HORIZON — Light Editorial (sky + sunset, soft, airy) ─────────────────
  horizon: {
    ...sharedRadius,
    ...sharedMap,
    ...sharedSemantic,
    ...sharedContrast,
    radius: 18,
    radiusSm: 12,
    radiusLg: 24,
    radiusXl: 32,
    radiusPill: 999,
    routeNav: "#2563EB",
    technical: "#DC2626",
    mediaAudio: "#7C3AED",
    mediaPhoto: "#0D9488",
    mode: "light" as "light" | "dark",
    primary: "#0EA5E9",
    primaryLight: "#38BDF8",
    accent: "#0EA5E9",
    accentLight: "#38BDF8",
    gold: "#F97316",
    background: "#FCFBF9",
    backgroundSecondary: "#F5F3EC",
    surface: "#FFFFFF",
    surfaceSecondary: "#F8FAFC",
    border: "rgba(15,23,42,0.08)",
    text: "#0F172A",
    textSecondary: "#64748B",
    textMuted: "rgba(15,23,42,0.4)",
    tint: "#0EA5E9",
    tabIconDefault: "rgba(15,23,42,0.4)",
    tabIconSelected: "#0EA5E9",
    success: "#10B981",
    warning: "#F59E0B",
    danger: "#EF4444",
    overlay: "rgba(15,23,42,0.5)",
    cardShadow: "rgba(15,23,42,0.1)",
    glass: "rgba(255,255,255,0.72)",
    glassStrong: "rgba(255,255,255,0.92)",
    glassBorder: "rgba(15,23,42,0.08)",
    glassHairline: "rgba(15,23,42,0.04)",
    glassTint: "light" as "light" | "dark",
    onGlass: "#0F172A",
    onGlassMuted: "rgba(15,23,42,0.5)",
    scrim: "rgba(0,0,0,0.45)",
    tabAccentGlow: "rgba(14,165,233,0.25)",
    // Light map panels for the editorial theme.
    mapPanel: "rgba(255,255,255,0.85)",
    mapPanelStrong: "rgba(255,255,255,0.96)",
    mapPanelBorder: "rgba(15,23,42,0.08)",
    onMap: "#0F172A",
    onMapMuted: "rgba(15,23,42,0.6)",
    // Hero is a full-bleed photo — text over it stays white.
  },
};

export type AppColors = typeof themes.dune;

// ── Route legibility helpers ────────────────────────────────────────────────
// Each trail carries its own free-form `accentColor` (data, not a theme token).
// When that accent happens to be close to the blue navigation/approach route
// line (`routeNav`), the two blue lines blur together where they overlap. These
// helpers detect that clash so callers can draw a contrasting casing/outline
// beneath the route line, keeping it distinguishable without changing its color.

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// Euclidean RGB distance between two hex colors (0 = identical). Returns a large
// number when either color can't be parsed so we never falsely flag a clash.
export function colorDistance(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return Number.POSITIVE_INFINITY;
  const dr = ca.r - cb.r;
  const dg = ca.g - cb.g;
  const db = ca.b - cb.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// Contrasting casing color drawn beneath a `routeNav` line. Returns a color only
// when the underlying trail accent is close enough to the route blue to risk a
// clash; otherwise returns undefined so no extra casing is rendered. The casing
// is a near-white halo, which reads against both a blue route line and a blue
// trail line on light or dark map tiles.
export function routeNavCasing(
  accentColor: string | null | undefined,
  routeNav: string,
): string | undefined {
  if (!accentColor) return undefined;
  return colorDistance(accentColor, routeNav) < 120 ? "#FFFFFF" : undefined;
}

export default themes;
