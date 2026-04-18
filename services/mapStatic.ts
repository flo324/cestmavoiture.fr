/** Aperçu carte sans SDK Google (tuiles OSM statiques) — utile si la clé Maps Android manque. */
export function staticOsmMapUrl(lat: number, lng: number, sizePx: number, zoom = 15): string {
  const z = Math.min(18, Math.max(8, zoom));
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${z}&size=${sizePx}x${sizePx}&maptype=mapnik`;
}
