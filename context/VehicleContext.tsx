import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { fetchProfileFromSupabase } from '../services/profileDb';
import {
  deleteVehicleFromSupabase,
  fetchVehiclesFromSupabase,
  insertVehicle,
  subscribeVehicles,
} from '../services/vehiclesDb';
import { userGetItem, userSetItem } from '../services/userStorage';
import { isSupabaseConfigured } from '../services/supabase';
import type { VehicleData, VehicleItem } from '../types/vehicle';

export type { VehicleData, VehicleItem } from '../types/vehicle';

type VehicleContextValue = {
  vehicleData: VehicleData;
  vehicles: VehicleItem[];
  activeVehicleId: string | null;
  setVehicleField: <K extends keyof VehicleData>(field: K, value: VehicleData[K]) => void;
  setVehicleData: (next: VehicleData) => void;
  addVehicle: (seed?: Partial<VehicleData>) => Promise<string | null>;
  /** Après un insert Supabase : remplace l’id local `default` par la ligne serveur. */
  registerInsertedVehicle: (item: VehicleItem) => void;
  selectVehicle: (vehicleId: string) => void;
  deleteVehicle: (vehicleId: string) => void;
};

const STORAGE_KEY_VEHICLES = '@cestmavoiture_user_vehicles_v1';
const STORAGE_KEY_ACTIVE = '@cestmavoiture_user_active_vehicle_v1';

const defaultVehicleData: VehicleData = {
  marque: '',
  modele: '',
  immat: '',
  kilometrage: 0,
  alias: '',
  prenom: '',
  nom: '',
  photoUri: '',
  photoBgCenter: '#334155',
  photoBgEdge: '#0B1120',
};

const VehicleContext = createContext<VehicleContextValue | undefined>(undefined);

function newLocalVehicleId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function mergeWithLocalExtras(next: VehicleItem[], prev: VehicleItem[]): VehicleItem[] {
  return next.map((v) => {
    const old = prev.find((p) => p.id === v.id);
    if (!old) return v;
    return {
      ...v,
      alias: old.alias,
      prenom: old.prenom,
      nom: old.nom,
      photoBgCenter: old.photoBgCenter,
      photoBgEdge: old.photoBgEdge,
    };
  });
}

function isLegacyDemoVehicle(v: VehicleItem): boolean {
  const identity = `${v.alias} ${v.prenom} ${v.nom} ${v.modele} ${v.immat}`.toUpperCase();
  if (v.id === 'seed-307' || v.id === 'seed-107') return true;
  if (identity.includes('FLORENT') && identity.includes('DAMIANO')) return true;
  if (identity.includes('307 PEUGEOT') || identity.includes('107 PEUGEOT')) return true;
  return false;
}

function normalizeStoredVehicle(raw: unknown, idx: number): VehicleItem {
  const v = raw as Partial<VehicleItem>;
  return {
    id: String(v?.id || `v-${idx + 1}`),
    marque: String(v?.marque ?? ''),
    modele: String(v?.modele ?? ''),
    immat: String(v?.immat ?? ''),
    kilometrage:
      typeof v?.kilometrage === 'number' && Number.isFinite(v.kilometrage)
        ? Math.max(0, v.kilometrage)
        : 0,
    alias: String(v?.alias ?? ''),
    prenom: String(v?.prenom ?? ''),
    nom: String(v?.nom ?? ''),
    photoUri: String(v?.photoUri ?? ''),
    photoBgCenter: String(v?.photoBgCenter ?? '#334155'),
    photoBgEdge: String(v?.photoBgEdge ?? '#0B1120'),
  };
}

export function VehicleProvider({ children }: { children: React.ReactNode }) {
  const { currentUserId } = useAuth();
  const [vehicles, setVehicles] = useState<VehicleItem[]>([{ id: 'default', ...defaultVehicleData }]);
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>('default');
  const [hydrated, setHydrated] = useState(false);

  const refreshFromRemote = useCallback(async () => {
    if (!currentUserId || !isSupabaseConfigured()) return;
    const list = await fetchVehiclesFromSupabase(currentUserId);
    if (list === null) return;
    const profile = await fetchProfileFromSupabase(currentUserId);
    setVehicles((prev) => {
      let next = mergeWithLocalExtras(list, prev);
      if (profile) {
        next = next.map((v) => ({ ...v, prenom: profile.prenom, nom: profile.nom }));
      }
      return next;
    });
  }, [currentUserId]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribeRealtime: (() => void) | undefined;

    const load = async () => {
      try {
        if (currentUserId && isSupabaseConfigured()) {
          const remote = await fetchVehiclesFromSupabase(currentUserId);
          if (cancelled) return;
          if (remote === null) {
            setHydrated(true);
            return;
          }
          const cleaned = remote.filter((v) => !isLegacyDemoVehicle(v));
          const safeVehicles = cleaned.length > 0 ? cleaned : remote;
          const rawActive = await userGetItem(STORAGE_KEY_ACTIVE);
          const fallbackId = safeVehicles[0]?.id ?? null;
          const activeId =
            rawActive && safeVehicles.some((v) => v.id === rawActive) ? rawActive : fallbackId;
          setActiveVehicleId(activeId);
          setVehicles(safeVehicles);

          const profile = await fetchProfileFromSupabase(currentUserId);
          if (!cancelled && profile) {
            setVehicles((prev) => prev.map((v) => ({ ...v, prenom: profile.prenom, nom: profile.nom })));
          }

          const { unsubscribe } = subscribeVehicles(currentUserId, () => {
            void refreshFromRemote();
          });
          unsubscribeRealtime = unsubscribe;

          setHydrated(true);
          return;
        }

        const [rawVehicles, rawActive] = await Promise.all([
          userGetItem(STORAGE_KEY_VEHICLES),
          userGetItem(STORAGE_KEY_ACTIVE),
        ]);
        if (rawVehicles) {
          const parsed = JSON.parse(rawVehicles) as unknown[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            const normalized = parsed.map((v, idx) => normalizeStoredVehicle(v, idx));
            const cleaned = normalized.filter((v) => !isLegacyDemoVehicle(v));
            const safeVehicles = cleaned.length > 0 ? cleaned : [{ id: 'default', ...defaultVehicleData }];
            const fallbackId = safeVehicles[0]?.id ?? 'default';
            const activeId =
              rawActive && safeVehicles.some((v) => v.id === rawActive) ? rawActive : fallbackId;
            setActiveVehicleId(activeId);
            setVehicles(safeVehicles);
            setHydrated(true);
            return;
          }
        }
        const fleet = [{ id: 'default', ...defaultVehicleData }];
        setVehicles(fleet);
        setActiveVehicleId(fleet[0].id);
      } catch (error) {
        console.log('[VehicleContext] load failed', error);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    };

    void load();

    return () => {
      cancelled = true;
      unsubscribeRealtime?.();
    };
  }, [currentUserId, refreshFromRemote]);

  useEffect(() => {
    if (!hydrated) return;
    if (!(currentUserId && isSupabaseConfigured())) {
      userSetItem(STORAGE_KEY_VEHICLES, JSON.stringify(vehicles)).catch((error) => {
        console.log('[VehicleContext] save failed', error);
      });
    }
    userSetItem(STORAGE_KEY_ACTIVE, activeVehicleId ?? '').catch((error) => {
      console.log('[VehicleContext] save active failed', error);
    });
  }, [vehicles, activeVehicleId, hydrated, currentUserId]);

  const vehicleData = useMemo<VehicleData>(() => {
    const active = vehicles.find((v) => v.id === activeVehicleId) ?? vehicles[0];
    if (!active) return defaultVehicleData;
    return {
      marque: active.marque,
      modele: active.modele,
      immat: active.immat,
      kilometrage: active.kilometrage,
      alias: active.alias,
      prenom: active.prenom,
      nom: active.nom,
      photoUri: active.photoUri,
      photoBgCenter: active.photoBgCenter,
      photoBgEdge: active.photoBgEdge,
    };
  }, [vehicles, activeVehicleId]);

  const value = useMemo(
    () => ({
      vehicleData,
      vehicles,
      activeVehicleId,
      setVehicleField: <K extends keyof VehicleData>(field: K, fieldValue: VehicleData[K]) => {
        setVehicles((prev) => {
          const activeId = activeVehicleId ?? prev[0]?.id;
          if (!activeId) return prev;
          return prev.map((v) => (v.id === activeId ? { ...v, [field]: fieldValue } : v));
        });
      },
      setVehicleData: (next: VehicleData) => {
        setVehicles((prev) => {
          const activeId = activeVehicleId ?? prev[0]?.id;
          if (!activeId) return prev;
          return prev.map((v) => (v.id === activeId ? { ...v, ...next } : v));
        });
      },
      registerInsertedVehicle: (item: VehicleItem) => {
        setVehicles((prev) => {
          const withoutDup = prev.filter((v) => v.id !== item.id);
          const withoutDefault = withoutDup.filter((v) => v.id !== 'default');
          return [item, ...withoutDefault];
        });
        setActiveVehicleId(item.id);
      },
      addVehicle: async (seed?: Partial<VehicleData>) => {
        if (currentUserId && isSupabaseConfigured()) {
          const inserted = await insertVehicle(
            currentUserId,
            {
              marque: (seed?.marque ?? '').trim(),
              modele: (seed?.modele ?? 'Nouveau véhicule').trim(),
              immatriculation: (seed?.immat ?? '').trim(),
              kilometrage: typeof seed?.kilometrage === 'number' ? Math.max(0, seed.kilometrage) : 0,
              photo_url: seed?.photoUri ? seed.photoUri : null,
            },
            {
              alias: seed?.alias ?? '',
              prenom: seed?.prenom ?? '',
              nom: seed?.nom ?? '',
              photoBgCenter: seed?.photoBgCenter ?? '#334155',
              photoBgEdge: seed?.photoBgEdge ?? '#0B1120',
            }
          );
          if (inserted) {
            setVehicles((prev) => [inserted, ...prev.filter((p) => p.id !== inserted.id)]);
            setActiveVehicleId(inserted.id);
            return inserted.id;
          }
          return null;
        }

        const id = newLocalVehicleId();
        const item: VehicleItem = {
          id,
          marque: seed?.marque ?? '',
          modele: seed?.modele ?? 'Nouveau véhicule',
          immat: seed?.immat ?? '',
          kilometrage: typeof seed?.kilometrage === 'number' ? seed.kilometrage : 0,
          alias: seed?.alias ?? '',
          prenom: seed?.prenom ?? '',
          nom: seed?.nom ?? '',
          photoUri: seed?.photoUri ?? '',
          photoBgCenter: seed?.photoBgCenter ?? '#334155',
          photoBgEdge: seed?.photoBgEdge ?? '#0B1120',
        };
        setVehicles((prev) => [item, ...prev]);
        setActiveVehicleId(id);
        return id;
      },
      selectVehicle: (vehicleId: string) => {
        setActiveVehicleId(vehicleId);
      },
      deleteVehicle: (vehicleId: string) => {
        if (currentUserId && isSupabaseConfigured()) {
          void deleteVehicleFromSupabase(currentUserId, vehicleId);
        }
        setVehicles((prev) => {
          if (prev.length <= 1) return prev;
          const next = prev.filter((v) => v.id !== vehicleId);
          if (next.length === prev.length) return prev;
          if (activeVehicleId === vehicleId) setActiveVehicleId(next[0].id);
          return next;
        });
      },
    }),
    [vehicleData, vehicles, activeVehicleId, currentUserId]
  );

  return <VehicleContext.Provider value={value}>{children}</VehicleContext.Provider>;
}

export function useVehicle() {
  const ctx = useContext(VehicleContext);
  if (!ctx) throw new Error('useVehicle must be used within VehicleProvider');
  return ctx;
}
