import React, { useMemo, useRef } from 'react';
import { StyleProp, StyleSheet, TextInput, TextStyle, View, ViewStyle } from 'react-native';

export type DateParts = {
  day: string;
  month: string;
  year: string;
};

type Props = {
  value: DateParts;
  onChange: (next: DateParts) => void;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
};

export function SmartDatePartsInput({ value, onChange, containerStyle, inputStyle }: Props) {
  const monthRef = useRef<TextInput | null>(null);
  const yearRef = useRef<TextInput | null>(null);

  const safe = useMemo(
    () => ({
      day: value.day.replace(/\D/g, '').slice(0, 2),
      month: value.month.replace(/\D/g, '').slice(0, 2),
      year: value.year.replace(/\D/g, '').slice(0, 4),
    }),
    [value.day, value.month, value.year]
  );

  return (
    <View style={[styles.row, containerStyle]}>
      <TextInput
        style={[styles.input, inputStyle]}
        placeholder="JJ"
        placeholderTextColor="#64748b"
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={2}
        returnKeyType="next"
        value={safe.day}
        onChangeText={(raw) => {
          const next = raw.replace(/\D/g, '').slice(0, 2);
          onChange({ ...safe, day: next });
          if (next.length === 2) monthRef.current?.focus();
        }}
      />
      <TextInput
        ref={monthRef}
        style={[styles.input, inputStyle]}
        placeholder="MM"
        placeholderTextColor="#64748b"
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={2}
        returnKeyType="next"
        value={safe.month}
        onChangeText={(raw) => {
          const next = raw.replace(/\D/g, '').slice(0, 2);
          onChange({ ...safe, month: next });
          if (next.length === 2) yearRef.current?.focus();
        }}
      />
      <TextInput
        ref={yearRef}
        style={[styles.input, styles.yearInput, inputStyle]}
        placeholder="AAAA"
        placeholderTextColor="#64748b"
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={4}
        returnKeyType="done"
        value={safe.year}
        onChangeText={(raw) => {
          const next = raw.replace(/\D/g, '').slice(0, 4);
          onChange({ ...safe, year: next });
        }}
      />
    </View>
  );
}

export function formatDateParts(parts: DateParts): string {
  if (parts.day.length !== 2 || parts.month.length !== 2 || parts.year.length !== 4) return '';
  return `${parts.day}/${parts.month}/${parts.year}`;
}

export function formatDatePartsProgressive(parts: DateParts): string {
  const day = parts.day.replace(/\D/g, '').slice(0, 2);
  const month = parts.month.replace(/\D/g, '').slice(0, 2);
  const year = parts.year.replace(/\D/g, '').slice(0, 4);
  if (!day) return '';
  if (!month) return day;
  if (!year) return `${day}/${month}`;
  return `${day}/${month}/${year}`;
}

export function parseDateParts(raw: string): DateParts {
  const digits = String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, 8);
  return {
    day: digits.slice(0, 2),
    month: digits.slice(2, 4),
    year: digits.slice(4, 8),
  };
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0f1720',
    color: '#e5edf7',
    paddingHorizontal: 12,
    paddingVertical: 11,
    textAlign: 'center',
    fontWeight: '700',
  },
  yearInput: {
    flex: 1.4,
  },
});
