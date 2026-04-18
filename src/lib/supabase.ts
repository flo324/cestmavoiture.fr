import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

/**
 * Supabase local (CLI) : API sur le port 54321.
 * - Web / iOS simulateur : http://127.0.0.1:54321
 * - Émulateur Android : souvent http://10.0.2.2:54321 (machine hôte)
 * - Téléphone physique : IP LAN du PC, ex. http://192.168.1.x:54321
 *
 * Clé anonyme : Dashboard Supabase → Settings → API, ou `supabase status` en local.
 * Définir dans .env : EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY
 */
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? LOCAL_SUPABASE_URL).trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

if (!supabaseAnonKey) {
  console.warn(
    '[Supabase] EXPO_PUBLIC_SUPABASE_ANON_KEY manquante — ajoutez-la dans .env (voir clé anon locale avec `supabase status`).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}
