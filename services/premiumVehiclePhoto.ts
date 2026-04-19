import * as FileSystem from 'expo-file-system/legacy';

import { getGoogleGenerativeApiKeyOptional } from './googleGenerativeApiKey';

const REMOVE_BG_API_KEY = process.env.EXPO_PUBLIC_REMOVEBG_API_KEY;
const GEMINI_MODEL = 'gemini-1.5-flash';

type StudioPalette = {
  center: string;
  edge: string;
};

function clamp(v: number, min = 0, max = 255): number {
  return Math.max(min, Math.min(max, v));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b)
    .toString(16)
    .padStart(2, '0')}`.toUpperCase();
}

function mix(hexA: string, hexB: string, ratio: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return '#1A2433';
  const t = Math.max(0, Math.min(1, ratio));
  return rgbToHex(
    Math.round(a.r + (b.r - a.r) * t),
    Math.round(a.g + (b.g - a.g) * t),
    Math.round(a.b + (b.b - a.b) * t)
  );
}

function normalizeHex(input: string): string | null {
  const m = input.toUpperCase().match(/#[0-9A-F]{6}/);
  return m ? m[0] : null;
}

function defaultPalette(): StudioPalette {
  return { center: '#334155', edge: '#0B1120' };
}

function buildPaletteFromBase(baseHex: string): StudioPalette {
  return {
    center: mix(baseHex, '#FFFFFF', 0.3),
    edge: mix(baseHex, '#030712', 0.72),
  };
}

async function toDataUrlBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      const data = result.split(',')[1] ?? '';
      if (!data) {
        reject(new Error('Blob to base64 failed'));
        return;
      }
      resolve(data);
    };
    reader.onerror = () => reject(new Error('Blob reader error'));
    reader.readAsDataURL(blob);
  });
}

async function removeBackground(uri: string): Promise<string> {
  if (!REMOVE_BG_API_KEY) return uri;
  try {
    const imageBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const formData = new FormData();
    formData.append('image_file_b64', imageBase64);
    formData.append('size', 'auto');
    formData.append('format', 'png');

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': REMOVE_BG_API_KEY },
      body: formData,
    });

    if (!response.ok) return uri;
    const blob = await response.blob();
    const b64 = await toDataUrlBase64(blob);
    const out = `${FileSystem.cacheDirectory}vehicle-cutout-${Date.now()}.png`;
    await FileSystem.writeAsStringAsync(out, b64, { encoding: FileSystem.EncodingType.Base64 });
    return out;
  } catch (error) {
    console.log('[PremiumPhoto] remove.bg failed', error);
    return uri;
  }
}

async function detectDominantColor(uri: string): Promise<string | null> {
  const GEMINI_API_KEY = getGoogleGenerativeApiKeyOptional();
  if (!GEMINI_API_KEY) return null;
  try {
    const base64Image = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const prompt = [
      'Analyse cette photo de voiture.',
      'Donne UNIQUEMENT la couleur dominante de la carrosserie au format hexadécimal #RRGGBB.',
      'Aucune phrase, aucun markdown, uniquement #RRGGBB.',
    ].join('\n');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
              ],
            },
          ],
          generationConfig: { temperature: 0.05 },
        }),
      }
    );

    if (!response.ok) return null;
    const json = await response.json();
    const raw = String(json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
    return normalizeHex(raw);
  } catch (error) {
    console.log('[PremiumPhoto] dominant color failed', error);
    return null;
  }
}

export async function enhanceVehiclePhotoPremium(uri: string): Promise<{ photoUri: string; palette: StudioPalette }> {
  const cutoutUri = await removeBackground(uri);
  const dominant = await detectDominantColor(uri);
  const palette = dominant ? buildPaletteFromBase(dominant) : defaultPalette();
  return { photoUri: cutoutUri, palette };
}

