/**
 * Planification road trip via Gemini (JSON structuré) + géocodage expo-location.
 */

import * as Location from 'expo-location';

import { getGoogleGenerativeApiKey } from './googleGenerativeApiKey';

export type RoadTripStepDraft = { name: string; hint?: string };
export type RoadTripPlanDraft = { title: string; steps: RoadTripStepDraft[]; tips?: string };

export type GeocodedStep = {
  name: string;
  label: string;
  latitude: number;
  longitude: number;
};

/** Ordre : modèle le plus disponible d’abord ; v1 en secours si v1beta refuse (rare). */
const GENERATE_ATTEMPTS = [
  { version: 'v1beta' as const, model: 'gemini-1.5-flash' },
  { version: 'v1beta' as const, model: 'gemini-2.0-flash' },
  { version: 'v1' as const, model: 'gemini-1.5-flash' },
] as const;

export const ROAD_TRIP_STYLE_OPTIONS = ['Rapide', 'Touristique', 'Économique'] as const;
export type RoadTripStyleOption = (typeof ROAD_TRIP_STYLE_OPTIONS)[number];

async function geminiGenerateText(
  prompt: string,
  opts?: { maxOutputTokens?: number; temperature?: number }
): Promise<string> {
  const maxOutputTokens = opts?.maxOutputTokens ?? 1024;
  const temperature = opts?.temperature ?? 0.35;
  const apiKey = getGoogleGenerativeApiKey();

  let response: Response | null = null;
  let lastStatus = 0;
  let lastBody = '';
  for (const { version, model } of GENERATE_ATTEMPTS) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens },
        }),
      }
    );
    if (r.ok) {
      response = r;
      break;
    }
    lastStatus = r.status;
    lastBody = await r.text();
  }

  if (!response) {
    throw new Error(formatGeminiHttpFailure(lastStatus, lastBody));
  }

  const json = await response.json();
  return String(json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  return body.slice(start, end + 1);
}

/** Détail lisible quand generateContent renvoie une erreur (souvent 403 = clé / restrictions GCP). */
function formatGeminiHttpFailure(status: number, responseBody: string): string {
  let detail = '';
  try {
    const parsed = JSON.parse(responseBody) as { error?: { message?: string } };
    const m = parsed?.error?.message;
    if (typeof m === 'string' && m.trim()) detail = m.trim().slice(0, 280);
  } catch {
    detail = responseBody.trim().slice(0, 200);
  }

  if (status === 403) {
    const lines = [
      'Google refuse l’appel (403). Ouvrez la console du même projet que votre clé dans .env :',
      '1) Menu ☰ → APIs et services → Bibliothèque → recherchez « Gemini » ou « Generative Language » → Activer.',
      '2) APIs et services → Identifiants → votre clé → Restrictions d’API : cochez « Gemini API » (Generative Language), ou « Aucune restriction » pour un test.',
      '3) Toujours sur la clé → Restrictions d’application : une app React Native n’utilise pas des référents web ; mettez « Aucune » pour tester, ou Android/iOS avec le bon package.',
    ];
    if (detail) lines.push(`Détail : ${detail}`);
    const low = detail.toLowerCase();
    if (low.includes('are blocked') || low.includes('blocked.') || low.includes('leaked')) {
      lines.push(
        'Si tout est déjà sur « Aucune restriction » : Google bloque parfois une clé (fuite, mauvais projet). Essayez :',
        '- Nouvelle clé dédiée Gemini : https://aistudio.google.com/apikey → copiez-la dans .env (EXPO_PUBLIC_GEMINI_API_KEY), redémarrez Expo.',
        '- Facturation : menu ☰ → Facturation → lier un compte de facturation au projet (souvent requis pour l’API Gemini selon le pays, même pour le gratuit).'
      );
    }
    return lines.join('\n');
  }

  if (status === 429) {
    return `Quota ou limite atteinte (429). Réessayez plus tard.${detail ? `\n${detail}` : ''}`;
  }

  return ['IA indisponible.', detail || `HTTP ${status}`, responseBody.trim().slice(0, 120)].filter(Boolean).join('\n');
}

export async function fetchRoadTripPlanFromAI(userMessage: string, contextHint: string): Promise<RoadTripPlanDraft> {
  const prompt = `Tu es l'assistant road trip de l'app mobile française "OTTO".
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

  const text = await geminiGenerateText(prompt, { maxOutputTokens: 1024, temperature: 0.35 });
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

export type RoadTripPlannerFormInput = {
  from: string;
  to: string;
  style: RoadTripStyleOption;
  /** Nombre de jours (sera borné entre 1 et 21 côté service). */
  durationDays: number;
};

export type RoadTripPlannerDay = { day: number; content: string };

export type RoadTripPlannerResult = {
  title: string;
  days: RoadTripPlannerDay[];
  tips?: string;
  /** Texte formaté pour la zone de chat (titres « Jour n »). */
  chatText: string;
};

function formatPlannerDaysForChat(title: string, days: RoadTripPlannerDay[], tips?: string): string {
  const sorted = [...days].sort((a, b) => a.day - b.day);
  const blocks: string[] = [title.trim(), ''];
  for (const d of sorted) {
    blocks.push(`Jour ${d.day}`, d.content.trim(), '');
  }
  if (tips?.trim()) blocks.push(`Conseils\n${tips.trim()}`);
  return blocks.join('\n').trim();
}

/**
 * Itinéraire jour par jour à partir du formulaire (sans géocodage ni carte).
 */
export async function fetchRoadTripPlannerFromForm(input: RoadTripPlannerFormInput): Promise<RoadTripPlannerResult> {
  const n = Math.min(21, Math.max(1, Math.floor(Number(input.durationDays) || 1)));
  const from = input.from.replace(/"/g, '\\"').trim();
  const to = input.to.replace(/"/g, '\\"').trim();
  const styleHint =
    input.style === 'Rapide'
      ? 'Privilégier autoroutes / temps de trajet court, pauses courtes.'
      : input.style === 'Touristique'
        ? 'Privilégier sites, panoramas, étapes culturelles et pauses découvertes.'
        : 'Limiter péages et coûts, repas abordables, routes pertinentes pour le budget.';

  const prompt = `Tu es l'assistant road trip de l'app mobile française "OTTO".

Données du formulaire :
- Départ : """${from}"""
- Arrivée / destination : """${to}"""
- Style de trajet : ${input.style}. ${styleHint}
- Durée du séjour : ${n} jour(s). Tu dois proposer EXACTEMENT ${n} journées numérotées (jour 1 à jour ${n}).

Réponds UNIQUEMENT par un objet JSON valide, sans markdown ni texte hors JSON, forme exacte :
{
  "title": "titre court du voyage",
  "days": [
    { "day": 1, "content": "texte détaillé pour cette journée : ordre des étapes, lieux, idées de pauses (paragraphes et/ou puces)" }
  ],
  "tips": "1 à 3 phrases de conseils pratiques (bagages, saison, conduite)"
}

Règles :
- "days" contient EXACTEMENT ${n} objets, avec "day" allant de 1 à ${n} sans trou.
- Contenu en français, clair, directement utilisable sur la route.
- Aucune autre clé que title, days, tips.`;

  const text = await geminiGenerateText(prompt, { maxOutputTokens: 8192, temperature: 0.42 });
  const raw = extractJsonObject(text);
  if (!raw) {
    throw new Error('Réponse IA illisible. Réessayez.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Réponse IA invalide. Réessayez.');
  }

  const obj = parsed as Record<string, unknown>;
  const title = String(obj.title ?? 'Road trip').trim() || 'Road trip';
  const daysRaw = obj.days;
  if (!Array.isArray(daysRaw) || daysRaw.length === 0) {
    throw new Error("L'IA n'a pas renvoyé d'étapes par jour. Réessayez.");
  }

  const days: RoadTripPlannerDay[] = daysRaw.slice(0, 21).map((row, i) => {
    const r = row as Record<string, unknown>;
    const dayNum = typeof r.day === 'number' ? r.day : parseInt(String(r.day ?? i + 1), 10);
    const content = String(r.content ?? r.summary ?? '').trim() || '—';
    return { day: Number.isFinite(dayNum) ? dayNum : i + 1, content };
  });

  const tips = obj.tips != null ? String(obj.tips).trim() : undefined;
  const chatText = formatPlannerDaysForChat(title, days, tips);

  return { title, days, tips, chatText };
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
