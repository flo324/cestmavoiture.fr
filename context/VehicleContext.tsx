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

const STORAGE_KEY_VEHICLES = '@cestmavoiture_user_vehicles_v1';
const STORAGE_KEY_ACTIVE = '@cestmavoiture_user_active_vehicle_v1';

const defaultVehicleData: VehicleData = {
  alias: '',
  prenom: '',
  nom: '',
  modele: '',
  immat: '',
  photoUri: '',
  photoBgCenter: '#334155',
  photoBgEdge: '#0B1120',
};

const VehicleContext = createContext<VehicleContextValue | undefined>(undefined);

function isLegacyDemoVehicle(v: VehicleItem): boolean {
  const identity = `${v.alias} ${v.prenom} ${v.nom} ${v.modele} ${v.immat}`.toUpperCase();
  if (v.id === 'seed-307' || v.id === 'seed-107') return true;
  if (identity.includes('FLORENT') && identity.includes('DAMIANO')) return true;
  if (identity.includes('307 PEUGEOT') || identity.includes('107 PEUGEOT')) return true;
  return false;
}

export function VehicleProvider({ children }: { children: React.ReactNode }) {
  const { currentUserId } = useAuth();
  const [vehicles, setVehicles] = useState<VehicleItem[]>([{ id: 'default', ...defaultVehicleData }]);
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>('default');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [rawVehicles, rawActive] = await Promise.all([
          userGetItem(STORAGE_KEY_VEHICLES),
          userGetItem(STORAGE_KEY_ACTIVE),
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

