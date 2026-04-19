"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getMe, login as apiLogin, refreshToken, type User } from "@/lib/api";

type AuthState = {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const TOKEN_KEY = "gitbacker_token";
const REFRESH_KEY = "gitbacker_refresh";

function readToken(): { access: string | null; refresh: string | null } {
  if (typeof window === "undefined") return { access: null, refresh: null };
  return {
    access:
      localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY),
    refresh:
      localStorage.getItem(REFRESH_KEY) ??
      sessionStorage.getItem(REFRESH_KEY),
  };
}

function writeToken(access: string, refresh: string, remember: boolean) {
  const primary = remember ? localStorage : sessionStorage;
  const secondary = remember ? sessionStorage : localStorage;
  primary.setItem(TOKEN_KEY, access);
  primary.setItem(REFRESH_KEY, refresh);
  secondary.removeItem(TOKEN_KEY);
  secondary.removeItem(REFRESH_KEY);
}

function clearToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
}

function rewriteTokenPair(access: string, refresh: string) {
  // Preserve whichever storage already held the previous pair.
  const storage = localStorage.getItem(TOKEN_KEY) ? localStorage : sessionStorage;
  storage.setItem(TOKEN_KEY, access);
  storage.setItem(REFRESH_KEY, refresh);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const { access, refresh } = readToken();
    if (access) {
      setToken(access);
      getMe(access)
        .then(setUser)
        .catch(async () => {
          if (refresh) {
            try {
              const res = await refreshToken(refresh);
              rewriteTokenPair(res.access_token, res.refresh_token);
              setToken(res.access_token);
              const me = await getMe(res.access_token);
              setUser(me);
              return;
            } catch {
              // fallthrough
            }
          }
          clearToken();
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string, remember = true) => {
      const res = await apiLogin(email, password);
      writeToken(res.access_token, res.refresh_token, remember);
      setToken(res.access_token);
      const me = await getMe(res.access_token);
      setUser(me);
    },
    [],
  );

  const logout = useCallback(() => {
    clearToken();
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const me = await getMe(token);
    setUser(me);
  }, [token]);

  return (
    <AuthContext.Provider
      value={{ token, user, isLoading, login, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
