import type { LocationObject, LocationTaskOptions } from 'expo-location';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { isKmBackgroundTasksRegistered } from './kmTaskRegistrationState';
import { KM_PRECISION_LOCATION_TASK, KM_SIGNIFICANT_LOCATION_TASK } from './kmTaskConfig';
import { hydrateVehicleActivityFromCache, VEHICLE_ACTIVITY_CACHE_KEY } from './vehicleActivityGate';
import { userGetItem } from './userStorage';

let lastModePrecision: boolean | null = null;

async function ensureBackgroundLocationForKmTasks(): Promise<boolean> {
  const cur = await Location.getBackgroundPermissionsAsync();
  if (cur.status === 'granted') return true;
  // Ne pas forcer l'écran système "Autorisation accès position" au démarrage.
  // Le passage en arrière-plan sera activé uniquement après permission explicite
  // donnée par l'utilisateur (via réglages/app flow dédié).
  return false;
}

async function shouldRunHighPrecisionTracking(sampleLoc?: LocationObject | null): Promise<boolean> {
  await hydrateVehicleActivityFromCache();
  const raw = await userGetItem(VEHICLE_ACTIVITY_CACHE_KEY);
  const type = (raw || '').trim().toLowerCase();
  if (type === 'automotive' || type === 'in_vehicle' || type === 'in_car' || type.includes('vehicle')) {
    return true;
  }
  if (type === 'still' || type === 'walking' || type === 'running' || type === 'on_bicycle' || type === 'on_foot') {
    return false;
  }

  if (sampleLoc?.coords?.speed != null) {
    const sp = sampleLoc.coords.speed;
    if (typeof sp === 'number' && Number.isFinite(sp) && sp >= 2.8) {
      return true;
    }
  }
  return false;
}

const androidFs = {
  notificationTitle: 'OTTO — kilométrage',
  notificationBody: 'Suivi optimisé (GPS précis en véhicule)',
  notificationColor: '#00E9F5',
};

/**
 * Une seule session `startLocationUpdatesAsync` à la fois : veille légère OU précision.
 * Les « changements significatifs » sont approximés par une faible précision + grands intervalles (expo-location n’expose pas SLC natif).
 */
export async function syncKmLocationTrackingMode(sampleLoc?: LocationObject | null): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!isKmBackgroundTasksRegistered) return;

  const bgOk = await ensureBackgroundLocationForKmTasks();
  if (!bgOk) return;

  await Location.stopLocationUpdatesAsync('otto-km-background-v1').catch(() => {});

  const wantPrecision = await shouldRunHighPrecisionTracking(sampleLoc ?? undefined);

  if (lastModePrecision === wantPrecision) {
    const precisionOn = await Location.hasStartedLocationUpdatesAsync(KM_PRECISION_LOCATION_TASK);
    const sigOn = await Location.hasStartedLocationUpdatesAsync(KM_SIGNIFICANT_LOCATION_TASK);
    if (wantPrecision && precisionOn && !sigOn) return;
    if (!wantPrecision && sigOn && !precisionOn) return;
  }
  lastModePrecision = wantPrecision;

  try {
    if (wantPrecision) {
      if (await Location.hasStartedLocationUpdatesAsync(KM_SIGNIFICANT_LOCATION_TASK)) {
        await Location.stopLocationUpdatesAsync(KM_SIGNIFICANT_LOCATION_TASK);
      }
      if (!(await Location.hasStartedLocationUpdatesAsync(KM_PRECISION_LOCATION_TASK))) {
        await Location.startLocationUpdatesAsync(KM_PRECISION_LOCATION_TASK, {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 4000,
          distanceInterval: 12,
          showsBackgroundLocationIndicator: true,
          pausesUpdatesAutomatically: false,
          activityType: Location.ActivityType.AutomotiveNavigation,
          foregroundService: Platform.OS === 'android' ? androidFs : undefined,
        });
      }
    } else {
      if (await Location.hasStartedLocationUpdatesAsync(KM_PRECISION_LOCATION_TASK)) {
        await Location.stopLocationUpdatesAsync(KM_PRECISION_LOCATION_TASK);
      }
      if (!(await Location.hasStartedLocationUpdatesAsync(KM_SIGNIFICANT_LOCATION_TASK))) {
        const significantOpts: LocationTaskOptions =
          Platform.OS === 'ios'
            ? {
                accuracy: Location.Accuracy.Lowest,
                distanceInterval: 500,
                pausesUpdatesAutomatically: true,
                activityType: Location.ActivityType.Other,
                deferredUpdatesDistance: 500,
                deferredUpdatesInterval: 600000,
                showsBackgroundLocationIndicator: false,
              }
            : {
                accuracy: Location.Accuracy.Balanced,
                distanceInterval: 200,
                timeInterval: 600000,
                pausesUpdatesAutomatically: false,
                activityType: Location.ActivityType.Other,
                showsBackgroundLocationIndicator: false,
                foregroundService: { ...androidFs, notificationBody: 'Veille trajet (faible consommation)' },
              };
        await Location.startLocationUpdatesAsync(KM_SIGNIFICANT_LOCATION_TASK, significantOpts);
      }
    }
  } catch (e) {
    console.log('[kmLocationOrchestrator] sync failed', e);
  }
}
