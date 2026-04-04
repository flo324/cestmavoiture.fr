import { FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width } = Dimensions.get('window');
const STORAGE_KEY_CT = '@ma_voiture_ct_data';
const GOOGLE_CLOUD_VISION_API_KEY = "AIzaSyCMZLsiladtEj3-OxhuujHMN-OnEtSY2kQ";

export default function CtScreen() {
  const router = useRouter();
  const [ctImage, setCtImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  const [ctInfo, setCtInfo] = useState({
    dateCt: 'NON DÉTECTÉE',
    resultat: 'À VÉRIFIER',
    defauts: 'Scanner le document pour extraire les notes de l\'IA...',
    prochainCt: 'NON DÉTECTÉ'
  });

  useEffect(() => { loadSavedData(); }, []);

  const loadSavedData = async () => {
    const data = await AsyncStorage.getItem(STORAGE_KEY_CT);
    if (data) {
      const parsed = JSON.parse(data);
      setCtImage(parsed.image);
      setCtInfo(parsed.info);
      if (parsed.info.prochainCt !== 'NON DÉTECTÉ') calculateDays(parsed.info.prochainCt);
    }
  };

  const calculateDays = (dateStr: string) => {
    const [d, m, y] = dateStr.split('/').map(Number);
    const target = new Date(y, m - 1, d);
    const diff = target.getTime() - new Date().getTime();
    setDaysLeft(Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert("Erreur", "Accès caméra requis");
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7 });
    if (!result.canceled) {
      setCtImage(result.assets[0].uri);
      analyserCT(result.assets[0].uri);
    }
  };

  const analyserCT = async (uri: string) => {
    setIsAnalyzing(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const response = await fetch('https://vision.googleapis.com/v1/images:annotate?key=' + GOOGLE_CLOUD_VISION_API_KEY.trim(), {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ image: { content: base64 }, features: [{ type: 'TEXT_DETECTION' }] }] })
      });

      const data = await response.json();
      const text = (data.responses[0]?.fullTextAnnotation?.text || "").toUpperCase();
     
      // Extraction simplifiée de la date (cherche la date la plus lointaine ou après "VALIDE JUSQU'AU")
      const dates = text.match(/[0-9]{2}\/[0-9]{2}\/[0-9]{4}/g) || [];
      const nextDate = dates.length > 0 ? dates[dates.length - 1] : "NON TROUVÉE";

      const extracted = {
        dateCt: dates[0] || "DÉTECTÉE",
        resultat: text.includes("FAVORABLE") ? "FAVORABLE (S)" : (text.includes("DÉFAVORABLE") ? "DÉFAVORABLE" : "À VÉRIFIER"),
        defauts: text.length > 50 ? "L'IA a analysé le document. Veuillez vérifier les défaillances mineures/majeures listées sur votre PV." : "Texte trop court pour analyse.",
        prochainCt: nextDate
      };

      setCtInfo(extracted);
      if (nextDate !== "NON TROUVÉE") calculateDays(nextDate);
      await AsyncStorage.setItem(STORAGE_KEY_CT, JSON.stringify({ image: uri, info: extracted }));
    } catch (e) { Alert.alert("Erreur IA", "Impossible de lire le PV"); }
    finally { setIsAnalyzing(false); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><MaterialCommunityIcons name="arrow-left" size={26} color="#000" /></TouchableOpacity>
        <Text style={styles.titlePage}>MES CONTRÔLES TECHNIQUES</Text>
        <View style={{width: 26}} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* CARTE DE DÉCOMPTE */}
        {daysLeft !== null && (
          <View style={[styles.timerCard, { backgroundColor: daysLeft < 30 ? '#e74c3c' : '#2ecc71' }]}>
            <MaterialCommunityIcons name="clock-outline" size={30} color="#fff" />
            <View style={{ marginLeft: 15 }}>
              <Text style={styles.timerTitle}>PROCHAIN CONTRÔLE DANS :</Text>
              <Text style={styles.timerDays}>{daysLeft} JOURS</Text>
            </View>
          </View>
        )}

        {/* CADRE PHOTO / ACTION */}
        <View style={styles.card}>
           {!ctImage ? (
             <TouchableOpacity style={styles.scanZone} onPress={handleTakePhoto}>
               <FontAwesome5 name="file-medical-alt" size={40} color="#9b59b6" />
               <Text style={styles.scanText}>SCANNER LE PV DE CONTRÔLE</Text>
             </TouchableOpacity>
           ) : (
             <TouchableOpacity style={styles.btnView} onPress={() => setModalVisible(true)}>
               <MaterialCommunityIcons name="file-eye" size={30} color="#9b59b6" />
               <Text style={styles.btnViewText}>VOIR LE DOCUMENT COMPLET</Text>
             </TouchableOpacity>
           )}
        </View>

        {/* INFOS EXTRAITES */}
        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>RÉSUMÉ DE L'IA</Text>
          <View style={styles.row}><Text style={styles.label}>DATE DU TEST :</Text><Text style={styles.val}>{ctInfo.dateCt}</Text></View>
          <View style={styles.row}><Text style={styles.label}>RÉSULTAT :</Text><Text style={[styles.val, {color: ctInfo.resultat.includes('FAVORABLE') ? '#27ae60' : '#e74c3c'}]}>{ctInfo.resultat}</Text></View>
          <View style={styles.row}><Text style={styles.label}>LIMITE VALIDITÉ :</Text><Text style={styles.val}>{ctInfo.prochainCt}</Text></View>
         
          <View style={styles.separator} />
          <Text style={styles.label}>NOTES DE L'ANALYSE :</Text>
          <Text style={styles.defautsText}>{ctInfo.defauts}</Text>
        </View>

        {ctImage && (
          <TouchableOpacity style={styles.retryBtn} onPress={handleTakePhoto}>
            <Text style={styles.retryTxt}>RE-SCANNER UN NOUVEAU PV</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* MODAL IMAGE */}
      <Modal visible={modalVisible} transparent={true}><View style={styles.modalBg}>
        <TouchableOpacity style={styles.close} onPress={() => setModalVisible(false)}><MaterialCommunityIcons name="close-circle" size={45} color="white" /></TouchableOpacity>
        <Image source={{ uri: ctImage || '' }} style={styles.fullImg} resizeMode="contain" />
      </View></Modal>
     
      {isAnalyzing && <View style={styles.loader}><ActivityIndicator size="large" color="#fff" /><Text style={{color:'#fff', fontWeight:'bold', marginTop:10}}>LECTURE DU PV...</Text></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7ff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, backgroundColor: '#fff' },
  titlePage: { fontSize: 16, fontWeight: 'bold' },
  timerCard: { margin: 20, borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', elevation: 5 },
  timerTitle: { color: '#fff', fontSize: 10, fontWeight: 'bold', opacity: 0.9 },
  timerDays: { color: '#fff', fontSize: 24, fontWeight: '900' },
  card: { backgroundColor: '#fff', marginHorizontal: 20, borderRadius: 25, padding: 20, elevation: 4, alignItems: 'center' },
  scanZone: { width: '100%', height: 120, borderStyle: 'dashed', borderWidth: 2, borderColor: '#9b59b6', borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  scanText: { color: '#9b59b6', fontWeight: 'bold', fontSize: 12, marginTop: 10 },
  btnView: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f4f7ff', padding: 15, borderRadius: 15, width: '100%', justifyContent: 'center' },
  btnViewText: { marginLeft: 10, color: '#9b59b6', fontWeight: 'bold' },
  infoCard: { backgroundColor: '#fff', margin: 20, borderRadius: 25, padding: 20, elevation: 3 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', color: '#9b59b6', marginBottom: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  label: { fontSize: 11, color: '#7f8c8d', fontWeight: 'bold' },
  val: { fontSize: 11, fontWeight: 'bold', color: '#2c3e50' },
  separator: { height: 1, backgroundColor: '#f1f1f1', marginVertical: 15 },
  defautsText: { fontSize: 12, color: '#34495e', lineHeight: 18, marginTop: 5, fontStyle: 'italic' },
  retryBtn: { margin: 20, padding: 18, borderRadius: 20, backgroundColor: '#2c3e50', alignItems: 'center' },
  retryTxt: { color: '#fff', fontWeight: 'bold' },
  modalBg: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  fullImg: { width: '100%', height: '80%' },
  close: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  loader: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 100 }
});