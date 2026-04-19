/**
 * Itinéraire routier via Google Directions API (tracé réel sur la carte).
 * Activez "Directions API" pour la clé résolue par getGoogleGenerativeApiKey (EXPO_PUBLIC_GEMINI_API_KEY ou EXPO_PUBLIC_GOOGLE_API_KEY).
 */

import { getGoogleGenerativeApiKey } from './googleGenerativeApiKey';

export type LatLng = { latitude: number; longitude: number };

/** Décode une polyline encodée (format Google). */
export function decodeEncodedPolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

/** Ordre : position utilisateur (si fournie), puis étapes IA dans l’ordre. */
export function buildOrderedStops(user: LatLng | null, geocoded: LatLng[]): LatLng[] {
  const stops: LatLng[] = [];
  if (user) stops.push(user);
  for (const g of geocoded) {
    stops.push({ latitude: g.latitude, longitude: g.longitude });
  }
  return stops;
}

/**
 * Retourne les points du chemin routier (routes) ou null si indisponible.
 * Même résolution de clé que l’IA (Gemini) : voir googleGenerativeApiKey.ts.
 */
export async function fetchDrivingPath(stops: LatLng[]): Promise<LatLng[] | null> {
  if (stops.length < 2) return null;
  let apiKey: string;
  try {
    apiKey = getGoogleGenerativeApiKey();
  } catch {
    return null;
  }

  const origin = `${stops[0].latitude},${stops[0].longitude}`;
  const dest = `${stops[stops.length - 1].latitude},${stops[stops.length - 1].longitude}`;
  const params = new URLSearchParams({
    origin,
    destination: dest,
    mode: 'driving',
    language: 'fr',
    key: apiKey,
  });
  if (stops.length > 2) {
    params.set('waypoints', stops.slice(1, -1).map((p) => `${p.latitude},${p.longitude}`).join('|'));
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;
    const res = await fetch(url);
    const json = (await res.json()) as {
      status: string;
      error_message?: string;
      routes?: { overview_polyline?: { points?: string } }[];
    };
    if (json.status !== 'OK' || !json.routes?.[0]?.overview_polyline?.points) {
      if (__DEV__ && json.status !== 'ZERO_RESULTS') {
        console.warn('[Directions]', json.status, json.error_message ?? '');
      }
      return null;
    }
    const decoded = decodeEncodedPolyline(json.routes[0].overview_polyline.points);
    return decoded.length >= 2 ? decoded : null;
  } catch (e) {
    if (__DEV__) console.warn('[Directions] fetch failed', e);
    return null;
  }
}
