import React, { useCallback } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useType } from "@/hooks/useType";
import { useConvoy, type ConvoyStatus } from "@/context/ConvoyContext";
import * as haptics from "@/lib/haptics";
import {
  statusColor,
  statusLabel,
  STATUS_GLYPH,
  NORMAL_STATUSES,
} from "./statusColors";

export default function StatusGrid() {
  const colors = useColors();
  const type = useType();
  const { myMember, setStatus } = useConvoy();

  const active = myMember?.status ?? null;

  const onSelect = useCallback(
    (status: ConvoyStatus) => {
      if (status === active) return;
      haptics.selection();
      void setStatus(status);
    },
    [active, setStatus],
  );

  const s = styles(colors);

  return (
    <View style={s.grid}>
      {NORMAL_STATUSES.map((status) => {
        const tone = statusColor(status, colors.primary);
        const isActive = status === active;
        return (
          <TouchableOpacity
            key={status}
            activeOpacity={0.85}
            onPress={() => onSelect(status)}
            style={[
              s.cell,
              {
                backgroundColor: isActive ? tone + "1A" : colors.surface,
                borderColor: isActive ? tone + "88" : colors.border,
              },
            ]}
          >
            <Ionicons
              name={STATUS_GLYPH[status]}
              size={18}
              color={isActive ? tone : colors.textSecondary}
            />
            <Text
              style={[
                s.label,
                {
                  color: isActive ? tone : colors.textSecondary,
                  fontFamily: isActive ? type.semibold : type.medium,
                },
              ]}
            >
              {statusLabel(status)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    cell: {
      width: "48%",
      flexGrow: 1,
      height: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: colors.radius,
      borderWidth: 1,
    },
    label: { fontSize: 14 },
  });
}
