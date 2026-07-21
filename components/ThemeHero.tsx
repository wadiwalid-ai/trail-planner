import React from "react";
import { ImageBackground, Platform, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/context/ThemeContext";
import { themeHero } from "@/constants/themeAssets";

// The Explore hero. Renders one of three treatments based on the active theme's
// config: a full-bleed photo (with scrim + optional rounded bottom), a
// cartographic map block, or the legacy primary→primaryLight gradient header.
// Header content (location label, name, units toggle) is passed as children so
// the screen owns the copy while the hero owns the chrome.
export function ThemeHero({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const { themeName } = useTheme();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const cfg = themeHero[themeName];
  const paddingTop = topInset + 16;

  const rounded = cfg.roundedBottom
    ? {
        borderBottomLeftRadius: colors.radiusXl,
        borderBottomRightRadius: colors.radiusXl,
      }
    : null;

  if (cfg.kind === "photo" && cfg.image) {
    return (
      <View style={[styles.photoWrap, rounded, { height: cfg.height + topInset }]}>
        <ImageBackground
          source={cfg.image}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
        >
          {cfg.scrim ? (
            <LinearGradient
              colors={["rgba(0,0,0,0.18)", "rgba(0,0,0,0)", "rgba(0,0,0,0.58)"]}
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
        </ImageBackground>
        <View style={[styles.photoContent, { paddingTop }]}>{children}</View>
      </View>
    );
  }

  // gradient (legacy / default) — matches the previous hero exactly.
  return (
    <LinearGradient
      colors={[colors.primary, colors.primaryLight]}
      style={[styles.gradient, { paddingTop }]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  photoWrap: {
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  photoContent: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    // Extra bottom room so the floating weather card (which overlaps the hero)
    // never clips the hero's location/toggle row.
    paddingBottom: 40,
  },
  gradient: {
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
});
