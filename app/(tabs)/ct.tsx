import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
  parseAddressParts,
} from '../../components/AddressPartsAutocompleteInput';
import { PremiumHeroBanner } from '../../components/PremiumHeroBanner';
import {
  formatDateParts,
  formatDatePartsProgressive,
  parseDateParts,
  SmartDatePartsInput,
} from '../../components/SmartDatePartsInput';
import { STORAGE_PENDING_CT_FROM_SCAN } from '../../constants/scanConstants';
import { UI_THEME } from '../../constants/uiTheme';
import { useVehicle } from '../../context/VehicleContext';
import { scheduleCtReminders } from '../../services/ctReminders';
import { scanDocumentWithFallback } from '../../services/nativeDocumentScanner';
import {
  deleteScanDocFromSupabase,
  fetchScanDocsFromSupabase,
  insertScanDocToSupabase,
  updateScanDocInSupabase,
} from '../../services/scanDocumentSupabase';
import { userGetItem, userRemoveItem, userSetItem } from '../../services/userStorage';

const STORAGE_KEY_CT_FOLDERS = '@ma_voiture_ct_folders_v2';
const STORAGE_KEY_CT_HOME = '@ma_voiture_ct_data';
const STORAGE_KEY_CT_DRAFT = '@ma_voiture_ct_draft_v1';
const STORAGE_KEY_CT_PENDING_CREATION = '@ma_voiture_ct_pending_creation_v1';

type CtInfoState = {
  dateCt: string;
  kmScanne: string;
  resultat: string;
  garageAdresse: string;
  pointsVerifier: string;
  defauts: string;
  prochainCt: string;
  reparations: string;
};

type CtFolder = {
  id: string;
  name: string;
  imageUri?: string;
  info: CtInfoState;
  createdAt: number;
  updatedAt: number;
  supabaseId?: string | null;
};

type CtDraft = {
  createDateCt: string;
  createKm: string;
  createResultat: string;
  createGarage: string;
  createDefauts: string;
  createPhotoUri: string;
  updatedAt: number;
};

type CtPendingCreation = {
  stage: 'scanning' | 'saving';
  draft: CtDraft;
  updatedAt: number;
};

function parseFrDate(s: string): Date | null {
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
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

function nowFr(): string {
  return new Date().toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  if (r.includes('VALIDE')) return '#2ecc71';
  if (r.includes('DEFAVORABLE') || r.includes('CONTRE')) return '#C53030';
  if (r.includes('FAVORABLE')) return '#2ecc71';
  return '#64748b';
}

function resultBadgeLabel(resultat: string, isSupersededByNewerCt: boolean): string {
  const raw = String(resultat || '').trim();
  if (isSupersededByNewerCt) return 'VALIDE';
  return raw || 'A VERIFIER';
}

function pickHomeCtFolder(folders: CtFolder[]): CtFolder | null {
  if (!folders.length) return null;
  return [...folders].sort((a, b) => {
    const aTs = getCtVisitTimestamp(a);
    const bTs = getCtVisitTimestamp(b);
    if (aTs !== bTs) return bTs - aTs;
    return b.updatedAt - a.updatedAt;
  })[0] ?? null;
}

function getCtVisitTimestamp(folder: CtFolder): number {
  const visit = parseFrDate(folder.info.dateCt);
  if (visit) return visit.getTime();
  return folder.updatedAt || folder.createdAt || 0;
}

function ctPayload(folder: CtFolder): Record<string, unknown> {
  return {
    imageUri: folder.imageUri ?? '',
    info: folder.info,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    localId: folder.id,
  };
}

function folderFromSupabase(row: {
  id: string;
  title: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}): CtFolder | null {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const imageUri = typeof payload.imageUri === 'string' ? payload.imageUri.trim() : '';
  const infoRaw = (payload.info ?? {}) as Partial<CtInfoState>;
  const dateCt = typeof infoRaw.dateCt === 'string' ? infoRaw.dateCt : '';
  const nextCt = typeof infoRaw.prochainCt === 'string' ? infoRaw.prochainCt : '';
  return {
    id: `sb-${row.id}`,
    name: row.title?.trim() || `CT ${dateCt || 'manual'}`,
    imageUri: imageUri || '',
    createdAt: Number(new Date(row.created_at).getTime()) || Date.now(),
    updatedAt: Number(new Date(row.updated_at).getTime()) || Date.now(),
    supabaseId: row.id,
    info: {
      dateCt,
      kmScanne: typeof infoRaw.kmScanne === 'string' ? infoRaw.kmScanne : '',
      resultat: typeof infoRaw.resultat === 'string' ? infoRaw.resultat : 'A VERIFIER',
      garageAdresse: typeof infoRaw.garageAdresse === 'string' ? infoRaw.garageAdresse : '',
      pointsVerifier: typeof infoRaw.pointsVerifier === 'string' ? infoRaw.pointsVerifier : '',
      defauts: typeof infoRaw.defauts === 'string' ? infoRaw.defauts : '',
      prochainCt: nextCt,
      reparations: typeof infoRaw.reparations === 'string' ? infoRaw.reparations : '',
    },
  };
}

export default function CtScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const allowLeaveRef = useRef(false);
  const { activeVehicleId } = useVehicle();
  const params = useLocalSearchParams<{
    imageCaptured?: string;
    fromGlobalScan?: string;
    pendingFromScan?: string;
  }>();

  const [folders, setFolders] = useState<CtFolder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imageModal, setImageModal] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [creatorVisible, setCreatorVisible] = useState(false);
  const [createDateCt, setCreateDateCt] = useState(formatFr(new Date()));
  const [createKm, setCreateKm] = useState('');
  const [createResultat, setCreateResultat] = useState('FAVORABLE');
  const [createGarage, setCreateGarage] = useState('');
  const [createDefauts, setCreateDefauts] = useState('');
  const [createPhotoUri, setCreatePhotoUri] = useState('');
  const createKmInputRef = useRef<TextInput | null>(null);
  const selectedKmInputRef = useRef<TextInput | null>(null);
  const selectedDefautsInputRef = useRef<TextInput | null>(null);
  const remindersTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftHydratedRef = useRef(false);
  const [isServerSaveInFlight, setIsServerSaveInFlight] = useState(false);

  const goDocs = useCallback(() => {
    if (isServerSaveInFlight) {
      Alert.alert('Patientez', 'Sauvegarde en cours. Merci d’attendre la confirmation serveur.');
      return;
    }
    allowLeaveRef.current = true;
    router.replace('/docs');
  }, [isServerSaveInFlight, router]);

  useFocusEffect(
    useCallback(() => {
      allowLeaveRef.current = false;
      return () => {};
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (isServerSaveInFlight) {
          Alert.alert('Patientez', 'Sauvegarde en cours. Merci d’attendre la confirmation serveur.');
          return true;
        }
        if (imageModal) {
          setImageModal(false);
          return true;
        }
        if (selectedId) {
          setSelectedId(null);
          return true;
        }
        if (creatorVisible) {
          setCreatorVisible(false);
          return true;
        }
        goDocs();
        return true;
      });
      return () => sub.remove();
    }, [creatorVisible, goDocs, imageModal, isServerSaveInFlight, selectedId])
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current) return;
      if (isServerSaveInFlight) {
        event.preventDefault();
        Alert.alert('Patientez', 'Sauvegarde en cours. Merci d’attendre la confirmation serveur.');
        return;
      }
      if (imageModal) {
        event.preventDefault();
        setImageModal(false);
        return;
      }
      if (selectedId) {
        event.preventDefault();
        setSelectedId(null);
        return;
      }
      if (creatorVisible) {
        event.preventDefault();
        setCreatorVisible(false);
        return;
      }
      event.preventDefault();
      goDocs();
    });
    return unsubscribe;
  }, [creatorVisible, goDocs, imageModal, isServerSaveInFlight, navigation, selectedId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await userGetItem(STORAGE_KEY_CT_FOLDERS);
        let localFolders: CtFolder[] = [];
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<CtFolder>[];
          if (Array.isArray(parsed)) {
            localFolders = parsed
              .map((f, idx) => {
                const info = (f.info ?? {}) as Partial<CtInfoState>;
                return {
                  id: typeof f.id === 'string' ? f.id : `local-${idx}-${Date.now()}`,
                  name: typeof f.name === 'string' ? f.name : 'Contrôle technique',
                  imageUri: typeof f.imageUri === 'string' ? f.imageUri : '',
                  createdAt: typeof f.createdAt === 'number' ? f.createdAt : Date.now(),
                  updatedAt: typeof f.updatedAt === 'number' ? f.updatedAt : Date.now(),
                  supabaseId: typeof f.supabaseId === 'string' ? f.supabaseId : null,
                  info: {
                    dateCt: typeof info.dateCt === 'string' ? info.dateCt : '',
                    kmScanne: typeof info.kmScanne === 'string' ? info.kmScanne : '',
                    resultat: typeof info.resultat === 'string' ? info.resultat : 'A VERIFIER',
                    garageAdresse: typeof info.garageAdresse === 'string' ? info.garageAdresse : '',
                    pointsVerifier: typeof info.pointsVerifier === 'string' ? info.pointsVerifier : '',
                    defauts: typeof info.defauts === 'string' ? info.defauts : '',
                    prochainCt: typeof info.prochainCt === 'string' ? info.prochainCt : '',
                    reparations: typeof info.reparations === 'string' ? info.reparations : '',
                  },
                } as CtFolder;
              })
              .filter((x): x is CtFolder => x != null);
          }
        }

        const remote = await fetchScanDocsFromSupabase({
          docType: 'controle_technique',
          vehicleId: activeVehicleId ?? null,
        });
        const remoteFolders = remote
          .map((row) => folderFromSupabase(row))
          .filter((x): x is CtFolder => x != null);

        if (cancelled) return;
        const chosen = remoteFolders.length ? remoteFolders : localFolders;
        setFolders(chosen);
      } catch (error) {
        console.log('[CT] load failed', error);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeVehicleId]);

  const persistCtDraft = useCallback(
    async (draftOverride?: Partial<CtDraft>) => {
      const draft: CtDraft = {
        createDateCt,
        createKm,
        createResultat,
        createGarage,
        createDefauts,
        createPhotoUri,
        updatedAt: Date.now(),
        ...draftOverride,
      };
      await userSetItem(STORAGE_KEY_CT_DRAFT, JSON.stringify(draft));
    },
    [createDateCt, createDefauts, createGarage, createKm, createPhotoUri, createResultat]
  );

  const clearCtDraft = useCallback(async () => {
    await userRemoveItem(STORAGE_KEY_CT_DRAFT);
  }, []);

  const setPendingCreation = useCallback(async (pending: CtPendingCreation) => {
    await userSetItem(STORAGE_KEY_CT_PENDING_CREATION, JSON.stringify(pending));
  }, []);

  const clearPendingCreation = useCallback(async () => {
    await userRemoveItem(STORAGE_KEY_CT_PENDING_CREATION);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await userGetItem(STORAGE_KEY_CT_DRAFT);
        if (!raw || cancelled) {
          draftHydratedRef.current = true;
          return;
        }
        const parsed = JSON.parse(raw) as Partial<CtDraft>;
        const hasDraft =
          typeof parsed.createDateCt === 'string' ||
          typeof parsed.createKm === 'string' ||
          typeof parsed.createResultat === 'string' ||
          typeof parsed.createGarage === 'string' ||
          typeof parsed.createDefauts === 'string' ||
          typeof parsed.createPhotoUri === 'string';
        if (!hasDraft) {
          draftHydratedRef.current = true;
          return;
        }
        setCreateDateCt(typeof parsed.createDateCt === 'string' ? parsed.createDateCt : formatFr(new Date()));
        setCreateKm(typeof parsed.createKm === 'string' ? parsed.createKm : '');
        setCreateResultat(typeof parsed.createResultat === 'string' ? parsed.createResultat : 'FAVORABLE');
        setCreateGarage(typeof parsed.createGarage === 'string' ? parsed.createGarage : '');
        setCreateDefauts(typeof parsed.createDefauts === 'string' ? parsed.createDefauts : '');
        setCreatePhotoUri(typeof parsed.createPhotoUri === 'string' ? parsed.createPhotoUri : '');
        setCreatorVisible(true);
      } catch (error) {
        console.log('[CT] restore draft failed', error);
      } finally {
        if (!cancelled) draftHydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await userGetItem(STORAGE_KEY_CT_PENDING_CREATION);
        if (!raw || cancelled) return;
        const pending = JSON.parse(raw) as Partial<CtPendingCreation>;
        const draft = pending?.draft;
        if (!draft || typeof draft !== 'object') return;
        setCreateDateCt(typeof draft.createDateCt === 'string' ? draft.createDateCt : formatFr(new Date()));
        setCreateKm(typeof draft.createKm === 'string' ? draft.createKm : '');
        setCreateResultat(typeof draft.createResultat === 'string' ? draft.createResultat : 'FAVORABLE');
        setCreateGarage(typeof draft.createGarage === 'string' ? draft.createGarage : '');
        setCreateDefauts(typeof draft.createDefauts === 'string' ? draft.createDefauts : '');
        setCreatePhotoUri(typeof draft.createPhotoUri === 'string' ? draft.createPhotoUri : '');
        setCreatorVisible(true);
      } catch (error) {
        console.log('[CT] restore pending creation failed', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    userSetItem(STORAGE_KEY_CT_FOLDERS, JSON.stringify(folders)).catch((error) => {
      console.log('[CT] save folders failed', error);
    });
  }, [folders, hydrated]);

  useEffect(() => {
    if (!draftHydratedRef.current) return;
    if (!creatorVisible) return;
    const timer = setTimeout(() => {
      persistCtDraft().catch((error) => {
        console.log('[CT] save draft failed', error);
      });
    }, 220);
    return () => clearTimeout(timer);
  }, [createDateCt, createDefauts, createGarage, createKm, createPhotoUri, createResultat, creatorVisible, persistCtDraft]);

  useEffect(() => {
    if (!hydrated) return;
    const mainCt = pickHomeCtFolder(folders);
    if (!mainCt) {
      userRemoveItem(STORAGE_KEY_CT_HOME).catch(() => {});
      return;
    }
    userSetItem(
      STORAGE_KEY_CT_HOME,
      JSON.stringify({
        name: mainCt.name,
        imageUri: mainCt.imageUri,
        info: mainCt.info,
      })
    ).catch(() => {});
  }, [folders, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (remindersTimerRef.current) clearTimeout(remindersTimerRef.current);
    remindersTimerRef.current = setTimeout(() => {
      const mainCt = pickHomeCtFolder(folders);
      void scheduleCtReminders(mainCt?.info.prochainCt ?? null);
    }, 350);
    return () => {
      if (remindersTimerRef.current) clearTimeout(remindersTimerRef.current);
    };
  }, [folders, hydrated]);

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

  const selectedFolder = useMemo(
    () => folders.find((f) => f.id === selectedId) ?? null,
    [folders, selectedId]
  );
  const activeCtFolder = useMemo(() => pickHomeCtFolder(folders), [folders]);
  const activeCtId = activeCtFolder?.id ?? null;
  const activeVisitTs = activeCtFolder ? getCtVisitTimestamp(activeCtFolder) : 0;

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

  const pickPhotoUri = useCallback(async (source: 'camera' | 'gallery'): Promise<string | null> => {
    try {
      if (source === 'camera') {
        const uri = await scanDocumentWithFallback();
        return uri || null;
      }
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission refusée', 'Autorisez la galerie pour ajouter la photo du contrôle technique.');
        return null;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        quality: 0.8,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
      if (!res.canceled && res.assets?.[0]?.uri) return res.assets[0].uri;
      return null;
    } catch (error) {
      console.log('[CT] choosePhoto failed', error);
      Alert.alert('Erreur', 'Impossible de charger la photo.');
      return null;
    }
  }, []);

  const choosePhotoForCreate = useCallback(
    async (source: 'camera' | 'gallery') => {
      const draftBeforeScan: CtDraft = {
        createDateCt,
        createKm,
        createResultat,
        createGarage,
        createDefauts,
        createPhotoUri,
        updatedAt: Date.now(),
      };
      await userSetItem(STORAGE_KEY_CT_DRAFT, JSON.stringify(draftBeforeScan));
      await setPendingCreation({ stage: source === 'camera' ? 'scanning' : 'saving', draft: draftBeforeScan, updatedAt: Date.now() });
      const uri = await pickPhotoUri(source);
      if (uri) {
        setCreatePhotoUri(uri);
        await persistCtDraft({ createPhotoUri: uri, updatedAt: Date.now() });
      }
      await clearPendingCreation();
    },
    [clearPendingCreation, createDateCt, createDefauts, createGarage, createKm, createPhotoUri, createResultat, persistCtDraft, pickPhotoUri, setPendingCreation]
  );

  const choosePhotoForSelected = useCallback(
    async (source: 'camera' | 'gallery') => {
      if (!selectedId) return;
      const uri = await pickPhotoUri(source);
      if (!uri) return;
      setFolders((prev) => prev.map((f) => (f.id === selectedId ? { ...f, imageUri: uri, updatedAt: Date.now() } : f)));
    },
    [pickPhotoUri, selectedId]
  );

  const openCreator = () => {
    setCreateDateCt(formatFr(new Date()));
    setCreateKm('');
    setCreateResultat('FAVORABLE');
    setCreateGarage('');
    setCreateDefauts('');
    setCreatePhotoUri('');
    setCreatorVisible(true);
  };

  const createManualCtFolder = async () => {
    const dateObj = parseFrDate(createDateCt) ?? new Date();
    const dateCtSafe = parseFrDate(createDateCt) ? createDateCt : formatFr(dateObj);

    const prochainCt = formatFr(addYears(dateObj, 2));
    const createdAt = Date.now();
    const folder: CtFolder = {
      id: `ct-${createdAt}`,
      name: `CT ${dateCtSafe}`,
      imageUri: createPhotoUri || '',
      createdAt,
      updatedAt: createdAt,
      supabaseId: null,
      info: {
        dateCt: dateCtSafe,
        kmScanne: createKm.trim(),
        resultat: createResultat.trim() || 'A VERIFIER',
        garageAdresse: createGarage.trim(),
        pointsVerifier: '',
        defauts: createDefauts.trim(),
        prochainCt,
        reparations: '',
      },
    };

    setFolders((prev) => [folder, ...prev]);
    setSelectedId(folder.id);
    setCreatorVisible(false);
    setIsSyncing(true);
    setIsServerSaveInFlight(true);
    await setPendingCreation({
      stage: 'saving',
      draft: {
        createDateCt,
        createKm,
        createResultat,
        createGarage,
        createDefauts,
        createPhotoUri,
        updatedAt: Date.now(),
      },
      updatedAt: Date.now(),
    });
    try {
      const supabaseId = await insertScanDocToSupabase({
        vehicleId: activeVehicleId ?? null,
        docType: 'controle_technique',
        title: folder.name,
        payload: ctPayload(folder),
      });
      if (supabaseId) {
        setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, supabaseId, id: `sb-${supabaseId}` } : f)));
        Alert.alert('controle technique enregistré avec succes');
      } else {
        Alert.alert('controle technique enregistré avec succes');
      }
      await clearPendingCreation();
      await clearCtDraft();
    } finally {
      setIsServerSaveInFlight(false);
      setIsSyncing(false);
    }
  };

  const syncSelectedToSupabase = useCallback(async () => {
    if (!selectedFolder) return;
    const payload = ctPayload(selectedFolder);
    setIsSyncing(true);
    setIsServerSaveInFlight(true);
    try {
      if (selectedFolder.supabaseId) {
        await updateScanDocInSupabase({
          docId: selectedFolder.supabaseId,
          title: selectedFolder.name,
          payload,
        });
        Alert.alert('Dossier enregistré', 'Les modifications ont été sauvegardées sur Supabase.');
      } else {
        const supabaseId = await insertScanDocToSupabase({
          vehicleId: activeVehicleId ?? null,
          docType: 'controle_technique',
          title: selectedFolder.name,
          payload,
        });
        if (supabaseId) {
          setFolders((prev) =>
            prev.map((f) => (f.id === selectedFolder.id ? { ...f, supabaseId, id: `sb-${supabaseId}` } : f))
          );
          Alert.alert('Dossier enregistré', 'Le dossier CT a été envoyé vers Supabase.');
        }
      }
    } finally {
      setIsServerSaveInFlight(false);
      setIsSyncing(false);
    }
  }, [activeVehicleId, selectedFolder]);

  const confirmDeleteFolder = (id: string) => {
    const target = folders.find((f) => f.id === id);
    Alert.alert('Supprimer le dossier ?', 'Cette action supprimera le dossier local et Supabase.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          if (target?.supabaseId) {
            void deleteScanDocFromSupabase(target.supabaseId);
          }
          setFolders((prev) => prev.filter((f) => f.id !== id));
          if (selectedId === id) setSelectedId(null);
        },
      },
    ]);
  };

  useEffect(() => {
    if (!hydrated) return;
    const fromGlobal = typeof params.fromGlobalScan === 'string' ? params.fromGlobalScan : '';
    if (fromGlobal !== '1') return;

    let cancelled = false;
    (async () => {
      let uri = '';
      if (params.pendingFromScan === '1') {
        const raw = await userGetItem(STORAGE_PENDING_CT_FROM_SCAN);
        uri = typeof raw === 'string' ? raw.trim() : '';
        if (uri) await userRemoveItem(STORAGE_PENDING_CT_FROM_SCAN);
      } else if (typeof params.imageCaptured === 'string') {
        uri = params.imageCaptured.trim();
      }
      if (!uri || cancelled) return;

      const dateCt = formatFr(new Date());
      const prochainCt = formatFr(addYears(new Date(), 2));
      const createdAt = Date.now();
      const folder: CtFolder = {
        id: `ct-${createdAt}`,
        name: `CT ${dateCt}`,
        imageUri: uri,
        createdAt,
        updatedAt: createdAt,
        supabaseId: null,
        info: {
          dateCt,
          kmScanne: '',
          resultat: 'A VERIFIER',
          garageAdresse: '',
          pointsVerifier: 'Complétez les champs manuellement.',
          defauts: '',
          prochainCt,
          reparations: '',
        },
      };
      setFolders((prev) => [folder, ...prev]);
      setSelectedId(folder.id);
      setIsSyncing(true);
      try {
        const supabaseId = await insertScanDocToSupabase({
          vehicleId: activeVehicleId ?? null,
          docType: 'controle_technique',
          title: folder.name,
          payload: ctPayload(folder),
        });
        if (supabaseId) {
          setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, supabaseId, id: `sb-${supabaseId}` } : f)));
        }
      } finally {
        setIsSyncing(false);
      }
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activeVehicleId, hydrated, params.fromGlobalScan, params.imageCaptured, params.pendingFromScan]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <PremiumHeroBanner variant="ct" height={140} alignCenter>
        <View style={styles.heroIconWrap}>
          <MaterialCommunityIcons name="clipboard-text-search-outline" size={30} color="#00F2FF" />
        </View>
        <Text style={styles.pageTitle}>Mes contrôles techniques</Text>
        <Text style={styles.heroSubtitle}>Saisie manuelle + photo + rappels automatiques</Text>
      </PremiumHeroBanner>

      <Pressable onPress={openCreator} style={({ pressed }) => [styles.newFolderBtnWrap, pressed && styles.scaleDown]}>
        <LinearGradient colors={['#05080d', '#0d1b12']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.newFolderBtn}>
          <MaterialCommunityIcons name="plus-circle-outline" size={20} color="#86efac" />
          <Text style={styles.newFolderText}>Nouveau contrôle technique</Text>
        </LinearGradient>
      </Pressable>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardDismissMode="on-drag">
        {folders.map((folder) => {
          const isActiveCt = folder.id === activeCtId;
          const isSupersededByNewerCt = !isActiveCt && getCtVisitTimestamp(folder) < activeVisitTs;
          const left = isActiveCt ? daysUntil(folder.info.prochainCt) : null;
          const badgeLabel = resultBadgeLabel(folder.info.resultat, isSupersededByNewerCt);
          return (
            <Pressable key={folder.id} style={({ pressed }) => [styles.folderCard, pressed && styles.scaleDown]} onPress={() => setSelectedId(folder.id)}>
              <View style={styles.folderRow}>
                <MaterialCommunityIcons name="file-document-outline" size={24} color="#00F2FF" />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={styles.folderName}>{folder.name}</Text>
                  <Text style={styles.folderSub}>Visite: {folder.info.dateCt || '-'}</Text>
                  <Text style={styles.folderSub}>Créé le: {formatDateTime(folder.createdAt)}</Text>
                  <Text style={styles.folderSub}>Modifié le: {formatDateTime(folder.updatedAt || folder.createdAt)}</Text>
                  <View style={[styles.resultBadge, { backgroundColor: resultBadgeColor(badgeLabel) }]}>
                    <Text style={styles.resultBadgeText}>{badgeLabel}</Text>
                  </View>
                </View>
                <Pressable onPress={() => confirmDeleteFolder(folder.id)} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
                  <MaterialCommunityIcons name="delete-outline" size={22} color="#C53030" />
                </Pressable>
              </View>
              {left != null ? (
                <View style={[styles.banner, { backgroundColor: urgencyBackground(left) }]}>
                  <Text style={styles.bannerText}>
                    Echéance du prochain CT : {left >= 0 ? `${left} j` : `expiré ${Math.abs(left)} j`} ({folder.info.prochainCt})
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <Modal visible={creatorVisible} animationType="slide" onRequestClose={() => setCreatorVisible(false)}>
        <KeyboardAvoidingView style={styles.editorContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.editorHeader}>
            <TouchableOpacity onPress={() => setCreatorVisible(false)}>
              <MaterialCommunityIcons name="arrow-left" size={24} color="#00F2FF" />
            </TouchableOpacity>
            <Text style={styles.editorTitle}>Nouveau contrôle technique</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 26 }} keyboardShouldPersistTaps="handled">
            <View style={styles.formCard}>
              <Text style={styles.label}>Date du contrôle (JJ/MM/AAAA)</Text>
              <SmartDatePartsInput
                value={parseDateParts(createDateCt)}
                onChange={(parts) => setCreateDateCt(formatDatePartsProgressive(parts))}
                inputStyle={styles.input}
              />

              <Text style={styles.label}>Kilométrage</Text>
              <TextInput ref={createKmInputRef} style={styles.input} value={createKm} keyboardType="numeric" onChangeText={setCreateKm} />

              <Text style={styles.label}>Résultat</Text>
              <TextInput style={styles.input} value={createResultat} onChangeText={setCreateResultat} />

              <Text style={styles.label}>Garage / Adresse</Text>
              <AddressPartsAutocompleteInput
                value={parseAddressParts(createGarage)}
                onChange={(parts) => setCreateGarage(composeAddressParts(parts))}
                inputStyle={styles.input}
              />

              <Text style={styles.label}>Défaillances / Notes</Text>
              <TextInput
                style={[styles.input, styles.multi]}
                multiline
                value={createDefauts}
                onChangeText={setCreateDefauts}
                autoCapitalize="sentences"
                autoCorrect
              />

              <View style={styles.photoButtonsRow}>
                <Pressable style={styles.photoBtn} onPress={() => void choosePhotoForCreate('camera')}>
                  <MaterialCommunityIcons name="camera-outline" size={18} color="#fff" />
                  <Text style={styles.photoBtnText}>Caméra</Text>
                </Pressable>
                <Pressable style={styles.photoBtn} onPress={() => void choosePhotoForCreate('gallery')}>
                  <MaterialCommunityIcons name="image-outline" size={18} color="#fff" />
                  <Text style={styles.photoBtnText}>Galerie</Text>
                </Pressable>
              </View>
              <Text style={styles.optionalHint}>Photo et champs optionnels: vous pouvez compléter plus tard.</Text>

              {createPhotoUri ? <Image source={{ uri: createPhotoUri }} style={styles.createPreview} /> : null}

              <Pressable style={({ pressed }) => [styles.saveBtn, pressed && styles.scaleDown]} onPress={() => void createManualCtFolder()}>
                <MaterialCommunityIcons name="content-save-outline" size={16} color="#fff" />
                <Text style={styles.saveBtnText}>Enregistrer le dossier CT</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!selectedFolder} animationType="slide" onRequestClose={() => setSelectedId(null)}>
        <KeyboardAvoidingView style={styles.editorContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
            <ScrollView contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              {selectedFolder.imageUri ? (
                <TouchableOpacity style={styles.imageWrap} onPress={() => setImageModal(true)}>
                  <Image source={{ uri: selectedFolder.imageUri }} style={styles.image} />
                  <Text style={styles.imageTxt}>Ouvrir en plein écran</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.imageWrapEmpty}>
                  <MaterialCommunityIcons name="camera-plus-outline" size={30} color="#94a3b8" />
                  <Text style={styles.imageTxtEmpty}>Aucune photo pour ce dossier</Text>
                </View>
              )}
              <View style={styles.photoButtonsRow}>
                <Pressable style={styles.photoBtn} onPress={() => void choosePhotoForSelected('camera')}>
                  <MaterialCommunityIcons name="camera-outline" size={18} color="#fff" />
                  <Text style={styles.photoBtnText}>Photo caméra</Text>
                </Pressable>
                <Pressable style={styles.photoBtn} onPress={() => void choosePhotoForSelected('gallery')}>
                  <MaterialCommunityIcons name="image-outline" size={18} color="#fff" />
                  <Text style={styles.photoBtnText}>Photo galerie</Text>
                </Pressable>
              </View>

              <View style={styles.formCard}>
                <Text style={styles.label}>Nom du dossier</Text>
                <TextInput style={styles.input} value={selectedFolder.name} onChangeText={updateSelectedName} />
                <Text style={styles.infoMeta}>Créé le: {formatDateTime(selectedFolder.createdAt)}</Text>
                <Text style={styles.infoMeta}>Modifié le: {formatDateTime(selectedFolder.updatedAt || selectedFolder.createdAt)}</Text>

                <Text style={styles.label}>Date de visite</Text>
                <SmartDatePartsInput
                  value={parseDateParts(selectedFolder.info.dateCt)}
                  onChange={(parts) => updateSelectedInfo('dateCt', formatDatePartsProgressive(parts))}
                  inputStyle={styles.input}
                />

                <Text style={styles.label}>Kilométrage</Text>
                <TextInput
                  ref={selectedKmInputRef}
                  style={styles.input}
                  value={selectedFolder.info.kmScanne}
                  onChangeText={(v) => updateSelectedInfo('kmScanne', v)}
                />

                <Text style={styles.label}>Résultat</Text>
                <TextInput style={styles.input} value={selectedFolder.info.resultat} onChangeText={(v) => updateSelectedInfo('resultat', v)} />

                <Text style={styles.label}>Garage / Adresse</Text>
                <AddressPartsAutocompleteInput
                  value={parseAddressParts(selectedFolder.info.garageAdresse)}
                  onChange={(parts) => updateSelectedInfo('garageAdresse', composeAddressParts(parts))}
                  inputStyle={styles.input}
                />

                <Text style={styles.label}>Date d'expiration CT</Text>
                <SmartDatePartsInput
                  value={parseDateParts(selectedFolder.info.prochainCt)}
                  onChange={(parts) => updateSelectedInfo('prochainCt', formatDatePartsProgressive(parts))}
                  inputStyle={styles.input}
                />

                <Text style={styles.label}>Défaillances</Text>
                <TextInput
                  ref={selectedDefautsInputRef}
                  style={[styles.input, styles.multi]}
                  multiline
                  value={selectedFolder.info.defauts}
                  onChangeText={(v) => updateSelectedInfo('defauts', v)}
                  autoCapitalize="sentences"
                  autoCorrect
                />

                <Pressable style={({ pressed }) => [styles.saveBtn, pressed && styles.scaleDown]} onPress={() => void syncSelectedToSupabase()}>
                  <MaterialCommunityIcons name="content-save-outline" size={16} color="#fff" />
                  <Text style={styles.saveBtnText}>Enregistrer modifications (Supabase)</Text>
                </Pressable>
              </View>
            </ScrollView>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={imageModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setImageModal(false)}>
            <MaterialCommunityIcons name="close-circle" size={44} color="#fff" />
          </TouchableOpacity>
          {selectedFolder?.imageUri ? (
            <Image source={{ uri: selectedFolder.imageUri }} style={styles.fullImage} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>

      {isSyncing && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', marginTop: 8 }}>Synchronisation Supabase...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_THEME.bg, paddingHorizontal: 16, paddingTop: 54 },
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
  imageWrapEmpty: {
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#243246',
    minHeight: 170,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  image: { width: '100%', height: 190 },
  imageTxt: { textAlign: 'center', paddingVertical: 8, color: '#00F2FF', fontWeight: '700' },
  imageTxtEmpty: { textAlign: 'center', color: '#94a3b8', fontWeight: '700' },
  formCard: {
    backgroundColor: 'rgba(7,10,16,0.78)',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 0.6,
    borderColor: 'rgba(212,175,55,0.45)',
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
  multi: { minHeight: 90, textAlignVertical: 'top' },
  photoButtonsRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  photoBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: '#1d4ed8',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  photoBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  optionalHint: { marginTop: 8, color: '#9fb0c4', fontSize: 11, fontStyle: 'italic' },
  createPreview: {
    marginTop: 10,
    width: '100%',
    height: 190,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  saveBtn: {
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
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
