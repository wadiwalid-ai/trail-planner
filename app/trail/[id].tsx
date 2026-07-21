import React, { useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
  Platform,
  Dimensions,
  StatusBar,

  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Share,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import AdventureMap, {
  type AdventureMapHandle,
  type AdventurePolyline,
  type AdventureMarker,
  type AdventureBaseLayer,
} from "@/components/AdventureMap";
import { LayerSwitcher, CompassRose } from "@/components/MapControls";
import { IconButton } from "@/components/cockpit";
import TrackProfile from "@/components/TrackProfile";
import { NavigationHUD } from "@/components/NavigationHUD";
import { SafetyFab } from "@/components/SafetyFab";
import * as Location from "expo-location";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import { routeState } from "@/lib/navigation";
import { fetchRoute, type RouteResult } from "@/lib/routing";
import { useColors } from "@/hooks/useColors";
import { routeNavCasing } from "@/constants/colors";
import { useUnits } from "@/context/UnitsContext";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import {
  computeStats,
  detectTechnicalSections,
  type TrackPoint,
  type TechnicalSection,
} from "@/lib/trackAnalysis";
import {
  TRAILS,
  TRAIL_MAP_DATA,
  WP_CONFIG,
  toWaypointType,
  wpVariant,
  getWaypointCategoryMeta,
  WAYPOINT_CATEGORY_META,
  type TrailWaypoint,
  type WaypointCategory,
} from "@/constants/trailData";

interface TelemetryPoint {
  latitude: number;
  longitude: number;
  altitude: number | null;
  speed: number | null;
  timestampMs: number | null;
  accuracy: number | null;
}

interface TrailMediaItem {
  id: string;
  uri: string;
  thumbnailUri: string | null;
  caption: string | null;
  mediaType: string;
  latitude: number | null;
  longitude: number | null;
  takenAt: string | null;
}

const ACTIVITY_LABELS: Record<string, string> = {
  offroad: "Off-Road",
  drive: "Drive",
  bike: "Bike",
  hike: "Hike",
  run: "Run",
  walk: "Walk",
};

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_COLLAPSED = 240;
const SHEET_EXPANDED = Math.min(560, SCREEN_HEIGHT * 0.62);

// ── Types ────────────────────────────────────────────────────────────────────
type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

function getDifficultyColor(d: number, c: { success: string; warning: string; accent: string; danger: string }): string {
  if (d <= 3) return c.success;
  if (d <= 6) return c.warning;
  if (d <= 8) return c.accent;
  return c.danger;
}

// ── AI insights shape (mirrors AiTrailInsights in shared/schema) ─────────────
interface AiInsights {
  summary: string;
  difficultyAssessment: string;
  terrainTags: string[];
  generatedAt: string;
}

// Defensive: tolerate missing/malformed fields in stored AI JSON so the
// trail screen never crashes on partial data (e.g. terrainTags absent).
function normalizeAiInsights(raw: unknown): AiInsights | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const summary = typeof r.summary === "string" ? r.summary : "";
  if (!summary) return null;
  return {
    summary,
    difficultyAssessment:
      typeof r.difficultyAssessment === "string" ? r.difficultyAssessment : "",
    terrainTags: Array.isArray(r.terrainTags)
      ? r.terrainTags.filter((t): t is string => typeof t === "string")
      : [],
    generatedAt: typeof r.generatedAt === "string" ? r.generatedAt : "",
  };
}

// ── Unified trail data shape ─────────────────────────────────────────────────
interface UnifiedTrail {
  id: string;
  name: string;
  location: string;
  difficulty: number;
  terrain: string;
  distance: string;
  duration: string;
  accentColor: string;
  elevation: string;
  description: string;
  osmAttribution: boolean;
  approachFrom: string;
  region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  approachCoordinates: { latitude: number; longitude: number }[];
  trailCoordinates: { latitude: number; longitude: number }[];
  waypoints: TrailWaypoint[];
  distanceMeters: number | null;
  elevationGainMeters: number | null;
  elevationLossMeters: number | null;
  durationSeconds: number | null;
  telemetry: TelemetryPoint[];
  media: TrailMediaItem[];
  activityType: string;
  source: string;
  aiInsights: AiInsights | null;
  visibility: string;
  ownerId: string | null;
  shareToken: string | null;
}

// ── Map local constants to unified shape ─────────────────────────────────────
function fromLocalConstants(id: string): UnifiedTrail | null {
  const t = TRAILS.find((x) => x.id === id);
  const m = TRAIL_MAP_DATA[id];
  if (!t || !m) return null;
  return {
    id: t.id,
    name: t.name,
    location: t.location,
    difficulty: t.difficulty,
    terrain: t.terrain,
    distance: t.distance,
    duration: t.duration,
    accentColor: t.accentColor,
    elevation: t.elevation ?? "—",
    description: t.description,
    osmAttribution: false,
    approachFrom: m.approachFrom,
    region: m.region,
    approachCoordinates: m.approachCoordinates,
    trailCoordinates: m.trailCoordinates,
    waypoints: m.waypoints,
    distanceMeters: null,
    elevationGainMeters: null,
    elevationLossMeters: null,
    durationSeconds: null,
    telemetry: [],
    media: [],
    activityType: "offroad",
    source: "curated",
    aiInsights: null,
    visibility: "public",
    ownerId: null,
    shareToken: null,
  };
}

// ── Map API response to unified shape ────────────────────────────────────────
interface ApiTrailDetail {
  id: string;
  name: string;
  location: string | null;
  difficulty: number | null;
  terrain: string | null;
  distance: string | null;
  duration: string | null;
  accentColor: string | null;
  elevation: string | null;
  description: string | null;
  osmAttribution: boolean | null;
  approachFrom: string | null;
  distanceMeters: number | null;
  elevationGainMeters: number | null;
  elevationLossMeters: number | null;
  durationSeconds: number | null;
  region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null;
  approachCoordinates: { latitude: number; longitude: number }[];
  trailCoordinates: { latitude: number; longitude: number }[];
  waypoints: {
    id: string;
    name: string;
    description: string | null;
    type: string;
    coordinate: { latitude: number; longitude: number };
    elevation: string | null;
  }[];
  telemetry?: TelemetryPoint[];
  media?: TrailMediaItem[];
  activityType?: string | null;
  source?: string | null;
  aiInsights?: AiInsights | null;
  visibility?: string | null;
  ownerId?: string | null;
  shareToken?: string | null;
}

function fromApi(raw: ApiTrailDetail, fallback: UnifiedTrail | null): UnifiedTrail {
  const waypoints: TrailWaypoint[] = raw.waypoints.map((w) => ({
    id: w.id,
    name: w.name,
    description: w.description ?? "",
    type: toWaypointType(w.type),
    rawType: w.type,
    coordinate: w.coordinate,
    elevation: w.elevation ?? undefined,
  }));

  const region = raw.region ?? fallback?.region ?? {
    latitude: raw.trailCoordinates[Math.floor(raw.trailCoordinates.length / 2)]?.latitude ?? 0,
    longitude: raw.trailCoordinates[Math.floor(raw.trailCoordinates.length / 2)]?.longitude ?? 0,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  };

  return {
    id: String(raw.id),
    name: raw.name,
    location: raw.location ?? fallback?.location ?? "",
    difficulty: raw.difficulty ?? fallback?.difficulty ?? 5,
    terrain: raw.terrain ?? fallback?.terrain ?? "Off-Road",
    distance: raw.distance ?? fallback?.distance ?? "—",
    duration: raw.duration ?? fallback?.duration ?? "—",
    accentColor: raw.accentColor ?? fallback?.accentColor ?? "#D4763B",
    elevation: raw.elevation ?? fallback?.elevation ?? "—",
    description: raw.description ?? fallback?.description ?? "",
    osmAttribution: raw.osmAttribution ?? false,
    approachFrom: raw.approachFrom ?? fallback?.approachFrom ?? "",
    region,
    approachCoordinates:
      raw.approachCoordinates.length > 0
        ? raw.approachCoordinates
        : fallback?.approachCoordinates ?? [],
    trailCoordinates:
      raw.trailCoordinates.length > 0
        ? raw.trailCoordinates
        : fallback?.trailCoordinates ?? [],
    waypoints: waypoints.length > 0 ? waypoints : fallback?.waypoints ?? [],
    distanceMeters: raw.distanceMeters ?? fallback?.distanceMeters ?? null,
    elevationGainMeters: raw.elevationGainMeters ?? fallback?.elevationGainMeters ?? null,
    elevationLossMeters: raw.elevationLossMeters ?? fallback?.elevationLossMeters ?? null,
    durationSeconds: raw.durationSeconds ?? fallback?.durationSeconds ?? null,
    telemetry: raw.telemetry ?? [],
    media: raw.media ?? [],
    activityType: raw.activityType ?? fallback?.activityType ?? "offroad",
    source: raw.source ?? fallback?.source ?? "community",
    aiInsights: normalizeAiInsights(raw.aiInsights),
    visibility: raw.visibility ?? "private",
    ownerId: raw.ownerId ?? null,
    shareToken: raw.shareToken ?? null,
  };
}

// ── Web placeholder ─────────────────────────────────────────────────────────
function WebPlaceholder({ trail, isOwner }: { trail: UnifiedTrail; isOwner: boolean }) {
  const router = useRouter();
  const colors = useColors();

  const webTechPoints: TrackPoint[] = trail.telemetry.map((t) => ({
    latitude: t.latitude,
    longitude: t.longitude,
    altitude: t.altitude,
    speed: t.speed,
    timestampMs: t.timestampMs,
  }));
  const webSections: TechnicalSection[] =
    webTechPoints.length >= 2 ? detectTechnicalSections(webTechPoints) : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: 67, paddingHorizontal: 20, paddingBottom: 16, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.text }}>{trail.name}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 54 }}>
        {trail.description ? (
          <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textSecondary, marginBottom: 16, lineHeight: 20 }}>
            {trail.description}
          </Text>
        ) : null}

        {/* Stats */}
        <View style={{ marginBottom: 16 }}>
          <StatsGrid trail={trail} />
        </View>

        {/* Graphs */}
        {webTechPoints.length >= 2 && (
          <View style={{ marginBottom: 16 }}>
            <TrackProfile points={webTechPoints} technical={webSections} accentColor={trail.accentColor} />
          </View>
        )}

        {/* AI trip report (recorded community tracks only) */}
        {trail.source === "community" && trail.telemetry.length >= 2 && (
          <AiInsightsCard trail={trail} isOwner={isOwner} />
        )}

        {/* Media */}
        <MediaGallery media={trail.media} accentColor={trail.accentColor} />

        {/* Technical sections summary */}
        {webSections.length > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.technical + "12", borderRadius: colors.radius, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.technical + "33", marginBottom: 16 }}>
            <Ionicons name="warning" size={16} color={colors.technical} style={{ marginRight: 8 }} />
            <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: colors.text }}>
              {webSections.length} technical {webSections.length === 1 ? "section" : "sections"} detected
            </Text>
          </View>
        )}

        {/* Start point */}
        {trail.trailCoordinates.length > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: colors.radius, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
            <Ionicons name="flag" size={16} color={colors.primary} style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.textMuted }}>Start point</Text>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text }}>
                {trail.trailCoordinates[0].latitude.toFixed(5)}, {trail.trailCoordinates[0].longitude.toFixed(5)}
              </Text>
            </View>
          </View>
        )}

        <View style={{ backgroundColor: colors.surface, borderRadius: colors.radius, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Approach from {trail.approachFrom}
          </Text>
          {trail.approachCoordinates.slice(1).map((c, i) => (
            <Text key={i} style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.textSecondary, marginBottom: 4 }}>
              📍 {c.latitude.toFixed(4)}°N, {Math.abs(c.longitude).toFixed(4)}{c.longitude < 0 ? "°W" : "°E"}
            </Text>
          ))}
        </View>
        {trail.osmAttribution && (
          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted, marginBottom: 12 }}>
            © OpenStreetMap contributors (ODbL)
          </Text>
        )}
        <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 12 }}>
          Trail Waypoints
        </Text>
        {trail.waypoints.map((wp) => {
          const cfg = WP_CONFIG[wp.type];
          const catMeta = getWaypointCategoryMeta(wp.rawType ?? wp.type);
          const wpColor = catMeta ? catMeta.color : cfg.color;
          const wpIcon = catMeta ? catMeta.glyph : cfg.icon;
          return (
            <View key={wp.id} style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 16, backgroundColor: colors.surface, borderRadius: colors.radius, padding: 14, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: wpColor, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                <Ionicons name={wpIcon} size={16} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.text }}>{wp.name}</Text>
                {wp.elevation && <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: wpColor, marginBottom: 2 }}>{wp.elevation}</Text>}
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.textSecondary, lineHeight: 18 }}>{wp.description}</Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.textMuted, marginTop: 4 }}>
                  📍 {wp.coordinate.latitude.toFixed(5)}, {wp.coordinate.longitude.toFixed(5)}
                </Text>
              </View>
            </View>
          );
        })}

        {/* AI waypoint suggestions (owner of recorded community tracks only) */}
        {isOwner && trail.telemetry.length >= 2 && (
          <AiWaypointSuggestions trail={trail} />
        )}
      </ScrollView>
    </View>
  );
}

// ── Stats grid ───────────────────────────────────────────────────────────────
function StatsGrid({ trail }: { trail: UnifiedTrail }) {
  const colors = useColors();
  const units = useUnits();

  const points: TrackPoint[] = trail.telemetry.map((t) => ({
    latitude: t.latitude,
    longitude: t.longitude,
    altitude: t.altitude,
    speed: t.speed,
    timestampMs: t.timestampMs,
  }));
  const stats = points.length >= 2 ? computeStats(points) : null;

  const distance =
    units.formatDistance(stats?.distanceMeters ?? trail.distanceMeters) ?? trail.distance;
  const duration =
    units.formatDuration(stats?.durationSeconds ?? trail.durationSeconds) ?? trail.duration;
  const gain =
    units.formatElevation(stats?.elevationGainMeters ?? trail.elevationGainMeters) ??
    trail.elevation;
  const loss = units.formatElevation(stats?.elevationLossMeters ?? trail.elevationLossMeters);
  const maxAlt = units.formatElevation(stats?.maxAltitudeMeters);
  const avgSpeed = units.formatSpeed(stats?.avgSpeedMps);
  const maxSpeed = units.formatSpeed(stats?.maxSpeedMps);

  const cells: { icon: IoniconName; label: string; value: string }[] = [
    { icon: "resize", label: "Distance", value: distance },
    { icon: "time-outline", label: "Duration", value: duration },
    { icon: "trending-up-outline", label: "Elev Gain", value: gain },
  ];
  if (loss) cells.push({ icon: "trending-down-outline", label: "Elev Loss", value: loss });
  if (maxAlt) cells.push({ icon: "triangle-outline", label: "Max Alt", value: maxAlt });
  if (avgSpeed) cells.push({ icon: "speedometer-outline", label: "Avg Speed", value: avgSpeed });
  if (maxSpeed) cells.push({ icon: "flash-outline", label: "Max Speed", value: maxSpeed });
  cells.push({
    icon: "car-sport-outline",
    label: "Activity",
    value: ACTIVITY_LABELS[trail.activityType] ?? trail.terrain,
  });

  const startMs = stats?.startTimeMs ?? null;
  const endMs = stats?.endTimeMs ?? null;
  const recordedDate =
    startMs != null
      ? new Date(startMs).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : null;
  const timeRange =
    startMs != null
      ? `${new Date(startMs).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}${
          endMs != null
            ? ` – ${new Date(endMs).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
            : ""
        }`
      : null;

  return (
    <View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {cells.map((c, i) => (
          <View
            key={i}
            style={{
              width: "31.5%",
              backgroundColor: colors.surface,
              borderRadius: colors.radius,
              paddingVertical: 10,
              paddingHorizontal: 8,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Ionicons name={c.icon} size={16} color={colors.primary} />
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.text, marginTop: 4 }}>
              {c.value}
            </Text>
            <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: colors.textMuted, marginTop: 1 }}>
              {c.label}
            </Text>
          </View>
        ))}
      </View>

      {recordedDate && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.surface,
            borderRadius: colors.radius,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderWidth: 1,
            borderColor: colors.border,
            marginTop: 8,
          }}
        >
          <Ionicons name="calendar-outline" size={16} color={colors.primary} style={{ marginRight: 8 }} />
          <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text }}>
            {recordedDate}
          </Text>
          {timeRange && (
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.textMuted }}>
              {timeRange}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ── Audio note playback card ─────────────────────────────────────────────────
function AudioNoteCard({ item, accentColor }: { item: TrailMediaItem; accentColor: string }) {
  const colors = useColors();
  const player = useAudioPlayer(item.uri);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;

  return (
    <TouchableOpacity
      onPress={() => {
        if (playing) {
          player.pause();
        } else {
          if (status.didJustFinish || status.currentTime >= (status.duration || 0)) {
            player.seekTo(0);
          }
          player.play();
        }
      }}
      activeOpacity={0.8}
      style={{
        width: 110,
        height: 110,
        borderRadius: colors.radius,
        marginRight: 10,
        backgroundColor: colors.mediaAudio,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name={playing ? "pause-circle" : "play-circle"} size={40} color="#fff" />
      <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 6 }}>
        Voice note
      </Text>
    </TouchableOpacity>
  );
}

// ── Media gallery ────────────────────────────────────────────────────────────
function MediaGallery({ media, accentColor }: { media: TrailMediaItem[]; accentColor: string }) {
  const colors = useColors();
  if (media.length === 0) return null;
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.textMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>
        {media.length} {media.length === 1 ? "Photo / Note" : "Photos / Notes"}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {media.map((m) =>
          m.mediaType === "audio" ? (
            <AudioNoteCard key={m.id} item={m} accentColor={accentColor} />
          ) : (
            <View key={m.id} style={{ marginRight: 10 }}>
              <Image
                source={{ uri: m.uri }}
                style={{ width: 110, height: 110, borderRadius: colors.radius }}
                contentFit="cover"
              />
              {m.caption ? (
                <Text numberOfLines={1} style={{ width: 110, fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>
                  {m.caption}
                </Text>
              ) : null}
            </View>
          ),
        )}
      </ScrollView>
    </View>
  );
}

// ── Edit trail modal ─────────────────────────────────────────────────────────
const ACTIVITY_OPTIONS = ["offroad", "drive", "bike", "hike", "run", "walk"];

function EditTrailModal({
  visible,
  trail,
  onClose,
}: {
  visible: boolean;
  trail: UnifiedTrail;
  onClose: () => void;
}) {
  const colors = useColors();
  const editStyles = makeEditStyles(colors);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [name, setName] = useState(trail.name);
  const [description, setDescription] = useState(trail.description);
  const [difficulty, setDifficulty] = useState(trail.difficulty);
  const [activityType, setActivityType] = useState(trail.activityType);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (visible) {
      setName(trail.name);
      setDescription(trail.description);
      setDifficulty(trail.difficulty);
      setActivityType(trail.activityType);
    }
  }, [visible, trail]);

  const save = async () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Give the trail a name.");
      return;
    }
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/trails/${trail.id}`, {
        name: name.trim(),
        description,
        difficulty,
        activityType,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/trails", trail.id] });
      await queryClient.invalidateQueries({ queryKey: ["/api/trails"] });
      onClose();
    } catch {
      Alert.alert("Error", "Could not save changes. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <TouchableOpacity style={editStyles.overlay} activeOpacity={1} onPress={onClose} />
        <ScrollView
          style={{ maxHeight: "85%" }}
          contentContainerStyle={[editStyles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={editStyles.handle} />
          <Text style={[editStyles.title, { color: colors.text }]}>Edit Trail</Text>

          <Text style={[editStyles.label, { color: colors.textSecondary }]}>Title</Text>
          <TextInput
            style={[editStyles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            value={name}
            onChangeText={setName}
            placeholder="Trail name"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={[editStyles.label, { color: colors.textSecondary }]}>Notes</Text>
          <TextInput
            style={[editStyles.input, { minHeight: 80, textAlignVertical: "top", color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Trail conditions, highlights…"
            placeholderTextColor={colors.textMuted}
            multiline
          />

          <Text style={[editStyles.label, { color: colors.textSecondary }]}>Activity</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            {ACTIVITY_OPTIONS.map((a) => {
              const active = a === activityType;
              return (
                <TouchableOpacity
                  key={a}
                  onPress={() => setActivityType(a)}
                  style={[editStyles.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent" }]}
                >
                  <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: active ? "#fff" : colors.textSecondary }}>
                    {ACTIVITY_LABELS[a]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={[editStyles.label, { color: colors.textSecondary }]}>Difficulty: {difficulty}/10</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((d) => {
              const active = d === difficulty;
              const col = getDifficultyColor(d, colors);
              return (
                <TouchableOpacity
                  key={d}
                  onPress={() => setDifficulty(d)}
                  style={[editStyles.diffChip, { borderColor: active ? col : colors.border, backgroundColor: active ? col : "transparent" }]}
                >
                  <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: active ? "#fff" : colors.textSecondary }}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={[editStyles.saveBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={editStyles.saveBtnLabel}>Save Changes</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Edit waypoint modal ──────────────────────────────────────────────────────
function EditWaypointModal({
  visible,
  trailId,
  waypoint,
  onClose,
}: {
  visible: boolean;
  trailId: string;
  waypoint: TrailWaypoint | null;
  onClose: () => void;
}) {
  const colors = useColors();
  const editStyles = makeEditStyles(colors);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("scenic");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (visible && waypoint) {
      setName(waypoint.name);
      setType(waypoint.rawType ?? waypoint.type);
      setLat(String(waypoint.coordinate.latitude));
      setLng(String(waypoint.coordinate.longitude));
      setDescription(waypoint.description ?? "");
    }
  }, [visible, waypoint]);

  // Mirror the recorder's category picker (water/camp/hazard/viewpoint/fuel) so
  // a saved spot can be re-tagged after the fact — e.g. flagged as a hazard.
  // When the current type isn't one of those categories (auto-assigned
  // start/end/scenic, legacy technical/summit), surface it as a leading chip so
  // the selection stays visible and is preserved when only other fields change.
  const typeChips = useMemo(() => {
    const chips: { value: string; label: string; icon: IoniconName; color: string }[] = [];
    const currentRaw = (waypoint?.rawType ?? waypoint?.type ?? "scenic") as string;
    if (!getWaypointCategoryMeta(currentRaw)) {
      const wt = toWaypointType(currentRaw);
      const cfg = WP_CONFIG[wt];
      chips.push({ value: wt, label: cfg.label, icon: cfg.icon, color: cfg.color });
    }
    (["water", "camp", "hazard", "viewpoint", "fuel"] as WaypointCategory[]).forEach((key) => {
      const m = WAYPOINT_CATEGORY_META[key];
      chips.push({ value: key, label: m.label, icon: m.glyph as IoniconName, color: m.color });
    });
    return chips;
  }, [waypoint]);

  if (!waypoint) return null;

  const save = async () => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (!name.trim()) {
      Alert.alert("Name required", "Give the waypoint a name.");
      return;
    }
    if (isNaN(latNum) || isNaN(lngNum)) {
      Alert.alert("Invalid coordinates", "Latitude and longitude must be numbers.");
      return;
    }
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/trails/${trailId}/waypoints/${waypoint.id}`, {
        name: name.trim(),
        type,
        latitude: latNum,
        longitude: lngNum,
        description: description.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/trails", trailId] });
      onClose();
    } catch {
      Alert.alert("Error", "Could not save waypoint. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <TouchableOpacity style={editStyles.overlay} activeOpacity={1} onPress={onClose} />
        <ScrollView
          style={{ maxHeight: "85%" }}
          contentContainerStyle={[editStyles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={editStyles.handle} />
          <Text style={[editStyles.title, { color: colors.text }]}>Edit Waypoint</Text>

          <Text style={[editStyles.label, { color: colors.textSecondary }]}>Name</Text>
          <TextInput
            style={[editStyles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            value={name}
            onChangeText={setName}
            placeholder="Waypoint name"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={[editStyles.label, { color: colors.textSecondary }]}>Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            {typeChips.map((c) => {
              const active = c.value === type;
              return (
                <TouchableOpacity
                  key={c.value}
                  onPress={() => setType(c.value)}
                  testID={`waypoint-type-${c.value}`}
                  style={[editStyles.chip, { borderColor: active ? c.color : colors.border, backgroundColor: active ? c.color : "transparent" }]}
                >
                  <Ionicons name={c.icon} size={14} color={active ? "#fff" : colors.textSecondary} />
                  <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: active ? "#fff" : colors.textSecondary, marginLeft: 4 }}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={[editStyles.label, { color: colors.textSecondary }]}>Latitude</Text>
              <TextInput
                style={[editStyles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={lat}
                onChangeText={setLat}
                keyboardType="numbers-and-punctuation"
                placeholder="25.1234"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[editStyles.label, { color: colors.textSecondary }]}>Longitude</Text>
              <TextInput
                style={[editStyles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={lng}
                onChangeText={setLng}
                keyboardType="numbers-and-punctuation"
                placeholder="56.1234"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <Text style={[editStyles.label, { color: colors.textSecondary }]}>Note</Text>
          <TextInput
            style={[editStyles.input, editStyles.noteInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. soft sand on the right"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            testID="waypoint-note-input"
          />

          <TouchableOpacity
            style={[editStyles.saveBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={editStyles.saveBtnLabel}>Save Waypoint</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeEditStyles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.scrim },
  sheet: { borderTopLeftRadius: colors.radiusXl, borderTopRightRadius: colors.radiusXl, padding: 20, paddingTop: 12 },
  handle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 16 },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: colors.radius, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 14 },
  noteInput: { minHeight: 80, paddingTop: 12 },
  chip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 9, borderRadius: colors.radiusPill, borderWidth: 1, marginRight: 8 },
  diffChip: { width: 40, height: 40, borderRadius: colors.radiusPill, alignItems: "center", justifyContent: "center", borderWidth: 1, marginRight: 8 },
  saveBtn: { borderRadius: colors.radius, paddingVertical: 15, alignItems: "center", justifyContent: "center" },
  saveBtnLabel: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});

// ── AI trip report card ──────────────────────────────────────────────────────
function AiInsightsCard({ trail, isOwner }: { trail: UnifiedTrail; isOwner: boolean }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insights = trail.aiInsights;

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiRequest("POST", `/api/trails/${trail.id}/ai-summary`);
      await queryClient.invalidateQueries({ queryKey: ["/api/trails", trail.id] });
    } catch {
      setError("Couldn't generate the trip report. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  // Only the trail owner can generate/regenerate. Non-owners with no existing
  // report see nothing (the card would only offer a button that 403s).
  if (!insights && !isOwner) return null;

  return (
    <View style={{ marginBottom: 16, backgroundColor: colors.surface, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: insights ? 10 : 8 }}>
        <View style={{ width: 30, height: 30, borderRadius: colors.radiusSm, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginRight: 8 }}>
          <Ionicons name="sparkles" size={16} color="#fff" />
        </View>
        <Text style={{ flex: 1, fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text }}>AI Trip Report</Text>
        {insights && isOwner && (
          <TouchableOpacity
            onPress={generate}
            disabled={loading}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            testID="regenerate-ai-summary"
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="refresh" size={18} color={colors.primary} />
            )}
          </TouchableOpacity>
        )}
      </View>

      {!insights ? (
        <View>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.textSecondary, lineHeight: 19, marginBottom: 12 }}>
            Generate a narrative trip report, difficulty read, and terrain tags from this track's GPS data.
          </Text>
          <TouchableOpacity
            onPress={generate}
            disabled={loading}
            testID="generate-ai-summary"
            activeOpacity={0.88}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: colors.radius, paddingVertical: 12, backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="sparkles" size={16} color="#fff" />
            )}
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" }}>
              {loading ? "Analysing track…" : "Generate trip report"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <Text style={{ fontSize: 13.5, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>
            {insights.summary}
          </Text>
          {insights.difficultyAssessment ? (
            <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 10, backgroundColor: colors.primary + "12", borderRadius: colors.radius, padding: 10 }}>
              <Ionicons name="speedometer" size={15} color={colors.primary} style={{ marginRight: 8, marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 12.5, fontFamily: "Inter_500Medium", color: colors.text, lineHeight: 18 }}>
                {insights.difficultyAssessment}
              </Text>
            </View>
          ) : null}
          {insights.terrainTags.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {insights.terrainTags.map((tag) => (
                <View key={tag} style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.background, borderRadius: colors.radiusPill, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: colors.border }}>
                  <Ionicons name="pricetag" size={11} color={colors.primary} style={{ marginRight: 4 }} />
                  <Text style={{ fontSize: 11.5, fontFamily: "Inter_500Medium", color: colors.textSecondary }}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.textMuted, marginTop: 10 }}>
            AI-generated from your GPS track
          </Text>
        </View>
      )}

      {error ? (
        <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.technical, marginTop: 10 }}>{error}</Text>
      ) : null}
    </View>
  );
}

// ── AI waypoint suggestions ──────────────────────────────────────────────────
interface AiWaypointSuggestion {
  name: string;
  type: string;
  description: string;
  latitude: number;
  longitude: number;
}

function AiWaypointSuggestions({ trail }: { trail: UnifiedTrail }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [accepting, setAccepting] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<AiWaypointSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const suggest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", `/api/trails/${trail.id}/ai-waypoints`);
      const data = (await res.json()) as { suggestions?: AiWaypointSuggestion[] };
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      setLoaded(true);
    } catch {
      setError("Couldn't fetch suggestions. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const accept = async (s: AiWaypointSuggestion, idx: number) => {
    setAccepting(idx);
    try {
      await apiRequest("POST", `/api/trails/${trail.id}/waypoints`, {
        name: s.name,
        description: s.description,
        type: s.type,
        latitude: s.latitude,
        longitude: s.longitude,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/trails", trail.id] });
      setSuggestions((prev) => prev.filter((_, i) => i !== idx));
    } catch {
      Alert.alert("Error", "Couldn't add this waypoint. Try again.");
    } finally {
      setAccepting(null);
    }
  };

  return (
    <View style={{ marginBottom: 16 }}>
      <TouchableOpacity
        onPress={suggest}
        disabled={loading}
        testID="suggest-ai-waypoints"
        activeOpacity={0.85}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: colors.radius, paddingVertical: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary, opacity: loading ? 0.6 : 1 }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
        )}
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.primary }}>
          {loading ? "Finding waypoints…" : loaded ? "Suggest more waypoints" : "Suggest waypoints with AI"}
        </Text>
      </TouchableOpacity>

      {error ? (
        <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.technical, marginTop: 8 }}>{error}</Text>
      ) : null}

      {loaded && suggestions.length === 0 && !error ? (
        <Text style={{ fontSize: 12.5, fontFamily: "Inter_400Regular", color: colors.textMuted, marginTop: 8, textAlign: "center" }}>
          No new waypoints to suggest for this track.
        </Text>
      ) : null}

      {suggestions.map((s, idx) => {
        const cfg = WP_CONFIG[toWaypointType(s.type)];
        const catMeta = getWaypointCategoryMeta(s.type);
        const wpColor = catMeta ? catMeta.color : cfg.color;
        const wpIcon = catMeta ? catMeta.glyph : cfg.icon;
        const wpLabel = catMeta ? catMeta.label : cfg.label;
        return (
          <View
            key={`${s.name}-${idx}`}
            style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 10, backgroundColor: colors.surface, borderRadius: colors.radius, padding: 12, borderWidth: 1, borderColor: colors.border }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: wpColor, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
              <Ionicons name={wpIcon} size={16} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                <Text style={{ flex: 1, fontSize: 14, fontFamily: "Inter_700Bold", color: colors.text }}>{s.name}</Text>
                <View style={{ backgroundColor: wpColor + "22", borderRadius: colors.radiusSm, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 6 }}>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: wpColor }}>{wpLabel}</Text>
                </View>
              </View>
              {s.description ? (
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textSecondary, lineHeight: 17 }}>{s.description}</Text>
              ) : null}
              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.textMuted, marginTop: 4 }}>
                {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 }}>
                <TouchableOpacity
                  onPress={() => accept(s, idx)}
                  disabled={accepting !== null}
                  testID={`accept-waypoint-${idx}`}
                  activeOpacity={0.85}
                  style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.primary, borderRadius: colors.radiusSm, paddingHorizontal: 12, paddingVertical: 7, opacity: accepting !== null && accepting !== idx ? 0.5 : 1 }}
                >
                  {accepting === idx ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="add" size={14} color="#fff" />
                  )}
                  <Text style={{ fontSize: 12.5, fontFamily: "Inter_700Bold", color: "#fff" }}>Add</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setSuggestions((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={accepting !== null}
                  testID={`dismiss-waypoint-${idx}`}
                  activeOpacity={0.7}
                  style={{ paddingHorizontal: 10, paddingVertical: 7 }}
                >
                  <Text style={{ fontSize: 12.5, fontFamily: "Inter_600SemiBold", color: colors.textMuted }}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function TrailDetailScreen() {
  const { id, shareToken } = useLocalSearchParams<{ id: string; shareToken?: string }>();
  const router = useRouter();
  const colors = useColors();
  const units = useUnits();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [sharing, setSharing] = useState(false);
  const [updatingVisibility, setUpdatingVisibility] = useState(false);
  const isDark = colors.glassTint === "dark";

  const sheetAnim = useRef(new Animated.Value(SHEET_COLLAPSED)).current;
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedWpId, setSelectedWpId] = useState<string | null>(null);
  const [editTrailOpen, setEditTrailOpen] = useState(false);
  const [editWaypoint, setEditWaypoint] = useState<TrailWaypoint | null>(null);
  const [baseLayer, setBaseLayer] = useState<AdventureBaseLayer>("hybrid");
  const [mapHeading, setMapHeading] = useState(0);
  const mapRef = useRef<AdventureMapHandle>(null);

  // ── Navigation & safety state ──
  const [navMode, setNavMode] = useState<"toStart" | "follow" | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [navLoading, setNavLoading] = useState(false);
  const [userLoc, setUserLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const [navHeading, setNavHeading] = useState<number | null>(null);
  const navPosSub = useRef<Location.LocationSubscription | null>(null);
  const navHeadSub = useRef<Location.LocationSubscription | null>(null);

  // Watch position + heading only while navigating.
  React.useEffect(() => {
    if (navMode === null) return;
    let active = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!active || status !== "granted") return;
      navPosSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5 },
        (p) => {
          if (active)
            setUserLoc({ latitude: p.coords.latitude, longitude: p.coords.longitude });
        },
      );
      navHeadSub.current = await Location.watchHeadingAsync((h) => {
        const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
        if (active && deg >= 0) setNavHeading(deg);
      });
    })();
    return () => {
      active = false;
      navPosSub.current?.remove();
      navHeadSub.current?.remove();
      navPosSub.current = null;
      navHeadSub.current = null;
    };
  }, [navMode]);

  // Local fallback (always available)
  const localTrail = fromLocalConstants(id ?? "");

  // Fetch from API; use local data as structural fallback for missing fields
  const { data: apiData, isLoading } = useQuery<{ trail: ApiTrailDetail }>({
    queryKey: shareToken ? ["/api/share", shareToken] : ["/api/trails", id ?? ""],
    enabled: !!shareToken || !!id,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const trail: UnifiedTrail | null = apiData?.trail
    ? fromApi(apiData.trail, localTrail)
    : localTrail;

  const isOwner =
    !!trail && trail.source === "community" && !!user && trail.ownerId === user.id;

  const buildShareUrl = (token: string) =>
    new URL(`/share/${token}`, getApiUrl()).toString();

  const handleShare = async () => {
    if (!trail || sharing) return;
    setSharing(true);
    try {
      const res = await apiRequest("POST", `/api/trails/${trail.id}/share`, {});
      const data = await res.json();
      const url: string = data.url ?? buildShareUrl(data.token);
      await queryClient.invalidateQueries({ queryKey: ["/api/trails", trail.id] });
      await Share.share({ message: `Check out "${trail.name}" on the trail map: ${url}`, url });
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("ugc_required") || msg.includes("403")) {
        Alert.alert(
          "Agreement required",
          "Accept the content agreement before sharing this trail publicly.",
          [
            { text: "Later", style: "cancel" },
            { text: "Review agreement", onPress: () => router.push("/ugc") },
          ],
        );
      } else {
        Alert.alert("Error", "Could not create a share link. Try again.");
      }
    } finally {
      setSharing(false);
    }
  };

  const handleSetVisibility = async (next: "private" | "public") => {
    if (!trail || updatingVisibility || next === trail.visibility) return;
    setUpdatingVisibility(true);
    try {
      await apiRequest("PATCH", `/api/trails/${trail.id}/visibility`, { visibility: next });
      await queryClient.invalidateQueries({ queryKey: ["/api/trails", trail.id] });
      await queryClient.invalidateQueries({ queryKey: ["/api/trails"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/me/trails"] });
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("ugc_required") || msg.includes("403")) {
        Alert.alert(
          "Agreement required",
          "Accept the content agreement before publishing this trail.",
          [
            { text: "Later", style: "cancel" },
            { text: "Review agreement", onPress: () => router.push("/ugc") },
          ],
        );
      } else {
        Alert.alert("Error", "Could not update visibility. Try again.");
      }
    } finally {
      setUpdatingVisibility(false);
    }
  };

  const toggleSheet = () => {
    const toVal = isExpanded ? SHEET_COLLAPSED : SHEET_EXPANDED;
    Animated.spring(sheetAnim, {
      toValue: toVal,
      useNativeDriver: false,
      tension: 60,
      friction: 12,
    }).start();
    setIsExpanded(!isExpanded);
  };

  const handleWaypointPress = (wp: TrailWaypoint) => {
    setSelectedWpId(wp.id);
    mapRef.current?.animateToRegion(
      {
        latitude: wp.coordinate.latitude,
        longitude: wp.coordinate.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      },
      600
    );
    if (isExpanded) toggleSheet();
  };

  const stopNav = () => {
    setNavMode(null);
    setRoute(null);
  };

  const startNavToStart = async (trailhead: { latitude: number; longitude: number }) => {
    setNavLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location needed", "Allow location access to route to the trailhead.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const from = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setUserLoc(from);
      const result = await fetchRoute(from, trailhead);
      setRoute(result);
      setNavMode("toStart");
      if (isExpanded) toggleSheet();
      mapRef.current?.fitToCoordinates([from, ...result.coordinates], {
        top: 120,
        right: 80,
        bottom: 320,
        left: 80,
      });
    } catch {
      Alert.alert(
        "Routing unavailable",
        "Couldn't fetch a driving route. Check your connection and try again.",
      );
    } finally {
      setNavLoading(false);
    }
  };

  const startFollow = () => {
    setRoute(null);
    setNavMode("follow");
    if (isExpanded) toggleSheet();
  };

  // Show loading only if no local fallback exists
  if (isLoading && !trail) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!trail) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <Text style={{ color: colors.text }}>Trail not found</Text>
      </View>
    );
  }

  if (Platform.OS === "web") {
    return <WebPlaceholder trail={trail} isOwner={isOwner} />;
  }

  const diffColor = getDifficultyColor(trail.difficulty, colors);

  // When the trail's own (free-form) accent color is close to the route blue,
  // the navigation/approach lines need a contrasting casing so they stay
  // distinguishable where they overlap the trail line.
  const navCasing = routeNavCasing(trail.accentColor, colors.routeNav);

  const mapPolylines: AdventurePolyline[] = [];
  if (trail.approachCoordinates.length > 1) {
    mapPolylines.push({
      id: "approach",
      coordinates: trail.approachCoordinates,
      color: colors.routeNav,
      width: 2.5,
      dashed: true,
      outlineColor: navCasing,
    });
  }
  if (trail.trailCoordinates.length > 1) {
    mapPolylines.push({
      id: "trail",
      coordinates: trail.trailCoordinates,
      color: trail.accentColor,
      width: 4,
    });
  }

  // Heuristic technical sections drawn as red overlays on top of the trail line
  const techPoints: TrackPoint[] = trail.telemetry.map((t) => ({
    latitude: t.latitude,
    longitude: t.longitude,
    altitude: t.altitude,
    speed: t.speed,
    timestampMs: t.timestampMs,
  }));
  const technicalSections: TechnicalSection[] =
    techPoints.length >= 2 ? detectTechnicalSections(techPoints) : [];
  technicalSections.forEach((sec, i) => {
    const coords = techPoints
      .slice(sec.startIdx, sec.endIdx + 1)
      .map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
    if (coords.length > 1) {
      mapPolylines.push({
        id: `tech-${i}`,
        coordinates: coords,
        color: colors.technical,
        width: 6,
      });
    }
  });

  const mapMarkers: AdventureMarker[] = [];
  if (trail.approachCoordinates.length > 0) {
    mapMarkers.push({
      id: "city",
      coordinate: trail.approachCoordinates[0],
      anchor: { x: 0.5, y: 0.5 },
      icon: {
        kind: "badge",
        color: colors.routeNav,
        glyph: "navigate",
        label: trail.approachFrom,
        showLabel: true,
      },
    });
  }
  trail.waypoints.forEach((wp, idx) => {
    const cfg = WP_CONFIG[wp.type];
    // A recognised category (water/camp/hazard/viewpoint/fuel) renders a coloured
    // glyph pin; everything else keeps the numbered diamond / start-end flag.
    const catMeta = getWaypointCategoryMeta(wp.rawType ?? wp.type);
    mapMarkers.push({
      id: wp.id,
      coordinate: wp.coordinate,
      anchor: { x: 0.5, y: 0.5 },
      onPress: () => handleWaypointPress(wp),
      zIndex: selectedWpId === wp.id ? 10 : 1,
      icon: {
        kind: "waypoint",
        color: catMeta ? catMeta.color : cfg.color,
        ...(catMeta ? { glyph: catMeta.glyph } : {}),
        variant: wpVariant(idx, trail.waypoints.length, wp.type),
        waypointNumber: idx + 1,
        label: wp.name,
        emphasized: selectedWpId === wp.id,
      },
    });
  });

  // ── Live navigation guidance ──
  const trailhead = trail.trailCoordinates[0] ?? null;
  const navPath =
    navMode === "toStart"
      ? route?.coordinates ?? null
      : navMode === "follow"
        ? trail.trailCoordinates
        : null;
  const nav =
    userLoc && navPath && navPath.length >= 1 ? routeState(userLoc, navPath) : null;

  if (navMode === "toStart" && route && route.coordinates.length > 1) {
    mapPolylines.push({
      id: "nav-route",
      coordinates: route.coordinates,
      color: colors.routeNav,
      width: 6,
      outlineColor: navCasing,
    });
  }

  const safetyLandmarks = trail.waypoints.map((wp) => ({
    name: wp.name,
    coordinate: wp.coordinate,
  }));

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar barStyle="light-content" />

      {/* ── Full-screen Map ── */}
      <AdventureMap
        ref={mapRef}
        baseLayer={baseLayer}
        initialRegion={trail.region}
        showsUserLocation
        rotateEnabled
        polylines={mapPolylines}
        markers={mapMarkers}
        onRegionChangeComplete={async () => {
          const cam = await mapRef.current?.getCamera();
          if (cam) setMapHeading(cam.heading);
        }}
      />

      {/* ── Top header overlay ── */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <BlurView intensity={60} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 38,
            height: 38,
            borderRadius: colors.radiusPill,
            backgroundColor: colors.mapPanel,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          <Ionicons name="arrow-back" size={20} color={colors.onMap} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.onMap }}>
            {trail.name}
          </Text>
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.onMapMuted }}>
            {trail.location}
          </Text>
        </View>
        <View style={{ borderRadius: colors.radiusSm, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: diffColor }}>
          <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#FFFFFF" }}>
            {trail.difficulty}/10
          </Text>
        </View>
      </View>

      {/* ── Map legend ── */}
      <View
        style={{
          position: "absolute",
          top: insets.top + 74,
          right: 16,
          borderRadius: colors.radius,
          overflow: "hidden",
          paddingHorizontal: 10,
          paddingVertical: 8,
        }}
      >
        <BlurView intensity={70} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
          <View style={{ width: 20, height: navCasing ? 5 : 3, backgroundColor: colors.routeNav, marginRight: 6, borderRadius: 2, ...(navCasing ? { borderWidth: 1, borderColor: navCasing } : {}) }} />
          <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.onMap }}>Approach</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ width: 20, height: 4, backgroundColor: trail.accentColor, marginRight: 6, borderRadius: 2 }} />
          <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.onMap }}>Trail</Text>
        </View>
        {trail.osmAttribution && (
          <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular", color: colors.onMapMuted, marginTop: 6 }}>
            © OSM contributors
          </Text>
        )}
      </View>

      {/* ── Map control column ── */}
      <View
        style={{
          position: "absolute",
          right: 16,
          top: insets.top + 150,
          alignItems: "flex-end",
          gap: 12,
        }}
      >
        <LayerSwitcher value={baseLayer} onChange={setBaseLayer} />
        <CompassRose
          heading={mapHeading}
          onPress={() => mapRef.current?.animateCamera({ heading: 0, pitch: 0 }, 400)}
        />
        <IconButton
          icon="scan-outline"
          surface="map"
          accessibilityLabel="Recenter on trail"
          testID="recenter-trail"
          onPress={() => mapRef.current?.animateToRegion(trail.region, 500)}
        />
      </View>

      {/* ── Bottom sheet ── */}
      <Animated.View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: sheetAnim,
          borderTopLeftRadius: colors.radiusLg,
          borderTopRightRadius: colors.radiusLg,
          overflow: "hidden",
          backgroundColor: colors.background,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
          elevation: 20,
        }}
      >
        {/* Handle */}
        <TouchableOpacity onPress={toggleSheet} activeOpacity={0.7} style={{ paddingTop: 10, paddingBottom: 4, alignItems: "center" }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
        </TouchableOpacity>

        {/* Trail stats */}
        <View style={{ paddingHorizontal: 18, paddingTop: 4, paddingBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 2 }}>
            <Text style={{ flex: 1, fontSize: 20, fontFamily: "Inter_700Bold", color: colors.text }}>
              {trail.name}
            </Text>
            {isOwner && (
              <TouchableOpacity
                onPress={() => setEditTrailOpen(true)}
                testID="edit-trail"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: colors.primary + "18",
                  borderRadius: colors.radiusSm,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  marginLeft: 8,
                }}
              >
                <Ionicons name="create-outline" size={15} color={colors.primary} />
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primary, marginLeft: 4 }}>
                  Edit
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.textMuted, marginBottom: 12 }}>
            {trail.description}
          </Text>

          {/* Owner sharing & visibility controls */}
          {isOwner && (
            <View style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                {(["private", "public"] as const).map((v) => {
                  const active = v === trail.visibility;
                  return (
                    <TouchableOpacity
                      key={v}
                      testID={`visibility-${v}`}
                      onPress={() => handleSetVisibility(v)}
                      disabled={updatingVisibility}
                      style={{
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        paddingVertical: 10,
                        borderRadius: colors.radius,
                        borderWidth: 1,
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary : "transparent",
                        opacity: updatingVisibility ? 0.6 : 1,
                      }}
                    >
                      <Ionicons
                        name={v === "private" ? "lock-closed" : "earth"}
                        size={14}
                        color={active ? "#fff" : colors.textSecondary}
                      />
                      <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: active ? "#fff" : colors.textSecondary }}>
                        {v === "private" ? "Private" : "Public"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                testID="share-trail"
                onPress={handleShare}
                disabled={sharing}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 12,
                  borderRadius: colors.radius,
                  borderWidth: 1,
                  borderColor: colors.border,
                  opacity: sharing ? 0.6 : 1,
                }}
              >
                {sharing ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="share-outline" size={16} color={colors.primary} />
                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primary }}>
                      Share link
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          <StatsGrid trail={trail} />

          {/* Navigation actions */}
          {trailhead && navMode === null && (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => startNavToStart(trailhead)}
                disabled={navLoading}
                testID="nav-to-start"
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  borderRadius: colors.radius,
                  paddingVertical: 14,
                  backgroundColor: colors.primary,
                  opacity: navLoading ? 0.6 : 1,
                }}
              >
                {navLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="car-sport" size={18} color="#fff" />
                )}
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" }}>
                  Drive to start
                </Text>
              </TouchableOpacity>
              {trail.trailCoordinates.length > 1 && (
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={startFollow}
                  testID="nav-follow"
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    borderRadius: colors.radius,
                    paddingVertical: 14,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Ionicons name="git-branch" size={18} color={colors.text} />
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: colors.text }}>
                    Follow route
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Approach from */}
        {trail.approachFrom ? (
          <View style={{ paddingHorizontal: 18, marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.routeNav + "10", borderRadius: colors.radius, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: colors.routeNav + "30" }}>
              <Ionicons name="navigate-circle" size={16} color={colors.routeNav} style={{ marginRight: 8 }} />
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.text }}>
                Approach from{" "}
                <Text style={{ fontFamily: "Inter_700Bold", color: colors.routeNav }}>{trail.approachFrom}</Text>
              </Text>
            </View>
          </View>
        ) : null}

        {/* Waypoint list (visible when expanded) */}
        <Animated.View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.textMuted, letterSpacing: 0.8, textTransform: "uppercase", paddingHorizontal: 18, marginBottom: 8 }}>
            {trail.waypoints.length} Waypoints
          </Text>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 16 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Elevation / speed graphs */}
            {techPoints.length >= 2 && (
              <View style={{ marginBottom: 16 }}>
                <TrackProfile points={techPoints} technical={technicalSections} accentColor={trail.accentColor} />
              </View>
            )}

            {/* AI trip report (recorded community tracks only) */}
            {trail.source === "community" && trail.telemetry.length >= 2 && (
              <AiInsightsCard trail={trail} isOwner={isOwner} />
            )}

            {/* Media gallery */}
            <MediaGallery media={trail.media} accentColor={trail.accentColor} />

            {/* Technical sections summary */}
            {technicalSections.length > 0 && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: colors.technical + "12",
                  borderRadius: colors.radius,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderWidth: 1,
                  borderColor: colors.technical + "33",
                  marginBottom: 12,
                }}
              >
                <Ionicons name="warning" size={16} color={colors.technical} style={{ marginRight: 8 }} />
                <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: colors.text }}>
                  {technicalSections.length} technical{" "}
                  {technicalSections.length === 1 ? "section" : "sections"} detected
                </Text>
              </View>
            )}

            {/* Start point coordinates */}
            {trail.trailCoordinates.length > 0 && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: colors.surface,
                  borderRadius: colors.radius,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  marginBottom: 16,
                }}
              >
                <Ionicons name="flag" size={16} color={colors.primary} style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.textMuted }}>
                    Start point
                  </Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text }}>
                    {trail.trailCoordinates[0].latitude.toFixed(5)},{" "}
                    {trail.trailCoordinates[0].longitude.toFixed(5)}
                  </Text>
                </View>
              </View>
            )}

            {trail.waypoints.map((wp, idx) => {
              const cfg = WP_CONFIG[wp.type];
              const catMeta = getWaypointCategoryMeta(wp.rawType ?? wp.type);
              const wpColor = catMeta ? catMeta.color : cfg.color;
              const wpIcon = catMeta ? catMeta.glyph : cfg.icon;
              const isSelected = selectedWpId === wp.id;
              return (
                <TouchableOpacity
                  key={wp.id}
                  onPress={() => (isOwner ? setEditWaypoint(wp) : handleWaypointPress(wp))}
                  testID={`waypoint-row-${wp.id}`}
                  activeOpacity={0.75}
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    marginBottom: 10,
                    backgroundColor: isSelected ? wpColor + "15" : colors.surface,
                    borderRadius: colors.radius,
                    padding: 12,
                    borderWidth: 1.5,
                    borderColor: isSelected ? wpColor : colors.border,
                  }}
                >
                  <View style={{ alignItems: "center", marginRight: 12 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: wpColor, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={wpIcon} size={16} color="#FFFFFF" />
                    </View>
                    {idx < trail.waypoints.length - 1 && (
                      <View style={{ width: 2, height: 10, backgroundColor: colors.border, marginTop: 3 }} />
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                      <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.text, flex: 1 }}>
                        {wp.name}
                      </Text>
                      {wp.elevation && (
                        <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: wpColor }}>
                          {wp.elevation}
                        </Text>
                      )}
                      {isOwner && (
                        <TouchableOpacity
                          onPress={() => setEditWaypoint(wp)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          testID={`edit-waypoint-${wp.id}`}
                          style={{ marginLeft: 8 }}
                        >
                          <Ionicons name="create-outline" size={16} color={colors.textMuted} />
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textSecondary, lineHeight: 17 }}>
                      {wp.description}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                      <Ionicons name="location-outline" size={12} color={colors.textMuted} style={{ marginRight: 4 }} />
                      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.textMuted }}>
                        {wp.coordinate.latitude.toFixed(5)}, {wp.coordinate.longitude.toFixed(5)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* AI waypoint suggestions (owner of recorded community tracks only) */}
            {isOwner && trail.telemetry.length >= 2 && (
              <AiWaypointSuggestions trail={trail} />
            )}

            {/* OSM attribution — required when osmAttribution = true */}
            {trail.osmAttribution && (
              <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted, textAlign: "center", marginTop: 8 }}>
                Trail data © OpenStreetMap contributors, licensed under ODbL
              </Text>
            )}
          </ScrollView>
        </Animated.View>
      </Animated.View>

      {/* ── Edit modals (community trails only) ── */}
      <EditTrailModal
        visible={editTrailOpen}
        trail={trail}
        onClose={() => setEditTrailOpen(false)}
      />
      <EditWaypointModal
        visible={editWaypoint !== null}
        trailId={trail.id}
        waypoint={editWaypoint}
        onClose={() => setEditWaypoint(null)}
      />

      {/* ── Live navigation HUD ── */}
      {navMode !== null && (
        <View style={{ position: "absolute", top: insets.top + 64, left: 16, right: 16 }}>
          {nav ? (
            <NavigationHUD
              title={navMode === "toStart" ? "Drive to trailhead" : "Follow route"}
              bearingToNext={nav.bearingToNext}
              deviceHeading={navHeading ?? 0}
              remainingMeters={nav.remainingMeters}
              etaSeconds={navMode === "toStart" ? route?.durationSeconds ?? null : null}
              offRoute={nav.offRoute}
              arrived={nav.arrived}
              accent={navMode === "toStart" ? colors.routeNav : trail.accentColor}
              onStop={stopNav}
            />
          ) : (
            <View
              style={{
                backgroundColor: colors.mapPanelStrong,
                borderRadius: colors.radius,
                paddingVertical: 14,
                paddingHorizontal: 16,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <ActivityIndicator color="#fff" size="small" />
              <Text style={{ color: "#fff", fontFamily: "Inter_500Medium", fontSize: 14, flex: 1 }}>
                Acquiring GPS…
              </Text>
              <TouchableOpacity onPress={stopNav} hitSlop={10}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* ── Always-available safety / SOS ── */}
      <SafetyFab bottom={SHEET_COLLAPSED + 16} landmarks={safetyLandmarks} />
    </View>
  );
}
