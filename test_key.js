/**
 * Test clé Gemini : liste les modèles via l’API, puis essaie generateContent.
 * Usage : node test_key.js
 *
 * GEMINI_TEST_MODEL=gemini-xxx — force un seul modèle (ignore la liste).
 * SKIP_LIST_MODELS=1 — n’utilise pas ListModels, garde la liste statique de secours.
 */
const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (_) {
  /* dotenv optionnel */
}

const apiKey =
  String(process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '').trim() ||
  String(process.env.EXPO_PUBLIC_GOOGLE_API_KEY ?? '').trim() ||
  String(process.env.GOOGLE_API_KEY ?? '').trim();

const STATIC_FALLBACK_MODELS = [
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'gemini-1.5-pro-latest',
];

const body = {
  contents: [{ role: 'user', parts: [{ text: 'Réponds uniquement : OK' }] }],
};

function looksLikeGoogleApiKey(k) {
  return typeof k === 'string' && k.length >= 30 && /^[A-Za-z0-9_-]+$/.test(k);
}

/** IDs utilisables pour :generateContent selon ton projet (évite les 404). */
async function listGenerateContentModelIds(key) {
  const ids = [];
  let pageToken = '';
  do {
    const u = new URL('https://generativelanguage.googleapis.com/v1/models');
    u.searchParams.set('key', key);
    u.searchParams.set('pageSize', '100');
    if (pageToken) u.searchParams.set('pageToken', pageToken);
    const res = await fetch(u.toString());
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`ListModels HTTP ${res.status}`);
      err.body = text;
      throw err;
    }
    const data = JSON.parse(text);
    for (const m of data.models || []) {
      const methods = m.supportedGenerationMethods || [];
      if (!methods.includes('generateContent')) continue;
      const name = String(m.name || '');
      const id = name.startsWith('models/') ? name.slice('models/'.length) : name;
      if (id) ids.push(id);
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return ids;
}

/** Ordre de test : flash / lite d’abord (souvent plus de quota que 2.0), puis pro. */
function sortModelIdsForTest(ids) {
  const rank = (id) => {
    const s = id.toLowerCase();
    if (s.includes('flash-lite') || s.includes('flash_lite')) return 0;
    if (s.includes('2.5') && s.includes('flash')) return 1;
    if (s.includes('1.5-flash')) return 2;
    if (s.includes('2.0') && s.includes('flash')) return 3;
    if (s.includes('flash')) return 4;
    if (s.includes('pro')) return 6;
    return 5;
  };
  return [...ids].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function keyFingerprint(k) {
  if (!k || k.length < 12) return '(vide)';
  return k.slice(0, 8) + '…' + k.slice(-4);
}

async function main() {
  console.log('--- Test clé Gemini ---');
  const kForLog =
    String(process.env.GOOGLE_API_KEY ?? '').trim() ||
    String(process.env.EXPO_PUBLIC_GOOGLE_API_KEY ?? '').trim() ||
    String(process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '').trim();
  if (kForLog) {
    console.log('Connecté au projet Google Cloud via la clé :', kForLog.substring(0, 5) + '...');
  }
  console.log(
    'Clé lue depuis :',
    process.env.EXPO_PUBLIC_GEMINI_API_KEY
      ? 'EXPO_PUBLIC_GEMINI_API_KEY'
      : process.env.EXPO_PUBLIC_GOOGLE_API_KEY
        ? 'EXPO_PUBLIC_GOOGLE_API_KEY'
        : process.env.GOOGLE_API_KEY
          ? 'GOOGLE_API_KEY'
          : '(aucune)'
  );
  console.log('Empreinte clé :', keyFingerprint(apiKey), '(vérifie que c’est la même que dans le navigateur si ListModels y marchait)');
  console.log('Longueur clé :', apiKey ? apiKey.length : 0);
  if (apiKey && !looksLikeGoogleApiKey(apiKey)) {
    console.warn('(!) Format de clé inhabituel (guillemets/espaces dans .env ?).');
  }
  console.log('');

  if (!apiKey) {
    console.error(
      'ERREUR : aucune clé. Dans .env : EXPO_PUBLIC_GEMINI_API_KEY=votre_cle (sans guillemets). https://aistudio.google.com/apikey'
    );
    process.exit(1);
  }

  let modelsToTry = [];

  if (process.env.GEMINI_TEST_MODEL) {
    modelsToTry = [process.env.GEMINI_TEST_MODEL.trim()];
    console.log('Modèle forcé (GEMINI_TEST_MODEL) :', modelsToTry[0]);
  } else if (process.env.SKIP_LIST_MODELS === '1') {
    modelsToTry = STATIC_FALLBACK_MODELS;
    console.log('Liste statique (SKIP_LIST_MODELS=1) :', modelsToTry.join(', '));
  } else {
    try {
      const fromApi = await listGenerateContentModelIds(apiKey);
      if (fromApi.length === 0) {
        console.warn('ListModels : aucun modèle avec generateContent — fallback statique.');
        modelsToTry = STATIC_FALLBACK_MODELS;
      } else {
        modelsToTry = sortModelIdsForTest(fromApi);
        console.log('Modèles autorisés pour generateContent (' + modelsToTry.length + ') :');
        console.log(modelsToTry.join(', '));
      }
    } catch (e) {
      console.warn('ListModels a échoué :', e.message);
      if (e.body) console.warn(e.body.slice(0, 400));
      console.warn('→ fallback liste statique.');
      modelsToTry = STATIC_FALLBACK_MODELS;
    }
  }

  console.log('');

  let lastStatus = 0;
  let lastBody = '';

  for (const model of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      lastStatus = res.status;
      lastBody = text;

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }

      if (res.status === 400) {
        const msg = typeof parsed === 'object' && parsed?.error?.message ? parsed.error.message : text;
        if (String(msg).includes('API key not valid') || String(msg).includes('API_KEY_INVALID')) {
          console.error('HTTP 400 — clé refusée par Google.');
          console.error('Détail :', typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2));
          process.exit(1);
        }
      }

      if (res.ok) {
        console.log('--- SUCCÈS ---');
        console.log('Modèle utilisé :', model);
        console.log('HTTP :', res.status);
        console.log(JSON.stringify(parsed, null, 2));
        const reply =
          parsed?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '(pas de texte)';
        console.log('');
        console.log('Texte :', reply);
        process.exit(0);
      }

      const hint =
        res.status === 429
          ? ' (quota / limite — attends 1–2 min ou active la facturation / autre modèle)'
          : '';
      console.warn(`→ ${model} : HTTP ${res.status}${hint}`);
    } catch (err) {
      console.error('--- ERREUR RÉSEAU ---');
      console.error(err);
      process.exit(1);
    }
  }

  console.error('');
  console.error('--- Aucun modèle n’a répondu OK ---');
  console.error('Dernier HTTP :', lastStatus);
  try {
    console.error(JSON.stringify(JSON.parse(lastBody), null, 2));
  } catch {
    console.error(lastBody);
  }
  console.error('');
  if (lastStatus === 429) {
    console.error(
      'Tout est en 429 : quota minute/jour atteint pour ce projet. Réessaie plus tard ou lie la facturation / augmente le palier dans AI Studio.'
    );
  }
  console.error(
    'Compare l’empreinte clé ci-dessus avec celle de la clé qui fonctionne dans le navigateur (même projet Google).'
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
