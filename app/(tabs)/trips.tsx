import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useTrips, Trip } from "@/context/TripsContext";

function getDifficultyColor(d: number, c: ReturnType<typeof useColors>): string {
  if (d <= 3) return c.success;
  if (d <= 6) return c.warning;
  if (d <= 8) return c.accent;
  return c.danger;
}

function getDifficultyLabel(d: number): string {
  if (d <= 3) return "Easy";
  if (d <= 6) return "Moderate";
  if (d <= 8) return "Hard";
  return "Extreme";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function TripCard({
  trip,
  colors,
  onDelete,
}: {
  trip: Trip;
  colors: ReturnType<typeof useColors>;
  onDelete: () => void;
}) {
  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      marginHorizontal: 20,
      marginBottom: 14,
      overflow: "hidden",
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 4,
    },
    topBar: {
      height: 4,
    },
    body: {
      padding: 16,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
    },
    title: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      color: colors.text,
      flex: 1,
      marginRight: 8,
    },
    destination: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.textMuted,
      marginTop: 2,
      marginBottom: 10,
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 10,
    },
    badge: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
    },
    badgeText: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: "#FFFFFF",
    },
    terrainBadge: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: colors.backgroundSecondary,
    },
    terrainBadgeText: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.textSecondary,
    },
    notes: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.textSecondary,
      lineHeight: 19,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    date: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.textMuted,
    },
    deleteBtn: {
      padding: 4,
    },
  });

  const accentColor = getDifficultyColor(trip.difficulty, colors);

  return (
    <View style={styles.card}>
      <View style={[styles.topBar, { backgroundColor: accentColor }]} />
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={styles.title} numberOfLines={2}>{trip.title}</Text>
        </View>
        <Text style={styles.destination}>{trip.destination}</Text>
        <View style={styles.metaRow}>
          <View style={[styles.badge, { backgroundColor: accentColor }]}>
            <Text style={styles.badgeText}>
              {getDifficultyLabel(trip.difficulty)} {trip.difficulty}/10
            </Text>
          </View>
          {trip.terrain ? (
            <View style={styles.terrainBadge}>
              <Text style={styles.terrainBadgeText}>{trip.terrain}</Text>
            </View>
          ) : null}
          {trip.vehicle && trip.vehicle !== "Not specified" ? (
            <View style={styles.terrainBadge}>
              <Text style={styles.terrainBadgeText}>{trip.vehicle}</Text>
            </View>
          ) : null}
        </View>
        {trip.notes ? (
          <Text style={styles.notes} numberOfLines={3}>{trip.notes}</Text>
        ) : null}
        <View style={styles.footer}>
          <Text style={styles.date}>Saved {formatDate(trip.savedAt)}</Text>
          <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function TripsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { trips, removeTrip, isLoading } = useTrips();

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : 90;

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
    emptyContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 40,
      paddingBottom: 80,
    },
    emptyIconWrap: {
      width: 80,
      height: 80,
      borderRadius: 24,
      backgroundColor: colors.backgroundSecondary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
    },
    emptyTitle: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.text,
      textAlign: "center",
      marginBottom: 8,
    },
    emptySub: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 24,
    },
    planBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 14,
    },
    planBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: "#FFFFFF",
    },
    listContent: {
      paddingTop: 16,
    },
    countText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.textMuted,
      paddingHorizontal: 20,
      marginBottom: 4,
      marginTop: 12,
    },
  });

  const handleDelete = (id: string, title: string) => {
    Alert.alert("Delete Trip", `Remove "${title}" from saved trips?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => removeTrip(id),
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Trips</Text>
        <Text style={styles.headerSub}>
          {trips.length === 0
            ? "No saved adventures yet"
            : `${trips.length} saved adventure${trips.length > 1 ? "s" : ""}`}
        </Text>
      </View>

      {trips.length === 0 && !isLoading ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="map-outline" size={36} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No saved trips yet</Text>
          <Text style={styles.emptySub}>
            Plan an adventure with TrailMaster AI and save your trip itinerary here.
          </Text>
          <TouchableOpacity
            style={styles.planBtn}
            onPress={() => router.push("/(tabs)/plan")}
          >
            <Text style={styles.planBtnText}>Plan Your First Trip</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomPad },
          ]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TripCard
              trip={item}
              colors={colors}
              onDelete={() => handleDelete(item.id, item.title)}
            />
          )}
        />
      )}
    </View>
  );
}
