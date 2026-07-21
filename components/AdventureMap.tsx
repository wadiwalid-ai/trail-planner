import React, { forwardRef } from "react";
import Constants, { ExecutionEnvironment } from "expo-constants";
import AdventureMapLeaflet from "./AdventureMapLeaflet";
import type { AdventureMapHandle, AdventureMapProps } from "./adventureMapShared";

/* ──────────────────────────────────────────────────────────────────────────
 *  AdventureMap (native engine selector)
 *  The ONE in-house map wrapper. It exposes the public API in adventureMapShared
 *  and picks the rendering engine at runtime:
 *    • MapLibre (custom build): GPU vector engine with offline packs, branded
 *      topo/night styles, hillshade and 3D terrain.
 *    • Leaflet (Expo Go / fallback): WebView map — always available, crash-free.
 *  The MapLibre engine imports a native module, so it is only `require`d when we
 *  are NOT inside Expo Go. In Expo Go the native module is never touched and the
 *  Leaflet fallback renders, exactly as before. The web build resolves
 *  AdventureMap.web.tsx (Leaflet iframe) instead of this file.
 * ────────────────────────────────────────────────────────────────────────── */

export * from "./adventureMapShared";

const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Lazily resolve the MapLibre engine. Only attempted outside Expo Go so the
// native module is never imported where it would crash.
let MaplibreEngine: React.ForwardRefExoticComponent<
  AdventureMapProps & React.RefAttributes<AdventureMapHandle>
> | null = null;

if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    MaplibreEngine = require("./AdventureMapMaplibre").default;
  } catch {
    MaplibreEngine = null;
  }
}

const AdventureMap = forwardRef<AdventureMapHandle, AdventureMapProps>(
  (props, ref) => {
    const Engine = MaplibreEngine ?? AdventureMapLeaflet;
    return <Engine ref={ref} {...props} />;
  },
);

AdventureMap.displayName = "AdventureMap";

export default AdventureMap;
