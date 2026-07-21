import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import AdventureMap, {
  type AdventureMapHandle,
  type AdventureBaseLayer,
  type AdventureMarker,
  type AdventurePolyline,
  type LatLng,
  type MapRegion,
  getLayerAttribution,
  planOverlapSelection,
} from "@/components/AdventureMap";
import { RouteOverlapChooser } from "@/components/RouteOverlapChooser";
import {
  WP_CONFIG,
  toWaypointType,
  wpVariant,
  getWaypointCategoryMeta,
} from "@/constants/trailData";
import {
  LayerSwitcher,
  CompassRose,
  MyLocationButton,
} from "@/components/MapControls";
import { GlassPanel, IconButton } from "@/components/cockpit";
import { SafetyFab } from "@/components/SafetyFab";
import { useColors } from "@/hooks/useColors";
import { useUnits } from "@/context/UnitsContext";
import {
  parseCoordinates,
  searchPlaces,
  type PlaceResult,
} from "@/lib/geocode";
import { getApiUrl } from "@/lib/query-client";
import * as haptics from "@/lib/haptics";

const DEFAULT_REGION: MapRegion = {
  latitude: 25.1212,
  longitude: 56.3416, // Hajar Mountains, UAE
  latitudeDelta: 0.6,
  longitudeDelta: 0.6,
};

const HINT_KEY = "map_tap_trail_hint_seen";

interface NearbyTrail {
  id: string;
  name: string;
  location: string | null;
  difficulty: number | null;
  terrain: string | null;
  accentColor: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
  /** Simplified route geometry, drawn faint so the line itself is tappable. */
  trailCoordinates?: LatLng[];
}

interface SelectedTrail {
  id: string;
  name: string;
  accentColor: string;
  trailCoordinates: LatLng[];
  waypoints: {
    id: string;
    name: string;
    type: string;
    coordinate: LatLng;
  }[];
}

function difficultyColor(d: number | null, c: { success: string; warning: string; accent: string; danger: string }): string {
  const v = d ?? 5;
  if (v <= 3) return c.success;
  if (v <= 6) return c.warning;
  if (v <= 8) return c.accent;
  return c.danger;
}

export default function MapScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const units = useUnits();
  const mapRef = useRef<AdventureMapHandle>(null);
  const regionRef = useRef<MapRegion>(DEFAULT_REGION);

  const [baseLayer, setBaseLayer] = useState<AdventureBaseLayer>("satellite");
  const [mapHeading, setMapHeading] = useState(0);
  // Visible latitude span (proxy for zoom). Used to thin out the faint nearby
  // route lines when zoomed far out, where many of them crowd together.
  const [zoomSpan, setZoomSpan] = useState(DEFAULT_REGION.latitudeDelta);
  const [night, setNight] = useState(false);
  const [terrain, setTerrain] = useState(false);

  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [userCourse, setUserCourse] = useState(0);
  const [deviceHeading, setDeviceHeading] = useState(0);
  const [followMode, setFollowMode] = useState<"free" | "follow">("free");
  const followRef = useRef<"free" | "follow">("free");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchPin, setSearchPin] = useState<
    (LatLng & { label: string }) | null
  >(null);

  const [nearby, setNearby] = useState<NearbyTrail[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [panel, setPanel] = useState<"none" | "search" | "nearby">("none");

  // Brief, non-blocking message shown when the nearby-trails fetch fails
  // (offline, server error, flaky connection) so an empty map is never confused
  // with a genuine "no trails here". Mirrors the route-preview error pattern.
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const nearbyErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNearbyError = useCallback((msg: string, autoDismiss = true) => {
    if (nearbyErrorTimer.current) clearTimeout(nearbyErrorTimer.current);
    setNearbyError(msg);
    if (autoDismiss) {
      nearbyErrorTimer.current = setTimeout(() => setNearbyError(null), 4000);
    }
  }, []);
  const nearbyErrorMessage = useCallback(() => {
    const offline =
      Platform.OS === "web" &&
      typeof navigator !== "undefined" &&
      navigator.onLine === false;
    return offline
      ? "You're offline — can't load nearby trails right now."
      : "Couldn't load nearby trails. Tap to retry.";
  }, []);
  useEffect(() => {
    return () => {
      if (nearbyErrorTimer.current) clearTimeout(nearbyErrorTimer.current);
    };
  }, []);

  const [selectedTrail, setSelectedTrail] = useState<SelectedTrail | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  // Brief, non-blocking message shown when a route preview can't load (network
  // failure, server error, or a trail that has no route yet). Auto-dismisses so
  // it never blocks the map.
  const [selectedError, setSelectedError] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSelectError = useCallback((msg: string) => {
    if (errorTimer.current) clearTimeout(errorTimer.current);
    setSelectedError(msg);
    errorTimer.current = setTimeout(() => setSelectedError(null), 4000);
  }, []);
  useEffect(() => {
    return () => {
      if (errorTimer.current) clearTimeout(errorTimer.current);
    };
  }, []);

  // Chooser shown when a tap lands where 2+ nearby route lines overlap, so the
  // user can pick which trail to preview rather than silently getting the
  // nearest. Holds the overlapping trails (sorted nearest-first); null = hidden.
  const [lineChooser, setLineChooser] = useState<NearbyTrail[] | null>(null);

  // One-time coachmark teaching first-time users they can tap a trail on the map.
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(HINT_KEY)
      .then((v) => {
        if (!v) setShowHint(true);
      })
      .catch(() => {});
  }, []);
  const dismissHint = useCallback(() => {
    setShowHint(false);
    AsyncStorage.setItem(HINT_KEY, "1").catch(() => {});
  }, []);

  // ── Live location + heading (native only) ─────────────────────────────────
  useEffect(() => {
    if (Platform.OS === "web") return;
    let posSub: Location.LocationSubscription | null = null;
    let headSub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const first = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coord = {
        latitude: first.coords.latitude,
        longitude: first.coords.longitude,
      };
      setUserLoc(coord);
      mapRef.current?.animateToRegion(
        { ...coord, latitudeDelta: 0.05, longitudeDelta: 0.05 },
        700,
      );

      posSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5 },
        (loc) => {
          const c = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setUserLoc(c);
          if (typeof loc.coords.heading === "number" && loc.coords.heading >= 0) {
            setUserCourse(loc.coords.heading);
          }
          if (followRef.current === "follow") {
            mapRef.current?.animateCamera({ center: c }, 400);
          }
        },
      );

      headSub = await Location.watchHeadingAsync((h) => {
        const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
        if (deg >= 0) setDeviceHeading(deg);
      });
    })();

    return () => {
      posSub?.remove();
      headSub?.remove();
    };
  }, []);

  // ── Debounced place search ────────────────────────────────────────────────
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const coord = parseCoordinates(q);
    if (coord) {
      setResults([
        {
          id: "coord",
          name: `${coord.latitude.toFixed(5)}, ${coord.longitude.toFixed(5)}`,
          detail: "Go to coordinates",
          latitude: coord.latitude,
          longitude: coord.longitude,
        },
      ]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchPlaces(q);
        if (!cancelled) setResults(r);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const flyTo = useCallback((c: LatLng, label: string) => {
    setSearchPin({ ...c, label });
    mapRef.current?.animateToRegion(
      { ...c, latitudeDelta: 0.05, longitudeDelta: 0.05 },
      700,
    );
  }, []);

  const handleSelectResult = (r: PlaceResult) => {
    haptics.selection();
    Keyboard.dismiss();
    flyTo({ latitude: r.latitude, longitude: r.longitude }, r.name);
    setQuery(r.name);
    setPanel("none");
  };

  const setFollow = (m: "free" | "follow") => {
    followRef.current = m;
    setFollowMode(m);
  };

  const handleMyLocation = () => {
    if (!userLoc) {
      haptics.notifyWarning();
      return;
    }
    haptics.tapMedium();
    const next = followMode === "follow" ? "free" : "follow";
    setFollow(next);
    mapRef.current?.animateCamera(
      { center: userLoc, ...(next === "follow" ? { zoom: 15 } : {}) },
      500,
    );
  };

  const handleRealign = () => {
    if (!userLoc) {
      haptics.notifyWarning();
      return;
    }
    haptics.tapMedium();
    setFollow("follow");
    // Leaflet is north-up (no rotation/pitch), so this recenters and zooms
    // onto the user rather than rotating the map to match device heading.
    mapRef.current?.animateCamera({ center: userLoc, zoom: 16 }, 600);
  };

  const handleCompass = () => {
    mapRef.current?.animateCamera({ heading: 0, pitch: 0 }, 400);
  };

  // Latest auto-load fn + a debounce timer, read by handleRegionChange so a pan
  // refreshes the on-map trail pins for the new area without re-creating the
  // region callback on every state change.
  const autoLoadRef = useRef<(center: LatLng) => void>(() => {});
  const autoFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRegionChange = useCallback(async (region: MapRegion) => {
    regionRef.current = region;
    setZoomSpan(region.latitudeDelta);
    const cam = await mapRef.current?.getCamera();
    if (cam) setMapHeading(cam.heading);
    if (autoFetchTimer.current) clearTimeout(autoFetchTimer.current);
    autoFetchTimer.current = setTimeout(() => {
      autoLoadRef.current({ latitude: region.latitude, longitude: region.longitude });
    }, 700);
  }, []);

  const fetchNearby = useCallback(async (center: LatLng) => {
    const url = new URL("/api/trails/nearby", getApiUrl());
    url.searchParams.set("lat", String(center.latitude));
    url.searchParams.set("lon", String(center.longitude));
    url.searchParams.set("radiusKm", "400");
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("not ok");
    const data = await res.json();
    return (data.trails ?? []) as NearbyTrail[];
  }, []);

  // Fetch + populate the nearby list for the current center, surfacing failures
  // through the sheet's error state instead of a misleading empty result. Used by
  // both the explicit Nearby button and the in-sheet retry.
  const refreshNearby = useCallback(async () => {
    const center = userLoc ?? regionRef.current ?? DEFAULT_REGION;
    setNearbyLoading(true);
    setNearbyError(null);
    try {
      setNearby(await fetchNearby(center));
    } catch {
      haptics.notifyWarning();
      showNearbyError(nearbyErrorMessage(), false);
    } finally {
      setNearbyLoading(false);
    }
  }, [userLoc, fetchNearby, showNearbyError, nearbyErrorMessage]);

  const loadNearby = () => {
    haptics.tapLight();
    if (panel === "nearby") {
      setPanel("none");
      return;
    }
    setPanel("nearby");
    refreshNearby();
  };

  // Auto-load nearby trail pins so a route preview is discoverable without ever
  // opening the Nearby sheet. Runs once for the visible area and again whenever
  // the user pans/zooms to a meaningfully different part of the map (debounced
  // by handleRegionChange).
  const lastFetchCenter = useRef<LatLng | null>(null);

  const maybeAutoLoadNearby = useCallback(
    (center: LatLng) => {
      const prev = lastFetchCenter.current;
      const moved =
        !prev ||
        Math.abs(prev.latitude - center.latitude) > 0.15 ||
        Math.abs(prev.longitude - center.longitude) > 0.15;
      if (!moved) return;
      lastFetchCenter.current = center;
      fetchNearby(center)
        .then((trails) => {
          setNearby(trails);
          setNearbyError(null);
        })
        .catch(() => {
          // Don't let a failed area fetch look like an empty area — allow the
          // next pan to retry, and surface a brief, auto-dismissing toast.
          lastFetchCenter.current = null;
          showNearbyError(nearbyErrorMessage(), true);
        });
    },
    [fetchNearby, showNearbyError, nearbyErrorMessage],
  );
  autoLoadRef.current = maybeAutoLoadNearby;

  useEffect(() => {
    maybeAutoLoadNearby(userLoc ?? DEFAULT_REGION);
  }, [userLoc, maybeAutoLoadNearby]);

  useEffect(() => {
    return () => {
      if (autoFetchTimer.current) clearTimeout(autoFetchTimer.current);
    };
  }, []);

  // ── Trail preview: draw a trail's route + planned waypoints on the map ─────
  const lastSelectedId = useRef<string | null>(null);
  const selectTrail = async (id: string) => {
    haptics.selection();
    dismissHint();
    setLineChooser(null);
    lastSelectedId.current = id;
    setSelectedError(null);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    setSelectedLoading(true);
    try {
      const url = new URL(`/api/trails/${id}`, getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("not ok");
      const data = await res.json();
      const t = data.trail;
      const coords: LatLng[] = Array.isArray(t?.trailCoordinates) ? t.trailCoordinates : [];
      const wps = Array.isArray(t?.waypoints) ? t.waypoints : [];
      if (coords.length === 0 && wps.length === 0) {
        setSelectedTrail(null);
        haptics.notifyWarning();
        showSelectError("This trail has no route to preview yet.");
        return;
      }
      setSelectedTrail({
        id: String(t.id),
        name: t.name ?? "Trail",
        accentColor: t.accentColor ?? colors.accent,
        trailCoordinates: coords,
        waypoints: wps.map((w: any) => ({
          id: String(w.id),
          name: w.name ?? "",
          type: typeof w.type === "string" ? w.type : "scenic",
          coordinate: w.coordinate,
        })),
      });
      const fitCoords = coords.length > 0 ? coords : wps.map((w: any) => w.coordinate);
      if (fitCoords.length > 0) {
        mapRef.current?.fitToCoordinates(fitCoords, {
          top: 120,
          right: 60,
          bottom: 200,
          left: 60,
        });
      }
    } catch {
      setSelectedTrail(null);
      haptics.notifyWarning();
      const offline = Platform.OS === "web" && typeof navigator !== "undefined" && navigator.onLine === false;
      showSelectError(
        offline
          ? "You're offline — can't load this route right now."
          : "Couldn't load this trail's route. Tap to try again.",
      );
    } finally {
      setSelectedLoading(false);
    }
  };

  const clearSelectedTrail = () => {
    haptics.tapLight();
    setSelectedTrail(null);
  };

  // Tap landed where several nearby route lines overlap. Map the reported line
  // ids back to their trails; if only one resolves, preview it directly,
  // otherwise open a compact chooser sorted nearest-first.
  const handleLinesPress = (ids: string[]) => {
    // Nearby route lines are drawn with id `nb-line-<trailId>`; resolve the
    // overlapping ids back to their distinct trails, nearest-first, then decide
    // chooser vs. direct preview vs. no-op (shared with any other screen that
    // draws overlapping tappable routes — see planOverlapSelection).
    const intent = planOverlapSelection(
      ids,
      (trailId) => nearby.find((n) => n.id === trailId),
      { prefix: "nb-line-", sort: (a, b) => a.distanceKm - b.distanceKm },
    );
    if (intent.kind === "none") return;
    if (intent.kind === "single") {
      selectTrail(intent.item.id);
      return;
    }
    haptics.selection();
    setLineChooser(intent.items);
  };

  const chooseTrailFromOverlap = (id: string) => {
    setLineChooser(null);
    selectTrail(id);
  };

  // ── Polylines ─────────────────────────────────────────────────────────────
  const polylines: AdventurePolyline[] = [];
  // Faint, dashed route line for nearby trails, so a user can tap the route
  // directly (not just the pin) to preview it. Dense areas can stack many of
  // these on top of one another, so we keep them legible and tappable by:
  //   • capping how many draw (closest N — farther trails still show a pin),
  //     with a tighter cap when zoomed far out where routes crowd together;
  //   • fading by distance rank so overlapping faint lines stay distinguishable;
  //   • drawing farthest → nearest so the closest line (and its wide tap
  //     hit-area) sits on top, making a tap in a cluster preview the nearest
  //     trail rather than whichever line happened to render last.
  // The currently-previewed trail is skipped here — its bright line is pushed
  // last so it sits on top of everything.
  const routeCap = zoomSpan > 1.2 ? 6 : zoomSpan > 0.4 ? 10 : 16;
  const routeTrails = nearby
    .filter(
      (t) =>
        t.id !== selectedTrail?.id &&
        !!t.trailCoordinates &&
        t.trailCoordinates.length >= 2,
    )
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, routeCap);
  for (let i = routeTrails.length - 1; i >= 0; i--) {
    const t = routeTrails[i];
    // rank: 0 = nearest, 1 = farthest drawn. Nearest stays boldest.
    const rank = routeTrails.length > 1 ? i / (routeTrails.length - 1) : 0;
    polylines.push({
      id: `nb-line-${t.id}`,
      coordinates: t.trailCoordinates!,
      color: t.accentColor ?? colors.accent,
      width: 2.5,
      dashed: true,
      opacity: 0.85 - rank * 0.55,
      // chooser: when a tap overlaps 2+ of these faint nearby routes, the map
      // reports all of them via onLinesPress so the user can pick one rather
      // than silently getting the nearest.
      chooser: true,
      onPress: () => selectTrail(t.id),
    });
  }
  if (selectedTrail && selectedTrail.trailCoordinates.length > 1) {
    polylines.push({
      id: `trail-${selectedTrail.id}`,
      coordinates: selectedTrail.trailCoordinates,
      color: selectedTrail.accentColor,
      width: 4,
      // Tap the drawn route to dismiss the preview (toggle off).
      onPress: clearSelectedTrail,
    });
  }

  // ── Markers ───────────────────────────────────────────────────────────────
  const markers: AdventureMarker[] = [];
  if (userLoc) {
    markers.push({
      id: "user",
      coordinate: userLoc,
      anchor: { x: 0.5, y: 0.5 },
      rotation: userCourse,
      zIndex: 20,
      icon: { kind: "puck", color: colors.primary },
    });
  }
  if (searchPin) {
    markers.push({
      id: "search-pin",
      coordinate: { latitude: searchPin.latitude, longitude: searchPin.longitude },
      anchor: { x: 0.5, y: 1 },
      zIndex: 15,
      icon: { kind: "badge", color: colors.accent, glyph: "flag" },
    });
  }
  // Nearby trail pins stay on the map even when the Nearby sheet is closed, so a
  // route preview is one tap away without opening any panel.
  nearby.forEach((t) => {
    // Hide the nearby pin for a trail that's currently previewed — its own
    // start waypoint / route stand in for it.
    if (selectedTrail?.id === t.id) return;
    markers.push({
      id: `nb-${t.id}`,
      coordinate: { latitude: t.latitude, longitude: t.longitude },
      anchor: { x: 0.5, y: 0.5 },
      onPress: () => {
        selectTrail(t.id);
      },
      icon: { kind: "badge", color: difficultyColor(t.difficulty, colors), glyph: "car-sport" },
    });
  });
  // Planned waypoints for the previewed trail — same wpVariant/MarkerIcon
  // logic as the trail detail screen (start flag, numbered diamonds, end flag)
  // so a planned route looks identical everywhere.
  if (selectedTrail) {
    const total = selectedTrail.waypoints.length;
    selectedTrail.waypoints.forEach((wp, idx) => {
      if (!wp.coordinate) return;
      const t = toWaypointType(wp.type);
      const cfg = WP_CONFIG[t];
      // wp.type is the raw stored string here, so a recognised category
      // (water/camp/hazard/viewpoint/fuel) renders a coloured glyph pin; legacy
      // types keep the numbered diamond / start-end flag.
      const catMeta = getWaypointCategoryMeta(wp.type);
      markers.push({
        id: `wp-${selectedTrail.id}-${wp.id}`,
        coordinate: wp.coordinate,
        anchor: { x: 0.5, y: 0.5 },
        zIndex: 12,
        onPress: () => router.push(`/trail/${selectedTrail.id}` as any),
        icon: {
          kind: "waypoint",
          color: catMeta ? catMeta.color : cfg.color,
          ...(catMeta ? { glyph: catMeta.glyph } : {}),
          variant: wpVariant(idx, total, t),
          waypointNumber: idx + 1,
          label: wp.name,
        },
      });
    });
  }

  const attribution = getLayerAttribution(baseLayer);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AdventureMap
        ref={mapRef}
        baseLayer={baseLayer}
        night={night}
        terrain={terrain}
        initialRegion={DEFAULT_REGION}
        markers={markers}
        polylines={polylines}
        rotateEnabled
        pitchEnabled
        onRegionChangeComplete={handleRegionChange}
        onLinesPress={handleLinesPress}
        onPress={() => {
          Keyboard.dismiss();
          if (lineChooser) setLineChooser(null);
          if (panel === "search") setPanel("none");
        }}
      />

      {/* ── Top: back + search bar ── */}
      <View style={{ position: "absolute", top: insets.top + 8, left: 14, right: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <IconButton icon="arrow-back" surface="map" onPress={() => router.back()} accessibilityLabel="Go back" />
          <View style={{ flex: 1 }}>
            <GlassPanel surface="map" radius={colors.radiusPill} intensity={36}>
              <View style={styles.searchRow}>
                <Ionicons name="search" size={18} color={colors.onMapMuted} />
                <TextInput
                  testID="map-search-input"
                  value={query}
                  onChangeText={(t) => {
                    setQuery(t);
                    setPanel("search");
                  }}
                  onFocus={() => setPanel("search")}
                  placeholder="Search place or coordinates"
                  placeholderTextColor={colors.onMapMuted}
                  style={[styles.searchInput, { color: colors.onMap }]}
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {query.length > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      setQuery("");
                      setResults([]);
                      setSearchPin(null);
                    }}
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={18} color={colors.onMapMuted} />
                  </TouchableOpacity>
                )}
              </View>
            </GlassPanel>
          </View>
        </View>

        {/* ── Search results dropdown ── */}
        {panel === "search" && (results.length > 0 || searching) && (
          <View style={{ marginTop: 8, marginLeft: 52 }}>
            <GlassPanel surface="map" radius={colors.radiusLg} intensity={40}>
              {searching && results.length === 0 ? (
                <View style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <ActivityIndicator color={colors.onMap} />
                  <Text style={{ color: colors.onMapMuted, fontFamily: "Inter_500Medium", fontSize: 13 }}>
                    Searching…
                  </Text>
                </View>
              ) : (
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  style={{ maxHeight: 260 }}
                  showsVerticalScrollIndicator={false}
                >
                  {results.map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      testID={`search-result-${r.id}`}
                      activeOpacity={0.75}
                      onPress={() => handleSelectResult(r)}
                      style={styles.resultRow}
                    >
                      <Ionicons
                        name={r.id === "coord" ? "pin" : "location"}
                        size={17}
                        color={colors.accent}
                      />
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ color: colors.onMap, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                          {r.name}
                        </Text>
                        {!!r.detail && (
                          <Text numberOfLines={1} style={{ color: colors.onMapMuted, fontFamily: "Inter_400Regular", fontSize: 12 }}>
                            {r.detail}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </GlassPanel>
          </View>
        )}
      </View>

      {/* ── Right control column ── */}
      <View style={{ position: "absolute", right: 14, top: insets.top + 70, alignItems: "flex-end", gap: 12 }}>
        <LayerSwitcher value={baseLayer} onChange={setBaseLayer} />
        <CompassRose heading={mapHeading} onPress={handleCompass} />
        <IconButton
          icon={night ? "moon" : "moon-outline"}
          surface="map"
          active={night}
          onPress={() => setNight((v) => !v)}
          accessibilityLabel="Toggle night mode"
          testID="night-toggle"
        />
        <IconButton
          icon={terrain ? "triangle" : "triangle-outline"}
          surface="map"
          active={terrain}
          onPress={() => setTerrain((v) => !v)}
          accessibilityLabel="Toggle 3D terrain"
          testID="terrain-toggle"
        />
        <IconButton
          icon="cloud-download-outline"
          surface="map"
          onPress={() =>
            router.push({
              pathname: "/offline-maps",
              params: {
                lat: String(regionRef.current.latitude),
                lon: String(regionRef.current.longitude),
                latDelta: String(regionRef.current.latitudeDelta),
                lonDelta: String(regionRef.current.longitudeDelta),
                baseLayer,
              },
            })
          }
          accessibilityLabel="Offline maps"
        />
      </View>

      {/* ── Bottom-right: realign + my-location ── */}
      <View style={{ position: "absolute", right: 14, bottom: insets.bottom + (panel === "nearby" ? 250 : 28), gap: 12, alignItems: "flex-end" }}>
        <IconButton
          icon="compass"
          surface="map"
          onPress={handleRealign}
          accessibilityLabel="Recenter on your location"
          testID="realign-button"
        />
        <MyLocationButton mode={followMode} onPress={handleMyLocation} disabled={!userLoc} />
      </View>

      {/* ── Bottom-left: nearby toggle ── */}
      <View style={{ position: "absolute", left: 14, bottom: insets.bottom + (panel === "nearby" ? 250 : 28) }}>
        <TouchableOpacity activeOpacity={0.85} onPress={loadNearby} testID="nearby-button">
          <GlassPanel surface="map" radius={colors.radiusPill} intensity={36}>
            <View style={styles.nearbyBtn}>
              <Ionicons name="compass-outline" size={17} color={panel === "nearby" ? colors.accent : colors.onMap} />
              <Text style={{ color: panel === "nearby" ? colors.accent : colors.onMap, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
                Nearby
              </Text>
            </View>
          </GlassPanel>
        </TouchableOpacity>
      </View>

      {/* ── First-run hint: tap a trail on the map to preview it ── */}
      {showHint && !selectedTrail && nearby.length > 0 && (
        <View
          style={{
            position: "absolute",
            left: 14,
            right: 14,
            alignItems: "center",
            bottom: insets.bottom + (panel === "nearby" ? 318 : 92),
          }}
          pointerEvents="box-none"
        >
          <View style={{ maxWidth: 360, width: "100%" }}>
            <GlassPanel surface="map" radius={colors.radiusPill} intensity={44}>
              <View style={styles.selectedBanner}>
                <Ionicons name="hand-left-outline" size={18} color={colors.accent} />
                <Text style={{ flex: 1, color: colors.onMap, fontFamily: "Inter_500Medium", fontSize: 12 }}>
                  Tap a trail on the map to preview its route
                </Text>
                <TouchableOpacity onPress={dismissHint} hitSlop={10} testID="dismiss-map-hint">
                  <Ionicons name="close-circle" size={22} color={colors.onMapMuted} />
                </TouchableOpacity>
              </View>
            </GlassPanel>
          </View>
        </View>
      )}

      {/* ── Attribution ── */}
      {attribution && (
        <View style={{ position: "absolute", bottom: insets.bottom + 4, left: 0, right: 0, alignItems: "center" }}>
          <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular", color: colors.onMapMuted }}>
            {attribution}
          </Text>
        </View>
      )}

      {/* ── Selected trail preview banner ── */}
      {selectedTrail && (
        <View
          style={{
            position: "absolute",
            left: 14,
            right: 14,
            alignItems: "center",
            bottom: insets.bottom + (panel === "nearby" ? 318 : 92),
          }}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            activeOpacity={0.9}
            testID="selected-trail-banner"
            onPress={() => router.push(`/trail/${selectedTrail.id}` as any)}
            style={{ maxWidth: 360, width: "100%" }}
          >
            <GlassPanel surface="map" radius={colors.radiusPill} intensity={44}>
              <View style={styles.selectedBanner}>
                <View style={[styles.selectedAccent, { backgroundColor: selectedTrail.accentColor }]} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: colors.onMap, fontFamily: "Inter_700Bold", fontSize: 14 }}>
                    {selectedTrail.name}
                  </Text>
                  <Text style={{ color: colors.onMapMuted, fontFamily: "Inter_500Medium", fontSize: 11 }}>
                    {selectedTrail.waypoints.length} waypoint{selectedTrail.waypoints.length === 1 ? "" : "s"} · tap for details
                  </Text>
                </View>
                <TouchableOpacity onPress={clearSelectedTrail} hitSlop={10} testID="clear-selected-trail">
                  <Ionicons name="close-circle" size={22} color={colors.onMapMuted} />
                </TouchableOpacity>
              </View>
            </GlassPanel>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Overlapping-route chooser ── */}
      {lineChooser && lineChooser.length > 1 && (
        <RouteOverlapChooser
          title={`${lineChooser.length} trails here`}
          containerStyle={{
            position: "absolute",
            left: 14,
            right: 14,
            alignItems: "center",
            bottom: insets.bottom + (panel === "nearby" ? 318 : 92),
          }}
          choices={lineChooser.map((t) => ({
            id: t.id,
            name: t.name,
            accentColor: t.accentColor ?? colors.accent,
            dotColor: difficultyColor(t.difficulty, colors),
            subtitle:
              `${units.formatDistance(t.distanceKm * 1000) ?? `${t.distanceKm.toFixed(0)} km`} away` +
              (t.location ? ` · ${t.location}` : ""),
          }))}
          onPick={chooseTrailFromOverlap}
          onDismiss={() => setLineChooser(null)}
        />
      )}

      {/* ── Trail preview loading indicator ── */}
      {selectedLoading && !selectedTrail && (
        <View style={{ position: "absolute", left: 0, right: 0, top: insets.top + 70, alignItems: "center" }} pointerEvents="none">
          <GlassPanel surface="map" radius={colors.radiusPill} intensity={40}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
              <ActivityIndicator color={colors.onMap} />
              <Text style={{ color: colors.onMap, fontFamily: "Inter_500Medium", fontSize: 12 }}>Loading route…</Text>
            </View>
          </GlassPanel>
        </View>
      )}

      {/* ── Trail preview error toast (non-blocking, auto-dismisses) ── */}
      {selectedError && !selectedLoading && !selectedTrail && (
        <View style={{ position: "absolute", left: 14, right: 14, top: insets.top + 70, alignItems: "center" }} pointerEvents="box-none">
          <TouchableOpacity
            activeOpacity={0.9}
            testID="selected-trail-error"
            onPress={() => {
              const id = lastSelectedId.current;
              if (id) selectTrail(id);
            }}
            style={{ maxWidth: 360, width: "100%" }}
          >
            <GlassPanel surface="map" radius={colors.radiusPill} intensity={44}>
              <View style={styles.selectedBanner}>
                <Ionicons name="alert-circle" size={18} color={colors.warning} />
                <Text style={{ flex: 1, color: colors.onMap, fontFamily: "Inter_500Medium", fontSize: 12 }}>
                  {selectedError}
                </Text>
                <TouchableOpacity onPress={() => setSelectedError(null)} hitSlop={10} testID="dismiss-selected-trail-error">
                  <Ionicons name="close-circle" size={22} color={colors.onMapMuted} />
                </TouchableOpacity>
              </View>
            </GlassPanel>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Nearby auto-load error toast (only when the sheet is closed) ── */}
      {nearbyError && panel !== "nearby" && !selectedTrail && (
        <View
          style={{
            position: "absolute",
            left: 14,
            right: 14,
            alignItems: "center",
            bottom: insets.bottom + 92,
          }}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            activeOpacity={0.9}
            testID="nearby-error-toast"
            onPress={() => {
              lastFetchCenter.current = null;
              maybeAutoLoadNearby(userLoc ?? regionRef.current ?? DEFAULT_REGION);
            }}
            style={{ maxWidth: 360, width: "100%" }}
          >
            <GlassPanel surface="map" radius={colors.radiusPill} intensity={44}>
              <View style={styles.selectedBanner}>
                <Ionicons name="alert-circle" size={18} color={colors.warning} />
                <Text style={{ flex: 1, color: colors.onMap, fontFamily: "Inter_500Medium", fontSize: 12 }}>
                  {nearbyError}
                </Text>
                <TouchableOpacity onPress={() => setNearbyError(null)} hitSlop={10} testID="dismiss-nearby-error-toast">
                  <Ionicons name="close-circle" size={22} color={colors.onMapMuted} />
                </TouchableOpacity>
              </View>
            </GlassPanel>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Always-available safety / SOS ── */}
      <SafetyFab
        location={userLoc}
        heading={deviceHeading}
        landmarks={nearby.map((t) => ({
          name: t.name,
          coordinate: { latitude: t.latitude, longitude: t.longitude },
        }))}
        bottom={insets.bottom + (panel === "nearby" ? 250 : 28)}
        right={70}
      />

      {/* ── Nearby results sheet ── */}
      {panel === "nearby" && (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
          <GlassPanel surface="map" radius={0} intensity={50} bordered={false}>
            <View style={{ paddingTop: 12, paddingBottom: insets.bottom + 12 }}>
              <View style={styles.sheetHead}>
                <Text style={{ color: colors.onMap, fontFamily: "Inter_700Bold", fontSize: 15 }}>
                  Trails near you
                </Text>
                <TouchableOpacity onPress={() => setPanel("none")} hitSlop={8}>
                  <Ionicons name="close" size={20} color={colors.onMapMuted} />
                </TouchableOpacity>
              </View>
              {nearbyLoading ? (
                <View style={{ padding: 24, alignItems: "center" }}>
                  <ActivityIndicator color={colors.onMap} />
                </View>
              ) : nearbyError && nearby.length === 0 ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  testID="nearby-error"
                  onPress={refreshNearby}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 16 }}
                >
                  <Ionicons name="alert-circle" size={20} color={colors.warning} />
                  <Text style={{ flex: 1, color: colors.onMap, fontFamily: "Inter_500Medium", fontSize: 13 }}>
                    {nearbyError}
                  </Text>
                  <Ionicons name="refresh" size={18} color={colors.accent} />
                </TouchableOpacity>
              ) : nearby.length === 0 ? (
                <Text style={{ color: colors.onMapMuted, fontFamily: "Inter_400Regular", fontSize: 13, paddingHorizontal: 16, paddingVertical: 16 }}>
                  No trails found nearby.
                </Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 12, gap: 10 }}
                >
                  {nearby.map((t) => (
                    <TouchableOpacity
                      key={t.id}
                      activeOpacity={0.85}
                      testID={`nearby-card-${t.id}`}
                      onPress={() => router.push(`/trail/${t.id}` as any)}
                      onLongPress={() => selectTrail(t.id)}
                      style={[styles.nearbyCard, { backgroundColor: colors.mapPanel, borderRadius: colors.radius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.mapPanelBorder }]}
                    >
                      <View style={[styles.nearbyAccent, { backgroundColor: t.accentColor ?? colors.accent }]} />
                      <Text numberOfLines={1} style={{ color: colors.onMap, fontFamily: "Inter_700Bold", fontSize: 14 }}>
                        {t.name}
                      </Text>
                      <Text numberOfLines={1} style={{ color: colors.onMapMuted, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 }}>
                        {t.location ?? t.terrain ?? ""}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
                        <View style={[styles.diffDot, { backgroundColor: difficultyColor(t.difficulty, colors) }]} />
                        <Text style={{ color: colors.onMapMuted, fontFamily: "Inter_500Medium", fontSize: 11 }}>
                          {units.formatDistance(t.distanceKm * 1000) ?? `${t.distanceKm.toFixed(0)} km`} away
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </GlassPanel>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 11 : 6,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    padding: 0,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  searchPin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  nearbyPin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  nearbyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  nearbyCard: {
    width: 180,
    padding: 12,
    borderRadius: 14,
    overflow: "hidden",
  },
  nearbyAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  diffDot: { width: 8, height: 8, borderRadius: 4 },
  selectedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 10,
  },
  selectedAccent: { width: 4, height: 32, borderRadius: 2 },
});
