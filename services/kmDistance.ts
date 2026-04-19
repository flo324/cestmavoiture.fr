import type { LocationObjectCoords } from 'expo-location';

/** Rejette les fixes dont la précision est pire que ce seuil (évite les sauts). */
export const KM_MAX_ACCURACY_METERS = 20;

/**
 * Distance kilométrique entre deux coordonnées (sphère, formule de Haversine).
 */
export function haversineKm(a: LocationObjectCoords, b: LocationObjectCoords): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const y = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * y;
}
