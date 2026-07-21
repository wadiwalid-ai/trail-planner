import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassPanel, IconButton, type } from "@/components/cockpit";
import { useColors } from "@/hooks/useColors";
import { useUnits } from "@/context/UnitsContext";
import { compass8 } from "@/lib/navigation";

/* ──────────────────────────────────────────────────────────────────────────
 *  NavigationHUD — floating guidance card for route / follow / retrace modes.
 *  Shows a bearing arrow (relative to the device's current heading), the
 *  remaining distance, optional ETA, and an off-route warning banner.
 * ────────────────────────────────────────────────────────────────────────── */

interface NavigationHUDProps {
  title: string;
  /** Bearing to the next point, degrees from true north. */
  bearingToNext: number;
  /** The device's current heading, degrees from true north. */
  deviceHeading: number;
  remainingMeters: number;
  /** Optional ETA in seconds (only known for routed trips). */
  etaSeconds?: number | null;
  offRoute: boolean;
  arrived: boolean;
  accent?: string;
  onStop: () => void;
}

export function NavigationHUD({
  title,
  bearingToNext,
  deviceHeading,
  remainingMeters,
  etaSeconds,
  offRoute,
  arrived,
  accent,
  onStop,
}: NavigationHUDProps) {
  const colors = useColors();
  const units = useUnits();

  // Relative bearing: where to steer given which way the device faces.
  const relative = ((bearingToNext - deviceHeading) % 360 + 360) % 360;
  const distanceLabel =
    units.formatDistance(remainingMeters) ?? `${Math.round(remainingMeters)} m`;
  const accentColor = accent ?? colors.accent;

  let etaLabel: string | null = null;
  if (typeof etaSeconds === "number" && etaSeconds > 0) {
    etaLabel = units.formatDuration(etaSeconds);
  }

  const turnHint = arrived
    ? "You've arrived"
    : `Head ${compass8(bearingToNext)} · ${Math.round(relative)}°`;

  return (
    <GlassPanel surface="map" radius={colors.radiusLg} intensity={50}>
      <View style={styles.row}>
        {/* Bearing arrow */}
        <View style={[styles.arrowWrap, { borderColor: accentColor }]}>
          <View style={{ transform: [{ rotate: `${relative}deg` }] }}>
            <Ionicons
              name={arrived ? "flag" : "navigate"}
              size={28}
              color={arrived ? colors.success : accentColor}
            />
          </View>
        </View>

        {/* Text block */}
        <View style={{ flex: 1 }}>
          <Text style={[type.overline, { color: colors.onMapMuted }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[type.mono, { color: colors.onMap, fontSize: 24 }]} numberOfLines={1}>
            {arrived ? "Arrived" : distanceLabel}
          </Text>
          <Text
            style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.onMapMuted }}
            numberOfLines={1}
          >
            {turnHint}
            {etaLabel ? ` · ${etaLabel}` : ""}
          </Text>
        </View>

        {/* Stop button */}
        <IconButton
          icon="close"
          surface="map"
          onPress={onStop}
          accessibilityLabel="Stop navigation"
          testID="nav-stop"
        />
      </View>

      {offRoute && !arrived && (
        <View style={[styles.banner, { backgroundColor: colors.danger }]}>
          <Ionicons name="warning" size={14} color="#FFFFFF" />
          <Text style={styles.bannerText}>Off route — steer back to the line</Text>
        </View>
      )}
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  arrowWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bannerText: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
});
