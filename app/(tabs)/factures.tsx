import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { userGetItem, userSetItem } from '../../services/userStorage';

const { width, height } = Dimensions.get('window');
const STORAGE_KEY = '@mes_factures_v5';

interface ReparationFolder {
  id: string;
  titre: string;
  date: string;
  garage: string;
  adresse: string;
  km: string;
  prixTTC: string;
  details: string;
  imageUri: string;
  createdAt?: number;
  updatedAt?: number;
}

export default function FacturesScreen() {
  const params = useLocalSearchParams<{
    imageCaptured?: string;
    imageCapturedBase64?: string;
    fromGlobalScan?: string;
  }>();
  const [reparations, setReparations] = useState<ReparationFolder[]>([]);
  const [step, setStep] = useState<'idle' | 'hasPhoto' | 'analyzing'>('idle');
  const [capturedImage, setCapturedImage] = useState<{ uri: string; base64: string } | null>(null);
  const [selectedRep, setSelectedRep] = useState<ReparationFolder | null>(null);
  const formatDateTime = (ts?: number) =>
    ts
      ? new Date(ts).toLocaleString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '-';

  useEffect(() => {
    const loadData = async () => {
      const saved = await userGetItem(STORAGE_KEY);
      if (saved) setReparations(JSON.parse(saved));
    };
    loadData();
  }, []);

  useEffect(() => {
    const incomingUri = typeof params.imageCaptured === 'string' ? params.imageCaptured : '';
    const incomingBase64 =
      typeof params.imageCapturedBase64 === 'string' ? params.imageCapturedBase64 : '';
    const fromGlobal = typeof params.fromGlobalScan === 'string' ? params.fromGlobalScan : '';
    if (incomingUri && incomingBase64 && fromGlobal === '1') {
      setCapturedImage({ uri: incomingUri, base64: incomingBase64 });
      setStep('analyzing');
    }
  }, [params]);

  const analyserFactureAvecIA = async () => {
    if (!capturedImage) return;
    setStep('analyzing');
    try {
      const now = new Date();
      const nowTs = Date.now();
      const date = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
      const nouvelle = {
        id: Date.now().toString(),
        titre: 'Document scanné',
        garage: 'À compléter',
        adresse: 'À compléter',
        date,
        km: '0',
        prixTTC: '0',
        details: 'Analyse IA désactivée temporairement.',
        imageUri: capturedImage.uri,
        createdAt: nowTs,
        updatedAt: nowTs,
      };
      const updated = [nouvelle, ...reparations];
      setReparations(updated);
      await userSetItem(STORAGE_KEY, JSON.stringify(updated));
      setStep('idle');
      setCapturedImage(null);
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de sauvegarder le document.');
      setStep('idle');
    }
  };

  useEffect(() => {
    if (step === 'analyzing' && capturedImage) {
      analyserFactureAvecIA();
    }
  }, [step, capturedImage]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mes réparations et entretiens</Text>
      </View>
      <FlatList
        data={reparations}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.folderCard} onPress={() => setSelectedRep(item)}>
            <MaterialCommunityIcons name="folder-zip" size={40} color="#f1c40f" />
            <View style={{ marginLeft: 15, flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>{item.titre}</Text>
              <Text style={{ color: '#3498db', fontSize: 11 }}>
                {item.date} • {item.km} km
              </Text>
              <Text style={{ color: '#7f93ab', fontSize: 10, marginTop: 2 }}>
                Créé le: {formatDateTime(item.createdAt)}
              </Text>
              <Text style={{ color: '#7f93ab', fontSize: 10, marginTop: 1 }}>
                Modifié le: {formatDateTime(item.updatedAt || item.createdAt)}
              </Text>
            </View>
            <Text style={{ color: '#2ecc71', fontWeight: 'bold' }}>{item.prixTTC} €</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="file-search-outline" size={80} color="#bdc3c7" />
            <Text style={styles.emptyText}>Aucune facture.</Text>
            <Text style={styles.emptySubText}>Utilisez le bouton Scan IA pour commencer.</Text>
          </View>
        }
        contentContainerStyle={{ padding: 20 }}
      />
      <Modal visible={step !== 'idle'} animationType="fade">
        <View style={styles.fullOverlay}>
          {step === 'hasPhoto' && (
            <View style={styles.cropView}>
              <Image source={{ uri: capturedImage?.uri }} style={styles.preview} resizeMode="cover" />
              <View style={styles.cropFrame} />
              <TouchableOpacity
                style={styles.btnValidate}
                onPress={() =>
                  Alert.alert('Confirmer l’enregistrement', 'Voulez-vous analyser et enregistrer cette facture ?', [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Enregistrer', onPress: () => void analyserFactureAvecIA() },
                  ])
                }
              >
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>VALIDER ET ANALYSER</Text>
              </TouchableOpacity>
            </View>
          )}
          {step === 'analyzing' && <ActivityIndicator size="large" color="#3498db" />}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0f14' },
  header: {
    backgroundColor: '#0b0f14',
    padding: 20,
    paddingTop: 40,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#e2e8f0' },
  folderCard: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 20,
    borderRadius: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: '#94a3b8', marginTop: 20 },
  emptySubText: { fontSize: 14, color: '#64748b' },
  fullOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  cropView: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  preview: { position: 'absolute', width: '100%', height: '100%' },
  cropFrame: {
    width: width * 0.85,
    height: height * 0.55,
    borderWidth: 2,
    borderColor: '#fff',
    borderStyle: 'dashed',
    borderRadius: 10,
  },
  btnValidate: { backgroundColor: '#2ecc71', padding: 20, borderRadius: 30, position: 'absolute', bottom: 50 },
});