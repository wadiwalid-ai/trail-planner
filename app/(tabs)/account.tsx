import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useColors } from "@/hooks/useColors";
import { useType } from "@/hooks/useType";
import { useTheme } from "@/context/ThemeContext";
import themes from "@/constants/colors";
import type { AppColors } from "@/constants/colors";
import type { ThemeName } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useUnits } from "@/context/UnitsContext";

const TAB_BAR_HEIGHT = Platform.OS === "web" ? 84 : 90;

const THEMES: { name: ThemeName; label: string; accent: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { name: "dune",     label: "Dune",     accent: "#D89F5C", icon: "sunny-outline" },
  { name: "overland", label: "Overland", accent: "#A64B2A", icon: "map-outline" },
  { name: "apex",     label: "Apex",     accent: "#22d3ee", icon: "speedometer-outline" },
  { name: "horizon",  label: "Horizon",  accent: "#0EA5E9", icon: "partly-sunny-outline" },
];

interface UgcClause {
  key: string;
  title: string;
  text: string;
}

function ThemeSelector() {
  const colors = useColors();
  const type = useType();
  const { themeName, setTheme } = useTheme();
  const s = styles(colors);

  return (
    <View style={s.themeSection}>
      <View style={s.themeLabelRow}>
        <Ionicons name="color-palette-outline" size={18} color={colors.accent} style={{ marginRight: 8 }} />
        <Text style={[s.themeSectionLabel, { fontFamily: type.display }]}>App Theme</Text>
      </View>
      <Text style={s.themeSectionSub}>Changes take effect instantly</Text>
      <View style={s.themeGrid}>
        {THEMES.map((t) => {
          const active = themeName === t.name;
          return (
            <TouchableOpacity
              key={t.name}
              activeOpacity={0.8}
              onPress={() => setTheme(t.name)}
              style={[
                s.themeCard,
                active && { borderColor: t.accent, borderWidth: 2 },
              ]}
            >
              <View
                style={[
                  s.themeIconWrap,
                  { backgroundColor: `${t.accent}22` },
                ]}
              >
                <Ionicons name={t.icon} size={20} color={t.accent} />
              </View>
              <Text style={[s.themeCardLabel, { fontFamily: type.semibold }, active && { color: t.accent }]} numberOfLines={1}>
                {t.label}
              </Text>
              <View
                style={[
                  s.themeSwatchStrip,
                  { borderRadius: themes[t.name].radiusSm },
                ]}
              >
                <View style={[s.themeSwatch, { backgroundColor: themes[t.name].background }]} />
                <View style={[s.themeSwatch, { backgroundColor: themes[t.name].surface }]} />
                <View style={[s.themeSwatch, { backgroundColor: themes[t.name].accent }]} />
                <View style={[s.themeSwatch, { backgroundColor: themes[t.name].text }]} />
              </View>
              {active && (
                <View style={[s.themeActiveDot, { backgroundColor: t.accent }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  colors,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  colors: AppColors;
}) {
  const s = styles(colors);
  return (
    <View style={s.segment}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            activeOpacity={0.8}
            onPress={() => onChange(opt.value)}
            style={[s.segmentBtn, active && { backgroundColor: colors.primary }]}
            testID={`unit-${opt.value}`}
          >
            <Text style={[s.segmentText, active && s.segmentTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function UnitsSelector() {
  const colors = useColors();
  const { system, setSystem, tempUnit, setTempUnit } = useUnits();
  const s = styles(colors);

  return (
    <View style={s.themeSection}>
      <View style={s.themeLabelRow}>
        <Ionicons name="options-outline" size={18} color={colors.accent} style={{ marginRight: 8 }} />
        <Text style={s.themeSectionLabel}>Units</Text>
      </View>
      <Text style={s.themeSectionSub}>Applies across the whole app</Text>

      <View style={s.unitRow}>
        <Text style={s.unitRowLabel}>Distance</Text>
        <Segmented
          options={[
            { value: "metric", label: "KM" },
            { value: "imperial", label: "MI" },
          ]}
          value={system}
          onChange={setSystem}
          colors={colors}
        />
      </View>
      <View style={[s.unitRow, { marginBottom: 0 }]}>
        <Text style={s.unitRowLabel}>Temperature</Text>
        <Segmented
          options={[
            { value: "C", label: "°C" },
            { value: "F", label: "°F" },
          ]}
          value={tempUnit}
          onChange={setTempUnit}
          colors={colors}
        />
      </View>
    </View>
  );
}

function AuthForm() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const s = styles(colors);
  const { login, signup } = useAuth();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: clausesData } = useQuery<{ clauses: UgcClause[] }>({
    queryKey: ["/api/ugc-clauses"],
  });
  const clauses = clausesData?.clauses ?? [];

  const submit = useCallback(async () => {
    if (username.trim().length < 3) {
      Alert.alert("Username too short", "Use at least 3 characters.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Password too short", "Use at least 6 characters.");
      return;
    }
    if (mode === "signup" && !agreed) {
      Alert.alert("Agreement required", "Please accept the content agreement to sign up.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        await signup(username.trim(), password, agreed);
      } else {
        await login(username.trim(), password);
      }
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      const clean = msg.includes(":") ? msg.slice(msg.indexOf(":") + 1).trim() : msg;
      Alert.alert("Could not continue", clean || "Please try again.");
    } finally {
      setBusy(false);
    }
  }, [mode, username, password, agreed, login, signup]);

  return (
    <KeyboardAwareScrollView
      bottomOffset={20}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        padding: 24,
        paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 24,
        paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 24,
      }}
    >
      <ThemeSelector />

      <UnitsSelector />

      <View style={s.logoCircle}>
        <Ionicons name="trail-sign" size={32} color={colors.primary} />
      </View>
      <Text style={s.title}>{mode === "login" ? "Welcome back" : "Create account"}</Text>
      <Text style={s.subtitle}>
        {mode === "login"
          ? "Sign in to sync your tracks and trips across devices."
          : "Save your recorded tracks, trips and media to the cloud."}
      </Text>

      <Text style={s.label}>Username</Text>
      <TextInput
        value={username}
        onChangeText={setUsername}
        placeholder="trailblazer"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        style={s.input}
        testID="auth-username"
      />

      <Text style={s.label}>Password</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        placeholderTextColor={colors.textMuted}
        secureTextEntry
        autoCapitalize="none"
        style={s.input}
        testID="auth-password"
      />

      {mode === "signup" && (
        <View style={s.agreementCard}>
          <Text style={s.agreementHeading}>Content agreement</Text>
          <Text style={s.agreementIntro}>
            By signing up you confirm the tracks you record are your own and agree they may be
            shared publicly and viewed by others by default.
          </Text>
          {clauses.map((c) => (
            <View key={c.key} style={s.clauseRow}>
              <Ionicons
                name="checkmark-circle"
                size={16}
                color={colors.primary}
                style={{ marginTop: 1 }}
              />
              <Text style={s.clauseText}>{c.title}</Text>
            </View>
          ))}
          <TouchableOpacity
            style={s.agreeRow}
            onPress={() => setAgreed((v) => !v)}
            activeOpacity={0.7}
            testID="auth-agree"
          >
            <Ionicons
              name={agreed ? "checkbox" : "square-outline"}
              size={22}
              color={agreed ? colors.primary : colors.textMuted}
            />
            <Text style={s.agreeText}>I have read and accept the content agreement.</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={[s.primaryBtn, (busy || (mode === "signup" && !agreed)) && { opacity: 0.6 }]}
        onPress={submit}
        disabled={busy}
        activeOpacity={0.8}
        testID="auth-submit"
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.primaryBtnText}>{mode === "login" ? "Sign in" : "Sign up"}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={s.switchLink}
        onPress={() => {
          setMode(mode === "login" ? "signup" : "login");
          setAgreed(false);
        }}
      >
        <Text style={s.switchText}>
          {mode === "login" ? "New here? " : "Already have an account? "}
          <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
            {mode === "login" ? "Create an account" : "Sign in"}
          </Text>
        </Text>
      </TouchableOpacity>
    </KeyboardAwareScrollView>
  );
}

function Profile() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const s = styles(colors);
  const { user, logout } = useAuth();

  const { data: ugcStatus } = useQuery<{ ugcAccepted: boolean; prerequisitesMet: boolean }>({
    queryKey: ["/api/me/ugc-status"],
  });
  const units = useUnits();
  const {
    data: myTrails,
    isLoading: isLoadingTrails,
    refetch: refetchTrails,
  } = useQuery<{ trails: any[] }>({
    queryKey: ["/api/me/trails"],
  });

  // Refetch when the tab regains focus so a freshly saved track shows up.
  useFocusEffect(
    useCallback(() => {
      refetchTrails();
    }, [refetchTrails]),
  );

  const confirmLogout = useCallback(() => {
    Alert.alert("Sign out?", "Your tracks stay safe in the cloud.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => logout() },
    ]);
  }, [logout]);

  const trails = myTrails?.trails ?? [];
  const trackCount = trails.length;
  const ugcAccepted = !!ugcStatus?.ugcAccepted;

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 20,
        paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 16,
        paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 24,
      }}
    >
      <View style={s.profileHeader}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{user?.username?.[0]?.toUpperCase() ?? "?"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.username}>{user?.username}</Text>
          <Text style={s.subtitle}>Signed in</Text>
        </View>
      </View>

      <View style={s.statRow}>
        <View style={s.statCard}>
          <Text style={s.statNum}>{trackCount}</Text>
          <Text style={s.statLabel}>My tracks</Text>
        </View>
        <View style={s.statCard}>
          <Ionicons
            name={ugcAccepted ? "shield-checkmark" : "shield-outline"}
            size={22}
            color={ugcAccepted ? colors.success : colors.textMuted}
          />
          <Text style={s.statLabel}>{ugcAccepted ? "Agreement signed" : "Not signed"}</Text>
        </View>
      </View>

      <Text style={s.sectionLabel}>My Trails</Text>
      {isLoadingTrails ? (
        <View style={s.emptyBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : trails.length === 0 ? (
        <View style={s.emptyBox}>
          <Ionicons name="map-outline" size={26} color={colors.textMuted} />
          <Text style={s.emptyText}>No saved tracks yet. Record one and it shows up here.</Text>
        </View>
      ) : (
        trails.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={s.trailRow}
            activeOpacity={0.7}
            onPress={() => router.push(`/trail/${t.id}` as any)}
            testID={`my-trail-${t.id}`}
          >
            <View style={s.trailIconWrap}>
              <Ionicons
                name={
                  t.visibility === "public"
                    ? "earth"
                    : t.visibility === "unlisted"
                      ? "link"
                      : "lock-closed"
                }
                size={16}
                color={colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.trailName} numberOfLines={1}>
                {t.name}
              </Text>
              <Text style={s.trailMeta} numberOfLines={1}>
                {[
                  units.formatDistance(t.distanceMeters) ?? t.distance,
                  units.formatDuration(t.durationSeconds) ?? t.duration,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Recorded track"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ))
      )}

      <View style={{ height: 24 }} />

      <UnitsSelector />

      <ThemeSelector />

      <TouchableOpacity style={s.rowBtn} onPress={() => router.push("/ugc")} activeOpacity={0.7}>
        <Ionicons name="document-text-outline" size={22} color={colors.text} />
        <Text style={s.rowBtnText}>
          {ugcAccepted ? "Review content agreement" : "Complete content agreement"}
        </Text>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity
        style={s.rowBtn}
        onPress={() => router.push("/(tabs)/record")}
        activeOpacity={0.7}
      >
        <Ionicons name="recording-outline" size={22} color={colors.text} />
        <Text style={s.rowBtnText}>Record a new track</Text>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity
        style={s.rowBtn}
        onPress={() => router.push("/convoy" as any)}
        activeOpacity={0.7}
        testID="account-convoy"
      >
        <Ionicons name="people-outline" size={22} color={colors.text} />
        <Text style={s.rowBtnText}>Convoy — group live tracking</Text>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity
        style={s.rowBtn}
        onPress={() => router.push("/(tabs)/gear")}
        activeOpacity={0.7}
        testID="account-gear"
      >
        <Ionicons name="construct-outline" size={22} color={colors.text} />
        <Text style={s.rowBtnText}>Gear &amp; checklists</Text>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      {user?.isAdmin && (
        <TouchableOpacity
          style={s.rowBtn}
          onPress={() => router.push("/admin/users" as any)}
          activeOpacity={0.7}
          testID="account-admin"
        >
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.text} />
          <Text style={s.rowBtnText}>Manage account access</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[s.rowBtn, { marginTop: 24 }]}
        onPress={confirmLogout}
        activeOpacity={0.7}
        testID="logout-btn"
      >
        <Ionicons name="log-out-outline" size={22} color={colors.danger} />
        <Text style={[s.rowBtnText, { color: colors.danger }]}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

export default function AccountScreen() {
  const colors = useColors();
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={[{ flex: 1, alignItems: "center", justifyContent: "center" }, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {isAuthenticated ? <Profile /> : <AuthForm />}
    </View>
  );
}

const styles = (c: AppColors) =>
  StyleSheet.create({
    themeSection: {
      marginBottom: 24,
      backgroundColor: c.surface,
      borderRadius: c.radius,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },
    themeLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 2,
    },
    themeSectionLabel: {
      fontSize: 15,
      fontFamily: "Inter_700Bold",
      color: c.text,
    },
    themeSectionSub: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: c.textMuted,
      marginBottom: 14,
      marginLeft: 26,
    },
    themeGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    themeCard: {
      flex: 1,
      minWidth: "45%",
      backgroundColor: c.backgroundSecondary,
      borderRadius: c.radiusSm,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
      alignItems: "center",
      gap: 6,
      position: "relative",
    },
    themeIconWrap: {
      width: 40,
      height: 40,
      borderRadius: c.radiusSm,
      alignItems: "center",
      justifyContent: "center",
    },
    themeCardLabel: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: c.textSecondary,
      textAlign: "center",
    },
    themeSwatchStrip: {
      flexDirection: "row",
      width: "100%",
      height: 14,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: c.border,
      marginTop: 2,
    },
    themeSwatch: {
      flex: 1,
      height: "100%",
    },
    themeActiveDot: {
      position: "absolute",
      top: 8,
      right: 8,
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    logoCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      marginBottom: 20,
    },
    title: { fontSize: 26, fontFamily: "Inter_700Bold", color: c.text, textAlign: "center" },
    subtitle: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: c.textSecondary,
      textAlign: "center",
      marginTop: 6,
      marginBottom: 24,
      lineHeight: 20,
    },
    label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.textSecondary, marginBottom: 6 },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: c.radiusSm,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: c.text,
      marginBottom: 16,
    },
    primaryBtn: {
      backgroundColor: c.primary,
      borderRadius: c.radius,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 4,
    },
    primaryBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
    agreementCard: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: c.radius,
      padding: 16,
      marginBottom: 16,
    },
    agreementHeading: {
      fontSize: 14,
      fontFamily: "Inter_700Bold",
      color: c.text,
      marginBottom: 6,
    },
    agreementIntro: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: c.textSecondary,
      lineHeight: 19,
      marginBottom: 12,
    },
    clauseRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 },
    clauseText: {
      flex: 1,
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: c.textSecondary,
      lineHeight: 18,
    },
    agreeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 6,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    agreeText: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.text, lineHeight: 18 },
    switchLink: { alignItems: "center", paddingVertical: 18 },
    switchText: { color: c.textSecondary, fontFamily: "Inter_400Regular", fontSize: 14 },
    profileHeader: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 14,
    },
    avatarText: { color: "#fff", fontSize: 24, fontFamily: "Inter_700Bold" },
    username: { fontSize: 22, fontFamily: "Inter_700Bold", color: c.text },
    statRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
    statCard: {
      flex: 1,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: c.radius,
      padding: 16,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 84,
    },
    statNum: { fontSize: 28, fontFamily: "Inter_700Bold", color: c.text },
    statLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: c.textSecondary, marginTop: 4 },
    rowBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: c.radius,
      paddingHorizontal: 16,
      paddingVertical: 16,
      marginBottom: 10,
      gap: 12,
    },
    rowBtnText: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.text },
    sectionLabel: {
      fontSize: 15,
      fontFamily: "Inter_700Bold",
      color: c.text,
      marginBottom: 12,
    },
    emptyBox: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: c.radius,
      paddingVertical: 28,
      paddingHorizontal: 16,
      alignItems: "center",
      gap: 10,
    },
    emptyText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: c.textMuted,
      textAlign: "center",
      lineHeight: 18,
    },
    trailRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: c.radius,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 10,
      gap: 12,
    },
    trailIconWrap: {
      width: 36,
      height: 36,
      borderRadius: c.radiusSm,
      backgroundColor: `${c.primary}1A`,
      alignItems: "center",
      justifyContent: "center",
    },
    trailName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.text },
    trailMeta: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: c.textSecondary,
      marginTop: 2,
    },
    unitRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    unitRowLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: c.text },
    segment: {
      flexDirection: "row",
      backgroundColor: c.backgroundSecondary,
      borderRadius: c.radiusPill,
      borderWidth: 1,
      borderColor: c.border,
      padding: 3,
      gap: 2,
    },
    segmentBtn: {
      paddingHorizontal: 16,
      paddingVertical: 7,
      borderRadius: c.radiusPill,
    },
    segmentText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.textSecondary },
    segmentTextActive: { color: "#fff" },
  });
