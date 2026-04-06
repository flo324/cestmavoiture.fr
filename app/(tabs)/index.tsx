import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View, } from 'react-native';

// Importation de la synchro
import { useKilometrage } from '../../context/KilometrageContext';

const USER_DATA_KEY = '@cestmavoiture_user_v2';
const PENDING_SCAN_KEY = '@pending_scan_capture_v1';

export default function HomeScreen() {
  const router = useRouter();
 
  // CORRECTION DU CRASH : Sécurité si le contexte est vide au démarrage
  const kilometrageContext = useKilometrage();
  const kmValue = kilometrageContext ? kilometrageContext.km : "190 000";

  const [pendingScan, setPendingScan] = useState<{ uri: string; base64: string } | null>(null);
  const wiggle = useRef(new Animated.Value(0)).current;

  const [userData, setUserData] = useState({
    prenom: 'Florent', nom: 'DAMIANO', modele: '307 PEUGEOT', immat: '56 Ayw 13',
  });

  useFocusEffect(
    useCallback(() => {
      const fetchData = async () => {
        try {
          const storedData = await AsyncStorage.getItem(USER_DATA_KEY);
          if (storedData) setUserData(JSON.parse(storedData));
          const pendingRaw = await AsyncStorage.getItem(PENDING_SCAN_KEY);
          if (pendingRaw) {
            const pending = JSON.parse(pendingRaw) as { uri?: string; base64?: string };
            if (pending.uri && pending.base64) {
              setPendingScan({ uri: pending.uri, base64: pending.base64 });
            } else {
              setPendingScan(null);
            }
          } else {
            setPendingScan(null);
          }
        } catch (e) {
          console.log('Erreur', e);
        }
      };
      fetchData();
    }, [])
  );

  useEffect(() => {
    if (!pendingScan) {
      wiggle.stopAnimation();
      wiggle.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wiggle, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.timing(wiggle, { toValue: -1, duration: 90, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pendingScan, wiggle]);

  const handleGridPress = async (route: string) => {
    if (!pendingScan) {
      router.push(route as any);
      return;
    }
    await AsyncStorage.removeItem(PENDING_SCAN_KEY);
    setPendingScan(null);
    router.push({
      pathname: route as any,
      params: {
        imageCaptured: pendingScan.uri,
        imageCapturedBase64: pendingScan.base64,
        fromGlobalScan: '1',
      },
    });
  };

  const GridButton = ({ title, sub, icon, color, route }: any) => (
    <View style={styles.gridWrapper}>
      <Animated.View
        style={{
          transform: [
            { rotate: wiggle.interpolate({ inputRange: [-1, 1], outputRange: ['-1.8deg', '1.8deg'] }) },
          ],
        }}
      >
      <TouchableOpacity style={[styles.gridItem, { borderColor: color }]} onPress={() => handleGridPress(route)}>
        <MaterialCommunityIcons name={icon} size={35} color={color} />
        <Text style={styles.gridTitle}>{title}</Text>
      </TouchableOpacity>
      </Animated.View>
      <Text style={styles.gridSubText}>{sub}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.logoWhiteArea}>
        <View style={styles.topLogo}>
          <Text style={styles.logoPart1}>cestma</Text>
          <Text style={styles.logoPart2}>voiture</Text>
          <Text style={styles.logoPart3}>.fr</Text>
        </View>
      </View>

      <View style={styles.contentBody}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {pendingScan ? (
            <Text style={styles.pendingHint}>Photo prête: touche une case pour enregistrer dans ce dossier</Text>
          ) : null}
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
  pendingHint: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 6,
    backgroundColor: '#fff3cd',
    color: '#8a6d3b',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontWeight: '700',
    textAlign: 'center',
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