/**
 * Test minimal : vérifie si la clé Gemini répond (hors appli).
 * Usage : node test_key.js
 */
const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (_) {
  /* dotenv optionnel */
}

const apiKey =
  String(process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '').trim() ||
  String(process.env.EXPO_PUBLIC_GOOGLE_API_KEY ?? '').trim();

/** Même famille que roadTripAI / location (v1beta). Si 404, change le nom (ex. gemini-2.0-flash). */
const MODEL = process.env.GEMINI_TEST_MODEL || 'gemini-2.0-flash';
const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

async function main() {
  console.log('--- Test clé Gemini ---');
  console.log('Modèle :', MODEL);
  console.log(
    'Clé lue depuis :',
    process.env.EXPO_PUBLIC_GOOGLE_API_KEY ? 'EXPO_PUBLIC_GOOGLE_API_KEY' : process.env.EXPO_PUBLIC_GEMINI_API_KEY ? 'EXPO_PUBLIC_GEMINI_API_KEY' : '(aucune)'
  );
  console.log('Longueur clé :', apiKey ? apiKey.length : 0);
  console.log('');

  if (!apiKey) {
    console.error(
      'ERREUR : aucune clé. Créez-en une sur https://aistudio.google.com/apikey puis EXPO_PUBLIC_GEMINI_API_KEY=... dans .env (ou EXPO_PUBLIC_GOOGLE_API_KEY).'
    );
    process.exit(1);
  }

  const body = {
    contents: [{ role: 'user', parts: [{ text: 'Coucou' }] }],
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }

    console.log('HTTP status :', res.status, res.statusText);
    console.log('');

    if (!res.ok) {
      console.error('--- ERREUR API (réponse complète) ---');
      console.error(typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2));
      process.exit(1);
    }

    console.log('--- SUCCÈS : réponse complète ---');
    console.log(JSON.stringify(parsed, null, 2));

    const reply =
      parsed?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '(pas de texte)';
    console.log('');
    console.log('--- Texte extrait pour l’utilisateur ---');
    console.log(reply);
  } catch (err) {
    console.error('--- ERREUR RÉSEAU / EXCEPTION ---');
    console.error(err);
    if (err?.cause) console.error('cause :', err.cause);
    process.exit(1);
  }
}

main();
