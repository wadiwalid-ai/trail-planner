import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { Platform } from "react-native";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useAuth } from "@/context/AuthContext";

// ── Shared status vocabulary (mirrors CONVOY_STATUSES in shared/schema.ts) ────
export const CONVOY_STATUSES = [
  "moving",
  "stopped",
  "stuck",
  "retry",
  "help",
] as const;
export type ConvoyStatus = (typeof CONVOY_STATUSES)[number];

// ── Server view shapes (mirror server/convoys/storage.ts) ─────────────────────
export interface ConvoyView {
  id: number;
  ownerUserId: string;
  name: string;
  inviteCode: string;
  isActive: boolean;
  createdAt: string | null;
  endedAt: string | null;
}

export interface AdventureMember {
  id: number;
  userId: string | null;
  displayName: string;
  vehicleLabel: string | null;
  role: string;
  status: ConvoyStatus;
  lat: number | null;
  lng: number | null;
  heading: number | null;
  speed: number | null;
  isGhost: boolean;
  helpAt: string | null;
  lastSeenAt: string | null;
  joinedAt: string | null;
}

interface ConvoyData {
  convoy: ConvoyView | null;
  members: AdventureMember[];
}

export interface MyLocation {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
}

export type LocationPermission =
  | "granted"
  | "denied"
  | "undetermined"
  | "unavailable";

interface ConvoyContextValue {
  // state
  activeConvoyId: number | null;
  convoy: ConvoyView | null;
  members: AdventureMember[];
  myMember: AdventureMember | null;
  isLoading: boolean;
  myLocation: MyLocation | null;
  locationPermission: LocationPermission;
  /** Bumped each time `recenter()` is called so a map can react to it. */
  recenterSignal: number;
  // actions
  createConvoy: (params: {
    name: string;
    vehicleLabel?: string;
  }) => Promise<ConvoyView>;
  joinConvoy: (params: {
    code: string;
    vehicleLabel?: string;
  }) => Promise<ConvoyView>;
  leaveConvoy: () => Promise<void>;
  endConvoy: () => Promise<void>;
  setStatus: (status: ConvoyStatus) => Promise<void>;
  triggerHelp: () => Promise<void>;
  setActiveConvoyId: (id: number | null) => void;
  recenter: () => void;
  /** Re-request location permission + restart the position watcher. */
  requestLocation: () => void;
}

const ConvoyContext = createContext<ConvoyContextValue | null>(null);

// Active convoy id is persisted per-user so it never bleeds across accounts.
const activeKey = (uid: string) => `@offroad_convoy_active_${uid}_v1`;

const POLL_MS = 3000;
const HEARTBEAT_MS = 6000;

function coordsToLocation(coords: {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
}): MyLocation {
  const loc: MyLocation = {
    lat: coords.latitude,
    lng: coords.longitude,
  };
  if (typeof coords.heading === "number" && coords.heading >= 0) {
    loc.heading = coords.heading;
  }
  if (typeof coords.speed === "number" && coords.speed >= 0) {
    loc.speed = coords.speed;
  }
  return loc;
}

export function ConvoyProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const [activeConvoyId, setActiveConvoyIdState] = useState<number | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [myLocation, setMyLocation] = useState<MyLocation | null>(null);
  const [locationPermission, setLocationPermission] =
    useState<LocationPermission>("undetermined");
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [locationNonce, setLocationNonce] = useState(0);

  // Refs read by the heartbeat interval so it never needs re-creating.
  const activeIdRef = useRef<number | null>(null);
  const locationRef = useRef<MyLocation | null>(null);
  const statusRef = useRef<ConvoyStatus | null>(null);

  // ── Persisted active convoy id (per-user) ──────────────────────────────────
  const persistActiveId = useCallback(
    async (id: number | null) => {
      if (!userId) return;
      try {
        if (id == null) await AsyncStorage.removeItem(activeKey(userId));
        else await AsyncStorage.setItem(activeKey(userId), String(id));
      } catch {
        // best-effort persistence
      }
    },
    [userId],
  );

  const setActiveConvoyId = useCallback(
    (id: number | null) => {
      setActiveConvoyIdState(id);
      void persistActiveId(id);
    },
    [persistActiveId],
  );

  // Restore the persisted active convoy whenever the signed-in user changes.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      if (!userId) {
        if (!cancelled) {
          setActiveConvoyIdState(null);
          setBootstrapped(true);
        }
        return;
      }
      try {
        const stored = await AsyncStorage.getItem(activeKey(userId));
        const parsed = stored ? parseInt(stored, 10) : NaN;
        if (!cancelled) {
          setActiveConvoyIdState(Number.isFinite(parsed) ? parsed : null);
        }
      } catch {
        if (!cancelled) setActiveConvoyIdState(null);
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, authLoading]);

  // ── Live convoy poll (GET /api/convoys/:id every 3s while active) ──────────
  const enabled = isAuthenticated && bootstrapped && activeConvoyId != null;
  const convoyQuery = useQuery<ConvoyData>({
    queryKey: ["/api/convoys", activeConvoyId],
    enabled,
    refetchInterval: enabled ? POLL_MS : false,
  });

  const data = convoyQuery.data ?? null;
  const convoy = data?.convoy ?? null;
  const members = useMemo<AdventureMember[]>(
    () => data?.members ?? [],
    [data],
  );
  const myMember = useMemo<AdventureMember | null>(() => {
    if (!userId) return null;
    return members.find((m) => m.userId === userId) ?? null;
  }, [members, userId]);

  // Keep refs in sync for the heartbeat interval.
  useEffect(() => {
    activeIdRef.current = activeConvoyId;
  }, [activeConvoyId]);
  useEffect(() => {
    locationRef.current = myLocation;
  }, [myLocation]);
  useEffect(() => {
    statusRef.current = myMember?.status ?? null;
  }, [myMember]);

  // Drop a stale active convoy: owner ended it, or we lost membership (403/404).
  useEffect(() => {
    if (activeConvoyId == null) return;
    if (convoy && convoy.isActive === false) {
      setActiveConvoyId(null);
      return;
    }
    if (convoyQuery.isError) {
      const msg = (convoyQuery.error as Error | null)?.message ?? "";
      if (msg.startsWith("403") || msg.startsWith("404")) {
        setActiveConvoyId(null);
      }
    }
  }, [
    activeConvoyId,
    convoy,
    convoyQuery.isError,
    convoyQuery.error,
    setActiveConvoyId,
  ]);

  // ── Device location watcher (native + web fallback) ────────────────────────
  useEffect(() => {
    if (!isAuthenticated || activeConvoyId == null) return;

    let cancelled = false;
    let cleanup: () => void = () => {};

    (async () => {
      // Web: navigator.geolocation (expo-location has no web support here).
      if (Platform.OS === "web") {
        if (
          typeof navigator === "undefined" ||
          !navigator.geolocation ||
          typeof navigator.geolocation.watchPosition !== "function"
        ) {
          setLocationPermission("unavailable");
          return;
        }
        const watchId = navigator.geolocation.watchPosition(
          (pos) => {
            if (cancelled) return;
            setLocationPermission("granted");
            setMyLocation(coordsToLocation(pos.coords));
          },
          (err) => {
            if (cancelled) return;
            // 1 = PERMISSION_DENIED
            setLocationPermission(err && err.code === 1 ? "denied" : "undetermined");
          },
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
        );
        cleanup = () => {
          try {
            navigator.geolocation.clearWatch(watchId);
          } catch {
            // ignore
          }
        };
        return;
      }

      // Native: expo-location.
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== "granted") {
          setLocationPermission(
            status === Location.PermissionStatus.DENIED
              ? "denied"
              : "undetermined",
          );
          return;
        }
        setLocationPermission("granted");

        try {
          const first = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (!cancelled) setMyLocation(coordsToLocation(first.coords));
        } catch {
          // initial fix can fail; the watcher below will still deliver one
        }

        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 5,
            timeInterval: 4000,
          },
          (loc) => {
            if (!cancelled) setMyLocation(coordsToLocation(loc.coords));
          },
        );
        cleanup = () => sub.remove();
      } catch {
        if (!cancelled) setLocationPermission("undetermined");
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [isAuthenticated, activeConvoyId, locationNonce]);

  const requestLocation = useCallback(() => {
    setLocationNonce((n) => n + 1);
  }, []);

  // ── Heartbeat (POST /api/convoys/:id/heartbeat every ~6s) ──────────────────
  const sendHeartbeat = useCallback(async () => {
    const id = activeIdRef.current;
    if (id == null) return;
    try {
      const loc = locationRef.current;
      const body: {
        lat?: number;
        lng?: number;
        heading?: number;
        speed?: number;
        status?: ConvoyStatus;
      } = {};
      if (loc) {
        body.lat = loc.lat;
        body.lng = loc.lng;
        if (loc.heading != null) body.heading = loc.heading;
        if (loc.speed != null) body.speed = loc.speed;
      }
      // Keep the server status fresh, but never re-stamp helpAt from a heartbeat
      // (help is owned by the explicit status mutation).
      const status = statusRef.current;
      if (status && status !== "help") body.status = status;

      const res = await apiRequest("POST", `/api/convoys/${id}/heartbeat`, body);
      const fresh = (await res.json()) as ConvoyData;
      // Push the fresh snapshot straight into the cache (doubles as a refresh).
      if (activeIdRef.current === id) {
        queryClient.setQueryData<ConvoyData>(["/api/convoys", id], fresh);
      }
    } catch {
      // Transient heartbeat failures are fine — the 3s poll keeps data live.
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || activeConvoyId == null) return;
    const kick = setTimeout(() => {
      void sendHeartbeat();
    }, 1500);
    const interval = setInterval(() => {
      void sendHeartbeat();
    }, HEARTBEAT_MS);
    return () => {
      clearTimeout(kick);
      clearInterval(interval);
    };
  }, [isAuthenticated, activeConvoyId, sendHeartbeat]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createConvoy = useCallback(
    async ({ name, vehicleLabel }: { name: string; vehicleLabel?: string }) => {
      const res = await apiRequest("POST", "/api/convoys", {
        name,
        ...(vehicleLabel ? { vehicleLabel } : {}),
      });
      const result = (await res.json()) as ConvoyData;
      const id = result.convoy!.id;
      queryClient.setQueryData<ConvoyData>(["/api/convoys", id], result);
      setActiveConvoyId(id);
      queryClient.invalidateQueries({ queryKey: ["/api/convoys"] });
      return result.convoy as ConvoyView;
    },
    [setActiveConvoyId],
  );

  const joinConvoy = useCallback(
    async ({ code, vehicleLabel }: { code: string; vehicleLabel?: string }) => {
      const res = await apiRequest("POST", "/api/convoys/join", {
        code: code.trim().toUpperCase(),
        ...(vehicleLabel ? { vehicleLabel } : {}),
      });
      const result = (await res.json()) as ConvoyData;
      const id = result.convoy!.id;
      queryClient.setQueryData<ConvoyData>(["/api/convoys", id], result);
      setActiveConvoyId(id);
      queryClient.invalidateQueries({ queryKey: ["/api/convoys"] });
      return result.convoy as ConvoyView;
    },
    [setActiveConvoyId],
  );

  const leaveConvoy = useCallback(async () => {
    const id = activeIdRef.current;
    if (id == null) return;
    try {
      await apiRequest("POST", `/api/convoys/${id}/leave`);
    } finally {
      setActiveConvoyId(null);
      queryClient.removeQueries({ queryKey: ["/api/convoys", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/convoys"] });
    }
  }, [setActiveConvoyId]);

  const endConvoy = useCallback(async () => {
    const id = activeIdRef.current;
    if (id == null) return;
    try {
      await apiRequest("POST", `/api/convoys/${id}/end`);
    } finally {
      setActiveConvoyId(null);
      queryClient.removeQueries({ queryKey: ["/api/convoys", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/convoys"] });
    }
  }, [setActiveConvoyId]);

  const setStatus = useCallback(async (status: ConvoyStatus) => {
    const id = activeIdRef.current;
    if (id == null) return;
    const res = await apiRequest("PATCH", `/api/convoys/${id}/status`, {
      status,
    });
    const result = (await res.json()) as { members: AdventureMember[] };
    // Optimistically reflect the new member list, then reconcile via the poll.
    queryClient.setQueryData<ConvoyData>(["/api/convoys", id], (prev) =>
      prev ? { ...prev, members: result.members } : prev,
    );
    queryClient.invalidateQueries({ queryKey: ["/api/convoys", id] });
  }, []);

  const triggerHelp = useCallback(async () => {
    await setStatus("help");
  }, [setStatus]);

  const recenter = useCallback(() => {
    setRecenterSignal((n) => n + 1);
  }, []);

  const isLoading =
    !bootstrapped || (activeConvoyId != null && convoyQuery.isLoading);

  const value = useMemo<ConvoyContextValue>(
    () => ({
      activeConvoyId,
      convoy,
      members,
      myMember,
      isLoading,
      myLocation,
      locationPermission,
      recenterSignal,
      createConvoy,
      joinConvoy,
      leaveConvoy,
      endConvoy,
      setStatus,
      triggerHelp,
      setActiveConvoyId,
      recenter,
      requestLocation,
    }),
    [
      activeConvoyId,
      convoy,
      members,
      myMember,
      isLoading,
      myLocation,
      locationPermission,
      recenterSignal,
      createConvoy,
      joinConvoy,
      leaveConvoy,
      endConvoy,
      setStatus,
      triggerHelp,
      setActiveConvoyId,
      recenter,
      requestLocation,
    ],
  );

  return (
    <ConvoyContext.Provider value={value}>{children}</ConvoyContext.Provider>
  );
}

export function useConvoy(): ConvoyContextValue {
  const ctx = useContext(ConvoyContext);
  if (!ctx) throw new Error("useConvoy must be used within a ConvoyProvider");
  return ctx;
}
