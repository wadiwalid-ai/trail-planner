import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from "@expo-google-fonts/outfit";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
  IBMPlexMono_700Bold,
} from "@expo-google-fonts/ibm-plex-mono";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
  JetBrainsMono_800ExtraBold,
} from "@expo-google-fonts/jetbrains-mono";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/context/AuthContext";
import { TripsProvider } from "@/context/TripsContext";
import { UnitsProvider } from "@/context/UnitsContext";
import { ConvoyProvider } from "@/context/ConvoyContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { useColors } from "@/hooks/useColors";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="trail/[id]" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="map" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="offline-maps" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="ugc" options={{ headerShown: true, presentation: "modal" }} />
      <Stack.Screen name="convoy" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="admin/users" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="admin/audit" options={{ headerShown: false, presentation: "card" }} />
    </Stack>
  );
}

function SplashGate({
  fontsReady,
  children,
}: {
  fontsReady: boolean;
  children: React.ReactNode;
}) {
  const { isReady: themeReady } = useTheme();
  const appReady = fontsReady && themeReady;

  useEffect(() => {
    if (appReady) {
      SplashScreen.hideAsync();
    }
  }, [appReady]);

  if (!appReady) return null;

  return <>{children}</>;
}

// Drives the OS status bar contrast from the active theme: dark icons on light
// themes (Horizon/Overland), light icons on dark themes.
function ThemedStatusBar() {
  const colors = useColors();
  return <StatusBar style={colors.mode === "light" ? "dark" : "light"} />;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
    IBMPlexMono_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
    JetBrainsMono_800ExtraBold,
  });

  const fontsReady = fontsLoaded || fontError != null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SplashGate fontsReady={fontsReady}>
            <SafeAreaProvider>
              <ThemedStatusBar />
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <AuthProvider>
                    <UnitsProvider>
                      <TripsProvider>
                        <ConvoyProvider>
                          <RootLayoutNav />
                        </ConvoyProvider>
                      </TripsProvider>
                    </UnitsProvider>
                  </AuthProvider>
                </KeyboardProvider>
              </GestureHandlerRootView>
            </SafeAreaProvider>
          </SplashGate>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
