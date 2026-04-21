import React, { useEffect, useState } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextInput, TextStyle, View, ViewStyle } from 'react-native';

export type AddressParts = {
  numero: string;
  rue: string;
  ville: string;
  dep: string;
};

type Suggestion = {
  id: string;
  label: string;
  houseNumber: string;
  street: string;
  city: string;
  dep: string;
};

type Props = {
  value: AddressParts;
  onChange: (next: AddressParts) => void;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
};

export function AddressPartsAutocompleteInput({ value, onChange, containerStyle, inputStyle }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    const q = value.rue.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&autocomplete=1&limit=6`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('address api');
        const json = (await response.json()) as {
          features?: Array<{
            properties?: {
              label?: string;
              housenumber?: string;
              street?: string;
              name?: string;
              city?: string;
              context?: string;
              postcode?: string;
            };
          }>;
        };
        if (cancelled) return;
        const next = (json.features ?? []).map((feature, idx) => {
          const p = feature.properties ?? {};
          return {
            id: `${String(p.label ?? '')}-${idx}`,
            label: String(p.label ?? '').trim(),
            houseNumber: String(p.housenumber ?? '').trim(),
            street: String(p.street ?? p.name ?? '').trim(),
            city: String(p.city ?? '').trim(),
            dep: extractDep(String(p.context ?? ''), String(p.postcode ?? '')),
          } satisfies Suggestion;
        });
        setSuggestions(next.filter((x) => x.label.length > 0));
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 240);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value.rue]);

  return (
    <View style={containerStyle}>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.numInput, inputStyle]}
          value={value.numero}
          placeholder="Numero"
          placeholderTextColor="#64748b"
          keyboardType="number-pad"
          onChangeText={(numero) => onChange({ ...value, numero })}
        />
        <View style={styles.streetCol}>
          <TextInput
            style={[styles.input, inputStyle]}
            value={value.rue}
            placeholder="Rue"
            placeholderTextColor="#64748b"
            onChangeText={(rue) => onChange({ ...value, rue })}
          />
          {suggestions.length > 0 ? (
            <View style={styles.suggestionList}>
              {suggestions.map((suggestion) => (
                <Pressable
                  key={suggestion.id}
                  style={styles.suggestionRow}
                  onPress={() => {
                    onChange({
                      numero: suggestion.houseNumber || value.numero,
                      rue: suggestion.street || value.rue,
                      ville: suggestion.city || value.ville,
                      dep: suggestion.dep || value.dep,
                    });
                    setSuggestions([]);
                  }}
                >
                  <Text style={styles.suggestionLabel}>{suggestion.label}</Text>
                  <Text style={styles.suggestionMeta}>
                    {suggestion.city} {suggestion.dep ? `• ${suggestion.dep}` : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      <View style={[styles.row, styles.bottomRow]}>
        <TextInput
          style={[styles.input, styles.cityInput, inputStyle]}
          value={value.ville}
          placeholder="Ville"
          placeholderTextColor="#64748b"
          onChangeText={(ville) => onChange({ ...value, ville })}
        />
        <TextInput
          style={[styles.input, styles.depInput, inputStyle]}
          value={value.dep}
          placeholder="Dep"
          placeholderTextColor="#64748b"
          onChangeText={(dep) => onChange({ ...value, dep })}
        />
      </View>
    </View>
  );
}

export function composeAddressParts(parts: AddressParts): string {
  const left = [parts.numero.trim(), parts.rue.trim()].filter(Boolean).join(' ');
  const right = [parts.ville.trim(), parts.dep.trim() ? `(${parts.dep.trim()})` : ''].filter(Boolean).join(' ');
  return [left, right].filter(Boolean).join(', ').trim();
}

export function parseAddressParts(raw: string): AddressParts {
  const text = String(raw ?? '').trim();
  if (!text) return { numero: '', rue: '', ville: '', dep: '' };
  const split = text.split(',');
  const first = (split[0] ?? '').trim();
  const second = (split[1] ?? '').trim();
  const numberMatch = first.match(/^(\d+[A-Za-z]?)\s+(.*)$/);
  const numero = numberMatch?.[1] ?? '';
  const rue = numberMatch?.[2] ?? first;
  const depMatch = second.match(/\(([^)]+)\)/);
  const dep = depMatch?.[1]?.trim() ?? '';
  const ville = second.replace(/\([^)]+\)/g, '').trim();
  return { numero, rue, ville, dep };
}

function extractDep(context: string, postcode: string): string {
  const normalized = String(context ?? '').trim();
  if (normalized.length > 0) {
    const firstChunk = normalized.split(',')[0]?.trim() ?? '';
    if (firstChunk) return firstChunk;
  }
  const cp = String(postcode ?? '').trim();
  if (cp.length >= 2) return cp.slice(0, 2);
  return '';
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  bottomRow: {
    marginTop: 8,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0f1720',
    color: '#e5edf7',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontWeight: '600',
  },
  numInput: {
    width: 92,
  },
  streetCol: {
    flex: 1,
  },
  cityInput: {
    flex: 1,
  },
  depInput: {
    width: 98,
  },
  suggestionList: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0b1322',
    overflow: 'hidden',
  },
  suggestionRow: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#243246',
  },
  suggestionLabel: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
  },
  suggestionMeta: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
});
