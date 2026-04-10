type VehicleLookupResult = {
  make?: string;
  model?: string;
  fullModel?: string;
};

const API_PLAQUE_ENDPOINT = 'https://api.apiplaqueimmatriculation.com/plaque';
const API_PLAQUE_DEMO_TOKEN = 'TokenDemo2026B';

function normalizePlate(plate: string): string {
  return String(plate || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  return clean.length > 0 ? clean : undefined;
}

function fromPayload(payload: any): VehicleLookupResult | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload.data ?? payload.result ?? payload.vehicle ?? payload;

  const make =
    readString(data.make) ??
    readString(data.brand) ??
    readString(data.marque);

  const model =
    readString(data.model) ??
    readString(data.modele) ??
    readString(data.vehicleModel);

  const fullModel =
    readString(data.fullModel) ??
    readString(data.vehicle) ??
    readString(data.designation) ??
    [make, model].filter(Boolean).join(' ').trim();

  if (!make && !model && !fullModel) return null;
  return { make, model, fullModel: fullModel || undefined };
}

export async function lookupVehicleByPlate(plateInput: string): Promise<VehicleLookupResult | null> {
  const plate = normalizePlate(plateInput);
  if (!plate) return null;

  // Fast path for apiplaqueimmatriculation.com (FR).
  const providerToken = process.env.EXPO_PUBLIC_API_PLAQUE_TOKEN || API_PLAQUE_DEMO_TOKEN;
  if (providerToken) {
    const providerUrl = `${API_PLAQUE_ENDPOINT}?immatriculation=${encodeURIComponent(plate)}&token=${encodeURIComponent(providerToken)}&pays=FR`;
    try {
      const response = await fetch(providerUrl, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        const json = await response.json();
        const mapped = fromPayload(json);
        if (mapped) return mapped;
      }
    } catch {
      // Continue with generic provider fallback.
    }
  }

  const baseUrl = process.env.EXPO_PUBLIC_PLATE_LOOKUP_URL;
  const apiKey = process.env.EXPO_PUBLIC_PLATE_LOOKUP_KEY;
  if (!baseUrl) return null;

  const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}plate=${encodeURIComponent(plate)}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) return null;
    const json = await response.json();
    return fromPayload(json);
  } catch {
    return null;
  }
}

