import React from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Platform,
  TouchableOpacity,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { IconButton } from "@/components/cockpit";
import { useColors } from "@/hooks/useColors";
import type { AppColors } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/context/AuthContext";

const WEB_TOP = 67;
const WEB_BOTTOM = 34;

interface AuditEntry {
  id: number;
  actingUserId: string;
  actingUsername: string;
  targetUserId: string;
  targetUsername: string;
  oldIsAdmin: boolean;
  newIsAdmin: boolean;
  createdAt: string;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function EntryRow({ item, colors }: { item: AuditEntry; colors: AppColors }) {
  const s = styles(colors);
  const promoted = item.newIsAdmin;
  return (
    <View style={s.row} testID={`audit-entry-${item.id}`}>
      <View
        style={[
          s.iconWrap,
          {
            backgroundColor: promoted ? `${colors.accent}22` : colors.backgroundSecondary,
          },
        ]}
      >
        <Ionicons
          name={promoted ? "arrow-up" : "arrow-down"}
          size={18}
          color={promoted ? colors.accent : colors.textMuted}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.summary} numberOfLines={2}>
          <Text style={s.strong}>{item.actingUsername}</Text>
          {promoted ? " granted admin to " : " revoked admin from "}
          <Text style={s.strong}>{item.targetUsername}</Text>
        </Text>
        <Text style={s.meta}>{formatWhen(item.createdAt)}</Text>
      </View>
      <View
        style={[
          s.badge,
          promoted
            ? { backgroundColor: `${colors.accent}22` }
            : { backgroundColor: colors.backgroundSecondary },
        ]}
      >
        <Text
          style={[
            s.badgeText,
            { color: promoted ? colors.accent : colors.textMuted },
          ]}
        >
          {promoted ? "Promoted" : "Demoted"}
        </Text>
      </View>
    </View>
  );
}

export default function AdminAuditScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const s = styles(colors);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{
    entries: AuditEntry[];
  }>({
    queryKey: ["/api/admin/audit-log"],
  });

  const topPad = (Platform.OS === "web" ? WEB_TOP : insets.top) + 8;
  const bottomPad = (Platform.OS === "web" ? WEB_BOTTOM : insets.bottom) + 24;

  // Client-side gate mirrors the server's requireAdmin so non-admins never see
  // the history even for a flash.
  if (!user?.isAdmin) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[s.header, { paddingTop: topPad }]}>
          <IconButton icon="arrow-back" onPress={() => router.back()} accessibilityLabel="Go back" />
          <Text style={s.title}>History</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={s.centerBox}>
          <Ionicons name="lock-closed-outline" size={30} color={colors.textMuted} />
          <Text style={s.emptyText}>You don't have access to this screen.</Text>
        </View>
      </View>
    );
  }

  const entries = data?.entries ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[s.header, { paddingTop: topPad }]}>
        <IconButton icon="arrow-back" onPress={() => router.back()} accessibilityLabel="Go back" />
        <Text style={s.title}>Access History</Text>
        <View style={{ width: 44 }} />
      </View>

      {isLoading ? (
        <View style={s.centerBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : isError ? (
        <View style={s.centerBox}>
          <Ionicons name="alert-circle-outline" size={30} color={colors.danger} />
          <Text style={s.emptyText}>
            {String((error as any)?.message ?? "").includes("403")
              ? "You don't have access to this screen."
              : "Could not load history."}
          </Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => refetch()} activeOpacity={0.8}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad }}
          renderItem={({ item }) => <EntryRow item={item} colors={colors} />}
          ListHeaderComponent={
            isFetching && !isLoading ? (
              <View style={s.fetchingRow}>
                <ActivityIndicator size="small" color={colors.textMuted} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={s.centerBox}>
              <Ionicons name="time-outline" size={30} color={colors.textMuted} />
              <Text style={s.emptyText}>No admin changes recorded yet.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = (c: AppColors) =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingBottom: 12,
    },
    title: { fontSize: 18, fontFamily: "Inter_700Bold", color: c.text },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: c.radius,
      padding: 12,
      marginBottom: 10,
    },
    iconWrap: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
    },
    summary: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: c.text,
      lineHeight: 20,
    },
    strong: { fontFamily: "Inter_700Bold", color: c.text },
    meta: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: c.textMuted,
      marginTop: 3,
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
    centerBox: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 60,
      paddingHorizontal: 32,
      gap: 12,
    },
    emptyText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: c.textMuted,
      textAlign: "center",
      lineHeight: 20,
    },
    retryBtn: {
      marginTop: 4,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: c.radiusSm,
      backgroundColor: c.primary,
    },
    retryText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
    fetchingRow: { alignItems: "center", paddingVertical: 8 },
  });
