import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Share,
  Platform,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useUnits } from "@/context/UnitsContext";
import * as haptics from "@/lib/haptics";
import type { LatLng } from "@/components/AdventureMap";
import {
  formatDecimal,
  formatDMS,
  encodePlusCode,
  buildLocationMessage,
} from "@/lib/coordFormat";
import { haversineMeters, compass8 } from "@/lib/navigation";

/* ──────────────────────────────────────────────────────────────────────────
 *  SafetyPanel — always-available safety HUD + SOS sheet.
 *  Shows live coordinates (decimal + DMS), an offline plus code, altitude,
 *  heading and nearest landmark. Coordinates can be shared via the OS share
 *  sheet or pre-filled into an SMS — both work offline (SMS queues until the
 *  device regains signal).
 * ────────────────────────────────────────────────────────────────────────── */

export interface SafetyLandmark {
  name: string;
  coordinate: LatLng;
}

interface SafetyPanelProps {
  visible: boolean;
  onClose: () => void;
  location: LatLng | null;
  altitude?: number | null;
  accuracy?: number | null;
  heading?: number | null;
  landmarks?: SafetyLandmark[];
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text
        style={{
          fontFamily: mono ? "Inter_700Bold" : "Inter_600SemiBold",
          fontSize: 15,
          color: colors.text,
          flexShrink: 1,
          textAlign: "right",
        }}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

export function SafetyPanel({
  visible,
  onClose,
  location,
  altitude,
  accuracy,
  heading,
  landmarks = [],
}: SafetyPanelProps) {
  const colors = useColors();
  const units = useUnits();
  const insets = useSafeAreaInsets();
  const [shared, setShared] = useState<"share" | "sms" | null>(null);

  const plusCode = useMemo(
    () => (location ? encodePlusCode(location) : null),
    [location],
  );

  const nearest = useMemo(() => {
    if (!location || landmarks.length === 0) return null;
    let best: { name: string; meters: number } | null = null;
    for (const l of landmarks) {
      const m = haversineMeters(location, l.coordinate);
      if (!best || m < best.meters) best = { name: l.name, meters: m };
    }
    return best;
  }, [location, landmarks]);

  const buildMessage = (sos: boolean) =>
    location
      ? buildLocationMessage({
          coord: location,
          altitude,
          accuracy,
          plusCode: plusCode ?? undefined,
          landmark: nearest
            ? `${nearest.name} (${
                units.formatDistance(nearest.meters) ?? `${Math.round(nearest.meters)} m`
              })`
            : null,
          sos,
        })
      : "";

  const handleShare = async (sos: boolean) => {
    if (!location) return;
    haptics.tapMedium();
    try {
      await Share.share({ message: buildMessage(sos) });
      setShared("share");
    } catch {
      // user dismissed — no-op
    }
  };

  const handleSms = async (sos: boolean) => {
    if (!location) return;
    haptics.tapMedium();
    const body = encodeURIComponent(buildMessage(sos));
    const sep = Platform.OS === "ios" ? "&" : "?";
    const url = `sms:${sep}body=${body}`;
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) {
        await Linking.openURL(url);
        setShared("sms");
      } else {
        await handleShare(sos);
      }
    } catch {
      await handleShare(sos);
    }
  };

  const headingLabel =
    typeof heading === "number" && heading >= 0
      ? `${Math.round(heading)}° ${compass8(heading)}`
      : "—";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>
                Safety & SOS
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} testID="safety-close">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {!location ? (
            <View style={{ paddingVertical: 32, alignItems: "center" }}>
              <Ionicons name="locate-outline" size={32} color={colors.textMuted} />
              <Text
                style={{
                  color: colors.textMuted,
                  fontFamily: "Inter_500Medium",
                  fontSize: 14,
                  marginTop: 10,
                  textAlign: "center",
                  paddingHorizontal: 24,
                }}
              >
                Acquiring your GPS position… make sure location access is enabled.
              </Text>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 460 }}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {/* Live readout card */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <InfoRow label="Coordinates" value={formatDecimal(location, 5)} mono />
                <InfoRow label="DMS" value={formatDMS(location)} />
                {plusCode && <InfoRow label="Plus code" value={plusCode} mono />}
                <InfoRow
                  label="Altitude"
                  value={
                    typeof altitude === "number"
                      ? units.formatElevation(altitude) ?? `${Math.round(altitude)} m`
                      : "—"
                  }
                />
                <InfoRow label="Heading" value={headingLabel} />
                <InfoRow
                  label="GPS accuracy"
                  value={
                    typeof accuracy === "number"
                      ? `±${units.formatElevation(accuracy) ?? `${Math.round(accuracy)} m`}`
                      : "—"
                  }
                />
                {nearest && (
                  <InfoRow
                    label="Nearest landmark"
                    value={`${nearest.name} · ${
                      units.formatDistance(nearest.meters) ??
                      `${Math.round(nearest.meters)} m`
                    }`}
                  />
                )}
              </View>

              {/* Share actions */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => handleShare(false)}
                  testID="safety-share"
                  style={[
                    styles.actionBtn,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Ionicons name="share-outline" size={18} color={colors.text} />
                  <Text style={[styles.actionLabel, { color: colors.text }]}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => handleSms(false)}
                  testID="safety-sms"
                  style={[
                    styles.actionBtn,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Ionicons name="chatbubble-outline" size={18} color={colors.text} />
                  <Text style={[styles.actionLabel, { color: colors.text }]}>SMS</Text>
                </TouchableOpacity>
              </View>

              {/* SOS */}
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  haptics.notifyWarning();
                  handleSms(true);
                }}
                testID="safety-sos"
                style={[styles.sosBtn, { backgroundColor: colors.danger }]}
              >
                <Ionicons name="warning" size={22} color="#FFFFFF" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sosTitle}>Send SOS with location</Text>
                  <Text style={styles.sosSub}>
                    Pre-fills an emergency text with your exact position
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.85)" />
              </TouchableOpacity>

              <View style={styles.emergencyRow}>
                <Ionicons name="call-outline" size={14} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 12 }}>
                  UAE emergency: Police 999 · Ambulance 998 · Intl 112
                </Text>
              </View>

              {shared && (
                <Text
                  style={{
                    color: colors.success,
                    fontFamily: "Inter_500Medium",
                    fontSize: 12,
                    textAlign: "center",
                    marginTop: 10,
                  }}
                >
                  Location prepared — finish sending in your messaging app.
                </Text>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
  },
  infoLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
  },
  actionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  sosBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 12,
  },
  sosTitle: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 16 },
  sosSub: { color: "rgba(255,255,255,0.85)", fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  emergencyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 14,
  },
});
