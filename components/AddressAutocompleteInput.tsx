import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View, ViewStyle } from 'react-native';

type AddressSuggestion = {
  label: string;
  city: string;
  postcode: string;
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
  const safeValue = value === '0' ? '' : value;
  const query = safeValue.trim();

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
        const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=6`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('address api failed');
        const json = (await response.json()) as {
          features?: Array<{ properties?: { label?: string; city?: string; postcode?: string } }>;
        };
        if (cancelled) return;
        const next = (json.features ?? [])
          .map((x) => ({
            label: String(x.properties?.label ?? '').trim(),
            city: String(x.properties?.city ?? '').trim(),
            postcode: String(x.properties?.postcode ?? '').trim(),
          }))
          .filter((x) => x.label.length > 0);
        setItems(next);
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
  }, [query]);

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

