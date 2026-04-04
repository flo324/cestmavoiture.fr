import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
// On importe le contexte
import { useKilometrage } from '../../context/KilometrageContext';

const GEMINI_KEY = "AIzaSyCMZLsiladtEj3-OxhuujHMN-OnEtSY2kQ";

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
    let res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
    if (res.canceled || !res.assets[0].base64) return;

    setLoading(true);
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: "Repère les rayures/bosses. Donne les coordonnées X et Y en % dans ce format JSON : [{\"x\":50, \"y\":30}]" },
            { inline_data: { mime_type: "image/jpeg", data: res.assets[0].base64 } }
          ]}]
        })
      });

      const json = await resp.json();
      const points = JSON.parse(json.candidates[0].content.parts[0].text.match(/\[.*\]/s)[0]);
   
      setCurrentPhotos([...currentPhotos, {
        photoUri: res.assets[0].uri,
        resultatIA: "Scan effectué",
        points
      }]);
    } catch (e) {
      Alert.alert("Erreur", "L'IA n'a pas pu répondre");
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{paddingBottom: 100}}>
        <View style={styles.card}>
          <Text style={styles.title}>NOUVEAU DOSSIER</Text>
          <TextInput placeholder="Modèle de la voiture" style={styles.input} onChangeText={t => setInfo({...info, voiture: t})} />
          <TextInput placeholder="Agence de location" style={styles.input} onChangeText={t => setInfo({...info, agence: t})} />
      
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f5f8' },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 15, elevation: 3, margin: 20, marginTop: 40 },
  title: { fontSize: 18, fontWeight: '900', marginBottom: 15, color: '#2c3e50' },
  input: { borderBottomWidth: 1, borderColor: '#eee', marginBottom: 15, padding: 10 },
  btnScan: { backgroundColor: '#3498db', flexDirection: 'row', padding: 15, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  btnScanTxt: { color: '#fff', fontWeight: 'bold', marginLeft: 10 },
  grid: { padding: 10 },
  photoBox: { width: '100%', height: 400, backgroundColor: '#000', borderRadius: 15, marginBottom: 20, overflow: 'hidden' },
  img: { width: '100%', height: 400, resizeMode: 'contain' },
  dot: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: 'red', borderWidth: 2, borderColor: '#fff' },
  zoomInfo: { textAlign: 'center', color: '#7f8c8d', marginBottom: 10, fontSize: 12, marginTop: 5 },
  btnSave: { backgroundColor: '#2ecc71', padding: 20, borderRadius: 15, alignItems: 'center', margin: 20 },
  btnSaveTxt: { color: '#fff', fontWeight: 'bold' },
  loader: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }
});