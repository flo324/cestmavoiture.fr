import * as Location from 'expo-location';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View, ViewStyle } from 'react-native';

type AddressSuggestion = {
  label: string;
  city: string;
  postcode: string;
  score: number;
  lat?: number;
  lon?: number;
};

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: TextInputProps['style'];
  placeholderTextColor?: string;
};

export function AddressAutocompleteInput({
  value,
  onChangeText,
  placeholder = 'Adresse',
  containerStyle,
  inputStyle,
  placeholderTextColor = '#64748b',
}: Props) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [origin, setOrigin] = useState<{ lat: number; lon: number } | null>(null);
  const safeValue = value === '0' ? '' : value;
  const query = safeValue.trim();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (cancelled || !lastKnown?.coords) return;
        setOrigin({ lat: lastKnown.coords.latitude, lon: lastKnown.coords.longitude });
      } catch {
        // Pas bloquant: on garde un tri textuel si la géolocalisation n'est pas disponible.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        setLoading(true);
        const bias = origin ? `&lat=${origin.lat}&lon=${origin.lon}` : '';
        const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=8&autocomplete=1${bias}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('address api failed');
        const json = (await response.json()) as {
          features?: Array<{
            properties?: { label?: string; city?: string; postcode?: string; score?: number; x?: number; y?: number };
          }>;
        };
        if (cancelled) return;
        const normalizedQuery = normalize(query);
        const next = (json.features ?? [])
          .map((x) => ({
            label: String(x.properties?.label ?? '').trim(),
            city: String(x.properties?.city ?? '').trim(),
            postcode: String(x.properties?.postcode ?? '').trim(),
            score: Number(x.properties?.score ?? 0),
            lon: Number(x.properties?.x ?? NaN),
            lat: Number(x.properties?.y ?? NaN),
          }))
          .filter((x) => x.label.length > 0);
        const ranked = [...next].sort((a, b) => {
          const aScore = rankAddress(a, normalizedQuery, origin);
          const bScore = rankAddress(b, normalizedQuery, origin);
          return bScore - aScore;
        });
        setItems(ranked.slice(0, 6));
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, origin]);

  const showList = useMemo(() => items.length > 0 && query.length >= 2, [items.length, query.length]);

  return (
    <View style={containerStyle}>
      <View style={styles.inputWrap}>
        <TextInput
          style={[styles.inputBase, inputStyle]}
          value={safeValue}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={placeholderTextColor}
          autoCapitalize="words"
          autoCorrect={false}
        />
        {loading ? <ActivityIndicator size="small" color="#67e8f9" /> : null}
      </View>
      {showList ? (
        <View style={styles.dropdown}>
          {items.map((item, idx) => (
            <TouchableOpacity
              key={`${item.label}-${idx}`}
              style={styles.row}
              onPress={() => {
                onChangeText(item.label);
                setItems([]);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.label}>{item.label}</Text>
              <Text style={styles.meta}>
                {item.postcode} {item.city}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inputWrap: { flexDirection: 'row', alignItems: 'center' },
  inputBase: { flex: 1 },
  dropdown: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0b1322',
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#243246',
  },
  label: { color: '#e2e8f0', fontSize: 12, fontWeight: '700' },
  meta: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
});

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function rankAddress(
  item: AddressSuggestion,
  normalizedQuery: string,
  origin: { lat: number; lon: number } | null
): number {
  const label = normalize(item.label);
  let score = item.score * 100;
  if (label.startsWith(normalizedQuery)) score += 30;
  if (label.includes(normalizedQuery)) score += 12;
  if (origin && Number.isFinite(item.lat) && Number.isFinite(item.lon)) {
    const km = distanceKm(origin.lat, origin.lon, Number(item.lat), Number(item.lon));
    score += Math.max(0, 22 - km);
  }
  return score;
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

