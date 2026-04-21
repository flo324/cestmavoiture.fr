import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatFrDateInput } from '../../components/SmartDateInput';
import { useKilometrage } from '../../context/KilometrageContext';
import { userGetItem, userSetItem } from '../../services/userStorage';

const STORAGE_KEY = '@mes_pneus_v1';
const RETURN_TO_FOLDERS_FLAG = '@otto_open_folders_on_return';

interface PneuRecord {
  id: string;
  largeur: string;
  hauteur: string;
  dimensionJantes: string;
  capaciteCharge: string;
  indiceVitesse: string;
  dateAchat: string;
  prix: string;
  kilometrage: string;
  imageUri?: string;
  createdAt: string;
}

type ScreenState = 'home' | 'form' | 'list';
type FormStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const FORM_STEPS: {
  key: keyof Omit<PneuRecord, 'id' | 'imageUri' | 'createdAt'>;
  label: string;
  placeholder: string;
  keyboard?: 'default' | 'numeric';
}[] = [
  { key: 'largeur', label: 'Largeur', placeholder: 'Ex: 205', keyboard: 'numeric' },
  { key: 'hauteur', label: 'Hauteur', placeholder: 'Ex: 55', keyboard: 'numeric' },
  { key: 'dimensionJantes', label: 'Dimension jantes', placeholder: 'Ex: R16' },
  { key: 'capaciteCharge', label: 'Capacité de charge', placeholder: 'Ex: 91' },
  { key: 'indiceVitesse', label: 'Indice de vitesse', placeholder: 'Ex: V' },
  { key: 'dateAchat', label: "Date d'achat", placeholder: 'JJ/MM/AAAA' },
  { key: 'prix', label: 'Prix', placeholder: 'Ex: 120', keyboard: 'numeric' },
  { key: 'kilometrage', label: 'Kilométrage', placeholder: 'Ex: 125000', keyboard: 'numeric' },
  { key: 'kilometrage', label: 'Photo (optionnel)', placeholder: '' },
];

export default function PneusScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const allowLeaveRef = useRef(false);
  const kmCtx = useKilometrage();
  const [screenState, setScreenState] = useState<ScreenState>('home');
  const [pneus, setPneus] = useState<PneuRecord[]>([]);
  const [formStep, setFormStep] = useState<FormStep>(0);
  const [form, setForm] = useState<Omit<PneuRecord, 'id' | 'createdAt'>>({
    largeur: '',
    hauteur: '',
    dimensionJantes: '',
    capaciteCharge: '',
    indiceVitesse: '',
    dateAchat: '',
    prix: '',
    kilometrage: '',
    imageUri: '',
  });

  const isPhotoStep = formStep === 8;
  const isLastStep = formStep === 8;
  const currentStepMeta = FORM_STEPS[formStep];

  const dossierLabel = useMemo(() => {
    const dims = [form.largeur, form.hauteur, form.dimensionJantes].filter(Boolean).join('/');
    return dims || 'Dossier pneus';
  }, [form.dimensionJantes, form.hauteur, form.largeur]);

  useEffect(() => {
    const loadData = async () => {
      const saved = await userGetItem(STORAGE_KEY);
      if (!saved) return;
      try {
        const parsed = JSON.parse(saved) as PneuRecord[];
        setPneus(Array.isArray(parsed) ? parsed : []);
      } catch {
        setPneus([]);
      }
    };
    loadData();
  }, []);

  const saveToStorage = async (data: PneuRecord[]) => {
    await userSetItem(STORAGE_KEY, JSON.stringify(data));
  };

  const resetForm = () => {
    setForm({
      largeur: '',
      hauteur: '',
      dimensionJantes: '',
      capaciteCharge: '',
      indiceVitesse: '',
      dateAchat: '',
      prix: '',
      kilometrage: kmCtx?.km ?? '',
      imageUri: '',
    });
    setFormStep(0);
  };

  const startNewDossier = () => {
    resetForm();
    setScreenState('form');
  };

  const pickOptionalPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Autorisation requise', 'Autorisez la galerie pour ajouter une photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setForm((prev) => ({ ...prev, imageUri: result.assets[0].uri }));
  };

  const saveDossier = async () => {
    const newRecord: PneuRecord = {
      id: Date.now().toString(),
      largeur: form.largeur.trim(),
      hauteur: form.hauteur.trim(),
      dimensionJantes: form.dimensionJantes.trim(),
      capaciteCharge: form.capaciteCharge.trim(),
      indiceVitesse: form.indiceVitesse.trim(),
      dateAchat: form.dateAchat.trim(),
      prix: form.prix.trim(),
      kilometrage: form.kilometrage.trim(),
      imageUri: form.imageUri?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    const updated = [newRecord, ...pneus];
    setPneus(updated);
    await saveToStorage(updated);

    Alert.alert('Dossier enregistré', `Votre dossier (${dossierLabel}) est bien enregistré.`, [
      {
        text: 'Créer un nouveau dossier',
        onPress: () => {
          resetForm();
          setScreenState('form');
        },
      },
      {
        text: 'Fermer',
        style: 'default',
        onPress: () => {
          setScreenState('list');
          resetForm();
        },
      },
    ]);
  };

  const goNext = async () => {
    if (isLastStep) {
      await saveDossier();
      return;
    }
    setFormStep((prev) => (Math.min(8, prev + 1) as FormStep));
  };

  const goBack = () => {
    if (formStep === 0) {
      setScreenState('home');
      return;
    }
    setFormStep((prev) => (Math.max(0, prev - 1) as FormStep));
  };

  const goToFolders = useCallback(() => {
    allowLeaveRef.current = true;
    void userSetItem(RETURN_TO_FOLDERS_FLAG, '1');
    router.replace('/(tabs)');
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      allowLeaveRef.current = false;
      return () => {};
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        goToFolders();
        return true;
      });
      return () => sub.remove();
    }, [goToFolders])
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current) return;
      event.preventDefault();
      goToFolders();
    });
    return unsubscribe;
  }, [goToFolders, navigation]);

  const skipCurrent = () => {
    if (!isPhotoStep) {
      const key = currentStepMeta.key;
      setForm((prev) => ({ ...prev, [key]: '' }));
    }
    void goNext();
  };

  const deletePneu = (id: string) => {
    Alert.alert('Supprimer', 'Supprimer cet enregistrement ?', [
      { text: 'Non' },
      {
        text: 'Oui',
        onPress: () => {
          const updated = pneus.filter((p) => p.id !== id);
          setPneus(updated);
          void saveToStorage(updated);
        },
      },
    ]);
  };

  if (screenState === 'home') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Pneus</Text>
          <Text style={styles.headerSub}>Choisissez une action</Text>
        </View>
        <View style={styles.centerWrap}>
          <TouchableOpacity style={styles.bigAction} onPress={startNewDossier} activeOpacity={0.9}>
            <MaterialCommunityIcons name="tire" size={26} color="#67e8f9" />
            <Text style={styles.bigActionTitle}>Vous avez changé de pneus ?</Text>
            <Text style={styles.bigActionSub}>Créez un nouveau dossier guidé, étape par étape.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bigAction} onPress={() => setScreenState('list')} activeOpacity={0.9}>
            <MaterialCommunityIcons name="folder-eye-outline" size={26} color="#67e8f9" />
            <Text style={styles.bigActionTitle}>Voir mes pneus</Text>
            <Text style={styles.bigActionSub}>Consultez vos dossiers enregistrés.</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (screenState === 'form') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Nouveau dossier pneus</Text>
          <Text style={styles.headerSub}>
            Étape {formStep + 1} / 9
          </Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.stepLabel}>{isPhotoStep ? 'Photo (optionnel)' : currentStepMeta.label}</Text>
          {!isPhotoStep ? (
            <TextInput
              style={styles.input}
              value={String(form[currentStepMeta.key] ?? '')}
              onChangeText={(t) => {
                const nextValue = currentStepMeta.key === 'dateAchat' ? formatFrDateInput(t) : t;
                setForm((prev) => ({ ...prev, [currentStepMeta.key]: nextValue }));
                if (currentStepMeta.key === 'dateAchat' && nextValue.length === 10) {
                  void goNext();
                }
              }}
              placeholder={currentStepMeta.placeholder}
              placeholderTextColor="#64748b"
              keyboardType={currentStepMeta.keyboard ?? 'default'}
            />
          ) : (
            <TouchableOpacity style={styles.photoPick} onPress={pickOptionalPhoto} activeOpacity={0.9}>
              {form.imageUri ? (
                <Image source={{ uri: form.imageUri }} style={styles.photoPreview} />
              ) : (
                <>
                  <MaterialCommunityIcons name="camera-plus-outline" size={28} color="#94a3b8" />
                  <Text style={styles.photoHint}>Ajouter une photo (facultatif)</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          <Text style={styles.formHint}>Si vous ne connaissez pas la réponse, utilisez “Passer”.</Text>
        </View>

        <View style={styles.formActions}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={goBack}>
            <Text style={styles.secondaryBtnText}>{formStep === 0 ? 'Annuler' : 'Retour'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={skipCurrent}>
            <Text style={styles.secondaryBtnText}>Passer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => void goNext()}>
            <Text style={styles.primaryBtnText}>{isLastStep ? 'Enregistrer' : 'Suivant'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mes pneus</Text>
        <TouchableOpacity onPress={() => setScreenState('home')}>
          <Text style={styles.backText}>Retour</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={pneus}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onLongPress={() => deletePneu(item.id)} activeOpacity={0.85}>
            <MaterialCommunityIcons name="tire" size={40} color="#3498db" />
            <View style={{ marginLeft: 15, flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>
                {item.largeur || '-'} / {item.hauteur || '-'} {item.dimensionJantes || '-'}
              </Text>
              <Text style={{ color: '#67e8f9', fontSize: 11 }}>
                {item.dateAchat || 'Date inconnue'} - {item.kilometrage || 'KM ?'} km
              </Text>
            </View>
            <Text style={{ color: '#2ecc71', fontWeight: 'bold' }}>{item.prix ? `${item.prix} €` : '-'}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>Aucun dossier pneus enregistré.</Text>}
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
      />

      <TouchableOpacity style={styles.scanBtn} onPress={startNewDossier}>
        <MaterialCommunityIcons name="plus-circle-outline" size={24} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: 'bold', marginLeft: 10 }}>CRÉER UN DOSSIER</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0f14' },
  header: {
    backgroundColor: '#0b0f14',
    paddingVertical: 16,
    paddingTop: 40,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#e2e8f0' },
  headerSub: { marginTop: 4, color: '#94a3b8', fontSize: 12 },
  backText: { marginTop: 8, color: '#67e8f9', fontWeight: '700' },
  centerWrap: { flex: 1, padding: 20, gap: 14, justifyContent: 'center' },
  bigAction: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 18,
    borderRadius: 16,
  },
  bigActionTitle: { color: '#e2e8f0', fontSize: 15, fontWeight: '800', marginTop: 10 },
  bigActionSub: { color: '#94a3b8', marginTop: 6, lineHeight: 18 },
  formCard: {
    marginTop: 18,
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#111827',
    padding: 16,
  },
  stepLabel: { color: '#e2e8f0', fontSize: 16, fontWeight: '800', marginBottom: 10 },
  input: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#e2e8f0',
    fontSize: 15,
  },
  photoPick: {
    height: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoPreview: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoHint: { color: '#94a3b8', marginTop: 10, fontWeight: '700' },
  formHint: { color: '#94a3b8', marginTop: 12, fontSize: 12 },
  formActions: { flexDirection: 'row', gap: 8, marginTop: 14, paddingHorizontal: 16, paddingBottom: 18 },
  primaryBtn: {
    flex: 1.2,
    backgroundColor: '#00E9F5',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  primaryBtnText: { color: '#061018', fontWeight: '900' },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#0f172a',
  },
  secondaryBtnText: { color: '#94a3b8', fontWeight: '800' },
  card: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 20,
    borderRadius: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scanBtn: {
    backgroundColor: '#0891b2',
    flexDirection: 'row',
    padding: 18,
    borderRadius: 30,
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
  },
  emptyText: { color: '#64748b', textAlign: 'center', marginTop: 26, fontWeight: '700' },
});

