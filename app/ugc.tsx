import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import type { AppColors } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/context/AuthContext";

interface UgcClause {
  key: string;
  title: string;
  text: string;
}

const PREREQ_CHECKS: { key: string; label: string }[] = [
  { key: "hasRecoveryGear", label: "I carry recovery gear (MaxTrax, snatch strap, or winch)" },
  { key: "hasEmergencyContact", label: "I have an emergency contact set up" },
  { key: "hasFirstAid", label: "I carry a first-aid kit" },
  { key: "hasNavigation", label: "I have offline maps or a GPS unit" },
  { key: "hasLockingDiffs", label: "My vehicle has locking differentials" },
  { key: "hasConvoyExperience", label: "I have convoy / group off-road experience" },
];

export default function UgcOnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const s = styles(colors);
  const { isAuthenticated } = useAuth();

  const [step, setStep] = useState<0 | 1>(0);
  const [submitting, setSubmitting] = useState(false);

  // Prerequisites form state
  const [vehicleType, setVehicleType] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  // UGC agreement state
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});

  const { data: clausesData } = useQuery<{ clauses: UgcClause[] }>({
    queryKey: ["/api/ugc-clauses"],
  });
  const clauses = clausesData?.clauses ?? [];

  const toggleCheck = useCallback((key: string) => {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleAgreed = useCallback((key: string) => {
    setAgreed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const submitPrerequisites = useCallback(async () => {
    if (!vehicleType.trim() || vehicleType.trim().length < 2) {
      Alert.alert("Vehicle required", "Tell us what you drive.");
      return;
    }
    const years = parseInt(experienceYears || "0", 10);
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/user/prerequisites", {
        vehicleType: vehicleType.trim(),
        driveExperienceYears: isNaN(years) ? 0 : years,
        hasLockingDiffs: !!checks.hasLockingDiffs,
        hasRecoveryGear: !!checks.hasRecoveryGear,
        hasEmergencyContact: !!checks.hasEmergencyContact,
        hasFirstAid: !!checks.hasFirstAid,
        hasNavigation: !!checks.hasNavigation,
        hasConvoyExperience: !!checks.hasConvoyExperience,
      });
      setStep(1);
    } catch (e) {
      Alert.alert("Error", "Could not save your details. Try again.");
    } finally {
      setSubmitting(false);
    }
  }, [vehicleType, experienceYears, checks]);

  const allAgreed = clauses.length > 0 && clauses.every((c) => agreed[c.key]);

  const submitAgreement = useCallback(async () => {
    if (!allAgreed) {
      Alert.alert("Agreement required", "Please accept all clauses to continue.");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/user/ugc-agreement", {
        agreedToContentLicense: !!agreed.agreedToContentLicense,
        agreedToDataDistribution: !!agreed.agreedToDataDistribution,
        confirmsOriginalContent: !!agreed.confirmsOriginalContent,
        acknowledgesAccuracyDisclaimer: !!agreed.acknowledgesAccuracyDisclaimer,
        acknowledgesOsmAttribution: !!agreed.acknowledgesOsmAttribution,
      });
      Alert.alert("All set", "You can now share and publish your tracks.", [
        { text: "Done", onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert("Error", "Could not record your agreement. Try again.");
    } finally {
      setSubmitting(false);
    }
  }, [allAgreed, agreed]);

  if (!isAuthenticated) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: "Sign in required" }} />
        <Ionicons name="person-circle-outline" size={56} color={colors.textMuted} />
        <Text style={s.emptyText}>Sign in to publish tracks.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: step === 0 ? "Before You Share" : "Content Agreement",
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
        }}
      />
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingBottom: insets.bottom + 40 + (Platform.OS === "web" ? 34 : 0),
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Step indicator */}
        <View style={s.steps}>
          <View style={[s.stepDot, { backgroundColor: colors.primary }]} />
          <View style={[s.stepLine, { backgroundColor: step === 1 ? colors.primary : colors.border }]} />
          <View style={[s.stepDot, { backgroundColor: step === 1 ? colors.primary : colors.border }]} />
        </View>

        {step === 0 ? (
          <>
            <Text style={s.heading}>Trail readiness</Text>
            <Text style={s.sub}>
              Shared tracks help others plan safely. Confirm you&apos;re equipped before you publish.
            </Text>

            <Text style={s.label}>Your vehicle</Text>
            <TextInput
              value={vehicleType}
              onChangeText={setVehicleType}
              placeholder="e.g. Toyota Land Cruiser 200"
              placeholderTextColor={colors.textMuted}
              style={s.input}
            />

            <Text style={s.label}>Off-road experience (years)</Text>
            <TextInput
              value={experienceYears}
              onChangeText={(t) => setExperienceYears(t.replace(/[^0-9]/g, ""))}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              style={s.input}
            />

            <View style={{ height: 8 }} />
            {PREREQ_CHECKS.map((c) => (
              <TouchableOpacity
                key={c.key}
                style={s.checkRow}
                onPress={() => toggleCheck(c.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={checks[c.key] ? "checkbox" : "square-outline"}
                  size={24}
                  color={checks[c.key] ? colors.primary : colors.textMuted}
                />
                <Text style={s.checkLabel}>{c.label}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[s.primaryBtn, submitting && { opacity: 0.6 }]}
              onPress={submitPrerequisites}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.primaryBtnText}>Continue</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={s.heading}>Content agreement</Text>
            <Text style={s.sub}>
              Tap each clause to accept. These protect you and other riders.
            </Text>

            {clauses.map((c) => (
              <TouchableOpacity
                key={c.key}
                style={s.clauseCard}
                onPress={() => toggleAgreed(c.key)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={agreed[c.key] ? "checkbox" : "square-outline"}
                  size={24}
                  color={agreed[c.key] ? colors.primary : colors.textMuted}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.clauseTitle}>{c.title}</Text>
                  <Text style={s.clauseText}>{c.text}</Text>
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[s.primaryBtn, (!allAgreed || submitting) && { opacity: 0.5 }]}
              onPress={submitAgreement}
              disabled={!allAgreed || submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.primaryBtnText}>Accept &amp; finish</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={s.backLink} onPress={() => setStep(0)}>
              <Text style={s.backLinkText}>Back to readiness</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = (c: AppColors) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    emptyText: { color: c.textSecondary, fontFamily: "Inter_500Medium", marginTop: 12 },
    steps: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 20 },
    stepDot: { width: 12, height: 12, borderRadius: 6 },
    stepLine: { width: 60, height: 2, marginHorizontal: 6 },
    heading: { fontSize: 24, fontFamily: "Inter_700Bold", color: c.text, marginBottom: 6 },
    sub: { fontSize: 14, fontFamily: "Inter_400Regular", color: c.textSecondary, marginBottom: 20, lineHeight: 20 },
    label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.textSecondary, marginBottom: 6, marginTop: 8 },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: c.radiusSm,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: c.text,
      marginBottom: 4,
    },
    checkRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
    checkLabel: { flex: 1, marginLeft: 12, fontSize: 14, fontFamily: "Inter_500Medium", color: c.text },
    clauseCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: c.radius,
      padding: 16,
      marginBottom: 12,
    },
    clauseTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: c.text, marginBottom: 4 },
    clauseText: { fontSize: 13, fontFamily: "Inter_400Regular", color: c.textSecondary, lineHeight: 19 },
    primaryBtn: {
      backgroundColor: c.primary,
      borderRadius: c.radius,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 16,
    },
    primaryBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
    backLink: { alignItems: "center", paddingVertical: 16 },
    backLinkText: { color: c.textSecondary, fontFamily: "Inter_500Medium" },
  });
