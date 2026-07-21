import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useType } from "@/hooks/useType";
import { useConvoy } from "@/context/ConvoyContext";

export default function JoinConvoyScreen() {
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { joinConvoy } = useConvoy();

  const [code, setCode] = useState<string>("");
  const [vehicle, setVehicle] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/convoy" as any);
  }, [router]);

  const submit = useCallback(async () => {
    const trimmed = code.trim();
    if (trimmed.length < 4) {
      Alert.alert("Enter the code", "Type the invite code your group shared with you.");
      return;
    }
    setBusy(true);
    try {
      await joinConvoy({
        code: trimmed,
        vehicleLabel: vehicle.trim() || undefined,
      });
      router.replace("/convoy" as any);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      const clean = msg.includes(":") ? msg.slice(msg.indexOf(":") + 1).trim() : msg;
      Alert.alert("Could not join", clean || "Check the code and try again.");
    } finally {
      setBusy(false);
    }
  }, [code, vehicle, joinConvoy, router]);

  const topPad = (Platform.OS === "web" ? 67 : insets.top) + 8;
  const bottomPad = (Platform.OS === "web" ? 34 : insets.bottom) + 24;
  const s = styles(colors);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[s.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={s.backBtn} onPress={goBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { fontFamily: type.displayBold }]}>Join a convoy</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAwareScrollView
        bottomOffset={20}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingBottom: bottomPad }}
      >
        <View style={[s.iconWrap, { backgroundColor: colors.primary + "1A" }]}>
          <Ionicons name="enter-outline" size={28} color={colors.primary} />
        </View>
        <Text style={[s.lead, { fontFamily: type.regular }]}>
          Ask the convoy owner for their invite code, then drop it in below to
          join the live map.
        </Text>

        <Text style={[s.label, { fontFamily: type.medium }]}>Invite code</Text>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          placeholder="ABC123"
          placeholderTextColor={colors.textMuted}
          style={[s.input, s.codeInput, { fontFamily: type.monoMedium }]}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          maxLength={12}
          returnKeyType="next"
          testID="convoy-code"
        />

        <Text style={[s.label, { fontFamily: type.medium }]}>Your vehicle (optional)</Text>
        <TextInput
          value={vehicle}
          onChangeText={setVehicle}
          placeholder="e.g. Toyota Hilux"
          placeholderTextColor={colors.textMuted}
          style={s.input}
          maxLength={40}
          returnKeyType="done"
          onSubmitEditing={submit}
          testID="convoy-join-vehicle"
        />

        <TouchableOpacity
          style={[s.primaryBtn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
          onPress={submit}
          disabled={busy}
          activeOpacity={0.85}
          testID="convoy-join-submit"
        >
          {busy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[s.primaryBtnText, { color: colors.onPrimary, fontFamily: type.semibold }]}>
              Join convoy
            </Text>
          )}
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </View>
  );
}

function styles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingBottom: 10,
      backgroundColor: c.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: c.radiusSm,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.background,
    },
    headerTitle: { fontSize: 18, color: c.text },
    iconWrap: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      marginBottom: 16,
      marginTop: 4,
    },
    lead: {
      fontSize: 14,
      color: c.textSecondary,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 24,
    },
    label: {
      fontSize: 12,
      color: c.textSecondary,
      marginBottom: 8,
      letterSpacing: 0.3,
    },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: c.radius,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 16,
      color: c.text,
      marginBottom: 18,
    },
    codeInput: {
      fontSize: 24,
      letterSpacing: 6,
      textAlign: "center",
    },
    primaryBtn: {
      borderRadius: c.radius,
      paddingVertical: 16,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 6,
    },
    primaryBtnText: { fontSize: 16 },
  });
}
