import React, { useCallback, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useType } from "@/hooks/useType";
import { useConvoy } from "@/context/ConvoyContext";
import * as haptics from "@/lib/haptics";
import { HELP_COLOR } from "./statusColors";

const HOLD_MS = 3000;

export default function HelpHoldButton() {
  const colors = useColors();
  const type = useType();
  const { myMember, triggerHelp, setStatus } = useConvoy();

  const isHelp = myMember?.status === "help";
  const [holding, setHolding] = useState<boolean>(false);
  const progress = useSharedValue(0);

  const fire = useCallback(() => {
    setHolding(false);
    progress.value = 0;
    haptics.notifyError();
    void triggerHelp();
  }, [progress, triggerHelp]);

  const onPressIn = useCallback(() => {
    if (isHelp) return;
    setHolding(true);
    haptics.tapMedium();
    progress.value = 0;
    progress.value = withTiming(
      1,
      { duration: HOLD_MS, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(fire)();
      },
    );
  }, [isHelp, progress, fire]);

  const onPressOut = useCallback(() => {
    if (isHelp) return;
    setHolding(false);
    cancelAnimation(progress);
    progress.value = withTiming(0, { duration: 220 });
  }, [isHelp, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const s = styles(colors);

  if (isHelp) {
    return (
      <View style={[s.activeWrap, { backgroundColor: HELP_COLOR }]}>
        <View style={s.activeLeft}>
          <Ionicons name="alert-circle" size={22} color="#FFFFFF" />
          <View>
            <Text style={[s.activeTitle, { fontFamily: type.displayBold }]}>
              HELP RAISED
            </Text>
            <Text style={[s.activeSub, { fontFamily: type.regular }]}>
              Your convoy has been alerted
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={s.standDownBtn}
          activeOpacity={0.85}
          onPress={() => {
            haptics.selection();
            void setStatus("moving");
          }}
        >
          <Text style={[s.standDownLabel, { fontFamily: type.semibold }]}>
            Stand down
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[s.button, { backgroundColor: HELP_COLOR }]}
    >
      <Animated.View style={[s.fill, fillStyle]} pointerEvents="none" />
      <View style={s.content} pointerEvents="none">
        <Ionicons name="alert-circle" size={22} color="#FFFFFF" />
        <Text style={[s.label, { fontFamily: type.displayBold }]}>HELP</Text>
        <View style={s.holdPill}>
          <Text style={[s.holdText, { fontFamily: type.mono }]}>
            {holding ? "keep holding" : "hold 3s"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    button: {
      height: 56,
      borderRadius: colors.radius,
      overflow: "hidden",
      justifyContent: "center",
      ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
    },
    fill: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      backgroundColor: "rgba(255,255,255,0.28)",
    },
    content: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    label: {
      color: "#FFFFFF",
      fontSize: 17,
      letterSpacing: 1,
    },
    holdPill: {
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.5)",
      borderRadius: colors.radiusPill,
      paddingHorizontal: 9,
      paddingVertical: 2,
      marginLeft: 2,
    },
    holdText: {
      color: "rgba(255,255,255,0.95)",
      fontSize: 10,
      letterSpacing: 0.5,
    },
    activeWrap: {
      minHeight: 56,
      borderRadius: colors.radius,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 10,
    },
    activeLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
      minWidth: 0,
    },
    activeTitle: { color: "#FFFFFF", fontSize: 15, letterSpacing: 0.5 },
    activeSub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 1 },
    standDownBtn: {
      backgroundColor: "rgba(255,255,255,0.22)",
      borderRadius: colors.radiusSm,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    standDownLabel: { color: "#FFFFFF", fontSize: 13 },
  });
}
