import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, setAuthToken, queryClient } from "@/lib/query-client";

export interface AuthUser {
  id: string;
  username: string;
  isAdmin?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signup: (username: string, password: string, agreedToTerms: boolean) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const TOKEN_KEY = "@offroad_auth_token_v1";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore a persisted session on launch and validate it against the server.
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(TOKEN_KEY);
        if (stored) {
          setAuthToken(stored);
          try {
            const res = await apiRequest("GET", "/api/auth/me");
            const data = await res.json();
            setUser(data.user);
            setToken(stored);
          } catch {
            // Token expired or invalid — clear it.
            setAuthToken(null);
            await AsyncStorage.removeItem(TOKEN_KEY);
          }
        }
      } catch (e) {
        console.error("Failed to restore session", e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const persistSession = useCallback(async (newToken: string, newUser: AuthUser) => {
    // Drop any cached server data from a previous session so user-scoped
    // queries (/api/me/*) never show the prior account's data.
    queryClient.clear();
    setAuthToken(newToken);
    setToken(newToken);
    setUser(newUser);
    await AsyncStorage.setItem(TOKEN_KEY, newToken);
  }, []);

  const signup = useCallback(
    async (username: string, password: string, agreedToTerms: boolean) => {
      const res = await apiRequest("POST", "/api/auth/signup", {
        username,
        password,
        agreedToTerms,
      });
      const data = await res.json();
      await persistSession(data.token, data.user);
    },
    [persistSession],
  );

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await apiRequest("POST", "/api/auth/login", { username, password });
      const data = await res.json();
      await persistSession(data.token, data.user);
    },
    [persistSession],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {
      // Ignore network errors on logout — clear locally regardless.
    }
    setAuthToken(null);
    setToken(null);
    setUser(null);
    await AsyncStorage.removeItem(TOKEN_KEY);
    // Clear cached server data so the next account starts clean.
    queryClient.clear();
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: !!user,
      signup,
      login,
      logout,
    }),
    [user, token, isLoading, signup, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
