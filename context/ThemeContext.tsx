import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ThemeName } from "@/constants/colors";

const STORAGE_KEY = "@app_theme";

const DEFAULT_THEME: ThemeName = "dune";

// Maps any persisted value — including the four legacy keys from before the
// theme rebuild — onto a current ThemeName. Unknown values fall back to dune so
// a stale/corrupt value never crashes startup.
const THEME_ALIASES: Record<string, ThemeName> = {
  dune: "dune",
  overland: "overland",
  apex: "apex",
  horizon: "horizon",
  // legacy → closest new identity
  darkTerrain: "dune",
  desertGold: "dune",
  stealth: "apex",
  nightRally: "apex",
};

interface ThemeContextValue {
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
  isReady: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeName: DEFAULT_THEME,
  setTheme: () => {},
  isReady: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeState] = useState<ThemeName>(DEFAULT_THEME);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!saved) return;
        const mapped = THEME_ALIASES[saved];
        if (mapped) {
          setThemeState(mapped);
          // Rewrite legacy keys so subsequent loads are already migrated.
          if (mapped !== saved) {
            AsyncStorage.setItem(STORAGE_KEY, mapped).catch(() => {});
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        setIsReady(true);
      });
  }, []);

  const setTheme = useCallback((name: ThemeName) => {
    setThemeState(name);
    AsyncStorage.setItem(STORAGE_KEY, name);
  }, []);

  return (
    <ThemeContext.Provider value={{ themeName, setTheme, isReady }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
