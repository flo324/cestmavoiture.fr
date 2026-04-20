import { useEffect } from 'react';
import { InteractionManager, PermissionsAndroid, Platform } from 'react-native';

import { requireOptionalNativeModule } from 'expo-modules-core';

import { persistVehicleActivityType, setNativeVehicleActivityType } from './vehicleActivityGate';
import { syncKmLocationTrackingMode } from './kmLocationOrchestrator';

type VehicleNative = {
  startListening: () => Promise<boolean>;
  stopListening: () => Promise<void>;
};

/**
 * Démarre Core Motion (iOS) / Activity Recognition (Android) et alimente
 * {@link setNativeVehicleActivityType} pour le filtre kilométrique.
 */
export function useVehicleActivityNative(enabled: boolean) {
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;

    const mod = requireOptionalNativeModule<VehicleNative>('ExpoVehicleActivity');
    if (!mod) return;

    let cancelled = false;
    let subscription: { remove: () => void } | null = null;

    const run = async () => {
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => {
          setTimeout(resolve, 1200);
        });
      });
      if (cancelled) return;

      if (Platform.OS === 'android' && Platform.Version >= 29) {
        try {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION as never
          );
        } catch {
          /* ignore */
        }
      }

      if (cancelled) return;

      const withEvents = mod as unknown as {
        addListener: (event: string, cb: (e: { type?: string }) => void) => { remove: () => void };
      };
      subscription = withEvents.addListener('onActivityChange', (e: { type?: string }) => {
        if (typeof e?.type === 'string') {
          setNativeVehicleActivityType(e.type);
          void persistVehicleActivityType(e.type).then(() => syncKmLocationTrackingMode());
        }
      });

      try {
        await mod.startListening();
      } catch {
        setNativeVehicleActivityType(null);
      }
    };

    void run();

    return () => {
      cancelled = true;
      subscription?.remove();
      setNativeVehicleActivityType(null);
      void persistVehicleActivityType(null);
      void mod.stopListening().catch(() => {});
    };
  }, [enabled]);
}
