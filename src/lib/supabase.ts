import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

/**
 * Supabase local (CLI) : API sur le port 54321.
 * Clé anonyme : Dashboard → Settings → API, ou `supabase status` en local.
 *
 * Builds EAS / APK : le .env n’est pas inclus. Définir **EXPO_PUBLIC_SUPABASE_*** sur
 * https://expo.dev → Projet → Environment variables (profil preview / production).
 */
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';

const envUrl = String(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const envKey = String(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

/** Jamais de clé vide vers createClient ; jamais 127.0.0.1 en build release sans .env (téléphone ≠ PC). */
const PLACEHOLDER_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.placeholder';

const resolvedUrl = envUrl || (typeof __DEV__ !== 'undefined' && __DEV__ ? LOCAL_SUPABASE_URL : 'https://placeholder.supabase.co');
const resolvedKey = envKey || PLACEHOLDER_JWT;

if (!envKey || !envUrl) {
  if (typeof __DEV__ === 'undefined' || !__DEV__) {
    console.warn(
      '[Supabase] Variables EXPO_PUBLIC_SUPABASE_* absentes dans ce build APK — ajoutez-les sur expo.dev → Environment variables puis refaites un build preview.'
    );
  } else if (!envKey) {
    console.warn('[Supabase] EXPO_PUBLIC_SUPABASE_ANON_KEY manquante — voir .env ou `supabase status`.');
  }
}

export const supabase = createClient(resolvedUrl, resolvedKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export function isSupabaseConfigured(): boolean {
  return Boolean(envUrl && envKey);
}
