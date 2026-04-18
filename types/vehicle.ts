/** Données véhicule (UI). Les champs serveur Supabase sont : marque, modele, immatriculation, kilometrage, photo_url. */
export type VehicleData = {
  marque: string;
  modele: string;
  /** Représente la colonne `immatriculation` côté Supabase. */
  immat: string;
  kilometrage: number;
  alias: string;
  prenom: string;
  nom: string;
  photoUri: string;
  photoBgCenter: string;
  photoBgEdge: string;
};

export type VehicleItem = VehicleData & { id: string };
