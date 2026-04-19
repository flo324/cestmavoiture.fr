/**
 * Clé unique pour l’API Generative Language (Gemini) côté app.
 * Priorité : EXPO_PUBLIC_GEMINI_API_KEY (recommandé, clé Google AI Studio), sinon EXPO_PUBLIC_GOOGLE_API_KEY (nom historique).
 * @see https://aistudio.google.com/apikey
 */
export function getGoogleGenerativeApiKeyOptional(): string {
  return (
    String(process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '').trim() ||
    String(process.env.EXPO_PUBLIC_GOOGLE_API_KEY ?? '').trim()
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
