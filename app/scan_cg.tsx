import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function ScanCG() {
  const STORAGE_KEY_CG = '@ma_voiture_cg_data_complete';
  const GEMINI_KEY = 'AIzaSyCMZLsiladtEj3-OxhuujHMN-OnEtSY2kQ';
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
  const params = useLocalSearchParams<{
    imageUri?: string;
    imageCaptured?: string;
    imageCapturedBase64?: string;
    fromGlobalScan?: string;
    nom?: string;
    adresse?: string;
    immatriculation?: string;
    vin?: string;
    puissanceFiscale?: string;
    modeleVehicule?: string;
  }>();

  const [imageUri, setImageUri] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [nom, setNom] = useState('');
  const [adresse, setAdresse] = useState('');
  const [immatriculation, setImmatriculation] = useState('');
  const [vin, setVin] = useState('');
  const [puissanceFiscale, setPuissanceFiscale] = useState('');
  const [modeleVehicule, setModeleVehicule] = useState('');

  useEffect(() => {
    const loadStored = async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_CG);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { image?: string; info?: Record<string, string> };
      setImageUri(parsed.image || '');
      setNom(parsed.info?.nom || '0');
      setAdresse(parsed.info?.adresse || '0');
      setImmatriculation(parsed.info?.immat || '0');
      setVin(parsed.info?.vin || '0');
      setPuissanceFiscale(parsed.info?.puissance || '0');
      setModeleVehicule(parsed.info?.modeleVehicule || '0');
    };
    loadStored();
  }, []);

  useEffect(() => {
    const analyzeIncomingScan = async () => {
      const incomingUri = typeof params.imageCaptured === 'string' ? params.imageCaptured : '';
      const incomingBase64 =
        typeof params.imageCapturedBase64 === 'string' ? params.imageCapturedBase64 : '';
      const fromGlobal = typeof params.fromGlobalScan === 'string' ? params.fromGlobalScan : '';
      if (!incomingUri || !incomingBase64 || fromGlobal !== '1') return;

      const prompt =
        'Analyse cette carte grise française et réponds uniquement en JSON: {"nom":"","adresse":"","immatriculation":"","vin":"","puissanceFiscale":"","modeleVehicule":""}';
      const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: incomingBase64 } }],
            },
          ],
        }),
      });
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const parsed = JSON.parse(String(text).replace(/```json|```/g, '').trim());

      const next = {
        nom: String(parsed.nom || '0'),
        adresse: String(parsed.adresse || '0'),
        immat: String(parsed.immatriculation || parsed.immat || '0'),
        vin: String(parsed.vin || '0'),
        puissance: String(parsed.puissanceFiscale || parsed.puissance || '0'),
        modeleVehicule: String(parsed.modeleVehicule || parsed.modele || '0'),
      };

      setImageUri(incomingUri);
      setNom(next.nom);
      setAdresse(next.adresse);
      setImmatriculation(next.immat);
      setVin(next.vin);
      setPuissanceFiscale(next.puissance);
      setModeleVehicule(next.modeleVehicule);

      await AsyncStorage.setItem(
        STORAGE_KEY_CG,
        JSON.stringify({
          image: incomingUri,
          info: {
            nom: next.nom,
            adresse: next.adresse,
            immat: next.immat,
            vin: next.vin,
            puissance: next.puissance,
            modeleVehicule: next.modeleVehicule,
          },
        })
      );
    };
    analyzeIncomingScan().catch(() => {});
  }, [params, GEMINI_URL]);

  useEffect(() => {
    if (typeof params.imageUri === 'string') setImageUri(params.imageUri);
    if (typeof params.nom === 'string') setNom(params.nom);
    if (typeof params.adresse === 'string') setAdresse(params.adresse);
    if (typeof params.immatriculation === 'string') setImmatriculation(params.immatriculation);
    if (typeof params.vin === 'string') setVin(params.vin);
    if (typeof params.puissanceFiscale === 'string') setPuissanceFiscale(params.puissanceFiscale);
    if (typeof params.modeleVehicule === 'string') setModeleVehicule(params.modeleVehicule);
  }, [params]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.title}>Scan de la Carte Grise</Text>

      {imageUri ? (
        <TouchableOpacity style={styles.thumbWrap} onPress={() => setModalVisible(true)}>
          <Image source={{ uri: imageUri }} style={styles.thumb} />
          <Text style={styles.thumbText}>Ouvrir en plein écran</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.cameraPlaceholder}>
          <Text style={styles.placeholderText}>Utilise le bouton SCAN global</Text>
        </View>
      )}

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Infos extraites par l'IA :</Text>
        <Text style={styles.label}>Nom / Prénom</Text>
        <TextInput style={styles.input} value={nom} onChangeText={setNom} placeholder="0" />
        <Text style={styles.label}>Adresse</Text>
        <TextInput style={styles.input} value={adresse} onChangeText={setAdresse} placeholder="0" />
        <Text style={styles.label}>Immatriculation</Text>
        <TextInput style={styles.input} value={immatriculation} onChangeText={setImmatriculation} placeholder="0" />
        <Text style={styles.label}>Numéro VIN</Text>
        <TextInput style={styles.input} value={vin} onChangeText={setVin} placeholder="0" />
        <Text style={styles.label}>Puissance fiscale</Text>
        <TextInput style={styles.input} value={puissanceFiscale} onChangeText={setPuissanceFiscale} placeholder="0" />
        <Text style={styles.label}>Modèle du véhicule</Text>
        <TextInput style={styles.input} value={modeleVehicule} onChangeText={setModeleVehicule} placeholder="0" />
      </View>

      <TouchableOpacity style={styles.button} activeOpacity={0.9}>
        <Text style={styles.buttonText}>Le scan se lance via le bouton SCAN</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
            <MaterialCommunityIcons name="close-circle" size={44} color="#fff" />
          </TouchableOpacity>
          <Image source={{ uri: imageUri }} style={styles.fullImage} resizeMode="contain" />
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#F8F9FA'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
    textAlign: 'center'
  },
  cameraPlaceholder: {
    width: '100%',
    height: 250,
    backgroundColor: '#E9ECEF',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#dee2e6',
    borderStyle: 'dashed'
  },
  thumbWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  thumb: { width: '100%', height: 220 },
  thumbText: { textAlign: 'center', padding: 10, color: '#2978B5', fontWeight: '700' },
  placeholderText: {
    color: '#6C757D',
    fontWeight: '500'
  },
  infoBox: {
    marginTop: 25,
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  infoTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 12,
    color: '#2978B5'
  },
  infoItem: {
    fontSize: 15,
    color: '#495057',
    marginBottom: 5
  },
  label: { marginTop: 8, marginBottom: 6, color: '#2978B5', fontWeight: '700' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dfe4ea',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    backgroundColor: '#2978B5',
    padding: 18,
    borderRadius: 12,
    marginTop: 30,
    alignItems: 'center'
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16
  },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  closeBtn: { position: 'absolute', top: 50, right: 20, zIndex: 2 },
  fullImage: { width: '100%', height: '85%' },
});