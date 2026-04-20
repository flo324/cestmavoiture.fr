/**
 * Identifiants de modèles pour l’API Generative Language (REST).
 * Texte (chat, road trip) : …/v1/models/{id}:generateContent
 * Vision / documents : préférer v1beta + Gemini 3 (preview), avec repli v1 + modèles stables.
 */
export const GEMINI_API_VERSION = 'v1' as const;

/** Aligné sur la liste officielle (name sans préfixe `models/`). */
export const GEMINI_MODEL_1_5_PRO = 'gemini-1.5-pro';
/** @deprecated Préférer GEMINI_MODEL_2_5_FLASH (évite les 404 sur les anciens id). */
export const GEMINI_MODEL_1_5_FLASH = 'gemini-1.5-flash';
export const GEMINI_MODEL_2_0_FLASH = 'gemini-2.0-flash';
/** Modèle flash rapide par défaut (remplace l’ancien gemini-1.5-flash). */
export const GEMINI_MODEL_2_5_FLASH = 'gemini-2.5-flash';

/** Gemini 3 — prioritaire pour scan / OCR / images (souvent réservé à v1beta). */
export const GEMINI_MODEL_3_FLASH_PREVIEW = 'gemini-3-flash-preview';

export function generativeLanguageGenerateUrl(modelId: string, apiKey: string): string {
  const k = encodeURIComponent(apiKey);
  return `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${modelId}:generateContent?key=${k}`;
}

export type GeminiApiVersion = 'v1' | 'v1beta';

export function generativeLanguageGenerateUrlWithVersion(
  modelId: string,
  apiKey: string,
  apiVersion: GeminiApiVersion
): string {
  const k = encodeURIComponent(apiKey);
  return `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelId}:generateContent?key=${k}`;
}

/**
 * Ordre d’essai pour tout flux **photo / document** (classification scan, CT, cadre A4).
 * Gemini 3 en tête, puis repli flash/pro.
 */
export const DOCUMENT_VISION_MODELS: readonly string[] = [
  GEMINI_MODEL_3_FLASH_PREVIEW,
  'gemini-3.1-flash-lite-preview',
  GEMINI_MODEL_2_5_FLASH,
  GEMINI_MODEL_2_0_FLASH,
  GEMINI_MODEL_1_5_PRO,
];

const DOCUMENT_VISION_API_ORDER: readonly GeminiApiVersion[] = ['v1beta', 'v1'];

export type DocumentVisionFetchOptions = {
  /**
   * Limite le nombre d’appels HTTP (modèle × version). Trop d’essais avec une grosse image
   * peut saturer la mémoire (OOM) et faire redémarrer l’app Android après le scan.
   * @default 6 pour la classification ; 3–4 suffisent pour un simple détecteur de cadre.
   */
  maxHttpAttempts?: number;
};

/**
 * `generateContent` avec repli automatique : **v1beta** puis **v1**, et liste de modèles (Gemini 3 → 2.x → 1.5 pro).
 * À utiliser pour les requêtes multimodales (inline image), pas pour le simple chat texte.
 */
export async function fetchGeminiGenerateContentDocumentVision(
  apiKey: string,
  requestBody: Record<string, unknown>,
  opts?: DocumentVisionFetchOptions
): Promise<Response> {
  const maxHttpAttempts = opts?.maxHttpAttempts ?? 6;
  const bodyStr = JSON.stringify(requestBody);
  let last: Response | null = null;
  let attempts = 0;
  for (const apiVersion of DOCUMENT_VISION_API_ORDER) {
    for (const model of DOCUMENT_VISION_MODELS) {
      if (attempts >= maxHttpAttempts) {
        return last ?? new Response(null, { status: 503, statusText: 'No Gemini document response' });
      }
      attempts += 1;
      const url = generativeLanguageGenerateUrlWithVersion(model, apiKey, apiVersion);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr,
      });
      last = res;
      if (res.ok) return res;
    }
  }
  return last ?? new Response(null, { status: 503, statusText: 'No Gemini document response' });
}
