import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useKilometrage } from '../../context/KilometrageContext';
import { useVehicle } from '../../context/VehicleContext';
import { enhanceVehiclePhotoPremium } from '../../services/premiumVehiclePhoto';

type VehicleBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const MAX_VISION_EDGE = 1280;
const GEMINI_VISION_MODEL = 'gemini-1.5-flash';
type ProfileDraft = { prenom: string; nom: string; alias: string; modele: string; immat: string; km: string };

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function parseVehicleBox(raw: string): VehicleBox | null {
  const extracted = extractJsonObject(raw);
  if (!extracted) return null;
  const parsed = JSON.parse(extracted) as Partial<VehicleBox>;
  const x = Number(parsed?.x);
  const y = Number(parsed?.y);
  const width = Number(parsed?.width);
  const height = Number(parsed?.height);
  if (![x, y, width, height].every((v) => Number.isFinite(v))) return null;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    width: Math.max(0.04, Math.min(1, width)),
    height: Math.max(0.04, Math.min(1, height)),
  };
}

function boxArea(b: VehicleBox): number {
  return b.width * b.height;
}

/** Redimensionne pour que l’analyse IA et le recadrage utilisent exactement les mêmes pixels (évite décalage taille / orientation). */
async function normalizeImageForVision(uri: string): Promise<{ uri: string; width: number; height: number }> {
  const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
  if (!size.width || !size.height) {
    const fallback = await manipulateAsync(uri, [], { compress: 0.92, format: SaveFormat.JPEG });
    return { uri: fallback.uri, width: fallback.width, height: fallback.height };
  }
  const maxDim = Math.max(size.width, size.height);
  if (maxDim <= MAX_VISION_EDGE) {
    const out = await manipulateAsync(uri, [], { compress: 0.92, format: SaveFormat.JPEG });
    return { uri: out.uri, width: out.width, height: out.height };
  }
  const actions =
    size.width >= size.height
      ? [{ resize: { width: MAX_VISION_EDGE } }]
      : [{ resize: { height: MAX_VISION_EDGE } }];
  const out = await manipulateAsync(uri, actions, { compress: 0.92, format: SaveFormat.JPEG });
  return { uri: out.uri, width: out.width, height: out.height };
}

async function callGeminiVehicleBox(
  apiKey: string,
  base64Jpeg: string,
  prompt: string
): Promise<VehicleBox | null> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: base64Jpeg,
                },
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.05 },
      }),
    }
  );

  if (!response.ok) return null;
  const json = await response.json();
  const raw = String(json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
  try {
    return parseVehicleBox(raw);
  } catch {
    return null;
  }
}

async function detectVehicleBoxWithIA(normUri: string): Promise<VehicleBox | null> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
  if (!apiKey) return null;

  const base64Image = await FileSystem.readAsStringAsync(normUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!base64Image) return null;

  const promptTight = [
    'Tu es un modele de detection d objets.',
    'Tache: trouver UNIQUEMENT la voiture (automobile) principale dans cette image.',
    'Definis une boite englobante AXIS-ALIGNED (rectangle) SERREE autour de la carrosserie visible.',
    'Exclue au maximum: ciel, sol, batiments, personnes, arbres, autres vehicules.',
    'Coordonnees NORMALISEES entre 0 et 1 par rapport a toute l image.',
    'x,y = coin superieur gauche de la boite. width,height = largeur et hauteur de la boite.',
    'La boite doit contenir tout le vehicule principal (pare-chocs a pare-chocs si visibles).',
    'Reponds UNIQUEMENT avec ce JSON, sans markdown, sans texte autour:',
    '{"x":0.0,"y":0.0,"width":0.0,"height":0.0}',
  ].join('\n');

  let box = await callGeminiVehicleBox(apiKey, base64Image, promptTight);
  if (!box) return null;

  // Si le modele renvoie quasi toute l’image, 2e passe pour forcer un cadrage plus serre
  if (boxArea(box) > 0.88) {
    const promptRefine = [
      'La photo montre une voiture. La boite precedente est trop grande.',
      'Donne une NOUVELLE boite PLUS PETITE et PLUS SERREE, uniquement autour du vehicule (carrosserie + roues visibles).',
      'Exclure le maximum de fond. Coordonnees normalisees 0-1.',
      'Reponds UNIQUEMENT: {"x":0.0,"y":0.0,"width":0.0,"height":0.0}',
    ].join('\n');
    const refined = await callGeminiVehicleBox(apiKey, base64Image, promptRefine);
    if (refined && boxArea(refined) < boxArea(box)) {
      box = refined;
    }
  }

  return box;
}

async function cropVehicleSmart(uri: string): Promise<string> {
  try {
    const normalized = await normalizeImageForVision(uri);
    const normUri = normalized.uri;
    const size = { width: normalized.width, height: normalized.height };

    const box = await detectVehicleBoxWithIA(normUri);
    if (!size.width || !size.height) return normUri;
    if (!box) return normUri;

    const padX = Math.round(size.width * 0.02);
    const padY = Math.round(size.height * 0.02);
    const rawOriginX = Math.round(box.x * size.width) - padX;
    const rawOriginY = Math.round(box.y * size.height) - padY;
    const rawWidth = Math.round(box.width * size.width) + padX * 2;
    const rawHeight = Math.round(box.height * size.height) + padY * 2;

    const originX = Math.max(0, rawOriginX);
    const originY = Math.max(0, rawOriginY);
    const width = Math.max(48, Math.min(size.width - originX, rawWidth));
    const height = Math.max(48, Math.min(size.height - originY, rawHeight));

    const cropped = await manipulateAsync(
      normUri,
      [{ crop: { originX, originY, width, height } }],
      { compress: 0.92, format: SaveFormat.JPEG }
    );
    return cropped.uri || normUri;
  } catch (error) {
    console.log('[Profil] vehicle smart crop failed', error);
    return uri;
  }
}

export default function ProfilScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const roomy = height > 900;
  const { logout, currentLogin, deleteAccount } = useAuth();
  // 1. Gestion du Kilométrage (via le contexte pour la synchro)
  const context = useKilometrage();
  const kmValue = context ? context.km : '0';
  const updateKm = context ? context.updateKm : async () => {};

  // 2. États partagés (synchro instantanée Profil <-> Dashboard)
  const { vehicleData, setVehicleField, vehicles, activeVehicleId, selectVehicle, addVehicle, deleteVehicle } =
    useVehicle();

  const buildDraft = (): ProfileDraft => ({
    prenom: vehicleData.prenom || '',
    nom: vehicleData.nom || '',
    alias: vehicleData.alias || '',
    modele: vehicleData.modele || '',
    immat: vehicleData.immat || '',
    km: kmValue || '0',
  });
  const [draft, setDraft] = useState<ProfileDraft>(buildDraft());
  const [isPhotoProcessing, setIsPhotoProcessing] = useState(false);
  const [vehiclesModalVisible, setVehiclesModalVisible] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const sessionSlide = useState(new Animated.Value(-10))[0];
  const saveNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Charger le KM au démarrage (les infos véhicule viennent du VehicleContext)
  useEffect(() => {
    setDraft(buildDraft());
  }, [vehicleData.prenom, vehicleData.nom, vehicleData.alias, vehicleData.modele, vehicleData.immat, kmValue]);

  useEffect(() => {
    return () => {
      if (saveNoticeTimerRef.current) clearTimeout(saveNoticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!currentLogin) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sessionSlide, {
          toValue: 10,
          duration: 2600,
          useNativeDriver: true,
        }),
        Animated.timing(sessionSlide, {
          toValue: -10,
          duration: 2600,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [currentLogin, sessionSlide]);

  const showSavedNotice = () => {
    setSaveNotice('Modifications enregistrées');
    if (saveNoticeTimerRef.current) clearTimeout(saveNoticeTimerRef.current);
    saveNoticeTimerRef.current = setTimeout(() => setSaveNotice(''), 1800);
  };

  const saveDraft = async () => {
    setVehicleField('prenom', draft.prenom);
    setVehicleField('nom', draft.nom);
    setVehicleField('alias', draft.alias);
    setVehicleField('modele', draft.modele);
    setVehicleField('immat', draft.immat);
    await updateKm(draft.km);
    showSavedNotice();
  };

  const hasPendingChanges = () =>
    draft.prenom !== (vehicleData.prenom || '') ||
    draft.nom !== (vehicleData.nom || '') ||
    draft.alias !== (vehicleData.alias || '') ||
    draft.modele !== (vehicleData.modele || '') ||
    draft.immat !== (vehicleData.immat || '') ||
    draft.km !== (kmValue || '0');

  const confirmSaveIfNeeded = () => {
    if (!hasPendingChanges()) return;
    Alert.alert('Enregistrer les modifications ?', 'Voulez-vous enregistrer les changements du profil ?', [
      {
        text: 'Non',
        style: 'cancel',
        onPress: () => setDraft(buildDraft()),
      },
      {
        text: 'Oui',
        onPress: () => {
          void saveDraft();
        },
      },
    ]);
  };


  const handlePickVehiclePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      setIsPhotoProcessing(true);
      const processedUri = await cropVehicleSmart(result.assets[0].uri);
      const premium = await enhanceVehiclePhotoPremium(processedUri);
      setVehicleField('photoUri', premium.photoUri);
      setVehicleField('photoBgCenter', premium.palette.center);
      setVehicleField('photoBgEdge', premium.palette.edge);
    } catch (error) {
      console.log('[Profil] image picker failed', error);
      Alert.alert('Erreur', "Impossible d'ouvrir la galerie.");
    } finally {
      setIsPhotoProcessing(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Supprimer le compte ?',
      'Cette action est définitive : votre compte et vos données locales seront supprimés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Continuer',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirmation finale',
              'Confirmez la suppression définitive de votre compte.',
              [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Supprimer définitivement',
                  style: 'destructive',
                  onPress: async () => {
                    const result = await deleteAccount();
                    if (!result.ok) {
                      Alert.alert('Suppression impossible', result.error ?? 'Veuillez réessayer plus tard.');
                      return;
                    }
                    Alert.alert('Compte supprimé', 'Votre compte a été supprimé.');
                    router.replace('/login');
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardRoot}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? (compact ? 58 : 64) : 0}
    >
      <View style={[styles.container, compact ? styles.containerCompact : roomy ? styles.containerRoomy : null]}>
        <Text style={styles.pageTitle}>PROFIL</Text>
        {currentLogin ? (
          <Animated.View style={{ transform: [{ translateX: sessionSlide }] }}>
            <Text style={styles.sessionHint}>Connecté : {currentLogin}</Text>
          </Animated.View>
        ) : null}
        {saveNotice ? <Text style={styles.saveNotice}>{saveNotice}</Text> : null}
        <View style={[styles.card, compact ? styles.cardCompact : roomy ? styles.cardRoomy : null]}>
          <Text style={styles.sectionTitle}>INFORMATIONS PERSONNELLES</Text>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Prénom</Text>
              <TextInput
                style={styles.input}
                value={draft.prenom}
                onChangeText={(t) => setDraft((prev) => ({ ...prev, prenom: t }))}
                onBlur={confirmSaveIfNeeded}
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Nom</Text>
              <TextInput
                style={styles.input}
                value={draft.nom}
                onChangeText={(t) => setDraft((prev) => ({ ...prev, nom: t }))}
                onBlur={confirmSaveIfNeeded}
              />
            </View>
          </View>

          <View style={styles.separator} />

          <Text style={styles.sectionTitle}>VÉHICULE</Text>
          <Text style={styles.activeVehicleHint}>
            VÉHICULE ACTIF : {(vehicleData.alias || vehicleData.modele || 'NON DÉFINI').toUpperCase()}
          </Text>

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Nom du véhicule</Text>
              <TextInput
                style={styles.input}
                value={draft.alias}
                onChangeText={(t) => setDraft((prev) => ({ ...prev, alias: t }))}
                onBlur={confirmSaveIfNeeded}
                placeholder="Ex: 307"
                placeholderTextColor="#6b7b90"
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Modèle du véhicule</Text>
              <TextInput
                style={styles.input}
                value={draft.modele}
                onChangeText={(t) => setDraft((prev) => ({ ...prev, modele: t }))}
                onBlur={confirmSaveIfNeeded}
                placeholder="Ex: Peugeot 307"
                placeholderTextColor="#6b7b90"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Immatriculation</Text>
              <TextInput
                style={styles.input}
                value={draft.immat}
                onChangeText={(t) => setDraft((prev) => ({ ...prev, immat: t }))}
                onBlur={confirmSaveIfNeeded}
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Kilométrage actuel</Text>
              <TextInput
                style={styles.input}
                value={draft.km}
                onChangeText={(t) => setDraft((prev) => ({ ...prev, km: t }))}
                onBlur={confirmSaveIfNeeded}
                keyboardType="numeric"
              />
            </View>
          </View>

          <Text style={styles.label}>Photo du véhicule</Text>
          <TouchableOpacity
            style={[styles.photoPicker, compact ? styles.photoPickerCompact : roomy ? styles.photoPickerRoomy : null]}
            onPress={handlePickVehiclePhoto}
            activeOpacity={0.85}
          >
            {isPhotoProcessing ? (
              <View style={styles.photoLoaderWrap}>
                <ActivityIndicator color="#00F2FF" />
                <Text style={styles.photoPlaceholderText}>Analyse IA en cours...</Text>
              </View>
            ) : vehicleData.photoUri ? (
              <Image source={{ uri: vehicleData.photoUri }} style={styles.photoPreview} resizeMode="contain" />
            ) : (
              <Text style={styles.photoPlaceholderText}>Choisir / modifier la photo</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.switchAccountBtn, compact ? styles.btnCompact : null]} onPress={() => setVehiclesModalVisible(true)} activeOpacity={0.85}>
            <Text style={styles.switchAccountBtnText}>CHANGER DE VÉHICULE</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.logoutBtn, compact ? styles.btnCompact : null]}
            onPress={async () => {
              await logout();
              router.replace('/login');
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.logoutBtnText}>DÉCONNEXION</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.deleteAccountBtn, compact ? styles.btnCompact : null]}
            onPress={handleDeleteAccount}
            activeOpacity={0.85}
          >
            <Text style={styles.deleteAccountBtnText}>SUPPRIMER LE COMPTE</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={vehiclesModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setVehiclesModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.accountsModal}>
            <Text style={styles.accountsTitle}>MES VÉHICULES</Text>
            <ScrollView style={styles.accountsList} contentContainerStyle={{ paddingBottom: 6 }}>
              {vehicles.map((item) => {
                const label = item.modele?.trim() || 'Véhicule';
                const sub = item.immat?.trim() || 'Immatriculation non renseignée';
                const isCurrent = activeVehicleId === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.accountRow, isCurrent && styles.accountRowActive]}
                    onPress={() => {
                      selectVehicle(item.id);
                      setVehiclesModalVisible(false);
                    }}
                  >
                    <View>
                      <Text style={[styles.accountRowText, isCurrent && styles.accountRowTextActive]}>
                        {item.alias?.trim() || label}
                      </Text>
                      <Text style={styles.accountSubText}>{sub}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 10 }}>
                      {isCurrent ? <Text style={styles.accountBadge}>Actif</Text> : <Text style={styles.accountAction}>Choisir</Text>}
                      {vehicles.length > 1 ? (
                        <TouchableOpacity
                          onPress={() => {
                            Alert.alert('Supprimer le véhicule ?', 'Ce véhicule sera retiré du profil actuel.', [
                              { text: 'Annuler', style: 'cancel' },
                              { text: 'Supprimer', style: 'destructive', onPress: () => deleteVehicle(item.id) },
                            ]);
                          }}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Text style={styles.deleteVehicleText}>Suppr.</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.addAccountBtn}
              onPress={() => {
                addVehicle({
                  alias: 'Nouveau véhicule',
                  prenom: vehicleData.prenom,
                  nom: vehicleData.nom,
                });
                setVehiclesModalVisible(false);
                Alert.alert('Véhicule ajouté', 'Un nouveau véhicule a été créé. Complète ses informations dans le profil.');
              }}
            >
              <Text style={styles.addAccountBtnText}>AJOUTER UN VÉHICULE</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setVehiclesModalVisible(false)}>
              <Text style={styles.closeModalBtnText}>FERMER</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: { flex: 1, backgroundColor: '#0b0f14' },
  container: { flex: 1, backgroundColor: '#0b0f14', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12 },
  containerCompact: { paddingTop: 42, paddingBottom: 8 },
  containerRoomy: { paddingTop: 56, paddingBottom: 16 },
  pageTitle: { fontSize: 22, fontWeight: '800', color: '#e2e8f0', textAlign: 'center', marginBottom: 10 },
  sessionHint: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 12,
  },
  saveNotice: {
    alignSelf: 'center',
    marginBottom: 10,
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderColor: 'rgba(16,185,129,0.55)',
    borderWidth: 1,
    color: '#a7f3d0',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  card: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  cardCompact: { paddingHorizontal: 12, paddingVertical: 10 },
  cardRoomy: { paddingHorizontal: 16, paddingVertical: 14 },
  row: { flexDirection: 'row', columnGap: 10 },
  col: { flex: 1 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#00F2FF', marginBottom: 7, marginTop: 4 },
  activeVehicleHint: {
    color: '#67e8f9',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  label: { fontSize: 11, fontWeight: '700', color: '#94a3b8', marginBottom: 4, marginTop: 1 },
  input: {
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: '#243246',
    fontSize: 13,
  },
  photoPicker: {
    height: 132,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0b1322',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  photoPickerCompact: { height: 116, marginBottom: 7 },
  photoPickerRoomy: { height: 152, marginBottom: 10 },
  photoPreview: {
    width: '100%',
    height: '100%',
  },
  photoLoaderWrap: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  photoPlaceholderText: {
    color: '#93a4b8',
    fontSize: 12,
    fontWeight: '700',
  },
  separator: { height: 1, backgroundColor: '#1f2937', marginVertical: 10 },
  btnCompact: { paddingVertical: 10, marginTop: 8 },
  switchAccountBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,242,255,0.45)',
    backgroundColor: 'rgba(0,242,255,0.07)',
  },
  switchAccountBtnText: { color: '#67e8f9', fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
  logoutBtn: {
    marginTop: 9,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.5)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  logoutBtnText: { color: '#f87171', fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
  deleteAccountBtn: {
    marginTop: 9,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.7)',
    backgroundColor: 'rgba(220,38,38,0.15)',
  },
  deleteAccountBtnText: { color: '#fecaca', fontWeight: '900', fontSize: 13, letterSpacing: 0.3 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  accountsModal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 14,
    padding: 14,
  },
  accountsTitle: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  accountsList: { maxHeight: 280 },
  accountRow: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111827',
  },
  accountRowActive: {
    borderColor: '#06b6d4',
    backgroundColor: 'rgba(6,182,212,0.12)',
  },
  accountRowText: { color: '#e2e8f0', fontSize: 13, fontWeight: '700' },
  accountRowTextActive: { color: '#67e8f9' },
  accountSubText: { color: '#94a3b8', fontSize: 11, marginTop: 3 },
  accountBadge: {
    color: '#67e8f9',
    fontWeight: '800',
    fontSize: 11,
    borderWidth: 1,
    borderColor: '#0891b2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  accountAction: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  deleteVehicleText: { color: '#f87171', fontSize: 11, fontWeight: '700' },
  addAccountBtn: {
    marginTop: 8,
    backgroundColor: '#00E9F5',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  addAccountBtnText: { color: '#061018', fontWeight: '900', fontSize: 13, letterSpacing: 0.3 },
  closeModalBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 8 },
  closeModalBtnText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
});