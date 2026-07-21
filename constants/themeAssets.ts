import type { ImageSourcePropType } from "react-native";
import type { ThemeName } from "./colors";

// Static image registry — React Native cannot resolve dynamic require() paths,
// so every theme asset is required up-front here and referenced by key.
export const heroImages = {
  horizonHero: require("@/assets/images/themes/horizon-hero.png") as ImageSourcePropType,
  apexBigRed: require("@/assets/images/themes/apex-big-red.png") as ImageSourcePropType,
  duneBg: require("@/assets/images/themes/dune-bg.png") as ImageSourcePropType,
  overlandHeroMap: require("@/assets/images/themes/overland-hero-map.png") as ImageSourcePropType,
} as const;

export type ThemeHeroKind = "photo" | "map" | "gradient";

export interface ThemeHeroConfig {
  // photo = full-bleed image + scrim; map = cartographic block; gradient = the
  // legacy LinearGradient header (default until a theme's phase upgrades it).
  kind: ThemeHeroKind;
  image?: ImageSourcePropType;
  height: number; // native hero height (web adds status-bar inset separately)
  roundedBottom?: boolean; // rounded bottom corners (editorial look)
  scrim?: boolean; // dark bottom scrim under text over a photo
}

// Per-theme Explore hero. All four themes share the Apex Explore layout (inset
// rounded photo hero + overlapping condition stats). Each keeps its own hero
// photo, colors, fonts and corner radius, so the layout is identical but the
// skin is per-theme.
export const themeHero: Record<ThemeName, ThemeHeroConfig> = {
  dune: { kind: "photo", image: heroImages.duneBg, height: 288, scrim: true },
  overland: { kind: "photo", image: heroImages.overlandHeroMap, height: 288, scrim: true },
  apex: { kind: "photo", image: heroImages.apexBigRed, height: 288, scrim: true },
  horizon: { kind: "photo", image: heroImages.horizonHero, height: 288, scrim: true },
};
