import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { View, StyleSheet } from "react-native";
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
 *  AdventureMap (web)
 *  Renders the same Leaflet map as native, but inside a real DOM <iframe>
 *  (react-native-webview is native-only). The bridge uses window.postMessage
 *  in both directions. This keeps the public API identical across platforms
 *  and lets the live map render in the web preview.
 * ────────────────────────────────────────────────────────────────────────── */

export * from "./adventureMapShared";

const AdventureMap = forwardRef<AdventureMapHandle, AdventureMapProps>(
  (
    {
      style,
      initialRegion,
      baseLayer = "satellite",
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
    const frameRef = useRef<HTMLIFrameElement | null>(null);
    const [ready, setReady] = useState(false);

    const initialRef = useRef({ initialRegion, baseLayer });
    const html = useMemo(
      () =>
        buildLeafletHtml({
          initialRegion: initialRef.current.initialRegion,
          baseLayer: initialRef.current.baseLayer,
        }),
      [],
    );

    const markerPressRef = useRef<Record<string, (() => void) | undefined>>({});
    useEffect(() => {
      markerPressRef.current = buildPressHandlers(markers);
    }, [markers]);

    const linePressRef = useRef<Record<string, (() => void) | undefined>>({});
    useEffect(() => {
      linePressRef.current = buildPressHandlers(polylines);
    }, [polylines]);

    // Stable ref to the overlap-chooser handler so the message listener below
    // never needs to be torn down when the parent passes a fresh closure.
    const onLinesPressRef = useRef(onLinesPress);
    useEffect(() => {
      onLinesPressRef.current = onLinesPress;
    }, [onLinesPress]);

    const camWaiters = useRef<
      Record<string, (v: { heading: number; zoom: number; center: LatLng } | null) => void>
    >({});

    // Mirror of `ready` + a queue of bridge calls issued before the iframe
    // signalled ready, flushed in order on "ready" (parity with native).
    const readyRef = useRef(false);
    const pending = useRef<{ fn: string; args: unknown[] }[]>([]);

    const post = useCallback((fn: string, args: unknown[]) => {
      frameRef.current?.contentWindow?.postMessage(
        JSON.stringify({ __amap: true, fn, args }),
        "*",
      );
    }, []);

    const call = useCallback(
      (fn: string, ...args: unknown[]) => {
        if (!readyRef.current) {
          pending.current.push({ fn, args });
          return;
        }
        post(fn, args);
      },
      [post],
    );

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

    useEffect(() => {
      function onMsg(ev: MessageEvent) {
        // Only trust messages coming from our own iframe.
        if (frameRef.current && ev.source !== frameRef.current.contentWindow) return;
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
          msg = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        } catch {
          return;
        }
        if (!msg || typeof msg !== "object") return;
        switch (msg.type) {
          case "ready": {
            readyRef.current = true;
            const queued = pending.current;
            pending.current = [];
            queued.forEach((q) => post(q.fn, q.args));
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
      }
      window.addEventListener("message", onMsg);
      return () => window.removeEventListener("message", onMsg);
    }, [onMapReady, onPress, onRegionChangeComplete, onWaypointDrop, post]);

    return (
      <View style={[styles.fill, style]}>
        {React.createElement("iframe", {
          ref: frameRef,
          srcDoc: html,
          style: { border: "0", width: "100%", height: "100%" },
          allow: "geolocation",
        })}
      </View>
    );
  },
);

AdventureMap.displayName = "AdventureMap";

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
});

export default AdventureMap;
