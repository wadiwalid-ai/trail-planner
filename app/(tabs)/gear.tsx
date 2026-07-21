import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { fetch } from "expo/fetch";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { getApiUrl } from "@/lib/query-client";

const VEHICLES = [
  "Jeep Wrangler / Bronco",
  "Toyota 4Runner / Land Cruiser",
  "Pickup Truck",
  "SUV / Crossover",
  "ATV / UTV",
];

const TERRAINS = [
  "Rock Crawling",
  "Desert Overland",
  "Mountain Alpine",
  "Forest & Mud",
  "Sand Dunes",
  "Snow & Ice",
];

const DURATIONS = [
  "Day Trip",
  "Weekend",
  "Multi-Day (3-5 days)",
  "Expedition (1+ week)",
];

export default function GearScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [vehicle, setVehicle] = useState(VEHICLES[0]);
  const [terrain, setTerrain] = useState(TERRAINS[0]);
  const [duration, setDuration] = useState(DURATIONS[0]);
  const [gearText, setGearText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasResult, setHasResult] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : 100;

  const handleGenerate = useCallback(async () => {
    setIsLoading(true);
    setGearText("");
    setHasResult(false);

    try {
      const url = new URL("/api/ai/gear", getApiUrl()).toString();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle, terrain, duration }),
      });

      if (!response.body) throw new Error("No response stream");

      const reader = (response.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      setHasResult(true);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          for (const line of part.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullText += parsed.content;
                setGearText(fullText);
              }
            } catch {
              // ignore
            }
          }
        }
      }
    } catch (err) {
      setGearText(
        "Unable to generate gear list. Please check the API key is configured."
      );
      setHasResult(true);
    } finally {
      setIsLoading(false);
    }
  }, [vehicle, terrain, duration]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: topInset + 12,
      paddingHorizontal: 20,
      paddingBottom: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    headerTitle: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: colors.text,
    },
    headerSub: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.textMuted,
      marginTop: 2,
    },
    sectionLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.textMuted,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      marginBottom: 10,
    },
    section: {
      marginBottom: 20,
    },
    optionsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    option: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1.5,
    },
    optionText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
    },
    generateBtn: {
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
      marginTop: 4,
    },
    generateBtnText: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      color: "#FFFFFF",
    },
    resultCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 18,
      marginTop: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    resultHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 14,
      gap: 10,
    },
    resultTitle: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      color: colors.text,
      flex: 1,
    },
    resultText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.text,
      lineHeight: 22,
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 4,
    },
    loadingText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.textMuted,
    },
    cursor: {
      color: colors.primary,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Gear Planner</Text>
        <Text style={styles.headerSub}>
          AI-generated gear lists for your setup
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: bottomPad,
        }}
      >
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Your Vehicle</Text>
          <View style={styles.optionsRow}>
            {VEHICLES.map((v) => {
              const active = vehicle === v;
              return (
                <TouchableOpacity
                  key={v}
                  style={[
                    styles.option,
                    {
                      backgroundColor: active
                        ? colors.primary
                        : colors.surface,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => {
                    setVehicle(v);
                    setHasResult(false);
                    setGearText("");
                  }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      { color: active ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {v}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Terrain Type</Text>
          <View style={styles.optionsRow}>
            {TERRAINS.map((t) => {
              const active = terrain === t;
              return (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.option,
                    {
                      backgroundColor: active
                        ? colors.accent
                        : colors.surface,
                      borderColor: active ? colors.accent : colors.border,
                    },
                  ]}
                  onPress={() => {
                    setTerrain(t);
                    setHasResult(false);
                    setGearText("");
                  }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      { color: active ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {t}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Trip Duration</Text>
          <View style={styles.optionsRow}>
            {DURATIONS.map((d) => {
              const active = duration === d;
              return (
                <TouchableOpacity
                  key={d}
                  style={[
                    styles.option,
                    {
                      backgroundColor: active
                        ? colors.gold
                        : colors.surface,
                      borderColor: active ? colors.gold : colors.border,
                    },
                  ]}
                  onPress={() => {
                    setDuration(d);
                    setHasResult(false);
                    setGearText("");
                  }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      { color: active ? "#1A1612" : colors.text },
                    ]}
                  >
                    {d}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.generateBtn,
            {
              backgroundColor: isLoading ? colors.border : colors.primary,
            },
          ]}
          onPress={handleGenerate}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="sparkles" size={18} color="#FFFFFF" />
          )}
          <Text style={styles.generateBtnText}>
            {isLoading ? "Generating..." : "Generate Gear List"}
          </Text>
        </TouchableOpacity>

        {hasResult && (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="construct" size={18} color="#FFFFFF" />
              </View>
              <Text style={styles.resultTitle}>
                {vehicle} · {terrain}
              </Text>
            </View>
            {gearText ? (
              <Text style={styles.resultText}>
                {gearText}
                {isLoading && <Text style={styles.cursor}>▍</Text>}
              </Text>
            ) : (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingText}>Preparing your gear list...</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
