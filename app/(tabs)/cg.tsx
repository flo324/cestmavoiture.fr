import { FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width } = Dimensions.get('window');
const STORAGE_KEY = '@ma_voiture_cg_data_complete';

// --- UTILISE TA CLÉ ICI ---
const GOOGLE_CLOUD_VISION_API_KEY = "AIzaSyCMZLsiladtEj3-OxhuujHMN-OnEtSY2kQ";

export default function CgScreen() {
  const router = useRouter();
  const [cgImage, setCgImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const [vehiculeInfo, setVehiculeInfo] = useState({
    immat: 'À VÉRIFIER', vin: 'À VÉRIFIER', miseEnCirc: 'À VÉRIFIER',
    puissance: 'À VÉRIFIER', energie: 'À VÉRIFIER'
  });

  useEffect(() => { loadSavedData(); }, []);

  const loadSavedData = async () => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        setCgImage(parsed.image);
        setVehiculeInfo(parsed.info);
      }
    } catch (e) { console.log("Erreur chargement", e); }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert("Erreur", "Accès caméra requis");

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true, // RETOUR DU RECADRAGE !
      aspect: [4, 3], // Format carte grise
      quality: 0.8,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setCgImage(uri);
      analyserImageAvecIA(uri);
    }
  };

  const analyserImageAvecIA = async (imageUri: string) => {
    console.log("--- LECTURE IA ---");
    setIsAnalyzing(true);

    try {
      const base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: 'base64' });
      const response = await fetch('https://vision.googleapis.com/v1/images:annotate?key=' + GOOGLE_CLOUD_VISION_API_KEY.trim(), {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64 },
            features: [{ type: 'TEXT_DETECTION' }]
          }]
        })
      });

      const data = await response.json();
      console.log("Status: " + response.status);

      if (response.status !== 200) throw new Error(data.error?.message || "Erreur " + response.status);

      const fullText = (data.responses[0]?.fullTextAnnotation?.text || "").toUpperCase();
      console.log("3. Analyse réussie !");

      // --- ALGORITHME DE RECHERCHE ASSOUPLI ---
     
      // Immat (A) : AA-111-AA ou le mot "(A)"
      const immatMatch = fullText.match(/[A-Z]{2}[-\s][0-9]{3}[-\s][A-Z]{2}/);
      let immatFound = immatMatch ? immatMatch[0].replace(/\s/g, '-') : "Non trouvé (A)";
      if (immatFound === "Non trouvé (A)") {
          const immatAlt = fullText.match(/\(A\)\s?([A-Z]{2}[-\s][0-9]{3}[-\s][A-Z]{2})/);
          if (immatAlt) immatFound = immatAlt[1].replace(/\s/g, '-');
      }

      const vinFound = fullText.match(/VF[A-Z0-9]{15}/)?.[0] || "Non trouvé (E)";
      const dateFound = fullText.match(/[0-9]{2}\/[0-9]{2}\/[0-9]{4}/)?.[0] || "Non trouvé (B)";
     
      // Puissance (P.6) : Cherche "P.6" puis des chiffres
      const p6Match = fullText.match(/P\.6\s?([0-9]{1,3})/);
      const p6Found = p6Match ? p6Match[1] + " CV" : "Non trouvé (P.6)";

      // Énergie (P.3) : Cherche "P.3" puis des lettres
      const p3Match = fullText.match(/P\.3\s?([A-Z0-9]{1,3})/);
      let p3Found = p3Match ? p3Match[1] : "Non trouvé (P.3)";
      if (p3Found.includes("GO")) p3Found = "GAZOLE";
      if (p3Found.includes("ES")) p3Found = "ESSENCE";

      const extracted = {
        immat: immatFound,
        vin: vinFound,
        miseEnCirc: dateFound,
        puissance: p6Found,
        energie: p3Found
      };

      setVehiculeInfo(extracted);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ image: imageUri, info: extracted }));

    } catch (error: any) {
      console.log("❌ ERREUR : " + error.message);
      Alert.alert("Erreur", "L'IA n'a pas pu lire le document.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><MaterialCommunityIcons name="arrow-left" size={26} color="#2c3e50" /></TouchableOpacity>
        <Text style={styles.titlePage}>MA CARTE GRISE</Text>
        <View style={{width: 26}} />
      </View>

      <ScrollView contentContainerStyle={{paddingBottom: 40}}>
        {/* --- CADRE SUPÉRIEUR AVEC BOUTON --- */}
        <View style={styles.card}>
          <View style={styles.docHeader}>
            <FontAwesome5 name="id-card" size={18} color="#f39c12" />
            <Text style={styles.docTitle}>DOCUMENT OFFICIEL</Text>
          </View>
          <View style={styles.separator} />
         
          {!cgImage ? (
            <TouchableOpacity style={styles.scanZone} onPress={handleTakePhoto}>
              <MaterialCommunityIcons name="camera" size={40} color="#3498db" />
              <Text style={styles.scanText}>PRENDRE LA PHOTO</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.viewDocContainer}>
                {isAnalyzing ? (
                    <View style={styles.analysingView}>
                        <ActivityIndicator size="large" color="#f39c12" />
                        <Text style={styles.overlayText}>ANALYSE IA EN COURS...</Text>
                    </View>
                ) : (
                    <TouchableOpacity style={styles.btnViewDoc} onPress={() => setModalVisible(true)}>
                        <MaterialCommunityIcons name="eye" size={30} color="#3498db" />
                        <Text style={styles.btnViewDocTxt}>VOIR LE DOCUMENT</Text>
                    </TouchableOpacity>
                )}
            </View>
          )}
        </View>

        {/* LE CADRE DES RÉSULTATS */}
        <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>DETAILS DE LA CARTE GRISE</Text>
            <View style={styles.separator} />
            <View style={styles.row}><Text style={styles.label}>IMMATRICULATION (A) :</Text><Text style={styles.val}>{vehiculeInfo.immat}</Text></View>
            <View style={styles.row}><Text style={styles.label}>N° DE CHÂSSIS (E) :</Text><Text style={styles.val}>{vehiculeInfo.vin}</Text></View>
            <View style={styles.row}><Text style={styles.label}>MISE EN CIRCULATION (B) :</Text><Text style={styles.val}>{vehiculeInfo.miseEnCirc}</Text></View>
            <View style={styles.row}><Text style={styles.label}>PUISSANCE (P.6) :</Text><Text style={styles.val}>{vehiculeInfo.puissance}</Text></View>
            <View style={styles.row}><Text style={styles.label}>ÉNERGIE (P.3) :</Text><Text style={styles.val}>{vehiculeInfo.energie}</Text></View>
        </View>
       
        {cgImage && !isAnalyzing && (
            <TouchableOpacity style={styles.btnRetry} onPress={handleTakePhoto}>
                <Text style={styles.btnText}>RECOMMENCER LE SCAN</Text>
            </TouchableOpacity>
        )}
      </ScrollView>

      {/* PLEIN ÉCRAN */}
      <Modal visible={modalVisible} transparent={true} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBg}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
            <MaterialCommunityIcons name="close-circle" size={45} color="white" />
          </TouchableOpacity>
          <Image source={{ uri: cgImage || '' }} style={styles.fullImage} resizeMode="contain" />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7ff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 15, backgroundColor: 'white' },
  titlePage: { fontSize: 16, fontWeight: '900', color: '#2c3e50' },
  card: {
  backgroundColor: 'white',
  margin: 20,
  borderRadius: 20,
  padding: 15,
  elevation: 5,
 
  // AJOUTE CES DEUX LIGNES POUR PRENDRE TOUT L'ESPACE ⬆️
  flex: 1,
  justifyContent: 'center'
},
  docHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  docTitle: { fontSize: 12, fontWeight: 'bold', color: '#7f8c8d', marginLeft: 10 },
  separator: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  scanZone: { height: 150, justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', borderWidth: 2, borderColor: '#3498db', borderRadius: 15 },
  scanText: { color: '#3498db', fontWeight: 'bold', marginTop: 10 },
  // Style du nouveau bouton
  viewDocContainer: { height: 150, justifyContent: 'center', alignItems: 'center' },
  btnViewDoc: { backgroundColor: '#e1f5fe', paddingVertical: 20, paddingHorizontal: 30, borderRadius: 20, flexDirection: 'row', alignItems: 'center', elevation: 3 },
  btnViewDocTxt: { color: '#01579b', fontWeight: 'bold', fontSize: 16, marginLeft: 15 },
  analysingView: { alignItems: 'center' },
  overlayText: { color: '#f39c12', marginTop: 10, fontWeight: 'bold', fontSize: 12 },
  // Info Card
  infoCard: { backgroundColor: 'white', marginHorizontal: 20, padding: 20, borderRadius: 20, elevation: 3 },
  infoTitle: { fontSize: 11, fontWeight: 'bold', color: '#f39c12', marginBottom: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 50 },
  label: { fontSize: 11, color: '#7f8c8d', fontWeight: 'bold' },
  val: { fontSize: 11, color: '#2c3e50', fontWeight: 'bold' },
  btnRetry: {
  backgroundColor: '#3498db',
  margin: 20,
  padding: 15,
  borderRadius: 15,
  alignItems: 'center',
 
  // MODIFIE CETTE LIGNE (Passe de 20 à 50) 🚀
  marginBottom: 50
},
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  // Modal Styles
  modalBg: { flex: 1, backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' },
  fullImage: { width: '100%', height: '85%' },
  closeBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10 }
});