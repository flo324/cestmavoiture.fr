import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Image,
    Modal,
    SafeAreaView,
    StyleSheet, Text, TouchableOpacity, View
} from 'react-native';

const { width, height } = Dimensions.get('window');
const STORAGE_KEY = '@mes_pneus_v1';

// Ta clé API Google Cloud
const MY_API_KEY = "AIzaSyCMZLsiIadtEj3-OxhuujHMN-OnEtSY2kQ";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${MY_API_KEY}`;

interface PneuRecord {
  id: string;
  marque: string;
  dimensions: string;
  date: string;
  prixTTC: string;
  imageUri: string;
}

export default function PneusScreen() {
  const router = useRouter();
  const [pneus, setPneus] = useState<PneuRecord[]>([]);
  const [step, setStep] = useState<'idle' | 'hasPhoto' | 'analyzing'>('idle');
  const [capturedImage, setCapturedImage] = useState<{uri: string, base64: string} | null>(null);

  useEffect(() => {
    const loadData = async () => {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) setPneus(JSON.parse(saved));
    };
    loadData();
  }, []);

  const saveToStorage = async (data: PneuRecord[]) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  };

  const handleStartScan = async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) return Alert.alert("Erreur", "Accès caméra requis");
    let result = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true });
    if (!result.canceled) {
      setCapturedImage({ uri: result.assets[0].uri, base64: result.assets[0].base64 || "" });
      setStep('hasPhoto');
    }
  };

  const analyserPneuIA = async () => {
    if (!capturedImage) return;
    setStep('analyzing');
    const prompt = `Analyse cette facture de pneus. Réponds en JSON pur : {"marque": "Michelin/etc", "dimensions": "ex 205/55 R16", "date": "JJ/MM/AAAA", "prixTTC": "0.00"}`;

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: capturedImage.base64 } }] }] })
      });
      const data = await response.json();
      const textResponse = data.candidates[0].content.parts[0].text;
      const cleanJson = JSON.parse(textResponse.replace(/```json|```/g, "").trim());
     
      const nouvelle = { id: Date.now().toString(), ...cleanJson, imageUri: capturedImage.uri };
      const updated = [nouvelle, ...pneus];
      setPneus(updated);
      saveToStorage(updated);
      setStep('idle');
    } catch (e) {
      Alert.alert("Erreur", "L'IA n'a pas pu analyser le pneu.");
      setStep('idle');
    }
  };

  const deletePneu = (id: string) => {
    Alert.alert("Supprimer", "Supprimer cet enregistrement ?", [
      { text: "Non" },
      { text: "Oui", onPress: () => {
        const updated = pneus.filter(p => p.id !== id);
        setPneus(updated);
        saveToStorage(updated);
      }}
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><MaterialCommunityIcons name="arrow-left" size={28} color="#2c3e50" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Mes Pneus</Text>
        <View style={{width: 28}} />
      </View>

      <FlatList
        data={pneus}
        renderItem={({item}) => (
          <TouchableOpacity style={styles.card} onLongPress={() => deletePneu(item.id)}>
            <MaterialCommunityIcons name="tire" size={40} color="#3498db" />
            <View style={{marginLeft: 15, flex: 1}}>
              <Text style={{color: '#fff', fontWeight: 'bold'}}>{item.marque} ({item.dimensions})</Text>
              <Text style={{color: '#3498db', fontSize: 11}}>{item.date}</Text>
            </View>
            <Text style={{color: '#2ecc71', fontWeight: 'bold'}}>{item.prixTTC} €</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ padding: 20 }}
      />

      <TouchableOpacity style={styles.scanBtn} onPress={handleStartScan}>
        <MaterialCommunityIcons name="camera" size={24} color="#fff" />
        <Text style={{color: '#fff', fontWeight: 'bold', marginLeft: 10}}>SCANNER PNEU</Text>
      </TouchableOpacity>

      <Modal visible={step !== 'idle'}>
        <View style={styles.blackBg}>
          {step === 'hasPhoto' && (
            <View style={styles.full}>
              <Image source={{ uri: capturedImage?.uri }} style={styles.fullImage} resizeMode="cover" />
              <View style={styles.cropFrame} />
              <TouchableOpacity style={styles.validerBtn} onPress={analyserPneuIA}>
                <Text style={{color: '#fff', fontWeight: 'bold'}}>VALIDER</Text>
              </TouchableOpacity>
            </View>
          )}
          {step === 'analyzing' && <ActivityIndicator size="large" color="#3498db" />}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f5f8' },
  header: { backgroundColor: '#fff', padding: 20, paddingTop: 40, flexDirection: 'row', justifyContent: 'space-between' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  card: { backgroundColor: '#2c3e50', padding: 20, borderRadius: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center' },
  scanBtn: { backgroundColor: '#e67e22', flexDirection: 'row', padding: 18, borderRadius: 30, position: 'absolute', bottom: 30, alignSelf: 'center' },
  blackBg: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  full: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  fullImage: { position: 'absolute', width: '100%', height: '100%' },
  cropFrame: { width: width * 0.85, height: height * 0.4, borderWidth: 2, borderColor: '#fff', borderStyle: 'dashed', borderRadius: 10 },
  validerBtn: { backgroundColor: '#2ecc71', padding: 20, borderRadius: 30, position: 'absolute', bottom: 50 }
});