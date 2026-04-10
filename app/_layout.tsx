import { Stack } from 'expo-router';
import React from 'react';
import { LogBox } from 'react-native';

import { AuthProvider } from '../context/AuthContext';
import { ScanProvider } from '../context/ScanContext';
import { ThemeProvider } from '../context/ThemeContext';

if (__DEV__) {
  LogBox.ignoreLogs([
    'SafeAreaView has been deprecated',
    'Unable to activate keep awake',
  ]);
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ScanProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#0b0f14' },
              animation: 'fade',
              animationDuration: 220,
            }}
          />
        </ScanProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
