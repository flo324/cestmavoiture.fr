import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Alert, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View, } from 'react-native';

// Importation de la synchro
import { useKilometrage } from '../../context/KilometrageContext';

const USER_DATA_KEY = '@cestmavoiture_user_v2';

export default function HomeScreen() {
  const router = useRouter();
 
  // CORRECTION DU CRASH : Sécurité si le contexte est vide au démarrage
  const kilometrageContext = useKilometrage();
  const kmValue = kilometrageContext ? kilometrageContext.km : "190 000";

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraVisible, setCameraVisible] = useState(false);
  const [selectionVisible, setSelectionVisible] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const cameraRef = useRef<any>(null);

  const [userData, setUserData] = useState({
    prenom: 'Florent', nom: 'DAMIANO', modele: '307 PEUGEOT', immat: '56 Ayw 13',
  });

  // Liste des 11 dossiers (on exclut KM et ST pour le rangement manuel)
  const dossiersSelection = [
    { label: "CONTRÔLE TECHNIQUE", icon: "clipboard-list-outline", route: "/ct", color: "#3498db" },
    { label: "BATTERIE", icon: "battery-charging", route: "/batterie", color: "#f1c40f" },
    { label: "FACTURES", icon: "file-document-outline", route: "/factures", color: "#3498db" },
    { label: "PHARE", icon: "lightbulb-outline", route: "/phares", color: "#3498db" },
    { label: "PNEUS", icon: "tire", route: "/pneus", color: "#e67e22" },
    { label: "DOCS", icon: "folder-open", route: "/docs", color: "#f39c12" },
    { label: "LOCATION", icon: "camera-account", route: "/location", color: "#3498db" },
    { label: "CARROSSERIE", icon: "car-side", route: "/carrosserie", color: "#e67e22" },
    { label: "PANNE", icon: "bell-ring", route: "/panne", color: "#e74c3c" },
    { label: "PROFIL", icon: "account-outline", route: "/profil", color: "#9b59b6" },
    { label: "RÉGLAGES", icon: "cog-outline", route: "/modal", color: "#7f8c8d" },
  ];

  useFocusEffect(
    useCallback(() => {
      const fetchUserData = async () => {
        try {
          const storedData = await AsyncStorage.getItem(USER_DATA_KEY);
          if (storedData) setUserData(JSON.parse(storedData));
        } catch (e) { console.log("Erreur", e); }
      };
      fetchUserData();
    }, [])
  );

  const handleScanPress = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return Alert.alert("Erreur", "Permission caméra requise");
    }
    setCameraVisible(true);
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync();
      setCapturedUri(photo.uri);
      setCameraVisible(false);
      setSelectionVisible(true);
    }
  };

  const saveAndGo = (route: any) => {
    setSelectionVisible(false);
    router.push({
      pathname: route,
      params: { imageCaptured: capturedUri }
    });
  };

  const GridButton = ({ title, sub, icon, color, route }: any) => (
    <View style={styles.gridWrapper}>
      <TouchableOpacity style={[styles.gridItem, { borderColor: color }]} onPress={() => router.push(route)}>
        <MaterialCommunityIcons name={icon} size={35} color={color} />
        <Text style={styles.gridTitle}>{title}</Text>
      </TouchableOpacity>
      <Text style={styles.gridSubText}>{sub}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* MODAL CAMÉRA */}
      <Modal visible={cameraVisible} animationType="slide">
        <CameraView style={{ flex: 1 }} ref={cameraRef}>
          <View style={styles.cameraOverlay}>
            <TouchableOpacity style={styles.captureBtn} onPress={takePicture}>
              <View style={styles.captureBtnInternal} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeCamera} onPress={() => setCameraVisible(false)}>
              <Ionicons name="close" size={40} color="white" />
            </TouchableOpacity>
          </View>
        </CameraView>
      </Modal>

      {/* MODAL DE SÉLECTION (11 dossiers) */}
      <Modal visible={selectionVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.selectionCard}>
            <Text style={styles.modalTitle}>Enregistrer dans quel dossier ?</Text>
            <ScrollView style={{ maxHeight: 450 }}>
              {dossiersSelection.map((item, index) => (
                <TouchableOpacity key={index} style={styles.selectionItem} onPress={() => saveAndGo(item.route)}>
                  <MaterialCommunityIcons name={item.icon as any} size={24} color={item.color} />
                  <Text style={styles.selectionLabel}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={18} color="#bdc3c7" />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelectionVisible(false)}>
              <Text style={styles.cancelBtnText}>ANNULER</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.logoWhiteArea}>
        <View style={styles.topLogo}>
          <Text style={styles.logoPart1}>cestma</Text>
          <Text style={styles.logoPart2}>voiture</Text>
          <Text style={styles.logoPart3}>.fr</Text>
        </View>
      </View>

      <View style={styles.contentBody}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          <View style={styles.userInfoSimple}>
             <View style={styles.avatarSimple}><Text style={styles.avatarTxtSimple}>FD</Text></View>
             <View style={{marginLeft: 15}}>
                <Text style={styles.userNameFlat}>{userData.prenom} {userData.nom}</Text>
                <View style={styles.userSubRow}>
                  <MaterialCommunityIcons name="car" size={14} color="#7f8c8d" />
                  <Text style={styles.userSubTxt}> {userData.modele} • {userData.immat}</Text>
                </View>
                <View style={styles.kmRowSimple}>
                  <MaterialCommunityIcons name="speedometer" size={14} color="#f39c12" />
                  {/* AFFICHAGE SYNCHRONISÉ DU KM */}
                  <Text style={styles.kmTxtSimple}> {kmValue} KM</Text>
                </View>
             </View>
          </View>

          <View style={styles.grid}>
            <GridButton title="CT" sub="CONTRÔLE TECHNIQUE" icon="clipboard-list-outline" color="#3498db" route="/ct" />
            <GridButton title="KM" sub="KILOMÉTRAGE" icon="speedometer" color="#f39c12" route="/km" />
            <GridButton title="ST" sub="STATISTIQUES" icon="chart-areaspline" color="#f1c40f" route="/st" />
            <GridButton title="BAT" sub="BATTERIE" icon="battery-charging" color="#f1c40f" route="/batterie" />
            <GridButton title="PAN" sub="PANNE" icon="bell-ring" color="#e74c3c" route="/panne" />
            <GridButton title="PNE" sub="PNEUS" icon="tire" color="#e67e22" route="/pneus" />
            <GridButton title="FT" sub="FACTURES" icon="file-document-outline" color="#3498db" route="/factures" />
            <GridButton title="EN" sub="ENTRETIEN" icon="wrench" color="#f39c12" route="/entretien" />
            <GridButton title="DOC" sub="DOCUMENTS" icon="folder-open" color="#f39c12" route="/docs" />
            <GridButton title="CF" sub="PHARE" icon="lightbulb-outline" color="#3498db" route="/phares" />
            <GridButton title="PH" sub="CARROSSERIE" icon="car-side" color="#e67e22" route="/carrosserie" />
            <GridButton title="LOC" sub="LOCATION" icon="camera-account" color="#3498db" route="/location" />
          </View>
        </ScrollView>
      </View>

      
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // --- STYLES GÉNÉRAUX ET LOGO (Adaptés Web/Vercel) ---
  container: { flex: 1, backgroundColor: '#fff' },
  logoWhiteArea: { backgroundColor: '#fff', paddingBottom: 10, alignItems: 'center' },
  topLogo: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'web' ? 20 : 60,
    marginBottom: 10
  },
  logoPart1: { fontSize: Platform.OS === 'web' ? 40 : 60, fontWeight: 'bold', color: '#3498db' },
  logoPart2: { fontSize: Platform.OS === 'web' ? 22 : 32, fontWeight: 'bold', color: '#2c3e50' },
  logoPart3: { fontSize: Platform.OS === 'web' ? 40 : 60, color: '#3498db' },
  contentBody: {
    flex: 1,
    backgroundColor: '#f2f5f8',
    marginTop: Platform.OS === 'web' ? 0 : -20
  },

  // --- STYLES UTILISATEUR ---
  userInfoSimple: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 25, marginTop: 15 },
  avatarSimple: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: '#bdc3c7', justifyContent: 'center', alignItems: 'center' },
  avatarTxtSimple: { color: '#fff', fontWeight: 'bold' },
  userNameFlat: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
  userSubRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  userSubTxt: { fontSize: 13, color: '#7f8c8d' },

  // --- GRID (BOUTONS PRINCIPAUX) ---
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 10 },
  gridWrapper: { width: '30%', alignItems: 'center', marginBottom: 10 },
  gridItem: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#2c3e50',
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center'
  },
  gridTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  gridSubText: {
    color: '#2c3e50',
    fontSize: 7.5,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 5,
    textTransform: 'uppercase'
  },

  // --- STYLES DES MODALS (Caméra et Sélection) ---
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  selectionCard: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    maxHeight: '80%'
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  selectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  selectionLabel: { fontSize: 16, marginLeft: 15, flex: 1 },
  cancelBtn: { marginTop: 20, padding: 15, alignItems: 'center' },
 
  // --- CAMERA ---
  cameraOverlay: { flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end', alignItems: 'center' },
  captureBtn: { marginBottom: 30, width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  captureBtnInternal: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  closeCamera: { position: 'absolute', top: 40, right: 20 },
    // --- AJOUT DES STYLES MANQUANTS ---
  kmRowSimple: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4
  },
  kmTxtSimple: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c3e50'
  },
  cancelBtnText: {
    color: '#e74c3c', // Rouge pour le bouton annuler
    fontSize: 16,
    fontWeight: 'bold'
  },
});