// Fusionne app.json, injecte la clé Google Maps Android (meta-data native au prebuild),
// et enregistre le plugin Expo officiel withGoogleMapsApiKey.
// iOS : Apple Maps par défaut (pas de clé). Android : Google Maps + PROVIDER_GOOGLE.
const fs = require('fs');
const path = require('path');

const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'app.json'), 'utf8'));
const { withGoogleMapsApiKey } = require('@expo/config-plugins/build/android/GoogleMapsApiKey');

const androidMapsKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_API_KEY ||
  '';

// Sur EAS Build (Android), une clé vide = crash natif au 1er MapView ("API key not found").
if (
  process.env.EAS_BUILD === 'true' &&
  process.env.EAS_BUILD_PLATFORM === 'android' &&
  !String(androidMapsKey).trim()
) {
  throw new Error(
    '[Android] Clé Google Maps manquante au build. Dans https://expo.dev → projet → Environment variables, ' +
      'ajoutez EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ou EXPO_PUBLIC_GOOGLE_API_KEY pour l’environnement « development » ' +
      '(profil EAS development). Dans Google Cloud → APIs & Services → la clé : activez « Maps SDK for Android ». ' +
      'Puis relancez : eas build --profile development --platform android'
  );
}

module.exports = () => ({
  expo: {
    ...appJson.expo,
    android: {
      ...appJson.expo.android,
      config: {
        ...(appJson.expo.android?.config || {}),
        googleMaps: {
          apiKey: androidMapsKey,
        },
      },
    },
    plugins: [...(appJson.expo.plugins || []), withGoogleMapsApiKey],
  },
});
