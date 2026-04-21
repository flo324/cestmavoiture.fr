import { supabase } from './supabase';

type ScanDocInput = {
  vehicleId: string | null | undefined;
  docType: string;
  title: string;
  payload: Record<string, unknown>;
};

export type ScanSupabaseDoc = {
  id: string;
  title: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

async function getCurrentUserId(): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  return sessionData?.session?.user?.id ?? null;
}

function normalizeVehicleId(raw: string | null | undefined): string | null {
  const vid = raw?.trim();
  return vid && vid !== 'default' ? vid : null;
}

/**
 * Enregistre un dossier issu du scan dans `public.documents` (payload JSON, aligné migration garage).
 * Sans bloquer le flux si hors ligne ou non connecté.
 */
export async function syncScanDossierToSupabase(input: ScanDocInput): Promise<void> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const vehicleId = normalizeVehicleId(input.vehicleId);

    const { error } = await supabase.from('documents').insert({
      user_id: userId,
      vehicle_id: vehicleId,
      doc_type: input.docType,
      title: input.title,
      payload: input.payload,
    });
    if (error) console.log('[scanDocumentSupabase] insert', error.message);
  } catch (e) {
    console.log('[scanDocumentSupabase] skipped', e);
  }
}

/** Permis : un seul document par compte (upsert logique côté app). */
export async function upsertSingleScanDocToSupabase(input: ScanDocInput): Promise<string | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;
    const vehicleId = normalizeVehicleId(input.vehicleId);

    let query = supabase
      .from('documents')
      .select('id')
      .eq('user_id', userId)
      .eq('doc_type', input.docType)
      .order('updated_at', { ascending: false })
      .limit(1);
    query = vehicleId ? query.eq('vehicle_id', vehicleId) : query.is('vehicle_id', null);

    const { data: existing, error: selectError } = await query.maybeSingle();
    if (selectError) {
      console.log('[scanDocumentSupabase] upsert select', selectError.message);
    }

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          title: input.title,
          payload: input.payload,
        })
        .eq('id', existing.id)
        .eq('user_id', userId);
      if (updateError) {
        console.log('[scanDocumentSupabase] upsert update', updateError.message);
        return null;
      }
      return existing.id;
    }

    const { data: inserted, error: insertError } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        vehicle_id: vehicleId,
        doc_type: input.docType,
        title: input.title,
        payload: input.payload,
      })
      .select('id')
      .single();
    if (insertError) {
      console.log('[scanDocumentSupabase] upsert insert', insertError.message);
      return null;
    }
    return inserted?.id ?? null;
  } catch (e) {
    console.log('[scanDocumentSupabase] upsert skipped', e);
    return null;
  }
}

/** Carte grise : insertion multiple (historique). */
export async function insertScanDocToSupabase(input: ScanDocInput): Promise<string | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;
    const vehicleId = normalizeVehicleId(input.vehicleId);
    const { data, error } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        vehicle_id: vehicleId,
        doc_type: input.docType,
        title: input.title,
        payload: input.payload,
      })
      .select('id')
      .single();
    if (error) {
      console.log('[scanDocumentSupabase] insert multi', error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (e) {
    console.log('[scanDocumentSupabase] insert multi skipped', e);
    return null;
  }
}

export async function fetchScanDocsFromSupabase(input: {
  docType: string;
  vehicleId?: string | null;
}): Promise<ScanSupabaseDoc[]> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];
    const vehicleId = normalizeVehicleId(input.vehicleId ?? null);

    let query = supabase
      .from('documents')
      .select('id,title,payload,created_at,updated_at')
      .eq('user_id', userId)
      .eq('doc_type', input.docType)
      .order('updated_at', { ascending: false });
    query = vehicleId ? query.eq('vehicle_id', vehicleId) : query.is('vehicle_id', null);

    const { data, error } = await query;
    if (error) {
      console.log('[scanDocumentSupabase] fetch', error.message);
      return [];
    }
    return (data ?? []) as ScanSupabaseDoc[];
  } catch (e) {
    console.log('[scanDocumentSupabase] fetch skipped', e);
    return [];
  }
}

export async function deleteScanDocFromSupabase(docId: string): Promise<void> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return;
    const { error } = await supabase.from('documents').delete().eq('id', docId).eq('user_id', userId);
    if (error) console.log('[scanDocumentSupabase] delete', error.message);
  } catch (e) {
    console.log('[scanDocumentSupabase] delete skipped', e);
  }
}

export async function updateScanDocInSupabase(input: {
  docId: string;
  title: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return;
    const { error } = await supabase
      .from('documents')
      .update({
        title: input.title,
        payload: input.payload,
      })
      .eq('id', input.docId)
      .eq('user_id', userId);
    if (error) console.log('[scanDocumentSupabase] update', error.message);
  } catch (e) {
    console.log('[scanDocumentSupabase] update skipped', e);
  }
}
