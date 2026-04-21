import React, { forwardRef } from 'react';
import { StyleProp, TextInput, TextInputProps, TextStyle } from 'react-native';

export function formatFrDateInput(raw: string): string {
  const digits = String(raw).replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

type Props = {
  value: string;
  onChangeText: (next: string) => void;
  onDateComplete?: (value: string) => void;
  style?: StyleProp<TextStyle>;
  placeholder?: string;
  placeholderTextColor?: string;
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'style'>;

export const SmartDateInput = forwardRef<TextInput, Props>(function SmartDateInput(
  {
    value,
    onChangeText,
    onDateComplete,
    style,
    placeholder = 'JJ/MM/AAAA',
    placeholderTextColor = '#64748b',
    ...props
  },
  ref
) {
  return (
    <TextInput
      ref={ref}
      style={style}
      value={value}
      onChangeText={(raw) => {
        const formatted = formatFrDateInput(raw);
        onChangeText(formatted);
        if (formatted.length === 10 && String(value).length < 10) {
          onDateComplete?.(formatted);
        }
      }}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor}
      keyboardType="number-pad"
      inputMode="numeric"
      maxLength={10}
      returnKeyType="next"
      {...props}
    />
  );
});
