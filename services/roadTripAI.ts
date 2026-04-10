/**
 * Planification road trip via Gemini (JSON structuré) + géocodage expo-location.
 */

import * as Location from 'expo-location';

export type RoadTripStepDraft = { name: string; hint?: string };
export type RoadTripPlanDraft = { title: string; steps: RoadTripStepDraft[]; tips?: string };

export type GeocodedStep = {
  name: string;
  label: string;
  latitude: number;
  longitude: number;
};

const MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash'] as const;

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  return body.slice(start, end + 1);
}

export async function fetchRoadTripPlanFromAI(userMessage: string, contextHint: string): Promise<RoadTripPlanDraft> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('Clé API manquante (EXPO_PUBLIC_GOOGLE_API_KEY).');
  }

  const prompt = `Tu es l'assistant road trip de l'app mobile française "Garage Connect".
Contexte utilisateur (position / région si connue): ${contextHint}

Message de l'utilisateur:
"""${userMessage.replace(/"/g, '\\"')}"""

Réponds UNIQUEMENT par un objet JSON valide, sans markdown ni texte avant/après, avec cette forme exacte:
{
  "title": "titre court du voyage",
  "steps": [
    { "name": "ville ou lieu précis, France ou Europe", "hint": "optionnel: région, pays si utile au géocodage" }
  ],
  "tips": "1-3 phrases utiles (pauses, saison, trafic)"
}

Règles:
- "steps" contient entre 2 et 10 étapes dans l'ordre du trajet.
- La première étape = lieu de départ si l'utilisateur le dit; sinon une ville de départ cohérente avec son message.
- Noms exploitables pour géocodage (ville + pays si hors France).
- Pas de clés autres que title, steps, tips. steps[].name est obligatoire.`;

  let response: Response | null = null;
  let lastErr = '';
  for (const model of MODELS) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.35, maxOutputTokens: 1024 },
        }),
      }
    );
    if (r.ok) {
      response = r;
      break;
    }
    lastErr = await r.text();
  }

  if (!response) {
    throw new Error(`IA indisponible. ${lastErr.slice(0, 160)}`);
  }

  const json = await response.json();
  const text = String(json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
  const raw = extractJsonObject(text);
  if (!raw) {
    throw new Error('Réponse IA illisible. Réessayez avec des lieux plus précis.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Réponse IA invalide. Réessayez.');
  }

  const obj = parsed as Record<string, unknown>;
  const title = String(obj.title ?? 'Road trip').trim() || 'Road trip';
  const stepsRaw = obj.steps;
  if (!Array.isArray(stepsRaw) || stepsRaw.length < 2) {
    throw new Error("L'IA doit proposer au moins 2 étapes. Précisez départ et destination.");
  }

  const steps: RoadTripStepDraft[] = stepsRaw.slice(0, 10).map((s, i) => {
    const row = s as Record<string, unknown>;
    const name = String(row.name ?? row.label ?? `Étape ${i + 1}`).trim();
    const hint = row.hint != null ? String(row.hint).trim() : undefined;
    return { name: name || `Étape ${i + 1}`, hint };
  });

  const tips = obj.tips != null ? String(obj.tips).trim() : undefined;

  return { title, steps, tips };
}

/** Géocode chaque étape ; concatène hint si présent pour améliorer le résultat. */
export async function geocodeRoadTripSteps(steps: RoadTripStepDraft[]): Promise<GeocodedStep[]> {
  const out: GeocodedStep[] = [];
  for (const step of steps) {
    const query = [step.name, step.hint].filter(Boolean).join(', ');
    let list: Location.LocationGeocodedLocation[] = [];
    try {
      list = await Location.geocodeAsync(query);
    } catch {
      list = [];
    }
    const first = list?.[0];
    if (!first) {
      throw new Error(`Lieu introuvable : « ${step.name} ». Reformulez ou précisez la région.`);
    }
    out.push({
      name: step.name,
      label: query,
      latitude: first.latitude,
      longitude: first.longitude,
    });
  }
  return out;
}

export type CoordsLike = { latitude: number; longitude: number };

/**
 * Construit l’URL Google Maps (itinéraire voiture).
 * Si userCoords : départ = position actuelle, étapes = tout sauf la dernière en waypoints, arrivée = dernière.
 * Sinon : départ = 1re étape, waypoints = milieu, arrivée = dernière.
 */
export function buildGoogleMapsDirectionsUrl(geocoded: GeocodedStep[], userCoords: CoordsLike | null): string {
  if (geocoded.length === 0) {
    throw new Error('Aucune étape');
  }
  if (geocoded.length === 1) {
    const p = geocoded[0];
    if (userCoords) {
      return `https://www.google.com/maps/dir/?api=1&origin=${userCoords.latitude},${userCoords.longitude}&destination=${p.latitude},${p.longitude}&travelmode=driving`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`;
  }

  const last = geocoded[geocoded.length - 1];
  if (userCoords) {
    const wps = geocoded.slice(0, -1);
    const wp = wps.map((s) => `${s.latitude},${s.longitude}`).join('|');
    const url = `https://www.google.com/maps/dir/?api=1&origin=${userCoords.latitude},${userCoords.longitude}&destination=${last.latitude},${last.longitude}&travelmode=driving&waypoints=${encodeURIComponent(wp)}`;
    return url;
  }

  const origin = geocoded[0];
  const dest = last;
  const middle = geocoded.slice(1, -1);
  if (middle.length === 0) {
    return `https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=${dest.latitude},${dest.longitude}&travelmode=driving`;
  }
  const wp = middle.map((s) => `${s.latitude},${s.longitude}`).join('|');
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=${dest.latitude},${dest.longitude}&travelmode=driving&waypoints=${encodeURIComponent(wp)}`;
}
