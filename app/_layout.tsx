import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Slot, useRouter } from 'expo-router';
import React from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
    if (!granted) {
      Alert.alert('Erreur', 'Accès caméra requis');
      return;
    }

    const photo = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
      base64: true,
    });
    if (photo.canceled || !photo.assets?.[0]) return;

    const asset = photo.assets[0];
    const imageUri = asset.uri ?? '';
    const base64 = asset.base64 ?? '';
    if (!base64) {
      Alert.alert('Erreur', 'Photo illisible, réessaie.');
      return;
    }

    try {
      console.log('[RootLayout] scan captured', { uri: imageUri, base64Length: base64.length });
      setCapturedImageForSelection({
        uri: imageUri,
        base64,
        createdAt: Date.now(),
      });
      router.replace('/(tabs)');
      Alert.alert('Scan prêt', "Photo capturée. Choisissez une case sur l'accueil.");
    } catch {
      Alert.alert('Erreur', 'Impossible de préparer le scan.');
    }
  };

  return (
    <View style={styles.root}>
      <Slot />
      <TouchableOpacity style={styles.scanButton} onPress={handleGlobalScan} activeOpacity={0.85}>
        <View style={styles.scanInner}>
          <Ionicons name="camera" size={30} color="#fff" />
          <Text style={styles.scanText}>SCAN</Text>
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
    bottom: Platform.OS === 'web' ? 20 : 24,
    zIndex: 2000,
  },
  scanInner: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#ef5350',
    borderWidth: 4,
    borderColor: '#f1f4f9',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  scanText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 2,
  },
});
