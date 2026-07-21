import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AdventureMap, {
  type AdventureMapHandle,
  type AdventureMarker,
  type LatLng,
  type MapRegion,
} from "@/components/AdventureMap";
import { useColors } from "@/hooks/useColors";
import { useType } from "@/hooks/useType";
import { useConvoy } from "@/context/ConvoyContext";
import * as haptics from "@/lib/haptics";
import { statusColor, HELP_COLOR } from "./statusColors";

// Liwa, UAE — matches the convoy simulator's default spawn center so dev ghosts
// land in frame even before a real fix arrives.
const DEFAULT_REGION: MapRegion = {
  latitude: 23.1,
  longitude: 53.78,
  latitudeDelta: 0.4,
  longitudeDelta: 0.4,
};

function shortName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? name;
  return first.length > 10 ? first.slice(0, 10) : first;
}

export default function ConvoyMap({ height }: { height: number }) {
  const colors = useColors();
  const type = useType();
  const { members, myMember, myLocation, recenterSignal, recenter } =
    useConvoy();
  const mapRef = useRef<AdventureMapHandle>(null);
  const didInitialFit = useRef<boolean>(false);

  const otherMembers = useMemo(
    () => members.filter((m) => !(myMember != null && m.id === myMember.id)),
    [members, myMember],
  );

  const initialRegion = useMemo<MapRegion>(() => {
    if (myLocation) {
      return {
        latitude: myLocation.lat,
        longitude: myLocation.lng,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
    }
    const withPos = members.find((m) => m.lat != null && m.lng != null);
    if (withPos && withPos.lat != null && withPos.lng != null) {
      return {
        latitude: withPos.lat,
        longitude: withPos.lng,
        latitudeDelta: 0.2,
        longitudeDelta: 0.2,
      };
    }
    return DEFAULT_REGION;
    // Only compute once at mount — live updates are handled by the fit effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markers = useMemo<AdventureMarker[]>(() => {
    const list: AdventureMarker[] = [];

    // Current user as a direction-of-travel puck (prefer live device location).
    const myLat = myLocation?.lat ?? myMember?.lat ?? null;
    const myLng = myLocation?.lng ?? myMember?.lng ?? null;
    if (myLat != null && myLng != null) {
      list.push({
        id: "me",
        coordinate: { latitude: myLat, longitude: myLng },
        anchor: { x: 0.5, y: 0.5 },
        rotation: myLocation?.heading ?? myMember?.heading ?? 0,
        zIndex: 30,
        icon: { kind: "puck", color: colors.primary },
      });
    }

    otherMembers.forEach((m) => {
      if (m.lat == null || m.lng == null) return;
      const isHelp = m.status === "help";
      const tone = isHelp ? HELP_COLOR : statusColor(m.status, colors.primary);
      list.push({
        id: `m-${m.id}`,
        coordinate: { latitude: m.lat, longitude: m.lng },
        anchor: { x: 0.5, y: 0.5 },
        zIndex: isHelp ? 25 : 15,
        icon: {
          kind: "badge",
          color: tone,
          glyph: "car-sport",
          label: shortName(m.displayName),
          showLabel: true,
          emphasized: isHelp,
        },
      });
    });

    return list;
  }, [otherMembers, myLocation, myMember, colors.primary]);

  const fitAll = useCallback(() => {
    const coords: LatLng[] = [];
    members.forEach((m) => {
      if (m.lat != null && m.lng != null) {
        coords.push({ latitude: m.lat, longitude: m.lng });
      }
    });
    if (myLocation) {
      coords.push({ latitude: myLocation.lat, longitude: myLocation.lng });
    }
    if (coords.length === 0) return;
    if (coords.length === 1) {
      mapRef.current?.animateToRegion(
        {
          latitude: coords[0].latitude,
          longitude: coords[0].longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        },
        600,
      );
    } else {
      mapRef.current?.fitToCoordinates(coords, {
        top: 70,
        right: 60,
        bottom: 70,
        left: 60,
      });
    }
  }, [members, myLocation]);

  // Keep a stable ref so the recenter effect doesn't re-run on every data tick.
  const fitAllRef = useRef(fitAll);
  fitAllRef.current = fitAll;

  // React to the context's recenter() signal.
  useEffect(() => {
    if (recenterSignal > 0) fitAllRef.current();
  }, [recenterSignal]);

  // First successful fit once any coordinates exist.
  useEffect(() => {
    if (didInitialFit.current) return;
    const hasAny =
      myLocation != null ||
      members.some((m) => m.lat != null && m.lng != null);
    if (!hasAny) return;
    didInitialFit.current = true;
    const t = setTimeout(() => fitAllRef.current(), 600);
    return () => clearTimeout(t);
  }, [members, myLocation]);

  const onRecenter = useCallback(() => {
    haptics.tapMedium();
    recenter();
  }, [recenter]);

  const s = styles(colors);

  return (
    <View style={[s.wrap, { height }]}>
      <AdventureMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        baseLayer="satellite"
        markers={markers}
      />

      {/* Offline / cached map chip */}
      <View style={s.offlineChip}>
        <Ionicons name="cloud-offline" size={13} color={colors.primary} />
        <Text style={[s.offlineLabel, { fontFamily: type.mono }]}>
          Offline map · cached
        </Text>
      </View>

      {/* Recenter */}
      <TouchableOpacity
        style={s.recenterBtn}
        onPress={onRecenter}
        activeOpacity={0.8}
      >
        <Ionicons name="locate" size={18} color={colors.onMap} />
      </TouchableOpacity>
    </View>
  );
}

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    wrap: {
      width: "100%",
      overflow: "hidden",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.backgroundSecondary,
    },
    offlineChip: {
      position: "absolute",
      top: 12,
      left: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.mapPanel,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.mapPanelBorder,
      borderRadius: colors.radiusPill,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    offlineLabel: {
      fontSize: 10,
      color: colors.onMap,
      letterSpacing: 0.3,
    },
    recenterBtn: {
      position: "absolute",
      bottom: 12,
      right: 12,
      width: 42,
      height: 42,
      borderRadius: colors.radius,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.mapPanelStrong,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.mapPanelBorder,
    },
  });
}
