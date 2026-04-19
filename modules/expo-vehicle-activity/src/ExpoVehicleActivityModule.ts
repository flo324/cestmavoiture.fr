import { requireNativeModule } from 'expo-modules-core';

export type ExpoVehicleActivityNative = {
  startListening: () => Promise<boolean>;
  stopListening: () => Promise<void>;
};

const ExpoVehicleActivity = requireNativeModule<ExpoVehicleActivityNative>('ExpoVehicleActivity');

export default ExpoVehicleActivity;
