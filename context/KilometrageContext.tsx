import '../tasks/kmLocationTasks';

import * as Location from 'expo-location';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import { useAuth } from './AuthContext';
import {
  applyPendingLocalKmToTotal,
  persistManualOdometerKm,
  processKmLocationFix,
  readKmStateFromStorage,
} from '../services/kmEngine';
import { syncKmLocationTrackingMode } from '../services/kmLocationOrchestrator';
import { isKmBackgroundTasksRegistered } from '../services/kmTaskRegistrationState';
import { KM_KEY, KM_STATE_KEY } from '../services/kmTypes';
import type { KmPersistedState } from '../services/kmTypes';
import { hydrateVehicleActivityFromCache } from '../services/vehicleActivityGate';
import { userGetItem, userSetItem } from '../services/userStorage';
import { useVehicleActivityNative } from '../services/vehicleActivityNativeBridge';

type KilometrageContextValue = {
  km: string;
  kmJour: number;
  kmHebdo: number;
  kmMois: number;
  kmAn: number;
  isTracking: boolean;
  isDriving: boolean;
  speedKmh: number;
  updateKm: (newKm: string) => Promise<void>;
};

const KilometrageContext = createContext<KilometrageContextValue | null>(null);

function toNumberKm(value: string | number | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  if (!digits) return 0;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function formatKm(value: number): string {
  return Math.round(Math.max(0, value)).toLocaleString('fr-FR');
}

export const KilometrageProvider = ({ children }: { children: React.ReactNode }) => {
  useVehicleActivityNative(Platform.OS !== 'web');

  const { currentUserId } = useAuth();
  const [state, setState] = useState<KmPersistedState>(() => ({
    totalKm: 0,
    day: { key: '', startTotalKm: 0 },
    week: { key: '', startTotalKm: 0 },
    month: { key: '', startTotalKm: 0 },
    year: { key: '', startTotalKm: 0 },
  }));
  const [isTracking, setIsTracking] = useState(false);
  const inMemoryStateRef = useRef<KmPersistedState>(state);

  useEffect(() => {
    inMemoryStateRef.current = state;
  }, [state]);

  const persistState = async (next: KmPersistedState) => {
    try {
      await Promise.all([
        userSetItem(KM_KEY, formatKm(next.totalKm)),
        userSetItem(KM_STATE_KEY, JSON.stringify(next)),
      ]);
    } catch (error) {
      console.log('[KilometrageContext] persist failed', error);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const merged = await applyPendingLocalKmToTotal();
        if (merged) {
          inMemoryStateRef.current = merged;
          setState(merged);
          await persistState(merged);
        }
      } catch (error) {
        console.log('[KilometrageContext] load failed', error);
      }
    };
    load().catch(() => {});
  }, [currentUserId]);

  /** Sync UI avec la tâche d’arrière-plan + moteur Haversine. */
  useEffect(() => {
    if (Platform.OS === 'web') return;

    let alive = true;

    const pull = async () => {
      try {
        const merged = await readKmStateFromStorage();
        if (!alive || !merged) return;
        inMemoryStateRef.current = merged;
        setState(merged);
      } catch {
        /* ignore */
      }
    };

    const flushPending = async () => {
      try {
        const merged = await applyPendingLocalKmToTotal();
        if (!alive || !merged) return;
        inMemoryStateRef.current = merged;
        setState(merged);
        await persistState(merged);
      } catch {
        /* ignore */
      }
    };

    void flushPending();
    const id = setInterval(() => void pull(), 1500);

    const onAppState = (s: AppStateStatus) => {
      if (s === 'active') void flushPending();
    };
    const sub = AppState.addEventListener('change', onAppState);

    return () => {
      alive = false;
      clearInterval(id);
      sub.remove();
    };
  }, [currentUserId]);

  /**
   * TaskManager + tâches arrière-plan, ou repli `watchPositionAsync` (premier plan) si le module natif
   * n’est pas dans le binaire (rebuild : `npx expo run:android`).
   */
  useEffect(() => {
    if (Platform.OS === 'web') return;

    let watchSub: Location.LocationSubscription | null = null;

    const run = async () => {
      try {
        const fg = await Location.requestForegroundPermissionsAsync();
        if (fg.status !== 'granted') {
          setIsTracking(false);
          return;
        }

        await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
        await hydrateVehicleActivityFromCache();

        if (isKmBackgroundTasksRegistered) {
          await syncKmLocationTrackingMode();
        } else {
          watchSub = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.BestForNavigation,
              timeInterval: 3500,
              distanceInterval: 10,
            },
            (loc) => {
              void processKmLocationFix(loc);
            }
          );
        }
        setIsTracking(true);
      } catch (e) {
        console.log('[KilometrageContext] location init failed', e);
        setIsTracking(false);
      }
    };

    void run();
    return () => {
      watchSub?.remove();
    };
  }, []);

  const updateKm = useCallback(async (newKm: string) => {
    const nextTotal = toNumberKm(newKm);
    const next = await persistManualOdometerKm(nextTotal);
    inMemoryStateRef.current = next;
    setState(next);
  }, []);

  const speedKmh = typeof state.lastSpeedKmh === 'number' ? state.lastSpeedKmh : 0;
  const isDriving = speedKmh >= 15;

  const value = useMemo<KilometrageContextValue>(
    () => ({
      km: formatKm(state.totalKm),
      kmJour: Math.max(0, state.totalKm - state.day.startTotalKm),
      kmHebdo: Math.max(0, state.totalKm - state.week.startTotalKm),
      kmMois: Math.max(0, state.totalKm - state.month.startTotalKm),
      kmAn: Math.max(0, state.totalKm - state.year.startTotalKm),
      isTracking,
      isDriving,
      speedKmh,
      updateKm,
    }),
    [state, isTracking, isDriving, speedKmh, updateKm]
  );

  return <KilometrageContext.Provider value={value}>{children}</KilometrageContext.Provider>;
};

export const useKilometrage = () => useContext(KilometrageContext);
