import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/context/AuthContext";

export interface Trip {
  id: string;
  title: string;
  destination: string;
  vehicle: string;
  terrain: string;
  duration: string;
  difficulty: number;
  notes: string;
  savedAt: string;
}

interface TripsContextValue {
  trips: Trip[];
  addTrip: (trip: Omit<Trip, "id" | "savedAt">) => Promise<void>;
  removeTrip: (id: string) => Promise<void>;
  isLoading: boolean;
  isSyncing: boolean;
}

const TripsContext = createContext<TripsContextValue | null>(null);
// Trips created while logged out live in a single anonymous bucket. Once a user
// signs in, those trips are migrated up to their account and the bucket is
// cleared so they can never bleed into a different account on the next login.
const ANON_KEY = "@offroad_trips_anon_v1";
const userKey = (uid: string) => `@offroad_trips_user_${uid}_v1`;

async function readFromKey(key: string): Promise<Trip[]> {
  try {
    const stored = await AsyncStorage.getItem(key);
    return stored ? (JSON.parse(stored) as Trip[]) : [];
  } catch {
    return [];
  }
}

async function writeToKey(key: string, value: Trip[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export function TripsProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // The active storage key tracks the signed-in user (or the anon bucket).
  const storageKey = userId ? userKey(userId) : ANON_KEY;

  const persistLocal = useCallback(
    async (updated: Trip[]) => {
      await writeToKey(storageKey, updated);
    },
    [storageKey],
  );

  // Load + sync whenever the signed-in user changes (or auth settles).
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    (async () => {
      setIsLoading(true);

      if (!userId) {
        // Logged out — the anonymous bucket is the source of truth.
        const anon = await readFromKey(ANON_KEY);
        if (!cancelled) {
          setTrips(anon);
          setIsLoading(false);
        }
        return;
      }

      // Logged in — server is the source of truth. Migrate any anon-only trips
      // up to this account, then clear the anon bucket.
      setIsSyncing(true);
      try {
        const res = await apiRequest("GET", "/api/me/trips");
        const data = await res.json();
        const serverTrips: Trip[] = data.trips ?? [];
        const serverIds = new Set(serverTrips.map((t) => t.id));

        const anon = await readFromKey(ANON_KEY);
        const anonOnly = anon.filter((t) => !serverIds.has(t.id));

        let merged = serverTrips;
        if (anonOnly.length > 0) {
          const pushRes = await apiRequest("POST", "/api/me/trips", {
            trips: anonOnly.map((t) => ({ ...t, clientId: t.id })),
          });
          const pushData = await pushRes.json();
          merged = pushData.trips ?? serverTrips;
          await AsyncStorage.removeItem(ANON_KEY);
        }

        if (!cancelled) {
          setTrips(merged);
          await writeToKey(userKey(userId), merged);
        }
      } catch (e) {
        console.error("Trip sync failed, using local copy", e);
        const userLocal = await readFromKey(userKey(userId));
        if (!cancelled) setTrips(userLocal);
      } finally {
        if (!cancelled) {
          setIsSyncing(false);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, authLoading]);

  const addTrip = useCallback(
    async (data: Omit<Trip, "id" | "savedAt">) => {
      const trip: Trip = {
        ...data,
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        savedAt: new Date().toISOString(),
      };
      const optimistic = [trip, ...trips];
      setTrips(optimistic);
      await persistLocal(optimistic);

      if (isAuthenticated) {
        try {
          const res = await apiRequest("POST", "/api/me/trips", {
            ...trip,
            clientId: trip.id,
          });
          const resData = await res.json();
          if (resData.trips) {
            setTrips(resData.trips);
            await persistLocal(resData.trips);
          }
        } catch (e) {
          console.error("Failed to sync new trip", e);
        }
      }
    },
    [trips, isAuthenticated, persistLocal],
  );

  const removeTrip = useCallback(
    async (id: string) => {
      const updated = trips.filter((t) => t.id !== id);
      setTrips(updated);
      await persistLocal(updated);

      if (isAuthenticated) {
        try {
          await apiRequest("DELETE", `/api/me/trips/${id}`);
        } catch (e) {
          console.error("Failed to delete trip on server", e);
        }
      }
    },
    [trips, isAuthenticated, persistLocal],
  );

  const value = useMemo(
    () => ({ trips, addTrip, removeTrip, isLoading, isSyncing }),
    [trips, addTrip, removeTrip, isLoading, isSyncing],
  );

  return <TripsContext.Provider value={value}>{children}</TripsContext.Provider>;
}

export function useTrips() {
  const ctx = useContext(TripsContext);
  if (!ctx) throw new Error("useTrips must be used within TripsProvider");
  return ctx;
}
