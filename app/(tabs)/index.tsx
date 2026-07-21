import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useType } from "@/hooks/useType";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useUnits } from "@/context/UnitsContext";
import { TRAILS } from "@/constants/trailData";
import { ExploreHeader } from "@/components/explore/ExploreHeader";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface WeatherData {
  temp: number;
  feelsLike: number;
  windSpeed: number;
  weatherCode: number;
  condition: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface ApiTrail {
  id: string;
  name: string;
  location: string | null;
  difficulty: number | null;
  terrain: string | null;
  distance: string | null;
  duration: string | null;
  accentColor: string | null;
  elevation: string | null;
  source: string;
  osmAttribution: boolean | null;
  activityType: string;
  distanceMeters?: number | null;
  elevationGainMeters?: number | null;
  elevationLossMeters?: number | null;
  durationSeconds?: number | null;
}

const CATEGORIES = [
  { id: "rock", label: "Rock Crawl", icon: "layers-outline" as const },
  { id: "desert", label: "Desert", icon: "sunny-outline" as const },
  { id: "mountain", label: "Mountain", icon: "triangle-outline" as const },
  { id: "forest", label: "Forest", icon: "leaf-outline" as const },
  { id: "sand", label: "Sand", icon: "water-outline" as const },
  { id: "snow", label: "Snow", icon: "snow-outline" as const },
];

function getWeatherInfo(code: number): { condition: string; icon: keyof typeof Ionicons.glyphMap } {
  if (code === 0) return { condition: "Clear Sky", icon: "sunny" };
  if (code <= 3) return { condition: "Partly Cloudy", icon: "partly-sunny" };
  if (code <= 48) return { condition: "Foggy", icon: "cloud" };
  if (code <= 67) return { condition: "Rainy", icon: "rainy" };
  if (code <= 77) return { condition: "Snowy", icon: "snow" };
  if (code <= 82) return { condition: "Rain Showers", icon: "rainy" };
  if (code <= 86) return { condition: "Snow Showers", icon: "snow" };
  return { condition: "Thunderstorm", icon: "thunderstorm" };
}

function getDifficultyColor(d: number, c: ReturnType<typeof useColors>): string {
  if (d <= 3) return c.success;
  if (d <= 6) return c.warning;
  if (d <= 8) return c.accent;
  return c.danger;
}

function getDifficultyLabel(d: number): string {
  if (d <= 3) return "Easy";
  if (d <= 6) return "Moderate";
  if (d <= 8) return "Hard";
  return "Extreme";
}

// Normalise local TRAILS to the same interface as the API
function localToApiTrail(t: typeof TRAILS[number]): ApiTrail {
  return {
    id: t.id,
    name: t.name,
    location: t.location,
    difficulty: t.difficulty,
    terrain: t.terrain,
    distance: t.distance,
    duration: t.duration,
    accentColor: t.accentColor,
    elevation: t.elevation ?? null,
    source: "local",
    osmAttribution: false,
    activityType: t.activityType ?? "offroad",
    distanceMeters: null,
    elevationGainMeters: null,
    elevationLossMeters: null,
    durationSeconds: null,
  };
}

export default function ExploreScreen() {
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const units = useUnits();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [locationName, setLocationName] = useState("Off-Road Planner");
  const [loadingWeather, setLoadingWeather] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("rock");
  const [activityFilter, setActivityFilter] = useState<"offroad" | "hiking" | "all">("offroad");

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : 90;

  // Fetch trails from API; fall back to local constants on error
  const { data: apiData } = useQuery<{ trails: ApiTrail[] }>({
    queryKey: ["/api/trails"],
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const allTrails: ApiTrail[] =
    apiData?.trails && apiData.trails.length > 0
      ? apiData.trails
      : TRAILS.map(localToApiTrail);

  const trails = activityFilter === "all"
    ? allTrails
    : allTrails.filter((t) => (t.activityType ?? "offroad") === activityFilter);

  const fetchWeather = useCallback(async (lat: number, lon: number) => {
    try {
      // Always fetch canonical units (°C, m/s) and convert at render time so
      // toggling units never requires a refetch.
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&temperature_unit=celsius&wind_speed_unit=ms`;
      const res = await fetch(url);
      const data = await res.json();
      const cur = data.current;
      const { condition, icon } = getWeatherInfo(cur.weather_code);
      setWeather({
        temp: cur.temperature_2m,
        feelsLike: cur.apparent_temperature,
        windSpeed: cur.wind_speed_10m,
        weatherCode: cur.weather_code,
        condition,
        icon,
      });
    } catch {
      // silent fail for weather
    } finally {
      setLoadingWeather(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const { latitude, longitude } = loc.coords;
          fetchWeather(latitude, longitude);
          const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
          const place = geocode[0];
          if (place?.city || place?.name) {
            setLocationName(place.city || place.name || "Your Location");
          }
        } catch {
          fetchWeather(38.5733, -109.5498);
          setLocationName("Moab, Utah");
        }
      } else {
        fetchWeather(38.5733, -109.5498);
        setLocationName("Moab, Utah");
      }
    })();
  }, [fetchWeather]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      marginTop: 24,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 18,
      fontFamily: type.display,
      color: colors.text,
    },
    categoryItem: {
      alignItems: "center",
      marginLeft: 12,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 14,
      minWidth: 68,
    },
    categoryLabel: {
      fontSize: 11,
      fontFamily: type.medium,
      marginTop: 5,
    },
    trailCard: {
      marginHorizontal: 20,
      marginBottom: 14,
      borderRadius: 18,
      overflow: "hidden",
      backgroundColor: colors.surface,
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 4,
      flexDirection: "row",
    },
    trailAccent: {
      width: 5,
    },
    trailBody: {
      flex: 1,
      padding: 16,
    },
    trailName: {
      fontSize: 17,
      fontFamily: type.bold,
      color: colors.text,
      marginBottom: 2,
    },
    trailLocation: {
      fontSize: 13,
      fontFamily: type.regular,
      color: colors.textMuted,
      marginBottom: 10,
    },
    trailMeta: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 6,
    },
    badge: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
    },
    badgeText: {
      fontSize: 11,
      fontFamily: type.semibold,
      color: colors.onPrimary,
    },
    terrainBadge: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: colors.backgroundSecondary,
    },
    terrainBadgeText: {
      fontSize: 11,
      fontFamily: type.medium,
      color: colors.textSecondary,
    },
    osmBadge: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: "#3B82F610",
      borderWidth: 1,
      borderColor: "#3B82F630",
    },
    osmBadgeText: {
      fontSize: 10,
      fontFamily: type.medium,
      color: "#3B82F6",
    },
    activityBar: {
      flexDirection: "row",
      marginHorizontal: 20,
      marginTop: 20,
      marginBottom: 4,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 14,
      padding: 4,
    },
    activityTab: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 11,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 5,
    },
    activityTabText: {
      fontSize: 13,
      fontFamily: type.semibold,
    },
    trailRight: {
      padding: 16,
      alignItems: "flex-end",
      justifyContent: "center",
      gap: 4,
    },
    trailStat: {
      fontSize: 12,
      fontFamily: type.regular,
      color: colors.textMuted,
      textAlign: "right",
    },
    trailStatBold: {
      fontSize: 13,
      fontFamily: type.semibold,
      color: colors.textSecondary,
      textAlign: "right",
    },
    mapBtn: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      marginTop: 4,
    },
  });

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad }}
      >
        <ExploreHeader
          weather={weather}
          loadingWeather={loadingWeather}
          locationName={locationName}
          trails={allTrails}
        />

        {/* Activity type filter */}
        <View style={styles.activityBar}>
          {([
            { key: "offroad", label: "4WD Off-Road", icon: "car-sport-outline" as const },
            { key: "hiking", label: "Hiking", icon: "walk-outline" as const },
            { key: "all", label: "All", icon: "apps-outline" as const },
          ] as const).map((tab) => {
            const active = activityFilter === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.activityTab,
                  active && { backgroundColor: colors.primary },
                ]}
                onPress={() => setActivityFilter(tab.key)}
              >
                <Ionicons
                  name={tab.icon}
                  size={15}
                  color={active ? colors.onPrimary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.activityTabText,
                    { color: active ? colors.onPrimary : colors.textSecondary },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ marginTop: 24 }}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Categories</Text>
          </View>
          <FlatList
            data={CATEGORIES}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 8, paddingRight: 20 }}
            keyExtractor={(item) => item.id}
            scrollEnabled={true}
            renderItem={({ item }) => {
              const active = selectedCategory === item.id;
              return (
                <TouchableOpacity
                  style={[
                    styles.categoryItem,
                    {
                      backgroundColor: active
                        ? colors.primary
                        : colors.backgroundSecondary,
                    },
                  ]}
                  onPress={() => setSelectedCategory(item.id)}
                >
                  <Ionicons
                    name={item.icon}
                    size={22}
                    color={active ? colors.onPrimary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.categoryLabel,
                      { color: active ? colors.onPrimary : colors.textSecondary },
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Featured Trails</Text>
          <Text style={{ fontSize: 12, fontFamily: type.regular, color: colors.textMuted }}>
            {trails.length} trails
          </Text>
        </View>

        {trails.map((trail) => {
          const difficulty = trail.difficulty ?? 5;
          const accent = trail.accentColor ?? "#D4763B";
          return (
            <TouchableOpacity
              key={trail.id}
              style={styles.trailCard}
              onPress={() => router.push(`/trail/${trail.id}` as any)}
              activeOpacity={0.8}
            >
              <View style={[styles.trailAccent, { backgroundColor: accent }]} />
              <View style={styles.trailBody}>
                <Text style={styles.trailName}>{trail.name}</Text>
                <Text style={styles.trailLocation}>{trail.location}</Text>
                <View style={styles.trailMeta}>
                  <View style={[styles.badge, { backgroundColor: getDifficultyColor(difficulty, colors) }]}>
                    <Text style={styles.badgeText}>
                      {getDifficultyLabel(difficulty)} {difficulty}/10
                    </Text>
                  </View>
                  {trail.terrain && (
                    <View style={styles.terrainBadge}>
                      <Text style={styles.terrainBadgeText}>{trail.terrain}</Text>
                    </View>
                  )}
                  {trail.osmAttribution && (
                    <View style={styles.osmBadge}>
                      <Text style={styles.osmBadgeText}>© OSM</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.trailRight}>
                <Text style={styles.trailStatBold}>
                  {units.formatDistance(trail.distanceMeters) ?? trail.distance ?? "—"}
                </Text>
                <Text style={styles.trailStat}>
                  {units.formatDuration(trail.durationSeconds) ?? trail.duration ?? "—"}
                </Text>
                <View style={[styles.mapBtn, { backgroundColor: accent + "20", borderColor: accent + "50" }]}>
                  <Ionicons name="map-outline" size={14} color={accent} />
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
