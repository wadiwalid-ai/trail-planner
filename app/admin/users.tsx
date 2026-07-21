import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconButton } from "@/components/cockpit";
import { useColors } from "@/hooks/useColors";
import type { AppColors } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/context/AuthContext";

const WEB_TOP = 67;
const WEB_BOTTOM = 34;

interface AdminUserRow {
  id: string;
  username: string;
  isAdmin: boolean;
}

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function UserRow({
  item,
  colors,
  currentUserId,
  pending,
  onToggle,
}: {
  item: AdminUserRow;
  colors: AppColors;
  currentUserId?: string;
  pending: boolean;
  onToggle: (item: AdminUserRow) => void;
}) {
  const s = styles(colors);
  const isSelf = item.id === currentUserId;
  return (
    <View style={s.row} testID={`admin-user-${item.id}`}>
      <View style={s.avatar}>
        <Text style={s.avatarText}>{item.username?.[0]?.toUpperCase() ?? "?"}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.username} numberOfLines={1}>
          {item.username}
          {isSelf ? "  (you)" : ""}
        </Text>
        <View style={s.badgeRow}>
          {item.isAdmin ? (
            <View style={[s.badge, { backgroundColor: `${colors.accent}22` }]}>
              <Ionicons name="shield-checkmark" size={12} color={colors.accent} />
              <Text style={[s.badgeText, { color: colors.accent }]}>Admin</Text>
            </View>
          ) : (
            <View style={[s.badge, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[s.badgeText, { color: colors.textMuted }]}>Member</Text>
            </View>
          )}
        </View>
      </View>
      <TouchableOpacity
        style={[
          s.toggleBtn,
          item.isAdmin
            ? { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }
            : { backgroundColor: colors.primary, borderColor: colors.primary },
          pending && { opacity: 0.5 },
        ]}
        disabled={pending}
        activeOpacity={0.8}
        onPress={() => onToggle(item)}
        testID={`admin-toggle-${item.id}`}
      >
        {pending ? (
          <ActivityIndicator size="small" color={item.isAdmin ? colors.text : "#fff"} />
        ) : (
          <Text
            style={[
              s.toggleText,
              { color: item.isAdmin ? colors.text : "#fff" },
            ]}
          >
            {item.isAdmin ? "Revoke" : "Make admin"}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function AdminUsersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const s = styles(colors);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search.trim(), 300);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const usersKey = useMemo(
    () =>
      debouncedSearch
        ? ["/api/admin/users", debouncedSearch]
        : ["/api/admin/users"],
    [debouncedSearch],
  );

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{
    users: AdminUserRow[];
  }>({
    queryKey: usersKey,
    // Custom fetcher: the shared default joins the key with "/" which would turn
    // a search term into a path segment. We need it as a ?query= param instead.
    queryFn: async () => {
      const route = debouncedSearch
        ? `/api/admin/users?query=${encodeURIComponent(debouncedSearch)}`
        : "/api/admin/users";
      const res = await apiRequest("GET", route);
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async (target: AdminUserRow) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${target.id}`, {
        isAdmin: !target.isAdmin,
      });
      return (await res.json()) as { user: AdminUserRow };
    },
    onMutate: (target) => setPendingId(target.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: any) => {
      const msg = String(err?.message ?? "");
      const clean = msg.includes(":") ? msg.slice(msg.indexOf(":") + 1).trim() : msg;
      let friendly = clean;
      try {
        const parsed = JSON.parse(clean);
        if (parsed?.error) friendly = parsed.error;
      } catch {
        // clean is already a plain message
      }
      Alert.alert("Could not update access", friendly || "Please try again.");
    },
    onSettled: () => setPendingId(null),
  });

  const onToggle = useCallback(
    (target: AdminUserRow) => {
      const action = target.isAdmin ? "Revoke admin access" : "Grant admin access";
      const message = target.isAdmin
        ? `Remove admin access from ${target.username}?`
        : `Give ${target.username} full admin access?`;
      Alert.alert(action, message, [
        { text: "Cancel", style: "cancel" },
        {
          text: target.isAdmin ? "Revoke" : "Grant",
          style: target.isAdmin ? "destructive" : "default",
          onPress: () => mutation.mutate(target),
        },
      ]);
    },
    [mutation],
  );

  const topPad = (Platform.OS === "web" ? WEB_TOP : insets.top) + 8;
  const bottomPad = (Platform.OS === "web" ? WEB_BOTTOM : insets.bottom) + 24;

  // Client-side gate: non-admins should never see the account list. The server
  // also enforces this (requireAdmin), but this avoids a flash of the screen.
  if (!user?.isAdmin) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[s.header, { paddingTop: topPad }]}>
          <IconButton icon="arrow-back" onPress={() => router.back()} accessibilityLabel="Go back" />
          <Text style={s.title}>Admin</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={s.centerBox}>
          <Ionicons name="lock-closed-outline" size={30} color={colors.textMuted} />
          <Text style={s.emptyText}>You don't have access to this screen.</Text>
        </View>
      </View>
    );
  }

  const users = data?.users ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[s.header, { paddingTop: topPad }]}>
        <IconButton icon="arrow-back" onPress={() => router.back()} accessibilityLabel="Go back" />
        <Text style={s.title}>Manage Access</Text>
        <IconButton
          icon="time-outline"
          onPress={() => router.push("/admin/audit" as any)}
          accessibilityLabel="View change history"
        />
      </View>

      <View style={s.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by username"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={s.searchInput}
          testID="admin-search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
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
              : "Could not load accounts."}
          </Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => refetch()} activeOpacity={0.8}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad }}
          renderItem={({ item }) => (
            <UserRow
              item={item}
              colors={colors}
              currentUserId={user?.id}
              pending={pendingId === item.id}
              onToggle={onToggle}
            />
          )}
          ListHeaderComponent={
            isFetching && !isLoading ? (
              <View style={s.fetchingRow}>
                <ActivityIndicator size="small" color={colors.textMuted} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={s.centerBox}>
              <Ionicons name="people-outline" size={30} color={colors.textMuted} />
              <Text style={s.emptyText}>
                {debouncedSearch
                  ? `No accounts match "${debouncedSearch}".`
                  : "No accounts found."}
              </Text>
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
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 12,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === "ios" ? 12 : 8,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: c.radius,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: c.text,
      padding: 0,
    },
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
    avatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
    username: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.text },
    badgeRow: { flexDirection: "row", marginTop: 4 },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
    toggleBtn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: c.radiusSm,
      borderWidth: 1,
      minWidth: 96,
      alignItems: "center",
      justifyContent: "center",
    },
    toggleText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
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
