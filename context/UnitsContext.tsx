import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  formatDistance as fmtDistance,
  formatElevation as fmtElevation,
  formatSpeed as fmtSpeed,
  formatDuration as fmtDuration,
  formatTimer as fmtTimer,
  formatTemperature as fmtTemperature,
  unitLabels,
  type UnitSystem,
  type TempUnit,
} from "@/lib/units";

const STORAGE_KEY = "units.system.v1";
const TEMP_STORAGE_KEY = "units.temp.v1";

interface UnitsContextValue {
  system: UnitSystem;
  setSystem: (s: UnitSystem) => void;
  toggle: () => void;
  /** Temperature unit (Celsius / Fahrenheit) — independent of the distance system. */
  tempUnit: TempUnit;
  setTempUnit: (u: TempUnit) => void;
  toggleTemp: () => void;
  ready: boolean;
  /** Format meters → distance in the active system; null if input is null. */
  formatDistance: (meters: number | null | undefined) => string | null;
  /** Format meters → elevation in the active system; null if input is null. */
  formatElevation: (meters: number | null | undefined) => string | null;
  /** Format m/s → speed in the active system; null if input is null. */
  formatSpeed: (mps: number | null | undefined) => string | null;
  /** Format °C → temperature in the active unit; null if input is null. */
  formatTemperature: (celsius: number | null | undefined) => string | null;
  /** Format seconds → compact duration ("4h 12m"); null if input is null. */
  formatDuration: (seconds: number | null | undefined) => string | null;
  /** Format seconds → clock timer ("MM:SS"). */
  formatTimer: (seconds: number | null | undefined) => string;
  distanceUnit: string;
  elevationUnit: string;
  speedUnit: string;
  temperatureUnit: string;
}

const UnitsContext = createContext<UnitsContextValue | undefined>(undefined);

export function UnitsProvider({ children }: { children: React.ReactNode }) {
  const [system, setSystemState] = useState<UnitSystem>("metric");
  const [tempUnit, setTempUnitState] = useState<TempUnit>("C");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [saved, savedTemp] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(TEMP_STORAGE_KEY),
        ]);
        if (mounted && (saved === "metric" || saved === "imperial")) {
          setSystemState(saved);
        }
        if (mounted && (savedTemp === "C" || savedTemp === "F")) {
          setTempUnitState(savedTemp);
        }
      } catch {
        // ignore – default metric / Celsius
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const setSystem = useCallback((s: UnitSystem) => {
    setSystemState(s);
    AsyncStorage.setItem(STORAGE_KEY, s).catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    setSystemState((prev) => {
      const next = prev === "metric" ? "imperial" : "metric";
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const setTempUnit = useCallback((u: TempUnit) => {
    setTempUnitState(u);
    AsyncStorage.setItem(TEMP_STORAGE_KEY, u).catch(() => {});
  }, []);

  const toggleTemp = useCallback(() => {
    setTempUnitState((prev) => {
      const next = prev === "C" ? "F" : "C";
      AsyncStorage.setItem(TEMP_STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<UnitsContextValue>(
    () => ({
      system,
      setSystem,
      toggle,
      tempUnit,
      setTempUnit,
      toggleTemp,
      ready,
      formatDistance: (m) => fmtDistance(m, system),
      formatElevation: (m) => fmtElevation(m, system),
      formatSpeed: (mps) => fmtSpeed(mps, system),
      formatTemperature: (c) => fmtTemperature(c, tempUnit),
      formatDuration: (s) => fmtDuration(s),
      formatTimer: (s) => fmtTimer(s),
      distanceUnit: unitLabels.distanceShort(system),
      elevationUnit: unitLabels.elevationShort(system),
      speedUnit: unitLabels.speedShort(system),
      temperatureUnit: unitLabels.temperatureShort(tempUnit),
    }),
    [system, setSystem, toggle, tempUnit, setTempUnit, toggleTemp, ready],
  );

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits(): UnitsContextValue {
  const ctx = useContext(UnitsContext);
  if (!ctx) {
    throw new Error("useUnits must be used within a UnitsProvider");
  }
  return ctx;
}
