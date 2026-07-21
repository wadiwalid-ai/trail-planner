import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TextStyle,
  StyleProp,
  Platform,
  ActivityIndicator,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import * as haptics from "@/lib/haptics";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];
type Surface = "glass" | "map" | "solid";

/* ────────────────────────────────────────────────────────────────────────── *
 *  Typography
 * ────────────────────────────────────────────────────────────────────────── */
export const type = StyleSheet.create({
  display: { fontFamily: "Inter_700Bold", fontSize: 34, letterSpacing: -0.5 },
  title: { fontFamily: "Inter_700Bold", fontSize: 22, letterSpacing: -0.3 },
  heading: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
  body: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 21 },
  label: { fontFamily: "Inter_500Medium", fontSize: 13 },
  caption: { fontFamily: "Inter_500Medium", fontSize: 12 },
  overline: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  mono: { fontFamily: "Inter_700Bold", fontSize: 26, letterSpacing: -0.5 },
});

export const motion = {
  fast: 180,
  base: 260,
  slow: 420,
  spring: { tension: 60, friction: 12 },
};

/* ────────────────────────────────────────────────────────────────────────── *
 *  GlassPanel — floating frosted surface
 * ────────────────────────────────────────────────────────────────────────── */
export function GlassPanel({
  children,
  surface = "glass",
  intensity = 40,
  style,
  radius,
  bordered = true,
}: {
  children?: React.ReactNode;
  surface?: Surface;
  intensity?: number;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  bordered?: boolean;
}) {
  const colors = useColors();
  const r = radius ?? colors.radiusLg;

  if (surface === "solid") {
    return (
      <View
        style={[
          {
            backgroundColor: colors.surface,
            borderRadius: r,
            borderWidth: bordered ? StyleSheet.hairlineWidth : 0,
            borderColor: colors.border,
            overflow: "hidden",
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  const isMap = surface === "map";
  const fallback = isMap ? colors.mapPanel : colors.glass;
  const borderColor = isMap ? colors.mapPanelBorder : colors.glassBorder;
  const tint = isMap ? "dark" : colors.glassTint;

  return (
    <View
      style={[
        {
          borderRadius: r,
          overflow: "hidden",
          borderWidth: bordered ? StyleSheet.hairlineWidth : 0,
          borderColor,
        },
        style,
      ]}
    >
      {Platform.OS === "web" ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: fallback }]} />
      ) : (
        <BlurView
          intensity={intensity}
          tint={tint}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: fallback }]} />
      <View>{children}</View>
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  IconButton — circular glass action button
 * ────────────────────────────────────────────────────────────────────────── */
export function IconButton({
  icon,
  onPress,
  size = 42,
  iconSize,
  surface = "glass",
  color,
  active = false,
  activeColor,
  haptic = "light",
  style,
  accessibilityLabel,
  testID,
}: {
  icon: IoniconName;
  onPress?: () => void;
  size?: number;
  iconSize?: number;
  surface?: Surface;
  color?: string;
  active?: boolean;
  activeColor?: string;
  haptic?: "light" | "medium" | "heavy" | "none";
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const colors = useColors();
  const isMap = surface === "map";
  const iconColor = active
    ? "#FFFFFF"
    : color ?? (isMap ? colors.onMap : colors.onGlass);

  const handlePress = () => {
    if (haptic === "light") haptics.tapLight();
    else if (haptic === "medium") haptics.tapMedium();
    else if (haptic === "heavy") haptics.tapHeavy();
    onPress?.();
  };

  const content = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name={icon} size={iconSize ?? Math.round(size * 0.46)} color={iconColor} />
    </View>
  );

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      testID={testID}
      style={style}
    >
      {active ? (
        <View
          style={{
            borderRadius: size / 2,
            backgroundColor: activeColor ?? colors.accent,
            overflow: "hidden",
          }}
        >
          {content}
        </View>
      ) : (
        <GlassPanel surface={surface} radius={size / 2} intensity={36}>
          {content}
        </GlassPanel>
      )}
    </TouchableOpacity>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  StatChip — icon + value + label cluster
 * ────────────────────────────────────────────────────────────────────────── */
export function StatChip({
  icon,
  value,
  label,
  surface = "map",
  accent,
  compact = false,
  style,
}: {
  icon?: IoniconName;
  value: string;
  label?: string;
  surface?: Surface;
  accent?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const isMap = surface === "map";
  const onColor = isMap ? colors.onMap : colors.onGlass;
  const mutedColor = isMap ? colors.onMapMuted : colors.onGlassMuted;

  return (
    <View style={[{ alignItems: compact ? "flex-start" : "center" }, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {icon && <Ionicons name={icon} size={compact ? 14 : 16} color={accent ?? mutedColor} />}
        <Text style={[type.mono, { fontSize: compact ? 18 : 22, color: onColor }]}>
          {value}
        </Text>
      </View>
      {label && (
        <Text
          style={[
            type.overline,
            { color: mutedColor, marginTop: 2, fontSize: 10 },
          ]}
        >
          {label}
        </Text>
      )}
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  CockpitButton — primary / secondary / danger action
 * ────────────────────────────────────────────────────────────────────────── */
export function CockpitButton({
  label,
  icon,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  haptic = "medium",
  style,
  testID,
}: {
  label: string;
  icon?: IoniconName;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  haptic?: "light" | "medium" | "heavy" | "none";
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const colors = useColors();

  const bg =
    variant === "primary"
      ? colors.primary
      : variant === "danger"
        ? colors.danger
        : variant === "secondary"
          ? colors.accent
          : "transparent";
  const fg = variant === "ghost" ? colors.text : "#FFFFFF";

  const handlePress = () => {
    if (disabled || loading) return;
    if (haptic === "light") haptics.tapLight();
    else if (haptic === "medium") haptics.tapMedium();
    else if (haptic === "heavy") haptics.tapHeavy();
    onPress?.();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      disabled={disabled || loading}
      testID={testID}
      accessibilityRole="button"
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 9,
          borderRadius: colors.radius,
          paddingVertical: 16,
          paddingHorizontal: 20,
          backgroundColor: bg,
          borderWidth: variant === "ghost" ? StyleSheet.hairlineWidth : 0,
          borderColor: colors.border,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={19} color={fg} />}
          <Text style={[type.heading, { color: fg }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  SegmentedToggle — pill of mutually-exclusive options
 * ────────────────────────────────────────────────────────────────────────── */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  surface = "glass",
  accent,
  style,
}: {
  options: { value: T; label?: string; icon?: IoniconName }[];
  value: T;
  onChange: (v: T) => void;
  surface?: Surface;
  accent?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const isMap = surface === "map";
  const onColor = isMap ? colors.onMap : colors.onGlass;
  const mutedColor = isMap ? colors.onMapMuted : colors.onGlassMuted;
  const activeBg = accent ?? colors.accent;

  return (
    <GlassPanel surface={surface} radius={colors.radiusPill} intensity={36} style={style}>
      <View style={{ flexDirection: "row", padding: 3 }}>
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <TouchableOpacity
              key={opt.value}
              activeOpacity={0.8}
              onPress={() => {
                if (!selected) {
                  haptics.selection();
                  onChange(opt.value);
                }
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: colors.radiusPill,
                backgroundColor: selected ? activeBg : "transparent",
              }}
            >
              {opt.icon && (
                <Ionicons
                  name={opt.icon}
                  size={14}
                  color={selected ? "#FFFFFF" : mutedColor}
                />
              )}
              {opt.label && (
                <Text
                  style={[
                    type.caption,
                    {
                      color: selected ? "#FFFFFF" : mutedColor,
                      fontFamily: selected ? "Inter_600SemiBold" : "Inter_500Medium",
                    },
                  ]}
                >
                  {opt.label}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </GlassPanel>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Card — content surface on app background
 * ────────────────────────────────────────────────────────────────────────── */
export function Card({
  children,
  onPress,
  style,
  padded = true,
}: {
  children?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const colors = useColors();
  const inner: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: colors.radius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: padded ? 16 : 0,
    overflow: "hidden",
  };
  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          haptics.tapLight();
          onPress();
        }}
        style={[inner, style]}
      >
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[inner, style]}>{children}</View>;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Pill — small static badge
 * ────────────────────────────────────────────────────────────────────────── */
export function Pill({
  label,
  icon,
  color,
  textColor = "#FFFFFF",
  style,
}: {
  label: string;
  icon?: IoniconName;
  color: string;
  textColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 9,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: color,
        },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={12} color={textColor} />}
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: textColor }}>
        {label}
      </Text>
    </View>
  );
}

export type { IoniconName };
