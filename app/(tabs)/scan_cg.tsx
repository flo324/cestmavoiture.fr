import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Trash2 } from 'lucide-react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, Easing, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddressAutocompleteInput } from '../../components/AddressAutocompleteInput';
import { UI_THEME } from '../../constants/uiTheme';
import { normalizeDocumentCapture } from '../../services/documentScan';
import { scanDocumentWithFallback } from '../../services/nativeDocumentScanner';
import { userGetItem, userRemoveItem, userSetItem } from '../../services/userStorage';

export default function ScanCG() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const allowLeaveRef = useRef(false);
  const goDocs = () => {
    allowLeaveRef.current = true;
    router.replace('/docs');
  };
  const STORAGE_KEY_CG = '@ma_voiture_cg_data_complete';
  const params = useLocalSearchParams<{
    imageUri?: string;
    imageCaptured?: string;
    fromGlobalScan?: string;
    nom?: string;
    adresse?: string;
    immatriculation?: string;
    vin?: string;
    puissanceFiscale?: string;
    modeleVehicule?: string;
    flow?: string;
  }>();
  const flowMode = typeof params.flow === 'string' ? params.flow : 'view';

  const [imageUri, setImageUri] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [nom, setNom] = useState('');
  const [adresse, setAdresse] = useState('');
  const [immatriculation, setImmatriculation] = useState('');
  const [vin, setVin] = useState('');
  const [puissanceFiscale, setPuissanceFiscale] = useState('');
  const [modeleVehicule, setModeleVehicule] = useState('');
  const [flow, setFlow] = useState<'create' | 'view'>(flowMode === 'create' ? 'create' : 'view');
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);
  const [hasSavedDossier, setHasSavedDossier] = useState(false);
  const [createdAt, setCreatedAt] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const currentStep = flow === 'create' ? createStep : hasSavedDossier ? 3 : 1;
  const stepAnimOpacity = useRef(new Animated.Value(1)).current;
  const stepAnimTranslateX = useRef(new Animated.Value(0)).current;
  const transitionKey = `${flow}-${flow === 'create' ? createStep : hasSavedDossier ? 'saved' : 'empty'}`;
  const prevTransitionKeyRef = useRef(transitionKey);
  const resetCreateForm = () => {
    setImageUri('');
    setNom('');
    setAdresse('');
    setImmatriculation('');
    setVin('');
    setPuissanceFiscale('');
    setModeleVehicule('');
    setCreatedAt('');
    setUpdatedAt('');
    setCreateStep(1);
  };
  const formatNow = () =>
    new Date().toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  useEffect(() => {
    const loadStored = async () => {
      if (flowMode === 'create') {
        resetCreateForm();
        setHasSavedDossier(false);
        return;
      }
      const raw = await userGetItem(STORAGE_KEY_CG);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { image?: string; info?: Record<string, string>; meta?: Record<string, string> };
      setImageUri(parsed.image || '');
      setNom(parsed.info?.nom || '');
      setAdresse(parsed.info?.adresse || '');
      setImmatriculation(parsed.info?.immat || '');
      setVin(parsed.info?.vin || '');
      setPuissanceFiscale(parsed.info?.puissance || '');
      setModeleVehicule(parsed.info?.modeleVehicule || '');
      setCreatedAt(parsed.meta?.createdAt || '');
      setUpdatedAt(parsed.meta?.updatedAt || '');
      setHasSavedDossier(Boolean(parsed.image || parsed.info?.immat || parsed.info?.vin));
    };
    loadStored();
  }, []);

  useEffect(() => {
    const saveIncomingScan = async () => {
      const incomingUri = typeof params.imageCaptured === 'string' ? params.imageCaptured : '';
      const fromGlobal = typeof params.fromGlobalScan === 'string' ? params.fromGlobalScan : '';
      console.log('[scan_cg] incoming params', {
        hasUri: !!incomingUri,
        fromGlobal,
      });
      if (!incomingUri || fromGlobal !== '1') return;
      const existingRaw = await userGetItem(STORAGE_KEY_CG);
      const existing = existingRaw ? (JSON.parse(existingRaw) as { meta?: Record<string, string> }) : null;
      const now = formatNow();

      // Affiche et sauvegarde la photo immédiatement, sans IA.
      setImageUri(incomingUri);
      await userSetItem(
        STORAGE_KEY_CG,
        JSON.stringify({
          image: incomingUri,
          info: {
            nom: nom || '',
            adresse: adresse || '',
            immat: immatriculation || '',
            vin: vin || '',
            puissance: puissanceFiscale || '',
            modeleVehicule: modeleVehicule || '',
          },
          meta: {
            createdAt: existing?.meta?.createdAt || now,
            updatedAt: now,
          },
        })
      );
      setCreatedAt(existing?.meta?.createdAt || now);
      setUpdatedAt(now);
      console.log('[scan_cg] saved to storage', { key: STORAGE_KEY_CG, uri: incomingUri });
    };
    saveIncomingScan().catch(() => {});
  }, [params.imageCaptured, params.fromGlobalScan, nom, adresse, immatriculation, vin, puissanceFiscale, modeleVehicule]);

  useEffect(() => {
    if (typeof params.imageUri === 'string') setImageUri(params.imageUri);
    if (typeof params.nom === 'string') setNom(params.nom);
    if (typeof params.adresse === 'string') setAdresse(params.adresse);
    if (typeof params.immatriculation === 'string') setImmatriculation(params.immatriculation);
    if (typeof params.vin === 'string') setVin(params.vin);
    if (typeof params.puissanceFiscale === 'string') setPuissanceFiscale(params.puissanceFiscale);
    if (typeof params.modeleVehicule === 'string') setModeleVehicule(params.modeleVehicule);
  }, [params]);

  const handleScanCg = async () => {
    const uriScanned = await scanDocumentWithFallback();
    if (!uriScanned) {
      Alert.alert('Permission requise', 'Autorisez la camera pour continuer.');
      return;
    }
    const normalized = await normalizeDocumentCapture(uriScanned, {
      quality: 0.94,
      smartDocument: true,
      autoCropA4: true,
    });
    setImageUri(normalized.uri);
    setCreateStep(2);
  };

  useFocusEffect(
    React.useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (flow === 'create' && createStep > 1) {
          setCreateStep((s) => (Math.max(1, s - 1) as 1 | 2 | 3));
          return true;
        }
        goDocs();
        return true;
      });
      return () => sub.remove();
    }, [flow, createStep])
  );

  useEffect(() => {
    if (prevTransitionKeyRef.current === transitionKey) return;
    prevTransitionKeyRef.current = transitionKey;

    stepAnimOpacity.setValue(0);
    stepAnimTranslateX.setValue(16);
    Animated.parallel([
      Animated.timing(stepAnimOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(stepAnimTranslateX, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [transitionKey, stepAnimOpacity, stepAnimTranslateX]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current) return;
      event.preventDefault();
      goDocs();
    });
    return unsubscribe;
  }, [navigation]);

  const saveNow = async () => {
    try {
      if (!imageUri) {
        Alert.alert('Scan requis', 'Commencez par scanner votre carte grise.');
        return;
      }
      await userSetItem(
        STORAGE_KEY_CG,
        JSON.stringify({
          image: imageUri || '',
          info: {
            nom: nom || '',
            adresse: adresse || '',
            immat: immatriculation || '',
            vin: vin || '',
            puissance: puissanceFiscale || '',
            modeleVehicule: modeleVehicule || '',
          },
          meta: {
            createdAt: createdAt || formatNow(),
            updatedAt: formatNow(),
          },
        })
      );
      if (!createdAt) setCreatedAt(formatNow());
      setUpdatedAt(formatNow());
      setHasSavedDossier(true);
      Alert.alert('Enregistré', 'Votre dossier carte grise a bien été enregistré.', [
        { text: 'OK', onPress: goDocs },
      ]);
    } catch (error) {
      console.log('[scan_cg] manual save failed', error);
      Alert.alert('Erreur', "Impossible d'enregistrer.");
    }
  };

  const confirmDeleteFolder = () => {
    Alert.alert(
      'Supprimer le dossier ?',
      'Êtes-vous sûr de vouloir supprimer définitivement ce dossier ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await userRemoveItem(STORAGE_KEY_CG);
              setImageUri('');
              setNom('');
              setAdresse('');
              setImmatriculation('');
              setVin('');
              setPuissanceFiscale('');
              setModeleVehicule('');
              setCreatedAt('');
              setUpdatedAt('');
              setHasSavedDossier(false);
            } catch (error) {
              console.log('[scan_cg] delete failed', error);
            }
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : insets.top}
    >
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 30, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Animated.View
          style={{
            opacity: stepAnimOpacity,
            transform: [{ translateX: stepAnimTranslateX }],
          }}
        >
          <View style={styles.topBar}>
            <TouchableOpacity onPress={goDocs} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialCommunityIcons name="arrow-left" size={24} color="#00F2FF" />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <View style={styles.headerIconWrap}>
                <MaterialCommunityIcons name="file-document-outline" size={20} color="#00F2FF" />
              </View>
              <Text style={styles.title}>Carte grise</Text>
              <Text style={styles.headerSubtitle}>Fiche véhicule professionnelle</Text>
            </View>
            <View style={{ width: 24 }} />
          </View>
          <View style={styles.stepsWrap}>
            {[1, 2, 3].map((s) => (
              <View key={s} style={styles.stepItem}>
                <View style={[styles.stepDot, currentStep >= s && styles.stepDotActive]}>
                  <Text style={[styles.stepDotText, currentStep >= s && styles.stepDotTextActive]}>{s}</Text>
                </View>
                <Text style={[styles.stepLabel, currentStep >= s && styles.stepLabelActive]}>
                  {s === 1 ? 'Scanner' : s === 2 ? 'Renseigner' : 'Enregistrer'}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(currentStep / 3) * 100}%` }]} />
          </View>
          <View style={styles.stepHintCard}>
            <Text style={styles.stepHintTitle}>Étape {currentStep}</Text>
            <Text style={styles.stepHintText}>
              {flow === 'create'
                ? createStep === 1
                  ? 'Scannez votre carte grise avec l’appareil photo'
                  : createStep === 2
                    ? 'Renseignez les informations essentielles'
                    : 'Vérifiez la fiche A4 puis validez'
                : hasSavedDossier
                  ? 'Votre dossier carte grise est disponible'
                  : 'Aucune carte grise enregistrée pour le moment'}
            </Text>
          </View>

          {flow === 'create' && createStep === 1 ? (
            <View style={styles.stepScreen}>
              <Text style={styles.stepScreenTitle}>Veuillez scanner votre document</Text>
              <Text style={styles.stepScreenSub}>Touchez la zone ci-dessous pour ouvrir l&apos;appareil photo.</Text>
              {imageUri ? (
                <View style={styles.thumbWrap}>
                  <Image source={{ uri: imageUri }} style={styles.thumb} />
                  <Text style={styles.thumbText}>Scan prêt</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.cameraPlaceholder} onPress={handleScanCg} activeOpacity={0.85}>
                  <Text style={styles.placeholderText}>Scanner ma carte grise</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          {(flow === 'create' && createStep === 3) || (flow === 'view' && hasSavedDossier) ? (
            <TouchableOpacity style={[styles.thumbWrap, styles.stepScreen]} onPress={() => setModalVisible(true)}>
              <Image source={{ uri: imageUri }} style={styles.thumb} />
              <Text style={styles.thumbText}>Ouvrir en plein écran</Text>
            </TouchableOpacity>
          ) : null}
        </Animated.View>

        {flow === 'create' && createStep === 2 ? (
          <View style={[styles.infoBox, styles.stepScreen]}>
            <Text style={styles.infoTitle}>Informations essentielles</Text>
            <Text style={styles.label}>Nom / Prénom</Text>
            <TextInput style={styles.input} value={nom} onChangeText={setNom} placeholder="Optionnel" />
            <Text style={styles.label}>Adresse</Text>
            <AddressAutocompleteInput
              value={adresse}
              onChangeText={setAdresse}
              placeholder="Optionnel"
              inputStyle={styles.input}
            />
            <Text style={styles.label}>Immatriculation</Text>
            <TextInput style={styles.input} value={immatriculation} onChangeText={setImmatriculation} placeholder="Optionnel" />
            <Text style={styles.label}>Numéro VIN</Text>
            <TextInput style={styles.input} value={vin} onChangeText={setVin} placeholder="Optionnel" />
            <Text style={styles.label}>Puissance fiscale</Text>
            <TextInput style={styles.input} value={puissanceFiscale} onChangeText={setPuissanceFiscale} placeholder="Optionnel" />
            <Text style={styles.label}>Modèle du véhicule</Text>
            <TextInput style={styles.input} value={modeleVehicule} onChangeText={setModeleVehicule} placeholder="Optionnel" />
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={() =>
                Alert.alert('Valider les informations ?', 'Voulez-vous enregistrer ces informations avant de continuer ?', [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Enregistrer', onPress: () => setCreateStep(3) },
                ])
              }
              activeOpacity={0.9}
            >
              <Text style={styles.saveBtnText}>VALIDER LES INFORMATIONS</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {(flow === 'create' && createStep === 3) || (flow === 'view' && hasSavedDossier) ? (
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Aperçu fiche carte grise (format A4)</Text>
            <Text style={styles.infoLine}>Nom: {nom || '-'}</Text>
            <Text style={styles.infoLine}>Adresse: {adresse || '-'}</Text>
            <Text style={styles.infoLine}>Immatriculation: {immatriculation || '-'}</Text>
            <Text style={styles.infoLine}>VIN: {vin || '-'}</Text>
            <Text style={styles.infoLine}>Puissance fiscale: {puissanceFiscale || '-'}</Text>
            <Text style={styles.infoLine}>Modèle: {modeleVehicule || '-'}</Text>
            <Text style={styles.infoLine}>Créé le: {createdAt || '-'}</Text>
            <Text style={styles.infoLine}>Modifié le: {updatedAt || '-'}</Text>
          </View>
        ) : null}

        {flow === 'view' && !hasSavedDossier ? (
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Aucune carte grise enregistrée</Text>
            <Text style={styles.infoLine}>Vous n&apos;avez pas encore créé de dossier carte grise.</Text>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={() => {
                setFlow('create');
                resetCreateForm();
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.saveBtnText}>CRÉER NOUVELLE CARTE GRISE</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {flow === 'create' && createStep === 3 ? (
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={() =>
              Alert.alert('Confirmer l’enregistrement', 'Voulez-vous créer et enregistrer ce dossier carte grise ?', [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Enregistrer', onPress: () => void saveNow() },
              ])
            }
            activeOpacity={0.9}
          >
            <MaterialCommunityIcons name="content-save-outline" size={20} color="#00F2FF" />
            <Text style={styles.saveBtnText}>VALIDER ET CRÉER LE DOSSIER</Text>
          </TouchableOpacity>
        ) : null}

        {flow === 'view' && hasSavedDossier ? (
          <>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={() => {
                setFlow('create');
                setCreateStep(2);
              }}
              activeOpacity={0.9}
            >
              <MaterialCommunityIcons name="pencil-outline" size={20} color="#00F2FF" />
              <Text style={styles.saveBtnText}>MODIFIER LE TEXTE</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={confirmDeleteFolder} activeOpacity={0.9}>
              <Trash2 size={18} color="#f87171" />
              <Text style={styles.deleteBtnText}>SUPPRIMER DOSSIER</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
            <MaterialCommunityIcons name="close-circle" size={44} color="#fff" />
          </TouchableOpacity>
          <Image source={{ uri: imageUri }} style={styles.fullImage} resizeMode="contain" />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 54,
    backgroundColor: UI_THEME.bg,
  },
  content: {
    flex: 1,
  },
  stepScreen: {
    minHeight: 420,
    justifyContent: 'center',
  },
  stepScreenTitle: {
    color: UI_THEME.textSecondary,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  stepScreenSub: {
    color: UI_THEME.textMuted,
    textAlign: 'center',
    fontSize: 13,
    marginBottom: 18,
  },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,242,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,242,255,0.4)',
    marginBottom: 4,
  },
  stepsWrap: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, marginTop: 2 },
  stepItem: { alignItems: 'center', flex: 1 },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { borderColor: UI_THEME.cyan, backgroundColor: 'rgba(0,242,255,0.16)' },
  stepDotText: { color: '#94a3b8', fontSize: 11, fontWeight: '800' },
  stepDotTextActive: { color: '#e2e8f0' },
  stepLabel: { marginTop: 6, color: '#64748b', fontSize: 10, fontWeight: '700' },
  stepLabelActive: { color: '#94a3b8' },
  progressTrack: { height: 6, borderRadius: 999, backgroundColor: '#1f2937', marginBottom: 10, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 999, backgroundColor: UI_THEME.cyan },
  stepHintCard: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  stepHintTitle: { color: '#67e8f9', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  stepHintText: { color: '#cbd5e1', fontSize: 13, marginTop: 4, fontWeight: '700' },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: UI_THEME.textSecondary,
    textAlign: 'center',
  },
  headerSubtitle: { marginTop: 2, color: '#94a3b8', fontSize: 11, textAlign: 'center' },
  cameraPlaceholder: {
    width: '100%',
    height: 168,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#243246',
    borderStyle: 'dashed',
  },
  thumbWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#243246',
  },
  thumb: { width: '100%', height: 130 },
  thumbText: { textAlign: 'center', paddingVertical: 6, color: '#00F2FF', fontWeight: '700', fontSize: 12 },
  placeholderText: {
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  infoBox: {
    marginTop: 12,
    padding: 14,
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  infoTitle: {
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 6,
    color: '#00F2FF',
  },
  savedText: { color: '#22c55e', fontSize: 11, fontWeight: '800', marginBottom: 4 },
  infoLine: { color: '#cbd5e1', fontSize: 12, marginBottom: 6 },
  infoItem: {
    fontSize: 15,
    color: '#495057',
    marginBottom: 5
  },
  label: { marginTop: 4, marginBottom: 3, color: '#93a4b8', fontWeight: '700', fontSize: 12 },
  input: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#243246',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: '#e2e8f0',
  },
  saveBtn: {
    marginBottom: 10,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,242,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,242,255,0.4)',
    shadowColor: '#00F2FF',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  saveBtnText: { color: '#67e8f9', fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
  deleteBtn: {
    marginBottom: 24,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(197,48,48,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(197,48,48,0.35)',
  },
  deleteBtnText: {
    color: '#f87171',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  closeBtn: { position: 'absolute', top: 50, right: 20, zIndex: 2 },
  fullImage: { width: '100%', height: '85%' },
});