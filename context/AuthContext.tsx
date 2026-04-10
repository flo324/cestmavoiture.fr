import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import { clearCurrentUserLocalData, toUserId } from '../services/userStorage';

const AUTH_REDIRECT_TO = 'monapplivoiture://login';
const SESSION_KEY = '@garage_connect_session_v2';
const ONBOARDING_STATUS_KEY = '@garage_connect_onboarding_v1';
const REMEMBER_LOGIN_KEY = '@garage_connect_remember_login_v1';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

type AuthContextValue = {
  isReady: boolean;
  isLoggedIn: boolean;
  hasRegisteredAccount: boolean;
  currentLogin: string | null;
  currentUserId: string | null;
  accountLogins: string[];
  register: (
    login: string,
    password: string,
    options?: { fullName?: string }
  ) => Promise<{ ok: boolean; error?: string; hasSession?: boolean }>;
  login: (login: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  switchAccount: (login: string) => Promise<{ ok: boolean; error?: string }>;
  resetPassword: (email: string) => Promise<{ ok: boolean; error?: string }>;
  resendConfirmationEmail: (email: string) => Promise<{ ok: boolean; error?: string }>;
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

  const register = useCallback(async (email: string, password: string, options?: { fullName?: string }) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();
    if (!cleanEmail.includes('@')) return { ok: false as const, error: 'Email invalide.' };
    if (cleanPass.length < 8) {
      return { ok: false as const, error: 'Mot de passe : au moins 8 caractères.' };
    }
    if (!SUPABASE_URL?.trim() || !SUPABASE_ANON_KEY?.trim()) {
      return {
        ok: false as const,
        error:
          'Configuration Supabase manquante : créez un fichier .env à la racine avec EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY, puis redémarrez Expo (arrêter puis npx expo start).',
      };
    }

    const cleanFullName = String(options?.fullName ?? '').trim();
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: cleanPass,
      options: {
        emailRedirectTo: AUTH_REDIRECT_TO,
        data: cleanFullName ? { full_name: cleanFullName } : undefined,
      },
    });

    if (error) {
      return { ok: false as const, error: error.message };
    }
    if (!data.user) {
      return {
        ok: false as const,
        error:
          "Inscription non finalisée côté Supabase. Vérifiez que l'application pointe vers le bon projet (URL/ANON KEY).",
      };
    }

    // Sans « Confirm email » dans Supabase, une session est renvoyée tout de suite (hasSession: true).
    if (!data.session) {
      return {
        ok: true as const,
        hasSession: false,
      };
    }

    setSessionLogin(data.user?.email?.toLowerCase() ?? cleanEmail);
    setCurrentUserId(data.user?.id ?? toUserId(cleanEmail));
    return { ok: true as const, hasSession: true };
  }, []);

  const loginFn = useCallback(async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();
    if (!SUPABASE_URL?.trim() || !SUPABASE_ANON_KEY?.trim()) {
      return {
        ok: false as const,
        error:
          'Configuration Supabase manquante : ajoutez EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY dans .env puis redémarrez Expo.',
      };
    }
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

  const resendConfirmationEmail = useCallback(async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes('@')) return { ok: false as const, error: 'Email invalide.' };

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: cleanEmail,
      options: { emailRedirectTo: AUTH_REDIRECT_TO },
    });
    if (!error) return { ok: true as const };

    // Fallback: some providers block "signup resend"; password reset email often still delivers.
    const resetFallback = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: AUTH_REDIRECT_TO,
    });
    if (!resetFallback.error) return { ok: true as const };

    return { ok: false as const, error: error.message };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    await AsyncStorage.removeItem(SESSION_KEY);
    setSessionLogin(null);
    setCurrentUserId(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    const sessionResult = await supabase.auth.getSession();
    let accessToken = sessionResult.data.session?.access_token;
    const email = sessionResult.data.session?.user?.email?.trim().toLowerCase() || '';
    if (!accessToken) return { ok: false as const, error: 'Session invalide. Reconnectez-vous puis réessayez.' };
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { ok: false as const, error: 'Configuration Supabase manquante.' };
    }

    // Ensure a fresh token for sensitive auth actions.
    const refreshed = await supabase.auth.refreshSession();
    accessToken = refreshed.data.session?.access_token ?? accessToken;

    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok && response.status !== 404) {
      let details = '';
      try {
        details = await response.text();
      } catch {
        details = '';
      }
      const lower = details.toLowerCase();
      if (response.status === 403 || lower.includes('not allowed') || lower.includes('forbidden')) {
        return {
          ok: false as const,
          error:
            "Suppression refusée par Supabase. Activez l'autorisation de suppression de compte utilisateur dans Authentication > Settings.",
        };
      }
      if (response.status === 401 || lower.includes('jwt') || lower.includes('token')) {
        return { ok: false as const, error: 'Session expirée. Reconnectez-vous puis relancez la suppression.' };
      }
      return {
        ok: false as const,
        error: `Suppression impossible (${response.status}). ${details || 'Veuillez réessayer.'}`,
      };
    }

    await clearCurrentUserLocalData();
    await AsyncStorage.removeItem(ONBOARDING_STATUS_KEY).catch(() => {});
    if (email) {
      try {
        const rawRemember = await AsyncStorage.getItem(REMEMBER_LOGIN_KEY);
        if (rawRemember) {
          const parsed = JSON.parse(rawRemember) as {
            remember?: boolean;
            email?: string;
            password?: string;
            byEmail?: Record<string, string>;
          };
          const byEmail = { ...(parsed.byEmail || {}) };
          delete byEmail[email];
          const next = {
            ...parsed,
            byEmail,
            email: parsed.email?.toLowerCase() === email ? '' : parsed.email || '',
            password: parsed.email?.toLowerCase() === email ? '' : parsed.password || '',
          };
          await AsyncStorage.setItem(REMEMBER_LOGIN_KEY, JSON.stringify(next));
        }
      } catch {
        // ignore local remember payload corruption
      }
    }
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
      resendConfirmationEmail,
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
      resendConfirmationEmail,
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
