import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Slot, useRouter } from 'expo-router';
import React from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function RootLayout() {
  const router = useRouter();
  const PENDING_SCAN_KEY = '@pending_scan_capture_v1';

  const handleGlobalScan = async () => {
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
      await AsyncStorage.setItem(
        PENDING_SCAN_KEY,
        JSON.stringify({
          uri: imageUri,
          base64,
          createdAt: Date.now(),
        })
      );
      router.replace('/(tabs)');
      Alert.alert('Scan prêt', 'Photo capturée. Choisissez maintenant une case sur l’accueil.');
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
