import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

/**
 * Android : si le MainActivity a été recyclé, launchCameraAsync peut sembler « annulé » alors que
 * la photo est disponible via getPendingResultAsync (doc expo-image-picker).
 */
async function resolveCameraResult(
  cam: Awaited<ReturnType<typeof ImagePicker.launchCameraAsync>>
): Promise<typeof cam> {
  const uri = cam.assets?.[0]?.uri;
  if (!cam.canceled && uri) return cam;
  if (Platform.OS !== 'android') return cam;
  try {
    const pending = await ImagePicker.getPendingResultAsync();
    if (
      pending &&
      typeof pending === 'object' &&
      'canceled' in pending &&
      pending.canceled === false &&
      Array.isArray((pending as { assets?: { uri?: string }[] }).assets) &&
      (pending as { assets: { uri?: string }[] }).assets[0]?.uri
    ) {
      return pending as typeof cam;
    }
  } catch {
    /* ignore */
  }
  return cam;
}

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
      /** 100 + très grande image peut contribuer à OOM / recyclage d’activité sur Android. */
      croppedImageQuality: 92,
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
  const raw = await ImagePicker.launchCameraAsync({
    allowsEditing: false,
    quality: 0.92,
  });
  const cam = await resolveCameraResult(raw);
  if (cam.canceled || !cam.assets?.[0]?.uri) return null;
  return cam.assets[0].uri;
}
