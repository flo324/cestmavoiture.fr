import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

import { getGoogleGenerativeApiKeyOptional } from './googleGenerativeApiKey';
import { fetchGeminiGenerateContentDocumentVision } from './geminiModels';

type NormalizeOptions = {
  includeBase64?: boolean;
  quality?: number;
  /** Applique un recadrage auto centré type document A4 */
  autoCropA4?: boolean;
  /** Mode pro: tente une détection IA de la zone document */
  smartDocument?: boolean;
};

type Box = { x: number; y: number; width: number; height: number };

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function parseBox(raw: string): Box | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  const parsed = JSON.parse(match[0]) as Partial<Box>;
  const x = clamp01(Number(parsed.x));
  const y = clamp01(Number(parsed.y));
  const width = clamp01(Number(parsed.width));
  const height = clamp01(Number(parsed.height));
  if (width < 0.1 || height < 0.1) return null;
  return { x, y, width, height };
}

async function detectDocumentBoxWithIA(uri: string): Promise<Box | null> {
  const apiKey = getGoogleGenerativeApiKeyOptional();
  if (!apiKey) return null;
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    if (!base64) return null;
    const prompt = [
      'Tu détectes un document papier (feuille, facture, carte, formulaire) dans une photo.',
      'Retourne UNIQUEMENT un JSON normalisé 0..1:',
      '{"x":0.0,"y":0.0,"width":0.0,"height":0.0}',
      'x,y = coin haut gauche ; width,height = dimensions.',
      'La boîte doit entourer le document principal, sans trop de fond.',
      'Si aucun document clair: retourne la meilleure estimation possible.',
    ].join('\n');

    const res = await fetchGeminiGenerateContentDocumentVision(
      apiKey,
      {
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/jpeg', data: base64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0.05, maxOutputTokens: 200 },
      },
      { maxHttpAttempts: 4 }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const raw = String(json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
    return parseBox(raw);
  } catch {
    return null;
  }
}

/**
 * Post-traitement léger "scan propre":
 * - force JPEG propre
 * - compression contrôlée pour garder la lisibilité
 * - base64 optionnel pour les flux IA
 */
export async function normalizeDocumentCapture(
  uri: string,
  opts: NormalizeOptions = {}
): Promise<{ uri: string; base64?: string }> {
  const includeBase64 = Boolean(opts.includeBase64);
  const quality = opts.quality ?? 0.94;
  try {
    let current = await manipulateAsync(uri, [], {
      compress: quality,
      format: SaveFormat.JPEG,
    });

    // 1) Recadrage intelligent (si disponible)
    if (opts.smartDocument) {
      const detected = await detectDocumentBoxWithIA(current.uri);
      if (detected) {
        const w = current.width;
        const h = current.height;
        const margin = 0.03;
        const x = clamp01(detected.x - margin);
        const y = clamp01(detected.y - margin);
        const r = clamp01(detected.x + detected.width + margin);
        const b = clamp01(detected.y + detected.height + margin);
        const cropW = Math.max(48, Math.floor((r - x) * w));
        const cropH = Math.max(48, Math.floor((b - y) * h));
        const originX = Math.max(0, Math.floor(x * w));
        const originY = Math.max(0, Math.floor(y * h));
        const safeW = Math.min(cropW, w - originX);
        const safeH = Math.min(cropH, h - originY);
        if (safeW >= 48 && safeH >= 48) {
          current = await manipulateAsync(
            current.uri,
            [{ crop: { originX, originY, width: safeW, height: safeH } }],
            { compress: quality, format: SaveFormat.JPEG }
          );
        }
      }
    }

    // 2) Finition A4 sur l'image courante (séquentiel pour éviter les crops invalides)
    if (opts.autoCropA4) {
      const baseW = current.width;
      const baseH = current.height;
      const targetRatio = 1 / 1.414;
      const currentRatio = baseW / baseH;
      let cropW = baseW;
      let cropH = baseH;
      if (currentRatio > targetRatio) {
        cropW = Math.floor(baseH * targetRatio);
        cropH = baseH;
      } else {
        cropW = baseW;
        cropH = Math.floor(baseW / targetRatio);
      }
      cropW = Math.floor(cropW * 0.96);
      cropH = Math.floor(cropH * 0.96);
      const originX = Math.max(0, Math.floor((baseW - cropW) / 2));
      const originY = Math.max(0, Math.floor((baseH - cropH) / 2));
      if (cropW >= 48 && cropH >= 48) {
        current = await manipulateAsync(
          current.uri,
          [{ crop: { originX, originY, width: cropW, height: cropH } }],
          { compress: quality, format: SaveFormat.JPEG }
        );
      }
    }

    const out = await manipulateAsync(current.uri, [], {
      compress: quality,
      format: SaveFormat.JPEG,
      base64: includeBase64,
    });
    return { uri: out.uri, base64: out.base64 };
  } catch {
    // Ne jamais bloquer le flux photo: fallback sur l'image brute normalisée minimale.
    const fallback = await manipulateAsync(uri, [], {
      compress: quality,
      format: SaveFormat.JPEG,
      base64: includeBase64,
    });
    return { uri: fallback.uri, base64: fallback.base64 };
  }
}
