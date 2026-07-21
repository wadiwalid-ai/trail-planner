import React, { useCallback, useState } from "react";
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useType } from "@/hooks/useType";
import { useConvoy } from "@/context/ConvoyContext";
import { formatLastSeen } from "@/lib/convoyGeo";
import * as haptics from "@/lib/haptics";
import { statusColor } from "./statusColors";
import InviteSheet from "./InviteSheet";

export const CONVOY_HEADER_HEIGHT = 64;

export default function ConvoyHeader() {
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { convoy, members, myMember, leaveConvoy, endConvoy } = useConvoy();
  const [inviteOpen, setInviteOpen] = useState<boolean>(false);

  const isOwner = myMember?.role === "owner";
  const dotColor = statusColor(myMember?.status ?? "moving", colors.primary);
  const linked = myMember?.lastSeenAt ? formatLastSeen(myMember.lastSeenAt) : null;

  const goBack = useCallback(() => {
    haptics.tapLight();
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/record");
  }, [router]);

  const confirmLeave = useCallback(() => {
    Alert.alert(
      "Leave convoy",
      "You'll stop sharing your location and won't see the others.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: () => {
            void leaveConvoy();
          },
        },
      ],
    );
  }, [leaveConvoy]);

  const confirmEnd = useCallback(() => {
    Alert.alert(
      "End convoy",
      "This ends the convoy for everyone. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End for all",
          style: "destructive",
          onPress: () => {
            void endConvoy();
          },
        },
      ],
    );
  }, [endConvoy]);

  const openMenu = useCallback(() => {
    haptics.tapLight();
    if (isOwner) {
      Alert.alert("Convoy options", undefined, [
        { text: "End convoy", style: "destructive", onPress: confirmEnd },
        { text: "Leave convoy", onPress: confirmLeave },
        { text: "Cancel", style: "cancel" },
      ]);
    } else {
      Alert.alert("Convoy options", undefined, [
        { text: "Leave convoy", style: "destructive", onPress: confirmLeave },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  }, [isOwner, confirmEnd, confirmLeave]);

  const topPad = (Platform.OS === "web" ? 67 : insets.top) + 8;
  const s = styles(colors);

  return (
    <View style={[s.wrap, { paddingTop: topPad }]}>
      <View style={s.left}>
        <TouchableOpacity style={s.iconBtn} onPress={goBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={s.titleBox}>
          <Text
            style={[s.name, { color: colors.text, fontFamily: type.displayBold }]}
            numberOfLines={1}
          >
            {convoy?.name ?? "Convoy"}
          </Text>
          <View style={s.subRow}>
            <View style={[s.dot, { backgroundColor: dotColor }]} />
            <Text
              style={[s.sub, { color: colors.textSecondary, fontFamily: type.mono }]}
              numberOfLines={1}
            >
              {members.length} rover{members.length === 1 ? "" : "s"}
              {linked ? ` · linked ${linked}` : ""}
            </Text>
          </View>
        </View>
      </View>

      <View style={s.right}>
        {convoy?.inviteCode ? (
          <TouchableOpacity
            style={s.codeChip}
            onPress={() => {
              haptics.tapLight();
              setInviteOpen(true);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="key-outline" size={12} color={colors.primary} />
            <Text style={[s.codeText, { color: colors.primary, fontFamily: type.monoMedium }]}>
              {convoy.inviteCode}
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[s.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            haptics.tapLight();
            setInviteOpen(true);
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="person-add" size={18} color={colors.onPrimary} />
        </TouchableOpacity>
        <TouchableOpacity style={s.iconBtn} onPress={openMenu} activeOpacity={0.7}>
          <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <InviteSheet
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        code={convoy?.inviteCode ?? ""}
        convoyName={convoy?.name ?? "this convoy"}
      />
    </View>
  );
}

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    wrap: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingBottom: 10,
      gap: 8,
      backgroundColor: colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    left: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: colors.radiusSm,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    titleBox: { flex: 1, minWidth: 0 },
    name: { fontSize: 17 },
    subRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    sub: { fontSize: 10, letterSpacing: 0.3, flexShrink: 1 },
    right: { flexDirection: "row", alignItems: "center", gap: 8 },
    codeChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 7,
      borderRadius: colors.radiusSm,
      borderWidth: 1,
      borderColor: colors.primary + "44",
      backgroundColor: colors.primary + "14",
    },
    codeText: { fontSize: 12, letterSpacing: 1 },
    primaryBtn: {
      width: 36,
      height: 36,
      borderRadius: colors.radiusSm,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
