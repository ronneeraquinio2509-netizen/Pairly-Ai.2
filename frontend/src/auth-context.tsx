import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, TOKEN_KEY, User } from "@/src/api";
import { storage } from "@/src/utils/storage";

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, role: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    const token = await storage.secureGet<string>(TOKEN_KEY, "");
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      setUser(await api.me());
    } catch {
      await storage.secureRemove(TOKEN_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email: email.trim(), password });
    await storage.secureSet(TOKEN_KEY, res.token);
    setUser(res.user);
  }, []);

  const signUp = useCallback(
    async (name: string, email: string, password: string, role: string) => {
      const res = await api.signup({ name, email: email.trim(), password, role });
      await storage.secureSet(TOKEN_KEY, res.token);
      setUser(res.user);
    },
    [],
  );

  const signOut = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setUser(await api.me());
    } catch {
      /* keep current user on transient failure */
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, signUp, signOut, refresh, setUser }),
    [user, loading, signIn, signUp, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
