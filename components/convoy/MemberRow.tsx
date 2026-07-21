import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useType } from "@/hooks/useType";
import { useConvoy, type AdventureMember } from "@/context/ConvoyContext";
import {
  bearingDeg,
  bearingLabel,
  formatDistance,
  formatLastSeen,
  haversineKm,
  type GeoPoint,
} from "@/lib/convoyGeo";
import { statusColor, statusLabel, STATUS_GLYPH, HELP_COLOR } from "./statusColors";

interface MemberRowProps {
  member: AdventureMember;
}

export default function MemberRow({ member }: MemberRowProps) {
  const colors = useColors();
  const type = useType();
  const { myMember, myLocation } = useConvoy();

  const isYou = myMember != null && member.id === myMember.id;
  const isHelp = member.status === "help";
  const tone = isHelp ? HELP_COLOR : statusColor(member.status, colors.primary);

  const hasPos = member.lat != null && member.lng != null;
  const seen = formatLastSeen(member.lastSeenAt);

  let distStr = "no signal";
  let detailStr = `seen ${seen}`;
  if (hasPos && myLocation) {
    const from: GeoPoint = { lat: myLocation.lat, lng: myLocation.lng };
    const to: GeoPoint = { lat: member.lat as number, lng: member.lng as number };
    distStr = formatDistance(haversineKm(from, to));
    detailStr = `${bearingLabel(bearingDeg(from, to))} · seen ${seen}`;
  } else if (hasPos) {
    distStr = "—";
    detailStr = `seen ${seen}`;
  }

  const initial = (member.displayName.trim().charAt(0) || "?").toUpperCase();
  const s = styles(colors);

  return (
    <View
      style={[
        s.row,
        {
          backgroundColor: isHelp ? HELP_COLOR + "16" : colors.surface,
          borderColor: isHelp ? HELP_COLOR : colors.border,
        },
      ]}
    >
      <View
        style={[
          s.avatar,
          { backgroundColor: tone + "1F", borderColor: tone + "66" },
        ]}
      >
        <Text style={[s.avatarText, { color: tone, fontFamily: type.displayBold }]}>
          {initial}
        </Text>
      </View>

      <View style={s.middle}>
        <View style={s.nameRow}>
          <Text
            style={[s.name, { color: colors.text, fontFamily: type.semibold }]}
            numberOfLines={1}
          >
            {member.displayName}
          </Text>
          {isYou && (
            <View style={[s.youChip, { backgroundColor: colors.primary + "22" }]}>
              <Text
                style={[s.youLabel, { color: colors.primary, fontFamily: type.medium }]}
              >
                You
              </Text>
            </View>
          )}
          <View
            style={[
              s.statusChip,
              { backgroundColor: tone + "1A", borderColor: tone + "55" },
            ]}
          >
            <Ionicons name={STATUS_GLYPH[member.status]} size={11} color={tone} />
            <Text style={[s.statusLabel, { color: tone, fontFamily: type.medium }]}>
              {statusLabel(member.status)}
            </Text>
          </View>
        </View>
        <Text
          style={[s.vehicle, { color: colors.textSecondary, fontFamily: type.regular }]}
          numberOfLines={1}
        >
          {member.vehicleLabel?.trim() || "No vehicle set"}
        </Text>
      </View>

      <View style={s.right}>
        <View style={s.distRow}>
          <Ionicons
            name={hasPos ? "location" : "cloud-offline"}
            size={12}
            color={hasPos ? colors.primary : colors.textMuted}
          />
          <Text
            style={[
              s.dist,
              {
                color: hasPos ? colors.text : colors.textMuted,
                fontFamily: type.monoMedium,
              },
            ]}
          >
            {distStr}
          </Text>
        </View>
        <Text style={[s.detail, { color: colors.textMuted, fontFamily: type.mono }]}>
          {detailStr}
        </Text>
      </View>
    </View>
  );
}

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 10,
      borderRadius: colors.radius,
      borderWidth: 1,
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: colors.radiusSm,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { fontSize: 16 },
    middle: { flex: 1, minWidth: 0 },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    name: { fontSize: 14, flexShrink: 1 },
    youChip: {
      paddingHorizontal: 7,
      paddingVertical: 1,
      borderRadius: colors.radiusPill,
    },
    youLabel: { fontSize: 10 },
    statusChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: colors.radiusSm,
      borderWidth: 1,
    },
    statusLabel: { fontSize: 10 },
    vehicle: { fontSize: 11, marginTop: 2 },
    right: { alignItems: "flex-end" },
    distRow: { flexDirection: "row", alignItems: "center", gap: 3 },
    dist: { fontSize: 13 },
    detail: { fontSize: 10, marginTop: 2 },
  });
}
