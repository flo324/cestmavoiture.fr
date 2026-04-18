import type { VehicleItem } from '../types/vehicle';
import { supabase } from './supabase';

/** Ligne `public.vehicles` (schéma OTTO). */
export type VehicleRow = {
  id: string;
  user_id: string;
  marque: string;
  modele: string;
  immatriculation: string;
  kilometrage: number | string | null;
  photo_url: string | null;
  created_at?: string;
  updated_at?: string;
};

export type VehicleRemoteInsert = {
  marque: string;
  modele: string;
  immatriculation: string;
  kilometrage: number;
  photo_url: string | null;
};

export type VehicleRemotePatch = Partial<VehicleRemoteInsert>;

export function parseKmInput(value: string): number {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  if (!digits) return 0;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function numKm(v: number | string | null | undefined): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, v);
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return 0;
}

/** Mappe une ligne SQL vers le modèle app (immat / photoUri). */
export function rowToItem(row: VehicleRow, localExtras?: Partial<Pick<VehicleItem, 'alias' | 'prenom' | 'nom' | 'photoBgCenter' | 'photoBgEdge'>>): VehicleItem {
  return {
    id: row.id,
    marque: row.marque ?? '',
    modele: row.modele ?? '',
    immat: row.immatriculation ?? '',
    kilometrage: numKm(row.kilometrage),
    alias: localExtras?.alias ?? '',
    prenom: localExtras?.prenom ?? '',
    nom: localExtras?.nom ?? '',
    photoUri: row.photo_url ?? '',
    photoBgCenter: localExtras?.photoBgCenter ?? '#334155',
    photoBgEdge: localExtras?.photoBgEdge ?? '#0B1120',
  };
}

/** Charge la flotte depuis Supabase (session requise, RLS). */
export async function fetchVehiclesFromSupabase(userId: string): Promise<VehicleItem[] | null> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[vehiclesDb] fetch', error.message);
    return null;
  }
  if (!data?.length) return [];
  return (data as VehicleRow[]).map((row) => rowToItem(row));
}

/** Insertion d’un véhicule (retourne la ligne créée avec `id` uuid). */
export async function insertVehicle(
  userId: string,
  payload: VehicleRemoteInsert,
  localExtras?: Partial<Pick<VehicleItem, 'alias' | 'prenom' | 'nom' | 'photoBgCenter' | 'photoBgEdge'>>
): Promise<VehicleItem | null> {
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      user_id: userId,
      marque: payload.marque,
      modele: payload.modele,
      immatriculation: payload.immatriculation,
      kilometrage: payload.kilometrage,
      photo_url: payload.photo_url,
    })
    .select('*')
    .single();

  if (error) {
    console.warn('[vehiclesDb] insert', error.message);
    return null;
  }
  return rowToItem(data as VehicleRow, localExtras);
}

/** Indique si la chaîne est un UUID (lignes Supabase), pas un id local comme `default`. */
export function isRemoteVehicleId(vehicleId: string | null | undefined): boolean {
  if (!vehicleId || vehicleId === 'default') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(vehicleId);
}

export async function updateVehicleRemoteFields(
  userId: string,
  vehicleId: string,
  patch: VehicleRemotePatch
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase
    .from('vehicles')
    .update(patch)
    .eq('id', vehicleId)
    .eq('user_id', userId)
    .select('id');

  if (error) {
    console.warn('[vehiclesDb] update', error.message);
    return { ok: false, error: error.message };
  }
  if (!data?.length) {
    const msg =
      'Aucune ligne mise à jour (id véhicule inconnu en base — souvent id local « default » : enregistrez à nouveau après mise à jour app).';
    console.warn('[vehiclesDb] update', msg);
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export async function deleteVehicleFromSupabase(userId: string, vehicleId: string): Promise<void> {
  const { error } = await supabase.from('vehicles').delete().eq('id', vehicleId).eq('user_id', userId);
  if (error) console.warn('[vehiclesDb] delete', error.message);
}

/** Abonnement temps réel : toute modification sur `vehicles` de l’utilisateur déclenche `onChange`. */
export function subscribeVehicles(userId: string, onChange: () => void): { unsubscribe: () => void } {
  const channel = supabase
    .channel(`vehicles-live-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'vehicles', filter: `user_id=eq.${userId}` },
      () => {
        onChange();
      }
    )
    .subscribe();

  return {
    unsubscribe: () => {
      void supabase.removeChannel(channel);
    },
  };
}
