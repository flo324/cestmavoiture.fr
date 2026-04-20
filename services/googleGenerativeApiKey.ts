/**
 * Clé unique pour l’API Generative Language (Gemini), même valeur qu’une clé créée dans Google AI Studio ou dans
 * Google Cloud → APIs et services → Identifiants (Generative Language / Gemini activés sur le projet).
 * Priorité : EXPO_PUBLIC_GEMINI_API_KEY, sinon EXPO_PUBLIC_GOOGLE_API_KEY (nom historique).
 * Les appels utilisent l’endpoint v1 (generateContent).
 * @see https://aistudio.google.com/apikey
 */
let loggedGeminiKeyHint = false;

export function logGoogleGenerativeKeyHintOnce(): void {
  if (loggedGeminiKeyHint) return;
  loggedGeminiKeyHint = true;
  const k =
    String(process.env.GOOGLE_API_KEY ?? '').trim() ||
    String(process.env.EXPO_PUBLIC_GOOGLE_API_KEY ?? '').trim() ||
    String(process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '').trim();
  if (!k) return;
  const prefix = k.length >= 5 ? `${k.slice(0, 5)}...` : '***';
  console.log('Connecté au projet Google Cloud via la clé :', prefix);
}

export function getGoogleGenerativeApiKeyOptional(): string {
  return (
    String(process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '').trim() ||
    String(process.env.EXPO_PUBLIC_GOOGLE_API_KEY ?? '').trim() ||
    String(process.env.GOOGLE_API_KEY ?? '').trim()
  );
}

export function getGoogleGenerativeApiKey(): string {
  const k = getGoogleGenerativeApiKeyOptional();
  if (!k) {
    throw new Error(
      'Clé API Gemini manquante : créez une clé sur https://aistudio.google.com/apikey puis définissez EXPO_PUBLIC_GEMINI_API_KEY dans .env (et sur expo.dev pour EAS). Ancien nom accepté : EXPO_PUBLIC_GOOGLE_API_KEY.'
    );
  }
  return k;
}
