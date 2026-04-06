import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Slot, useRouter } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ScanProvider, useScan } from '../context/ScanContext';

export default function RootLayout() {
  return (
    <ScanProvider>
      <RootLayoutContent />
    </ScanProvider>
  );
}

function RootLayoutContent() {
  const router = useRouter();
  const { setCapturedImageForSelection } = useScan();

  const handleGlobalScan = async () => {
    console.log('[RootLayout] SCAN pressed');
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) return;

    const photo = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
    });
    if (photo.canceled || !photo.assets?.[0]) return;

    const asset = photo.assets[0];
    const imageUri = asset.uri ?? '';

    try {
      console.log('[RootLayout] scan captured', { uri: imageUri });
      setCapturedImageForSelection({
        uri: imageUri,
        createdAt: Date.now(),
      });
      router.replace('/(tabs)');
    } catch {}
  };

  return (
    <View style={styles.root}>
      <Slot />
      <TouchableOpacity style={styles.scanButton} onPress={handleGlobalScan} activeOpacity={0.85}>
        <View style={styles.scanGlow} />
        <View style={styles.scanInner}>
          <Ionicons name="camera" size={30} color="#ffffff" />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scanButton: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: Platform.OS === 'web' ? 22 : 24,
    zIndex: 2000,
    width: 88,
    height: 88,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanGlow: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#00F2FF',
    opacity: 0.23,
  },
  scanInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#00F2FF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 20,
    shadowColor: '#00F2FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 20,
  },
});
