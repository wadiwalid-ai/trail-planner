// Dynamic Expo config — replaces app.json so we can inject build-time secrets.
// Keep all static config in the `expo` object below; use process.env for anything
// that differs between environments or must not be checked in as plain text.

export default {
  expo: {
    name: "Trail Planner",
    slug: "trail-planner",
    owner: "walidwadi",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "trailplanner",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/images/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#0A1612",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.walidwadi.trailplanner",
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsLocalNetworking: true,
        },
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: "com.walidwadi.trailplanner",
      adaptiveIcon: {
        backgroundColor: "#1B4332",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      permissions: [
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.RECORD_AUDIO",
        "android.permission.MODIFY_AUDIO_SETTINGS",
      ],
    },
    web: {
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "@maplibre/maplibre-react-native",
      [
        "expo-router",
        {
          origin: "https://replit.com/",
        },
      ],
      "expo-font",
      "expo-web-browser",
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Allow Trail Planner to access your location for weather and nearby trail recommendations.",
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "Allow Trail Planner to attach photos to points along your recorded track.",
          cameraPermission:
            "Allow Trail Planner to take photos along your recorded track.",
        },
      ],
      [
        "expo-audio",
        {
          microphonePermission:
            "Allow Trail Planner to record voice notes along your track.",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {
        origin: "https://replit.com/",
      },
      eas: {
        projectId: "79cd6f0c-6708-46f3-ba12-2447f932814f",
      },
      // Injected at build time from the MAPTILER_API_KEY secret.
      // The key is a public client-side tile key — safe to embed in the bundle.
      mapTilerKey: process.env.MAPTILER_API_KEY ?? null,
    },
  },
};
