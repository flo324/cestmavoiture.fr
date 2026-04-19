import type { LocationObject } from 'expo-location';

import { KM_MAX_ACCURACY_METERS } from './kmDistance';
import { userGetItem, userRemoveItem, userSetItem } from './userStorage';

/** Persisté pour les tâches d’arrière-plan (TaskManager) qui n’ont pas le listener JS. */
export const VEHICLE_ACTIVITY_CACHE_KEY = '@vehicle_activity_cache_v1';

/**
 * Valeur optionnelle branchée par un module natif (Core Motion / Activity Recognition).
 * Ex. : "automotive", "in_vehicle", "still", "walking"…
 */
let nativeActivityType: string | null = null;

export function setNativeVehicleActivityType(type: string | null): void {
  nativeActivityType = type?.trim().toLowerCase() ?? null;
}

export async function persistVehicleActivityType(type: string | null): Promise<void> {
  const t = type?.trim() ?? '';
  if (!t) {
    await userRemoveVehicleActivityCache();
    return;
  }
  await userSetItem(VEHICLE_ACTIVITY_CACHE_KEY, t.toLowerCase());
}

export async function userRemoveVehicleActivityCache(): Promise<void> {
  await userRemoveItem(VEHICLE_ACTIVITY_CACHE_KEY);
}

/** Hydrate la variable en mémoire depuis AsyncStorage (tâches GPS en tête). */
export async function hydrateVehicleActivityFromCache(): Promise<void> {
  try {
    const raw = await userGetItem(VEHICLE_ACTIVITY_CACHE_KEY);
    if (typeof raw === 'string' && raw.length > 0) {
      setNativeVehicleActivityType(raw);
    }
  } catch {
    /* ignore */
  }
}

export function getNativeVehicleActivityType(): string | null {
  return nativeActivityType;
}

const VEHICLE_HINTS = new Set([
  'automotive',
  'in_vehicle',
  'in_car',
  'vehicle',
  'driving',
]);

const NON_VEHICLE_HINTS = new Set([
  'still',
  'walking',
  'running',
  'on_foot',
  'on_bicycle',
  'tilting',
  'unknown',
]);

/** Vitesse mini (~10 km/h) si l’activité native n’est pas disponible */
const MIN_SPEED_MS = 2.8;

function inferFromNativeHint(): boolean | null {
  if (!nativeActivityType) return null;
  if (VEHICLE_HINTS.has(nativeActivityType)) return true;
  if (NON_VEHICLE_HINTS.has(nativeActivityType)) return false;
  if (nativeActivityType.includes('vehicle') || nativeActivityType.includes('auto')) return true;
  return null;
}

/**
 * Indique si le relevé correspond à un déplacement en véhicule.
 * Priorité : hint natif (automotive / in_vehicle) → sinon vitesse GPS.
 */
export function isVehicleContextForOdometer(loc: LocationObject): boolean {
  if (loc.mocked) return false;

  const fromActivity = inferFromNativeHint();
  if (fromActivity === true) return true;
  if (fromActivity === false) return false;

  const sp = loc.coords.speed;
  if (typeof sp === 'number' && Number.isFinite(sp) && sp >= 0) {
    return sp >= MIN_SPEED_MS;
  }
  return false;
}

export function isAccuracyAcceptable(loc: LocationObject): boolean {
  const acc = loc.coords.accuracy;
  if (typeof acc !== 'number' || !Number.isFinite(acc)) return false;
  return acc <= KM_MAX_ACCURACY_METERS;
}
