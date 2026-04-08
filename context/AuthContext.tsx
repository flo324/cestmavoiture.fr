import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import { clearCurrentUserLocalData, toUserId } from '../services/userStorage';

const AUTH_REDIRECT_TO = 'monapplivoiture://login';
const SESSION_KEY = '@garage_connect_session_v2';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

type AuthContextValue = {
  isReady: boolean;
  isLoggedIn: boolean;
  hasRegisteredAccount: boolean;
  currentLogin: string | null;
  currentUserId: string | null;
  accountLogins: string[];
  register: (login: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  login: (login: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  switchAccount: (login: string) => Promise<{ ok: boolean; error?: string }>;
  resetPassword: (email: string) => Promise<{ ok: boolean; error?: string }>;
  deleteAccount: () => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [sessionLogin, setSessionLogin] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.log('[Auth] getSession error', error.message);
        }
        if (!cancelled) {
          const user = data.session?.user ?? null;
          const email = user?.email?.toLowerCase() ?? null;
          setSessionLogin(email);
          setCurrentUserId(user?.id ?? null);
        }
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      const email = user?.email?.toLowerCase() ?? null;
      setSessionLogin(email);
      setCurrentUserId(user?.id ?? null);
      if (user?.id) {
        AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ login: email ?? '', userId: user.id })).catch(() => {});
      } else {
        AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
      }
      setIsReady(true);
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const hasRegisteredAccount = true;

  const register = useCallback(async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();
    if (!cleanEmail.includes('@')) return { ok: false as const, error: 'Email invalide.' };
    if (cleanPass.length < 8) {
      return { ok: false as const, error: 'Mot de passe : au moins 8 caractères.' };
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: cleanPass,
      options: { emailRedirectTo: AUTH_REDIRECT_TO },
    });

    if (error) {
      return { ok: false as const, error: error.message };
    }

    // If email confirmation is enabled, Supabase may return no session immediately.
    if (!data.session) {
      return {
        ok: true as const,
      };
    }

    setSessionLogin(data.user?.email?.toLowerCase() ?? cleanEmail);
    setCurrentUserId(data.user?.id ?? toUserId(cleanEmail));
    return { ok: true as const };
  }, []);

  const loginFn = useCallback(async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPass,
    });

    if (error) {
      return { ok: false as const, error: error.message };
    }

    setSessionLogin(data.user?.email?.toLowerCase() ?? cleanEmail);
    setCurrentUserId(data.user?.id ?? toUserId(cleanEmail));
    return { ok: true as const };
  }, []);

  const switchAccount = useCallback(async () => {
    return { ok: false as const, error: "Fonction non disponible avec l'authentification email." };
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes('@')) return { ok: false as const, error: 'Email invalide.' };

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: AUTH_REDIRECT_TO,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    await AsyncStorage.removeItem(SESSION_KEY);
    setSessionLogin(null);
    setCurrentUserId(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return { ok: false as const, error: 'Session invalide. Reconnectez-vous puis réessayez.' };
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { ok: false as const, error: 'Configuration Supabase manquante.' };
    }

    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      return { ok: false as const, error: 'Suppression impossible pour le moment. Veuillez réessayer.' };
    }

    await clearCurrentUserLocalData();
    await supabase.auth.signOut();
    await AsyncStorage.removeItem(SESSION_KEY);
    setSessionLogin(null);
    setCurrentUserId(null);
    return { ok: true as const };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isReady,
      isLoggedIn: sessionLogin != null,
      hasRegisteredAccount,
      currentLogin: sessionLogin,
      currentUserId,
      accountLogins: [],
      register,
      login: loginFn,
      switchAccount,
      resetPassword,
      deleteAccount,
      logout,
    }),
    [
      isReady,
      sessionLogin,
      currentUserId,
      hasRegisteredAccount,
      register,
      loginFn,
      switchAccount,
      resetPassword,
      deleteAccount,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
