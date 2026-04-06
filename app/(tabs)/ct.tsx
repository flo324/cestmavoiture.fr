import { FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useEntretien } from '../../context/EntretienContext';
const STORAGE_KEY_CT = '@ma_voiture_ct_data';

type CtInfoState = {
  dateCt: string;
  kmScanne: string;
  resultat: string;
  defauts: string;
  prochainCt: string;
};

function parseJsonFromGeminiText(text: string): unknown {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('json');
  }
}

function parseFrDate(s: unknown): Date | null {
  if (s == null) return null;
  const str = String(s).trim();
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const y = parseInt(m[3], 10);
  const dt = new Date(y, mo, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function addYears(d: Date, years: number): Date {
  const out = new Date(d);
  out.setFullYear(out.getFullYear() + years);
  return out;
}

function formatFr(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function normalizeGeminiCt(raw: Record<string, unknown>) {
  const dateVisite =
    raw.dateVisite ?? raw.date_visite ?? raw.dateCt ?? raw.date_visite_ct ?? raw.date;
  const kmRaw = raw.kilometrage ?? raw.km ?? raw.kilometrage_au_ct;
  let defaillances = raw.defaillances ?? raw.defauts ?? raw.defects ?? raw.liste_defaillances;
  if (typeof defaillances === 'string') {
    defaillances = defaillances
      .split(/[\n;•]/g)
      .map((x: string) => x.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(defaillances)) defaillances = [];
  const list = (defaillances as unknown[])
    .map((x) => (typeof x === 'string' ? x.trim() : String(x)))
    .filter((x) => x.length > 0);
  return { dateVisite, kmRaw, defaillances: list };
}

function formatKmDisplay(kmRaw: unknown): string {
  if (kmRaw == null || kmRaw === '') return '0';
  const s = String(kmRaw).replace(/\s/g, '').replace(/km/gi, '');
  const n = parseInt(s, 10);
  if (Number.isFinite(n)) return n.toLocaleString('fr-FR');
  return String(kmRaw).trim() || '0';
}

function urgencyBackground(daysLeft: number): string {
  if (daysLeft < 30) return '#e74c3c';
  if (daysLeft < 180) return '#e67e22';
  return '#2ecc71';
}

export default function CtScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    imageCaptured?: string;
    imageCapturedBase64?: string;
    fromGlobalScan?: string;
  }>();
  const entretien = useEntretien();
  const addMaintenanceTask = entretien?.addMaintenanceTask;

  const [ctImage, setCtImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  const [ctInfo, setCtInfo] = useState<CtInfoState>({
    dateCt: 'NON DÉTECTÉE',
    kmScanne: '—',
    resultat: 'À VÉRIFIER',
    defauts: 'Scanner le document pour extraire les notes de l\'IA...',
    prochainCt: 'NON DÉTECTÉ',
  });

  useEffect(() => {
    loadSavedData();
  }, []);

  useEffect(() => {
    const incomingUri = typeof params.imageCaptured === 'string' ? params.imageCaptured : '';
    const incomingBase64 =
      typeof params.imageCapturedBase64 === 'string' ? params.imageCapturedBase64 : '';
    const fromGlobal = typeof params.fromGlobalScan === 'string' ? params.fromGlobalScan : '';
    if (incomingUri && incomingBase64 && fromGlobal === '1') {
      setCtImage(incomingUri);
      analyserCT(incomingUri, incomingBase64);
    }
  }, [params]);

  const calculateDaysUntil = (echDate: Date) => {
    const diff = echDate.getTime() - Date.now();
    setDaysLeft(Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const loadSavedData = async () => {
    const data = await AsyncStorage.getItem(STORAGE_KEY_CT);
    if (data) {
      const parsed = JSON.parse(data) as { image?: string; info?: Partial<CtInfoState> & Record<string, unknown> };
      if (parsed.image) setCtImage(parsed.image);
      if (parsed.info) {
        const info = parsed.info;
        setCtInfo({
          dateCt: typeof info.dateCt === 'string' ? info.dateCt : 'NON DÉTECTÉE',
          kmScanne: typeof info.kmScanne === 'string' ? info.kmScanne : '—',
          resultat: typeof info.resultat === 'string' ? info.resultat : 'À VÉRIFIER',
          defauts: typeof info.defauts === 'string' ? info.defauts : '',
          prochainCt: typeof info.prochainCt === 'string' ? info.prochainCt : 'NON DÉTECTÉ',
        });
        if (info.prochainCt && info.prochainCt !== 'NON DÉTECTÉ' && info.prochainCt !== 'NON DÉTECTÉE') {
          const d = parseFrDate(info.prochainCt);
          if (d) calculateDaysUntil(d);
        }
      }
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Erreur', 'Accès caméra requis');
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setCtImage(asset.uri);
      const b64 = asset.base64;
      await analyserCT(asset.uri, b64);
    }
  };

  const analyserCT = async (uri: string, base64FromPicker?: string | null) => {
    setIsAnalyzing(true);
    try {
      let base64 = base64FromPicker ?? '';
      if (!base64) {
        base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      }
      if (!base64) {
        Alert.alert('Document illisible, réessayez');
        return;
      }

      const today = new Date();
      const echDate = addYears(today, 2);
      const prochainCtFormatted = formatFr(echDate);
      const kmScanne = '0';
      const defaillances: string[] = [];
      const defautsText = 'Photo enregistrée. Analyse IA temporairement désactivée.';

      const extracted: CtInfoState = {
        dateCt: formatFr(today),
        kmScanne,
        resultat: 'À VÉRIFIER',
        defauts: defautsText,
        prochainCt: prochainCtFormatted,
      };

      setCtInfo(extracted);
      calculateDaysUntil(echDate);

      if (defaillances.length > 0 && addMaintenanceTask) {
        for (const d of defaillances) {
          await addMaintenanceTask({
            title: d,
            category: 'À faire',
            source: 'CT',
          });
        }
      }

      await AsyncStorage.setItem(STORAGE_KEY_CT, JSON.stringify({ image: uri, info: extracted }));
    } catch {
      Alert.alert('Document illisible, réessayez');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const timerBg =
    daysLeft !== null ? urgencyBackground(daysLeft) : '#2ecc71';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={26} color="#000" />
        </TouchableOpacity>
        <Text style={styles.titlePage}>MES CONTRÔLES TECHNIQUES</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {daysLeft !== null && (
          <View style={[styles.timerCard, { backgroundColor: timerBg }]}>
            <MaterialCommunityIcons name="clock-outline" size={30} color="#fff" />
            <View style={{ marginLeft: 15, flex: 1 }}>
              <Text style={styles.timerTitle}>ÉCHÉANCE DU PROCHAIN CT :</Text>
              <Text style={styles.timerDays}>
                {daysLeft >= 0 ? `DANS ${daysLeft} JOUR${daysLeft > 1 ? 'S' : ''}` : `EXPIRÉ DEPUIS ${Math.abs(daysLeft)} JOUR${Math.abs(daysLeft) > 1 ? 'S' : ''}`}
              </Text>
            </View>
          </View>
        )}

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

        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>RÉSUMÉ DU SCAN</Text>
          <View style={styles.row}>
            <Text style={styles.label}>DATE DU VISITE :</Text>
            <Text style={styles.val}>{ctInfo.dateCt}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>KILOMÉTRAGE SCANNÉ :</Text>
            <Text style={styles.val}>{ctInfo.kmScanne} km</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>RÉSULTAT :</Text>
            <Text
              style={[
                styles.val,
                { color: ctInfo.resultat.includes('FAVORABLE') ? '#27ae60' : '#e74c3c' },
              ]}
            >
              {ctInfo.resultat}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>ÉCHÉANCE (VISITE + 2 ANS) :</Text>
            <Text style={styles.val}>{ctInfo.prochainCt}</Text>
          </View>

          <View style={styles.separator} />
          <Text style={styles.label}>DÉFAILLANCES :</Text>
          <Text style={styles.defautsText}>{ctInfo.defauts}</Text>
        </View>

        {ctImage && (
          <TouchableOpacity style={styles.retryBtn} onPress={handleTakePhoto}>
            <Text style={styles.retryTxt}>RE-SCANNER UN NOUVEAU PV</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal visible={modalVisible} transparent>
        <View style={styles.modalBg}>
          <TouchableOpacity style={styles.close} onPress={() => setModalVisible(false)}>
            <MaterialCommunityIcons name="close-circle" size={45} color="white" />
          </TouchableOpacity>
          <Image source={{ uri: ctImage || '' }} style={styles.fullImg} resizeMode="contain" />
        </View>
      </Modal>

      {isAnalyzing && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={{ color: '#fff', fontWeight: 'bold', marginTop: 10 }}>ENREGISTREMENT...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7ff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#fff',
  },
  titlePage: { fontSize: 16, fontWeight: 'bold' },
  timerCard: {
    margin: 20,
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 5,
  },
  timerTitle: { color: '#fff', fontSize: 10, fontWeight: 'bold', opacity: 0.9 },
  timerDays: { color: '#fff', fontSize: 22, fontWeight: '900' },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    borderRadius: 25,
    padding: 20,
    elevation: 4,
    alignItems: 'center',
  },
  scanZone: {
    width: '100%',
    height: 120,
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: '#9b59b6',
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanText: { color: '#9b59b6', fontWeight: 'bold', fontSize: 12, marginTop: 10 },
  btnView: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f7ff',
    padding: 15,
    borderRadius: 15,
    width: '100%',
    justifyContent: 'center',
  },
  btnViewText: { marginLeft: 10, color: '#9b59b6', fontWeight: 'bold' },
  infoCard: {
    backgroundColor: '#fff',
    margin: 20,
    borderRadius: 25,
    padding: 20,
    elevation: 3,
  },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', color: '#9b59b6', marginBottom: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap' },
  label: { fontSize: 11, color: '#7f8c8d', fontWeight: 'bold', flexShrink: 0 },
  val: { fontSize: 11, fontWeight: 'bold', color: '#2c3e50', flex: 1, textAlign: 'right' },
  separator: { height: 1, backgroundColor: '#f1f1f1', marginVertical: 15 },
  defautsText: { fontSize: 12, color: '#34495e', lineHeight: 18, marginTop: 5, fontStyle: 'italic' },
  retryBtn: { margin: 20, padding: 18, borderRadius: 20, backgroundColor: '#2c3e50', alignItems: 'center' },
  retryTxt: { color: '#fff', fontWeight: 'bold' },
  modalBg: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  fullImg: { width: '100%', height: '80%' },
  close: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  loader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
});
