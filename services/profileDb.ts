import { supabase } from './supabase';

export type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  prenom: string;
  nom: string;
  updated_at?: string;
};

export async function fetchProfileFromSupabase(userId: string): Promise<Pick<ProfileRow, 'prenom' | 'nom'> | null> {
  const { data, error } = await supabase.from('profiles').select('prenom, nom').eq('id', userId).maybeSingle();

  if (error) {
    console.warn('[profileDb] fetch', error.message);
    return null;
  }
  if (!data) return null;
  const row = data as { prenom?: string; nom?: string };
  return {
    prenom: row.prenom ?? '',
    nom: row.nom ?? '',
  };
}

export async function upsertProfileNames(
  userId: string,
  payload: { prenom: string; nom: string; email?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('profiles').upsert(
    {
      id: userId,
      prenom: payload.prenom.trim(),
      nom: payload.nom.trim(),
      ...(payload.email ? { email: payload.email } : {}),
    },
    { onConflict: 'id' }
  );

  if (error) {
    console.warn('[profileDb] upsert', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
