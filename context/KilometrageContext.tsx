import * as Location from 'expo-location';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { userGetItem, userSetItem } from '../services/userStorage';

const KM_KEY = '@kilometrage_save';
const KM_STATE_KEY = '@kilometrage_state_v2';

type KmPersistedState = {
  totalKm: number;
  day: { key: string; startTotalKm: number };
  week: { key: string; startTotalKm: number };
  month: { key: string; startTotalKm: number };
  year: { key: string; startTotalKm: number };
};

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

function getDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function getWeekKey(d = new Date()): string {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getMonthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getYearKey(d = new Date()): string {
  return String(d.getFullYear());
}

function haversineKm(a: Location.LocationObjectCoords, b: Location.LocationObjectCoords): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const y = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * y;
}

function buildFreshState(totalKm: number): KmPersistedState {
  return {
    totalKm,
    day: { key: getDayKey(), startTotalKm: totalKm },
    week: { key: getWeekKey(), startTotalKm: totalKm },
    month: { key: getMonthKey(), startTotalKm: totalKm },
    year: { key: getYearKey(), startTotalKm: totalKm },
  };
}

function rotatePeriodsIfNeeded(state: KmPersistedState): KmPersistedState {
  const next = { ...state };
  const dayKey = getDayKey();
  const weekKey = getWeekKey();
  const monthKey = getMonthKey();
  const yearKey = getYearKey();

  if (next.day.key !== dayKey) next.day = { key: dayKey, startTotalKm: next.totalKm };
  if (next.week.key !== weekKey) next.week = { key: weekKey, startTotalKm: next.totalKm };
  if (next.month.key !== monthKey) next.month = { key: monthKey, startTotalKm: next.totalKm };
  if (next.year.key !== yearKey) next.year = { key: yearKey, startTotalKm: next.totalKm };

  return next;
}

export const KilometrageProvider = ({ children }: { children: React.ReactNode }) => {
  const { currentUserId } = useAuth();
  const [state, setState] = useState<KmPersistedState>(buildFreshState(0));
  const [isTracking, setIsTracking] = useState(false);
  const [isDriving, setIsDriving] = useState(false);
  const [speedKmh, setSpeedKmh] = useState(0);

  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const lastPointRef = useRef<Location.LocationObject | null>(null);
  const inMemoryStateRef = useRef<KmPersistedState>(state);
  const smoothedSpeedRef = useRef(0);

  useEffect(() => {
    inMemoryStateRef.current = state;
  }, [state]);

  const persistState = async (next: KmPersistedState) => {
    try {
      await Promise.all([userSetItem(KM_KEY, formatKm(next.totalKm)), userSetItem(KM_STATE_KEY, JSON.stringify(next))]);
    } catch (error) {
      console.log('[KilometrageContext] persist failed', error);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [rawState, rawKm] = await Promise.all([userGetItem(KM_STATE_KEY), userGetItem(KM_KEY)]);

        if (rawState) {
          const parsed = JSON.parse(rawState) as Partial<KmPersistedState>;
          const total = toNumberKm(parsed?.totalKm ?? 0);
          const merged: KmPersistedState = {
            ...buildFreshState(total),
            ...parsed,
            totalKm: total,
            day: parsed?.day?.key ? { key: parsed.day.key, startTotalKm: toNumberKm(parsed.day.startTotalKm) } : { key: getDayKey(), startTotalKm: total },
            week: parsed?.week?.key ? { key: parsed.week.key, startTotalKm: toNumberKm(parsed.week.startTotalKm) } : { key: getWeekKey(), startTotalKm: total },
            month: parsed?.month?.key ? { key: parsed.month.key, startTotalKm: toNumberKm(parsed.month.startTotalKm) } : { key: getMonthKey(), startTotalKm: total },
            year: parsed?.year?.key ? { key: parsed.year.key, startTotalKm: toNumberKm(parsed.year.startTotalKm) } : { key: getYearKey(), startTotalKm: total },
          };
          const rotated = rotatePeriodsIfNeeded(merged);
          setState(rotated);
          await persistState(rotated);
          return;
        }

        const savedKm = toNumberKm(rawKm);
        const fresh = buildFreshState(savedKm);
        setState(fresh);
        await persistState(fresh);
      } catch (error) {
        console.log('[KilometrageContext] load failed', error);
      }
    };
    load().catch(() => {});
  }, [currentUserId]);

  useEffect(() => {
    const startTracking = async () => {
      try {
        const current = await Location.getForegroundPermissionsAsync();
        let status = current.status;
        if (status !== 'granted') {
          const req = await Location.requestForegroundPermissionsAsync();
          status = req.status;
        }
        if (status !== 'granted') {
          console.log('[KilometrageContext] GPS permission denied');
          setIsTracking(false);
          return;
        }

        watchRef.current?.remove();
        watchRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 5000,
            distanceInterval: 10,
            mayShowUserSettingsDialog: true,
          },
          async (location) => {
            const coords = location.coords;
            if (!coords) return;
            if (typeof coords.accuracy === 'number' && coords.accuracy > 100) return;

            const speedMs = typeof coords.speed === 'number' && Number.isFinite(coords.speed) ? coords.speed : 0;
            const currentSpeedKmh = Math.max(0, speedMs * 3.6);

            // Lissage de la vitesse (EMA) pour eviter les sauts visuels.
            const alpha = 0.22;
            const prevSmoothed = smoothedSpeedRef.current;
            const nextSmoothed = prevSmoothed + alpha * (currentSpeedKmh - prevSmoothed);
            smoothedSpeedRef.current = nextSmoothed;

            const displaySpeed = nextSmoothed < 1 ? 0 : nextSmoothed;
            setSpeedKmh(displaySpeed);

            const drivingNow = displaySpeed >= 15;
            setIsDriving(drivingNow);

            const prev = lastPointRef.current;
            lastPointRef.current = location;
            if (!prev || !drivingNow) return;

            const elapsedSec = Math.max(1, (location.timestamp - prev.timestamp) / 1000);
            const distanceKm = haversineKm(prev.coords, coords);
            const distanceM = distanceKm * 1000;

            // Anti-bruit GPS: ignore points too small/too large.
            if (distanceM < 8 || distanceM > 800) return;
            if (elapsedSec < 2) return;

            const currentState = rotatePeriodsIfNeeded(inMemoryStateRef.current);
            const next: KmPersistedState = {
              ...currentState,
              totalKm: currentState.totalKm + distanceKm,
            };

            inMemoryStateRef.current = next;
            setState(next);
            await persistState(next);
          }
        );

        setIsTracking(true);
      } catch (error) {
        console.log('[KilometrageContext] GPS tracking failed', error);
        setIsTracking(false);
        smoothedSpeedRef.current = 0;
        setSpeedKmh(0);
      }
    };

    startTracking().catch(() => {});

    return () => {
      watchRef.current?.remove();
      watchRef.current = null;
      smoothedSpeedRef.current = 0;
    };
  }, []);

  const updateKm = useCallback(async (newKm: string) => {
    const nextTotal = toNumberKm(newKm);
    const next = buildFreshState(nextTotal);
    inMemoryStateRef.current = next;
    setState(next);
    await persistState(next);
  }, []);

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