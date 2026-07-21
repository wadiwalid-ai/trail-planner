import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import * as Location from "expo-location";
import {
  buildLeafletHtml,
  buildPressHandlers,
  dispatchLinePress,
  serializeMarkers,
  serializePolylines,
  type AdventureMapHandle,
  type AdventureMapProps,
  type LatLng,
  type MapRegion,
} from "./adventureMapShared";

/* ──────────────────────────────────────────────────────────────────────────
 *  AdventureMapLeaflet (native fallback engine)
 *  Renders a WebView running Leaflet. This is the always-available engine: it
 *  works inside Expo Go (no native map module) and is the verified fallback
 *  whenever the MapLibre custom-build engine is unavailable. 2D, north-up.
 *  Selected by AdventureMap.tsx; never imported directly by screens.
 * ────────────────────────────────────────────────────────────────────────── */

const AdventureMapLeaflet = forwardRef<AdventureMapHandle, AdventureMapProps>(
  (
    {
      style,
      initialRegion,
      baseLayer = "satellite",
      showsUserLocation = false,
      followsUserLocation = false,
      polylines = [],
      markers = [],
      onMapReady,
      onPress,
      onRegionChangeComplete,
      waypointMode = false,
      onWaypointDrop,
      onLinesPress,
    },
    ref,
  ) => {
    const webRef = useRef<WebView>(null);
    const [ready, setReady] = useState(false);
    // Mirror of `ready` for use in stable callbacks, plus a queue of bridge
    // calls issued before the map signalled ready (e.g. an early
    // fitToCoordinates on the trail screen). Flushed in order on "ready".
    const readyRef = useRef(false);
    const pending = useRef<string[]>([]);

    // Build the HTML once from the *initial* layer/region; everything after the
    // first paint is pushed in via injectJavaScript so the WebView never reloads.
    const initialRef = useRef({ initialRegion, baseLayer });
    const html = useMemo(
      () =>
        buildLeafletHtml({
          initialRegion: initialRef.current.initialRegion,
          baseLayer: initialRef.current.baseLayer,
        }),
      [],
    );

    // Keep a live map of marker id -> onPress so WebView press events can fire it.
    const markerPressRef = useRef<Record<string, (() => void) | undefined>>({});
    useEffect(() => {
      markerPressRef.current = buildPressHandlers(markers);
    }, [markers]);

    // Same for polyline id -> onPress (tap the route line).
    const linePressRef = useRef<Record<string, (() => void) | undefined>>({});
    useEffect(() => {
      linePressRef.current = buildPressHandlers(polylines);
    }, [polylines]);

    // Stable ref to the overlap-chooser handler so the message handler below
    // never needs to be re-created when the parent passes a fresh closure.
    const onLinesPressRef = useRef(onLinesPress);
    useEffect(() => {
      onLinesPressRef.current = onLinesPress;
    }, [onLinesPress]);

    // Pending getCamera() promises keyed by request id.
    const camWaiters = useRef<
      Record<string, (v: { heading: number; zoom: number; center: LatLng } | null) => void>
    >({});

    const inject = useCallback((js: string) => {
      if (!readyRef.current) {
        pending.current.push(js);
        return;
      }
      webRef.current?.injectJavaScript(`${js}; true;`);
    }, []);

    const call = useCallback(
      (fn: string, ...args: unknown[]) => {
        const payload = args.map((a) => JSON.stringify(a)).join(",");
        inject(`window.AMap && window.AMap.${fn}(${payload})`);
      },
      [inject],
    );

    // ── Push prop updates once the map is ready ──
    useEffect(() => {
      if (ready) call("setBaseLayer", baseLayer);
    }, [ready, baseLayer, call]);

    useEffect(() => {
      if (ready) call("setPolylines", serializePolylines(polylines));
    }, [ready, polylines, call]);

    useEffect(() => {
      if (ready) call("setMarkers", serializeMarkers(markers));
    }, [ready, markers, call]);

    useEffect(() => {
      if (ready) call("setWaypointMode", waypointMode);
    }, [ready, waypointMode, call]);

    // ── User location feed (replaces the native blue dot) ──
    useEffect(() => {
      if (!ready || !showsUserLocation) return;
      let sub: Location.LocationSubscription | null = null;
      let cancelled = false;
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== "granted" || cancelled) return;
          const watcher = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 2000 },
            (pos) => {
              const loc = {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              };
              call("setUser", loc);
              if (followsUserLocation) {
                call("animateCamera", { center: loc }, 400);
              }
            },
          );
          // The await above can resolve after cleanup already ran; if so, tear
          // the watcher down immediately so it is never left dangling.
          if (cancelled) {
            watcher.remove();
            return;
          }
          sub = watcher;
        } catch {
          /* location unavailable — map still works without the dot */
        }
      })();
      return () => {
        cancelled = true;
        sub?.remove();
        if (ready) call("setUser", null);
      };
    }, [ready, showsUserLocation, followsUserLocation, call]);

    useImperativeHandle(
      ref,
      () => ({
        animateToRegion: (region, duration = 600) => call("animateToRegion", region, duration),
        animateCamera: (camera, duration = 600) => call("animateCamera", camera, duration),
        fitToCoordinates: (coords, padding) => {
          if (!coords.length) return;
          call("fitToCoordinates", coords, padding ?? null);
        },
        getCamera: () =>
          new Promise((resolve) => {
            const id = Date.now().toString() + Math.random().toString(36).slice(2, 8);
            camWaiters.current[id] = resolve;
            call("getCamera", id);
            setTimeout(() => {
              if (camWaiters.current[id]) {
                delete camWaiters.current[id];
                resolve(null);
              }
            }, 1500);
          }),
      }),
      [call],
    );

    const handleMessage = useCallback(
      (e: WebViewMessageEvent) => {
        let msg: {
          type?: string;
          coordinate?: LatLng;
          region?: MapRegion;
          id?: string;
          ids?: string[];
          requestId?: string;
          camera?: { heading: number; zoom: number; center: LatLng };
        };
        try {
          msg = JSON.parse(e.nativeEvent.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case "ready": {
            readyRef.current = true;
            const queued = pending.current;
            pending.current = [];
            queued.forEach((js) =>
              webRef.current?.injectJavaScript(`${js}; true;`),
            );
            setReady(true);
            onMapReady?.();
            break;
          }
          case "press":
            if (msg.coordinate) onPress?.(msg.coordinate);
            break;
          case "waypointDrop":
            if (msg.coordinate) onWaypointDrop?.(msg.coordinate);
            break;
          case "region":
            if (msg.region) onRegionChangeComplete?.(msg.region);
            break;
          case "markerPress":
            if (msg.id) markerPressRef.current[msg.id]?.();
            break;
          case "linePress":
            // A tap that overlapped 2+ chooser lines arrives with the full id
            // list — offer the chooser. A single hit fires that line directly.
            dispatchLinePress(msg, linePressRef.current, onLinesPressRef.current);
            break;
          case "camera":
            if (msg.requestId && camWaiters.current[msg.requestId]) {
              camWaiters.current[msg.requestId](msg.camera ?? null);
              delete camWaiters.current[msg.requestId];
            }
            break;
        }
      },
      [onMapReady, onPress, onRegionChangeComplete, onWaypointDrop],
    );

    return (
      <View style={[styles.fill, style]}>
        <WebView
          ref={webRef}
          style={styles.fill}
          originWhitelist={["*"]}
          source={{ html }}
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          startInLoadingState={false}
          androidLayerType="hardware"
          // Performance/UX: keep gestures snappy and avoid bounce/scroll fighting.
          overScrollMode="never"
          bounces={false}
          scrollEnabled={false}
          setSupportMultipleWindows={false}
        />
      </View>
    );
  },
);

AdventureMapLeaflet.displayName = "AdventureMapLeaflet";

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
});

export default AdventureMapLeaflet;
