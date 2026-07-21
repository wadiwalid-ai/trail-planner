/**
 * SPIKE SCREEN — PMTiles × MapLibre React Native (approach B local)
 * Throwaway code. Navigate to /spike-pmtiles. NOT in tab navigation.
 *
 * Tests three delivery approaches and measures offline rendering performance:
 *   A — JS addProtocol in @maplibre/maplibre-react-native v11 → BLOCKED
 *   B-net — Backend HTTP shim (server reads planet PMTiles, serves tiles) → PROVEN
 *   B-local — Device-local TCP server reading a local .pmtiles file → IMPLEMENT + MEASURE
 *   C — MapLibre Native mbtiles:// protocol → NOT EXPOSED in v11 JS API
 *
 * PHYSICAL DEVICE TEST INSTRUCTIONS (approach B-local):
 *   1. Run in a custom dev build (MapLibre + react-native-tcp-socket are native modules).
 *   2. Open this screen while connected to Wi-Fi.
 *   3. Tap "Download UAE test region" — wait ~20-40 s (fetches ~20-40 tiles from CDN).
 *   4. Tap "Start local tile server".
 *   5. Wait for the map to appear and stabilise (note cold-start time shown).
 *   6. Pan/zoom the map for 10 s; note the FPS reading.
 *   7. Enable AIRPLANE MODE.
 *   8. Pan/zoom again — note FPS. If tiles still render, approach B-local works offline.
 *   9. Record results in docs/spike-report.md.
 *
 * REMOVE this file and server/spike-pmtiles.ts after the report is written.
 */
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system";
import { getApiUrl } from "@/lib/query-client";

// ─── Approach A check ──────────────────────────────────────────────────────────

function checkApproachA(): string {
  if (Platform.OS === "web") {
    return "Web: not relevant (targets native MapLibre only).";
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ml = require("@maplibre/maplibre-react-native");
    const fns = ["addProtocol", "registerProtocol", "addCustomProtocol"];
    const found = fns.find((fn) => typeof ml[fn] === "function");
    return found
      ? `SUPPORTED — found: ${found}()`
      : "BLOCKED — addProtocol / registerProtocol / addCustomProtocol are all absent\n" +
        "from @maplibre/maplibre-react-native v11. This is a MapLibre GL JS (web)\n" +
        "feature — not bridged to the native SDK. TransformRequestManager can only\n" +
        "rewrite http/https URLs; it cannot register new URI schemes.";
  } catch (e) {
    return `BLOCKED — MapLibre import failed (expected in Expo Go):\n${String(e)}`;
  }
}

// ─── MapLibre style helpers ────────────────────────────────────────────────────

function buildLocalStyle(port: number): object {
  return {
    version: 8,
    sources: {
      local: {
        type: "vector",
        // Direct tile array avoids a second HTTP round-trip to /tilejson.json
        tiles: [`http://127.0.0.1:${port}/{z}/{x}/{y}.pbf`],
        minzoom: 0,
        maxzoom: 8,
        attribution: "© OpenStreetMap contributors © Protomaps",
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#d4cfc6" } },
      {
        id: "earth",
        type: "fill",
        source: "local",
        "source-layer": "earth",
        paint: { "fill-color": "#e8e2d8" },
      },
      {
        id: "water",
        type: "fill",
        source: "local",
        "source-layer": "water",
        paint: { "fill-color": "#9bbcd8" },
      },
      {
        id: "natural",
        type: "fill",
        source: "local",
        "source-layer": "natural",
        paint: { "fill-color": "#c8dbb0" },
      },
      {
        id: "roads",
        type: "line",
        source: "local",
        "source-layer": "roads",
        minzoom: 5,
        paint: { "line-color": "#b8af9c", "line-width": 1 },
      },
      {
        id: "highways",
        type: "line",
        source: "local",
        "source-layer": "roads",
        minzoom: 4,
        filter: ["in", ["get", "pmap:kind"], ["literal", ["highway", "major_road"]]],
        paint: { "line-color": "#f4b942", "line-width": 2 },
      },
      {
        id: "boundaries",
        type: "line",
        source: "local",
        "source-layer": "boundaries",
        paint: {
          "line-color": "#888",
          "line-width": 1.5,
          "line-dasharray": [4, 3],
        },
      },
    ],
  };
}

function buildNetworkStyle(apiBase: string): object {
  return {
    version: 8,
    sources: {
      net: {
        type: "vector",
        url: `${apiBase}/api/spike/tilejson.json`,
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#d4cfc6" } },
      {
        id: "earth",
        type: "fill",
        source: "net",
        "source-layer": "earth",
        paint: { "fill-color": "#e8e2d8" },
      },
      {
        id: "water",
        type: "fill",
        source: "net",
        "source-layer": "water",
        paint: { "fill-color": "#9bbcd8" },
      },
      {
        id: "roads",
        type: "line",
        source: "net",
        "source-layer": "roads",
        minzoom: 5,
        paint: { "line-color": "#b8af9c", "line-width": 1 },
      },
      {
        id: "highways",
        type: "line",
        source: "net",
        "source-layer": "roads",
        filter: ["in", ["get", "pmap:kind"], ["literal", ["highway", "major_road"]]],
        paint: { "line-color": "#f4b942", "line-width": 2 },
      },
    ],
  };
}

// ─── UAE document storage path ─────────────────────────────────────────────────

const UAE_FILE_URI =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((FileSystem as any).documentDirectory ?? "") + "spike-uae-region.pmtiles";

// ─── Main screen ───────────────────────────────────────────────────────────────

type DownloadState = "idle" | "downloading" | "done" | "error";
type ServerState = "idle" | "starting" | "running" | "error";
type MapMode = "none" | "network" | "local";

export default function SpikePmtilesScreen() {
  const insets = useSafeAreaInsets();
  const apiBase = getApiUrl();

  // ── Approach A (evaluated once) ────────────────────────────────────────────
  const [approachAMsg] = useState(checkApproachA);

  // ── Download state ─────────────────────────────────────────────────────────
  const [dlState, setDlState] = useState<DownloadState>("idle");
  const [dlProgress, setDlProgress] = useState(0);
  const [dlSizeKb, setDlSizeKb] = useState<number | null>(null);
  const [dlError, setDlError] = useState("");

  // ── Local server state ─────────────────────────────────────────────────────
  const [serverState, setServerState] = useState<ServerState>("idle");
  const [localPort, setLocalPort] = useState<number | null>(null);
  const [serverError, setServerError] = useState("");

  // ── Map state ──────────────────────────────────────────────────────────────
  const [mapMode, setMapMode] = useState<MapMode>("none");
  const [mapStyle, setMapStyle] = useState<object | null>(null);

  // ── Metrics ────────────────────────────────────────────────────────────────
  const serverStartRef = useRef<number>(0);
  const [coldStartMs, setColdStartMs] = useState<number | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const fpsFrames = useRef(0);
  const fpsLastTs = useRef(0);

  // ── MapLibre lazy (custom build only) ─────────────────────────────────────
  const [ML, setML] = useState<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    MapView: React.ComponentType<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Camera: React.ComponentType<any>;
  } | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") {
      try {
        const m = require("@maplibre/maplibre-react-native");
        if (m.MapView) setML({ MapView: m.MapView, Camera: m.Camera });
      } catch (_) {}
    }
    // Check if UAE file already exists on disk
    FileSystem.getInfoAsync(UAE_FILE_URI).then((info) => {
      if (info.exists) {
        const size = Math.round((info.size ?? 0) / 1024);
        setDlSizeKb(size);
        setDlState("done");
      }
    });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── FPS measurement ────────────────────────────────────────────────────────
  const startFPS = useCallback(() => {
    fpsFrames.current = 0;
    fpsLastTs.current = performance.now();
    const tick = (ts: number) => {
      fpsFrames.current++;
      if (ts - fpsLastTs.current >= 1000) {
        setFps(fpsFrames.current);
        fpsFrames.current = 0;
        fpsLastTs.current = ts;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopFPS = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleDownload = useCallback(async () => {
    setDlState("downloading");
    setDlProgress(0);
    setDlError("");
    try {
      const url = `${apiBase}/api/spike/uae-region.pmtiles`;
      // Use expo-file-system download with progress callback
      const task = FileSystem.createDownloadResumable(
        url,
        UAE_FILE_URI,
        {},
        (prog) => {
          if (prog.totalBytesExpectedToWrite > 0) {
            setDlProgress(
              Math.round(
                (prog.totalBytesWritten / prog.totalBytesExpectedToWrite) * 100,
              ),
            );
          }
        },
      );
      const result = await task.downloadAsync();
      if (!result || result.status < 200 || result.status >= 300) {
        throw new Error(`HTTP ${result?.status ?? "?"}`);
      }
      const info = await FileSystem.getInfoAsync(UAE_FILE_URI);
      const size = Math.round(((info as { size?: number }).size ?? 0) / 1024);
      setDlSizeKb(size);
      setDlState("done");
    } catch (e) {
      setDlError(String(e));
      setDlState("error");
    }
  }, [apiBase]);

  const handleStartServer = useCallback(async () => {
    setServerState("starting");
    setServerError("");
    setColdStartMs(null);
    stopFPS();
    serverStartRef.current = performance.now();
    try {
      // Dynamic import — crashes on Expo Go (native module missing)
      const { startLocalTileServer } = await import(
        "@/lib/pmtiles/protocol-server"
      );
      const { port } = await startLocalTileServer(UAE_FILE_URI);
      setLocalPort(port);
      setServerState("running");
      setMapStyle(buildLocalStyle(port));
      setMapMode("local");
    } catch (e) {
      setServerError(String(e));
      setServerState("error");
    }
  }, [stopFPS]);

  const handleStopServer = useCallback(async () => {
    stopFPS();
    setMapMode("none");
    setMapStyle(null);
    setLocalPort(null);
    setServerState("idle");
    setColdStartMs(null);
    setFps(null);
    try {
      const { stopLocalTileServer } = await import(
        "@/lib/pmtiles/protocol-server"
      );
      stopLocalTileServer();
    } catch (_) {}
  }, [stopFPS]);

  const handleShowNetworkMap = useCallback(() => {
    setMapMode("network");
    setMapStyle(buildNetworkStyle(apiBase));
    serverStartRef.current = performance.now();
    startFPS();
  }, [apiBase, startFPS]);

  const handleMapLoaded = useCallback(() => {
    const elapsed = Math.round(performance.now() - serverStartRef.current);
    setColdStartMs(elapsed);
    startFPS();
  }, [startFPS]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const pt =
    Platform.OS === "web"
      ? insets.top + 67
      : insets.top;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: pt + 16, paddingBottom: insets.bottom + 34 }]}
    >
      <Text style={styles.heading}>PMTiles Spike</Text>
      <Text style={styles.sub}>Approaches A / B-net / B-local / C</Text>

      {/* ── Approach A ─────────────────────────────────────────────────────── */}
      <Card
        label="A — addProtocol (JS protocol registration)"
        status="blocked"
      >
        <Text style={styles.mono}>{approachAMsg}</Text>
      </Card>

      {/* ── Approach B Network ─────────────────────────────────────────────── */}
      <Card label="B-net — Backend HTTP shim (network)" status="proven">
        <Text style={styles.body}>
          Proven 2026-07-16 via server-side API test.{"\n"}
          Tile z6/49/29 (UAE area): HTTP 200, 65 KB, 1 340 ms on first fetch.{"\n"}
          This path requires the server to be reachable — NOT a true offline test.
        </Text>
        {!ML && (
          <Text style={styles.dimNote}>
            MapLibre unavailable in Expo Go — map hidden. Run in a custom dev
            build to see vector rendering.
          </Text>
        )}
        {ML && mapMode === "none" && (
          <TouchableOpacity style={styles.btn} onPress={handleShowNetworkMap}>
            <Text style={styles.btnText}>Show Network Map</Text>
          </TouchableOpacity>
        )}
        {ML && mapMode === "network" && (
          <MapArea ML={ML} style={mapStyle} onLoaded={handleMapLoaded} />
        )}
        {mapMode === "network" && <MetricsRow coldStart={coldStartMs} fps={fps} />}
      </Card>

      {/* ── Approach B Local ───────────────────────────────────────────────── */}
      <Card label="B-local — Device-local TCP server (offline target)" status="new">
        <Text style={styles.body}>
          react-native-tcp-socket serves tiles from a local .pmtiles file on{"\n"}
          127.0.0.1. MapLibre fetches from this local server — works in airplane{"\n"}
          mode because traffic never leaves the device.{"\n\n"}
          Requires: custom dev build (native module).
        </Text>

        {/* Step 1: Download */}
        <StepRow n={1} done={dlState === "done"}>
          <Text style={styles.stepLabel}>Download UAE test region (z0–z8)</Text>
          {dlState === "idle" || dlState === "error" ? (
            <TouchableOpacity
              style={styles.btn}
              onPress={handleDownload}
            >
              <Text style={styles.btnText}>
                {dlState === "error" ? "Retry Download" : "Download"}
              </Text>
            </TouchableOpacity>
          ) : dlState === "downloading" ? (
            <View style={styles.row}>
              <ActivityIndicator size="small" color="#f4b942" />
              <Text style={styles.dimNote}>  {dlProgress}%</Text>
            </View>
          ) : (
            <Text style={styles.done}>
              ✓ {dlSizeKb} KB saved to document storage
            </Text>
          )}
          {dlState === "error" && (
            <Text style={styles.error}>{dlError}</Text>
          )}
        </StepRow>

        {/* Step 2: Start server */}
        <StepRow n={2} done={serverState === "running"}>
          <Text style={styles.stepLabel}>Start local tile server</Text>
          {serverState === "idle" || serverState === "error" ? (
            <TouchableOpacity
              style={[styles.btn, dlState !== "done" && styles.btnDisabled]}
              onPress={handleStartServer}
              disabled={dlState !== "done"}
            >
              <Text style={styles.btnText}>
                {serverState === "error" ? "Retry Server" : "Start Server"}
              </Text>
            </TouchableOpacity>
          ) : serverState === "starting" ? (
            <View style={styles.row}>
              <ActivityIndicator size="small" color="#f4b942" />
              <Text style={styles.dimNote}>  Starting…</Text>
            </View>
          ) : (
            <View>
              <Text style={styles.done}>
                ✓ Listening on 127.0.0.1:{localPort}
              </Text>
              <TouchableOpacity style={styles.btnSmall} onPress={handleStopServer}>
                <Text style={styles.btnSmallText}>Stop Server</Text>
              </TouchableOpacity>
            </View>
          )}
          {serverState === "error" && (
            <Text style={styles.error}>{serverError}</Text>
          )}
        </StepRow>

        {/* Step 3: Map + metrics */}
        <StepRow n={3} done={false}>
          <Text style={styles.stepLabel}>
            Map renders from local file → enable Airplane Mode → verify tiles survive
          </Text>
          {serverState !== "running" && (
            <Text style={styles.dimNote}>
              Start the local server first (step 2).
            </Text>
          )}
          {!ML && serverState === "running" && (
            <Text style={styles.dimNote}>
              MapLibre unavailable in Expo Go. Run in a custom dev build.
            </Text>
          )}
          {ML && serverState === "running" && mapMode === "local" && (
            <>
              <View style={styles.airplaneBox}>
                <Text style={styles.airplaneText}>
                  ✈  NOW: enable Airplane Mode and pan the map.{"\n"}
                  Tiles should keep rendering from the local server.
                </Text>
              </View>
              <MapArea ML={ML} style={mapStyle} onLoaded={handleMapLoaded} />
              <MetricsRow coldStart={coldStartMs} fps={fps} />
            </>
          )}
        </StepRow>
      </Card>

      {/* ── Approach C ─────────────────────────────────────────────────────── */}
      <Card label="C — MapLibre mbtiles:// protocol" status="deferred">
        <Text style={styles.body}>
          MapLibre Native (C++ core) supports mbtiles:// on iOS via internal{"\n"}
          SQLite reads. However, @maplibre/maplibre-react-native v11 does NOT{"\n"}
          expose this URI scheme through its JS API or TransformRequestManager.{"\n\n"}
          Enabling it would require:{"\n"}
          1. Forking or patching MapLibre React Native (Swift + Kotlin).{"\n"}
          2. Converting each PMTiles archive to MBTiles (SQLite) on device.{"\n\n"}
          Deferred — pursue only if approach B-local fails on device.
        </Text>
      </Card>

      {/* ── Instructions ────────────────────────────────────────────────────── */}
      <Card label="Record results in docs/spike-report.md" status="info">
        <Text style={styles.body}>
          Fill in FPS (panning, airplane mode on), cold-start time, device{"\n"}
          model, and any crashes/blockers. That report unlocks production work.
        </Text>
      </Card>
    </ScrollView>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  blocked: "#c0392b",
  proven:  "#27ae60",
  new:     "#2980b9",
  deferred:"#d35400",
  info:    "#555",
};

function Card({
  label,
  status,
  children,
}: {
  label: string;
  status: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={[styles.cardBadge, { backgroundColor: STATUS_COLORS[status] ?? "#555" }]}>
        <Text style={styles.cardBadgeText}>{status.toUpperCase()}</Text>
      </View>
      <Text style={styles.cardTitle}>{label}</Text>
      {children}
    </View>
  );
}

function StepRow({
  n,
  done,
  children,
}: {
  n: number;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.step, done && styles.stepDone]}>
      <Text style={styles.stepN}>{done ? "✓" : n}</Text>
      <View style={styles.stepBody}>{children}</View>
    </View>
  );
}

function MapArea({
  ML,
  style,
  onLoaded,
}: {
  ML: { MapView: React.ComponentType<unknown>; Camera: React.ComponentType<unknown> };
  style: object | null;
  onLoaded: () => void;
}) {
  if (!style) return null;
  const { MapView, Camera } = ML;
  return (
    <View style={styles.mapBox}>
      {/* @ts-ignore — spike code, types are optional */}
      <MapView
        style={styles.map}
        styleJSON={JSON.stringify(style)}
        onDidFinishLoadingMap={onLoaded}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {React.createElement(Camera as React.ComponentType<Record<string, unknown>>, {
          zoomLevel: 7,
          centerCoordinate: [54.0, 24.4],
          animationMode: "none",
        })}
      </MapView>
    </View>
  );
}

function MetricsRow({
  coldStart,
  fps,
}: {
  coldStart: number | null;
  fps: number | null;
}) {
  return (
    <View style={styles.metrics}>
      <MetricCell
        label="Cold-start → map loaded"
        value={coldStart !== null ? `${coldStart} ms` : "measuring…"}
      />
      <MetricCell
        label="JS frame rate"
        value={fps !== null ? `${fps} fps` : "measuring…"}
      />
    </View>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#1a1a1a" },
  content: { paddingHorizontal: 16, gap: 12 },
  heading: { fontSize: 22, fontWeight: "700", color: "#fff", marginBottom: 2 },
  sub: { fontSize: 13, color: "#888", marginBottom: 4 },

  card: {
    backgroundColor: "#252525",
    borderRadius: 10,
    padding: 14,
    gap: 8,
  },
  cardBadge: {
    alignSelf: "flex-start",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cardBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  cardTitle: { fontSize: 14, fontWeight: "600", color: "#eee" },

  body: { fontSize: 12, color: "#bbb", lineHeight: 18 },
  mono: { fontSize: 11, color: "#aaa", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", lineHeight: 16 },
  dimNote: { fontSize: 11, color: "#666", fontStyle: "italic" },
  done: { fontSize: 12, color: "#2ecc71", fontWeight: "600" },
  error: { fontSize: 11, color: "#e74c3c", marginTop: 4 },

  row: { flexDirection: "row", alignItems: "center" },

  btn: {
    backgroundColor: "#f4b942",
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
  },
  btnText: { color: "#000", fontSize: 13, fontWeight: "700" },
  btnDisabled: { opacity: 0.4 },

  btnSmall: {
    marginTop: 6,
    borderColor: "#555",
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignSelf: "flex-start",
  },
  btnSmallText: { color: "#aaa", fontSize: 11 },

  step: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#1e1e1e",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#333",
  },
  stepDone: { borderColor: "#2ecc7144" },
  stepN: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#444", color: "#fff", fontSize: 11, fontWeight: "700", textAlign: "center", lineHeight: 20 },
  stepBody: { flex: 1, gap: 6 },
  stepLabel: { fontSize: 12, fontWeight: "600", color: "#ccc" },

  airplaneBox: {
    backgroundColor: "#1a3a1a",
    borderRadius: 6,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#2ecc71",
  },
  airplaneText: { color: "#2ecc71", fontSize: 12, lineHeight: 18 },

  mapBox: { height: 280, borderRadius: 8, overflow: "hidden", marginTop: 4 },
  map: { flex: 1 },

  metrics: { flexDirection: "row", gap: 8 },
  metricCell: {
    flex: 1,
    backgroundColor: "#1e1e1e",
    borderRadius: 6,
    padding: 8,
    alignItems: "center",
  },
  metricValue: { fontSize: 18, fontWeight: "700", color: "#f4b942" },
  metricLabel: { fontSize: 10, color: "#777", textAlign: "center", marginTop: 2 },
});
