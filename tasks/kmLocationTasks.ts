/**
 * Enregistrement des tâches expo-location + TaskManager.
 * Ne doit pas faire planter l’app si le module natif est absent (Expo Go / APK non reconstruit).
 */
import type { LocationObject } from 'expo-location';
import { Platform } from 'react-native';

import { setKmBackgroundTasksRegistered } from '../services/kmTaskRegistrationState';

function registerKmLocationTasks(): void {
  if (Platform.OS === 'web') return;

  try {
    // require() dynamique : l’import statique lève avant tout try/catch si le natif manque.
    const TaskManager = require('expo-task-manager') as typeof import('expo-task-manager');
    const { processKmLocationFix } = require('../services/kmEngine') as typeof import('../services/kmEngine');
    const { syncKmLocationTrackingMode } = require('../services/kmLocationOrchestrator') as typeof import(
      '../services/kmLocationOrchestrator'
    );
    const { KM_PRECISION_LOCATION_TASK, KM_SIGNIFICANT_LOCATION_TASK } = require('../services/kmTaskConfig') as typeof import(
      '../services/kmTaskConfig'
    );

    TaskManager.defineTask(KM_SIGNIFICANT_LOCATION_TASK, async ({ data, error }) => {
      if (error) return;
      if (!data) return;
      const locations = (data as { locations?: LocationObject[] }).locations;
      if (!locations?.length) return;
      const last = locations[locations.length - 1];
      try {
        await syncKmLocationTrackingMode(last);
      } catch {
        /* ignore */
      }
    });

    TaskManager.defineTask(KM_PRECISION_LOCATION_TASK, async ({ data, error }) => {
      if (error) return;
      if (!data) return;
      const locations = (data as { locations?: LocationObject[] }).locations;
      if (!locations?.length) return;
      for (const loc of locations) {
        try {
          await processKmLocationFix(loc);
        } catch {
          /* ignore */
        }
      }
      try {
        await syncKmLocationTrackingMode(locations[locations.length - 1]);
      } catch {
        /* ignore */
      }
    });

    setKmBackgroundTasksRegistered(true);
  } catch (e) {
    setKmBackgroundTasksRegistered(false);
    console.warn(
      '[OTTO] expo-task-manager indisponible — pas d’arrière-plan GPS. Installe un dev build : npx expo run:android',
      e
    );
  }
}

registerKmLocationTasks();
