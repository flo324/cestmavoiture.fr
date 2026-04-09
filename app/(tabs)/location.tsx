import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
// On importe le contexte
import { useKilometrage } from '../../context/KilometrageContext';
import { normalizeDocumentCapture } from '../../services/documentScan';

const GEMINI_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

export default function LocationScreen() {
  // RÉCUPÉRATION SÉCURISÉE
  const kilometrageContext = useKilometrage();
 
  // Sécurité : si le contexte est null, on crée une fonction vide pour éviter le crash
  const saveDossier = kilometrageContext ? kilometrageContext.saveDossier : () => {
    Alert.alert("Erreur", "Le système de sauvegarde n'est pas prêt.");
  };

  const [info, setInfo] = useState({ voiture: '', agence: '', date: new Date().toLocaleDateString() });
  const [currentPhotos, setCurrentPhotos] = useState<any[]>([]); // Changé en any[] pour éviter les erreurs de type
  const [loading, setLoading] = useState(false);

  const scannerIA = async () => {
    let res = await ImagePicker.launchCameraAsync({ allowsEditing: false, base64: true, quality: 1 });
    if (res.canceled || !res.assets[0].base64) return;
    const normalized = await normalizeDocumentCapture(res.assets[0].uri, {
      includeBase64: true,
      quality: 0.94,
    });

    setLoading(true);
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: "Repère les rayures/bosses. Donne les coordonnées X et Y en % dans ce format JSON : [{\"x\":50, \"y\":30}]" },
            { inline_data: { mime_type: "image/jpeg", data: normalized.base64 || res.assets[0].base64 } }
          ]}]
        })
      });

      const json = await resp.json();
      const points = JSON.parse(json.candidates[0].content.parts[0].text.match(/\[.*\]/s)[0]);
   
      setCurrentPhotos([...currentPhotos, {
        photoUri: normalized.uri || res.assets[0].uri,
        resultatIA: "Scan effectué",
        points
      }]);
    } catch (e) {
      Alert.alert("Erreur", "L'IA n'a pas pu répondre");
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{paddingBottom: 100}} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={styles.card}>
          <Text style={styles.title}>NOUVEAU DOSSIER</Text>
          <TextInput
            placeholder="Modèle de la voiture"
            placeholderTextColor="#64748b"
            style={styles.input}
            onChangeText={(t) => setInfo({ ...info, voiture: t })}
          />
          <TextInput
            placeholder="Agence de location"
            placeholderTextColor="#64748b"
            style={styles.input}
            onChangeText={(t) => setInfo({ ...info, agence: t })}
          />
      
          <TouchableOpacity style={styles.btnScan} onPress={scannerIA}>
            <MaterialCommunityIcons name="camera-plus" size={24} color="#fff" />
            <Text style={styles.btnScanTxt}>SCANNER LA CARROSSERIE</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.grid}>
          {currentPhotos.map((p, i) => (
            <View key={i} style={styles.photoBox}>
              <View>
                <Image source={{ uri: p.photoUri }} style={styles.img} />
                {p.points.map((pt: any, idx: number) => (
                  <View key={idx} style={[styles.dot, { left: `${pt.x}%`, top: `${pt.y}%` }]} />
                ))}
              </View>
              <Text style={styles.zoomInfo}>Analyse IA terminée</Text>
            </View>
          ))}
        </View>

        {currentPhotos.length > 0 && (
          <TouchableOpacity
            style={styles.btnSave}
            onPress={() => {
              saveDossier({
                id: Date.now().toString(),
                nomVoiture: info.voiture,
                agence: info.agence,
                date: info.date,
                photos: currentPhotos
              });
              Alert.alert("Succès", "Dossier sauvegardé");
            }}
          >
            <Text style={styles.btnSaveTxt}>ENREGISTRER LE DOSSIER</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {loading && (
        <Modal transparent>
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={{color:'#fff', marginTop: 10, textAlign: 'center'}}>IA ANALYSE EN COURS...</Text>
          </View>
        </Modal>
      )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0f14' },
  card: {
    backgroundColor: '#111827',
    padding: 20,
    borderRadius: 15,
    elevation: 3,
    margin: 20,
    marginTop: 40,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  title: { fontSize: 18, fontWeight: '900', marginBottom: 15, color: '#e2e8f0' },
  input: {
    borderBottomWidth: 1,
    borderColor: '#334155',
    marginBottom: 15,
    padding: 10,
    color: '#e2e8f0',
    fontSize: 15,
  },
  btnScan: {
    backgroundColor: '#0891b2',
    flexDirection: 'row',
    padding: 15,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnScanTxt: { color: '#fff', fontWeight: 'bold', marginLeft: 10 },
  grid: { padding: 10 },
  photoBox: { width: '100%', height: 400, backgroundColor: '#000', borderRadius: 15, marginBottom: 20, overflow: 'hidden' },
  img: { width: '100%', height: 400, resizeMode: 'contain' },
  dot: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: 'red', borderWidth: 2, borderColor: '#fff' },
  zoomInfo: { textAlign: 'center', color: '#94a3b8', marginBottom: 10, fontSize: 12, marginTop: 5 },
  btnSave: { backgroundColor: '#059669', padding: 20, borderRadius: 15, alignItems: 'center', margin: 20 },
  btnSaveTxt: { color: '#fff', fontWeight: 'bold' },
  loader: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }
});