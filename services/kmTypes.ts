/** Types persistés partagés entre KilometrageContext et la tâche GPS arrière-plan. */

export const KM_KEY = '@kilometrage_save';
export const KM_STATE_KEY = '@kilometrage_state_v2';

export type KmPersistedState = {
  totalKm: number;
  day: { key: string; startTotalKm: number };
  week: { key: string; startTotalKm: number };
  month: { key: string; startTotalKm: number };
  year: { key: string; startTotalKm: number };
  /** Dernier point GPS accepté (précision OK) pour enchaîner Haversine */
  lastAccepted?: { lat: number; lon: number; t: number };
  /** Vitesse lissée affichée (km/h) */
  lastSpeedKmh?: number;
  /**
   * Trajet en cours accumulé uniquement en arrière-plan (avant fusion au retour au premier plan).
   */
  bgTrip?: {
    lastAccepted?: { lat: number; lon: number; t: number };
    tripStart?: { lat: number; lon: number; t: number };
    accKm: number;
  };
};

export type TrackingPoint = { lat: number; lon: number; t: number };
