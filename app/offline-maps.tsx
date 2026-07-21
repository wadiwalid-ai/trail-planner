import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { GlassPanel, IconButton } from "@/components/cockpit";
import { useColors } from "@/hooks/useColors";
import type { AdventureBaseLayer, MapRegion } from "@/components/adventureMapShared";
import {
  OFFLINE_SUPPORTED,
  type OfflineRegion,
  listRegions,
  downloadRegion,
  deleteRegion,
  estimateTiles,
  estimateSizeBytes,
  loadCalibration,
  calibrateFromRegions,
  getBytesPerTile,
  assessDownload,
  OFFLINE_MAX_BYTES,
} from "@/lib/offlineMaps";
import * as haptics from "@/lib/haptics";

const WEB_TOP = 67;
const WEB_BOTTOM = 34;

type DetailLevel = { key: string; label: string; maxZoom: number };
const DETAIL_LEVELS: DetailLevel[] = [
  { key: "overview", label: "Overview", maxZoom: 12 },
  { key: "standard", label: "Standard", maxZoom: 14 },
  { key: "detailed", label: "Detailed", maxZoom: 16 },
];

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function toNum(v: string | string[] | undefined, fallback: number): number {
  const s = Array.isArray(v) ? v[0] : v;
  const n = s ? Number(s) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export default function OfflineMapsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();

  const region: MapRegion = {
    latitude: toNum(params.lat, 25.1212),
    longitude: toNum(params.lon, 56.3416),
    latitudeDelta: toNum(params.latDelta, 0.4),
    longitudeDelta: toNum(params.lonDelta, 0.4),
  };
  const baseLayer = ((Array.isArray(params.baseLayer)
    ? params.baseLayer[0]
    : params.baseLayer) ?? "topo") as AdventureBaseLayer;

  const minZoom = 9;
  const [detail, setDetail] = useState<DetailLevel>(DETAIL_LEVELS[1]);
  const [name, setName] = useState(
    `Area ${region.latitude.toFixed(2)}, ${region.longitude.toFixed(2)}`,
  );

  const [regions, setRegions] = useState<OfflineRegion[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [bytesPerTile, setBytesPerTile] = useState(getBytesPerTile());

  const bounds: [number, number, number, number] = [
    region.longitude - region.longitudeDelta / 2,
    region.latitude - region.latitudeDelta / 2,
    region.longitude + region.longitudeDelta / 2,
    region.latitude + region.latitudeDelta / 2,
  ];
  const estTiles = estimateTiles(bounds, minZoom, detail.maxZoom);
  const estBytes = estimateSizeBytes(estTiles, bytesPerTile);
  const estLevel = assessDownload(estTiles, estBytes);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await listRegions();
    setRegions(list);
    // Learn the real per-tile size from any completed packs.
    await calibrateFromRegions(list);
    setBytesPerTile(getBytesPerTile());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCalibration().then(setBytesPerTile);
    refresh();
  }, [refresh]);

  const runDownload = async () => {
    setError(null);
    setDownloading(true);
    setProgress(0);
    try {
      await downloadRegion(
        { name: name.trim() || "Saved region", region, baseLayer, minZoom, maxZoom: detail.maxZoom },
        (p) => setProgress(p),
        (msg) => setError(msg),
      );
      // The pack downloads in the background; reflect it immediately and poll.
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const handleDownload = () => {
    if (downloading) return;
    haptics.tapMedium();
    const level = assessDownload(estTiles, estBytes);

    if (level === "block") {
      haptics.notifyWarning();
      Alert.alert(
        "Area too large",
        `This download is about ${formatBytes(estBytes)} (${estTiles.toLocaleString()} tiles), ` +
          `which is over the ${formatBytes(OFFLINE_MAX_BYTES)} limit. Zoom in to a smaller area or ` +
          `pick a lower detail level, then try again.`,
        [{ text: "OK" }],
      );
      return;
    }

    if (level === "warn") {
      haptics.notifyWarning();
      Alert.alert(
        "Large download",
        `This area is about ${formatBytes(estBytes)} (${estTiles.toLocaleString()} tiles). ` +
          `It may take a while and use a chunk of your device storage. Download anyway?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Download", style: "destructive", onPress: () => void runDownload() },
        ],
      );
      return;
    }

    void runDownload();
  };

  const handleDelete = async (r: OfflineRegion) => {
    haptics.tapLight();
    await deleteRegion(r.id);
    await refresh();
  };

  // Poll while any pack is still downloading so sizes/percentages stay live.
  useEffect(() => {
    if (!regions.some((r) => r.state === "active")) return;
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [regions, refresh]);

  const topPad = (Platform.OS === "web" ? WEB_TOP : insets.top) + 8;
  const bottomPad = (Platform.OS === "web" ? WEB_BOTTOM : insets.bottom) + 24;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: topPad }]}>
        <IconButton icon="arrow-back" onPress={() => router.back()} accessibilityLabel="Go back" />
        <Text style={[styles.title, { color: colors.text }]}>Offline Maps</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad }}
        showsVerticalScrollIndicator={false}
      >
        {!OFFLINE_SUPPORTED ? (
          <GlassPanel radius={colors.radiusLg} intensity={30}>
            <View style={styles.infoCard}>
              <Ionicons name="cloud-offline-outline" size={30} color={colors.accent} />
              <Text style={[styles.infoTitle, { color: colors.text }]}>
                Available in the installed app
              </Text>
              <Text style={[styles.infoBody, { color: colors.textMuted }]}>
                Offline map packs use the on-device map engine, which only runs in a
                custom build of Trail Planner. In Expo Go and on the web the map
                still works fully online. Publish or install the app to download
                regions for Airplane-Mode use.
              </Text>
            </View>
          </GlassPanel>
        ) : (
          <>
            {/* ── Download this area ── */}
            <GlassPanel radius={colors.radiusLg} intensity={30}>
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Download this area
                </Text>
                <Text style={[styles.coord, { color: colors.textMuted }]}>
                  {region.latitude.toFixed(3)}, {region.longitude.toFixed(3)}
                </Text>

                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Region name"
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.input,
                    { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
                  ]}
                />

                <View style={styles.detailRow}>
                  {DETAIL_LEVELS.map((d) => {
                    const active = d.key === detail.key;
                    return (
                      <TouchableOpacity
                        key={d.key}
                        onPress={() => setDetail(d)}
                        activeOpacity={0.85}
                        style={[
                          styles.detailChip,
                          {
                            backgroundColor: active ? colors.accent : colors.surface,
                            borderColor: active ? colors.accent : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: active ? "#fff" : colors.text,
                            fontFamily: "Inter_600SemiBold",
                            fontSize: 13,
                          }}
                        >
                          {d.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.estRow}>
                  <Ionicons
                    name={estLevel === "ok" ? "layers-outline" : "warning-outline"}
                    size={15}
                    color={estLevel === "ok" ? colors.textMuted : colors.danger ?? "#C0392B"}
                  />
                  <Text
                    style={[
                      styles.estText,
                      { color: estLevel === "ok" ? colors.textMuted : colors.danger ?? "#C0392B" },
                    ]}
                  >
                    ≈ {estTiles.toLocaleString()} tiles · {formatBytes(estBytes)}
                    {estLevel === "block"
                      ? " · too large"
                      : estLevel === "warn"
                        ? " · large"
                        : ""}
                  </Text>
                </View>

                {error ? (
                  <Text style={[styles.errText, { color: colors.danger ?? "#C0392B" }]}>{error}</Text>
                ) : null}

                <TouchableOpacity
                  onPress={handleDownload}
                  disabled={downloading}
                  activeOpacity={0.88}
                  style={[styles.downloadBtn, { backgroundColor: colors.accent, opacity: downloading ? 0.7 : 1 }]}
                >
                  {downloading ? (
                    <>
                      <ActivityIndicator color="#fff" />
                      <Text style={styles.downloadText}>Downloading… {Math.round(progress)}%</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="cloud-download-outline" size={18} color="#fff" />
                      <Text style={styles.downloadText}>Download region</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </GlassPanel>

            {/* ── Saved regions ── */}
            <Text style={[styles.listHeading, { color: colors.text }]}>Saved regions</Text>

            {loading ? (
              <View style={{ paddingVertical: 28, alignItems: "center" }}>
                <ActivityIndicator color={colors.text} />
              </View>
            ) : regions.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textMuted }]}>
                No offline regions yet. Download an area above to use it in Airplane
                Mode.
              </Text>
            ) : (
              regions.map((r) => (
                <GlassPanel key={r.id} radius={colors.radiusLg} intensity={24}>
                  <View style={styles.regionRow}>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={[styles.regionName, { color: colors.text }]}>
                        {r.name}
                      </Text>
                      <Text style={[styles.regionMeta, { color: colors.textMuted }]}>
                        {r.state === "active"
                          ? `Downloading ${Math.round(r.percentage)}%`
                          : `${formatBytes(r.sizeBytes)} · z${r.minZoom}–${r.maxZoom}`}
                      </Text>
                      {r.state === "active" ? (
                        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                          <View
                            style={[
                              styles.progressFill,
                              { backgroundColor: colors.accent, width: `${Math.min(100, r.percentage)}%` },
                            ]}
                          />
                        </View>
                      ) : null}
                    </View>
                    <TouchableOpacity onPress={() => handleDelete(r)} hitSlop={10} style={{ padding: 6 }}>
                      <Ionicons name="trash-outline" size={20} color={colors.danger ?? "#C0392B"} />
                    </TouchableOpacity>
                  </View>
                </GlassPanel>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 18 },
  infoCard: { padding: 20, gap: 10, alignItems: "center" },
  infoTitle: { fontFamily: "Inter_700Bold", fontSize: 16, textAlign: "center" },
  infoBody: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, textAlign: "center" },
  section: { padding: 16, gap: 12 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  coord: { fontFamily: "Inter_500Medium", fontSize: 12, marginTop: -6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  detailRow: { flexDirection: "row", gap: 8 },
  detailChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  estRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  estText: { fontFamily: "Inter_500Medium", fontSize: 12 },
  errText: { fontFamily: "Inter_500Medium", fontSize: 12 },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  downloadText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14 },
  listHeading: { fontFamily: "Inter_700Bold", fontSize: 15, marginTop: 22, marginBottom: 10 },
  empty: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, paddingVertical: 8 },
  regionRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  regionName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  regionMeta: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3 },
  progressTrack: { height: 4, borderRadius: 2, marginTop: 8, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2 },
});
