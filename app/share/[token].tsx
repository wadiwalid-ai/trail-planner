import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { apiRequest } from "@/lib/query-client";
import { useColors } from "@/hooks/useColors";

export default function SharedTrailScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const colors = useColors();
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!token) {
        setError(true);
        return;
      }
      try {
        const res = await apiRequest("GET", `/api/share/${token}`);
        const data = await res.json();
        const id = data?.trail?.id;
        if (!active) return;
        if (id == null) {
          setError(true);
          return;
        }
        // Pass the token through so the trail screen loads via the public
        // share endpoint (the bare /api/trails/:id route blocks unlisted /
        // private community trails for non-owners).
        router.replace({ pathname: "/trail/[id]", params: { id: String(id), shareToken: token } });
      } catch {
        if (active) setError(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [token, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {error ? (
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          This shared trail could not be found.
        </Text>
      ) : (
        <>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.text, { color: colors.textSecondary }]}>Opening shared trail…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  text: { fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center" },
});
