import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Dimensions,
  Image,
  InteractionManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AddressPartsAutocompleteInput,
  composeAddressParts,
  type AddressParts,
} from '../../components/AddressPartsAutocompleteInput';
import { DateParts, formatDateParts, parseDateParts } from '../../components/SmartDatePartsInput';
import {
  SCAN_CASES,
  STORAGE_DIAG_SCAN,
  STORAGE_PENDING_CG_FROM_SCAN,
  STORAGE_PENDING_CT_FROM_SCAN,
  STORAGE_PENDING_PERMIS_FROM_SCAN,
  STORAGE_SCAN_FLOW_LOCK,
  STORAGE_SCAN_FORCED_TARGET,
  STORAGE_SCAN_CAMERA_SESSION,
  STORAGE_SCAN_CAMERA_SESSION_AT,
} from '../../constants/scanConstants';
import { scanDocumentWithFallback } from '../../services/nativeDocumentScanner';
import { useVehicle } from '../../context/VehicleContext';
import { fetchGeminiGenerateContentDocumentVision } from '../../services/geminiModels';
import { getGoogleGenerativeApiKeyOptional } from '../../services/googleGenerativeApiKey';
import { extractScanInsights, type ScanAiInsights } from '../../services/scanAiInsights';
import { syncScanDossierToSupabase } from '../../services/scanDocumentSupabase';
import { userGetItem, userRemoveItem, userSetItem } from '../../services/userStorage';

const { width: W, height: H } = Dimensions.get('window');

const DOC_TYPES = ['Permis', 'Carte Grise', 'Assurance', 'CT', 'Facture', 'Autre'] as const;

const STORAGE_DOCS = '@cestmavoiture_docs_v1';
const STORAGE_FACTURES = '@mes_factures_v5';
const STORAGE_ENTRETIEN = '@ma_voiture_entretien_modules_v1';
type Step = 'idle' | 'framing' | 'preview' | 'analyzing' | 'pick' | 'intake';

type EntretienModules = {
  pneus: Record<string, string>;
  batterie: Record<string, string>;
  phares: { photoUri: string; ampoule: string; position: string; commentaire: string };
  modeEmploi: Record<string, string>;
};

const defaultEntretienModules = (): EntretienModules => ({
  pneus: {
    photoUri: '',
    largeur: '',
    hauteur: '',
    jante: '',
    charge: '',
    vitesse: '',
    dateAchat: '',
    position: 'avant',
    kmMontage: '',
    aiWarning: '',
  },
  batterie: { photoUri: '', dateAchat: '', modele: '', prix: '', aiWarning: '' },
  phares: { photoUri: '', ampoule: '', position: '', commentaire: '' },
  modeEmploi: { manualUrl: '', localPdfUri: '', lastSearchQuery: '' },
});

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

type DocFolder = {
  id: string;
  titre: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  type: string;
  photoUri?: string;
  isDefault?: boolean;
  isBilan?: boolean;
  createdAt?: number;
  updatedAt?: number;
};

type FactureRow = {
  id: string;
  titre: string;
  date: string;
  garage: string;
  adresse: string;
  numero?: string;
  rue?: string;
  ville?: string;
  dep?: string;
  km: string;
  prixTTC: string;
  details: string;
  imageUri: string;
  createdAt?: number;
  updatedAt?: number;
};

type DiagScanItem = { id: string; titre: string; notes: string; imageUri: string; createdAt: number; updatedAt?: number };
function clampId(n: unknown): number {
  const x = typeof n === 'number' ? n : parseInt(String(n), 10);
  if (!Number.isFinite(x)) return 2;
  return Math.min(5, Math.max(1, Math.round(x)));
}

type GeminiClassifyResult = {
  suggestedId: number;
  reason: string;
  extractedText?: string;
  confidence?: number;
};

const KEYWORDS_BY_CASE: Record<number, string[]> = {
  1: [
    'revision', 'vidange', 'filtre', 'pneus', 'paralle', 'frein', 'plaquette', 'amortisseur',
    'batterie', 'atelier', 'garage', 'ordre de reparation', 'entretien', 'main d oeuvre',
  ],
  2: [
    'certificat d immatriculation', 'carte grise', 'permis de conduire', 'attestation d assurance',
    'assurance', 'numero de formule', 'siv', 'prefecture', 'carte verte',
  ],
  3: [
    'diagnostic', 'code erreur', 'code defaut', 'obd', 'voyant moteur', 'abs', 'esp', 'airbag',
    'fap', 'adblue', 'sonde lambda', 'calculateur', 'panne',
  ],
  4: [
    'facture', 'ttc', 'tva', 'total', 'reglement', 'peage', 'parking', 'lavage', 'carburant',
    'franchise', 'sinistre', 'depense',
  ],
  5: [
    'controle technique', 'proces verbal', 'pv', 'contre visite', 'centre de controle',
    'resultat favorable', 'resultat defavorable', 'vehicule conforme',
  ],
};

function normalizeText(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keywordScoring(text: string): { suggestedId: number; score: number; reason: string } {
  const hay = normalizeText(text);
  let bestId = 2;
  let bestScore = 0;
  let bestKeyword = 'document';
  for (const [idRaw, keywords] of Object.entries(KEYWORDS_BY_CASE)) {
    const id = Number(idRaw);
    let score = 0;
    let first = '';
    for (const kw of keywords) {
      if (hay.includes(normalizeText(kw))) {
        score += 1;
        if (!first) first = kw;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
      bestKeyword = first || 'mot-clé détecté';
    }
  }
  return {
    suggestedId: clampId(bestId),
    score: bestScore,
    reason: bestScore > 0 ? `Mots-clés détectés: ${bestKeyword}` : 'Texte peu exploitable, catégorie par défaut.',
  };
}

const CLASSIFY_PROMPT = `
Tu es un expert en documents automobiles français. Tu reçois UNE photo (document, écran, tableau de bord, papier).

ÉTAPE 1 — Lis tout texte visible (même flou) : en-têtes, tampons, logos, mentions légales.
ÉTAPE 2 — Compare aux listes de mots-clés ci-dessous. La catégorie qui compte le PLUS de correspondances visibles gagne.
ÉTAPE 3 — Si le document est illisible ou ambigu, choisis la catégorie la plus plausible et explique-le dans "reason".

CATÉGORIES (suggestedId = entier 1 à 5 uniquement, jamais 6 ni autre) :

suggestedId = 1 — ENTRETIEN / ATELIER / PIÈCES
Mots-clés et indices : révision, vidange, filtre à huile, pneus, parallélisme, freinage, disques, plaquettes, amortisseur, batterie, climatisation, main d'œuvre, forfait, carnet d'entretien, concession, garage, atelier, dépannage, pièces détachées, facture garage (réparation mécanique), OR (ordre de réparation), devis réparateur, garantie constructeur entretien.

suggestedId = 2 — DOCUMENTS ADMINISTRATIFS (hors PV CT)
Mots-clés et indices : certificat d'immatriculation, carte grise, CNI, permis de conduire, assurance auto, attestation d'assurance, contrat d'assurance, vignette, fiscalité véhicule, numéro de formule, titre de propriété, carte verte, justificatif domicile lié au véhicule, carte grise barrée, mention SIV, préfecture.

suggestedId = 3 — DIAGNOSTIC / PANNE / VOYANT / OBD
Mots-clés et indices : défaut, code erreur, code défaut, OBD, diagnostic, calculateur, injection, voyant moteur, voyant ABS, ESP, airbag, FAP, AdBlue, SCR, sonde lambda, surconsommation, symptôme, panne, lecture défauts, valise diagnostic, rapport diagnostic.

suggestedId = 4 — DÉPENSE / FACTURE / BUDGET (hors garage pur mécanique)
Mots-clés et indices : facture TTC, TVA, total à payer, règlement, carburant, station-service, péage, parking, lavage auto, location véhicule, remplacement pare-brise, franchise, sinistre assurance, expertise, devis non lié à une révision mécanique classique. Si c'est clairement une facture garage pour réparation entretien → plutôt 1.

suggestedId = 5 — CONTRÔLE TECHNIQUE
Mots-clés et indices : contrôle technique, centre de contrôle, procès-verbal, PV CT, contre-visite, résultat favorable, défavorable, contre-visite, date du prochain contrôle, kilométrage relevé CT, liste des défauts, points de contrôle, mention "véhicule conforme" ou "non conforme", Sticker CT.

RÈGLES :
- Si tu vois "contrôle technique" + "procès-verbal" ou "PV" + centre agréé → 5.
- Carte grise / permis / assurance → 2.
- Facture atelier révision / réparation → 1 (sauf si c'est surtout une facture générique sans détail garage → 4).
- Photo de tableau de bord avec voyants allumés ou message défaut → 3.

Réponds UNIQUEMENT ce JSON strict, sans markdown :
{"suggestedId":1,"reason":"une phrase en français","extractedText":"mots importants lus sur le document","confidence":0.0}
`.trim();

async function classifyWithGeminiModel(base64: string): Promise<GeminiClassifyResult> {
  const apiKey = getGoogleGenerativeApiKeyOptional();
  if (!apiKey) throw new Error('Gemini HTTP');
  const response = await fetchGeminiGenerateContentDocumentVision(
    apiKey,
    {
      contents: [
        {
          role: 'user',
          parts: [
            { text: CLASSIFY_PROMPT },
            { inline_data: { mime_type: 'image/jpeg', data: base64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.05, maxOutputTokens: 520 },
    },
    { maxHttpAttempts: 6 }
  );
  if (!response.ok) throw new Error('Gemini HTTP');
  const json = await response.json();
  const rawText = String(json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
  const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no json');
  const parsed = JSON.parse(match[0]) as {
    suggestedId?: unknown;
    reason?: unknown;
    extractedText?: unknown;
    confidence?: unknown;
  };
  return {
    suggestedId: clampId(parsed.suggestedId),
    reason: String(parsed.reason ?? 'Suggestion automatique.').slice(0, 280),
    extractedText: String(parsed.extractedText ?? '').slice(0, 1800),
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0))),
  };
}

async function classifyWithGemini(base64: string): Promise<{ suggestedId: number; reason: string }> {
  const apiKey = getGoogleGenerativeApiKeyOptional();
  if (!apiKey) {
    return { suggestedId: 2, reason: 'Clé API absente — Documents proposés par défaut.' };
  }

  let best: GeminiClassifyResult | null = null;
  try {
    best = await classifyWithGeminiModel(base64);
  } catch {
    /* fetchGeminiGenerateContentDocumentVision a déjà essayé tous les modèles / API */
  }
  if (!best) throw new Error('classification failed');

  const combinedText = `${best.extractedText ?? ''} ${best.reason ?? ''}`.trim();
  const keyword = keywordScoring(combinedText);
  const aiConfidence = best.confidence ?? 0;

  // Fusion robuste: priorité aux mots-clés forts, sinon décision IA.
  const finalId =
    keyword.score >= 2
      ? keyword.suggestedId
      : aiConfidence >= 0.55
        ? best.suggestedId
        : keyword.suggestedId;

  const reasonParts = [
    `IA: ${best.reason || 'analyse automatique'}`,
    keyword.score > 0 ? keyword.reason : '',
  ].filter(Boolean);

  return {
    suggestedId: clampId(finalId),
    reason: reasonParts.join(' • ').slice(0, 280),
  };
}

function toFrDate(raw: string): string {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return v;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return v;
}

function resolveDocTypeFromLabel(label?: string): (typeof DOC_TYPES)[number] | null {
  const n = normalizeText(String(label ?? ''));
  if (!n) return null;
  if (n.includes('permis')) return 'Permis';
  if (n.includes('carte grise') || n.includes('immatriculation')) return 'Carte Grise';
  if (n.includes('assurance')) return 'Assurance';
  if (n.includes('facture')) return 'Facture';
  if (n.includes('ct') || n.includes('controle technique')) return 'CT';
  if (n.includes('autre')) return 'Autre';
  return null;
}

export default function ScanScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ source?: string; returnTo?: string }>();
  const insets = useSafeAreaInsets();
  const { activeVehicleId } = useVehicle();
  const launchedFromCt = params.source === 'ct';
  const returnTo = typeof params.returnTo === 'string' && params.returnTo.trim() ? params.returnTo : '/ct';
  /** Après navigation vers /ct (ou autre), éviter tout comportement inattendu au prochain passage sur Scan. */
  const skipNextAutoScanRef = useRef(false);
  const [step, setStep] = useState<Step>('idle');
  const [uri, setUri] = useState('');
  const [base64, setBase64] = useState('');
  const [suggestedId, setSuggestedId] = useState(2);
  const [aiReason, setAiReason] = useState('');
  const [aiInsights, setAiInsights] = useState<ScanAiInsights | null>(null);
  const [selectedId, setSelectedId] = useState(2);

  const [docType, setDocType] = useState<string>(DOC_TYPES[0]);
  const [docTitle, setDocTitle] = useState('');

  const [entTitre, setEntTitre] = useState('');
  const [entNotes, setEntNotes] = useState('');

  const [diagTitre, setDiagTitre] = useState('');
  const [diagNotes, setDiagNotes] = useState('');

  const [facTitre, setFacTitre] = useState('');
  const [facGarage, setFacGarage] = useState('');
  const [facDateParts, setFacDateParts] = useState<DateParts>(parseDateParts(''));
  const [facAddressParts, setFacAddressParts] = useState<AddressParts>({
    numero: '',
    rue: '',
    ville: '',
    dep: '',
  });
  const [facKm, setFacKm] = useState('');
  const [facPrix, setFacPrix] = useState('');
  const [facDetails, setFacDetails] = useState('');
  const stepRef = useRef<Step>('idle');
  const uriRef = useRef('');
  const selectedIdRef = useRef(2);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    uriRef.current = uri;
  }, [uri]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useFocusEffect(
    useCallback(() => {
      console.log('[Scan][focus] screen focused', {
        launchedFromCt,
        returnTo,
        step: stepRef.current,
      });
      return () => {
        console.log('[Scan][blur] screen lost focus', {
          step: stepRef.current,
          hasUri: Boolean(uriRef.current),
          selectedId: selectedIdRef.current,
        });
      };
    }, [launchedFromCt, returnTo])
  );

  useEffect(() => {
    return () => {
      console.log('[Scan][cleanup] unmount', {
        step: stepRef.current,
        hasUri: Boolean(uriRef.current),
        selectedId: selectedIdRef.current,
        launchedFromCt,
      });
    };
  }, [launchedFromCt]);

  const resetAll = useCallback(() => {
    setStep('idle');
    setUri('');
    setBase64('');
    setAiReason('');
    setAiInsights(null);
    setSuggestedId(2);
    setSelectedId(2);
    setDocType(DOC_TYPES[0]);
    setDocTitle('');
    setEntTitre('');
    setEntNotes('');
    setDiagTitre('');
    setDiagNotes('');
    setFacTitre('');
    setFacGarage('');
    setFacDateParts(parseDateParts(''));
    setFacAddressParts({ numero: '', rue: '', ville: '', dep: '' });
    setFacKm('');
    setFacPrix('');
    setFacDetails('');
  }, []);

  const openFraming = () => setStep('framing');

  const leaveScan = useCallback(() => {
    skipNextAutoScanRef.current = true;
    void userRemoveItem(STORAGE_SCAN_FLOW_LOCK).catch(() => {});
    if (launchedFromCt) {
      router.replace(returnTo as any);
      return;
    }
    if (navigation.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/docs');
  }, [launchedFromCt, navigation, returnTo, router]);

  const analyzeCaptured = useCallback(async (capturedBase64: string) => {
    if (!capturedBase64) {
      setSuggestedId(2);
      setSelectedId(2);
      setAiReason("Photo reçue mais texte non lisible. Choisissez la section manuellement.");
      const nowFallback = new Date();
      setFacDateParts({
        day: String(nowFallback.getDate()).padStart(2, '0'),
        month: String(nowFallback.getMonth() + 1).padStart(2, '0'),
        year: String(nowFallback.getFullYear()),
      });
      setStep('pick');
      return;
    }
    setStep('analyzing');
    try {
      const r = await classifyWithGemini(capturedBase64);
      console.log('[Scan][AI] classification ok', { suggestedId: r.suggestedId });
      setSuggestedId(r.suggestedId);
      setSelectedId(r.suggestedId);
      const insight = await extractScanInsights(capturedBase64, r.suggestedId);
      console.log('[Scan][AI] insights', {
        hasInsight: Boolean(insight),
        confidence: insight?.confidence ?? null,
        label: insight?.documentLabel ?? '',
      });
      setAiInsights(insight);
      if (insight) {
        const confidencePct = Math.round((insight.confidence ?? 0) * 100);
        const aiDetails = [
          r.reason,
          insight.summary ? `Résumé: ${insight.summary}` : '',
          confidencePct > 0 ? `Confiance: ${confidencePct}%` : '',
        ]
          .filter(Boolean)
          .join(' • ');
        setAiReason(aiDetails.slice(0, 420));

        if (r.suggestedId === 4) {
          const f = insight.fields?.facture;
          const fallbackAmount =
            typeof insight.stats?.amountTtc === 'number' && Number.isFinite(insight.stats.amountTtc)
              ? String(insight.stats.amountTtc)
              : '';
          const fallbackKm =
            typeof insight.stats?.mileage === 'number' && Number.isFinite(insight.stats.mileage)
              ? String(Math.round(insight.stats.mileage))
              : '';
          setFacTitre((prev) => prev || String(f?.title ?? '').trim() || 'Dépense scannée');
          setFacGarage((prev) => prev || String(f?.supplier ?? '').trim());
          setFacDateParts((prev) => {
            const currentFormatted = formatDateParts(prev);
            if (currentFormatted) return prev;
            return parseDateParts(toFrDate(String(f?.date ?? '')));
          });
          setFacKm((prev) => prev || String(f?.km ?? '').trim() || fallbackKm);
          setFacPrix((prev) => prev || String(f?.amountTtc ?? '').trim() || fallbackAmount);
          setFacDetails((prev) => prev || String(f?.details ?? '').trim() || insight.summary);
        } else if (r.suggestedId === 2) {
          const resolved = resolveDocTypeFromLabel(insight.documentLabel);
          if (resolved) setDocType(resolved);
          const permisName = String(insight.fields?.permis?.holderName ?? '').trim();
          const plate = String(insight.fields?.carteGrise?.plate ?? '').trim();
          setDocTitle((prev) => {
            if (prev) return prev;
            if (resolved === 'Permis' && permisName) return `Permis - ${permisName}`;
            if (resolved === 'Carte Grise' && plate) return `Carte grise - ${plate}`;
            return '';
          });
        } else if (r.suggestedId === 1) {
          const e = insight.fields?.entretien;
          setEntTitre((prev) => prev || String(e?.title ?? '').trim() || 'Note entretien');
          setEntNotes((prev) => prev || String(e?.notes ?? '').trim() || insight.summary);
        } else if (r.suggestedId === 3) {
          const d = insight.fields?.diagnostic;
          setDiagTitre((prev) => prev || String(d?.title ?? '').trim() || 'Analyse / diagnostic');
          setDiagNotes((prev) => prev || String(d?.notes ?? '').trim() || insight.summary);
        }
      } else {
        setAiReason(r.reason);
      }
    } catch {
      console.log('[Scan][AI] unavailable');
      setSuggestedId(2);
      setSelectedId(2);
      setAiReason("Analyse indisponible. Choisissez la section qui correspond le mieux.");
    }
    const now = new Date();
    setFacDateParts({
      day: String(now.getDate()).padStart(2, '0'),
      month: String(now.getMonth() + 1).padStart(2, '0'),
      year: String(now.getFullYear()),
    });
    setStep('pick');
  }, []);

  /** True pendant await scan / traitement — évite une double reprise via getPendingResultAsync. */
  const scanFlowBusyRef = useRef(false);

  const processCapturedUri = useCallback(async (uriScanned: string) => {
    // Flux simplifié: on affiche d'abord l'aperçu, puis l'utilisateur décide
    // d'analyser ou de continuer sans IA. Cela évite les traitements lourds
    // juste après "Suivant" qui pouvaient provoquer des redémarrages.
    await new Promise<void>((resolve) => {
      InteractionManager.runAfterInteractions(() => resolve());
    });
    setUri(uriScanned);
    setBase64('');
    setStep('preview');
  }, []);

  const tryRecoverPendingCameraCapture = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    if (scanFlowBusyRef.current) return;
    const session = await userGetItem(STORAGE_SCAN_CAMERA_SESSION);
    if (session !== '1') return;
    let pending: Awaited<ReturnType<typeof ImagePicker.getPendingResultAsync>>;
    try {
      pending = await ImagePicker.getPendingResultAsync();
    } catch {
      return;
    }
    const uri =
      pending &&
      typeof pending === 'object' &&
      'canceled' in pending &&
      pending.canceled === false
        ? pending.assets?.[0]?.uri
        : undefined;
    if (!uri) {
      await userRemoveItem(STORAGE_SCAN_CAMERA_SESSION).catch(() => {});
      await userRemoveItem(STORAGE_SCAN_CAMERA_SESSION_AT).catch(() => {});
      return;
    }
    await userRemoveItem(STORAGE_SCAN_CAMERA_SESSION).catch(() => {});
    await userRemoveItem(STORAGE_SCAN_CAMERA_SESSION_AT).catch(() => {});
    try {
      scanFlowBusyRef.current = true;
      await processCapturedUri(uri);
    } catch (e) {
      console.log('[Scan] pending camera recovery failed', e);
      setStep('idle');
      Alert.alert(
        'Erreur de traitement',
        'La photo n’a pas pu être traitée après retour caméra. Réessayez.'
      );
    } finally {
      scanFlowBusyRef.current = false;
      await userRemoveItem(STORAGE_SCAN_CAMERA_SESSION).catch(() => {});
      await userRemoveItem(STORAGE_SCAN_CAMERA_SESSION_AT).catch(() => {});
    }
  }, [processCapturedUri]);

  useFocusEffect(
    useCallback(() => {
      void tryRecoverPendingCameraCapture();
    }, [tryRecoverPendingCameraCapture])
  );

  useFocusEffect(
    useCallback(() => {
      return () => {};
    }, [])
  );

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void tryRecoverPendingCameraCapture();
    });
    return () => sub.remove();
  }, [tryRecoverPendingCameraCapture]);

  async function takePhoto() {
    scanFlowBusyRef.current = true;
    await userSetItem(STORAGE_SCAN_CAMERA_SESSION, '1').catch(() => {});
    await userSetItem(STORAGE_SCAN_CAMERA_SESSION_AT, String(Date.now())).catch(() => {});
    try {
      const uriScanned = await scanDocumentWithFallback();
      if (!uriScanned) {
        if (launchedFromCt) {
          skipNextAutoScanRef.current = true;
          await userRemoveItem(STORAGE_SCAN_FLOW_LOCK).catch(() => {});
          router.replace(returnTo as any);
          return;
        }
        if (Platform.OS === 'android') {
          await new Promise<void>((resolve) => setTimeout(resolve, 450));
          await tryRecoverPendingCameraCapture();
        }
        setStep('idle');
        Alert.alert('Scan interrompu', 'Aucune photo reçue. Réessayez le scan.');
        return;
      }
      if (launchedFromCt) {
        setUri(uriScanned);
        setBase64('');
        setStep('preview');
        return;
      }
      const forcedTargetRaw = await userGetItem(STORAGE_SCAN_FORCED_TARGET);
      const forcedTarget = typeof forcedTargetRaw === 'string' ? forcedTargetRaw.trim().toLowerCase() : '';
      if (forcedTarget === 'permis') {
        skipNextAutoScanRef.current = true;
        await userSetItem(STORAGE_PENDING_PERMIS_FROM_SCAN, uriScanned);
        await userRemoveItem(STORAGE_SCAN_FORCED_TARGET).catch(() => {});
        await userRemoveItem(STORAGE_SCAN_FLOW_LOCK).catch(() => {});
        router.replace({
          pathname: '/scan_permis',
          params: { fromGlobalScan: '1', pendingFromScan: '1', flow: 'create' },
        });
        resetAll();
        return;
      }
      if (forcedTarget === 'cg') {
        skipNextAutoScanRef.current = true;
        await userSetItem(STORAGE_PENDING_CG_FROM_SCAN, uriScanned);
        await userRemoveItem(STORAGE_SCAN_FORCED_TARGET).catch(() => {});
        await userRemoveItem(STORAGE_SCAN_FLOW_LOCK).catch(() => {});
        router.replace({
          pathname: '/scan_cg',
          params: { fromGlobalScan: '1', pendingFromScan: '1', flow: 'create' },
        });
        resetAll();
        return;
      }
      await processCapturedUri(uriScanned);
    } catch (e) {
      console.log('[Scan] capture/normalize failed', e);
      setStep('idle');
      Alert.alert(
        'Erreur de traitement',
        'La photo n’a pas pu être traitée. Réessayez ou désactivez le recadrage IA si le problème persiste.'
      );
    } finally {
      scanFlowBusyRef.current = false;
      await userRemoveItem(STORAGE_SCAN_CAMERA_SESSION).catch(() => {});
      await userRemoveItem(STORAGE_SCAN_CAMERA_SESSION_AT).catch(() => {});
      await userRemoveItem(STORAGE_SCAN_FLOW_LOCK).catch(() => {});
    }
  }

  const runAnalysis = useCallback(async () => {
    if (!uri) {
      Alert.alert('Erreur', 'Photo manquante.');
      return;
    }
    setStep('analyzing');
    try {
      const normalized = await (await import('../../services/documentScan')).normalizeDocumentCapture(uri, {
        includeBase64: true,
        quality: 0.92,
        smartDocument: false,
        autoCropA4: false,
      });
      setUri(normalized.uri);
      setBase64(normalized.base64 ?? '');
      await analyzeCaptured(normalized.base64 ?? '');
    } catch (e) {
      console.log('[Scan] runAnalysis failed', e);
      setSuggestedId(2);
      setSelectedId(2);
      setAiReason("Analyse indisponible. Choisissez la section manuellement.");
      setStep('pick');
    }
  }, [analyzeCaptured, uri]);

  const continueWithoutAi = useCallback(() => {
    setSuggestedId(2);
    setSelectedId(2);
    setAiReason("Mode rapide activé: choisissez la section manuellement.");
    setStep('pick');
  }, []);

  const persistCtQuickFromSource = useCallback(async () => {
    if (!uri) {
      Alert.alert('Erreur', 'Photo manquante.');
      return;
    }
    try {
      skipNextAutoScanRef.current = true;
      await userSetItem(STORAGE_PENDING_CT_FROM_SCAN, uri);
      await syncScanDossierToSupabase({
        vehicleId: activeVehicleId,
        docType: 'controle_technique',
        title: 'CT — capture directe',
        payload: { imageUri: uri, flow: 'ct_quick_confirm' },
      });
      router.replace({
        pathname: '/ct',
        params: { fromGlobalScan: '1', pendingFromScan: '1' },
      } as any);
      await userRemoveItem(STORAGE_SCAN_FLOW_LOCK).catch(() => {});
      resetAll();
    } catch (e) {
      console.log('[Scan][CT] quick persist failed', e);
      Alert.alert('Erreur', "Impossible de créer le dossier CT.");
    }
  }, [activeVehicleId, resetAll, router, uri]);

  const goIntake = () => {
    const c = SCAN_CASES.find((x) => x.id === selectedId);
    if (!c) return;
    if (c.id === 4 && !facTitre.trim()) setFacTitre('Dépense scannée');
    if (c.id === 1 && !entTitre.trim()) setEntTitre('Note entretien');
    if (c.id === 3 && !diagTitre.trim()) setDiagTitre('Analyse / diagnostic');
    setStep('intake');
  };

  const persistAndNavigate = async () => {
    const c = SCAN_CASES.find((x) => x.id === selectedId);
    if (!c || !uri) {
      Alert.alert('Erreur', 'Photo manquante.');
      return;
    }

    try {
      switch (c.key) {
        case 'documents': {
          if (docType === 'Permis') {
            skipNextAutoScanRef.current = true;
            await userSetItem(STORAGE_PENDING_PERMIS_FROM_SCAN, uri);
            await syncScanDossierToSupabase({
              vehicleId: activeVehicleId,
              docType: 'permis',
              title: 'Permis (depuis scan)',
              payload: { imageUri: uri, aiReason, aiInsights, suggestedId, selectedId, flow: 'scan_permis' },
            });
            router.replace({
              pathname: '/scan_permis',
              params: { fromGlobalScan: '1', pendingFromScan: '1', flow: 'create' },
            });
            await userRemoveItem(STORAGE_SCAN_FLOW_LOCK).catch(() => {});
            resetAll();
            return;
          }
          if (docType === 'Carte Grise') {
            skipNextAutoScanRef.current = true;
            await userSetItem(STORAGE_PENDING_CG_FROM_SCAN, uri);
            await syncScanDossierToSupabase({
              vehicleId: activeVehicleId,
              docType: 'carte_grise',
              title: 'Carte grise (depuis scan)',
              payload: { imageUri: uri, aiReason, aiInsights, suggestedId, selectedId, flow: 'scan_cg' },
            });
            router.replace({
              pathname: '/scan_cg',
              params: { fromGlobalScan: '1', pendingFromScan: '1', flow: 'create' },
            });
            await userRemoveItem(STORAGE_SCAN_FLOW_LOCK).catch(() => {});
            resetAll();
            return;
          }
          const title = docTitle.trim() || docType.toUpperCase();
          const subtitle = docTitle.trim() ? `${docType} personnalisé` : `${docType} enregistré`;
          const nowTs = Date.now();
          const newDoc: DocFolder = {
            id: `doc-${Date.now()}`,
            titre: title,
            subtitle,
            icon: getIconByType(docType),
            type: docType,
            photoUri: uri,
            isDefault: false,
            createdAt: nowTs,
            updatedAt: nowTs,
          };
          const raw = await userGetItem(STORAGE_DOCS);
          const prev = raw ? (JSON.parse(raw) as DocFolder[]) : [];
          const next = Array.isArray(prev) ? [...prev, newDoc] : [newDoc];
          await userSetItem(STORAGE_DOCS, JSON.stringify(next));
          await syncScanDossierToSupabase({
            vehicleId: activeVehicleId,
            docType: `document_${docType}`,
            title,
            payload: { folder: newDoc, aiReason, aiInsights, suggestedId, selectedId },
          });
          Alert.alert('Enregistré', 'Document ajouté à Mes documents.');
          router.replace('/docs');
          await userRemoveItem(STORAGE_SCAN_FLOW_LOCK).catch(() => {});
          break;
        }
        case 'factures': {
          const nowTs = Date.now();
          const adresse = composeAddressParts(facAddressParts) || 'À compléter';
          const row: FactureRow = {
            id: Date.now().toString(),
            titre: facTitre.trim() || 'Dépense',
            garage: facGarage.trim() || 'À compléter',
            adresse,
            numero: facAddressParts.numero.trim(),
            rue: facAddressParts.rue.trim(),
            ville: facAddressParts.ville.trim(),
            dep: facAddressParts.dep.trim(),
            date: formatDateParts(facDateParts) || '—',
            km: facKm.trim() || '0',
            prixTTC: facPrix.trim() || '0',
            details: facDetails.trim() || 'Saisie rapide depuis le scan.',
            imageUri: uri,
            createdAt: nowTs,
            updatedAt: nowTs,
          };
          const raw = await userGetItem(STORAGE_FACTURES);
          const prev = raw ? (JSON.parse(raw) as FactureRow[]) : [];
          const next = Array.isArray(prev) ? [row, ...prev] : [row];
          await userSetItem(STORAGE_FACTURES, JSON.stringify(next));
          await syncScanDossierToSupabase({
            vehicleId: activeVehicleId,
            docType: 'facture',
            title: row.titre,
            payload: { row, aiReason, aiInsights, suggestedId, selectedId },
          });
          Alert.alert('Enregistré', 'Dépense enregistrée.');
          router.replace('/factures');
          await userRemoveItem(STORAGE_SCAN_FLOW_LOCK).catch(() => {});
          break;
        }
        case 'entretien': {
          const base = defaultEntretienModules();
          const raw = await userGetItem(STORAGE_ENTRETIEN);
          let modules: EntretienModules = base;
          if (raw) {
            try {
              const parsed = JSON.parse(raw) as Partial<EntretienModules> & {
                pneus?: Record<string, string>;
                batterie?: Record<string, string>;
                phares?: Partial<EntretienModules['phares']>;
                modeEmploi?: Record<string, string>;
              };
              modules = {
                ...base,
                ...parsed,
                pneus: { ...base.pneus, ...parsed.pneus },
                batterie: { ...base.batterie, ...parsed.batterie },
                phares: { ...base.phares, ...parsed.phares },
                modeEmploi: { ...base.modeEmploi, ...parsed.modeEmploi },
              };
            } catch {
              /* ignore */
            }
          }
          const line = [entTitre.trim(), entNotes.trim()].filter(Boolean).join(' — ');
          modules.phares.photoUri = uri;
          modules.phares.commentaire = [modules.phares.commentaire, line ? `[Scan] ${line}` : '']
            .filter(Boolean)
            .join('\n');
          await userSetItem(STORAGE_ENTRETIEN, JSON.stringify(modules));
          await syncScanDossierToSupabase({
            vehicleId: activeVehicleId,
            docType: 'entretien_scan',
            title: entTitre.trim() || 'Note entretien (scan)',
            payload: { line, imageUri: uri, aiReason, aiInsights, suggestedId, selectedId },
          });
          Alert.alert('Enregistré', 'Note ajoutée au carnet (section Phares / commentaire).');
          router.replace('/entretien');
          await userRemoveItem(STORAGE_SCAN_FLOW_LOCK).catch(() => {});
          break;
        }
        case 'diagnostics': {
          const nowTs = Date.now();
          const item: DiagScanItem = {
            id: `diag-${Date.now()}`,
            titre: diagTitre.trim() || 'Diagnostic',
            notes: diagNotes.trim(),
            imageUri: uri,
            createdAt: nowTs,
            updatedAt: nowTs,
          };
          const raw = await userGetItem(STORAGE_DIAG_SCAN);
          const prev = raw ? (JSON.parse(raw) as DiagScanItem[]) : [];
          const next = Array.isArray(prev) ? [item, ...prev] : [item];
          await userSetItem(STORAGE_DIAG_SCAN, JSON.stringify(next));
          await syncScanDossierToSupabase({
            vehicleId: activeVehicleId,
            docType: 'diagnostic_scan',
            title: item.titre,
            payload: { item, aiReason, aiInsights, suggestedId, selectedId },
          });
          Alert.alert('Enregistré', 'Élément enregistré dans Diagnostics.');
          router.replace('/diagnostics');
          await userRemoveItem(STORAGE_SCAN_FLOW_LOCK).catch(() => {});
          break;
        }
        case 'ct': {
          skipNextAutoScanRef.current = true;
          await userSetItem(STORAGE_PENDING_CT_FROM_SCAN, uri);
          await syncScanDossierToSupabase({
            vehicleId: activeVehicleId,
            docType: 'controle_technique',
            title: 'CT — analyse après scan',
            payload: { imageUri: uri, aiReason, aiInsights, suggestedId, selectedId, pendingRoute: '/ct' },
          });
          router.replace({
            pathname: '/ct',
            params: { fromGlobalScan: '1', pendingFromScan: '1' },
          });
          await userRemoveItem(STORAGE_SCAN_FLOW_LOCK).catch(() => {});
          resetAll();
          return;
        }
        default:
          break;
      }
      resetAll();
    } catch (e) {
      console.log('[Scan] persist failed', e);
      Alert.alert('Erreur', "Impossible d'enregistrer.");
    }
  };

  const framingModal = (
    <Modal visible={step === 'framing'} animationType="fade" onRequestClose={() => setStep('idle')}>
      <View style={[styles.framingRoot, { paddingTop: insets.top }]}>
        <Text style={styles.framingTitle}>Zone IA</Text>
        <Text style={styles.framingSub}>Cadrez le document ou l’élément utile, puis capturez.</Text>
        <View style={styles.frameWrap}>
          <View style={styles.iaFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        </View>
        <Text style={styles.frameHint}>Placez la feuille entière dans le cadre A4</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={takePhoto} activeOpacity={0.9}>
          <MaterialCommunityIcons name="camera" size={22} color="#0b0f14" />
          <Text style={styles.primaryBtnText}> PRENDRE LA PHOTO</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghostBtn} onPress={() => setStep('idle')}>
          <Text style={styles.ghostBtnText}>Fermer</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );

  const renderIntake = () => {
    const c = SCAN_CASES.find((x) => x.id === selectedId);
    if (!c) return null;
    return (
      <ScrollView
        style={styles.intakeScroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={false}
      >
        <Text style={styles.intakeHeading}>NOUVEAU DOSSIER — {c.short}</Text>
        <Text style={styles.intakeHint}>Complétez la fiche puis enregistrez le dossier dans cette case.</Text>

        {c.key === 'documents' && (
          <>
            <Text style={styles.label}>Type de document</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} scrollEnabled={false}>
              {DOC_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, docType === t && styles.chipOn]}
                  onPress={() => setDocType(t)}
                >
                  <Text style={[styles.chipTxt, docType === t && styles.chipTxtOn]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.label}>Titre (optionnel)</Text>
            <TextInput
              style={styles.input}
              placeholder="ex: Assurance 2026"
              placeholderTextColor="#64748b"
              value={docTitle}
              onChangeText={setDocTitle}
            />
          </>
        )}

        {c.key === 'entretien' && (
          <>
            <Text style={styles.label}>Titre</Text>
            <TextInput
              style={styles.input}
              placeholder="ex: Vidange, pneus…"
              placeholderTextColor="#64748b"
              value={entTitre}
              onChangeText={setEntTitre}
            />
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              placeholder="Précisions, date, km…"
              placeholderTextColor="#64748b"
              multiline
              value={entNotes}
              onChangeText={setEntNotes}
              autoCapitalize="sentences"
              autoCorrect
            />
          </>
        )}

        {c.key === 'diagnostics' && (
          <>
            <Text style={styles.label}>Titre</Text>
            <TextInput
              style={styles.input}
              placeholder="ex: Voyant moteur"
              placeholderTextColor="#64748b"
              value={diagTitre}
              onChangeText={setDiagTitre}
            />
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              placeholder="Code erreur, symptômes…"
              placeholderTextColor="#64748b"
              multiline
              value={diagNotes}
              onChangeText={setDiagNotes}
              autoCapitalize="sentences"
              autoCorrect
            />
          </>
        )}

        {c.key === 'factures' && (
          <>
            <Text style={styles.label}>Intitulé</Text>
            <TextInput style={styles.input} value={facTitre} onChangeText={setFacTitre} placeholderTextColor="#64748b" />
            <Text style={styles.label}>Garage / lieu</Text>
            <TextInput
              style={styles.input}
              value={facGarage}
              onChangeText={setFacGarage}
              placeholder="Nom du garage"
              placeholderTextColor="#64748b"
            />
            <Text style={styles.label}>Adresse</Text>
            <AddressPartsAutocompleteInput value={facAddressParts} onChange={setFacAddressParts} inputStyle={styles.input} />
            <Text style={styles.label}>Date (JJ/MM/AAAA)</Text>
            <View style={styles.datePartsWrap}>
              <TextInput
                style={[styles.input, styles.datePartInput]}
                value={facDateParts.day}
                onChangeText={(v) => setFacDateParts((p) => ({ ...p, day: v.replace(/\D/g, '').slice(0, 2) }))}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={2}
                placeholder="JJ"
                placeholderTextColor="#64748b"
              />
              <TextInput
                style={[styles.input, styles.datePartInput]}
                value={facDateParts.month}
                onChangeText={(v) => setFacDateParts((p) => ({ ...p, month: v.replace(/\D/g, '').slice(0, 2) }))}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={2}
                placeholder="MM"
                placeholderTextColor="#64748b"
              />
              <TextInput
                style={[styles.input, styles.datePartYearInput]}
                value={facDateParts.year}
                onChangeText={(v) => setFacDateParts((p) => ({ ...p, year: v.replace(/\D/g, '').slice(0, 4) }))}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={4}
                placeholder="AAAA"
                placeholderTextColor="#64748b"
              />
            </View>
            <Text style={styles.label}>Km</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={facKm}
              onChangeText={setFacKm}
              placeholderTextColor="#64748b"
            />
            <Text style={styles.label}>Montant TTC (€)</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={facPrix}
              onChangeText={setFacPrix}
              placeholderTextColor="#64748b"
            />
            <Text style={styles.label}>Détails</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              multiline
              value={facDetails}
              onChangeText={setFacDetails}
              placeholderTextColor="#64748b"
              autoCapitalize="sentences"
              autoCorrect
            />
          </>
        )}

        {c.key === 'ct' && (
          <Text style={styles.ctInfo}>
            La photo sera analysée par l’IA sur l’écran Contrôle technique pour créer un dossier (date, km, résultat…).
          </Text>
        )}

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() =>
            Alert.alert('Confirmer l’enregistrement', 'Voulez-vous enregistrer ce dossier ?', [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Enregistrer', onPress: () => void persistAndNavigate() },
            ])
          }
          activeOpacity={0.9}
        >
          <Text style={styles.primaryBtnText}>ENREGISTRER LE DOSSIER</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghostBtn} onPress={() => setStep('pick')}>
          <Text style={styles.ghostBtnText}>RETOUR AU CHOIX</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : insets.top}
    >
      <View
        style={[
          styles.container,
          step !== 'idle' && step !== 'analyzing' && styles.containerWide,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 },
        ]}
      >
        {step === 'idle' && (
          <View style={styles.centerCol}>
            <Text style={styles.title}>Scan intelligent</Text>
            <Text style={styles.subtitle}>
              Lancez une nouvelle capture pour classer automatiquement votre document.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={takePhoto} activeOpacity={0.9}>
              <MaterialCommunityIcons name="camera" size={22} color="#0b0f14" />
              <Text style={styles.primaryBtnText}> DÉMARRER LE SCAN</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ghostBtn}
              onPress={leaveScan}
            >
              <Text style={styles.ghostBtnText}>{launchedFromCt ? 'RETOUR CT' : 'RETOUR'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'preview' && uri ? (
          <ScrollView contentContainerStyle={styles.previewBox} keyboardDismissMode="on-drag" scrollEnabled={false}>
            <Text style={styles.title}>{launchedFromCt ? 'Aperçu CT' : 'Aperçu'}</Text>
            <Image source={{ uri }} style={styles.previewImg} />
            {launchedFromCt ? (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() =>
                  Alert.alert('Créer le dossier CT ?', 'Confirmer la photo et créer le dossier contrôle technique ?', [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Confirmer', onPress: () => void persistCtQuickFromSource() },
                  ])
                }
                activeOpacity={0.9}
              >
                <MaterialCommunityIcons name="check-circle-outline" size={22} color="#0b0f14" />
                <Text style={styles.primaryBtnText}> CONFIRMER ET CRÉER LE DOSSIER</Text>
              </TouchableOpacity>
            ) : (
              <>
                <Text style={styles.afterScanPrompt}>Photo capturée. Que voulez-vous faire ?</Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={continueWithoutAi} activeOpacity={0.9}>
                  <MaterialCommunityIcons name="folder-plus-outline" size={22} color="#0b0f14" />
                  <Text style={styles.primaryBtnText}> CRÉER UN DOSSIER</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryActionBtn} onPress={runAnalysis} activeOpacity={0.9}>
                  <MaterialCommunityIcons name="robot-outline" size={18} color="#cbd5e1" />
                  <Text style={styles.secondaryActionBtnText}>Analyser avec l'IA (optionnel)</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep('framing')}>
              <Text style={styles.secondaryBtnText}>Reprendre la photo</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : null}

        {step === 'analyzing' && (
          <View style={styles.centerCol}>
            <ActivityIndicator size="large" color="#00F2FF" />
            <Text style={styles.analyzingTxt}>L’IA analyse la photo…</Text>
          </View>
        )}

        {step === 'pick' && (
          <View style={styles.pickWrap}>
            <Text style={styles.title}>CHOISIR LA CASE</Text>
            <View style={styles.pickCard}>
              {aiReason ? (
                <View style={styles.aiBubble}>
                  <MaterialCommunityIcons name="robot" size={20} color="#00F2FF" />
                  <Text style={styles.aiBubbleTxt}>{aiReason}</Text>
                </View>
              ) : null}
              <Text style={styles.pickSub}>Suggestion IA : {SCAN_CASES.find((x) => x.id === suggestedId)?.short}</Text>
              <ScrollView
                style={{ maxHeight: H * 0.36 }}
                contentContainerStyle={{ paddingBottom: 4 }}
                keyboardDismissMode="on-drag"
                scrollEnabled={false}
              >
                {SCAN_CASES.map((c) => {
                  const sel = selectedId === c.id;
                  const sug = suggestedId === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.caseRow, sel && styles.caseRowOn, sug && !sel && styles.caseRowSug]}
                      onPress={() => setSelectedId(c.id)}
                      activeOpacity={0.85}
                    >
                      <MaterialCommunityIcons
                        name={sel ? 'radiobox-marked' : 'radiobox-blank'}
                        size={22}
                        color={sel ? '#00F2FF' : '#64748b'}
                      />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.caseTitle}>{c.title}</Text>
                        {sug ? <Text style={styles.sugTag}>Suggéré par l’IA</Text> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity style={styles.primaryBtn} onPress={goIntake} activeOpacity={0.9}>
                <Text style={styles.primaryBtnText}>CONFIRMER LA CASE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={resetAll}>
                <Text style={styles.ghostBtnText}>REFAIRE UN SCAN</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 'intake' && renderIntake()}

        {framingModal}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0f14' },
  container: { flex: 1, paddingHorizontal: 18, alignItems: 'center' },
  containerWide: { alignItems: 'stretch' },
  title: { color: '#e2e8f0', fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  subtitle: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00E9F5',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignSelf: 'stretch',
    marginTop: 10,
  },
  primaryBtnText: { color: '#0b0f14', fontWeight: '900', fontSize: 13, letterSpacing: 0.3 },
  secondaryBtn: { marginTop: 10, padding: 10 },
  secondaryBtnText: { color: '#94a3b8', fontWeight: '600', fontSize: 13 },
  secondaryActionBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#111827',
  },
  secondaryActionBtnText: { color: '#cbd5e1', fontWeight: '700', fontSize: 12.5 },
  ghostBtn: { marginTop: 12, padding: 8 },
  ghostBtnText: { color: '#64748b', fontWeight: '600', fontSize: 13 },
  previewBox: { alignItems: 'stretch', width: '100%' },
  previewImg: { width: '100%', height: H * 0.38, borderRadius: 12, marginBottom: 14, backgroundColor: '#111827' },
  afterScanPrompt: {
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 2,
    fontWeight: '700',
  },
  centerCol: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  analyzingTxt: { color: '#94a3b8', marginTop: 16, fontSize: 14 },
  aiBubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#00F2FF',
    marginBottom: 14,
  },
  aiBubbleTxt: { flex: 1, color: '#e2e8f0', fontSize: 13, lineHeight: 18 },
  pickWrap: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
  },
  pickCard: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 14,
    padding: 12,
  },
  pickSub: { color: '#94a3b8', fontSize: 12, marginBottom: 14, textAlign: 'center' },
  caseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
    alignSelf: 'stretch',
  },
  caseRowOn: { borderColor: '#00F2FF', backgroundColor: 'rgba(0,242,255,0.08)' },
  caseRowSug: { borderColor: 'rgba(0,242,255,0.35)' },
  caseTitle: { color: '#e2e8f0', fontWeight: '700', fontSize: 12.5 },
  sugTag: { color: '#00E9F5', fontSize: 10, marginTop: 4, fontWeight: '700' },
  intakeScroll: { flex: 1, width: '100%' },
  intakeHeading: { color: '#e2e8f0', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  intakeHint: { color: '#64748b', fontSize: 12, marginBottom: 12 },
  label: { color: '#94a3b8', fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 9 },
  input: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 12,
    color: '#e2e8f0',
    fontSize: 14,
    marginBottom: 2,
  },
  datePartsWrap: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 2,
  },
  datePartInput: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '700',
  },
  datePartYearInput: {
    flex: 1.4,
    textAlign: 'center',
    fontWeight: '700',
  },
  inputMulti: { minHeight: 100, textAlignVertical: 'top' },
  chipScroll: { marginBottom: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: '#0f172a',
  },
  chipOn: { borderColor: '#00F2FF', backgroundColor: 'rgba(0,242,255,0.12)' },
  chipTxt: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  chipTxtOn: { color: '#00F2FF' },
  ctInfo: { color: '#94a3b8', fontSize: 13, lineHeight: 20, marginBottom: 16 },
  framingRoot: {
    flex: 1,
    backgroundColor: '#05080c',
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  framingTitle: { color: '#00F2FF', fontSize: 22, fontWeight: '900', textAlign: 'center' },
  framingSub: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 8, marginBottom: 24 },
  frameWrap: {
    flex: 1,
    maxHeight: H * 0.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iaFrame: {
    width: W * 0.78,
    height: Math.min(H * 0.56, W * 0.78 * 1.414),
    borderRadius: 14,
    borderWidth: 1.6,
    borderStyle: 'dashed',
    borderColor: '#00F2FF',
    backgroundColor: 'rgba(0,242,255,0.04)',
    position: 'relative',
  },
  frameHint: {
    textAlign: 'center',
    color: '#64748b',
    fontSize: 12,
    marginBottom: 10,
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#00F2FF',
  },
  cornerTL: { top: 6, left: 6, borderTopWidth: 2.5, borderLeftWidth: 2.5 },
  cornerTR: { top: 6, right: 6, borderTopWidth: 2.5, borderRightWidth: 2.5 },
  cornerBL: { bottom: 6, left: 6, borderBottomWidth: 2.5, borderLeftWidth: 2.5 },
  cornerBR: { bottom: 6, right: 6, borderBottomWidth: 2.5, borderRightWidth: 2.5 },
});
