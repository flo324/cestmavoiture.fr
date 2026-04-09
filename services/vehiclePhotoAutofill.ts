import { documentDirectory, downloadAsync } from 'expo-file-system/legacy';
import { enhanceVehiclePhotoPremium } from './premiumVehiclePhoto';

function sanitizeFilePart(value: string): string {
  return String(value || 'vehicule')
    .toLowerCase()
    .replace(/[^\w\d]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 48);
}

function buildUnsplashCandidates(modele: string): string[] {
  const m = String(modele || '').trim();
  const q1 = encodeURIComponent(`${m} voiture`);
  const q2 = encodeURIComponent(`${m} automobile`);
  const q3 = encodeURIComponent(`${m} car`);
  return [
    `https://source.unsplash.com/1600x900/?${q1}`,
    `https://source.unsplash.com/1600x900/?${q2}`,
    `https://source.unsplash.com/1600x900/?${q3}`,
  ];
}

async function tryDownloadImage(url: string, modele: string): Promise<string | null> {
  const base = documentDirectory ?? '';
  if (!base) return null;
  const safe = sanitizeFilePart(modele);
  const dest = `${base}vehicle_${safe}_${Date.now()}.jpg`;
  try {
    const result = await downloadAsync(url, dest);
    if (result.status === 200 && result.uri) return result.uri;
    return null;
  } catch {
    return null;
  }
}

export async function autoAttachVehiclePhoto(modele: string): Promise<{
  photoUri: string;
  palette: { center: string; edge: string };
} | null> {
  const model = String(modele || '').trim();
  if (!model) return null;

  const candidates = buildUnsplashCandidates(model);
  for (const url of candidates) {
    const local = await tryDownloadImage(url, model);
    if (local) {
      const premium = await enhanceVehiclePhotoPremium(local);
      return {
        photoUri: premium.photoUri,
        palette: premium.palette,
      };
    }
  }
  return null;
}

