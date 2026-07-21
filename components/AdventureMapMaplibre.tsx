import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, View, Text, type NativeSyntheticEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MLMap,
  Marker,
  UserLocation,
  type Anchor,
  type CameraRef,
  type MapRef,
  type PressEvent,
  type PressEventWithFeatures,
  type StyleSpecification,
  type ViewStateChangeEvent,
} from "@maplibre/maplibre-react-native";
import { buildMapStyle } from "@/constants/mapStyle";
import {
  chooserIdsFromFeatures,
  maplibreCameraStop,
  maplibreChooserQuery,
  terrainCameraPitch,
  type AdventureMapHandle,
  type AdventureMapProps,
  type AdventureMarker,
  type AdventurePolyline,
  type LatLng,
  type MapRegion,
} from "./adventureMapShared";

/* ──────────────────────────────────────────────────────────────────────────
 *  AdventureMapMaplibre (custom-build engine)
 *  GPU vector engine implementing the SAME public API as the Leaflet engine.
 *  Adds true rotation/pitch, branded topo/night styles, hillshade (slope
 *  shading) and 3D terrain. This module imports the native MapLibre module at
 *  the top level, so it MUST only ever be required when the native module is
 *  present (custom build) — AdventureMap.tsx gates that. It is never required
 *  in Expo Go, which keeps the WebView/Leaflet fallback crash-free.
 * ────────────────────────────────────────────────────────────────────────── */

type Bounds = [west: number, south: number, east: number, north: number];

function regionToBounds(r: MapRegion): Bounds {
  const dLat = Math.max(r.latitudeDelta, 0.0008) / 2;
  const dLng = Math.max(r.longitudeDelta, 0.0008) / 2;
  return [r.longitude - dLng, r.latitude - dLat, r.longitude + dLng, r.latitude + dLat];
}

function coordsToBounds(coords: LatLng[]): Bounds {
  let w = 180,
    s = 90,
    e = -180,
    n = -90;
  coords.forEach((c) => {
    if (c.longitude < w) w = c.longitude;
    if (c.longitude > e) e = c.longitude;
    if (c.latitude < s) s = c.latitude;
    if (c.latitude > n) n = c.latitude;
  });
  return [w, s, e, n];
}

function zoomForDelta(latitudeDelta: number): number {
  const d = Math.max(latitudeDelta, 0.0008);
  return Math.min(18, Math.max(2, Math.log2(360 / d)));
}

function markerAnchor(m: AdventureMarker): Anchor {
  if (m.anchor && m.anchor.y >= 0.9) return "bottom";
  return "center";
}

/* ── Waypoint SVG-equivalent (React Native views) ── */
function WaypointMarkerContent({ icon }: { icon: NonNullable<AdventureMarker["icon"]> }) {
  const opacity = icon.loading ? 0.55 : 1;
  const variant = icon.variant ?? "start";
  const errorDot = icon.error ? <View style={mstyles.wpErrorDot} /> : null;

  if (variant === "start" || variant === "end") {
    const flagColor = variant === "start" ? "#27AE60" : "#E74C3C";
    const label = variant === "start" ? "S" : "E";
    return (
      <View style={[mstyles.wpFlagWrap, { opacity }]}>
        <View style={[mstyles.wpFlagPole, { backgroundColor: flagColor }]} />
        <View style={[mstyles.wpFlagBanner, { backgroundColor: flagColor }]}>
          <Text style={mstyles.wpFlagLabel}>{label}</Text>
        </View>
        {errorDot}
      </View>
    );
  }

  // "regular" — diamond with number
  const color = icon.color || "#D4763B";
  const num = icon.waypointNumber ?? 1;
  return (
    <View style={[mstyles.wpDiamondWrap, { opacity }]}>
      <View style={[mstyles.wpDiamond, { backgroundColor: color, transform: [{ rotate: "45deg" }] }]} />
      <Text style={mstyles.wpDiamondNum}>{num > 9 ? "•" : String(num)}</Text>
      {errorDot}
    </View>
  );
}

/* ── Marker visuals (RN views, rendered inside MapLibre Marker annotations) ── */
function MarkerContent({ marker }: { marker: AdventureMarker }) {
  const icon = marker.icon;
  const rotation = `${marker.rotation ?? 0}deg`;

  if (!icon) {
    return (
      <View
        style={[
          mstyles.defaultPin,
          { backgroundColor: marker.pinColor ?? "#D4763B" },
        ]}
      />
    );
  }

  if (icon.kind === "puck") {
    const color = icon.color || "#D4763B";
    return (
      <View style={[mstyles.puck, { transform: [{ rotate: rotation }] }]}>
        <View style={[mstyles.puckHalo, { backgroundColor: `${color}40` }]} />
        <View style={[mstyles.puckBeam, { borderBottomColor: color }]} />
        <View style={[mstyles.puckDot, { backgroundColor: color }]} />
      </View>
    );
  }

  if (icon.kind === "waypoint") {
    return <WaypointMarkerContent icon={icon} />;
  }

  const size = icon.emphasized ? 44 : 32;
  const glyphSize = icon.emphasized ? 20 : 15;
  const color = icon.color || "#D4763B";
  const showLabel = !!(icon.label && (icon.emphasized || icon.showLabel));
  return (
    <View style={mstyles.badgeWrap}>
      <View
        style={[
          mstyles.badge,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        ]}
      >
        {icon.glyph ? (
          <Ionicons name={icon.glyph as never} size={glyphSize} color="#fff" />
        ) : null}
      </View>
      {showLabel ? (
        <View style={[mstyles.badgeLabel, { backgroundColor: color }]}>
          <Text style={mstyles.badgeLabelText}>{icon.label}</Text>
        </View>
      ) : null}
    </View>
  );
}

const AdventureMapMaplibre = forwardRef<AdventureMapHandle, AdventureMapProps>(
  (
    {
      style,
      initialRegion,
      baseLayer = "satellite",
      showsUserLocation = false,
      followsUserLocation = false,
      night = false,
      terrain = false,
      polylines = [],
      markers = [],
      waypointMode = false,
      onMapReady,
      onPress,
      onRegionChangeComplete,
      onWaypointDrop,
      onLinesPress,
    },
    ref,
  ) => {
    const mapRef = useRef<MapRef>(null);
    const cameraRef = useRef<CameraRef>(null);
    const [styleReady, setStyleReady] = useState(false);

    const mapStyle = useMemo(
      () =>
        buildMapStyle({ baseLayer, hillshade: true, terrain, night }) as unknown as StyleSpecification,
      [baseLayer, terrain, night],
    );

    const initialView = useMemo(() => {
      const r = initialRegion;
      if (!r) return undefined;
      return {
        center: [r.longitude, r.latitude] as [number, number],
        zoom: zoomForDelta(r.latitudeDelta),
      };
    }, [initialRegion]);

    useImperativeHandle(
      ref,
      () => ({
        animateToRegion: (region, duration = 600) =>
          cameraRef.current?.setStop({ bounds: regionToBounds(region), duration }),
        animateCamera: (camera, duration = 600) => {
          cameraRef.current?.setStop(maplibreCameraStop(camera, duration));
        },
        fitToCoordinates: (coords, padding) => {
          if (!coords.length) return;
          cameraRef.current?.setStop({
            bounds: coordsToBounds(coords),
            padding: padding ?? { top: 80, right: 60, bottom: 220, left: 60 },
            duration: 600,
          });
        },
        getCamera: async () => {
          try {
            const m = mapRef.current;
            if (!m) return null;
            const [center, zoom, bearing] = await Promise.all([
              m.getCenter(),
              m.getZoom(),
              m.getBearing(),
            ]);
            return {
              heading: bearing,
              zoom,
              center: { latitude: center[1], longitude: center[0] },
            };
          } catch {
            return null;
          }
        },
      }),
      [],
    );

    // Stable refs so the per-line press handler can read the latest polylines
    // and chooser callback without re-creating every GeoJSONSource onPress.
    const polylinesRef = useRef(polylines);
    useEffect(() => {
      polylinesRef.current = polylines;
    }, [polylines]);
    const onLinesPressRef = useRef(onLinesPress);
    useEffect(() => {
      onLinesPressRef.current = onLinesPress;
    }, [onLinesPress]);

    // Tap on a route line. When the line is chooser-eligible, query the rendered
    // line layers at the tap point to find any others overlapping it and, if 2+
    // overlap, offer the chooser. Otherwise fire the single line's onPress.
    const handleLinePress = useCallback(
      async (
        p: AdventurePolyline,
        e: NativeSyntheticEvent<PressEventWithFeatures>,
      ) => {
        e.stopPropagation?.();
        if (p.chooser && onLinesPressRef.current && mapRef.current) {
          try {
            const pt = e.nativeEvent?.point;
            if (pt) {
              const chooserLines = polylinesRef.current.filter((x) => x.chooser);
              // A single-pixel query only catches lines that physically overlap
              // at the exact tap pixel, so the chooser would almost never open on
              // thin routes. Query a box the size of the SAME tap tolerance the
              // Leaflet engine uses (its invisible hit-area radius) so overlap is
              // detected identically on both engines. The box + layer math lives
              // in adventureMapShared (next to lineHitRadiusPx) so the two
              // engines' tolerances can never silently drift apart.
              const { bbox, layers } = maplibreChooserQuery(
                [pt[0], pt[1]],
                chooserLines,
              );
              const feats = await mapRef.current.queryRenderedFeatures(bbox, {
                layers,
              });
              const ids = chooserIdsFromFeatures(feats);
              if (ids.length > 1) {
                onLinesPressRef.current(ids);
                return;
              }
            }
          } catch {
            // Fall through to single-line selection on any query failure.
          }
        }
        p.onPress?.();
      },
      [],
    );

    const handlePress = useCallback(
      (e: NativeSyntheticEvent<PressEvent> | NativeSyntheticEvent<PressEventWithFeatures>) => {
        const { lngLat } = e.nativeEvent;
        if (!lngLat) return;
        const coord = { latitude: lngLat[1], longitude: lngLat[0] };
        if (waypointMode) {
          onWaypointDrop?.(coord);
        } else {
          onPress?.(coord);
        }
      },
      [waypointMode, onWaypointDrop, onPress],
    );

    const handleRegion = useCallback(
      (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
        const vs = e.nativeEvent;
        if (!vs?.center || !vs?.bounds) return;
        const [w, s, east, n] = vs.bounds;
        onRegionChangeComplete?.({
          latitude: vs.center[1],
          longitude: vs.center[0],
          latitudeDelta: Math.abs(n - s),
          longitudeDelta: Math.abs(east - w),
        });
      },
      [onRegionChangeComplete],
    );

    const handleLoaded = useCallback(() => {
      setStyleReady(true);
      onMapReady?.();
    }, [onMapReady]);

    // Tilt the camera into a 3D view when terrain is enabled, and flatten back
    // to top-down (north-up stays untouched) when it is turned off.
    useEffect(() => {
      if (!styleReady) return;
      cameraRef.current?.setStop({ pitch: terrainCameraPitch(terrain), duration: 500 });
    }, [styleReady, terrain]);

    return (
      <View style={[styles.fill, style]}>
        <MLMap
          ref={mapRef}
          style={styles.fill}
          mapStyle={mapStyle}
          onPress={handlePress}
          onRegionDidChange={handleRegion}
          onDidFinishLoadingMap={handleLoaded}
        >
          <Camera
            ref={cameraRef}
            initialViewState={initialView}
            trackUserLocation={followsUserLocation ? "default" : undefined}
          />

          {showsUserLocation ? <UserLocation animated heading /> : null}

          {styleReady &&
            polylines.map((p) =>
              p.coordinates.length >= 2 ? (
                <GeoJSONSource
                  key={p.id}
                  id={`line-src-${p.id}`}
                  data={{
                    type: "Feature",
                    // lineId lets queryRenderedFeatures map a rendered line back
                    // to its polyline id when detecting overlapping routes.
                    properties: { lineId: p.id },
                    geometry: {
                      type: "LineString",
                      coordinates: p.coordinates.map((c) => [c.longitude, c.latitude]),
                    },
                  }}
                  // Tap the drawn route line (e.g. to dismiss the preview, or to
                  // pick from overlapping routes). Mirrors the Leaflet engines'
                  // `linePress` bridge so behaviour is identical across all three
                  // rendering paths. stopPropagation keeps the map's general
                  // onPress from also firing.
                  onPress={p.onPress ? (e) => handleLinePress(p, e) : undefined}
                >
                  {/* Contrasting casing drawn beneath the visible line (added
                      first so it renders below) so a blue route stays
                      distinguishable when it overlaps a similarly-blue trail. */}
                  {p.outlineColor ? (
                    <Layer
                      id={`line-casing-${p.id}`}
                      type="line"
                      source={`line-src-${p.id}`}
                      layout={{ "line-cap": p.lineCap ?? "round", "line-join": "round" }}
                      paint={{
                        "line-color": p.outlineColor,
                        "line-width": (p.width ?? 4) + 4,
                        ...(p.dashed ? { "line-dasharray": [2, 1.5] } : {}),
                      }}
                    />
                  ) : null}
                  <Layer
                    id={`line-${p.id}`}
                    type="line"
                    source={`line-src-${p.id}`}
                    layout={{ "line-cap": p.lineCap ?? "round", "line-join": "round" }}
                    paint={{
                      "line-color": p.color,
                      "line-width": p.width ?? 4,
                      "line-opacity": p.opacity ?? 1,
                      ...(p.dashed ? { "line-dasharray": [2, 1.5] } : {}),
                    }}
                  />
                </GeoJSONSource>
              ) : null,
            )}

          {markers.map((m) => (
            <Marker
              key={m.id}
              id={m.id}
              lngLat={[m.coordinate.longitude, m.coordinate.latitude]}
              anchor={markerAnchor(m)}
              onPress={m.onPress ? () => m.onPress?.() : undefined}
            >
              <MarkerContent marker={m} />
            </Marker>
          ))}
        </MLMap>
      </View>
    );
  },
);

AdventureMapMaplibre.displayName = "AdventureMapMaplibre";

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
});

const mstyles = StyleSheet.create({
  defaultPin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2.5,
    borderColor: "#fff",
  },
  puck: { width: 44, height: 44 },
  puckHalo: { position: "absolute", inset: 0, borderRadius: 22 },
  puckBeam: {
    position: "absolute",
    top: 1,
    left: 14,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 14,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  puckDot: {
    position: "absolute",
    top: 14,
    left: 14,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: "#fff",
  },
  badgeWrap: { alignItems: "center" },
  badge: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#fff",
  },
  badgeLabel: {
    marginTop: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
  },
  badgeLabelText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 11 },

  // Waypoint marker shapes
  wpFlagWrap: { width: 24, height: 32, alignItems: "flex-start" },
  wpFlagPole: { position: "absolute", left: 2, top: 0, width: 2, height: 32, borderRadius: 1 },
  wpFlagBanner: {
    position: "absolute", left: 4, top: 2,
    width: 16, height: 11, borderRadius: 2,
    alignItems: "center", justifyContent: "center",
  },
  wpFlagLabel: { color: "#fff", fontSize: 8, fontFamily: "Inter_700Bold" },
  wpDiamondWrap: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
  wpDiamond: {
    position: "absolute",
    width: 18, height: 18, borderRadius: 2,
    borderWidth: 2, borderColor: "#fff",
  },
  wpDiamondNum: {
    color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold",
    position: "absolute",
  },
  wpErrorDot: {
    position: "absolute", top: -2, right: -2,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: "#E74C3C", borderWidth: 1.5, borderColor: "#fff",
  },
});

export default AdventureMapMaplibre;
