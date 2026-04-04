import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Image, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const STORAGE_KEY_PERMIS = '@ma_voiture_permis_data';
const GOOGLE_CLOUD_VISION_API_KEY = "AIzaSyCMZLsiladtEj3-OxhuujHMN-OnEtSY2kQ";

const EditableInfoRow = ({ label, value, onChangeText }: { label: string; value: string; onChangeText: (text: string) => void }) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label} :</Text>
    <TextInput
      style={styles.val}
      value={value || ""}
      onChangeText={onChangeText}
      placeholder="NON DÉTECTÉ"
      placeholderTextColor="#bdc3c7"
    />
  </View>
);

export default function PermisScreen() {
  const router = useRouter();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [permisInfo, setPermisInfo] = useState({
    nom: '', prenom: '', adresse: '', numero: '',
    dateObtention: '', dateDelivrance: '', delivrePar: ''
  });

  useEffect(() => { loadSavedData(); }, []);

  const loadSavedData = async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY_PERMIS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.info) setPermisInfo(parsed.info);
        if (parsed.image) setImageUri(parsed.image);
      }
    } catch (e) { console.error(e); }
  };

  const saveData = async (updatedInfo: any, uri: string | null = imageUri) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_PERMIS, JSON.stringify({ info: updatedInfo, image: uri }));
    } catch (e) { console.error(e); }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert("Erreur", "Accès caméra requis");
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7 });
    if (!result.canceled) {
      const newUri = result.assets[0].uri;
      setImageUri(newUri);
      analyserPermis(newUri);
    }
  };

  const analyserPermis = async (uri: string) => {
    setIsAnalyzing(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_CLOUD_VISION_API_KEY}`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ image: { content: base64 }, features: [{ type: 'TEXT_DETECTION' }] }] })
      });
      const data = await response.json();
      const text = (data.responses[0]?.fullTextAnnotation?.text || "").toUpperCase();
      const extracted = {
        nom: text.split('\n')[1] || '',
        prenom: text.split('\n')[2] || '',
        adresse: text.includes("DOMICILE") ? "VOIR DOCUMENT" : '',
        numero: text.match(/\d{12}/)?.[0] || '',
        dateObtention: text.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || '',
        dateDelivrance: '',
        delivrePar: text.includes("PREFET") ? "PRÉFECTURE" : ''
      };
      setPermisInfo(extracted);
      saveData(extracted, uri);
    } catch (e) { Alert.alert("Erreur", "Analyse impossible"); }
    finally { setIsAnalyzing(false); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><MaterialCommunityIcons name="arrow-left" size={26} color="#000" /></TouchableOpacity>
        <Text style={styles.titlePage}>MON PERMIS DE CONDUIRE</Text>
        <View style={{width: 26}} />
      </View>

      <View style={styles.body}>
        {/* CARRE DU HAUT - Identique CG */}
        <View style={styles.card}>
          <View style={styles.docHeader}>
            <MaterialCommunityIcons name="card-account-details" size={20} color="#f39c12" />
            <Text style={styles.docTitle}>DOCUMENT OFFICIEL</Text>
          </View>
          <View style={styles.separatorLine} />

          {imageUri ? (
            <TouchableOpacity style={styles.btnViewDoc} onPress={() => setModalVisible(true)}>
              <MaterialCommunityIcons name="eye" size={24} color="#01579b" />
              <Text style={styles.btnViewDocTxt}>VOIR LE DOCUMENT</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.scanZone} onPress={handleTakePhoto}>
              <MaterialCommunityIcons name="camera-plus" size={40} color="#3498db" />
              <Text style={styles.scanText}>SCANNER LE DOCUMENT</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* CARRE INFOS - Identique CG */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>DÉTAILS DU PERMIS</Text>
          <View style={styles.separatorLine} />
          <EditableInfoRow label="NOM" value={permisInfo.nom} onChangeText={(t) => { const n = {...permisInfo, nom: t}; setPermisInfo(n); saveData(n); }} />
          <EditableInfoRow label="PRÉNOM" value={permisInfo.prenom} onChangeText={(t) => { const n = {...permisInfo, prenom: t}; setPermisInfo(n); saveData(n); }} />
          <EditableInfoRow label="ADRESSE" value={permisInfo.adresse} onChangeText={(t) => { const n = {...permisInfo, adresse: t}; setPermisInfo(n); saveData(n); }} />
          <EditableInfoRow label="NUMÉRO" value={permisInfo.numero} onChangeText={(t) => { const n = {...permisInfo, numero: t}; setPermisInfo(n); saveData(n); }} />
          <EditableInfoRow label="OBTENTION" value={permisInfo.dateObtention} onChangeText={(t) => { const n = {...permisInfo, dateObtention: t}; setPermisInfo(n); saveData(n); }} />
          <EditableInfoRow label="DÉLIVRANCE" value={permisInfo.dateDelivrance} onChangeText={(t) => { const n = {...permisInfo, dateDelivrance: t}; setPermisInfo(n); saveData(n); }} />
          <EditableInfoRow label="DÉLIVRÉ PAR" value={permisInfo.delivrePar} onChangeText={(t) => { const n = {...permisInfo, delivrePar: t}; setPermisInfo(n); saveData(n); }} />
        </View>
      </View>

      <TouchableOpacity style={styles.btnRetry} onPress={handleTakePhoto}>
        <MaterialCommunityIcons name="refresh" size={22} color="#fff" />
        <Text style={styles.btnText}>RECOMMENCER LE SCAN</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent={true}><View style={styles.modalBg}>
        <TouchableOpacity style={styles.close} onPress={() => setModalVisible(false)}><MaterialCommunityIcons name="close-circle" size={45} color="white" /></TouchableOpacity>
        <Image source={{ uri: imageUri || '' }} style={styles.fullImg} resizeMode="contain" />
      </View></Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7ff', justifyContent: 'space-between' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 15, backgroundColor: '#fff' },
  titlePage: { fontSize: 16, fontWeight: '900', color: '#2c3e50' },
  body: { flex: 1, justifyContent: 'center' },
 
  // REGLAGES COPIES DE CG.TSX
  card: { backgroundColor: 'white', margin: 20, borderRadius: 20, padding: 15, elevation: 5, flex: 1, justifyContent: 'center' },
  docHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  docTitle: { fontSize: 12, fontWeight: 'bold', color: '#7f8c8d', marginLeft: 10 },
  separatorLine: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
 
  scanZone: { height: 150, justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', borderWidth: 2, borderColor: '#3498db', borderRadius: 15 },
  scanText: { color: '#3498db', fontWeight: 'bold', marginTop: 10 },
 
  btnViewDoc: { backgroundColor: '#e1f5fe', paddingVertical: 20, paddingHorizontal: 30, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnViewDocTxt: { color: '#01579b', fontWeight: 'bold', fontSize: 16, marginLeft: 15 },

  infoCard: { backgroundColor: 'white', marginHorizontal: 20, padding: 20, borderRadius: 20, elevation: 3, marginBottom: 10 },
  infoTitle: { fontSize: 11, fontWeight: 'bold', color: '#f39c12', marginBottom: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  label: { fontSize: 11, color: '#7f8c8d', fontWeight: 'bold' },
  val: { fontSize: 11, color: '#2c3e50', fontWeight: 'bold', textAlign: 'right', flex: 1, marginLeft: 10 },

  btnRetry: { backgroundColor: '#3498db', margin: 20, padding: 15, borderRadius: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginBottom: 50 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 14, marginLeft: 10 },

  modalBg: { flex: 1, backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' },
  fullImg: { width: '100%', height: '80%' },
  close: { position: 'absolute', top: 50, right: 20, zIndex: 10 }
});