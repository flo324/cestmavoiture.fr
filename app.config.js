// Configuration Expo dynamique : injecte les clés Google Maps dans le natif (prebuild / EAS).
// La base statique est dans app.static.json (un seul fichier de config ; plus d’app.json pour éviter le conflit expo doctor).
const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (_) {
  /* dotenv présent en devDependency */
}

const { withGoogleMapsApiKey } = require('@expo/config-plugins/build/android/GoogleMapsApiKey');
const { withMaps: withIosMaps } = require('@expo/config-plugins/build/ios/Maps');

const appRootStatic = require('./app.static.json');

module.exports = () => {
  const expo = appRootStatic.expo || {};

  const mapsKey =
    String(process.env.Maps_API_KEY || '').trim() ||
    String(process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || '').trim() ||
    String(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim() ||
    String(process.env.EXPO_PUBLIC_GOOGLE_API_KEY || '').trim() ||
    '';

  /** iOS : même clé par défaut ; tu peux surcharger avec Maps_API_KEY_IOS dans .env */
  const iosMapsKey = String(process.env.Maps_API_KEY_IOS || '').trim() || mapsKey;

  /**
   * Sur EAS, le .env local n’est pas utilisé : il faut définir les variables sur expo.dev
   * (Environment variables → preview / production) ou via `eas secret:create`.
   * Blocage uniquement en production Android si la clé manque ; preview peut builder (cartes grises sans clé).
   */
  const easProfile = String(process.env.EAS_BUILD_PROFILE || '').trim();
  const isEasAndroid = process.env.EAS_BUILD === 'true' && process.env.EAS_BUILD_PLATFORM === 'android';
  if (isEasAndroid && !mapsKey) {
    if (easProfile === 'production') {
      throw new Error(
        '[Android] Clé Google Maps manquante au build production. Ajoutez Maps_API_KEY ou EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ' +
          'dans expo.dev → Environment variables pour ce profil. Activez « Maps SDK for Android » sur la clé.'
      );
    }
    console.warn(
      '[app.config] Maps_API_KEY absente sur EAS (profil "' + (easProfile || 'inconnu') +
        '") — les cartes peuvent être vides. Ajoute la variable sur https://expo.dev pour ce projet.'
    );
  }

  return {
    ...appRootStatic,
    expo: {
      ...expo,
      android: {
        ...expo.android,
        config: {
          ...(expo.android?.config || {}),
          googleMaps: {
            apiKey: mapsKey,
          },
        },
      },
      ios: {
        ...expo.ios,
        config: {
          ...(expo.ios?.config || {}),
          googleMapsApiKey: iosMapsKey,
        },
      },
      plugins: [...(expo.plugins || []), 'expo-sqlite', withGoogleMapsApiKey, withIosMaps],
    },
  };
};
