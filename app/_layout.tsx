import { Stack } from 'expo-router';
import React, { useEffect } from 'react';
import { LogBox, Platform } from 'react-native';

if (Platform.OS === 'web') {
  require('../global.css');
}

import { AuthProvider } from '../context/AuthContext';
import { ScanProvider } from '../context/ScanContext';
import { ThemeProvider } from '../context/ThemeContext';
import { logGoogleGenerativeKeyHintOnce } from '../services/googleGenerativeApiKey';

if (__DEV__) {
  LogBox.ignoreLogs(['Unable to activate keep awake']);
  const g = globalThis as typeof globalThis & {
    __keepAwakeConsolePatched?: boolean;
    __keepAwakeConsoleErrorOriginal?: typeof console.error;
  };
  if (!g.__keepAwakeConsolePatched) {
    g.__keepAwakeConsolePatched = true;
    g.__keepAwakeConsoleErrorOriginal = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      const text = args
        .map((x) => (typeof x === 'string' ? x : (() => {
          try {
            return JSON.stringify(x);
          } catch {
            return String(x);
          }
        })()))
        .join(' ');
      if (text.includes('Unable to activate keep awake')) {
        return;
      }
      g.__keepAwakeConsoleErrorOriginal?.(...args);
    };
  }
}

export default function RootLayout() {
  useEffect(() => {
    logGoogleGenerativeKeyHintOnce();
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <ScanProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#0B121E' },
              animation: 'fade',
              animationDuration: 220,
            }}
          />
        </ScanProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
