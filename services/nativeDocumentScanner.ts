import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';

/**
 * Lance un scanner document natif (Android ML Kit / iOS VisionKit).
 * Si indisponible (ex: Expo Go), fallback automatique sur la caméra Expo.
 */
export async function scanDocumentWithFallback(): Promise<string | null> {
  try {
    // En Expo Go, le module natif n'est pas embarqué => on évite totalement le require natif.
    if (Constants.appOwnership === 'expo') {
      throw new Error('DocumentScanner native module unavailable in Expo Go');
    }
    // Import dynamique: évite le crash TurboModuleRegistry en Expo Go.
    const mod = require('react-native-document-scanner-plugin');
    const DocumentScanner = mod?.default ?? mod;
    const result = await DocumentScanner.scanDocument({
      maxNumDocuments: 1,
      responseType: 'imageFilePath',
      croppedImageQuality: 100,
    } as any);
    const first = Array.isArray((result as any)?.scannedImages)
      ? (result as any).scannedImages[0]
      : null;
    if (typeof first === 'string' && first.length > 0) return first;
  } catch {
    // fallback caméra ci-dessous
  }

  const { granted } = await ImagePicker.requestCameraPermissionsAsync();
  if (!granted) return null;
  const cam = await ImagePicker.launchCameraAsync({
    allowsEditing: false,
    quality: 1,
  });
  if (cam.canceled || !cam.assets?.[0]?.uri) return null;
  return cam.assets[0].uri;
}
