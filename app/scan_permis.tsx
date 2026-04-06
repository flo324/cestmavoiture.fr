import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function ScanPermis() {
  const STORAGE_KEY_PERMIS = '@ma_voiture_permis_data';
  const GEMINI_KEY = 'AIzaSyCMZLsiladtEj3-OxhuujHMN-OnEtSY2kQ';
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
  const params = useLocalSearchParams<{
    imageUri?: string;
    imageCaptured?: string;
    imageCapturedBase64?: string;
    fromGlobalScan?: string;
    nom?: string;
    prenom?: string;
    adresse?: string;
    dateObtention?: string;
    numeroPermis?: string;
  }>();

  const [imageUri, setImageUri] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [adresse, setAdresse] = useState('');
  const [dateObtention, setDateObtention] = useState('');
  const [numeroPermis, setNumeroPermis] = useState('');

  useEffect(() => {
    const loadStored = async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_PERMIS);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { image?: string; info?: Record<string, string> };
      setImageUri(parsed.image || '');
      setNom(parsed.info?.nom || '0');
      setPrenom(parsed.info?.prenom || '0');
      setAdresse(parsed.info?.adresse || '0');
      setDateObtention(parsed.info?.dateObtention || '0');
      setNumeroPermis(parsed.info?.numero || '0');
    };
    loadStored();
  }, []);

  useEffect(() => {
    const analyzeIncomingScan = async () => {
      const incomingUri = typeof params.imageCaptured === 'string' ? params.imageCaptured : '';
      const incomingBase64 =
        typeof params.imageCapturedBase64 === 'string' ? params.imageCapturedBase64 : '';
      const fromGlobal = typeof params.fromGlobalScan === 'string' ? params.fromGlobalScan : '';
      console.log('[scan_permis] incoming params', {
        hasUri: !!incomingUri,
        base64Length: incomingBase64.length,
        fromGlobal,
      });
      if (!incomingUri || !incomingBase64 || fromGlobal !== '1') return;

      const prompt =
        'Analyse ce permis de conduire français et réponds uniquement en JSON: {"nom":"","prenom":"","adresse":"","dateObtention":"","numeroPermis":""}';
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
        prenom: String(parsed.prenom || '0'),
        adresse: String(parsed.adresse || '0'),
        dateObtention: String(parsed.dateObtention || '0'),
        numero: String(parsed.numeroPermis || parsed.numero || '0'),
      };

      setImageUri(incomingUri);
      setNom(next.nom);
      setPrenom(next.prenom);
      setAdresse(next.adresse);
      setDateObtention(next.dateObtention);
      setNumeroPermis(next.numero);

      await AsyncStorage.setItem(
        STORAGE_KEY_PERMIS,
        JSON.stringify({
          image: incomingUri,
          info: {
            nom: next.nom,
            prenom: next.prenom,
            adresse: next.adresse,
            dateObtention: next.dateObtention,
            numero: next.numero,
          },
        })
      );
      console.log('[scan_permis] saved to storage', { key: STORAGE_KEY_PERMIS, uri: incomingUri });
    };
    analyzeIncomingScan().catch(() => {});
  }, [params, GEMINI_URL]);

  useEffect(() => {
    if (typeof params.imageUri === 'string') setImageUri(params.imageUri);
    if (typeof params.nom === 'string') setNom(params.nom);
    if (typeof params.prenom === 'string') setPrenom(params.prenom);
    if (typeof params.adresse === 'string') setAdresse(params.adresse);
    if (typeof params.dateObtention === 'string') setDateObtention(params.dateObtention);
    if (typeof params.numeroPermis === 'string') setNumeroPermis(params.numeroPermis);
  }, [params]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.title}>Scan du Permis</Text>

      {imageUri ? (
        <TouchableOpacity style={styles.thumbWrap} onPress={() => setModalVisible(true)}>
          <Image source={{ uri: imageUri }} style={styles.thumb} />
          <Text style={styles.thumbText}>Ouvrir en plein écran</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.cameraPlaceholder}>
          <Text>Utilise le bouton SCAN global</Text>
        </View>
      )}

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Infos extraites par l'IA :</Text>
        <Text style={styles.label}>Nom</Text>
        <TextInput style={styles.input} value={nom} onChangeText={setNom} placeholder="0" />
        <Text style={styles.label}>Prénom</Text>
        <TextInput style={styles.input} value={prenom} onChangeText={setPrenom} placeholder="0" />
        <Text style={styles.label}>Adresse</Text>
        <TextInput style={styles.input} value={adresse} onChangeText={setAdresse} placeholder="0" />
        <Text style={styles.label}>Date d'obtention</Text>
        <TextInput style={styles.input} value={dateObtention} onChangeText={setDateObtention} placeholder="0" />
        <Text style={styles.label}>Numéro permis</Text>
        <TextInput style={styles.input} value={numeroPermis} onChangeText={setNumeroPermis} placeholder="0" />
      </View>

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
  container: { flex: 1, padding: 20, paddingTop: 50, backgroundColor: 'white' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  cameraPlaceholder: { width: '100%', height: 250, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center', borderRadius: 15 },
  thumbWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  thumb: { width: '100%', height: 220 },
  thumbText: { textAlign: 'center', padding: 10, color: '#2978b5', fontWeight: '700' },
  infoBox: { marginTop: 30, padding: 15, backgroundColor: '#f9f9f9', borderRadius: 10 },
  infoTitle: { fontWeight: 'bold', marginBottom: 10, color: '#2978b5' },
  label: { marginTop: 8, marginBottom: 6, color: '#2978b5', fontWeight: '700' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dfe4ea',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  closeBtn: { position: 'absolute', top: 50, right: 20, zIndex: 2 },
  fullImage: { width: '100%', height: '85%' },
});