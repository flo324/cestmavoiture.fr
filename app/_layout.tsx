import { Stack } from 'expo-router';
import React from 'react';
import { LogBox } from 'react-native';

import { AuthProvider } from '../context/AuthContext';
import { ScanProvider } from '../context/ScanContext';

if (__DEV__) {
  LogBox.ignoreLogs([
    'SafeAreaView has been deprecated',
    'Unable to activate keep awake',
  ]);
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ScanProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#0b0f14' },
          }}
        />
      </ScanProvider>
    </AuthProvider>
  );
}
