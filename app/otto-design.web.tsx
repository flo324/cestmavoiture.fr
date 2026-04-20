import { useRouter } from 'expo-router';
import React from 'react';

import OttoHomeTailwindScreen from '../components/OttoHomeTailwindScreen.web';

/**
 * Aperçu web de la maquette OTTO (Tailwind). Ouvre avec : npx expo start --web
 */
export default function OttoDesignPreview() {
  const router = useRouter();

  return (
    <OttoHomeTailwindScreen
      onScanPress={() => router.push('/scan')}
      onProfilePress={() => router.push('/profil')}
    />
  );
}
