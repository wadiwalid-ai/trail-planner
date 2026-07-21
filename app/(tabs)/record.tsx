import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  ScrollView,
  Platform,
  Alert,
  Linking,
  KeyboardAvoidingView,
  ActivityIndicator,
  AppState,
} from "react-native";
import AdventureMap, {
  type AdventureMapHandle,
  type AdventurePolyline,
  type AdventureMarker,
} from "@/components/AdventureMap";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useUnits } from "@/context/UnitsContext";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/context/AuthContext";
import { routeState } from "@/lib/navigation";
import { NavigationHUD } from "@/components/NavigationHUD";
import { SafetyFab } from "@/components/SafetyFab";
import {
  WAYPOINT_CATEGORY_META,
  type WaypointCategory,
} from "@/constants/trailData";

type Coord = {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  timestampMs?: number | null;
};
type SessionPhase = "planning" | "recording";

// User-selectable waypoint categories for the planning chip picker. The
// glyph/colour metadata is shared (WAYPOINT_CATEGORY_META in constants/trailData)
// so the planning map, trail detail map and Explore map all render the same
// category pins.
const WAYPOINT_CATEGORIES: {
  key: WaypointCategory;
  label: string;
  glyph: keyof typeof Ionicons.glyphMap;
  color: string;
}[] = (["water", "camp", "hazard", "viewpoint", "fuel"] as WaypointCategory[]).map(
  (key) => {
    const m = WAYPOINT_CATEGORY_META[key];
    return {
      key,
      label: m.label,
      glyph: m.glyph as keyof typeof Ionicons.glyphMap,
      color: m.color,
    };
  },
);

interface SmartWaypoint {
  id: string;
  name?: string;
  note?: string;
  category?: WaypointCategory;
  lat: number;
  lng: number;
  elevation: number | null;
  gpsAltitude: number | null;
  timestamp: string;
  elevationLoading: boolean;
  elevationError: boolean;
}

type MediaType = "photo" | "audio";

interface MediaDraft {
  id: string;
  uri: string;
  mediaType: MediaType;
  caption?: string;
  coordinate: Coord | null;
  takenAtMs: number;
}

// Read a local media URI as a base64 string (web and native paths).
async function uriToBase64(uri: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      const resp = await fetch(uri);
      const blob = await resp.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const r = String(reader.result ?? "");
          resolve(r.includes(",") ? r.slice(r.indexOf(",") + 1) : r);
        };
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(blob);
      });
    }
    const { File } = await import("expo-file-system");
    return await new File(uri).base64();
  } catch {
    return null;
  }
}

// Upload captured photos / voice notes to the durable media store so they
// survive reinstalls and resolve on other devices. Falls back to the local URI
// when not signed in (upload requires auth) or if an individual upload fails.
async function uploadMedia(media: MediaDraft[], authed: boolean) {
  return Promise.all(
    media.map(async (m) => {
      let uri = m.uri;
      if (authed) {
        const b64 = await uriToBase64(m.uri);
        if (b64) {
          try {
            const up = await apiRequest("POST", "/api/media/upload", {
              data: b64,
              mediaType: m.mediaType,
            });
            const upData = await up.json();
            if (upData?.url) uri = upData.url as string;
          } catch {
            // Keep the local URI on failure.
          }
        }
      }
      return {
        uri,
        mediaType: m.mediaType,
        caption: m.caption ?? null,
        latitude: m.coordinate?.latitude ?? null,
        longitude: m.coordinate?.longitude ?? null,
        takenAtMs: m.takenAtMs,
      };
    }),
  );
}

type ActivityType = "offroad" | "hike" | "bike" | "drive" | "run" | "walk";

const ACTIVITY_TYPES: { type: ActivityType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: "offroad", label: "Off-Road", icon: "car-sport-outline" },
  { type: "drive",   label: "Drive",    icon: "car-outline" },
  { type: "bike",    label: "Bike",     icon: "bicycle-outline" },
  { type: "hike",    label: "Hike",     icon: "trail-sign-outline" },
  { type: "run",     label: "Run",      icon: "walk-outline" },
  { type: "walk",    label: "Walk",     icon: "footsteps-outline" },
];

function wpVariant(idx: number, total: number): "start" | "end" | "regular" {
  if (total <= 1 || idx === 0) return "start";
  if (idx === total - 1) return "end";
  return "regular";
}

function wpLabel(idx: number, total: number): string {
  if (total <= 1 || idx === 0) return "Start";
  if (idx === total - 1) return "End";
  return `WP-${idx + 1}`;
}

async function fetchElevation(lat: number, lng: number): Promise<{ elevation: number | null; error: boolean }> {
  try {
    const { getApiUrl } = await import("@/lib/query-client");
    const url = new URL(`/api/elevation`, getApiUrl());
    url.searchParams.set("lat", lat.toFixed(6));
    url.searchParams.set("lng", lng.toFixed(6));
    const res = await fetch(url.toString());
    if (!res.ok) return { elevation: null, error: true };
    const data = await res.json();
    if (typeof data.elevation === "number") return { elevation: data.elevation, error: false };
    return { elevation: null, error: true };
  } catch {
    return { elevation: null, error: true };
  }
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function toCoord(loc: Location.LocationObject): Coord {
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    altitude: loc.coords.altitude ?? null,
    speed: loc.coords.speed ?? null,
    accuracy: loc.coords.accuracy ?? null,
    timestampMs: loc.timestamp ?? null,
  };
}

function haversineKm(a: Coord, b: Coord): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function elevationFromCoords(coords: Coord[]): {
  elevationGainMeters: number | null;
  elevationLossMeters: number | null;
} {
  const alts = coords
    .map((c) => (typeof c.altitude === "number" ? c.altitude : null))
    .filter((a): a is number => a != null);
  if (alts.length < 2) return { elevationGainMeters: null, elevationLossMeters: null };
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < alts.length; i++) {
    const delta = alts[i] - alts[i - 1];
    if (delta > 0) gain += delta;
    else loss += -delta;
  }
  return { elevationGainMeters: Math.round(gain), elevationLossMeters: Math.round(loss) };
}

function calcTotalKm(coords: Coord[]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversineKm(coords[i - 1], coords[i]);
  return total;
}

const TAB_BAR_HEIGHT = 49;

// Minimum gap between automatic elevation-retry sweeps. Auto-retry can be
// triggered by the app returning to the foreground (a proxy for regained
// connectivity) or by the Save sheet opening; this debounce stops those signals
// from hammering the elevation API. Manual "tap pin to retry" bypasses it.
const AUTO_RETRY_MIN_INTERVAL_MS = 8000;

export default function RecordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const units = useUnits();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const mapRef = useRef<AdventureMapHandle>(null);
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>("planning");
  const [coords, setCoords] = useState<Coord[]>([]);
  const [waypoints, setWaypoints] = useState<SmartWaypoint[]>([]);
  // Mirror of `waypoints` so async auto-retry can read the latest list without
  // re-binding effects on every waypoint change.
  const waypointsRef = useRef<SmartWaypoint[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [mapType, setMapType] = useState<"hybrid" | "standard">("hybrid");
  const [currentCoord, setCurrentCoord] = useState<Coord | null>(null);
  const currentCoordRef = useRef<Coord | null>(null);

  const [retracing, setRetracing] = useState(false);
  const [heading, setHeading] = useState<number | null>(null);
  const headingSub = useRef<Location.LocationSubscription | null>(null);

  const [selectedWaypoint, setSelectedWaypoint] = useState<SmartWaypoint | null>(null);

  const [media, setMedia] = useState<MediaDraft[]>([]);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [showSaveSheet, setShowSaveSheet] = useState(false);
  const [trailName, setTrailName] = useState("");
  const [trailLocation, setTrailLocation] = useState("");
  const [trailDescription, setTrailDescription] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>("offroad");
  const [difficulty, setDifficulty] = useState(5);
  const [isSaving, setIsSaving] = useState(false);
  const [visibility, setVisibility] = useState<"private" | "public">("public");

  // True while an OS prompt is pending, so a concurrent focus re-check doesn't
  // flash the "denied" screen before the user has answered the dialog.
  const permRequestInFlight = useRef(false);

  // Read the current permission WITHOUT prompting. Used on focus so returning
  // from Settings (or granting elsewhere) immediately unlocks the screen.
  const syncPermission = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      const granted = status === "granted";
      if (granted) setHasPermission(true);
      else if (!permRequestInFlight.current) setHasPermission(false);
      return granted;
    } catch {
      if (!permRequestInFlight.current) setHasPermission(false);
      return false;
    }
  }, []);

  // Actively obtain permission: prompt if we still can, otherwise send the user
  // to the OS Settings (the only place permission can be re-enabled once denied).
  const requestPermission = useCallback(async (): Promise<boolean> => {
    permRequestInFlight.current = true;
    try {
      const current = await Location.getForegroundPermissionsAsync();
      if (current.status === "granted") {
        setHasPermission(true);
        return true;
      }
      if (current.canAskAgain) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        const granted = status === "granted";
        setHasPermission(granted);
        return granted;
      }
      setHasPermission(false);
      if (Platform.OS !== "web") Linking.openSettings();
      return false;
    } catch {
      setHasPermission(false);
      return false;
    } finally {
      permRequestInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    requestPermission();
    return () => {
      locationSub.current?.remove();
      headingSub.current?.remove();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [requestPermission]);

  // Re-check whenever the Record tab regains focus (e.g. back from Settings).
  useFocusEffect(
    useCallback(() => {
      syncPermission();
    }, [syncPermission])
  );

  // Subscribe to compass heading only while retracing (native only).
  useEffect(() => {
    if (!retracing || Platform.OS === "web") return;
    let active = true;
    (async () => {
      const sub = await Location.watchHeadingAsync((h) => {
        const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
        if (active && deg >= 0) setHeading(deg);
      });
      headingSub.current = sub;
    })();
    return () => {
      active = false;
      headingSub.current?.remove();
      headingSub.current = null;
    };
  }, [retracing]);

  const retraceNav =
    retracing && currentCoord && coords.length >= 2
      ? routeState(currentCoord, [...coords].reverse(), {
          offRouteMeters: 50,
          arrivalMeters: 30,
        })
      : null;

  const startRecording = useCallback(async () => {
    const granted = (await syncPermission()) || (await requestPermission());
    if (!granted) {
      Alert.alert(
        "Location Required",
        "Allow location access to record a track.",
        Platform.OS === "web"
          ? undefined
          : [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ]
      );
      return;
    }
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      const initial: Coord = toCoord(loc);
      setCoords([initial]);
      setCurrentCoord(initial);
      currentCoordRef.current = initial;
      // Preserve pre-planned waypoints — session continuity
      setElapsed(0);
      setIsRecording(true);
      setSessionPhase("recording");

      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 5 },
        (loc) => {
          const c: Coord = toCoord(loc);
          setCurrentCoord(c);
          currentCoordRef.current = c;
          setCoords((prev) => {
            if (prev.length > 0 && haversineKm(prev[prev.length - 1], c) < 0.005) return prev;
            return [...prev, c];
          });
        }
      );

      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch {
      Alert.alert("GPS Error", "Could not get your location. Make sure GPS is enabled.");
    }
  }, [syncPermission, requestPermission]);

  const stopRecording = useCallback(() => {
    locationSub.current?.remove();
    locationSub.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsRecording(false);
    setSessionPhase("planning");
    setRetracing(false);
    if (coords.length < 2) {
      Alert.alert("Track too short", "Move around more before stopping.");
      return;
    }
    setShowSaveSheet(true);
  }, [coords.length]);

  const handleWaypointDrop = useCallback(async (coord: { latitude: number; longitude: number }, gpsAlt?: number | null) => {
    // For map-tap drops gpsAlt is undefined; use the latest device fix from ref.
    // In planning mode the watch hasn't started, so do a one-shot location fetch.
    let resolvedAlt: number | null = null;
    if (gpsAlt !== undefined) {
      resolvedAlt = gpsAlt;
    } else if (currentCoordRef.current?.altitude != null) {
      resolvedAlt = currentCoordRef.current.altitude;
    } else {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        resolvedAlt = loc.coords.altitude ?? null;
        // Keep ref fresh for subsequent drops in planning mode
        currentCoordRef.current = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          altitude: loc.coords.altitude,
          speed: loc.coords.speed,
          accuracy: loc.coords.accuracy,
          timestampMs: loc.timestamp,
        };
      } catch {
        resolvedAlt = null;
      }
    }
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    const newWp: SmartWaypoint = {
      id,
      lat: coord.latitude,
      lng: coord.longitude,
      elevation: null,
      gpsAltitude: resolvedAlt,
      timestamp: new Date().toISOString(),
      elevationLoading: true,
      elevationError: false,
    };
    setWaypoints((prev) => [...prev, newWp]);
    setSelectedWaypoint(newWp);
    const { elevation, error } = await fetchElevation(coord.latitude, coord.longitude);
    setWaypoints((prev) =>
      prev.map((wp) => wp.id === id ? { ...wp, elevation, elevationLoading: false, elevationError: error } : wp)
    );
  }, []);

  const retryWaypointElevation = useCallback(async (id: string) => {
    let target: SmartWaypoint | undefined;
    setWaypoints((prev) => {
      target = prev.find((wp) => wp.id === id);
      return prev.map((wp) => wp.id === id ? { ...wp, elevationLoading: true, elevationError: false } : wp);
    });
    if (!target) return;
    const { elevation, error } = await fetchElevation(target.lat, target.lng);
    setWaypoints((prev) =>
      prev.map((wp) => wp.id === id ? { ...wp, elevation, elevationLoading: false, elevationError: error } : wp)
    );
  }, []);

  // Guards so overlapping triggers (foreground + Save sheet) don't run the same
  // sweep twice or spam the elevation API.
  const autoRetryInFlight = useRef(false);
  const lastAutoRetryAt = useRef(0);

  // Re-fetch every waypoint stuck in the elevationError state. Triggered
  // automatically when the app regains foreground (a stand-in for regained
  // connectivity, since no NetInfo/expo-network module is installed) and when
  // the Save sheet opens. Rate-limited via AUTO_RETRY_MIN_INTERVAL_MS so rapid
  // triggers collapse into one sweep; the manual per-pin retry is unaffected.
  const autoRetryMissingElevations = useCallback(async () => {
    if (autoRetryInFlight.current) return;
    const pending = waypointsRef.current.filter(
      (wp) => wp.elevationError && !wp.elevationLoading,
    );
    if (pending.length === 0) return;
    const now = Date.now();
    if (now - lastAutoRetryAt.current < AUTO_RETRY_MIN_INTERVAL_MS) return;
    lastAutoRetryAt.current = now;
    autoRetryInFlight.current = true;
    const ids = new Set(pending.map((wp) => wp.id));
    setWaypoints((prev) =>
      prev.map((wp) =>
        ids.has(wp.id) ? { ...wp, elevationLoading: true, elevationError: false } : wp,
      ),
    );
    try {
      for (const wp of pending) {
        const { elevation, error } = await fetchElevation(wp.lat, wp.lng);
        setWaypoints((prev) =>
          prev.map((w) =>
            w.id === wp.id
              ? { ...w, elevation, elevationLoading: false, elevationError: error }
              : w,
          ),
        );
      }
    } finally {
      autoRetryInFlight.current = false;
    }
  }, []);

  // Keep the ref in sync so auto-retry always reads the freshest waypoints.
  useEffect(() => {
    waypointsRef.current = waypoints;
  }, [waypoints]);

  // Auto-retry when the app returns to the foreground (proxy for the device
  // regaining signal after a connectivity drop on the trail).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void autoRetryMissingElevations();
    });
    return () => sub.remove();
  }, [autoRetryMissingElevations]);

  // Auto-retry when the Save sheet opens, so most tracks reach the save step
  // with complete elevation data without the user tapping each pin.
  useEffect(() => {
    if (showSaveSheet) void autoRetryMissingElevations();
  }, [showSaveSheet, autoRetryMissingElevations]);

  const dropAtCurrentLocation = useCallback(() => {
    if (!currentCoord) return;
    handleWaypointDrop(currentCoord, currentCoord.altitude ?? null);
  }, [currentCoord, handleWaypointDrop]);

  const removeWaypoint = useCallback((id: string) => {
    setWaypoints((prev) => prev.filter((wp) => wp.id !== id));
    setSelectedWaypoint((sel) => sel?.id === id ? null : sel);
  }, []);

  const renameWaypoint = useCallback((id: string, name: string) => {
    setWaypoints((prev) => prev.map((wp) => wp.id === id ? { ...wp, name } : wp));
  }, []);

  const setWaypointNote = useCallback((id: string, note: string) => {
    setWaypoints((prev) => prev.map((wp) => wp.id === id ? { ...wp, note } : wp));
  }, []);

  const setWaypointCategory = useCallback((id: string, category: WaypointCategory | undefined) => {
    setWaypoints((prev) => prev.map((wp) => wp.id === id ? { ...wp, category } : wp));
  }, []);

  const capturePhoto = useCallback(async () => {
    try {
      const fromCamera = Platform.OS !== "web";
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Allow camera/photo access to attach photos.");
        return;
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.6, exif: false })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.6,
          });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setMedia((prev) => [
        ...prev,
        {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          uri: asset.uri,
          mediaType: "photo",
          coordinate: currentCoord,
          takenAtMs: Date.now(),
        },
      ]);
    } catch {
      Alert.alert("Photo error", "Could not capture photo. Try again.");
    }
  }, [currentCoord]);

  const startVoiceNote = useCallback(async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Microphone needed", "Allow microphone access to record voice notes.");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecordingVoice(true);
    } catch {
      Alert.alert("Recording error", "Could not start voice note.");
    }
  }, [audioRecorder]);

  const stopVoiceNote = useCallback(async () => {
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      setIsRecordingVoice(false);
      if (!uri) return;
      setMedia((prev) => [
        ...prev,
        {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          uri,
          mediaType: "audio",
          coordinate: currentCoord,
          takenAtMs: Date.now(),
        },
      ]);
    } catch {
      setIsRecordingVoice(false);
      Alert.alert("Recording error", "Could not save voice note.");
    }
  }, [audioRecorder, currentCoord]);

  const removeMedia = useCallback((id: string) => {
    setMedia((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const saveTrail = useCallback(async (skipElevWarning = false) => {
    if (!isAuthenticated) {
      Alert.alert(
        "Sign in to save",
        "Sign in (or create a free account) to save this track to My Trails.",
        [
          { text: "Not now", style: "cancel" },
          {
            text: "Sign in",
            onPress: () => {
              setShowSaveSheet(false);
              router.push("/(tabs)/account");
            },
          },
        ],
      );
      return;
    }
    if (!trailName.trim()) { Alert.alert("Name required", "Give your trail a name first."); return; }
    const missingElev = waypoints.filter((w) => w.elevationError).length;
    if (missingElev > 0 && skipElevWarning !== true) {
      Alert.alert(
        "Missing elevation",
        `${missingElev} waypoint${missingElev > 1 ? "s are" : " is"} missing elevation data. Tap a waypoint pin to retry, or save anyway.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Save anyway", style: "destructive", onPress: () => { void saveTrail(true); } },
        ],
      );
      return;
    }
    setIsSaving(true);
    const km = calcTotalKm(coords);
    const requestedVisibility = isAuthenticated ? visibility : "private";
    try {
      const mediaPayload = await uploadMedia(media, isAuthenticated);
      const res = await apiRequest("POST", "/api/trails", {
        trail: {
          name: trailName.trim(),
          location: trailLocation.trim() || "UAE",
          description: trailDescription.trim() || null,
          activityType,
          difficulty,
          distance: `${km.toFixed(1)} km`,
          duration: formatDuration(elapsed),
          distanceMeters: Math.round(km * 1000),
          durationSeconds: elapsed,
          visibility: requestedVisibility,
          ...elevationFromCoords(coords),
        },
        trailCoordinates: coords,
        waypoints: waypoints.map((w, i) => ({
          waypointKey: `rec-${i}`,
          name: w.name?.trim() || wpLabel(i, waypoints.length),
          description: w.note?.trim() || null,
          type: w.category
            ? w.category
            : wpVariant(i, waypoints.length) === "start"
              ? "start"
              : wpVariant(i, waypoints.length) === "end"
                ? "end"
                : "scenic",
          coordinate: { latitude: w.lat, longitude: w.lng },
          elevation: w.elevation != null ? `${Math.round(w.elevation)} m` : null,
          gpsAltitude: w.gpsAltitude,
          timestamp: w.timestamp,
          sequenceNum: i,
        })),
        media: mediaPayload,
      });
      const data = await res.json().catch(() => ({}));
      await queryClient.invalidateQueries({ queryKey: ["/api/trails"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/me/trails"] });
      const savedName = trailName;
      setShowSaveSheet(false);
      setCoords([]); setWaypoints([]); setElapsed(0); setTrailName(""); setTrailLocation("");
      setTrailDescription(""); setActivityType("offroad"); setMedia([]); setVisibility("public");

      if (data?.publishBlocked) {
        Alert.alert(
          "Saved privately",
          `"${savedName}" was saved. Accept the content agreement to publish it publicly.`,
          [
            { text: "Later", style: "cancel" },
            { text: "Review agreement", onPress: () => router.push("/ugc") },
          ],
        );
      } else if (requestedVisibility === "public") {
        Alert.alert("Published!", `"${savedName}" is now public in Explore.`);
      } else {
        Alert.alert("Saved!", `"${savedName}" added to your tracks.`);
      }
    } catch {
      Alert.alert("Error", "Could not save trail. Try again.");
    } finally {
      setIsSaving(false);
    }
  }, [trailName, trailLocation, trailDescription, activityType, difficulty, coords, waypoints, media, elapsed, queryClient, isAuthenticated, visibility]);

  const distanceKm = calcTotalKm(coords);
  const bottomOffset = insets.bottom + TAB_BAR_HEIGHT + 8;
  const topOffset = Platform.OS === "web" ? 67 : insets.top;
  const s = styles(colors);

  if (hasPermission === false) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <Ionicons name="location-outline" size={48} color={colors.textMuted} />
        <Text style={[s.permTitle, { color: colors.text }]}>Location Access Needed</Text>
        <Text style={[s.permBody, { color: colors.textSecondary }]}>
          Enable location to record GPS tracks. If you already allowed it, tap below to retry.
        </Text>
        <TouchableOpacity
          style={[s.permButton, { backgroundColor: colors.primary }]}
          onPress={requestPermission}
          activeOpacity={0.85}
        >
          <Text style={s.permButtonText}>Grant Location Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <AdventureMap
        ref={mapRef}
        baseLayer={mapType === "hybrid" ? "hybrid" : "standard"}
        showsUserLocation
        followsUserLocation={isRecording}
        showsCompass
        showsScale
        polylines={[
          ...(coords.length > 1
            ? [{ id: "track", coordinates: coords, color: colors.accent, width: 3 }]
            : []),
          ...(retraceNav && coords.length > 1
            ? [
                {
                  id: "retrace",
                  coordinates: [...coords].reverse(),
                  color: colors.success,
                  width: 5,
                },
              ]
            : []),
        ]}
        waypointMode
        onWaypointDrop={handleWaypointDrop}
        markers={[
          ...waypoints.map((wp, idx) => {
            const total = waypoints.length;
            const variant = wpVariant(idx, total);
            const cat = wp.category ? WAYPOINT_CATEGORY_META[wp.category] : null;
            return {
              id: wp.id,
              coordinate: { latitude: wp.lat, longitude: wp.lng },
              icon: {
                kind: "waypoint" as const,
                color: cat ? cat.color : colors.accent,
                glyph: cat ? cat.glyph : undefined,
                variant,
                waypointNumber: idx + 1,
                loading: wp.elevationLoading,
                error: wp.elevationError,
                label: wp.name?.trim() || undefined,
              },
              onPress: () => setSelectedWaypoint(wp),
              zIndex: 10,
            };
          }),
          ...media
            .filter((m) => m.coordinate != null)
            .map((m) => ({
              id: m.id,
              coordinate: m.coordinate as Coord,
              pinColor: m.mediaType === "audio" ? colors.mediaAudio : colors.mediaPhoto,
              title: m.mediaType === "audio" ? "Voice note" : "Photo",
              description: undefined,
            })),
        ]}
      />

      {/* Top bar */}
      <View style={[s.topBar, { top: topOffset + 8, paddingHorizontal: 16 }]}>
        <View style={s.pill}>
          <TouchableOpacity
            style={[s.mapToggleBtn, mapType === "hybrid" && s.mapToggleBtnActive]}
            onPress={() => setMapType("hybrid")}
          >
            <Text style={[s.mapToggleLabel, mapType === "hybrid" && s.mapToggleLabelActive]}>SAT</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.mapToggleBtn, mapType === "standard" && s.mapToggleBtnActive]}
            onPress={() => setMapType("standard")}
          >
            <Text style={[s.mapToggleLabel, mapType === "standard" && s.mapToggleLabelActive]}>MAP</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {isRecording && (
            <View style={s.pill}>
              <View style={s.recDot} />
              <Text style={s.recLabel}>{coords.length} pts</Text>
            </View>
          )}
          <TouchableOpacity
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={() => router.push("/convoy" as any)}
            activeOpacity={0.85}
            testID="open-convoy"
          >
            <Ionicons name="people" size={18} color={colors.onPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Planning mode banner */}
      {sessionPhase === "planning" && (
        <View style={[s.planningBanner, { top: topOffset + 56 }]}>
          <Ionicons name="flag-outline" size={14} color="#fff" />
          <Text style={s.planningBannerText}>
            Tap map to add waypoints{waypoints.length > 0 ? ` · ${waypoints.length} placed` : ""} · Press Record when ready
          </Text>
          {waypoints.length > 0 && (
            <TouchableOpacity onPress={() => setWaypoints([])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Retrace guidance HUD */}
      {retraceNav && (
        <View style={[s.hudWrap, { top: topOffset + 56 }]}>
          <NavigationHUD
            title="Retrace to car"
            bearingToNext={retraceNav.bearingToNext}
            deviceHeading={heading ?? 0}
            remainingMeters={retraceNav.remainingMeters}
            offRoute={retraceNav.offRoute}
            arrived={retraceNav.arrived}
            accent={colors.success}
            onStop={() => setRetracing(false)}
          />
        </View>
      )}

      {/* Stats bar */}
      {isRecording && (
        <View style={[s.statsBar, { bottom: bottomOffset + 140 }]}>
          <View style={s.statItem}>
            <Ionicons name="time-outline" size={14} color="#fff" />
            <Text style={s.statText}>{formatDuration(elapsed)}</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Ionicons name="navigate-outline" size={14} color="#fff" />
            <Text style={s.statText}>{units.formatDistance(distanceKm * 1000)}</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Ionicons name="flag-outline" size={14} color="#fff" />
            <Text style={s.statText}>{waypoints.length} pins</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Ionicons name="images-outline" size={14} color="#fff" />
            <Text style={s.statText}>{media.length} media</Text>
          </View>
        </View>
      )}

      {/* Bottom controls */}
      <View style={[s.bottomPanel, { bottom: bottomOffset, paddingHorizontal: 20 }]}>
        {isRecording && (
          <View style={s.captureRow}>
            <TouchableOpacity
              style={s.captureBtn}
              onPress={dropAtCurrentLocation}
              disabled={!currentCoord}
            >
              <Ionicons name="pin-outline" size={18} color="#fff" />
              <Text style={s.captureBtnLabel}>Pin</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.captureBtn} onPress={capturePhoto}>
              <Ionicons name="camera-outline" size={18} color="#fff" />
              <Text style={s.captureBtnLabel}>Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.captureBtn, retracing && s.retraceBtnActive]}
              onPress={() => setRetracing((v) => !v)}
              disabled={coords.length < 2}
            >
              <Ionicons
                name={retracing ? "navigate" : "navigate-outline"}
                size={18}
                color="#fff"
              />
              <Text style={s.captureBtnLabel}>{retracing ? "Stop" : "Retrace"}</Text>
            </TouchableOpacity>
            {Platform.OS !== "web" && (
              <TouchableOpacity
                style={[s.captureBtn, isRecordingVoice && s.captureBtnActive]}
                onPress={isRecordingVoice ? stopVoiceNote : startVoiceNote}
              >
                <Ionicons
                  name={isRecordingVoice ? "stop-circle" : "mic-outline"}
                  size={18}
                  color="#fff"
                />
                <Text style={s.captureBtnLabel}>{isRecordingVoice ? "Stop" : "Voice"}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[s.mainBtn, isRecording ? s.stopBtn : s.startBtn]}
          onPress={isRecording ? stopRecording : startRecording}
        >
          <Ionicons name={isRecording ? "stop-circle-outline" : "radio-button-on-outline"} size={22} color="#fff" />
          <Text style={s.mainBtnLabel}>{isRecording ? "Stop & Save" : "Start Recording"}</Text>
        </TouchableOpacity>
      </View>

      {/* Waypoint Detail Sheet */}
      <Modal
        visible={selectedWaypoint !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedWaypoint(null)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} pointerEvents="box-none" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setSelectedWaypoint(null)} />
        {selectedWaypoint && (() => {
          // Derive live data from state to avoid stale snapshot
          const liveWp = waypoints.find((w) => w.id === selectedWaypoint.id) ?? selectedWaypoint;
          const idx = waypoints.findIndex((w) => w.id === selectedWaypoint.id);
          const total = waypoints.length;
          const label = idx >= 0 ? wpLabel(idx, total) : "Waypoint";
          const d = new Date(liveWp.timestamp);
          const dateStr = d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
          const timeStr = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
          return (
            <View style={[s.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
              <View style={s.sheetHandle} />
              <View style={s.wpDetailHeader}>
                <Text style={[s.sheetTitle, { color: colors.text, marginBottom: 0 }]}>{label}</Text>
                {liveWp.elevationLoading && (
                  <ActivityIndicator size="small" color={colors.primary} />
                )}
              </View>

              <Text style={[s.wpMetaLabel, { color: colors.textMuted, marginBottom: 6 }]}>Name</Text>
              <TextInput
                style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background, marginBottom: 16 }]}
                placeholder={`e.g. Water source, Campsite (default: ${label})`}
                placeholderTextColor={colors.textMuted}
                value={liveWp.name ?? ""}
                onChangeText={(t) => renameWaypoint(liveWp.id, t)}
                returnKeyType="done"
                maxLength={40}
              />

              <Text style={[s.wpMetaLabel, { color: colors.textMuted, marginBottom: 6 }]}>Note</Text>
              <TextInput
                style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background, marginBottom: 16, minHeight: 64, textAlignVertical: "top" }]}
                placeholder="e.g. Soft sand here, great viewpoint (optional)"
                placeholderTextColor={colors.textMuted}
                value={liveWp.note ?? ""}
                onChangeText={(t) => setWaypointNote(liveWp.id, t)}
                multiline
                maxLength={400}
                testID="waypoint-note-input"
              />

              <Text style={[s.wpMetaLabel, { color: colors.textMuted, marginBottom: 8 }]}>Type</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                style={{ marginBottom: 16 }}
                keyboardShouldPersistTaps="handled"
              >
                {WAYPOINT_CATEGORIES.map((c) => {
                  const active = liveWp.category === c.key;
                  return (
                    <TouchableOpacity
                      key={c.key}
                      testID={`waypoint-type-${c.key}`}
                      activeOpacity={0.8}
                      onPress={() => setWaypointCategory(liveWp.id, active ? undefined : c.key)}
                      style={[
                        s.wpCatChip,
                        { borderColor: active ? c.color : colors.border, backgroundColor: active ? c.color : colors.background },
                      ]}
                    >
                      <Ionicons name={c.glyph} size={15} color={active ? "#fff" : c.color} />
                      <Text style={[s.wpCatChipLabel, { color: active ? "#fff" : colors.text }]}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={[s.wpMetaGrid, { borderColor: colors.border }]}>
                <View style={s.wpMetaItem}>
                  <Text style={[s.wpMetaLabel, { color: colors.textMuted }]}>Latitude</Text>
                  <Text style={[s.wpMetaValue, { color: colors.text }]}>{liveWp.lat.toFixed(6)}°</Text>
                </View>
                <View style={s.wpMetaItem}>
                  <Text style={[s.wpMetaLabel, { color: colors.textMuted }]}>Longitude</Text>
                  <Text style={[s.wpMetaValue, { color: colors.text }]}>{liveWp.lng.toFixed(6)}°</Text>
                </View>
                <View style={s.wpMetaItem}>
                  <Text style={[s.wpMetaLabel, { color: colors.textMuted }]}>Elevation</Text>
                  {liveWp.elevationLoading ? (
                    <Text style={[s.wpMetaValue, { color: colors.text }]}>…</Text>
                  ) : liveWp.elevation != null ? (
                    <Text style={[s.wpMetaValue, { color: colors.text }]}>{`${Math.round(liveWp.elevation)} m`}</Text>
                  ) : liveWp.elevationError ? (
                    <TouchableOpacity
                      style={s.wpRetryBtn}
                      onPress={() => retryWaypointElevation(liveWp.id)}
                      testID="waypoint-elevation-retry"
                    >
                      <Ionicons name="refresh" size={13} color={colors.primary} />
                      <Text style={[s.wpRetryLabel, { color: colors.primary }]}>Unavailable · Retry</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={[s.wpMetaValue, { color: colors.text }]}>—</Text>
                  )}
                </View>
                <View style={s.wpMetaItem}>
                  <Text style={[s.wpMetaLabel, { color: colors.textMuted }]}>GPS Altitude</Text>
                  <Text style={[s.wpMetaValue, { color: colors.text }]}>
                    {liveWp.gpsAltitude != null ? `${Math.round(liveWp.gpsAltitude)} m` : "—"}
                  </Text>
                </View>
                <View style={s.wpMetaItem}>
                  <Text style={[s.wpMetaLabel, { color: colors.textMuted }]}>Date</Text>
                  <Text style={[s.wpMetaValue, { color: colors.text }]}>{dateStr}</Text>
                </View>
                <View style={s.wpMetaItem}>
                  <Text style={[s.wpMetaLabel, { color: colors.textMuted }]}>Time</Text>
                  <Text style={[s.wpMetaValue, { color: colors.text }]}>{timeStr}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[s.sheetBtn, { backgroundColor: colors.danger, marginTop: 8 }]}
                onPress={() => { removeWaypoint(selectedWaypoint.id); setSelectedWaypoint(null); }}
              >
                <Ionicons name="trash-outline" size={18} color="#fff" />
                <Text style={s.sheetBtnLabel}>Remove Waypoint</Text>
              </TouchableOpacity>
            </View>
          );
        })()}
        </KeyboardAvoidingView>
      </Modal>

      {/* Save Sheet */}
      <Modal visible={showSaveSheet} transparent animationType="slide" onRequestClose={() => setShowSaveSheet(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowSaveSheet(false)} />
          <View style={[s.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
            <View style={s.sheetHandle} />
            <Text style={[s.sheetTitle, { color: colors.text }]}>Save Trail</Text>

            <View style={[s.summaryRow, { backgroundColor: colors.background }]}>
              <View style={s.summaryItem}>
                <Text style={[s.summaryValue, { color: colors.text }]}>{units.formatDistance(distanceKm * 1000)}</Text>
                <Text style={[s.summaryKey, { color: colors.textMuted }]}>Distance</Text>
              </View>
              <View style={s.summaryItem}>
                <Text style={[s.summaryValue, { color: colors.text }]}>{formatDuration(elapsed)}</Text>
                <Text style={[s.summaryKey, { color: colors.textMuted }]}>Duration</Text>
              </View>
              <View style={s.summaryItem}>
                <Text style={[s.summaryValue, { color: colors.text }]}>{waypoints.length}</Text>
                <Text style={[s.summaryKey, { color: colors.textMuted }]}>Waypoints</Text>
              </View>
            </View>

            <TextInput
              style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Trail name (e.g. Wadi Shawka Loop)"
              placeholderTextColor={colors.textMuted}
              value={trailName}
              onChangeText={setTrailName}
            />

            <TextInput
              style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Location (e.g. Ras Al Khaimah, UAE)"
              placeholderTextColor={colors.textMuted}
              value={trailLocation}
              onChangeText={setTrailLocation}
            />

            <TextInput
              style={[s.input, s.notesInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Notes (trail conditions, highlights…)"
              placeholderTextColor={colors.textMuted}
              value={trailDescription}
              onChangeText={setTrailDescription}
              multiline
            />

            <Text style={[s.sheetLabel, { color: colors.textSecondary }]}>Activity</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
              {ACTIVITY_TYPES.map((at) => {
                const active = at.type === activityType;
                return (
                  <TouchableOpacity
                    key={at.type}
                    style={[s.typeChip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => setActivityType(at.type)}
                  >
                    <Ionicons name={at.icon} size={14} color={active ? "#fff" : colors.textSecondary} />
                    <Text style={[s.typeChipLabel, { color: active ? "#fff" : colors.textSecondary }]}>{at.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {media.length > 0 && (
              <>
                <Text style={[s.sheetLabel, { color: colors.textSecondary }]}>Media ({media.length})</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                  {media.map((m) => (
                    <View key={m.id} style={s.mediaThumb}>
                      {m.mediaType === "photo" ? (
                        <Image source={{ uri: m.uri }} style={s.mediaThumbImg} contentFit="cover" />
                      ) : (
                        <View style={[s.mediaThumbImg, s.mediaAudioThumb]}>
                          <Ionicons name="mic" size={22} color="#fff" />
                        </View>
                      )}
                      <TouchableOpacity style={s.mediaRemove} onPress={() => removeMedia(m.id)}>
                        <Ionicons name="close-circle" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}

            <Text style={[s.sheetLabel, { color: colors.textSecondary }]}>Difficulty: {difficulty}/10</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((d) => {
                const active = d === difficulty;
                const col = d <= 3 ? colors.success : d <= 6 ? colors.warning : colors.danger;
                return (
                  <TouchableOpacity
                    key={d}
                    style={[s.diffChip, active && { backgroundColor: col, borderColor: col }]}
                    onPress={() => setDifficulty(d)}
                  >
                    <Text style={[s.diffChipLabel, { color: active ? "#fff" : colors.textSecondary }]}>{d}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {isAuthenticated && (
              <>
                <Text style={[s.sheetLabel, { color: colors.textSecondary }]}>Visibility</Text>
                <View style={s.visibilityRow}>
                  {(["private", "public"] as const).map((v) => {
                    const active = v === visibility;
                    return (
                      <TouchableOpacity
                        key={v}
                        style={[
                          s.visChip,
                          { borderColor: colors.border },
                          active && { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                        onPress={() => setVisibility(v)}
                      >
                        <Ionicons
                          name={v === "private" ? "lock-closed" : "earth"}
                          size={15}
                          color={active ? "#fff" : colors.textSecondary}
                        />
                        <Text style={[s.visChipLabel, { color: active ? "#fff" : colors.textSecondary }]}>
                          {v === "private" ? "Private" : "Public"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={[s.visHint, { color: colors.textMuted }]}>
                  {visibility === "private"
                    ? "Only you can see this track."
                    : "Shown in Explore. Requires the content agreement."}
                </Text>
              </>
            )}
            {!isAuthenticated && (
              <Text style={[s.visHint, { color: colors.textMuted, marginBottom: 16 }]}>
                Sign in (Account tab) to sync this track and publish it publicly.
              </Text>
            )}

            {waypoints.some((w) => w.elevationError) && (
              <View style={[s.elevWarnBanner, { backgroundColor: colors.warning + "22", borderColor: colors.warning }]}>
                <Ionicons name="warning-outline" size={16} color={colors.warning} />
                <Text style={[s.elevWarnText, { color: colors.text }]}>
                  {(() => {
                    const n = waypoints.filter((w) => w.elevationError).length;
                    return `${n} waypoint${n > 1 ? "s are" : " is"} missing elevation. Tap its pin to retry.`;
                  })()}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.sheetBtn, { backgroundColor: colors.primary }, isSaving && { opacity: 0.6 }]}
              onPress={
                isAuthenticated
                  ? () => { void saveTrail(); }
                  : () => {
                      setShowSaveSheet(false);
                      router.push("/(tabs)/account");
                    }
              }
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons
                    name={isAuthenticated ? "cloud-upload-outline" : "log-in-outline"}
                    size={18}
                    color="#fff"
                  />
                  <Text style={s.sheetBtnLabel}>
                    {isAuthenticated ? "Save to My Trails" : "Sign in to save"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Always-available safety / SOS */}
      <SafetyFab bottom={bottomOffset + (isRecording ? 200 : 80)} />
    </View>
  );
}

function styles(colors: ReturnType<typeof import("@/hooks/useColors").useColors>) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
    permTitle: { fontSize: 20, fontFamily: "Inter_600SemiBold", marginTop: 16, marginBottom: 8 },
    permBody: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
    permButton: { marginTop: 24, paddingHorizontal: 24, paddingVertical: 14, borderRadius: colors.radius },
    permButtonText: { color: colors.onGlass, fontSize: 15, fontFamily: "Inter_600SemiBold" },

    topBar: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    pill: { flexDirection: "row", backgroundColor: colors.mapPanel, borderRadius: colors.radiusPill, overflow: "hidden", alignItems: "center" },
    mapToggleBtn: { paddingHorizontal: 14, paddingVertical: 7 },
    mapToggleBtnActive: { backgroundColor: colors.accent + "33" },
    mapToggleLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.onMapMuted, letterSpacing: 0.5 },
    mapToggleLabelActive: { color: colors.onMap },
    recDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger, marginLeft: 10 },
    recLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.onMap, marginLeft: 5, marginRight: 10 },

    statsBar: {
      position: "absolute", left: 20, right: 20,
      backgroundColor: colors.mapPanelStrong, borderRadius: colors.radius,
      flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 16,
    },
    statItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
    statText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.onMap },
    statDivider: { width: 1, height: 16, backgroundColor: colors.mapPanelBorder },

    bottomPanel: { position: "absolute", left: 0, right: 0, gap: 10 },
    captureRow: { flexDirection: "row", gap: 8 },
    captureBtn: {
      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
      backgroundColor: colors.mapPanelStrong, borderRadius: colors.radius,
      paddingVertical: 13, borderWidth: 1, borderColor: colors.mapPanelBorder,
    },
    captureBtnActive: { backgroundColor: colors.danger + "CC", borderColor: colors.danger },
    retraceBtnActive: { backgroundColor: colors.success + "CC", borderColor: colors.success },
    hudWrap: { position: "absolute", left: 16, right: 16 },
    captureBtnLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.onMap },
    mainBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: colors.radius, paddingVertical: 16 },
    startBtn: { backgroundColor: colors.success },
    stopBtn: { backgroundColor: colors.danger },
    mainBtnLabel: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.onMap },

    overlay: { flex: 1, backgroundColor: colors.scrim },
    sheet: { borderTopLeftRadius: colors.radiusXl, borderTopRightRadius: colors.radiusXl, padding: 20, paddingTop: 12 },
    sheetHandle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
    sheetTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 16 },
    sheetLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 },

    input: { borderWidth: 1, borderRadius: colors.radius, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 14 },
    notesInput: { minHeight: 64, textAlignVertical: "top" },

    mediaThumb: { width: 72, height: 72, borderRadius: colors.radiusSm, marginRight: 8, overflow: "hidden", position: "relative" },
    mediaThumbImg: { width: 72, height: 72, borderRadius: colors.radiusSm },
    mediaAudioThumb: { backgroundColor: colors.mediaAudio, alignItems: "center", justifyContent: "center" },
    mediaRemove: { position: "absolute", top: 2, right: 2, backgroundColor: colors.scrim, borderRadius: colors.radiusPill },

    typeChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: colors.radiusPill, borderWidth: 1, borderColor: colors.border, marginRight: 8 },
    typeChipLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },

    diffChip: { width: 40, height: 40, borderRadius: colors.radiusPill, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, marginRight: 8 },
    diffChipLabel: { fontSize: 14, fontFamily: "Inter_700Bold" },

    summaryRow: { flexDirection: "row", borderRadius: colors.radius, padding: 14, marginBottom: 16 },
    summaryItem: { flex: 1, alignItems: "center" },
    summaryValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
    summaryKey: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },

    sheetBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: colors.radius, paddingVertical: 15 },
    sheetBtnLabel: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.onGlass },

    visibilityRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
    visChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: colors.radius, borderWidth: 1 },
    visChipLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
    visHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 20 },
    elevWarnBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: colors.radius, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12 },
    elevWarnText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },

    planningBanner: {
      position: "absolute", left: 16, right: 16,
      backgroundColor: colors.mapPanelStrong, borderRadius: colors.radius,
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.mapPanelBorder,
      flexDirection: "row", alignItems: "center", gap: 8,
      paddingVertical: 10, paddingHorizontal: 14,
    },
    planningBannerText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", color: colors.onMap },

    wpDetailHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
    wpMetaGrid: {
      borderWidth: 1, borderRadius: colors.radius, overflow: "hidden", marginBottom: 16,
      flexDirection: "row", flexWrap: "wrap",
    },
    wpMetaItem: {
      width: "50%", paddingVertical: 12, paddingHorizontal: 16,
    },
    wpMetaLabel: { fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 0.3, marginBottom: 4 },
    wpMetaValue: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
    wpRetryBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
    wpRetryLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
    wpCatChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5 },
    wpCatChipLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  });
}
