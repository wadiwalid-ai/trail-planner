import React, { useEffect, useRef, useState } from "react";
import { View, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useColors } from "@/hooks/useColors";
import * as haptics from "@/lib/haptics";
import type { LatLng } from "@/components/AdventureMap";
import { SafetyPanel, type SafetyLandmark } from "@/components/SafetyPanel";

/* ──────────────────────────────────────────────────────────────────────────
 *  SafetyFab — a floating shield button that keeps safety info one tap away.
 *  Self-subscribes to GPS + heading so it works on any screen. Callers may
 *  pass live location/heading to avoid a second subscription; otherwise it
 *  starts its own. Web uses the browser geolocation fallback (no heading).
 * ────────────────────────────────────────────────────────────────────────── */

interface SafetyFabProps {
  /** Pass an existing live location to reuse the screen's subscription. */
  location?: LatLng | null;
  altitude?: number | null;
  accuracy?: number | null;
  heading?: number | null;
  landmarks?: SafetyLandmark[];
  /** Bottom offset so the button clears tab bars / other controls. */
  bottom?: number;
  right?: number;
}

export function SafetyFab({
  location: externalLoc,
  altitude: externalAlt,
  accuracy: externalAcc,
  heading: externalHeading,
  landmarks,
  bottom = 28,
  right = 14,
}: SafetyFabProps) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  const [loc, setLoc] = useState<LatLng | null>(null);
  const [alt, setAlt] = useState<number | null>(null);
  const [acc, setAcc] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);

  // Only self-subscribe when the caller doesn't supply a location.
  const selfManaged = externalLoc === undefined;
  const webWatchId = useRef<number | null>(null);

  useEffect(() => {
    if (!selfManaged) return;

    if (Platform.OS === "web") {
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        webWatchId.current = navigator.geolocation.watchPosition(
          (p) => {
            setLoc({ latitude: p.coords.latitude, longitude: p.coords.longitude });
            setAlt(typeof p.coords.altitude === "number" ? p.coords.altitude : null);
            setAcc(typeof p.coords.accuracy === "number" ? p.coords.accuracy : null);
            if (typeof p.coords.heading === "number" && !Number.isNaN(p.coords.heading)) {
              setHeading(p.coords.heading);
            }
          },
          undefined,
          { enableHighAccuracy: true },
        );
      }
      return () => {
        if (webWatchId.current != null && navigator.geolocation) {
          navigator.geolocation.clearWatch(webWatchId.current);
        }
      };
    }

    let posSub: Location.LocationSubscription | null = null;
    let headSub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      posSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 4 },
        (p) => {
          setLoc({ latitude: p.coords.latitude, longitude: p.coords.longitude });
          setAlt(typeof p.coords.altitude === "number" ? p.coords.altitude : null);
          setAcc(typeof p.coords.accuracy === "number" ? p.coords.accuracy : null);
          if (typeof p.coords.heading === "number" && p.coords.heading >= 0) {
            setHeading(p.coords.heading);
          }
        },
      );
      headSub = await Location.watchHeadingAsync((h) => {
        const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
        if (deg >= 0) setHeading(deg);
      });
    })();

    return () => {
      posSub?.remove();
      headSub?.remove();
    };
  }, [selfManaged]);

  const resolvedLoc = selfManaged ? loc : externalLoc ?? null;
  const resolvedAlt = selfManaged ? alt : externalAlt ?? null;
  const resolvedAcc = selfManaged ? acc : externalAcc ?? null;
  const resolvedHeading = selfManaged ? heading : externalHeading ?? null;

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          haptics.tapMedium();
          setOpen(true);
        }}
        accessibilityLabel="Open safety and SOS panel"
        testID="safety-fab"
        style={[
          styles.fab,
          { backgroundColor: colors.danger, bottom, right },
        ]}
      >
        <Ionicons name="shield-half" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <SafetyPanel
        visible={open}
        onClose={() => setOpen(false)}
        location={resolvedLoc}
        altitude={resolvedAlt}
        accuracy={resolvedAcc}
        heading={resolvedHeading}
        landmarks={landmarks}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
});
