import { documentDirectory, downloadAsync } from 'expo-file-system/legacy';
import { userGetItem, userSetItem } from './userStorage';

const STORAGE_KEY_ENTRETIEN_MODULES = '@ma_voiture_entretien_modules_v1';

type EntretienModules = {
  pneus?: Record<string, string>;
  batterie?: Record<string, string>;
  phares?: { photoUri?: string; ampoule?: string; position?: string; commentaire?: string };
  modeEmploi?: { manualUrl?: string; localPdfUri?: string; lastSearchQuery?: string };
};

function buildManualSearchQuery(modele: string, immat: string): string {
  const base = `${modele || ''} ${immat || ''}`.trim();
  return `${base} manuel utilisateur pdf`.trim();
}

function isDisallowedManualUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return true;
    const host = u.hostname.toLowerCase();
    if (host === 'google.com' || host.endsWith('.google.com') || host === 'google.fr' || host.endsWith('.google.fr')) {
      return true;
    }
    if (host.includes('bing.com') && u.pathname.includes('/search')) return true;
    if (host.includes('duckduckgo.com')) return true;
    if (host === 'yahoo.com' || host.endsWith('.yahoo.com')) return true;
    return false;
  } catch {
    return true;
  }
}

async function fetchDirectPdfUrlFromGemini(modele: string, immat: string): Promise<{ url: string; query: string }> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
  if (!apiKey) throw new Error('missing api key');
  const query = buildManualSearchQuery(modele, immat);
  const prompt = [
    "Tu es un assistant documentation automobile dans l'app OTTO.",
    `Vehicule: ${modele || 'inconnu'}`,
    `Immatriculation: ${immat || 'inconnue'}`,
    'Trouve une URL HTTPS DIRECTE vers un fichier PDF du manuel utilisateur (site constructeur, documentation officielle, ou source technique fiable).',
    'INTERDIT ABSOLU: google.com, google.fr, bing.com/duckduckgo/yahoo pages de recherche, liens raccourcis.',
    'L URL doit permettre de telecharger ou afficher le PDF sans passer par une page de moteur de recherche.',
    'Reponds UNIQUEMENT en JSON valide: {"url":"https://exemple.com/chemin/manuel.pdf"}',
    'Si tu ne connais aucune URL fiable et verifiable, reponds exactement: {"url":""}',
  ].join('\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 160 },
      }),
    }
  );
  if (!response.ok) throw new Error('gemini http');
  const json = await response.json();
  const rawText = String(json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
  const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);
  const url = String(parsed?.url ?? '').trim();
  if (!url) throw new Error('no pdf url');
  if (isDisallowedManualUrl(url)) throw new Error('disallowed url');
  if (!url.startsWith('https://') && !url.startsWith('http://')) throw new Error('invalid url');
  return { url, query };
}

async function downloadManualPdfToDevice(pdfUrl: string, modele: string): Promise<string> {
  const safe = String(modele || 'vehicule')
    .replace(/[^\w\d]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 48);
  const base = documentDirectory ?? '';
  const dest = `${base}manuel_${safe}_${Date.now()}.pdf`;
  const result = await downloadAsync(pdfUrl, dest);
  if (result.status !== 200) throw new Error(`download failed (${result.status})`);
  return result.uri;
}

export async function autoAttachManualForVehicle(modele: string, immat: string): Promise<boolean> {
  const m = String(modele || '').trim();
  if (!m) return false;
  try {
    const { url, query } = await fetchDirectPdfUrlFromGemini(m, String(immat || '').trim());
    const localUri = await downloadManualPdfToDevice(url, m);

    const raw = await userGetItem(STORAGE_KEY_ENTRETIEN_MODULES);
    const parsed = raw ? (JSON.parse(raw) as EntretienModules) : {};
    const next: EntretienModules = {
      ...parsed,
      modeEmploi: {
        ...(parsed.modeEmploi ?? {}),
        manualUrl: url,
        localPdfUri: localUri,
        lastSearchQuery: query,
      },
    };
    await userSetItem(STORAGE_KEY_ENTRETIEN_MODULES, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

