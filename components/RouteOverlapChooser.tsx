import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { GlassPanel } from "@/components/cockpit";
import { useColors } from "@/hooks/useColors";

/**
 * One entry offered when a tap lands where several route lines overlap.
 * Deliberately map-agnostic so any screen (not just the main map) can feed its
 * own routes/trails/tracks into the same chooser experience.
 */
export interface OverlapChoice {
  id: string;
  name: string;
  /** Vertical accent bar colour (usually the route's own colour). */
  accentColor?: string | null;
  /** Small status dot colour (e.g. difficulty). Omit to hide the dot. */
  dotColor?: string | null;
  /** Secondary line, e.g. "3 km away · Wadi Ghalilah". */
  subtitle?: string | null;
}

/**
 * Reusable overlapping-route chooser.
 *
 * When a tap overlaps 2+ chooser-eligible lines the engine reports every id via
 * `AdventureMap.onLinesPress`; the screen resolves those to `OverlapChoice`
 * entries (see `resolveOverlapSelection` in adventureMapShared) and renders this
 * list so the user picks one instead of silently getting the nearest. Extracted
 * from the map screen so the identical experience is available anywhere routes
 * are drawn. The caller positions it via `containerStyle` (usually absolute).
 */
export function RouteOverlapChooser({
  choices,
  title,
  onPick,
  onDismiss,
  containerStyle,
}: {
  choices: OverlapChoice[];
  title?: string;
  onPick: (id: string) => void;
  onDismiss: () => void;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  if (choices.length <= 1) return null;

  return (
    <View style={containerStyle} pointerEvents="box-none">
      <View style={{ maxWidth: 360, width: "100%" }}>
        <GlassPanel surface="map" radius={colors.radiusLg} intensity={48}>
          <View style={styles.head}>
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                color: colors.onMap,
                fontFamily: "Inter_700Bold",
                fontSize: 14,
              }}
            >
              {title ?? `${choices.length} here`}
            </Text>
            <TouchableOpacity onPress={onDismiss} hitSlop={10} testID="dismiss-line-chooser">
              <Ionicons name="close-circle" size={22} color={colors.onMapMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 220 }}
            showsVerticalScrollIndicator={false}
          >
            {choices.map((c) => (
              <TouchableOpacity
                key={c.id}
                activeOpacity={0.8}
                testID={`line-chooser-${c.id}`}
                onPress={() => onPick(c.id)}
                style={styles.row}
              >
                <View
                  style={[styles.accent, { backgroundColor: c.accentColor ?? colors.accent }]}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: colors.onMap,
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 14,
                    }}
                  >
                    {c.name}
                  </Text>
                  {c.subtitle ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 2,
                      }}
                    >
                      {c.dotColor ? (
                        <View style={[styles.dot, { backgroundColor: c.dotColor }]} />
                      ) : null}
                      <Text
                        numberOfLines={1}
                        style={{
                          color: colors.onMapMuted,
                          fontFamily: "Inter_500Medium",
                          fontSize: 11,
                        }}
                      >
                        {c.subtitle}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.onMapMuted} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </GlassPanel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  accent: { width: 4, height: 32, borderRadius: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
