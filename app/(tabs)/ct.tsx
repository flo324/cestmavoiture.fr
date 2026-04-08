import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
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
import { AddressAutocompleteInput } from '../../components/AddressAutocompleteInput';
import { UI_THEME } from '../../constants/uiTheme';
import { normalizeDocumentCapture } from '../../services/documentScan';
import { scanDocumentWithFallback } from '../../services/nativeDocumentScanner';
import { userGetItem, userSetItem } from '../../services/userStorage';

const STORAGE_KEY_CT_FOLDERS = '@ma_voiture_ct_folders_v2';
const GEMINI_MODEL = 'gemini-2.0-flash';

type CtInfoState = {
  dateCt: string;
  kmScanne: string;
  resultat: string;
  garageAdresse: string;
  pointsVerifier: string;
  defauts: string;
  prochainCt: string;
  reparations: string;
  extractionMode?: 'STRUCTURED' | 'OCR_FALLBACK';
  aiStatus?: 'OK' | 'QUOTA' | 'ERROR';
};

type CtFolder = {
  id: string;
  name: string;
  imageUri: string;
  info: CtInfoState;
  createdAt: number;
  updatedAt: number;
};

function parseFrDate(s: string): Date | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
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

function daysUntil(dateFr: string): number | null {
  const d = parseFrDate(dateFr);
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function urgencyBackground(daysLeft: number): string {
  if (daysLeft < 0) return '#C53030';
  if (daysLeft < 30) return '#e74c3c';
  if (daysLeft < 180) return '#e67e22';
  return '#2ecc71';
}

function resultBadgeColor(resultat: string): string {
  const r = String(resultat || '').toUpperCase();
  if (r.includes('DEFAVORABLE') || r.includes('CONTRE')) return '#C53030';
  if (r.includes('FAVORABLE')) return '#2ecc71';
  return '#64748b';
}

function splitBulletLines(raw: string): string[] {
  return String(raw ?? '')
    .split(/\r?\n|[;]+/)
    .map((l) => l.replace(/^[-*.\s]+/, '').trim())
    .filter(Boolean);
}

function classifyPriority(line: string): 'URGENT' | 'A PLANIFIER' | 'SUIVI' {
  const text = line.toLowerCase();
  if (
    /\b(critique|majeur|dangereux|contre[-\s]?visite|frein|direction|suspension|pneu|fuite|corrosion)\b/.test(
      text
    )
  ) {
    return 'URGENT';
  }
  if (/\b(usure|jeu|amortisseur|echappement|pollution|eclairage|signalisation)\b/.test(text)) {
    return 'A PLANIFIER';
  }
  return 'SUIVI';
}

function buildRepairsPlan(input: {
  resultat: string;
  pointsVerifier: string;
  defauts: string;
}): string {
  const rows = [...splitBulletLines(input.pointsVerifier), ...splitBulletLines(input.defauts)];
  const uniqRows = Array.from(new Set(rows.map((r) => r.trim()).filter(Boolean)));
  if (!uniqRows.length) return '';

  const grouped: Record<'URGENT' | 'A PLANIFIER' | 'SUIVI', string[]> = {
    URGENT: [],
    'A PLANIFIER': [],
    SUIVI: [],
  };

  for (const row of uniqRows) {
    grouped[classifyPriority(row)].push(row);
  }

  const resultatUpper = String(input.resultat ?? '').toUpperCase();
  if (resultatUpper.includes('CONTRE') || resultatUpper.includes('DEFAVORABLE')) {
    grouped.URGENT.unshift('Resultat CT non favorable: traiter les points urgents en priorite.');
  }

  const sections: string[] = [];
  if (grouped.URGENT.length) {
    sections.push(`URGENT\n${grouped.URGENT.map((x) => `- ${x}`).join('\n')}`);
  }
  if (grouped['A PLANIFIER'].length) {
    sections.push(`A PLANIFIER\n${grouped['A PLANIFIER'].map((x) => `- ${x}`).join('\n')}`);
  }
  if (grouped.SUIVI.length) {
    sections.push(`SUIVI\n${grouped.SUIVI.map((x) => `- ${x}`).join('\n')}`);
  }

  return sections.join('\n\n');
}

function normalizeFrDate(raw: string): string {
  const m = String(raw ?? '').match(/(\d{1,2})[\/.\-\s](\d{1,2})[\/.\-\s](\d{2,4})/);
  if (!m) return '';
  const d = String(parseInt(m[1], 10)).padStart(2, '0');
  const mo = String(parseInt(m[2], 10)).padStart(2, '0');
  let y = String(parseInt(m[3], 10));
  if (y.length === 2) y = `20${y}`;
  return `${d}/${mo}/${y}`;
}

function pickFirst(text: string, patterns: RegExp[]): string {
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return String(m[1]).trim();
  }
  return '';
}

function extractCtFromRawText(rawText: string): {
  dateControle: string;
  numeroPv: string;
  resultat: string;
  limiteValidite: string;
  centre: string;
  km: string;
  defaillances: string;
} {
  const text = String(rawText ?? '').replace(/\r/g, '');
  const lower = text.toLowerCase();
  const dateControle = normalizeFrDate(
    pickFirst(text, [
      /date\s*du?\s*contr[oô]le\s*[:\-]?\s*([0-3]?\d[\/.\-\s][0-1]?\d[\/.\-\s]\d{2,4})/i,
      /date\s*de\s*contr[oô]le\s*[:\-]?\s*([0-3]?\d[\/.\-\s][0-1]?\d[\/.\-\s]\d{2,4})/i,
    ])
  );
  const numeroPv = pickFirst(text, [
    /num[ée]ro\s*du?\s*proc[eè]s[\s\-]?verbal\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
    /proc[eè]s[\s\-]?verbal\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
  ]);
  const limiteValidite = normalizeFrDate(
    pickFirst(text, [
      /limite\s*de\s*validit[ée].{0,40}?([0-3]?\d[\/.\-\s][0-1]?\d[\/.\-\s]\d{2,4})/i,
      /validit[ée].{0,20}?jusqu['’]?\s*au?\s*([0-3]?\d[\/.\-\s][0-1]?\d[\/.\-\s]\d{2,4})/i,
    ])
  );
  const km = pickFirst(text, [
    /relev[ée]\s*du?\s*kilom[eé]trage\s*[:\-]?\s*([\d\s]{2,})/i,
    /kilom[eé]trage\s*[:\-]?\s*([\d\s]{2,})/i,
  ]).replace(/[^\d]/g, '');
  const centre = pickFirst(text, [
    /identification\s*du?\s*centre\s*de\s*contr[oô]le\s*[:\-]?\s*([^\n]+)/i,
    /centre\s*de\s*contr[oô]le\s*[:\-]?\s*([^\n]+)/i,
  ]);

  let resultat = '';
  if (/\bcontre[\s\-]?visite\b/i.test(lower)) resultat = 'A CONTRE-VISITE';
  else if (/\bd[ée]favorable\b/i.test(lower)) resultat = 'DEFAVORABLE';
  else if (/\bfavorable\b/i.test(lower)) resultat = 'FAVORABLE';

  let defaillances = '';
  const defBlock = text.match(
    /(d[ée]faillances?\s*et\s*niveaux?\s*de\s*gravit[ée][\s\S]{0,1500})/i
  );
  if (defBlock?.[1]) {
    defaillances = defBlock[1]
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 18)
      .join('\n');
  }

  return { dateControle, numeroPv, resultat, limiteValidite, centre, km, defaillances };
}

async function transcribeCtTextWithIA(base64Image: string, apiKey: string): Promise<string> {
  const prompt = [
    'Lis ce document de controle technique francais.',
    'Transcris le texte visible aussi fidèlement que possible.',
    'Priorite aux sections: nature du controle, date de controle, numero du proces-verbal, resultat du controle, limite de validite, identification du centre, defaillances et niveaux de gravite, releve du kilometrage.',
    'Reponds en texte brut uniquement.',
  ].join('\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1800 },
      }),
    }
  );
  if (!response.ok) return '';
  const json = await response.json();
  return String(json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
}

async function analyzeCtWithIA(uri: string): Promise<CtInfoState> {
  const fallbackNow = new Date();
  const fallbackExpiry = addYears(fallbackNow, 2);

  const fallback: CtInfoState = {
    dateCt: formatFr(fallbackNow),
    kmScanne: '0',
    resultat: 'A VERIFIER',
    garageAdresse: 'A completer',
    pointsVerifier: 'Aucun point detecte automatiquement. Verifiez visuellement le document.',
    defauts: 'Analyse automatique indisponible ou partielle. Completez/corrigez les informations.',
    prochainCt: formatFr(fallbackExpiry),
    reparations: '',
  };

  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) return fallback;

  try {
    const base64Image = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!base64Image) return fallback;

    const prompt = [
      'Tu analyses un document officiel de CONTROLE TECHNIQUE FRANCAIS.',
      'Priorite absolue: verifier que le document contient bien la mention "CONTROLE TECHNIQUE" (souvent en haut de page).',
      'Lis le document et extrais de maniere ciblee ces rubriques :',
      '1) natureControle : texte de la case "nature du controle".',
      '2) dateControle : texte de la case "date de controle" au format JJ/MM/AAAA si possible.',
      '3) numeroProcesVerbal : texte de la case "numero du proces-verbal".',
      '4) resultatControle : texte de la case "resultat du controle".',
      '5) limiteValidite : texte de la case "limite de validite du controle realise" (JJ/MM/AAAA si possible).',
      '6) identificationCentre : texte de la case "identification du centre de controle".',
      '7) defaillancesGravite : texte de la zone "defaillances et niveaux de gravite" (garde les lignes).',
      '8) releveKilometrage : valeur de la case "releve du kilometrage" (chiffres si possible).',
      '9) documentCtDetecte : true si le document est bien un CT, false sinon.',
      'Si une valeur est introuvable, mets une chaine vide.',
      'Reponds UNIQUEMENT en JSON strict (sans markdown) avec EXACTEMENT ces cles :',
      '{"documentCtDetecte":true,"natureControle":"","dateControle":"","numeroProcesVerbal":"","resultatControle":"","limiteValidite":"","identificationCentre":"","defaillancesGravite":"","releveKilometrage":""}',
    ].join('\n');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
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
                    data: base64Image,
                  },
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.1 },
        }),
      }
    );

    if (!response.ok) {
      let reason = `HTTP ${response.status}`;
      try {
        const err = await response.text();
        if (err) reason = `${reason} - ${err.slice(0, 220)}`;
      } catch {
        /* ignore */
      }
      const quotaReached = response.status === 429 || /quota|rate.?limit/i.test(reason);
      return {
        ...fallback,
        pointsVerifier: quotaReached
          ? 'Quota IA atteint (429). Saisie manuelle assistée activée: complétez les champs du dossier.'
          : `Echec analyse IA: ${reason}. Verifiez la cle API et la connexion reseau.`,
        aiStatus: quotaReached ? 'QUOTA' : 'ERROR',
      };
    }
    const json = await response.json();
    const rawText = String(json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
    const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse((jsonMatch?.[0] ?? '{}').trim()) as {
      documentCtDetecte?: boolean;
      natureControle?: string;
      dateControle?: string;
      numeroProcesVerbal?: string;
      resultatControle?: string;
      limiteValidite?: string;
      identificationCentre?: string;
      defaillancesGravite?: string;
      releveKilometrage?: string;
    };

    const ctDetected = Boolean(parsed?.documentCtDetecte);
    const natureControleRaw = String(parsed?.natureControle ?? '').trim();
    const pvRaw = String(parsed?.numeroProcesVerbal ?? '').trim();
    const dateCtRaw = String(parsed?.dateControle ?? '').trim();
    const kmScanneRaw = String(parsed?.releveKilometrage ?? '').replace(/[^\d]/g, '');
    const garageAdresseRaw = String(parsed?.identificationCentre ?? '').trim();
    const defautsRaw = String(parsed?.defaillancesGravite ?? '').trim();
    const resultatRaw = String(parsed?.resultatControle ?? '').trim().toUpperCase();
    const limiteValiditeRaw = String(parsed?.limiteValidite ?? '').trim();

    const parsedDate = parseFrDate(dateCtRaw);
    const parsedValidite = parseFrDate(limiteValiditeRaw);
    const prochainCt = parsedValidite
      ? formatFr(parsedValidite)
      : parsedDate
        ? formatFr(addYears(parsedDate, 2))
        : fallback.prochainCt;

    const pointsVerifierRows = [
      ctDetected ? 'Document CT detecte: OUI' : 'Document CT detecte: INCERTAIN (verifier manuellement).',
      natureControleRaw ? `Nature du controle: ${natureControleRaw}` : '',
      pvRaw ? `Numero du proces-verbal: ${pvRaw}` : '',
    ].filter(Boolean);
    const pointsVerifierRaw = pointsVerifierRows.join('\n');

    let merged: CtInfoState = {
      dateCt: dateCtRaw || fallback.dateCt,
      kmScanne: kmScanneRaw || fallback.kmScanne,
      resultat: resultatRaw || fallback.resultat,
      garageAdresse: garageAdresseRaw || fallback.garageAdresse,
      pointsVerifier: pointsVerifierRaw || fallback.pointsVerifier,
      defauts: defautsRaw || fallback.defauts,
      prochainCt,
      reparations: buildRepairsPlan({
        resultat: resultatRaw || fallback.resultat,
        pointsVerifier: pointsVerifierRaw || '',
        defauts: defautsRaw || '',
      }),
      extractionMode: 'STRUCTURED',
      aiStatus: 'OK',
    };

    // Surcouche additive: si la passe structurée est pauvre, on fait une lecture brute OCR-like
    const weakStructured =
      !ctDetected ||
      !merged.dateCt ||
      merged.resultat === 'A VERIFIER' ||
      !merged.kmScanne ||
      merged.defauts === fallback.defauts;

    if (weakStructured) {
      const rawText = await transcribeCtTextWithIA(base64Image, apiKey);
      if (rawText) {
        const x = extractCtFromRawText(rawText);
        const mergedPoints = [
          merged.pointsVerifier,
          x.numeroPv ? `Numero du proces-verbal: ${x.numeroPv}` : '',
          x.dateControle ? `Date de controle (OCR): ${x.dateControle}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        const fallbackResultat = x.resultat || merged.resultat;
        const fallbackDefauts = x.defaillances || merged.defauts;
        const fallbackDate = x.dateControle || merged.dateCt;
        const fallbackKm = x.km || merged.kmScanne;
        const fallbackCentre = x.centre || merged.garageAdresse;
        const fallbackValidite = x.limiteValidite || merged.prochainCt;

        merged = {
          ...merged,
          dateCt: fallbackDate || fallback.dateCt,
          kmScanne: fallbackKm || fallback.kmScanne,
          resultat: fallbackResultat || fallback.resultat,
          garageAdresse: fallbackCentre || fallback.garageAdresse,
          pointsVerifier: mergedPoints || merged.pointsVerifier,
          defauts: fallbackDefauts || merged.defauts,
          prochainCt: fallbackValidite || merged.prochainCt,
          reparations: buildRepairsPlan({
            resultat: fallbackResultat || fallback.resultat,
            pointsVerifier: mergedPoints || '',
            defauts: fallbackDefauts || '',
          }),
          extractionMode: 'OCR_FALLBACK',
          aiStatus: 'OK',
        };
      }
    }

    return merged;
  } catch (error) {
    console.log('[CT] analyze with IA failed', error);
    return {
      ...fallback,
      pointsVerifier: `Analyse IA indisponible (${String((error as Error)?.message ?? 'erreur inconnue')}).`,
      aiStatus: /429|quota|rate.?limit/i.test(String((error as Error)?.message ?? '')) ? 'QUOTA' : 'ERROR',
    };
  }
}

export default function CtScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    imageCaptured?: string;
    fromGlobalScan?: string;
  }>();

  const [folders, setFolders] = useState<CtFolder[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imageModal, setImageModal] = useState(false);
  const [hydrated, setHydrated] = useState(false);

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
    const load = async () => {
      try {
        const raw = await userGetItem(STORAGE_KEY_CT_FOLDERS);
        if (!raw) return;
        const parsed = JSON.parse(raw) as CtFolder[];
        if (Array.isArray(parsed)) setFolders(parsed);
      } catch (error) {
        console.log('[CT] load folders failed', error);
      } finally {
        setHydrated(true);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    userSetItem(STORAGE_KEY_CT_FOLDERS, JSON.stringify(folders)).catch((error) => {
      console.log('[CT] save folders failed', error);
    });
  }, [folders, hydrated]);

  useEffect(() => {
    const incomingUri = typeof params.imageCaptured === 'string' ? params.imageCaptured : '';
    const fromGlobal = typeof params.fromGlobalScan === 'string' ? params.fromGlobalScan : '';
    if (!incomingUri || fromGlobal !== '1') return;
    createFolderFromImage(incomingUri).catch(() => {});
  }, [params.imageCaptured, params.fromGlobalScan]);

  const selectedFolder = useMemo(
    () => folders.find((f) => f.id === selectedId) ?? null,
    [folders, selectedId]
  );

  const updateSelectedInfo = (key: keyof CtInfoState, value: string) => {
    if (!selectedId) return;
    setFolders((prev) =>
      prev.map((f) => (f.id === selectedId ? { ...f, info: { ...f.info, [key]: value }, updatedAt: Date.now() } : f))
    );
  };

  const updateSelectedName = (value: string) => {
    if (!selectedId) return;
    setFolders((prev) => prev.map((f) => (f.id === selectedId ? { ...f, name: value, updatedAt: Date.now() } : f)));
  };

  const regenerateRepairsPlanForSelected = () => {
    if (!selectedId) return;
    setFolders((prev) =>
      prev.map((f) => {
        if (f.id !== selectedId) return f;
        const nextPlan = buildRepairsPlan({
          resultat: f.info.resultat,
          pointsVerifier: f.info.pointsVerifier,
          defauts: f.info.defauts,
        });
        return { ...f, info: { ...f.info, reparations: nextPlan }, updatedAt: Date.now() };
      })
    );
  };

  const createFolderFromImage = async (uri: string) => {
    setIsAnalyzing(true);
    try {
      const analyzed = await analyzeCtWithIA(uri);
      const folder: CtFolder = {
        id: `ct-${Date.now()}`,
        name: `CT ${analyzed.dateCt}`,
        imageUri: uri,
        info: analyzed,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setFolders((prev) => [folder, ...prev]);
      setSelectedId(folder.id);
      if (analyzed.aiStatus === 'QUOTA') {
        Alert.alert(
          'Quota IA atteint',
          'La lecture automatique est temporairement indisponible. Le dossier est créé et vous pouvez compléter les champs manuellement.'
        );
      } else if (analyzed.aiStatus === 'ERROR') {
        Alert.alert(
          'Analyse partielle',
          'Le dossier est créé, mais certaines informations n’ont pas pu être lues automatiquement.'
        );
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleNewFolder = async () => {
    const uriScanned = await scanDocumentWithFallback();
    if (!uriScanned) {
      Alert.alert('Permission requise', 'Autorisez la caméra pour créer un dossier CT.');
      return;
    }
    const normalized = await normalizeDocumentCapture(uriScanned, {
      quality: 0.95,
      smartDocument: true,
      autoCropA4: true,
    });
    await createFolderFromImage(normalized.uri);
  };

  const confirmDeleteFolder = (id: string) => {
    Alert.alert(
      'Supprimer le dossier ?',
      'Êtes-vous sûr de vouloir supprimer définitivement ce dossier ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            setFolders((prev) => prev.filter((f) => f.id !== id));
            if (selectedId === id) setSelectedId(null);
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <ImageBackground
        source={{ uri: 'https://images.unsplash.com/photo-1486006920555-c77dcf18193c?auto=format&fit=crop&w=1600&q=70' }}
        style={styles.heroBanner}
        imageStyle={styles.heroBannerImage}
      >
        <LinearGradient colors={['rgba(0,0,0,0.16)', 'rgba(0,0,0,0.72)', '#0b0f14']} locations={[0, 0.55, 1]} style={styles.heroOverlay}>
          <View style={styles.heroIconWrap}>
            <MaterialCommunityIcons name="clipboard-text-search-outline" size={30} color="#00F2FF" />
          </View>
          <Text style={styles.pageTitle}>Mes contrôles techniques</Text>
          <Text style={styles.heroSubtitle}>Suivi professionnel, clair et visuel de vos dossiers CT</Text>
        </LinearGradient>
      </ImageBackground>

      <Pressable onPress={handleNewFolder} style={({ pressed }) => [styles.newFolderBtnWrap, pressed && styles.scaleDown]}>
        <LinearGradient colors={['#05080d', '#0d1b12']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.newFolderBtn}>
          <MaterialCommunityIcons name="plus-circle-outline" size={20} color="#86efac" />
          <Text style={styles.newFolderText}>Nouveau dossier CT</Text>
        </LinearGradient>
      </Pressable>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardDismissMode="on-drag">
        {folders.map((folder) => {
          const left = daysUntil(folder.info.prochainCt);
          return (
            <Pressable key={folder.id} style={({ pressed }) => [styles.folderCard, pressed && styles.scaleDown]} onPress={() => setSelectedId(folder.id)}>
              <View style={styles.folderRow}>
                <MaterialCommunityIcons name="file-document-outline" size={24} color="#00F2FF" />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={styles.folderName}>{folder.name}</Text>
                  <Text style={styles.folderSub}>Visite: {folder.info.dateCt || '0'}</Text>
                  <Text style={styles.folderSub}>Créé le: {formatDateTime(folder.createdAt)}</Text>
                  <Text style={styles.folderSub}>Modifié le: {formatDateTime(folder.updatedAt || folder.createdAt)}</Text>
                  <View style={[styles.resultBadge, { backgroundColor: resultBadgeColor(folder.info.resultat) }]}>
                    <Text style={styles.resultBadgeText}>{folder.info.resultat || 'A VERIFIER'}</Text>
                  </View>
                </View>
                <Pressable onPress={() => confirmDeleteFolder(folder.id)} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
                  <MaterialCommunityIcons name="delete-outline" size={22} color="#C53030" />
                </Pressable>
              </View>
              {left != null ? (
                <View style={[styles.banner, { backgroundColor: urgencyBackground(left) }]}>
                  <Text style={styles.bannerText}>
                    Echeance du prochain CT : {left >= 0 ? `${left} j` : `expire ${Math.abs(left)} j`} ({folder.info.prochainCt})
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <Modal visible={!!selectedFolder} animationType="slide" onRequestClose={() => setSelectedId(null)}>
        <View style={styles.editorContainer}>
          <View style={styles.editorHeader}>
            <TouchableOpacity onPress={() => setSelectedId(null)}>
              <MaterialCommunityIcons name="arrow-left" size={24} color="#00F2FF" />
            </TouchableOpacity>
            <Text style={styles.editorTitle}>Dossier CT</Text>
            <TouchableOpacity onPress={() => selectedFolder && confirmDeleteFolder(selectedFolder.id)}>
              <MaterialCommunityIcons name="delete-outline" size={24} color="#C53030" />
            </TouchableOpacity>
          </View>

          {selectedFolder ? (
            <ScrollView
              contentContainerStyle={{ paddingBottom: 28 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <TouchableOpacity style={styles.imageWrap} onPress={() => setImageModal(true)}>
                <Image source={{ uri: selectedFolder.imageUri }} style={styles.image} />
                <Text style={styles.imageTxt}>Ouvrir en plein écran</Text>
              </TouchableOpacity>

              <View style={styles.formCard}>
                {selectedFolder.info.extractionMode === 'OCR_FALLBACK' ? (
                  <View style={styles.extractionBadge}>
                    <MaterialCommunityIcons name="shield-check-outline" size={14} color="#00F2FF" />
                    <Text style={styles.extractionBadgeText}>Extraction renforcée IA/OCR</Text>
                  </View>
                ) : null}

                <Text style={styles.label}>Nom du dossier</Text>
                <TextInput style={styles.input} value={selectedFolder.name} onChangeText={updateSelectedName} />
                <Text style={styles.infoMeta}>Créé le: {formatDateTime(selectedFolder.createdAt)}</Text>
                <Text style={styles.infoMeta}>Modifié le: {formatDateTime(selectedFolder.updatedAt || selectedFolder.createdAt)}</Text>

                <Text style={styles.label}>Date de visite</Text>
                <TextInput style={styles.input} value={selectedFolder.info.dateCt} onChangeText={(v) => updateSelectedInfo('dateCt', v)} />

                <Text style={styles.label}>Kilométrage</Text>
                <TextInput style={styles.input} value={selectedFolder.info.kmScanne} onChangeText={(v) => updateSelectedInfo('kmScanne', v)} />

                <Text style={styles.label}>Résultat</Text>
                <TextInput style={styles.input} value={selectedFolder.info.resultat} onChangeText={(v) => updateSelectedInfo('resultat', v)} />

                <Text style={styles.label}>Garage / Adresse</Text>
                <AddressAutocompleteInput
                  value={selectedFolder.info.garageAdresse}
                  onChangeText={(v) => updateSelectedInfo('garageAdresse', v)}
                  placeholder="Commencez à saisir une adresse..."
                  inputStyle={styles.input}
                  placeholderTextColor="#64748b"
                />

                <Text style={styles.label}>Points à vérifier</Text>
                <TextInput
                  style={[styles.input, styles.multi]}
                  multiline
                  value={selectedFolder.info.pointsVerifier}
                  onChangeText={(v) => updateSelectedInfo('pointsVerifier', v)}
                />

                <Text style={styles.label}>Défaillances</Text>
                <TextInput
                  style={[styles.input, styles.multi]}
                  multiline
                  value={selectedFolder.info.defauts}
                  onChangeText={(v) => updateSelectedInfo('defauts', v)}
                />

                <Text style={styles.label}>Date d&apos;expiration CT</Text>
                <TextInput style={styles.input} value={selectedFolder.info.prochainCt} onChangeText={(v) => updateSelectedInfo('prochainCt', v)} />

                <Text style={styles.label}>Réparation</Text>
                <TextInput
                  style={[styles.input, styles.multiRepair]}
                  multiline
                  textAlignVertical="top"
                  placeholder="Ajoutez ici un texte de réparation (plusieurs lignes possible)"
                  placeholderTextColor="#64748b"
                  value={selectedFolder.info.reparations}
                  onChangeText={(v) => updateSelectedInfo('reparations', v)}
                />
                <Pressable style={({ pressed }) => [styles.autoPlanBtn, pressed && styles.scaleDown]} onPress={regenerateRepairsPlanForSelected}>
                  <MaterialCommunityIcons name="brain" size={16} color="#fff" />
                  <Text style={styles.autoPlanBtnText}>Generer automatiquement le plan A FAIRE</Text>
                </Pressable>
              </View>
            </ScrollView>
          ) : null}
        </View>
      </Modal>

      <Modal visible={imageModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setImageModal(false)}>
            <MaterialCommunityIcons name="close-circle" size={44} color="#fff" />
          </TouchableOpacity>
          <Image source={{ uri: selectedFolder?.imageUri || '' }} style={styles.fullImage} resizeMode="contain" />
        </View>
      </Modal>

      {isAnalyzing && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', marginTop: 8 }}>Analyse IA du document...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_THEME.bg, paddingHorizontal: 16, paddingTop: 54 },
  heroBanner: {
    height: 140,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
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
  heroCard: {
    backgroundColor: 'rgba(7,10,16,0.75)',
    borderWidth: 0.5,
    borderColor: '#1e293b',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginBottom: 12,
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
  pageTitle: { fontSize: 23, fontWeight: '900', color: UI_THEME.textPrimary, textAlign: 'center' },
  heroSubtitle: { marginTop: 4, color: '#cbd5e1', fontSize: 12, textAlign: 'center' },
  scaleDown: { transform: [{ scale: 0.98 }] },
  newFolderBtnWrap: { marginBottom: 14 },
  newFolderBtn: {
    backgroundColor: '#0C1E2E',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 0.6,
    borderColor: UI_THEME.neonGreenBorder,
    shadowColor: '#22c55e',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  newFolderText: { color: '#dcfce7', fontWeight: '800', fontSize: 18 },
  folderCard: {
    backgroundColor: UI_THEME.glass,
    borderRadius: 14,
    padding: 13,
    marginBottom: 11,
    borderWidth: 0.6,
    borderColor: UI_THEME.cyanBorder,
    elevation: 0,
  },
  folderRow: { flexDirection: 'row', alignItems: 'center' },
  folderName: { fontSize: 14, fontWeight: '900', color: UI_THEME.textPrimary },
  folderSub: { fontSize: 12, color: '#9fb0c4', marginTop: 2 },
  resultBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  resultBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  banner: { marginTop: 10, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8 },
  bannerText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  editorContainer: { flex: 1, backgroundColor: UI_THEME.bg, paddingTop: 52, paddingHorizontal: 14 },
  editorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  editorTitle: { fontSize: 18, fontWeight: '900', color: UI_THEME.textPrimary },
  imageWrap: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#243246' },
  image: { width: '100%', height: 190 },
  imageTxt: { textAlign: 'center', paddingVertical: 8, color: '#00F2FF', fontWeight: '700' },
  formCard: { backgroundColor: 'rgba(7,10,16,0.78)', borderRadius: 12, padding: 12, marginTop: 10, borderWidth: 0.6, borderColor: 'rgba(212,175,55,0.45)' },
  extractionBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,242,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,242,255,0.45)',
    marginBottom: 6,
  },
  extractionBadgeText: {
    color: '#9aefff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  label: { fontSize: 12, color: '#93a4b8', fontWeight: '700', marginTop: 8, marginBottom: 4 },
  infoMeta: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  input: {
    backgroundColor: '#0f172a',
    borderWidth: 0.5,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#e2e8f0',
  },
  multi: { minHeight: 70 },
  multiRepair: { minHeight: 110 },
  autoPlanBtn: {
    marginTop: 10,
    backgroundColor: '#7c3aed',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  autoPlanBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  closeBtn: { position: 'absolute', top: 50, right: 20, zIndex: 2 },
  fullImage: { width: '100%', height: '85%' },
  loader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
});

