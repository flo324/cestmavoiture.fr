import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useMemo, useState } from 'react';
import { Car, CreditCard, FileText, FileWarning, IdCard, Plus, ShieldCheck, Wrench } from 'lucide-react-native';
import { ActivityIndicator, Alert, FlatList, ImageBackground, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UI_THEME } from '../../constants/uiTheme';
import { normalizeDocumentCapture } from '../../services/documentScan';
import { scanDocumentWithFallback } from '../../services/nativeDocumentScanner';
import { userGetItem, userSetItem, userRemoveItem } from '../../services/userStorage';

type DocFolder = {
  id: string;
  titre: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  route?: '/scan_permis' | '/scan_cg';
  type: string;
  photoUri?: string;
  isDefault?: boolean;
  isBilan?: boolean;
  createdAt?: number;
  updatedAt?: number;
};

const STORAGE_KEY = '@cestmavoiture_docs_v1';
const BILAN_KEY = '@cestmavoiture_bilan_last_v1';
const BILAN_META_KEY = '@cestmavoiture_bilan_meta_v1';
const USER_KEY = '@cestmavoiture_user_v2';
const KM_KEY = '@kilometrage_save';
const CT_KEY = '@ma_voiture_ct_folders_v2';
const ENTRETIEN_KEY = '@ma_voiture_entretien_modules_v1';

const defaultFolders: DocFolder[] = [
  {
    id: 'permis',
    titre: 'PERMIS',
    subtitle: 'Dossier permis de conduire',
    icon: 'card-account-details-outline',
    route: '/scan_permis',
    type: 'Permis',
    isDefault: true,
  },
  {
    id: 'carte-grise',
    titre: 'CARTE GRISE',
    subtitle: 'Dossier véhicule',
    icon: 'file-document-outline',
    route: '/scan_cg',
    type: 'Carte Grise',
    isDefault: true,
  },
  {
    id: 'bilan-vehicule',
    titre: 'BILAN DU VEHICULE',
    subtitle: 'Synthese officielle pour la vente',
    icon: 'file-document-edit-outline',
    type: 'Bilan',
    isDefault: true,
    isBilan: true,
  },
];

const DOC_TYPES = ['Permis', 'Carte Grise', 'Assurance', 'CT', 'Facture', 'Autre'];

function getIconByType(type: string): keyof typeof MaterialCommunityIcons.glyphMap {
  switch (type) {
    case 'Permis':
      return 'card-account-details-outline';
    case 'Carte Grise':
      return 'file-document-outline';
    case 'Assurance':
      return 'shield-car';
    case 'CT':
      return 'car-wrench';
    case 'Facture':
      return 'receipt-text-outline';
    default:
      return 'folder-outline';
  }
}

function renderDocIcon(type: string) {
  const common = { size: 22, strokeWidth: 1.9, color: '#a7f3d0' };
  switch (type) {
    case 'Permis':
      return <IdCard {...common} />;
    case 'Carte Grise':
      return <FileText {...common} />;
    case 'Assurance':
      return <ShieldCheck {...common} />;
    case 'CT':
      return <Wrench {...common} />;
    case 'Facture':
      return <CreditCard {...common} />;
    case 'Bilan':
      return <FileWarning {...common} />;
    default:
      return <Car {...common} />;
  }
}

export default function DocsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    imageCaptured?: string;
    imageCapturedBase64?: string;
    fromGlobalScan?: string;
  }>();
  const [folders, setFolders] = useState<DocFolder[]>(defaultFolders);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedType, setSelectedType] = useState('Permis');
  const [customName, setCustomName] = useState('');
  const [photoUri, setPhotoUri] = useState('');
  const [isHydrated, setIsHydrated] = useState(false);
  const [bilanVisible, setBilanVisible] = useState(false);
  const [bilanLoading, setBilanLoading] = useState(false);
  const [bilanText, setBilanText] = useState('');
  const [sellerNom, setSellerNom] = useState('');
  const [sellerContact, setSellerContact] = useState('');
  const [sellerVille, setSellerVille] = useState('');
  const [entryModal, setEntryModal] = useState<null | 'permis' | 'carte-grise'>(null);
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

  const callGeminiForBilan = async (payload: Record<string, unknown>) => {
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) return '';
    const prompt = [
      'Tu es un expert automobile.',
      'Redige un bilan clair, professionnel et vendable du vehicule.',
      'Ton style: officiel, concis, transparent.',
      'Sections obligatoires: Identite vehicule, Etat administratif, Entretiens realises, Travaux a prevoir, Diagnostic global.',
      'Donne un texte brut (pas de JSON).',
      `Donnees: ${JSON.stringify(payload)}`,
    ].join('\n');
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2 },
        }),
      }
    );
    if (!response.ok) return '';
    const json = await response.json();
    return String(json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
  };

  const buildFallbackBilan = (data: {
    modele: string;
    immat: string;
    annee: string;
    dateImmat: string;
    km: string;
    entretiens: string[];
    aPrevoir: string[];
  }) => {
    const lines = [
      `BILAN OFFICIEL DU VEHICULE`,
      ``,
      `Identite vehicule`,
      `- Modele: ${data.modele || '-'}`,
      `- Immatriculation: ${data.immat || '-'}`,
      `- Annee: ${data.annee || '-'}`,
      `- Date d'immatriculation: ${data.dateImmat || '-'}`,
      `- Kilometrage actuel: ${data.km || '0'} km`,
      ``,
      `Entretiens realises / informations disponibles`,
      ...(data.entretiens.length ? data.entretiens.map((x) => `- ${x}`) : ['- Donnees non renseignees']),
      ``,
      `Ce qu'il reste a prevoir`,
      ...(data.aPrevoir.length ? data.aPrevoir.map((x) => `- ${x}`) : ['- Aucun point critique signale']),
      ``,
      `Synthese`,
      `Vehicule exploitable avec suivi documentaire centralise. Bilan genere automatiquement, a completer avec factures et preuves d'entretien pour la vente.`,
    ];
    return lines.join('\n');
  };

  const loadAndGenerateBilan = async () => {
    try {
      setBilanLoading(true);
      const [rawUser, rawKm, rawCt, rawEntretien, savedBilan] = await Promise.all([
        userGetItem(USER_KEY),
        userGetItem(KM_KEY),
        userGetItem(CT_KEY),
        userGetItem(ENTRETIEN_KEY),
        userGetItem(BILAN_KEY),
      ]);

      const user = rawUser ? JSON.parse(rawUser) : {};
      const ct = rawCt ? JSON.parse(rawCt) : [];
      const entretien = rawEntretien ? JSON.parse(rawEntretien) : {};
      const latestCt = Array.isArray(ct) && ct.length ? ct[0] : null;

      const baseData = {
        modele: String(user?.modele ?? ''),
        immat: String(user?.immat ?? ''),
        annee: String(user?.annee ?? ''),
        dateImmat: String(user?.dateImmat ?? ''),
        km: String(rawKm ?? '0').replace(/[^\d]/g, ''),
        entretiens: [
          latestCt?.info?.dateCt ? `Dernier CT: ${latestCt.info.dateCt}` : '',
          latestCt?.info?.resultat ? `Resultat CT: ${latestCt.info.resultat}` : '',
          entretien?.pneus?.dateAchat ? `Pneus: remplaces le ${entretien.pneus.dateAchat}` : '',
          entretien?.batterie?.dateAchat ? `Batterie: achetee le ${entretien.batterie.dateAchat}` : '',
          entretien?.phares?.ampoule ? `Phares: ${entretien.phares.ampoule}` : '',
        ].filter(Boolean),
        aPrevoir: [
          latestCt?.info?.defauts || '',
          latestCt?.info?.reparations || '',
          entretien?.pneus?.aiWarning || '',
          entretien?.batterie?.aiWarning || '',
        ].filter(Boolean),
      };

      const aiText = await callGeminiForBilan(baseData);
      const finalText = aiText || buildFallbackBilan(baseData);
      setBilanText(finalText);
      await userSetItem(BILAN_KEY, finalText);

      if (!aiText && savedBilan && !finalText.trim()) {
        setBilanText(savedBilan);
      }
    } catch (error) {
      console.log('[Docs] bilan generation failed', error);
      Alert.alert('Erreur', 'Impossible de generer le bilan du vehicule.');
    } finally {
      setBilanLoading(false);
    }
  };

  const exportBilanPdf = async () => {
    try {
      if (!bilanText.trim()) {
        Alert.alert('Information', 'Generez un bilan avant export.');
        return;
      }
      const safeText = bilanText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>');
      const today = new Date();
      const dateEdition = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
      const html = `
      <html>
        <body style="font-family: Arial, sans-serif; padding: 26px; color: #0f172a;">
          <div style="border:1px solid #d1d5db; border-radius:10px; padding:16px; margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div>
                <h2 style="margin:0; font-size:20px;">BILAN OFFICIEL DU VEHICULE</h2>
                <div style="margin-top:6px; font-size:12px; color:#334155;">Document de synthese pour cession / vente</div>
              </div>
              <div style="text-align:right; font-size:12px; color:#334155;">
                <div><strong>Date d'edition:</strong> ${dateEdition}</div>
                <div><strong>Reference:</strong> BILAN-${today.getFullYear()}-${today.getTime()}</div>
              </div>
            </div>
          </div>

          <div style="border:1px solid #e5e7eb; border-radius:10px; padding:14px; margin-bottom:14px;">
            <h3 style="margin:0 0 10px 0; font-size:14px;">Informations vendeur</h3>
            <div style="font-size:12px; line-height:1.6;">
              <div><strong>Nom:</strong> ${sellerNom || '-'}</div>
              <div><strong>Contact:</strong> ${sellerContact || '-'}</div>
              <div><strong>Ville:</strong> ${sellerVille || '-'}</div>
            </div>
          </div>

          <div style="border:1px solid #e5e7eb; border-radius:10px; padding:14px;">
            <h3 style="margin:0 0 10px 0; font-size:14px;">Synthese technique du vehicule</h3>
            <div style="font-size:12px; line-height:1.55;">${safeText}</div>
          </div>

          <div style="margin-top:26px; display:flex; justify-content:space-between; gap:20px;">
            <div style="flex:1; border-top:1px solid #9ca3af; padding-top:8px; font-size:11px; color:#334155;">Signature vendeur</div>
            <div style="flex:1; border-top:1px solid #9ca3af; padding-top:8px; font-size:11px; color:#334155;">Signature acquereur</div>
          </div>
        </body>
      </html>`;
      const file = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'Exporter le bilan' });
      } else {
        Alert.alert('PDF cree', `Fichier: ${file.uri}`);
      }
    } catch (error) {
      console.log('[Docs] export PDF failed', error);
      Alert.alert('Erreur', "Impossible d'exporter le bilan.");
    }
  };

  const confirmDeleteBilan = () => {
    Alert.alert(
      'Supprimer le bilan ?',
      'Êtes-vous sûr de vouloir supprimer définitivement ce document bilan ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await Promise.all([userRemoveItem(BILAN_KEY), userRemoveItem(BILAN_META_KEY)]);
              setBilanText('');
              setSellerNom('');
              setSellerContact('');
              setSellerVille('');
              Alert.alert('Supprimé', 'Le bilan du véhicule a été supprimé.');
            } catch (error) {
              console.log('[Docs] delete bilan failed', error);
              Alert.alert('Erreur', 'Impossible de supprimer le bilan.');
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    const loadFolders = async () => {
      try {
        const raw = await userGetItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as DocFolder[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            const hasPermis = parsed.some((f) => f.id === 'permis');
            const hasCg = parsed.some((f) => f.id === 'carte-grise');
            const hasBilan = parsed.some((f) => f.id === 'bilan-vehicule');
            const merged = [...parsed];
            if (!hasPermis) merged.unshift(defaultFolders[0]);
            if (!hasCg) merged.splice(1, 0, defaultFolders[1]);
            if (!hasBilan) merged.splice(2, 0, defaultFolders[2]);
            setFolders(merged);
          }
        }
      } catch (error) {
        console.log('[Docs] load folders failed', error);
      } finally {
        setIsHydrated(true);
      }
    };
    loadFolders();
  }, []);

  useEffect(() => {
    const loadMeta = async () => {
      try {
        const raw = await userGetItem(BILAN_META_KEY);
        if (!raw) return;
        const meta = JSON.parse(raw);
        setSellerNom(String(meta?.sellerNom ?? ''));
        setSellerContact(String(meta?.sellerContact ?? ''));
        setSellerVille(String(meta?.sellerVille ?? ''));
      } catch (error) {
        console.log('[Docs] load bilan meta failed', error);
      }
    };
    loadMeta().catch(() => {});
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    userSetItem(STORAGE_KEY, JSON.stringify(folders)).catch((error) => {
      console.log('[Docs] save folders failed', error);
    });
  }, [folders, isHydrated]);

  const resetModal = () => {
    setSelectedType('Permis');
    setCustomName('');
    setPhotoUri('');
    setModalVisible(false);
  };

  const openImagePicker = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const openCamera = async () => {
    const uriScanned = await scanDocumentWithFallback();
    if (!uriScanned) {
      Alert.alert('Permission requise', 'Autorisez la camera pour continuer.');
      return;
    }
    if (uriScanned) {
      const normalized = await normalizeDocumentCapture(uriScanned, {
        quality: 0.94,
        smartDocument: true,
        autoCropA4: true,
      });
      setPhotoUri(normalized.uri);
    }
  };

  const handleAddDocument = () => {
    const title = customName.trim() || selectedType.toUpperCase();
    const subtitle = customName.trim() ? `${selectedType} personnalisé` : `${selectedType} enregistré`;
    const nowTs = Date.now();
    const newDoc: DocFolder = {
      id: `doc-${Date.now()}`,
      titre: title,
      subtitle,
      icon: getIconByType(selectedType),
      type: selectedType,
      photoUri,
      isDefault: false,
      createdAt: nowTs,
      updatedAt: nowTs,
    };
    setFolders((prev) => [...prev, newDoc]);
    resetModal();
  };

  const openFolder = (item: DocFolder) => {
    if (item.isBilan) {
      setBilanVisible(true);
      loadAndGenerateBilan().catch(() => {});
      return;
    }
    if (item.route) {
      if (item.id === 'permis' || item.id === 'carte-grise') {
        setEntryModal(item.id);
        return;
      }
      router.push({
        pathname: item.route,
        params: {
          imageCaptured: (params.imageCaptured as string) || '',
          imageCapturedBase64: (params.imageCapturedBase64 as string) || '',
          fromGlobalScan: (params.fromGlobalScan as string) || '',
        },
      });
      return;
    }
    router.push({
      pathname: '/doc_detail' as any,
      params: { id: item.id },
    });
  };

  const footer = useMemo(
    () => (
      <Pressable onPress={() => setModalVisible(true)} style={({ pressed }) => [styles.addBtnWrap, pressed && styles.scaleDown]}>
        <LinearGradient
          colors={['#05080d', '#0d1b12']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.addBtn}
        >
          <Plus size={18} color="#86efac" strokeWidth={2.2} />
          <Text style={styles.addBtnText}>Nouveau Document</Text>
        </LinearGradient>
      </Pressable>
    ),
    []
  );

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
      <ImageBackground
        source={{ uri: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1600&q=70' }}
        style={styles.heroBanner}
        imageStyle={styles.heroBannerImage}
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.18)', 'rgba(0,0,0,0.72)', '#0b0f14']}
          locations={[0, 0.56, 1]}
          style={styles.heroOverlay}
        >
          <Text style={styles.heroTitle}>Documents juridiques</Text>
          <Text style={styles.heroSub}>Centralisez, vérifiez et accédez à vos dossiers en un clic</Text>
        </LinearGradient>
      </ImageBackground>

      <FlatList
        data={folders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20 }}
        ListFooterComponent={footer}
        renderItem={({ item }) => (
          <Pressable style={({ pressed }) => [styles.folderCard, pressed && styles.scaleDown]} onPress={() => openFolder(item)}>
            <View style={styles.folderTopRow}>
              <View style={styles.iconChip}>{renderDocIcon(item.type)}</View>
              <View style={{ marginLeft: 15, flex: 1 }}>
                <Text style={styles.folderTitle}>{item.titre}</Text>
                <Text style={styles.folderSubtitle}>{item.subtitle}</Text>
                {!item.isDefault ? (
                  <>
                    <Text style={styles.folderMeta}>Créé le: {formatDateTime(item.createdAt)}</Text>
                    <Text style={styles.folderMeta}>Modifié le: {formatDateTime(item.updatedAt || item.createdAt)}</Text>
                  </>
                ) : null}
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#86efac" />
            </View>
          </Pressable>
        )}
      />
 
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={resetModal}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nouveau document</Text>

            <Text style={styles.modalLabel}>Type de document</Text>
            <View style={styles.typeWrap}>
              {DOC_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeChip, selectedType === type && styles.typeChipActive]}
                  onPress={() => setSelectedType(type)}
                >
                  <Text style={[styles.typeChipText, selectedType === type && styles.typeChipTextActive]}>{type}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>Nom personnalisé</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Assurance MAIF 2026"
              placeholderTextColor="#8a8f95"
              value={customName}
              onChangeText={setCustomName}
            />

            <Text style={styles.modalLabel}>Photo</Text>
            <View style={styles.photoActions}>
              <Pressable onPress={openCamera} style={({ pressed }) => [styles.photoBtn, pressed && styles.scaleDown]}>
                <Text style={styles.photoBtnText}>Prendre une photo</Text>
              </Pressable>
              <Pressable onPress={openImagePicker} style={({ pressed }) => [styles.photoBtn, pressed && styles.scaleDown]}>
                <Text style={styles.photoBtnText}>Choisir</Text>
              </Pressable>
              <Pressable onPress={() => setPhotoUri('')} style={({ pressed }) => [styles.skipBtn, pressed && styles.scaleDown]}>
                <Text style={styles.skipBtnText}>Passer</Text>
              </Pressable>
            </View>
            {photoUri ? <Text style={styles.photoInfo}>Photo selectionnee</Text> : null}

            <View style={styles.modalActions}>
              <Pressable onPress={resetModal} style={({ pressed }) => [styles.cancelBtn, pressed && styles.scaleDown]}>
                <Text style={styles.cancelBtnText}>Annuler</Text>
              </Pressable>
              <Pressable onPress={handleAddDocument} style={({ pressed }) => [styles.saveBtn, pressed && styles.scaleDown]}>
                <Text style={styles.saveBtnText}>Valider</Text>
              </Pressable>
            </View>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={entryModal != null} transparent animationType="fade" onRequestClose={() => setEntryModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {entryModal === 'permis' ? 'Permis de conduire' : 'Carte grise'}
            </Text>
            <Pressable
              onPress={() => {
                const pathname = entryModal === 'permis' ? '/scan_permis' : '/scan_cg';
                setEntryModal(null);
                router.push({ pathname: pathname as any, params: { flow: 'create' } });
              }}
              style={({ pressed }) => [styles.entryChoiceBtn, pressed && styles.scaleDown]}
            >
              <Text style={styles.entryChoiceText}>
                {entryModal === 'permis' ? 'Créer nouveau permis' : 'Créer nouvelle carte grise'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const pathname = entryModal === 'permis' ? '/scan_permis' : '/scan_cg';
                setEntryModal(null);
                router.push({ pathname: pathname as any, params: { flow: 'view' } });
              }}
              style={({ pressed }) => [styles.entryChoiceBtn, { marginTop: 10 }, pressed && styles.scaleDown]}
            >
              <Text style={styles.entryChoiceText}>
                {entryModal === 'permis' ? 'Accéder à mon permis' : 'Accéder à ma carte grise'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setEntryModal(null)} style={({ pressed }) => [styles.cancelBtn, pressed && styles.scaleDown]}>
              <Text style={styles.cancelBtnText}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={bilanVisible} animationType="slide" onRequestClose={() => setBilanVisible(false)}>
        <KeyboardAvoidingView style={styles.bilanContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <SafeAreaView style={styles.bilanContainer}>
          <View style={styles.bilanHeader}>
            <TouchableOpacity onPress={() => setBilanVisible(false)}>
              <MaterialCommunityIcons name="arrow-left" size={24} color="#00F2FF" />
            </TouchableOpacity>
            <Text style={styles.bilanTitle}>Bilan du vehicule</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.bilanCard}>
            {bilanLoading ? (
              <View style={styles.loaderWrap}>
                <ActivityIndicator size="large" color="#22c55e" />
                <Text style={styles.loaderText}>Generation de la synthese en cours...</Text>
              </View>
            ) : (
              <TextInput
                style={styles.bilanInput}
                multiline
                textAlignVertical="top"
                value={bilanText}
                onChangeText={setBilanText}
                placeholder="Le bilan apparaitra ici..."
                placeholderTextColor="#94a3b8"
              />
            )}
          </View>

          <View style={styles.bilanActions}>
            <Pressable
              onPress={async () => {
                await Promise.all([
                  userSetItem(BILAN_KEY, bilanText),
                  userSetItem(
                    BILAN_META_KEY,
                    JSON.stringify({
                      sellerNom,
                      sellerContact,
                      sellerVille,
                    })
                  ),
                ]);
                Alert.alert('Succes', 'Bilan enregistre.');
              }}
              style={({ pressed }) => [styles.bilanBtnSecondary, pressed && styles.scaleDown]}
            >
              <Text style={styles.bilanBtnSecondaryText}>Enregistrer</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.bilanBtnPrimary, pressed && styles.scaleDown]}
              onPress={exportBilanPdf}
            >
              <Text style={styles.bilanBtnPrimaryText}>Telecharger PDF</Text>
            </Pressable>
          </View>

          <Pressable style={({ pressed }) => [styles.bilanDeleteBtn, pressed && styles.scaleDown]} onPress={confirmDeleteBilan}>
            <MaterialCommunityIcons name="delete-outline" size={20} color="#C53030" />
            <Text style={styles.bilanDeleteText}>Supprimer ce document</Text>
          </Pressable>

          <View style={styles.bilanSellerCard}>
            <Text style={styles.bilanSellerTitle}>Format pro - bloc vendeur</Text>
            <TextInput
              style={styles.bilanMetaInput}
              placeholder="Nom et prenom du vendeur"
              placeholderTextColor="#94a3b8"
              value={sellerNom}
              onChangeText={setSellerNom}
            />
            <TextInput
              style={styles.bilanMetaInput}
              placeholder="Contact (tel ou e-mail)"
              placeholderTextColor="#94a3b8"
              value={sellerContact}
              onChangeText={setSellerContact}
            />
            <TextInput
              style={styles.bilanMetaInput}
              placeholder="Ville"
              placeholderTextColor="#94a3b8"
              value={sellerVille}
              onChangeText={setSellerVille}
            />
          </View>
        </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_THEME.bg },
  header: {
    backgroundColor: '#0b0f14',
    padding: 20,
    paddingTop: 40,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: UI_THEME.textSecondary },
  heroBanner: {
    marginHorizontal: 18,
    height: 124,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: UI_THEME.cyanBorder,
  },
  heroBannerImage: { resizeMode: 'cover' },
  heroOverlay: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 14, paddingBottom: 12 },
  heroTitle: { color: UI_THEME.textPrimary, fontSize: 17, fontWeight: '800' },
  heroSub: { color: UI_THEME.textMuted, fontSize: 11, marginTop: 3 },
  folderCard: {
    backgroundColor: UI_THEME.glass,
    borderWidth: 0.5,
    borderColor: UI_THEME.cyanBorder,
    padding: 20,
    borderRadius: 20,
    marginBottom: 12,
  },
  scaleDown: { transform: [{ scale: 0.98 }] },
  folderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconChip: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: UI_THEME.goldBorder,
  },
  folderTitle: { color: UI_THEME.textPrimary, fontWeight: '800', fontSize: 14 },
  folderSubtitle: { color: UI_THEME.textMuted, fontSize: 11, marginTop: 2 },
  folderMeta: { color: '#7f93ab', fontSize: 10, marginTop: 2 },
  addBtnWrap: { marginTop: 10 },
  addBtn: {
    marginTop: 10,
    backgroundColor: '#101918',
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 0.5,
    borderColor: UI_THEME.neonGreen,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  addBtnText: {
    color: '#dcfce7',
    fontSize: 14,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: UI_THEME.glassStrong,
    borderRadius: 18,
    padding: 16,
    borderWidth: 0.5,
    borderColor: UI_THEME.cyanBorder,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  modalLabel: {
    color: '#d1d5db',
    fontSize: 12,
    marginBottom: 6,
    marginTop: 8,
  },
  typeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    borderWidth: 0.5,
    borderColor: '#475569',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  typeChipActive: {
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  typeChipText: {
    color: '#e2e8f0',
    fontSize: 12,
  },
  typeChipTextActive: {
    color: '#22c55e',
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#0f172a',
    color: '#fff',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  photoActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  photoBtn: {
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 0.5,
    borderColor: 'rgba(0,242,255,0.35)',
  },
  photoBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  entryChoiceBtn: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryChoiceText: {
    color: '#e2e8f0',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  skipBtn: {
    borderWidth: 1,
    borderColor: '#64748b',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  skipBtnText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  photoInfo: {
    marginTop: 8,
    color: '#86efac',
    fontSize: 12,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 14,
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  cancelBtnText: {
    color: '#cbd5e1',
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderWidth: 0.5,
    borderColor: 'rgba(134,239,172,0.8)',
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  bilanContainer: { flex: 1, backgroundColor: '#0b0f14', paddingHorizontal: 16, paddingTop: 20 },
  bilanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  bilanTitle: { fontSize: 22, fontWeight: '800', color: '#e2e8f0' },
  bilanCard: {
    flex: 1,
    backgroundColor: 'rgba(7,10,16,0.78)',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(0,242,255,0.4)',
    padding: 12,
  },
  bilanInput: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 13,
    lineHeight: 20,
  },
  bilanActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    marginBottom: 8,
  },
  bilanBtnSecondary: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(148,163,184,0.8)',
  },
  bilanBtnSecondaryText: { color: '#fff', fontWeight: '700' },
  bilanBtnPrimary: {
    flex: 1,
    backgroundColor: '#0f2a1a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(34,197,94,0.9)',
  },
  bilanBtnPrimaryText: { color: '#fff', fontWeight: '800' },
  bilanDeleteBtn: {
    marginTop: 8,
    borderWidth: 0.5,
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  bilanDeleteText: {
    color: '#C53030',
    fontWeight: '700',
    fontSize: 12,
  },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loaderText: { marginTop: 10, color: '#94a3b8', fontSize: 12 },
  bilanSellerCard: {
    marginTop: 10,
    backgroundColor: 'rgba(7,10,16,0.75)',
    borderWidth: 0.5,
    borderColor: 'rgba(212,175,55,0.45)',
    borderRadius: 12,
    padding: 10,
  },
  bilanSellerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#e2e8f0',
    marginBottom: 8,
  },
  bilanMetaInput: {
    backgroundColor: '#0f172a',
    borderWidth: 0.5,
    borderColor: '#475569',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: '#e2e8f0',
    marginBottom: 8,
  },
});