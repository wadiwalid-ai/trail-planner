import type { ThemeName } from "./colors";

// Theme-aware font roles. Components read these via `useType()` instead of
// hardcoding "Inter_*", so each theme carries its own typographic voice.
// All families are loaded up-front in app/_layout.tsx; Inter is always loaded
// as the ultimate fallback.
export interface ThemeFont {
  regular: string;
  medium: string;
  semibold: string;
  bold: string;
  display: string; // section / hero titles
  displayBold: string;
  heavy: string; // extra-bold display flourish
  mono: string; // stats / coordinates / labels
  monoMedium: string;
}

export const themeFonts: Record<ThemeName, ThemeFont> = {
  // Dune — Outfit throughout, heavy weights for a luxe display voice.
  dune: {
    regular: "Outfit_400Regular",
    medium: "Outfit_500Medium",
    semibold: "Outfit_600SemiBold",
    bold: "Outfit_700Bold",
    display: "Outfit_600SemiBold",
    displayBold: "Outfit_700Bold",
    heavy: "Outfit_800ExtraBold",
    mono: "Outfit_500Medium",
    monoMedium: "Outfit_600SemiBold",
  },
  // Overland — Inter body, IBM Plex Mono for cartographic coords/labels.
  overland: {
    regular: "Inter_400Regular",
    medium: "Inter_500Medium",
    semibold: "Inter_600SemiBold",
    bold: "Inter_700Bold",
    display: "Inter_700Bold",
    displayBold: "Inter_700Bold",
    heavy: "Inter_700Bold",
    mono: "IBMPlexMono_400Regular",
    monoMedium: "IBMPlexMono_500Medium",
  },
  // Apex — Outfit display, JetBrains Mono for HUD stats.
  apex: {
    regular: "Outfit_400Regular",
    medium: "Outfit_500Medium",
    semibold: "Outfit_600SemiBold",
    bold: "Outfit_700Bold",
    display: "Outfit_700Bold",
    displayBold: "Outfit_800ExtraBold",
    heavy: "Outfit_800ExtraBold",
    mono: "JetBrainsMono_400Regular",
    monoMedium: "JetBrainsMono_700Bold",
  },
  // Horizon — DM Sans body, Outfit for editorial display titles.
  horizon: {
    regular: "DMSans_400Regular",
    medium: "DMSans_500Medium",
    semibold: "DMSans_600SemiBold",
    bold: "DMSans_700Bold",
    display: "Outfit_600SemiBold",
    displayBold: "Outfit_700Bold",
    heavy: "Outfit_800ExtraBold",
    mono: "DMSans_500Medium",
    monoMedium: "DMSans_600SemiBold",
  },
};
