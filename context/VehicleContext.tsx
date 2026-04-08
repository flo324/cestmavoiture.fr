import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { userGetItem, userSetItem } from '../services/userStorage';

export type VehicleData = {
  alias: string;
  prenom: string;
  nom: string;
  modele: string;
  immat: string;
  photoUri: string;
  photoBgCenter: string;
  photoBgEdge: string;
};

type VehicleItem = VehicleData & { id: string };

type VehicleContextValue = {
  vehicleData: VehicleData;
  vehicles: VehicleItem[];
  activeVehicleId: string | null;
  setVehicleField: <K extends keyof VehicleData>(field: K, value: VehicleData[K]) => void;
  setVehicleData: (next: VehicleData) => void;
  addVehicle: (seed?: Partial<VehicleData>) => string;
  selectVehicle: (vehicleId: string) => void;
  deleteVehicle: (vehicleId: string) => void;
};

const STORAGE_KEY_SINGLE = '@cestmavoiture_user_v2';
const STORAGE_KEY_VEHICLES = '@cestmavoiture_user_vehicles_v1';
const STORAGE_KEY_ACTIVE = '@cestmavoiture_user_active_vehicle_v1';

const defaultVehicleData: VehicleData = {
  alias: '307',
  prenom: 'Florent',
  nom: 'DAMIANO',
  modele: '307 PEUGEOT',
  immat: '56 Ayw 13',
  photoUri: '',
  photoBgCenter: '#334155',
  photoBgEdge: '#0B1120',
};

const secondVehicleData: VehicleData = {
  alias: '107',
  prenom: 'Florent',
  nom: 'DAMIANO',
  modele: '107 PEUGEOT',
  immat: '',
  photoUri: '',
  photoBgCenter: '#334155',
  photoBgEdge: '#0B1120',
};

const VehicleContext = createContext<VehicleContextValue | undefined>(undefined);

function hasVehicleIdentity(v: Partial<VehicleData> | null | undefined): boolean {
  if (!v) return false;
  return [v.alias, v.modele, v.immat, v.prenom, v.nom].some((x) => String(x ?? '').trim().length > 0);
}

function ensureBaseFleet(list: VehicleItem[]): VehicleItem[] {
  const next = [...list];
  const has307 = next.some((v) => `${v.alias} ${v.modele}`.toUpperCase().includes('307'));
  const has107 = next.some((v) => `${v.alias} ${v.modele}`.toUpperCase().includes('107'));
  if (!has307) {
    next.unshift({ id: `seed-307`, ...defaultVehicleData });
  }
  if (!has107) {
    next.push({ id: `seed-107`, ...secondVehicleData });
  }
  return next;
}

export function VehicleProvider({ children }: { children: React.ReactNode }) {
  const { currentUserId } = useAuth();
  const [vehicles, setVehicles] = useState<VehicleItem[]>([{ id: 'default', ...defaultVehicleData }]);
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>('default');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [rawVehicles, rawActive, rawLegacy] = await Promise.all([
          userGetItem(STORAGE_KEY_VEHICLES),
          userGetItem(STORAGE_KEY_ACTIVE),
          userGetItem(STORAGE_KEY_SINGLE),
        ]);
        if (rawVehicles) {
          const parsed = JSON.parse(rawVehicles) as VehicleItem[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            const normalized = parsed.map((v, idx) => ({
              id: String(v?.id || `v-${idx + 1}`),
              alias: String(v?.alias ?? ''),
              prenom: String(v?.prenom ?? ''),
              nom: String(v?.nom ?? ''),
              modele: String(v?.modele ?? ''),
              immat: String(v?.immat ?? ''),
              photoUri: String(v?.photoUri ?? ''),
              photoBgCenter: String(v?.photoBgCenter ?? '#334155'),
              photoBgEdge: String(v?.photoBgEdge ?? '#0B1120'),
            }));
            const withFleet = ensureBaseFleet(normalized);
            const fallbackId = withFleet.find((v) => hasVehicleIdentity(v))?.id ?? withFleet[0].id;
            const activeId =
              rawActive && withFleet.some((v) => v.id === rawActive) ? rawActive : fallbackId;
            setActiveVehicleId(activeId);
            if (rawLegacy) {
              const legacy = JSON.parse(rawLegacy) as Partial<VehicleData>;
              const activeVehicle = withFleet.find((v) => v.id === activeId);
              if (!hasVehicleIdentity(activeVehicle) && hasVehicleIdentity(legacy)) {
                const repaired = withFleet.map((v) =>
                  v.id === activeId
                    ? {
                        ...v,
                        alias: String(legacy?.alias ?? legacy?.modele ?? defaultVehicleData.alias),
                        prenom: String(legacy?.prenom ?? defaultVehicleData.prenom),
                        nom: String(legacy?.nom ?? defaultVehicleData.nom),
                        modele: String(legacy?.modele ?? defaultVehicleData.modele),
                        immat: String(legacy?.immat ?? defaultVehicleData.immat),
                        photoUri: String(legacy?.photoUri ?? ''),
                        photoBgCenter: String(legacy?.photoBgCenter ?? '#334155'),
                        photoBgEdge: String(legacy?.photoBgEdge ?? '#0B1120'),
                      }
                    : v
                );
                setVehicles(repaired);
              } else {
                setVehicles(withFleet);
              }
            } else {
              setVehicles(withFleet);
            }
            setHydrated(true);
            return;
          }
        }
        if (rawLegacy) {
          const parsed = JSON.parse(rawLegacy) as Partial<VehicleData>;
          const migrated: VehicleItem = {
            id: 'default',
            alias: String(parsed?.alias ?? parsed?.modele ?? defaultVehicleData.alias),
            prenom: String(parsed?.prenom ?? defaultVehicleData.prenom),
            nom: String(parsed?.nom ?? defaultVehicleData.nom),
            modele: String(parsed?.modele ?? defaultVehicleData.modele),
            immat: String(parsed?.immat ?? defaultVehicleData.immat),
            photoUri: String(parsed?.photoUri ?? ''),
            photoBgCenter: String(parsed?.photoBgCenter ?? '#334155'),
            photoBgEdge: String(parsed?.photoBgEdge ?? '#0B1120'),
          };
          const fleet = ensureBaseFleet([migrated]);
          setVehicles(fleet);
          setActiveVehicleId(fleet[0].id);
          setHydrated(true);
          return;
        }
        const fleet = ensureBaseFleet([{ id: 'default', ...defaultVehicleData }]);
        setVehicles(fleet);
        setActiveVehicleId(fleet[0].id);
      } catch (error) {
        console.log('[VehicleContext] load failed', error);
      } finally {
        setHydrated(true);
      }
    };
    load();
  }, [currentUserId]);

  useEffect(() => {
    if (!hydrated) return;
    userSetItem(STORAGE_KEY_VEHICLES, JSON.stringify(vehicles)).catch((error) => {
      console.log('[VehicleContext] save failed', error);
    });
    userSetItem(STORAGE_KEY_ACTIVE, activeVehicleId ?? '').catch((error) => {
      console.log('[VehicleContext] save active failed', error);
    });
  }, [vehicles, activeVehicleId, hydrated]);

  const vehicleData = useMemo<VehicleData>(() => {
    const active = vehicles.find((v) => v.id === activeVehicleId) ?? vehicles[0];
    if (!active) return defaultVehicleData;
    return {
      alias: active.alias,
      prenom: active.prenom,
      nom: active.nom,
      modele: active.modele,
      immat: active.immat,
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
      setVehicleField: (field, fieldValue) => {
        setVehicles((prev) => {
          const activeId = activeVehicleId ?? prev[0]?.id;
          if (!activeId) return prev;
          return prev.map((v) => (v.id === activeId ? { ...v, [field]: fieldValue } : v));
        });
      },
      setVehicleData: (next) => {
        setVehicles((prev) => {
          const activeId = activeVehicleId ?? prev[0]?.id;
          if (!activeId) return prev;
          return prev.map((v) => (v.id === activeId ? { ...v, ...next } : v));
        });
      },
      addVehicle: (seed) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const item: VehicleItem = {
          id,
          alias: seed?.alias ?? '',
          prenom: seed?.prenom ?? '',
          nom: seed?.nom ?? '',
          modele: seed?.modele ?? 'Nouveau véhicule',
          immat: seed?.immat ?? '',
          photoUri: seed?.photoUri ?? '',
          photoBgCenter: seed?.photoBgCenter ?? '#334155',
          photoBgEdge: seed?.photoBgEdge ?? '#0B1120',
        };
        setVehicles((prev) => [item, ...prev]);
        setActiveVehicleId(id);
        return id;
      },
      selectVehicle: (vehicleId) => {
        setActiveVehicleId(vehicleId);
      },
      deleteVehicle: (vehicleId) => {
        setVehicles((prev) => {
          if (prev.length <= 1) return prev;
          const next = prev.filter((v) => v.id !== vehicleId);
          if (next.length === prev.length) return prev;
          if (activeVehicleId === vehicleId) setActiveVehicleId(next[0].id);
          return next;
        });
      },
    }),
    [vehicleData, vehicles, activeVehicleId]
  );

  return <VehicleContext.Provider value={value}>{children}</VehicleContext.Provider>;
}

export function useVehicle() {
  const ctx = useContext(VehicleContext);
  if (!ctx) throw new Error('useVehicle must be used within VehicleProvider');
  return ctx;
}

