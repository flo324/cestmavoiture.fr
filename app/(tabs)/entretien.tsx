import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { documentDirectory, downloadAsync, getInfoAsync } from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  ImageBackground,
  Keyboard,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKilometrage } from '../../context/KilometrageContext';
import { useVehicle } from '../../context/VehicleContext';
import { UI_THEME } from '../../constants/uiTheme';
import { normalizeDocumentCapture } from '../../services/documentScan';
import { userGetItem, userSetItem } from '../../services/userStorage';

const STORAGE_KEY_CT_FOLDERS = '@ma_voiture_ct_folders_v2';
const STORAGE_KEY_ENTRETIEN_MODULES = '@ma_voiture_entretien_modules_v1';

type CtFolder = {
  id: string;
  name: string;
  info: {
    defauts?: string;
    reparations?: string;
  };
};

type MaintenanceSuggestion = {
  title: string;
  dueAtKm: number;
  priority: 'haute' | 'moyenne' | 'faible';
  notes: string;
};

type EntretienModules = {
  pneus: {
    photoUri: string;
    largeur: string;
    hauteur: string;
    jante: string;
    charge: string;
    vitesse: string;
    dateAchat: string;
    prix: string;
    position: 'avant' | 'arriere' | 'les_deux';
    kmMontage: string;
    aiWarning: string;
    history: Array<{
      id: string;
      largeur: string;
      hauteur: string;
      jante: string;
      charge: string;
      vitesse: string;
      dateAchat: string;
      prix: string;
      kmMontage: string;
      photoUri: string;
      updatedAt: string;
    }>;
  };
  batterie: {
    photoUri: string;
    dateAchat: string;
    modele: string;
    prix: string;
    aiWarning: string;
  };
  phares: {
    photoUri: string;
    ampoule: string;
    position:
      | ''
      | 'avant_gauche'
      | 'avant_droit'
      | 'arriere_gauche'
      | 'arriere_droit'
      | 'feu_stop'
      | 'croisement'
      | 'route'
      | 'clignotants'
      | 'habitacle'
      | 'coffre'
      | 'boite_a_gants';
    commentaire: string;
  };
  modeEmploi: {
    /** URL HTTPS directe vers le PDF (jamais une page Google) */
    manualUrl: string;
    /** Fichier PDF telecharge sur l appareil (file://) */
    localPdfUri: string;
    lastSearchQuery: string;
  };
};

const defaultModules: EntretienModules = {
  pneus: {
    photoUri: '',
    largeur: '',
    hauteur: '',
    jante: '',
    charge: '',
    vitesse: '',
    dateAchat: '',
    prix: '',
    position: 'avant',
    kmMontage: '',
    aiWarning: '',
    history: [],
  },
  batterie: {
    photoUri: '',
    dateAchat: '',
    modele: '',
    prix: '',
    aiWarning: '',
  },
  phares: {
    photoUri: '',
    ampoule: '',
    position: '',
    commentaire: '',
  },
  modeEmploi: {
    manualUrl: '',
    localPdfUri: '',
    lastSearchQuery: '',
  },
};

type Panel = 'pneus' | 'batterie' | 'phares' | 'defaillances' | 'reparations' | 'mode_emploi' | null;

type PriorityTag = 'URGENT' | 'A PLANIFIER' | 'SUIVI';

function parseKmNumber(raw: unknown): number {
  const n = Number.parseInt(String(raw ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function getPanelMeta(panel: Panel): { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; subtitle: string } {
  switch (panel) {
    case 'pneus':
      return { icon: 'tire', subtitle: 'Suivi pneus, montage et usure' };
    case 'batterie':
      return { icon: 'car-battery', subtitle: 'Etat batterie et risque de panne' };
    case 'phares':
      return { icon: 'car-light-high', subtitle: 'Ampoules et positions remplacées' };
    case 'defaillances':
      return { icon: 'alert-circle-outline', subtitle: 'Points critiques synchronisés CT' };
    case 'reparations':
      return { icon: 'wrench-outline', subtitle: 'Actions à planifier et suivi' };
    case 'mode_emploi':
      return { icon: 'book-open-page-variant-outline', subtitle: 'Manuel constructeur en PDF' };
    default:
      return { icon: 'folder-outline', subtitle: '' };
  }
}

function parsePriorityItems(raw: string): { tag: PriorityTag; text: string }[] {
  const lines = String(raw ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let currentTag: PriorityTag | null = null;
  const out: { tag: PriorityTag; text: string }[] = [];

  for (const line of lines) {
    if (/^URGENT$/i.test(line)) {
      currentTag = 'URGENT';
      continue;
    }
    if (/^A PLANIFIER$/i.test(line)) {
      currentTag = 'A PLANIFIER';
      continue;
    }
    if (/^SUIVI$/i.test(line)) {
      currentTag = 'SUIVI';
      continue;
    }
    if (!line.startsWith('-')) continue;
    if (!currentTag) continue;
    out.push({ tag: currentTag, text: line.replace(/^-+\s*/, '').trim() });
  }
  return out;
}

function parseFrDateToTs(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number.parseInt(m[1], 10);
  const mo = Number.parseInt(m[2], 10) - 1;
  const y = Number.parseInt(m[3], 10);
  const dt = new Date(y, mo, d);
  return Number.isNaN(dt.getTime()) ? null : dt.getTime();
}

function estimatePneusWear(pneus: EntretienModules['pneus'], currentKm: number): string {
  const kmMontage = parseKmNumber(pneus.kmMontage);
  const delta = kmMontage > 0 ? Math.max(0, currentKm - kmMontage) : 0;
  const achatTs = parseFrDateToTs(pneus.dateAchat);
  const ageYears = achatTs ? (Date.now() - achatTs) / (1000 * 60 * 60 * 24 * 365.25) : 0;

  if (delta >= 45000 || ageYears >= 5.5) {
    return 'Usure elevee: controle immediat recommande (profondeur, craquelures, equilibrage).';
  }
  if (delta >= 30000 || ageYears >= 4) {
    return 'Usure moyenne/avancee: prevoir un remplacement prochainement.';
  }
  if (delta > 0 || ageYears > 0) {
    return 'Usure normale: surveiller la pression et l etat a chaque entretien.';
  }
  return 'Renseignez km au montage et date achat pour une estimation plus fiable.';
}

function estimateBatterieRisk(b: EntretienModules['batterie']): string {
  const achatTs = parseFrDateToTs(b.dateAchat);
  const ageYears = achatTs ? (Date.now() - achatTs) / (1000 * 60 * 60 * 24 * 365.25) : 0;
  if (ageYears >= 5) return 'Risque eleve de panne batterie: test de charge recommande rapidement.';
  if (ageYears >= 3.5) return 'Risque modere: surveiller demarrage, tension et recharge.';
  if (ageYears > 0) return 'Risque faible a modere: controle periodique conseille.';
  return 'Renseignez la date d achat pour estimer le risque de panne.';
}

async function askGeminiWarning(prompt: string): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) throw new Error('missing gemini key');

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

  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
  const json = await response.json();
  return String(json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
}

function fallbackSuggestions(currentKm: number): MaintenanceSuggestion[] {
  const rules = [
    { title: 'Vidange moteur + filtre', everyKm: 15000, priority: 'moyenne' as const },
    { title: 'Filtre a air + filtre habitacle', everyKm: 20000, priority: 'moyenne' as const },
    { title: 'Liquide de frein (controle)', everyKm: 30000, priority: 'faible' as const },
    { title: 'Bougies / allumage ou prechauffage', everyKm: 60000, priority: 'moyenne' as const },
    { title: 'Courroie / kit distribution', everyKm: 120000, priority: 'haute' as const },
  ];
  return rules.map((rule) => {
    const dueAtKm = Math.ceil(currentKm / rule.everyKm) * rule.everyKm || rule.everyKm;
    const delta = dueAtKm - currentKm;
    return {
      title: rule.title,
      dueAtKm,
      priority: rule.priority,
      notes: delta <= 1000 ? 'A planifier rapidement.' : `A prevoir dans ~${delta.toLocaleString('fr-FR')} km.`,
    };
  });
}

async function generateMaintenanceWithAI(params: {
  modele: string;
  immat: string;
  km: number;
}): Promise<{ summary: string; suggestions: MaintenanceSuggestion[] }> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    return {
      summary: 'Mode IA distant indisponible. Recommandations standards appliquees.',
      suggestions: fallbackSuggestions(params.km),
    };
  }

  const prompt = [
    'Tu es un expert entretien automobile.',
    `Vehicule: ${params.modele || 'inconnu'}`,
    `Immatriculation: ${params.immat || 'inconnue'}`,
    `Kilometrage actuel: ${params.km} km`,
    'Donne les operations a venir en te basant sur des preconisations constructeur realistes.',
    'Reponds UNIQUEMENT en JSON:',
    '{"summary":"...","suggestions":[{"title":"...","dueAtKm":123000,"priority":"haute|moyenne|faible","notes":"..."}]}',
  ].join('\n');

  const text = await askGeminiWarning(prompt);
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);
  const suggestionsRaw = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
  const suggestions: MaintenanceSuggestion[] = suggestionsRaw
    .map((s: any) => ({
      title: String(s?.title ?? '').trim(),
      dueAtKm: parseKmNumber(s?.dueAtKm),
      priority:
        s?.priority === 'haute' || s?.priority === 'moyenne' || s?.priority === 'faible'
          ? s.priority
          : 'moyenne',
      notes: String(s?.notes ?? '').trim(),
    }))
    .filter((s: MaintenanceSuggestion) => s.title.length > 0)
    .slice(0, 6);

  return {
    summary: String(parsed?.summary ?? 'Preconisations generees.'),
    suggestions: suggestions.length > 0 ? suggestions : fallbackSuggestions(params.km),
  };
}

function buildManualSearchQuery(modele: string, immat: string): string {
  const base = `${modele || ''} ${immat || ''}`.trim();
  return `${base} manuel utilisateur pdf`.trim();
}

function isDisallowedManualUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return true;
    const host = u.hostname.toLowerCase();
    if (host === 'google.com' || host.endsWith('.google.com') || host === 'google.fr' || host.endsWith('.google.fr')) {
      return true;
    }
    if (host.includes('bing.com') && u.pathname.includes('/search')) return true;
    if (host.includes('duckduckgo.com')) return true;
    if (host === 'yahoo.com' || host.endsWith('.yahoo.com')) return true;
    return false;
  } catch {
    return true;
  }
}

async function fetchDirectPdfUrlFromGemini(modele: string, immat: string): Promise<{ url: string; query: string }> {
  const query = buildManualSearchQuery(modele, immat);
  const prompt = [
    'Tu es un assistant documentation automobile.',
    `Vehicule: ${modele || 'inconnu'}`,
    `Immatriculation: ${immat || 'inconnue'}`,
    'Trouve une URL HTTPS DIRECTE vers un fichier PDF du manuel utilisateur (site constructeur, documentation officielle, ou source technique fiable).',
    'INTERDIT ABSOLU: google.com, google.fr, bing.com/duckduckgo/yahoo pages de recherche, liens raccourcis.',
    'L URL doit permettre de telecharger ou afficher le PDF sans passer par une page de moteur de recherche.',
    'Reponds UNIQUEMENT en JSON valide: {"url":"https://exemple.com/chemin/manuel.pdf"}',
    'Si tu ne connais aucune URL fiable et verifiable, reponds exactement: {"url":""}',
  ].join('\n');

  const text = await askGeminiWarning(prompt);
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);
  let url = String(parsed?.url ?? '').trim();
  if (!url) {
    throw new Error('Aucune URL PDF directe trouvee par l IA.');
  }
  if (isDisallowedManualUrl(url)) {
    throw new Error('L IA a propose une URL non autorisee (moteur de recherche). Reessayez ou collez une URL PDF.');
  }
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    throw new Error('URL invalide.');
  }
  return { url, query };
}

async function downloadManualPdfToDevice(pdfUrl: string, modele: string): Promise<string> {
  const safe = String(modele || 'vehicule')
    .replace(/[^\w\d]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 48);
  const base = documentDirectory ?? '';
  const dest = `${base}manuel_${safe}_${Date.now()}.pdf`;
  const result = await downloadAsync(pdfUrl, dest);
  if (result.status !== 200) {
    throw new Error(`Telechargement echoue (${result.status})`);
  }
  return result.uri;
}

export default function EntretienScreen() {
  const insets = useSafeAreaInsets();
  const [ctFolders, setCtFolders] = useState<CtFolder[]>([]);
  const [modules, setModules] = useState<EntretienModules>(defaultModules);
  const [defaillancesDraft, setDefaillancesDraft] = useState('');
  const [reparationsDraft, setReparationsDraft] = useState('');
  const [activePanel, setActivePanel] = useState<Panel>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [moduleAiLoading, setModuleAiLoading] = useState<null | 'pneus' | 'batterie'>(null);
  const [manualLoading, setManualLoading] = useState(false);
  const [customPdfUrl, setCustomPdfUrl] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<MaintenanceSuggestion[]>([]);
  const [pneusView, setPneusView] = useState<'menu' | 'wizard' | 'view'>('menu');
  const [pneusStep, setPneusStep] = useState(0);
  const motionOpacity = useRef(new Animated.Value(1)).current;
  const motionTranslateY = useRef(new Animated.Value(0)).current;

  const { vehicleData } = useVehicle();
  const kmCtx = useKilometrage();
  const currentKm = parseKmNumber(kmCtx?.km);
  const latestCt = useMemo(() => (ctFolders.length > 0 ? ctFolders[0] : null), [ctFolders]);
  const repairPriorityItems = useMemo(() => parsePriorityItems(reparationsDraft), [reparationsDraft]);

  const loadData = useCallback(async () => {
    try {
      const [rawCt, rawModules] = await Promise.all([
        userGetItem(STORAGE_KEY_CT_FOLDERS),
        userGetItem(STORAGE_KEY_ENTRETIEN_MODULES),
      ]);

      if (rawCt) {
        const parsed = JSON.parse(rawCt) as CtFolder[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCtFolders(parsed);
          setDefaillancesDraft(parsed[0].info?.defauts ?? '');
          setReparationsDraft(parsed[0].info?.reparations ?? '');
        } else {
          setCtFolders([]);
          setDefaillancesDraft('');
          setReparationsDraft('');
        }
      } else {
        setCtFolders([]);
        setDefaillancesDraft('');
        setReparationsDraft('');
      }

      if (rawModules) {
        const parsedModules = JSON.parse(rawModules) as Partial<EntretienModules>;
        setModules({
          pneus: { ...defaultModules.pneus, ...(parsedModules?.pneus ?? {}) },
          batterie: { ...defaultModules.batterie, ...(parsedModules?.batterie ?? {}) },
          phares: { ...defaultModules.phares, ...(parsedModules?.phares ?? {}) },
          modeEmploi: { ...defaultModules.modeEmploi, ...(parsedModules?.modeEmploi ?? {}) },
        });
      } else {
        setModules(defaultModules);
      }
    } catch (error) {
      console.log('[AFAIRE] load data failed', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData().catch(() => {});
    }, [loadData])
  );

  const saveModules = async (next: EntretienModules) => {
    setModules(next);
    await userSetItem(STORAGE_KEY_ENTRETIEN_MODULES, JSON.stringify(next));
  };

  const patchLatestCt = async (patch: { defauts?: string; reparations?: string }) => {
    if (!latestCt) return;
    const updated = ctFolders.map((folder, idx) =>
      idx === 0 ? { ...folder, info: { ...folder.info, ...patch } } : folder
    );
    setCtFolders(updated);
    await userSetItem(STORAGE_KEY_CT_FOLDERS, JSON.stringify(updated));
  };

  const handleTakePhoto = async (target: 'pneus' | 'batterie' | 'phares') => {
    try {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission requise', 'Autorisez la camera pour prendre une photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 1 });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const normalized = await normalizeDocumentCapture(result.assets[0].uri, { quality: 0.94 });
      const uri = normalized.uri;
      const next: EntretienModules = {
        ...modules,
        [target]: { ...modules[target], photoUri: uri },
      };
      await saveModules(next);
    } catch (error) {
      console.log('[AFAIRE] take photo failed', error);
      Alert.alert('Erreur', 'Impossible de prendre la photo.');
    }
  };

  const runMaintenanceIA = async () => {
    try {
      setAiLoading(true);
      const result = await generateMaintenanceWithAI({
        modele: vehicleData?.modele ?? '',
        immat: vehicleData?.immat ?? '',
        km: currentKm,
      });
      setAiSummary(result.summary);
      setAiSuggestions(result.suggestions);
    } catch (error) {
      console.log('[AFAIRE] IA maintenance failed', error);
      setAiSummary('Analyse indisponible. Recommandations standards affichees.');
      setAiSuggestions(fallbackSuggestions(currentKm));
    } finally {
      setAiLoading(false);
    }
  };

  const injectSuggestionsToReparations = () => {
    if (!aiSuggestions.length) return;
    const lines = aiSuggestions.map((s) => `- ${s.title} (vers ${s.dueAtKm.toLocaleString('fr-FR')} km)`).join('\n');
    setReparationsDraft((prev) => (prev?.trim() ? `${prev}\n${lines}` : lines));
  };

  const runPneusIA = async () => {
    try {
      setModuleAiLoading('pneus');
      const fallback = estimatePneusWear(modules.pneus, currentKm);
      try {
        const prompt = [
          'Donne une alerte usure pneus concise pour ce vehicule.',
          `Modele: ${vehicleData?.modele ?? '-'}`,
          `Km actuel: ${currentKm}`,
          `Pneus largeur/hauteur/jante: ${modules.pneus.largeur}/${modules.pneus.hauteur} R${modules.pneus.jante}`,
          `Indice charge/vitesse: ${modules.pneus.charge} ${modules.pneus.vitesse}`,
          `Date achat: ${modules.pneus.dateAchat || '-'}`,
          `Prix: ${modules.pneus.prix || '-'}`,
          `Position: ${modules.pneus.position}`,
          `Km montage: ${modules.pneus.kmMontage || '-'}`,
          'Reponds en 1 ou 2 phrases maximum.',
        ].join('\n');
        const geminiText = await askGeminiWarning(prompt);
        const next = { ...modules, pneus: { ...modules.pneus, aiWarning: geminiText || fallback } };
        await saveModules(next);
      } catch {
        const next = { ...modules, pneus: { ...modules.pneus, aiWarning: fallback } };
        await saveModules(next);
      }
    } finally {
      setModuleAiLoading(null);
    }
  };

  const runBatterieIA = async () => {
    try {
      setModuleAiLoading('batterie');
      const fallback = estimateBatterieRisk(modules.batterie);
      try {
        const prompt = [
          'Donne une estimation courte du risque de panne batterie.',
          `Modele vehicule: ${vehicleData?.modele ?? '-'}`,
          `Km actuel: ${currentKm}`,
          `Batterie modele: ${modules.batterie.modele || '-'}`,
          `Date achat: ${modules.batterie.dateAchat || '-'}`,
          `Prix: ${modules.batterie.prix || '-'}`,
          'Reponds en 1 ou 2 phrases maximum.',
        ].join('\n');
        const geminiText = await askGeminiWarning(prompt);
        const next = { ...modules, batterie: { ...modules.batterie, aiWarning: geminiText || fallback } };
        await saveModules(next);
      } catch {
        const next = { ...modules, batterie: { ...modules.batterie, aiWarning: fallback } };
        await saveModules(next);
      }
    } finally {
      setModuleAiLoading(null);
    }
  };

  const saveDefaillances = async () => {
    if (!latestCt) return;
    await patchLatestCt({ defauts: defaillancesDraft });
    Alert.alert('Succes', 'Defaillances synchronisees avec CT.');
  };

  const saveReparations = async () => {
    if (!latestCt) return;
    await patchLatestCt({ reparations: reparationsDraft });
    Alert.alert('Succes', 'Reparations synchronisees avec CT.');
  };

  const clearDefaillancesFolder = () => {
    Alert.alert(
      'Supprimer DEFAILLANCES ?',
      'Cela supprimera aussi le contenu synchronise dans le dernier dossier CT.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setDefaillancesDraft('');
            await patchLatestCt({ defauts: '' });
          },
        },
      ]
    );
  };

  const clearReparationsFolder = () => {
    Alert.alert(
      'Supprimer REPARATIONS ?',
      'Cela supprimera aussi le contenu synchronise dans le dernier dossier CT.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setReparationsDraft('');
            await patchLatestCt({ reparations: '' });
          },
        },
      ]
    );
  };

  const findAndSaveManual = async () => {
    if (!process.env.EXPO_PUBLIC_GEMINI_API_KEY) {
      Alert.alert('Cle API', 'Ajoutez EXPO_PUBLIC_GEMINI_API_KEY ou utilisez une URL PDF directe (champ ci-dessous).');
      return;
    }
    if (!vehicleData?.modele?.trim()) {
      Alert.alert('Profil', 'Indiquez le modele du vehicule dans le profil.');
      return;
    }
    try {
      setManualLoading(true);
      const { url, query } = await fetchDirectPdfUrlFromGemini(vehicleData.modele, vehicleData.immat ?? '');
      const localUri = await downloadManualPdfToDevice(url, vehicleData.modele);
      const next: EntretienModules = {
        ...modules,
        modeEmploi: { manualUrl: url, localPdfUri: localUri, lastSearchQuery: query },
      };
      await saveModules(next);
      Alert.alert('Succes', 'Manuel PDF telecharge sur l appareil.');
    } catch (error: unknown) {
      console.log('[AFAIRE] manual IA download failed', error);
      const msg = error instanceof Error ? error.message : 'Echec telechargement.';
      Alert.alert('Manuel', `${msg} Vous pouvez coller une URL HTTPS directe vers le PDF (pas Google).`);
    } finally {
      setManualLoading(false);
    }
  };

  const downloadManualFromCustomUrl = async () => {
    const raw = customPdfUrl.trim();
    if (!raw.startsWith('https://') && !raw.startsWith('http://')) {
      Alert.alert('URL', 'Collez une URL HTTPS vers un fichier PDF.');
      return;
    }
    if (isDisallowedManualUrl(raw)) {
      Alert.alert('URL refusee', 'Les pages Google / moteurs de recherche sont interdites. Utilisez un lien direct vers le fichier PDF.');
      return;
    }
    try {
      setManualLoading(true);
      const localUri = await downloadManualPdfToDevice(raw, vehicleData?.modele ?? 'vehicule');
      const next: EntretienModules = {
        ...modules,
        modeEmploi: {
          manualUrl: raw,
          localPdfUri: localUri,
          lastSearchQuery: buildManualSearchQuery(vehicleData?.modele ?? '', vehicleData?.immat ?? ''),
        },
      };
      await saveModules(next);
      Alert.alert('Succes', 'PDF telecharge sur l appareil.');
    } catch (error: unknown) {
      console.log('[AFAIRE] custom manual download failed', error);
      const msg = error instanceof Error ? error.message : 'Telechargement impossible.';
      Alert.alert('Erreur', msg);
    } finally {
      setManualLoading(false);
    }
  };

  const openManualFullscreen = async () => {
    const local = modules.modeEmploi.localPdfUri;
    if (local) {
      try {
        const info = await getInfoAsync(local);
        if (!info.exists) {
          Alert.alert('Fichier introuvable', 'Retelechargez le manuel.');
          return;
        }
        await Linking.openURL(local);
        return;
      } catch (error) {
        console.log('[AFAIRE] open local pdf failed', error);
      }
    }
    const remote = modules.modeEmploi.manualUrl;
    if (remote && !isDisallowedManualUrl(remote)) {
      try {
        await WebBrowser.openBrowserAsync(remote, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        });
        return;
      } catch (error) {
        console.log('[AFAIRE] open remote pdf failed', error);
      }
    }
    Alert.alert('Information', 'Telechargez dabord le PDF (IA ou URL directe).');
  };

  const folderCards = [
    { key: 'pneus' as const, title: 'PNEUS', subtitle: 'Photo, taille et usure', icon: 'tire' as const, color: '#d4af37' },
    { key: 'batterie' as const, title: 'BATTERIE', subtitle: 'Photo, modele, risque panne', icon: 'car-battery' as const, color: '#3b82f6' },
    { key: 'phares' as const, title: 'PHARES', subtitle: 'Photo et ampoule remplacee', icon: 'car-light-high' as const, color: '#22c55e' },
    { key: 'mode_emploi' as const, title: 'MODE D EMPLOI', subtitle: 'Manuel constructeur', icon: 'book-open-page-variant-outline' as const, color: '#06b6d4' },
    { key: 'defaillances' as const, title: 'DEFAILLANCES', subtitle: 'Synchronise avec CT', icon: 'alert-circle-outline' as const, color: '#ef4444' },
    { key: 'reparations' as const, title: 'REPARATIONS', subtitle: 'Synchronise avec CT', icon: 'wrench-outline' as const, color: '#8b5cf6' },
  ];

  const pneusWizardSteps: { key: 'largeur' | 'hauteur' | 'jante' | 'charge' | 'vitesse' | 'dateAchat' | 'prix' | 'kmMontage' | 'photo'; label: string; placeholder?: string; keyboard?: 'default' | 'numeric' }[] = [
    { key: 'largeur', label: 'Largeur', placeholder: 'Ex: 205', keyboard: 'numeric' },
    { key: 'hauteur', label: 'Hauteur', placeholder: 'Ex: 55', keyboard: 'numeric' },
    { key: 'jante', label: 'Dimension jantes', placeholder: 'Ex: R16' },
    { key: 'charge', label: 'Capacité de charge', placeholder: 'Ex: 91' },
    { key: 'vitesse', label: 'Indice de vitesse', placeholder: 'Ex: V' },
    { key: 'dateAchat', label: "Date d'achat", placeholder: 'JJ/MM/AAAA' },
    { key: 'prix', label: 'Prix', placeholder: 'Ex: 120', keyboard: 'numeric' },
    { key: 'kmMontage', label: 'Kilométrage', placeholder: String(currentKm), keyboard: 'numeric' },
    { key: 'photo', label: 'Photo (optionnel)' },
  ];
  const pneusCurrentStep = pneusWizardSteps[pneusStep];
  const panelMeta = getPanelMeta(activePanel);
  const motionKey = `${activePanel ?? 'home'}-${activePanel === 'pneus' ? `${pneusView}-${pneusStep}` : 'base'}`;
  const prevMotionKeyRef = useRef(motionKey);

  const startPneusWizard = (asNew: boolean) => {
    if (asNew) {
      setModules((p) => ({
        ...p,
        pneus: { ...defaultModules.pneus, kmMontage: String(currentKm), position: 'les_deux' },
      }));
    } else if (!modules.pneus.kmMontage) {
      setModules((p) => ({ ...p, pneus: { ...p.pneus, kmMontage: String(currentKm) } }));
    }
    setPneusStep(0);
    setPneusView('wizard');
  };

  const pushPneusHistoryEntry = (source: EntretienModules['pneus']) => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      largeur: source.largeur,
      hauteur: source.hauteur,
      jante: source.jante,
      charge: source.charge,
      vitesse: source.vitesse,
      dateAchat: source.dateAchat,
      prix: source.prix,
      kmMontage: source.kmMontage,
      photoUri: source.photoUri,
      updatedAt: new Date().toISOString(),
    };
    return [entry, ...(source.history ?? [])];
  };

  const pneusHistoryGrouped = useMemo(() => {
    const rows = [...(modules.pneus.history ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const map: Record<string, typeof rows> = {};
    for (const row of rows) {
      const d = new Date(row.updatedAt);
      const key = Number.isNaN(d.getTime())
        ? 'Date inconnue'
        : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      map[key] = [...(map[key] ?? []), row];
    }
    return Object.entries(map);
  }, [modules.pneus.history]);

  const savePneusWizard = async () => {
    const next = {
      ...modules,
      pneus: {
        ...modules.pneus,
        history: pushPneusHistoryEntry(modules.pneus),
      },
    };
    await saveModules(next);
    setPneusView('view');
    setPneusStep(0);
    Alert.alert('Dossier enregistré', 'Votre dossier pneus est bien enregistré.', [
      { text: 'Créer un nouveau dossier', onPress: () => startPneusWizard(true) },
      { text: 'Fermer', style: 'cancel' },
    ]);
  };

  const goNextPneusWizard = () => {
    Keyboard.dismiss();
    if (pneusStep < pneusWizardSteps.length - 1) {
      setPneusStep((s) => s + 1);
      return;
    }
    void savePneusWizard();
  };

  useEffect(() => {
    if (prevMotionKeyRef.current === motionKey) return;
    prevMotionKeyRef.current = motionKey;
    motionOpacity.setValue(0);
    motionTranslateY.setValue(10);
    Animated.parallel([
      Animated.timing(motionOpacity, {
        toValue: 1,
        duration: 210,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(motionTranslateY, {
        toValue: 0,
        duration: 210,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [motionKey, motionOpacity, motionTranslateY]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {activePanel == null ? (
        <>
          <ImageBackground
            source={{ uri: 'https://images.unsplash.com/photo-1486006920555-c77dcf18193c?auto=format&fit=crop&w=1600&q=70' }}
            style={styles.heroBanner}
            imageStyle={styles.heroBannerImage}
          >
            <LinearGradient colors={['rgba(0,0,0,0.16)', 'rgba(0,0,0,0.72)', '#0b0f14']} locations={[0, 0.56, 1]} style={styles.heroOverlay}>
              <View style={styles.heroIconWrap}>
                <MaterialCommunityIcons name="clipboard-list-outline" size={30} color="#00F2FF" />
              </View>
              <Text style={styles.pageTitle}>CARNET D&apos;ENTRETIEN</Text>
              <Text style={styles.syncHint}>
                Vehicule: {vehicleData?.modele || '-'} | Km: {currentKm.toLocaleString('fr-FR')} | CT: {latestCt?.name || 'aucun'}
              </Text>
            </LinearGradient>
          </ImageBackground>
        </>
      ) : null}

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardDismissMode="on-drag">
        <Animated.View
          style={{
            opacity: motionOpacity,
            transform: [{ translateY: motionTranslateY }],
          }}
        >
        <View style={[styles.card, styles.glassCard]}>
          <View style={styles.cardHeaderLeft}>
            <MaterialCommunityIcons name="robot-outline" size={22} color="#7c3aed" />
            <Text style={styles.cardTitle}>PRECONISATIONS IA ENTRETIEN</Text>
          </View>
          <Pressable style={({ pressed }) => [styles.aiBtn, pressed && styles.scaleDown]} onPress={runMaintenanceIA} disabled={aiLoading}>
            {aiLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.aiBtnText}>ANALYSER MON VEHICULE</Text>}
          </Pressable>
          {aiSummary ? <Text style={styles.aiSummary}>{aiSummary}</Text> : null}
          {aiSuggestions.map((item, idx) => (
            <View key={`${item.title}-${idx}`} style={styles.aiItem}>
              <Text style={styles.aiItemTitle}>
                {item.title} - {item.dueAtKm.toLocaleString('fr-FR')} km
              </Text>
              <Text style={styles.aiItemSub}>Priorite: {item.priority.toUpperCase()} - {item.notes}</Text>
            </View>
          ))}
          {!!aiSuggestions.length && (
            <Pressable style={({ pressed }) => [styles.saveBtn, pressed && styles.scaleDown]} onPress={injectSuggestionsToReparations}>
              <Text style={styles.saveBtnText}>AJOUTER DANS REPARATIONS</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.grid}>
          {folderCards.map((f) => (
            <Pressable
              key={f.key}
              style={({ pressed }) => [styles.folderCard, styles.glassCard, pressed && styles.scaleDown]}
              onPress={() => {
                setActivePanel(f.key);
                if (f.key === 'pneus') {
                  setPneusView('menu');
                  setPneusStep(0);
                }
              }}
            >
              <MaterialCommunityIcons name={f.icon} size={24} color={f.color} />
              <Text style={styles.folderTitle}>{f.title}</Text>
              <Text style={styles.folderSub}>{f.subtitle}</Text>
            </Pressable>
          ))}
        </View>
        </Animated.View>
      </ScrollView>

      <Modal visible={activePanel != null} animationType="slide" onRequestClose={() => setActivePanel(null)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                if (activePanel === 'pneus' && pneusView === 'wizard' && pneusStep > 0) {
                  setPneusStep((s) => Math.max(0, s - 1));
                  return;
                }
                if (activePanel === 'pneus' && pneusView !== 'menu') {
                  setPneusView('menu');
                  setPneusStep(0);
                  return;
                }
                setActivePanel(null);
              }}
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color="#00F2FF" />
            </TouchableOpacity>
            <View style={styles.modalHeaderCenter}>
              <View style={styles.modalHeaderIconWrap}>
                <MaterialCommunityIcons name={panelMeta.icon} size={19} color="#00F2FF" />
              </View>
              <Text style={styles.modalTitle}>{activePanel?.toUpperCase() || ''}</Text>
              <Text style={styles.modalSubtitle}>{panelMeta.subtitle}</Text>
            </View>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <Animated.View style={{ opacity: motionOpacity, transform: [{ translateY: motionTranslateY }] }}>
            {activePanel === 'pneus' ? (
              <View style={styles.card}>
                {pneusView === 'menu' ? (
                  <>
                    <View style={styles.pneusHeroCard}>
                      <View style={styles.pneusHeroIconWrap}>
                        <MaterialCommunityIcons name="tire" size={34} color="#d4af37" />
                      </View>
                      <Text style={styles.pneusHeroTitle}>Atelier Pneus</Text>
                      <Text style={styles.pneusHeroSub}>Créez ou consultez votre dossier avec un parcours guidé premium</Text>
                    </View>
                    <Pressable style={({ pressed }) => [styles.folderCard, styles.glassCard, pressed && styles.scaleDown]} onPress={() => startPneusWizard(true)}>
                      <MaterialCommunityIcons name="tire" size={24} color="#d4af37" />
                      <Text style={styles.folderTitle}>VOUS AVEZ CHANGÉ DE PNEUS ?</Text>
                      <Text style={styles.folderSub}>Lancer le formulaire guidé</Text>
                    </Pressable>
                    <Pressable style={({ pressed }) => [styles.folderCard, styles.glassCard, { marginTop: 10 }, pressed && styles.scaleDown]} onPress={() => setPneusView('view')}>
                      <MaterialCommunityIcons name="folder-eye-outline" size={24} color="#67e8f9" />
                      <Text style={styles.folderTitle}>VOIR MES PNEUS</Text>
                      <Text style={styles.folderSub}>Consulter le dossier enregistré</Text>
                    </Pressable>
                  </>
                ) : null}

                {pneusView === 'view' ? (
                  <>
                    <Text style={styles.label}>Dossiers classés par date de modification</Text>
                    {pneusHistoryGrouped.length === 0 ? (
                      <Text style={styles.warningText}>Aucun dossier enregistré.</Text>
                    ) : (
                      pneusHistoryGrouped.map(([groupLabel, rows]) => (
                        <View key={groupLabel} style={styles.historyGroup}>
                          <Text style={styles.historyTitle}>{groupLabel}</Text>
                          {rows.map((row) => (
                            <View key={row.id} style={styles.historyCard}>
                              <Text style={styles.historyMain}>
                                {row.largeur || '-'} / {row.hauteur || '-'} R{row.jante || '-'} - {row.charge || '-'} {row.vitesse || '-'}
                              </Text>
                              <Text style={styles.historyMeta}>
                                Achat: {row.dateAchat || '-'} | Prix: {row.prix || '-'} | Km: {row.kmMontage || '-'}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ))
                    )}
                    <Pressable style={({ pressed }) => [styles.saveBtn, pressed && styles.scaleDown]} onPress={() => startPneusWizard(false)}>
                      <Text style={styles.saveBtnText}>MODIFIER LE DOSSIER</Text>
                    </Pressable>
                  </>
                ) : null}

                {pneusView === 'wizard' ? (
                  <>
                    <View style={styles.pneusWizardCard}>
                      <Text style={styles.wizardStepText}>
                        Étape {pneusStep + 1} / {pneusWizardSteps.length}
                      </Text>
                      <View style={styles.wizardProgressTrack}>
                        <View
                          style={[
                            styles.wizardProgressFill,
                            { width: `${Math.round(((pneusStep + 1) / pneusWizardSteps.length) * 100)}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.wizardQuestion}>{pneusCurrentStep.label}</Text>

                      {pneusCurrentStep.key !== 'photo' ? (
                        <TextInput
                          style={styles.wizardInput}
                          placeholder={pneusCurrentStep.placeholder}
                          placeholderTextColor="#64748b"
                          keyboardType={pneusCurrentStep.keyboard ?? 'default'}
                          value={String(modules.pneus[pneusCurrentStep.key] ?? '')}
                          onChangeText={(v) =>
                            setModules((p) => ({ ...p, pneus: { ...p.pneus, [pneusCurrentStep.key]: v } }))
                          }
                          returnKeyType="done"
                          onSubmitEditing={goNextPneusWizard}
                        />
                      ) : (
                        <TouchableOpacity style={styles.photoBox} onPress={() => handleTakePhoto('pneus')} activeOpacity={0.85}>
                          {modules.pneus.photoUri ? (
                            <Image source={{ uri: modules.pneus.photoUri }} style={styles.photo} />
                          ) : (
                            <Text style={styles.photoPlaceholder}>Prendre une photo pneus (optionnel)</Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.wizardActionsRow}>
                      <Pressable style={({ pressed }) => [styles.wizardSkipBtn, pressed && styles.scaleDown]} onPress={goNextPneusWizard}>
                        <Text style={styles.wizardSkipText}>
                          {pneusStep < pneusWizardSteps.length - 1 ? 'Passer' : 'Enregistrer'}
                        </Text>
                      </Pressable>
                      <Pressable style={({ pressed }) => [styles.wizardNextBtn, pressed && styles.scaleDown]} onPress={goNextPneusWizard}>
                        <Text style={styles.wizardNextText}>
                          {pneusStep < pneusWizardSteps.length - 1 ? 'Suivant' : 'Valider'}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}

            {activePanel === 'batterie' ? (
              <View style={styles.card}>
                <View style={styles.moduleHeroCard}>
                  <View style={styles.moduleHeroIconWrap}>
                    <MaterialCommunityIcons name="car-battery" size={30} color="#3b82f6" />
                  </View>
                  <Text style={styles.moduleHeroTitle}>Atelier Batterie</Text>
                  <Text style={styles.moduleHeroSub}>Suivez l&apos;état de charge et anticipez les risques de panne</Text>
                </View>
                <TouchableOpacity style={styles.photoBox} onPress={() => handleTakePhoto('batterie')} activeOpacity={0.85}>
                  {modules.batterie.photoUri ? <Image source={{ uri: modules.batterie.photoUri }} style={styles.photo} /> : <Text style={styles.photoPlaceholder}>Prendre une photo batterie</Text>}
                </TouchableOpacity>

                <Text style={styles.label}>Date achat (jj/mm/aaaa)</Text>
                <TextInput style={styles.input} value={modules.batterie.dateAchat} onChangeText={(v) => setModules((p) => ({ ...p, batterie: { ...p.batterie, dateAchat: v } }))} />
                <Text style={styles.label}>Modele batterie</Text>
                <TextInput style={styles.input} value={modules.batterie.modele} onChangeText={(v) => setModules((p) => ({ ...p, batterie: { ...p.batterie, modele: v } }))} />
                <Text style={styles.label}>Prix</Text>
                <TextInput style={styles.input} value={modules.batterie.prix} keyboardType="numeric" onChangeText={(v) => setModules((p) => ({ ...p, batterie: { ...p.batterie, prix: v } }))} />

                <Pressable style={({ pressed }) => [styles.aiBtn, pressed && styles.scaleDown]} onPress={runBatterieIA} disabled={moduleAiLoading === 'batterie'}>
                  {moduleAiLoading === 'batterie' ? <ActivityIndicator color="#fff" /> : <Text style={styles.aiBtnText}>ESTIMER PANNE IA</Text>}
                </Pressable>
                <Text style={styles.warningText}>{modules.batterie.aiWarning || estimateBatterieRisk(modules.batterie)}</Text>

                <Pressable style={({ pressed }) => [styles.saveBtn, pressed && styles.scaleDown]} onPress={async () => { await saveModules(modules); Alert.alert('Succes', 'Dossier batterie enregistre.'); }}>
                  <Text style={styles.saveBtnText}>ENREGISTRER BATTERIE</Text>
                </Pressable>
              </View>
            ) : null}

            {activePanel === 'phares' ? (
              <View style={styles.card}>
                <View style={styles.moduleHeroCard}>
                  <View style={styles.moduleHeroIconWrap}>
                    <MaterialCommunityIcons name="car-light-high" size={30} color="#22c55e" />
                  </View>
                  <Text style={styles.moduleHeroTitle}>Atelier Phares</Text>
                  <Text style={styles.moduleHeroSub}>Gardez une visibilité optimale avec un suivi précis des ampoules</Text>
                </View>
                <TouchableOpacity style={styles.photoBox} onPress={() => handleTakePhoto('phares')} activeOpacity={0.85}>
                  {modules.phares.photoUri ? <Image source={{ uri: modules.phares.photoUri }} style={styles.photo} /> : <Text style={styles.photoPlaceholder}>Prendre une photo phares</Text>}
                </TouchableOpacity>
                <Text style={styles.label}>Ampoule changee</Text>
                <TextInput
                  style={styles.input}
                  placeholder="ex: feu stop, croisement, route, clignotant, habitacle, coffre..."
                  placeholderTextColor="#64748b"
                  value={modules.phares.ampoule}
                  onChangeText={(v) => setModules((p) => ({ ...p, phares: { ...p.phares, ampoule: v } }))}
                />
                <Text style={styles.label}>Position</Text>
                <View style={styles.chipRow}>
                  {[
                    { label: 'Avant G', value: 'avant_gauche' as const },
                    { label: 'Avant D', value: 'avant_droit' as const },
                    { label: 'Arriere G', value: 'arriere_gauche' as const },
                    { label: 'Arriere D', value: 'arriere_droit' as const },
                    { label: 'Feu stop', value: 'feu_stop' as const },
                    { label: 'Croisement', value: 'croisement' as const },
                    { label: 'Route', value: 'route' as const },
                    { label: 'Clignotants', value: 'clignotants' as const },
                    { label: 'Habitacle', value: 'habitacle' as const },
                    { label: 'Coffre', value: 'coffre' as const },
                    { label: 'Boite a gants', value: 'boite_a_gants' as const },
                  ].map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.chip, modules.phares.position === opt.value ? styles.chipActive : null]}
                      onPress={() => setModules((p) => ({ ...p, phares: { ...p.phares, position: opt.value } }))}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.chipText, modules.phares.position === opt.value ? styles.chipTextActive : null]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.label}>Commentaire</Text>
                <TextInput style={[styles.input, styles.multi]} multiline value={modules.phares.commentaire} onChangeText={(v) => setModules((p) => ({ ...p, phares: { ...p.phares, commentaire: v } }))} />
                <Pressable style={({ pressed }) => [styles.saveBtn, pressed && styles.scaleDown]} onPress={async () => { await saveModules(modules); Alert.alert('Succes', 'Dossier phares enregistre.'); }}>
                  <Text style={styles.saveBtnText}>ENREGISTRER PHARES</Text>
                </Pressable>
              </View>
            ) : null}

            {activePanel === 'defaillances' ? (
              <View style={styles.card}>
                <Text style={styles.label}>Defaillances (synchronise CT)</Text>
                <TextInput style={[styles.input, styles.multi]} multiline textAlignVertical="top" value={defaillancesDraft} onChangeText={setDefaillancesDraft} />
                <Pressable style={({ pressed }) => [styles.saveBtn, pressed && styles.scaleDown]} onPress={saveDefaillances}><Text style={styles.saveBtnText}>ENREGISTRER DEFAILLANCES</Text></Pressable>
                <Pressable style={({ pressed }) => [styles.deleteBtn, pressed && styles.scaleDown]} onPress={clearDefaillancesFolder}><Text style={styles.deleteText}>SUPPRIMER DEFAILLANCES</Text></Pressable>
              </View>
            ) : null}

            {activePanel === 'reparations' ? (
              <View style={styles.card}>
                <Text style={styles.label}>Reparations (synchronise CT)</Text>
                <TextInput style={[styles.input, styles.multi]} multiline textAlignVertical="top" value={reparationsDraft} onChangeText={setReparationsDraft} />
                {repairPriorityItems.length > 0 ? (
                  <View style={styles.priorityBox}>
                    <Text style={styles.priorityTitle}>Priorites detectees</Text>
                    {repairPriorityItems.map((item, idx) => (
                      <View key={`${item.tag}-${idx}-${item.text.slice(0, 20)}`} style={styles.priorityRow}>
                        <View
                          style={[
                            styles.priorityBadge,
                            item.tag === 'URGENT'
                              ? styles.badgeUrgent
                              : item.tag === 'A PLANIFIER'
                              ? styles.badgePlanifier
                              : styles.badgeSuivi,
                          ]}
                        >
                          <Text style={styles.priorityBadgeText}>{item.tag}</Text>
                        </View>
                        <Text style={styles.priorityText}>{item.text}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                <Pressable style={({ pressed }) => [styles.saveBtn, pressed && styles.scaleDown]} onPress={saveReparations}><Text style={styles.saveBtnText}>ENREGISTRER REPARATIONS</Text></Pressable>
                <Pressable style={({ pressed }) => [styles.deleteBtn, pressed && styles.scaleDown]} onPress={clearReparationsFolder}><Text style={styles.deleteText}>SUPPRIMER REPARATIONS</Text></Pressable>
              </View>
            ) : null}

            {activePanel === 'mode_emploi' ? (
              <View style={styles.card}>
                <Text style={styles.label}>Vehicule detecte (profil)</Text>
                <Text style={styles.warningText}>
                  {vehicleData?.modele || '-'} {vehicleData?.immat ? `| ${vehicleData.immat}` : ''}
                </Text>
                <Text style={styles.hintText}>
                  L IA cherche une URL HTTPS directe vers le PDF (jamais Google). Le fichier est telecharge sur le telephone pour lecture sans passer par une page de recherche.
                </Text>

                <Pressable style={({ pressed }) => [styles.aiBtn, pressed && styles.scaleDown]} onPress={findAndSaveManual} disabled={manualLoading}>
                  {manualLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.aiBtnText}>TELECHARGER LE MANUEL (IA)</Text>}
                </Pressable>

                <Text style={styles.label}>URL PDF directe (optionnel)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="https://.../manuel.pdf"
                  placeholderTextColor="#64748b"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={customPdfUrl}
                  onChangeText={setCustomPdfUrl}
                />
                <Pressable style={({ pressed }) => [styles.secondaryBtn, pressed && styles.scaleDown]} onPress={downloadManualFromCustomUrl} disabled={manualLoading}>
                  <Text style={styles.secondaryBtnText}>TELECHARGER DEPUIS CETTE URL</Text>
                </Pressable>

                <Text style={styles.label}>Fichier local</Text>
                <Text style={styles.warningText}>
                  {modules.modeEmploi.localPdfUri ? 'PDF pret sur l appareil.' : 'Aucun PDF telecharge pour le moment.'}
                </Text>

                <Text style={styles.label}>Source (URL directe)</Text>
                <Text style={styles.warningText} numberOfLines={4}>
                  {modules.modeEmploi.manualUrl || '-'}
                </Text>

                <Pressable style={({ pressed }) => [styles.saveBtn, pressed && styles.scaleDown]} onPress={openManualFullscreen}>
                  <Text style={styles.saveBtnText}>OUVRIR LE PDF</Text>
                </Pressable>
              </View>
            ) : null}
            </Animated.View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_THEME.bg, paddingHorizontal: 16, paddingTop: 54 },
  heroBanner: {
    height: 140,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: UI_THEME.cyanBorder,
  },
  heroBannerImage: { resizeMode: 'cover' },
  heroOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  heroIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,242,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,242,255,0.4)',
    marginBottom: 8,
  },
  pageTitle: { fontSize: 22, fontWeight: '800', color: UI_THEME.textSecondary, textAlign: 'center' },
  syncHint: { marginTop: 6, marginBottom: 10, textAlign: 'center', fontSize: 12, color: UI_THEME.textMuted },
  scaleDown: { transform: [{ scale: 0.98 }] },
  glassCard: {
    backgroundColor: UI_THEME.glass,
    borderWidth: 0.5,
    borderColor: UI_THEME.cyanBorder,
  },

  card: {
    backgroundColor: UI_THEME.glass,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    elevation: 2,
    borderWidth: 0.5,
    borderColor: UI_THEME.cyanBorder,
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  cardTitle: { marginLeft: 8, fontSize: 15, fontWeight: '800', color: '#e2e8f0' },

  aiBtn: {
    backgroundColor: '#7c3aed',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  aiBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  hintText: { fontSize: 11, color: '#94a3b8', marginBottom: 10, lineHeight: 16 },
  secondaryBtn: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  secondaryBtnText: { color: '#e2e8f0', fontWeight: '800', fontSize: 12 },
  aiSummary: { fontSize: 12, color: '#94a3b8', marginBottom: 8 },
  aiItem: {
    backgroundColor: UI_THEME.panel,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#334155',
    padding: 8,
    marginBottom: 6,
  },
  aiItemTitle: { color: '#e2e8f0', fontWeight: '700', fontSize: 12 },
  aiItemSub: { color: '#94a3b8', fontSize: 11, marginTop: 2 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  folderCard: {
    width: '48.5%',
    minHeight: 112,
    borderRadius: 14,
    padding: 12,
    backgroundColor: UI_THEME.glass,
    borderWidth: 0.5,
    borderColor: UI_THEME.cyanBorder,
  },
  folderTitle: { color: '#fff', fontSize: 12, fontWeight: '800', marginTop: 6 },
  folderSub: { color: '#94a3b8', fontSize: 10, marginTop: 2 },

  modalContainer: { flex: 1, backgroundColor: UI_THEME.bg, paddingTop: 50, paddingHorizontal: 14 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  modalHeaderCenter: { alignItems: 'center', flex: 1, paddingHorizontal: 8 },
  modalHeaderIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,242,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,242,255,0.4)',
    marginBottom: 5,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: UI_THEME.textSecondary },
  modalSubtitle: { marginTop: 2, fontSize: 11, color: '#94a3b8', textAlign: 'center' },
  pneusHeroCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  pneusHeroIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,175,55,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.4)',
    marginBottom: 8,
  },
  pneusHeroTitle: { color: '#f1f5f9', fontSize: 19, fontWeight: '900' },
  pneusHeroSub: { color: '#94a3b8', marginTop: 4, textAlign: 'center', fontSize: 12 },
  moduleHeroCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  moduleHeroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,242,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,242,255,0.35)',
    marginBottom: 8,
  },
  moduleHeroTitle: { color: '#f1f5f9', fontSize: 17, fontWeight: '900' },
  moduleHeroSub: { color: '#94a3b8', marginTop: 4, textAlign: 'center', fontSize: 12 },

  photoBox: {
    width: '100%',
    height: 170,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#334155',
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 8,
  },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { color: '#94a3b8', fontWeight: '700', fontSize: 12 },

  label: { fontSize: 12, color: '#cbd5e1', fontWeight: '700', marginTop: 8, marginBottom: 4 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
  },
  chipActive: {
    backgroundColor: '#0891b2',
    borderColor: '#00F2FF',
  },
  chipText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#fff',
  },
  input: {
    backgroundColor: UI_THEME.panel,
    borderWidth: 0.5,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#e2e8f0',
  },
  multi: { minHeight: 120 },
  warningText: {
    marginTop: 4,
    marginBottom: 4,
    fontSize: 12,
    color: '#cbd5e1',
    backgroundColor: UI_THEME.panelSoft,
    borderRadius: 8,
    padding: 8,
    borderWidth: 0.5,
    borderColor: '#334155',
  },
  historyGroup: {
    marginTop: 8,
  },
  historyTitle: {
    color: '#67e8f9',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
  },
  historyCard: {
    backgroundColor: UI_THEME.panel,
    borderWidth: 0.5,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 10,
    marginBottom: 7,
  },
  historyMain: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
  },
  historyMeta: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 3,
  },
  pneusWizardCard: {
    width: '100%',
    backgroundColor: UI_THEME.panel,
    borderWidth: 0.5,
    borderColor: '#334155',
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
  },
  wizardStepText: {
    color: '#67e8f9',
    fontSize: 12,
    fontWeight: '800',
  },
  wizardProgressTrack: {
    marginTop: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#1e293b',
    overflow: 'hidden',
  },
  wizardProgressFill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#00E9F5',
  },
  wizardQuestion: {
    color: '#e2e8f0',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 10,
  },
  wizardInput: {
    backgroundColor: UI_THEME.panelSoft,
    borderWidth: 0.5,
    borderColor: '#475569',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#f1f5f9',
  },
  wizardActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  wizardSkipBtn: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: '#475569',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  wizardSkipText: {
    color: '#cbd5e1',
    fontWeight: '800',
    fontSize: 13,
  },
  wizardNextBtn: {
    flex: 1.2,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#00E9F5',
  },
  wizardNextText: {
    color: '#061018',
    fontWeight: '900',
    fontSize: 13,
  },
  priorityBox: {
    marginTop: 8,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#334155',
    padding: 8,
    gap: 6,
  },
  priorityTitle: { fontSize: 12, fontWeight: '800', color: '#e2e8f0' },
  priorityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  priorityBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeUrgent: { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#ef4444' },
  badgePlanifier: { backgroundColor: '#ffedd5', borderWidth: 1, borderColor: '#f97316' },
  badgeSuivi: { backgroundColor: '#dbeafe', borderWidth: 1, borderColor: '#3b82f6' },
  priorityBadgeText: { fontSize: 10, fontWeight: '800', color: '#0f172a' },
  priorityText: { flex: 1, fontSize: 12, color: '#cbd5e1' },
  saveBtn: {
    marginTop: 10,
    backgroundColor: '#c0392b',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(239,68,68,0.55)',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  deleteBtn: {
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  deleteText: { color: '#b91c1c', fontWeight: '800', fontSize: 12 },
});
