import type { LocationObject } from 'expo-location';
import { AppState, Platform } from 'react-native';

import { haversineKm, KM_MAX_ACCURACY_METERS } from './kmDistance';
import type { KmPersistedState, TrackingPoint } from './kmTypes';
import { KM_KEY, KM_STATE_KEY } from './kmTypes';
import { buildFreshState, rotatePeriodsIfNeeded } from './kmPeriods';
import { insertTripSegment, markAllTripSegmentsApplied, sumPendingTripSegmentsKm } from './tripSegmentsDb';
import { hydrateVehicleActivityFromCache, isAccuracyAcceptable, isVehicleContextForOdometer } from './vehicleActivityGate';
import { userGetItem, userSetItem } from './userStorage';

const ALPHA_SPEED = 0.22;

function coordsFromTracking(p: TrackingPoint): LocationObject['coords'] {
  return {
    latitude: p.lat,
    longitude: p.lon,
    altitude: null,
    accuracy: KM_MAX_ACCURACY_METERS,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  };
}

function formatKmDisplay(value: number): string {
  return Math.round(Math.max(0, value)).toLocaleString('fr-FR');
}

function toNumberKm(value: string | number | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  if (!digits) return 0;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function parseState(raw: string | null): KmPersistedState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<KmPersistedState>;
    const total = toNumberKm(parsed?.totalKm ?? 0);
    const bgTrip = parsed?.bgTrip;
    return {
      ...buildFreshState(total),
      ...parsed,
      totalKm: total,
      lastAccepted: parsed?.lastAccepted,
      lastSpeedKmh: typeof parsed?.lastSpeedKmh === 'number' ? parsed.lastSpeedKmh : undefined,
      bgTrip:
        bgTrip &&
        typeof bgTrip.accKm === 'number' &&
        Number.isFinite(bgTrip.accKm) &&
        bgTrip.accKm >= 0
          ? {
              accKm: bgTrip.accKm,
              lastAccepted: bgTrip.lastAccepted,
              tripStart: bgTrip.tripStart,
            }
          : undefined,
    };
  } catch {
    return null;
  }
}

function smoothSpeedKmh(prevSmooth: number, rawKmh: number): number {
  const next = prevSmooth + ALPHA_SPEED * (rawKmh - prevSmooth);
  return next < 1 ? 0 : next;
}

async function persistBoth(state: KmPersistedState): Promise<void> {
  await Promise.all([userSetItem(KM_KEY, formatKmDisplay(state.totalKm)), userSetItem(KM_STATE_KEY, JSON.stringify(state))]);
}

async function mergeBackgroundTripIntoTotalIfNeeded(): Promise<void> {
  const rawState = await userGetItem(KM_STATE_KEY);
  const state = parseState(rawState);
  if (!state?.bgTrip || state.bgTrip.accKm <= 0) return;
  const next = rotatePeriodsIfNeeded({
    ...state,
    totalKm: state.totalKm + state.bgTrip.accKm,
    bgTrip: undefined,
  });
  await persistBoth(next);
}

/**
 * Segments SQLite + trajet partiel arrière-plan → totalKm persisté (à appeler au premier plan).
 */
export async function applyPendingLocalKmToTotal(): Promise<KmPersistedState | null> {
  try {
    if (Platform.OS !== 'web') {
      await mergeBackgroundTripIntoTotalIfNeeded();
      const pending = await sumPendingTripSegmentsKm();
      if (pending > 0) {
        const raw = await userGetItem(KM_STATE_KEY);
        let state = parseState(raw);
        if (!state) {
          const kmLegacy = await userGetItem(KM_KEY);
          state = buildFreshState(toNumberKm(kmLegacy));
        }
        state = rotatePeriodsIfNeeded({ ...state, totalKm: state.totalKm + pending });
        await persistBoth(state);
        await markAllTripSegmentsApplied();
      }
    }
    return await readKmStateFromStorage();
  } catch (e) {
    console.log('[kmEngine] applyPendingLocalKmToTotal failed', e);
    return readKmStateFromStorage();
  }
}

/**
 * Traite un point GPS : Haversine + filtre précision + mode véhicule uniquement.
 * En arrière-plan : enregistre les trajets terminés en SQLite (segments non comptabilisés).
 */
export async function processKmLocationFix(loc: LocationObject): Promise<void> {
  await hydrateVehicleActivityFromCache();
  if (loc.mocked) return;

  if (!isAccuracyAcceptable(loc)) {
    return;
  }

  const speedMs = typeof loc.coords.speed === 'number' && Number.isFinite(loc.coords.speed) ? loc.coords.speed : 0;
  const rawKmh = Math.max(0, speedMs * 3.6);

  const rawState = await userGetItem(KM_STATE_KEY);
  let state = parseState(rawState);
  if (!state) {
    const kmLegacy = await userGetItem(KM_KEY);
    const total = toNumberKm(kmLegacy);
    state = buildFreshState(total);
  }

  state = rotatePeriodsIfNeeded(state);
  const prevSmooth = typeof state.lastSpeedKmh === 'number' ? state.lastSpeedKmh : 0;
  const displaySpeed = smoothSpeedKmh(prevSmooth, rawKmh);
  state = { ...state, lastSpeedKmh: displaySpeed };

  const inForeground = AppState.currentState === 'active';

  if (inForeground) {
    await processKmForegroundAccumulate(state, loc, displaySpeed);
  } else {
    await processKmBackgroundAccumulate(state, loc, displaySpeed);
  }
}

async function processKmForegroundAccumulate(
  state: KmPersistedState,
  loc: LocationObject,
  displaySpeed: number
): Promise<void> {
  const vehicle = isVehicleContextForOdometer(loc);
  if (!vehicle) {
    await persistBoth({ ...state, lastSpeedKmh: displaySpeed });
    return;
  }

  const prev = state.lastAccepted;
  const pt: TrackingPoint = {
    lat: loc.coords.latitude,
    lon: loc.coords.longitude,
    t: typeof loc.timestamp === 'number' ? loc.timestamp : Date.now(),
  };

  if (!prev) {
    await persistBoth({ ...state, lastAccepted: pt, lastSpeedKmh: displaySpeed });
    return;
  }

  const elapsedSec = Math.max(1, (loc.timestamp - prev.t) / 1000);
  const distanceKm = haversineKm(coordsFromTracking(prev), loc.coords);
  const distanceM = distanceKm * 1000;

  if (distanceM < 8 || distanceM > 800 || elapsedSec < 2) {
    await persistBoth({ ...state, lastAccepted: pt, lastSpeedKmh: displaySpeed });
    return;
  }

  const nextTotal = state.totalKm + distanceKm;
  const nextState = rotatePeriodsIfNeeded({
    ...state,
    totalKm: nextTotal,
    lastSpeedKmh: displaySpeed,
    lastAccepted: pt,
  });

  await persistBoth(nextState);
}

async function processKmBackgroundAccumulate(
  state: KmPersistedState,
  loc: LocationObject,
  displaySpeed: number
): Promise<void> {
  const vehicle = isVehicleContextForOdometer(loc);
  const bg = state.bgTrip ?? { accKm: 0 };

  if (!vehicle) {
    if (bg.tripStart && bg.lastAccepted && bg.accKm > 0.0005) {
      try {
        await insertTripSegment({
          startLat: bg.tripStart.lat,
          startLon: bg.tripStart.lon,
          endLat: bg.lastAccepted.lat,
          endLon: bg.lastAccepted.lon,
          distanceKm: bg.accKm,
        });
      } catch (e) {
        console.log('[kmEngine] insertTripSegment failed', e);
      }
    }
    await persistBoth({
      ...state,
      lastSpeedKmh: displaySpeed,
      bgTrip: undefined,
    });
    return;
  }

  const prev = bg.lastAccepted;
  const pt: TrackingPoint = {
    lat: loc.coords.latitude,
    lon: loc.coords.longitude,
    t: typeof loc.timestamp === 'number' ? loc.timestamp : Date.now(),
  };

  if (!prev) {
    const nextBg = {
      accKm: 0,
      lastAccepted: pt,
      tripStart: pt,
    };
    await persistBoth({ ...state, lastSpeedKmh: displaySpeed, bgTrip: nextBg });
    return;
  }

  const elapsedSec = Math.max(1, (loc.timestamp - prev.t) / 1000);
  const distanceKm = haversineKm(coordsFromTracking(prev), loc.coords);
  const distanceM = distanceKm * 1000;

  if (distanceM < 8 || distanceM > 800 || elapsedSec < 2) {
    const nextBg = { ...bg, lastAccepted: pt };
    await persistBoth({ ...state, lastSpeedKmh: displaySpeed, bgTrip: nextBg });
    return;
  }

  const nextAcc = bg.accKm + distanceKm;
  const nextBg = {
    accKm: nextAcc,
    lastAccepted: pt,
    tripStart: bg.tripStart ?? pt,
  };
  await persistBoth({ ...state, lastSpeedKmh: displaySpeed, bgTrip: nextBg });
}

/** Lecture normalisée pour l’UI (contexte + écran km). */
export async function readKmStateFromStorage(): Promise<KmPersistedState | null> {
  const rawState = await userGetItem(KM_STATE_KEY);
  let s = parseState(rawState);
  if (!s) {
    const kmLegacy = await userGetItem(KM_KEY);
    s = buildFreshState(toNumberKm(kmLegacy));
  }
  return rotatePeriodsIfNeeded(s);
}

/** Mise à jour manuelle du compteur (profil / odomètre) : réinitialise la chaîne GPS. */
export async function persistManualOdometerKm(totalKm: number): Promise<KmPersistedState> {
  const next = buildFreshState(Math.max(0, totalKm));
  await persistBoth(next);
  return next;
}
