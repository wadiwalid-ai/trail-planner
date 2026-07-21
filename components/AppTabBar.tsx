import React from "react";
import { View, Text, TouchableOpacity, Platform, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useColors } from "@/hooks/useColors";
import { useType } from "@/hooks/useType";

type IconName = keyof typeof Ionicons.glyphMap;

interface TabDef {
  name: string;
  label: string;
  icon: IconName;
  iconActive: IconName;
  center?: boolean;
}

// Apex-style bar: five visible slots with an elevated center Record button.
// Gear stays routable (href:null in the layout) but off the bar — reachable
// from the Account screen.
const TABS: TabDef[] = [
  { name: "index", label: "Explore", icon: "compass-outline", iconActive: "compass" },
  { name: "plan", label: "Planner", icon: "sparkles-outline", iconActive: "sparkles" },
  { name: "record", label: "Record", icon: "ellipse", iconActive: "ellipse", center: true },
  { name: "trips", label: "Trips", icon: "bookmark-outline", iconActive: "bookmark" },
  { name: "account", label: "Profile", icon: "person-outline", iconActive: "person" },
];

export function AppTabBar({ state, navigation }: BottomTabBarProps) {
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();

  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";
  const bottomInset = isWeb ? 34 : insets.bottom;
  // Web tab bar = 50px content + 34px inset = 84px, matching the app-wide
  // bottomPad constant (34 + 84). Native uses 56px content + the device inset.
  const contentHeight = isWeb ? 50 : 56;
  const barHeight = contentHeight + bottomInset;

  const activeName = state.routes[state.index]?.name;

  const handlePress = (routeName: string) => {
    const route = state.routes.find((r) => r.name === routeName);
    if (!route) return;
    const focused = activeName === routeName;
    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });
    if (!focused && !event.defaultPrevented) {
      navigation.navigate(route.name as never);
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          height: barHeight,
          paddingBottom: bottomInset,
          borderTopColor: colors.border,
          borderTopWidth: colors.radius <= 8 ? 1 : StyleSheet.hairlineWidth,
          backgroundColor: isIOS ? "transparent" : colors.background,
        },
      ]}
    >
      {isIOS && (
        <BlurView intensity={70} tint={colors.glassTint} style={StyleSheet.absoluteFill} />
      )}
      {TABS.map((tab) => {
        const focused = activeName === tab.name;
        if (tab.center) {
          return (
            <View key={tab.name} style={styles.slot}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handlePress(tab.name)}
                testID={`tab-${tab.name}`}
                style={[
                  styles.centerBtn,
                  {
                    backgroundColor: colors.accent,
                    borderColor: colors.background,
                    shadowColor: colors.accent,
                  },
                ]}
              >
                <View style={[styles.recordDot, { backgroundColor: colors.onPrimary }]} />
              </TouchableOpacity>
            </View>
          );
        }
        const color = focused ? colors.tabIconSelected : colors.tabIconDefault;
        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.slot}
            activeOpacity={0.7}
            onPress={() => handlePress(tab.name)}
            testID={`tab-${tab.name}`}
          >
            <Ionicons name={focused ? tab.iconActive : tab.icon} size={23} color={color} />
            <Text style={[styles.label, { color, fontFamily: type.medium }]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 8,
  },
  slot: { flex: 1, alignItems: "center", justifyContent: "flex-start" },
  label: { fontSize: 10, marginTop: 3 },
  centerBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -22,
    borderWidth: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  recordDot: { width: 18, height: 18, borderRadius: 9 },
});
