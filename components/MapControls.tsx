import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { GlassPanel, IconButton } from "@/components/cockpit";
import { LAYER_META, type AdventureBaseLayer } from "@/components/AdventureMap";
import * as haptics from "@/lib/haptics";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

/* ────────────────────────────────────────────────────────────────────────── *
 *  LayerSwitcher — expandable satellite / topo / terrain base-layer control
 * ────────────────────────────────────────────────────────────────────────── */
export function LayerSwitcher({
  value,
  onChange,
}: {
  value: AdventureBaseLayer;
  onChange: (v: AdventureBaseLayer) => void;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const active = LAYER_META.find((l) => l.value === value) ?? LAYER_META[0];

  if (!open) {
    return (
      <IconButton
        icon={(active.icon as IoniconName) ?? "layers-outline"}
        surface="map"
        accessibilityLabel="Change map layer"
        testID="layer-switcher-toggle"
        onPress={() => {
          haptics.tapLight();
          setOpen(true);
        }}
      />
    );
  }

  return (
    <GlassPanel surface="map" radius={colors.radiusLg} intensity={36}>
      <View style={{ padding: 5, gap: 3 }}>
        {LAYER_META.map((layer) => {
          const selected = layer.value === value;
          return (
            <TouchableOpacity
              key={layer.value}
              activeOpacity={0.8}
              testID={`layer-option-${layer.value}`}
              onPress={() => {
                haptics.selection();
                onChange(layer.value);
                setOpen(false);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 9,
                paddingVertical: 9,
                paddingHorizontal: 12,
                borderRadius: colors.radiusSm,
                backgroundColor: selected ? colors.accent : "transparent",
              }}
            >
              <Ionicons
                name={(layer.icon as IoniconName) ?? "layers-outline"}
                size={17}
                color={selected ? "#FFFFFF" : colors.onMap}
              />
              <Text
                style={{
                  fontFamily: selected ? "Inter_600SemiBold" : "Inter_500Medium",
                  fontSize: 13,
                  color: selected ? "#FFFFFF" : colors.onMap,
                }}
              >
                {layer.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </GlassPanel>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  CompassRose — shows the map bearing; tap to reset the map to north-up
 * ────────────────────────────────────────────────────────────────────────── */
export function CompassRose({
  heading,
  onPress,
  size = 46,
}: {
  heading: number;
  onPress: () => void;
  size?: number;
}) {
  const colors = useColors();

  // Rotate the rose opposite to the camera heading so "N" points true north.
  const needleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(`${-heading}deg`, { duration: 120 }) }],
  }));

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => {
        haptics.tapLight();
        onPress();
      }}
      accessibilityLabel="Reset map orientation to north"
      testID="compass-rose"
    >
      <GlassPanel surface="map" radius={size / 2} intensity={36}>
        <Animated.View
          style={[
            {
              width: size,
              height: size,
              alignItems: "center",
              justifyContent: "center",
            },
            needleStyle,
          ]}
        >
          <Ionicons name="navigate" size={size * 0.34} color={colors.danger} style={{ marginBottom: 1 }} />
          <Text
            style={{
              position: "absolute",
              top: 4,
              fontSize: 8,
              fontFamily: "Inter_700Bold",
              color: colors.onMap,
            }}
          >
            N
          </Text>
        </Animated.View>
      </GlassPanel>
    </TouchableOpacity>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  MyLocationButton — triangle/arrow that recenters on the live position.
 *  `mode` cycles free → follow → heading-up so the icon reflects state.
 * ────────────────────────────────────────────────────────────────────────── */
export function MyLocationButton({
  mode,
  onPress,
  disabled = false,
}: {
  mode: "free" | "follow" | "heading";
  onPress: () => void;
  disabled?: boolean;
}) {
  const icon: IoniconName =
    mode === "heading" ? "navigate" : mode === "follow" ? "locate" : "locate-outline";
  return (
    <IconButton
      icon={icon}
      surface="map"
      active={mode !== "free"}
      accessibilityLabel="Recenter on my location"
      testID="my-location-button"
      onPress={onPress}
      style={disabled ? { opacity: 0.45 } : undefined}
    />
  );
}
