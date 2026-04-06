import { Slot } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ScanProvider } from '../context/ScanContext';

export default function RootLayout() {
  return (
    <ScanProvider>
      <View style={styles.root}>
        <Slot />
      </View>
    </ScanProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
