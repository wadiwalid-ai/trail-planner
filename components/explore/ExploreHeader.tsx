import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ImageBackground,
  StyleSheet,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useType } from "@/hooks/useType";
import { useUnits } from "@/context/UnitsContext";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { themeHero } from "@/constants/themeAssets";

interface WeatherData {
  temp: number;
  feelsLike: number;
  windSpeed: number;
  weatherCode: number;
  condition: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface HeaderTrail {
  id: string;
  name: string;
  location: string | null;
  difficulty: number | null;
  accentColor: string | null;
  source: string;
  activityType: string;
}

interface ExploreHeaderProps {
  weather: WeatherData | null;
  loadingWeather: boolean;
  locationName: string;
  trails: HeaderTrail[];
}

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function headlineFor(w: WeatherData | null): string {
  if (!w) return "Your next adventure awaits.";
  const c = w.weatherCode;
  if (c === 0) return "Perfect trails today.";
  if (c <= 3) return "Great day to get out.";
  if (c <= 48) return "Misty trails ahead.";
  if (c <= 67) return "Wet lines, big grip.";
  if (c <= 77) return "Fresh snow is calling.";
  return "Adventure awaits.";
}

function windQual(mps: number): string {
  if (mps < 3) return "Calm";
  if (mps < 8) return "Light";
  if (mps < 14) return "Breezy";
  return "Strong";
}

function visQual(code: number): string {
  if (code === 0) return "Excellent";
  if (code <= 3) return "Good";
  if (code <= 48) return "Low fog";
  if (code <= 67) return "Reduced";
  return "Variable";
}

function conditionScore(w: WeatherData | null): number {
  if (!w) return 80;
  const c = w.weatherCode;
  if (c === 0) return 96;
  if (c <= 3) return 88;
  if (c <= 48) return 66;
  if (c <= 67) return 54;
  if (c <= 77) return 60;
  if (c <= 82) return 58;
  return 50;
}

function difficultyLabel(d: number): string {
  if (d <= 3) return "Easy";
  if (d <= 6) return "Moderate";
  if (d <= 8) return "Hard";
  return "Extreme";
}

export function ExploreHeader({
  weather,
  loadingWeather,
  locationName,
  trails,
}: ExploreHeaderProps) {
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const units = useUnits();
  const { user } = useAuth();
  const { themeName } = useTheme();

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const hero = themeHero[themeName];
  const heroHeight = hero?.height ?? 288;
  const heroImage = hero?.image;

  const username = user?.username ?? "Explorer";
  const greeting = greetingFor(new Date().getHours());
  const headline = headlineFor(weather);

  const nearbyCount = trails.length;
  const communityCount = trails.filter((t) => t.source === "community").length;
  const avatarTrails = trails.slice(0, 3);
  const extra = Math.max(0, nearbyCount - avatarTrails.length);

  const recommended =
    trails.find(
      (t) => t.source === "community" && (t.activityType ?? "offroad") === "offroad",
    ) ??
    trails.find((t) => (t.activityType ?? "offroad") === "offroad") ??
    trails[0] ??
    null;

  const score = conditionScore(weather);
  const accentSoft = colors.accent + "1A";

  const windValue = loadingWeather
    ? "···"
    : weather
      ? units.formatSpeed(weather.windSpeed) ?? "—"
      : "—";
  const feelsValue = loadingWeather
    ? "···"
    : weather
      ? units.formatTemperature(weather.feelsLike) ?? "—"
      : "—";
  const visValue = loadingWeather ? "···" : weather ? visQual(weather.weatherCode) : "—";

  const s = StyleSheet.create({
    heroWrap: {
      marginHorizontal: 12,
      marginTop: topInset + 8,
      height: heroHeight,
      borderRadius: colors.radiusXl,
      overflow: "hidden",
      backgroundColor: colors.backgroundSecondary,
    },
    heroImg: { flex: 1 },
    heroScrim: {
      flex: 1,
      justifyContent: "space-between",
      padding: 18,
    },
    heroTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
    },
    greeting: {
      color: colors.onHero,
      fontSize: 14,
      fontFamily: type.medium,
      opacity: 0.95,
      flex: 1,
    },
    locPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(0,0,0,0.32)",
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
    },
    locText: { color: colors.onHero, fontSize: 11, fontFamily: type.medium },
    headline: {
      color: colors.onHero,
      fontSize: 30,
      lineHeight: 34,
      fontFamily: type.display,
      maxWidth: "88%",
    },
    statsRow: {
      flexDirection: "row",
      marginHorizontal: 16,
      marginTop: -30,
      gap: 10,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radiusLg,
      paddingVertical: 12,
      paddingHorizontal: 10,
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 1,
      shadowRadius: 12,
      elevation: 5,
    },
    statLabel: {
      fontSize: 9,
      letterSpacing: 1,
      textTransform: "uppercase",
      color: colors.textMuted,
      fontFamily: type.semibold,
      marginBottom: 6,
    },
    statValue: { fontSize: 15, color: colors.text, fontFamily: type.bold },
    statSub: { fontSize: 10, color: colors.textMuted, fontFamily: type.regular, marginTop: 2 },
    rowCard: {
      marginHorizontal: 16,
      marginTop: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radiusLg,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    avatarStack: { flexDirection: "row" },
    avatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: colors.surface,
    },
    avatarText: { color: "#FFFFFF", fontSize: 12, fontFamily: type.bold },
    communityTitle: { fontSize: 13, color: colors.text, fontFamily: type.semibold },
    communitySub: { fontSize: 11, color: colors.textMuted, fontFamily: type.regular, marginTop: 1 },
    liveMapPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: accentSoft,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
    },
    liveMapText: { color: colors.accent, fontSize: 12, fontFamily: type.semibold },
    recLabel: {
      fontSize: 10,
      letterSpacing: 1,
      textTransform: "uppercase",
      color: colors.accent,
      fontFamily: type.semibold,
      marginBottom: 6,
    },
    recName: { fontSize: 17, color: colors.text, fontFamily: type.bold, marginBottom: 5 },
    recMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
    recMetaText: { fontSize: 12, color: colors.textMuted, fontFamily: type.regular },
    recDot: { fontSize: 12, color: colors.textMuted },
    recScoreWrap: { alignItems: "center", minWidth: 64 },
    recScore: { fontSize: 26, color: colors.accent, fontFamily: type.bold },
    recPct: { fontSize: 13, color: colors.accent, fontFamily: type.semibold },
    recScoreLabel: {
      fontSize: 9,
      letterSpacing: 1,
      textTransform: "uppercase",
      color: colors.textMuted,
      fontFamily: type.medium,
    },
    cta: {
      marginHorizontal: 16,
      marginTop: 16,
      height: 54,
      borderRadius: colors.radiusLg,
      backgroundColor: colors.accent,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.4,
      shadowRadius: 14,
      elevation: 6,
    },
    ctaText: { color: colors.onPrimary, fontSize: 16, fontFamily: type.bold },
  });

  return (
    <View>
      <View style={s.heroWrap}>
        <ImageBackground source={heroImage} style={s.heroImg} resizeMode="cover">
          <LinearGradient
            colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0.05)", "rgba(0,0,0,0.78)"]}
            locations={[0, 0.42, 1]}
            style={s.heroScrim}
          >
            <View style={s.heroTop}>
              <Text style={s.greeting} numberOfLines={1}>
                {greeting}, {username}
              </Text>
              <View style={s.locPill}>
                <Ionicons name="location" size={12} color={colors.onHero} />
                <Text style={s.locText} numberOfLines={1}>
                  {locationName}
                </Text>
              </View>
            </View>
            <View>
              <Text style={s.headline}>{headline}</Text>
            </View>
          </LinearGradient>
        </ImageBackground>
      </View>

      <View style={s.statsRow}>
        <View style={s.statCard}>
          <Text style={s.statLabel}>Wind</Text>
          <Text style={s.statValue} numberOfLines={1}>
            {windValue}
          </Text>
          <Text style={s.statSub}>{weather ? windQual(weather.windSpeed) : "—"}</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statLabel}>Feels Like</Text>
          <Text style={s.statValue} numberOfLines={1}>
            {feelsValue}
          </Text>
          <Text style={s.statSub} numberOfLines={1}>
            {weather ? weather.condition : "—"}
          </Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statLabel}>Visibility</Text>
          <Text style={s.statValue} numberOfLines={1}>
            {visValue}
          </Text>
          <Text style={s.statSub}>Now</Text>
        </View>
      </View>

      <View style={s.rowCard}>
        <View style={s.avatarStack}>
          {avatarTrails.map((t, i) => (
            <View
              key={t.id}
              style={[
                s.avatar,
                {
                  backgroundColor: t.accentColor ?? colors.accent,
                  marginLeft: i === 0 ? 0 : -10,
                },
              ]}
            >
              <Text style={s.avatarText}>
                {(t.name.trim()[0] ?? "?").toUpperCase()}
              </Text>
            </View>
          ))}
          {extra > 0 && (
            <View
              style={[
                s.avatar,
                { backgroundColor: colors.backgroundSecondary, marginLeft: -10 },
              ]}
            >
              <Text style={[s.avatarText, { color: colors.textSecondary }]}>
                +{extra}
              </Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.communityTitle} numberOfLines={1}>
            {nearbyCount} routes to explore
          </Text>
          <Text style={s.communitySub} numberOfLines={1}>
            {communityCount > 0
              ? `${communityCount} from the community`
              : "Curated trails"}
          </Text>
        </View>
        <TouchableOpacity
          style={s.liveMapPill}
          activeOpacity={0.85}
          testID="explore-live-map"
          onPress={() => router.push("/map" as any)}
        >
          <Ionicons name="map" size={13} color={colors.accent} />
          <Text style={s.liveMapText}>Live map</Text>
        </TouchableOpacity>
      </View>

      {recommended && (
        <TouchableOpacity
          style={s.rowCard}
          activeOpacity={0.85}
          testID="explore-recommended"
          onPress={() => router.push(`/trail/${recommended.id}` as any)}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.recLabel}>Recommended for you</Text>
            <Text style={s.recName} numberOfLines={1}>
              {recommended.name}
            </Text>
            <View style={s.recMeta}>
              {recommended.location ? (
                <>
                  <Ionicons
                    name="location-outline"
                    size={13}
                    color={colors.textMuted}
                  />
                  <Text style={s.recMetaText} numberOfLines={1}>
                    {recommended.location}
                  </Text>
                  <Text style={s.recDot}>·</Text>
                </>
              ) : null}
              <Text style={s.recMetaText}>
                {difficultyLabel(recommended.difficulty ?? 5)}
              </Text>
            </View>
          </View>
          <View style={s.recScoreWrap}>
            <Text style={s.recScore}>
              {score}
              <Text style={s.recPct}>%</Text>
            </Text>
            <Text style={s.recScoreLabel}>Conditions</Text>
          </View>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={s.cta}
        activeOpacity={0.9}
        testID="explore-start-adventure"
        onPress={() => router.push("/(tabs)/record")}
      >
        <Text style={s.ctaText}>Start Adventure</Text>
        <Ionicons name="arrow-forward" size={20} color={colors.onPrimary} />
      </TouchableOpacity>
    </View>
  );
}
