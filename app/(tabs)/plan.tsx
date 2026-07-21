import React, { useState, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { fetch } from "expo/fetch";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { getApiUrl } from "@/lib/query-client";
import { useTrips } from "@/context/TripsContext";

const WEB_TAB_BAR_HEIGHT = 84;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface PlanTrail {
  id: string;
  name: string;
  location: string | null;
  difficulty: number | null;
  distance: string | null;
  distanceMeters: number | null;
  activityType: string;
  source: string;
}

const SUGGESTIONS = [
  "Plan a weekend trip to Wadi Shawka, UAE",
  "Best off-road trails in Ras Al Khaimah",
  "Essential gear for UAE desert overlanding",
  "Plan a Hatta Rock Pools day trip",
  "Recovery gear for solo wadi driving",
  "Compare Wadi Bih vs Wadi Shawka difficulty",
];

function genId() {
  return Date.now().toString() + Math.random().toString(36).substring(2, 7);
}

function MessageBubble({
  message,
  colors,
  isStreaming,
}: {
  message: Message;
  colors: ReturnType<typeof useColors>;
  isStreaming: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 10,
        paddingHorizontal: 16,
      }}
    >
      {!isUser && (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 8,
            marginTop: 2,
            flexShrink: 0,
          }}
        >
          <Ionicons name="compass" size={16} color="#FFFFFF" />
        </View>
      )}
      <View
        style={{
          maxWidth: "78%",
          backgroundColor: isUser ? colors.primary : colors.surface,
          borderRadius: 18,
          borderTopRightRadius: isUser ? 4 : 18,
          borderTopLeftRadius: isUser ? 18 : 4,
          padding: 14,
          shadowColor: colors.cardShadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 1,
          shadowRadius: 4,
          elevation: 2,
        }}
      >
        {!isUser && message.content === "" && isStreaming ? (
          <View style={{ flexDirection: "row", gap: 4, paddingVertical: 2 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted }} />
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted, opacity: 0.6 }} />
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted, opacity: 0.3 }} />
          </View>
        ) : (
          <Text
            style={{
              fontSize: 15,
              fontFamily: "Inter_400Regular",
              color: isUser ? "#FFFFFF" : colors.text,
              lineHeight: 22,
            }}
          >
            {message.content}
            {!isUser && isStreaming && message.content !== "" ? (
              <Text style={{ color: colors.primary }}>▍</Text>
            ) : null}
          </Text>
        )}
      </View>
    </View>
  );
}

export default function PlanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addTrip, trips } = useTrips();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingIdRef = useRef<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  // ── Personalisation context: the user's own recorded tracks + saved trips ──
  const { data: trailsData } = useQuery<{ trails: PlanTrail[] }>({
    queryKey: ["/api/trails"],
    staleTime: 5 * 60 * 1000,
  });

  const communityTrails = useMemo(
    () => (trailsData?.trails ?? []).filter((t) => t.source === "community"),
    [trailsData],
  );

  const planningContext = useMemo<string | undefined>(() => {
    const parts: string[] = [];
    if (communityTrails.length > 0) {
      parts.push(
        "The user's own recorded off-road tracks:\n" +
          communityTrails
            .slice(0, 12)
            .map((t) => {
              const dist =
                t.distanceMeters != null
                  ? `${(t.distanceMeters / 1000).toFixed(1)} km`
                  : t.distance ?? "distance unknown";
              const diff = t.difficulty != null ? `difficulty ${t.difficulty}/10` : "difficulty unknown";
              const loc = t.location ? ` near ${t.location}` : "";
              return `- ${t.name}${loc}: ${dist}, ${diff}, ${t.activityType}`;
            })
            .join("\n"),
      );
    }
    if (trips.length > 0) {
      parts.push(
        "The user's saved trip plans:\n" +
          trips
            .slice(0, 12)
            .map(
              (t) =>
                `- ${t.title} → ${t.destination} (${t.terrain}, difficulty ${t.difficulty}/10)`,
            )
            .join("\n"),
      );
    }
    if (parts.length === 0) return undefined;
    return (
      "Use the following information about THIS user to personalise your advice. " +
      "Reference their own tracks and saved trips by name when relevant, and tailor " +
      "difficulty and gear suggestions to their experience.\n\n" +
      parts.join("\n\n")
    );
  }, [communityTrails, trips]);

  const handleSend = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim();
      if (!content || isStreaming) return;

      setInput("");

      const userMsg: Message = { id: genId(), role: "user", content };
      const aiId = genId();
      streamingIdRef.current = aiId;

      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: aiId, role: "assistant", content: "" },
      ]);
      setIsStreaming(true);

      try {
        const url = new URL("/api/ai/chat", getApiUrl()).toString();
        const allMessages = [
          ...messages,
          { role: "user" as const, content },
        ].map((m) => ({ role: m.role, content: m.content }));

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: allMessages, context: planningContext }),
        });

        if (!response.body) throw new Error("No response stream");

        const reader = (response.body as ReadableStream<Uint8Array>).getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";

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
                  fullContent += parsed.content;
                  const id = aiId;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === id ? { ...m, content: fullContent } : m
                    )
                  );
                }
              } catch {
                // ignore parse errors
              }
            }
          }
        }
      } catch (err) {
        const id = aiId;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  content:
                    "Unable to connect. Please check the API key is configured in settings.",
                }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
        streamingIdRef.current = null;
      }
    },
    [input, isStreaming, messages, planningContext]
  );

  const handleSaveTrip = useCallback(async () => {
    const lastAI = [...messages].reverse().find((m) => m.role === "assistant");
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastAI) return;

    const firstLine = lastAI.content.split("\n")[0].replace(/^#+\s*/, "").slice(0, 60);
    const destination = lastUser?.content?.slice(0, 40) ?? "Unknown";

    await addTrip({
      title: firstLine || "AI Trip Plan",
      destination,
      vehicle: "Not specified",
      terrain: "Mixed",
      duration: "TBD",
      difficulty: 5,
      notes: lastAI.content.slice(0, 500),
    });
  }, [messages, addTrip]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: topInset + 12,
      paddingBottom: 12,
      paddingHorizontal: 20,
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    headerIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },
    headerTitle: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: colors.text,
    },
    headerSub: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.textMuted,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "flex-end",
      paddingBottom: 8,
    },
    emptyTitle: {
      fontSize: 22,
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
      paddingHorizontal: 32,
      marginBottom: 24,
      lineHeight: 20,
    },
    suggestionsLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.textMuted,
      letterSpacing: 1,
      textTransform: "uppercase",
      paddingHorizontal: 16,
      marginBottom: 10,
    },
    suggestionChip: {
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor: colors.surface,
      marginBottom: 8,
      marginHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    suggestionText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.text,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: Platform.OS === "web" ? 10 : 90,
      backgroundColor: colors.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: 8,
    },
    textInput: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      backgroundColor: colors.surface,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 12,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    sendBtnDisabled: {
      backgroundColor: colors.border,
    },
    saveBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    listContent: {
      paddingTop: 12,
      paddingBottom: 8,
    },
  });

  const hasMessages = messages.length > 0;
  const hasAIResponse = messages.some((m) => m.role === "assistant" && m.content.length > 10);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="compass" size={20} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>TrailMaster AI</Text>
          <Text style={styles.headerSub}>Expert off-road adventure guide</Text>
        </View>
        {hasAIResponse && (
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveTrip}>
            <Ionicons name="bookmark-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {!hasMessages ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ paddingHorizontal: 20, paddingBottom: 20, alignItems: "center" }}>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 22,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <Ionicons name="compass" size={36} color="#FFFFFF" />
              </View>
              <Text style={styles.emptyTitle}>TrailMaster AI</Text>
              <Text style={styles.emptySub}>
                Plan your off-road adventure with an expert guide. Ask about trails, gear, vehicles, and trip itineraries.
              </Text>
            </View>
            <Text style={styles.suggestionsLabel}>Try asking</Text>
            {SUGGESTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                style={styles.suggestionChip}
                onPress={() => handleSend(s)}
              >
                <Text style={styles.suggestionText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <FlatList
            ref={flatListRef}
            data={[...messages].reverse()}
            inverted
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                colors={colors}
                isStreaming={isStreaming && item.id === streamingIdRef.current}
              />
            )}
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about trails, gear, routes..."
            placeholderTextColor={colors.textMuted}
            multiline
            returnKeyType="default"
            onSubmitEditing={() => handleSend()}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || isStreaming) && styles.sendBtnDisabled]}
            onPress={() => handleSend()}
            disabled={!input.trim() || isStreaming}
          >
            {isStreaming ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {Platform.OS === "web" && (
        <View style={{ height: WEB_TAB_BAR_HEIGHT }} />
      )}
    </View>
  );
}
