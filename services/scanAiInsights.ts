import { fetchGeminiGenerateContentDocumentVision } from './geminiModels';
import { getGoogleGenerativeApiKeyOptional } from './googleGenerativeApiKey';

export type ScanAiInsights = {
  summary: string;
  confidence: number;
  documentLabel?: string;
  fields?: {
    facture?: {
      title?: string;
      supplier?: string;
      date?: string;
      amountTtc?: string;
      km?: string;
      details?: string;
    };
    entretien?: {
      title?: string;
      notes?: string;
    };
    diagnostic?: {
      title?: string;
      notes?: string;
    };
    ct?: {
      result?: string;
      nextDueDate?: string;
      mileage?: string;
      notes?: string;
    };
    permis?: {
      holderName?: string;
      permitNumber?: string;
      categories?: string;
      expiryDate?: string;
    };
    carteGrise?: {
      plate?: string;
      vin?: string;
      brand?: string;
      model?: string;
      firstRegistrationDate?: string;
    };
  };
  stats?: {
    amountTtc?: number;
    mileage?: number;
    hasDeadline?: boolean;
  };
};

function safeText(v: unknown, max = 300): string {
  return String(v ?? '').trim().slice(0, max);
}

function safeNumber(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function clampConfidence(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function parseInsightJson(raw: string): ScanAiInsights | null {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  const parsed = JSON.parse(match[0]) as Record<string, unknown>;
  const fields = (parsed.fields ?? {}) as Record<string, unknown>;
  const stats = (parsed.stats ?? {}) as Record<string, unknown>;

  return {
    summary: safeText(parsed.summary, 420) || 'Document analysé automatiquement.',
    confidence: clampConfidence(parsed.confidence),
    documentLabel: safeText(parsed.documentLabel, 80),
    fields: {
      facture: fields.facture as ScanAiInsights['fields']['facture'],
      entretien: fields.entretien as ScanAiInsights['fields']['entretien'],
      diagnostic: fields.diagnostic as ScanAiInsights['fields']['diagnostic'],
      ct: fields.ct as ScanAiInsights['fields']['ct'],
      permis: fields.permis as ScanAiInsights['fields']['permis'],
      carteGrise: fields.carteGrise as ScanAiInsights['fields']['carteGrise'],
    },
    stats: {
      amountTtc: safeNumber(stats.amountTtc),
      mileage: safeNumber(stats.mileage),
      hasDeadline: Boolean(stats.hasDeadline),
    },
  };
}

function buildExtractionPrompt(suggestedId: number): string {
  return [
    'Tu analyses une photo de document automobile français.',
    `Catégorie estimée en entrée: ${suggestedId} (1=entretien, 2=documents, 3=diagnostic, 4=facture, 5=ct).`,
    'Extrait les informations utiles et retourne UNIQUEMENT un JSON strict.',
    'Ne jamais inventer une donnée absente.',
    'Utilise des chaînes vides si inconnu.',
    'Format:',
    '{"summary":"...","confidence":0.0,"documentLabel":"","fields":{"facture":{"title":"","supplier":"","date":"","amountTtc":"","km":"","details":""},"entretien":{"title":"","notes":""},"diagnostic":{"title":"","notes":""},"ct":{"result":"","nextDueDate":"","mileage":"","notes":""},"permis":{"holderName":"","permitNumber":"","categories":"","expiryDate":""},"carteGrise":{"plate":"","vin":"","brand":"","model":"","firstRegistrationDate":""}},"stats":{"amountTtc":0,"mileage":0,"hasDeadline":false}}',
    'Règles:',
    '- summary: 1 phrase claire en français pour l’utilisateur.',
    '- confidence: 0..1 selon lisibilité globale.',
    '- documentLabel: "Permis" | "Carte Grise" | "CT" | "Facture" | "Assurance" | "Autre".',
    '- Pour amountTtc/mileage: nombre sans unité si lisible, sinon 0.',
    '- hasDeadline=true si une date de validité/prochain contrôle est détectée.',
  ].join('\n');
}

export async function extractScanInsights(
  base64: string,
  suggestedId: number
): Promise<ScanAiInsights | null> {
  const apiKey = getGoogleGenerativeApiKeyOptional();
  if (!apiKey || !base64) return null;

  try {
    const response = await fetchGeminiGenerateContentDocumentVision(
      apiKey,
      {
        contents: [
          {
            role: 'user',
            parts: [
              { text: buildExtractionPrompt(suggestedId) },
              { inline_data: { mime_type: 'image/jpeg', data: base64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: 900 },
      },
      { maxHttpAttempts: 6 }
    );
    if (!response.ok) return null;
    const json = await response.json();
    const rawText = String(json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
    return parseInsightJson(rawText);
  } catch {
    return null;
  }
}
