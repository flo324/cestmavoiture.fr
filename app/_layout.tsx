import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Slot, usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();

  const GEMINI_KEY = 'AIzaSyCMZLsiladtEj3-OxhuujHMN-OnEtSY2kQ';
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

  const extractJson = (text: string): Record<string, unknown> | null => {
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        const parsed = JSON.parse(match[0]);
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
  };

  const toStr = (v: unknown): string => {
    if (v == null) return '';
    return String(v).trim();
  };

  const analyzeWithGemini = async (base64: string, prompt: string) => {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: base64 } }],
          },
        ],
      }),
    });
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!response.ok || !text) return null;
    return extractJson(text);
  };

  const handleGlobalScan = async () => {
    const isCg = pathname === '/scan_cg';
    const isPermis = pathname === '/scan_permis';

    if (!isCg && !isPermis) {
      Alert.alert('Scan', 'Ouvre d’abord la page Carte Grise ou Permis.');
      return;
    }

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
      if (isCg) {
        const prompt =
          'Analyse cette carte grise française et réponds uniquement en JSON: {"nom":"","adresse":"","immatriculation":"","vin":"","puissanceFiscale":"","modeleVehicule":""}';
        const parsed = await analyzeWithGemini(base64, prompt);
        if (!parsed) {
          Alert.alert('Erreur', 'Analyse IA impossible.');
          return;
        }
        router.setParams({
          imageUri,
          nom: toStr(parsed.nom),
          adresse: toStr(parsed.adresse),
          immatriculation: toStr(parsed.immatriculation ?? parsed.immat),
          vin: toStr(parsed.vin),
          puissanceFiscale: toStr(parsed.puissanceFiscale ?? parsed.puissance),
          modeleVehicule: toStr(parsed.modeleVehicule ?? parsed.modele),
        });
        return;
      }

      const prompt =
        'Analyse ce permis de conduire français et réponds uniquement en JSON: {"nom":"","prenom":"","adresse":"","dateObtention":"","numeroPermis":""}';
      const parsed = await analyzeWithGemini(base64, prompt);
      if (!parsed) {
        Alert.alert('Erreur', 'Analyse IA impossible.');
        return;
      }
      router.setParams({
        imageUri,
        nom: toStr(parsed.nom),
        prenom: toStr(parsed.prenom),
        adresse: toStr(parsed.adresse),
        dateObtention: toStr(parsed.dateObtention ?? parsed.date_obtention),
        numeroPermis: toStr(parsed.numeroPermis ?? parsed.numero),
      });
    } catch {
      Alert.alert('Erreur', 'Analyse IA impossible.');
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
