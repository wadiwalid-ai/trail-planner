import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useType } from "@/hooks/useType";
import { useAuth } from "@/context/AuthContext";
import { useConvoy, type AdventureMember } from "@/context/ConvoyContext";
import { apiRequest, queryClient } from "@/lib/query-client";
import { haversineKm, type GeoPoint } from "@/lib/convoyGeo";
import ConvoyHeader from "@/components/convoy/ConvoyHeader";
import ConvoyMap from "@/components/convoy/ConvoyMap";
import MemberRow from "@/components/convoy/MemberRow";
import StatusGrid from "@/components/convoy/StatusGrid";
import HelpHoldButton from "@/components/convoy/HelpHoldButton";
import { statusColor, statusLabel } from "@/components/convoy/statusColors";

export default function ConvoyIndexScreen() {
  const { activeConvoyId, convoy, isLoading } = useConvoy();
  const colors = useColors();

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (activeConvoyId == null || convoy == null) {
    return <ConvoyHub />;
  }

  return <ConvoyLive />;
}

// ── Hub (no active convoy) ────────────────────────────────────────────────────
function ConvoyHub() {
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const s = hubStyles(colors);

  const topPad = (Platform.OS === "web" ? 67 : insets.top) + 8;
  const bottomPad = (Platform.OS === "web" ? 34 : insets.bottom) + 24;

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/record");
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[s.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={s.backBtn} onPress={goBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { fontFamily: type.displayBold }]}>Convoy</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: bottomPad }}>
        <View style={s.hero}>
          <View style={[s.heroIcon, { backgroundColor: colors.primary + "1A" }]}>
            <Ionicons name="people" size={30} color={colors.primary} />
          </View>
          <Text style={[s.heroTitle, { fontFamily: type.displayBold }]}>
            Keep the group together
          </Text>
          <Text style={[s.heroSub, { fontFamily: type.regular }]}>
            See everyone on one live map, share a one-tap status, and call for
            help — even when the signal gets thin.
          </Text>
        </View>

        {!isAuthenticated ? (
          <View style={s.authCard}>
            <Ionicons name="lock-closed-outline" size={22} color={colors.textSecondary} />
            <Text style={[s.authText, { fontFamily: type.medium }]}>
              Sign in to start or join a convoy.
            </Text>
            <TouchableOpacity
              style={[s.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push("/(tabs)/account")}
              activeOpacity={0.85}
            >
              <Text style={[s.primaryBtnText, { color: colors.onPrimary, fontFamily: type.semibold }]}>
                Go to account
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={[s.actionCard, { borderColor: colors.primary + "55" }]}
              onPress={() => router.push("/convoy/create" as any)}
              activeOpacity={0.85}
              testID="convoy-create"
            >
              <View style={[s.actionIcon, { backgroundColor: colors.primary }]}>
                <Ionicons name="add" size={24} color={colors.onPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.actionTitle, { fontFamily: type.semibold }]}>Start a convoy</Text>
                <Text style={[s.actionSub, { fontFamily: type.regular }]}>
                  Create a group and invite others with a code.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={s.actionCard}
              onPress={() => router.push("/convoy/join" as any)}
              activeOpacity={0.85}
              testID="convoy-join"
            >
              <View
                style={[
                  s.actionIcon,
                  { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
                ]}
              >
                <Ionicons name="enter-outline" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.actionTitle, { fontFamily: type.semibold }]}>Join with a code</Text>
                <Text style={[s.actionSub, { fontFamily: type.regular }]}>
                  Enter the invite code shared by your group.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Live convoy screen ────────────────────────────────────────────────────────
function ConvoyLive() {
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { members, myMember, myLocation, locationPermission, requestLocation } =
    useConvoy();

  const mapHeight = Math.max(220, Math.min(320, Math.round(height * 0.32)));

  const rovers = useMemo(() => {
    const others = members.filter(
      (m) => !(myMember != null && m.id === myMember.id),
    );
    const myPoint: GeoPoint | null = myLocation
      ? { lat: myLocation.lat, lng: myLocation.lng }
      : null;
    const distOf = (m: AdventureMember): number => {
      if (myPoint == null || m.lat == null || m.lng == null) {
        return Number.POSITIVE_INFINITY;
      }
      return haversineKm(myPoint, { lat: m.lat, lng: m.lng });
    };
    return [...others].sort((a, b) => {
      if (a.status === "help" && b.status !== "help") return -1;
      if (b.status === "help" && a.status !== "help") return 1;
      const da = distOf(a);
      const db = distOf(b);
      if (da !== db) return da - db;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [members, myMember, myLocation]);

  const myStatus = myMember?.status ?? "moving";
  const myTone = statusColor(myStatus, colors.primary);
  const bottomPad = (Platform.OS === "web" ? 34 : insets.bottom) + 10;
  const s = liveStyles(colors);

  const locationDenied =
    locationPermission === "denied" || locationPermission === "unavailable";
  const handleFixLocation = useCallback(() => {
    if (locationPermission === "denied" && Platform.OS !== "web") {
      Linking.openSettings().catch(() => requestLocation());
      return;
    }
    requestLocation();
  }, [locationPermission, requestLocation]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ConvoyHeader />
      <ConvoyMap height={mapHeight} />

      {locationDenied ? (
        <TouchableOpacity
          style={s.permBanner}
          onPress={handleFixLocation}
          activeOpacity={0.85}
          testID="convoy-location-banner"
        >
          <Ionicons name="location-outline" size={18} color={colors.warning} />
          <Text style={[s.permText, { color: colors.text, fontFamily: type.medium }]}>
            {locationPermission === "unavailable"
              ? "Location isn't available — the group can't see you on the map."
              : "Location is off — turn it on so your convoy can track you."}
          </Text>
          <Text style={[s.permAction, { color: colors.primary, fontFamily: type.semibold }]}>
            {locationPermission === "denied" && Platform.OS !== "web"
              ? "Settings"
              : "Enable"}
          </Text>
        </TouchableOpacity>
      ) : null}

      {__DEV__ ? <DevSimBar /> : null}

      <View style={s.listWrap}>
        <View style={s.listHeader}>
          <Text style={[s.listTitle, { color: colors.primary, fontFamily: type.semibold }]}>
            ROVERS
          </Text>
          <Text style={[s.listHint, { color: colors.textMuted, fontFamily: type.mono }]}>
            dist · bearing · seen
          </Text>
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {rovers.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="people-outline" size={26} color={colors.textMuted} />
              <Text style={[s.emptyText, { color: colors.textSecondary, fontFamily: type.regular }]}>
                No one else yet. Share your invite code to bring the group in.
              </Text>
            </View>
          ) : (
            rovers.map((m) => <MemberRow key={m.id} member={m} />)
          )}
        </ScrollView>
      </View>

      <View style={[s.statusPanel, { paddingBottom: bottomPad }]}>
        <View style={s.statusHeader}>
          <Text style={[s.statusTitle, { color: colors.primary, fontFamily: type.semibold }]}>
            YOUR STATUS
          </Text>
          <View style={s.statusNow}>
            <View style={[s.statusDot, { backgroundColor: myTone }]} />
            <Text style={[s.statusNowText, { color: myTone, fontFamily: type.medium }]}>
              {statusLabel(myStatus)}
            </Text>
          </View>
        </View>
        <StatusGrid />
        <View style={{ height: 10 }} />
        <HelpHoldButton />
      </View>
    </View>
  );
}

// ── Dev-only ghost simulator controls (never rendered in production) ───────────
function DevSimBar() {
  const colors = useColors();
  const type = useType();
  const { activeConvoyId, myLocation } = useConvoy();
  const [busy, setBusy] = useState<boolean>(false);
  const [auto, setAuto] = useState<boolean>(false);

  const refresh = useCallback(() => {
    if (activeConvoyId != null) {
      queryClient.invalidateQueries({ queryKey: ["/api/convoys", activeConvoyId] });
    }
  }, [activeConvoyId]);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      if (activeConvoyId == null || busy) return;
      setBusy(true);
      try {
        await fn();
        refresh();
      } catch {
        // dev-only; ignore transient failures
      } finally {
        setBusy(false);
      }
    },
    [activeConvoyId, busy, refresh],
  );

  const addGhosts = () =>
    run(async () => {
      await apiRequest("POST", `/api/dev/convoys/${activeConvoyId}/ghosts`, {
        count: 4,
        ...(myLocation
          ? { centerLat: myLocation.lat, centerLng: myLocation.lng }
          : {}),
      });
    });

  const tick = () =>
    run(async () => {
      await apiRequest("POST", `/api/dev/convoys/${activeConvoyId}/ghosts/tick`);
    });

  const toggleAuto = () =>
    run(async () => {
      const next = !auto;
      await apiRequest("POST", `/api/dev/convoys/${activeConvoyId}/ghosts/auto`, {
        on: next,
      });
      setAuto(next);
    });

  const clear = () =>
    run(async () => {
      await apiRequest("DELETE", `/api/dev/convoys/${activeConvoyId}/ghosts`);
      setAuto(false);
    });

  const s = devStyles(colors);

  return (
    <View style={s.bar}>
      <Text style={[s.tag, { fontFamily: type.mono }]}>DEV</Text>
      <DevBtn label="Ghosts" icon="bug" onPress={addGhosts} disabled={busy} colors={colors} type={type} />
      <DevBtn label="Tick" icon="play-forward" onPress={tick} disabled={busy} colors={colors} type={type} />
      <DevBtn label={auto ? "Auto·on" : "Auto"} icon="sync" onPress={toggleAuto} active={auto} disabled={busy} colors={colors} type={type} />
      <DevBtn label="Clear" icon="trash" onPress={clear} disabled={busy} colors={colors} type={type} />
    </View>
  );
}

function DevBtn({
  label,
  icon,
  onPress,
  active,
  disabled,
  colors,
  type,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  colors: ReturnType<typeof useColors>;
  type: ReturnType<typeof useType>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: colors.radiusSm,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primary + "1A" : colors.surface,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Ionicons name={icon} size={13} color={active ? colors.primary : colors.textSecondary} />
      <Text
        style={{
          fontSize: 11,
          color: active ? colors.primary : colors.textSecondary,
          fontFamily: type.medium,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});

function hubStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingBottom: 10,
      backgroundColor: c.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: c.radiusSm,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.background,
    },
    headerTitle: { fontSize: 18, color: c.text },
    hero: { alignItems: "center", marginTop: 8, marginBottom: 24 },
    heroIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    heroTitle: { fontSize: 22, color: c.text, textAlign: "center", marginBottom: 8 },
    heroSub: {
      fontSize: 14,
      color: c.textSecondary,
      textAlign: "center",
      lineHeight: 20,
      paddingHorizontal: 8,
    },
    authCard: {
      alignItems: "center",
      gap: 12,
      backgroundColor: c.surface,
      borderRadius: c.radius,
      borderWidth: 1,
      borderColor: c.border,
      padding: 20,
    },
    authText: { fontSize: 14, color: c.text, textAlign: "center" },
    actionCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: c.surface,
      borderRadius: c.radius,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      marginBottom: 12,
    },
    actionIcon: {
      width: 46,
      height: 46,
      borderRadius: c.radiusSm,
      alignItems: "center",
      justifyContent: "center",
    },
    actionTitle: { fontSize: 16, color: c.text },
    actionSub: { fontSize: 12, color: c.textSecondary, marginTop: 3, lineHeight: 16 },
    primaryBtn: {
      borderRadius: c.radius,
      paddingVertical: 14,
      paddingHorizontal: 20,
      alignItems: "center",
      alignSelf: "stretch",
      marginTop: 4,
    },
    primaryBtnText: { fontSize: 15 },
  });
}

function liveStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    permBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginHorizontal: 16,
      marginTop: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: c.radius,
      backgroundColor: c.warning + "1A",
      borderWidth: 1,
      borderColor: c.warning + "55",
    },
    permText: { flex: 1, fontSize: 13, lineHeight: 18 },
    permAction: { fontSize: 13 },
    listWrap: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
    listHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    listTitle: { fontSize: 11, letterSpacing: 1.5 },
    listHint: { fontSize: 10, letterSpacing: 0.3 },
    empty: { alignItems: "center", gap: 10, paddingVertical: 30, paddingHorizontal: 20 },
    emptyText: { fontSize: 13, textAlign: "center", lineHeight: 18 },
    statusPanel: {
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      backgroundColor: c.surface,
    },
    statusHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    statusTitle: { fontSize: 11, letterSpacing: 1.5 },
    statusNow: { flexDirection: "row", alignItems: "center", gap: 6 },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusNowText: { fontSize: 12 },
  });
}

function devStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    bar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: c.backgroundSecondary,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    tag: { fontSize: 9, letterSpacing: 1, color: c.textMuted, marginRight: 2 },
  });
}
