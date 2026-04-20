import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { User } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from 'react-native-svg';

import { ElectricPressable } from '../../components/ElectricPressable';
import { OTTO_THEME } from '../../constants/ottoTheme';
import { useKilometrage } from '../../context/KilometrageContext';
import { useTheme } from '../../context/ThemeContext';
import { useVehicle } from '../../context/VehicleContext';
import { usePremiumTabEntrance } from '../../hooks/usePremiumTabEntrance';
import { userGetItem, userRemoveItem } from '../../services/userStorage';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
/** Hauteur mini du bloc flip (carte plus grande, recto + verso). */
const FLIP_STAGE_MIN_H = Math.min(Math.max(SCREEN_H * 0.5, 400), 560);
const FLIP_DURATION_MS = 420;
const FLIP_EASING = Easing.out(Easing.cubic);
const WEBKIT_BACKFACE_HIDDEN = { WebkitBackfaceVisibility: 'hidden' } as unknown as ViewStyle;
const RETURN_TO_FOLDERS_FLAG = '@otto_open_folders_on_return';
const PEUGEOT_BADGE_URI =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Peugeot_2021_logo.svg/512px-Peugeot_2021_logo.svg.png';
const DOSSIER_BG = {
  docs:
    'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1400&q=80',
  usure:
    'https://images.unsplash.com/photo-1487754180451-c456f719a1fc?auto=format&fit=crop&w=1400&q=80',
  gps:
    'https://images.unsplash.com/photo-1549924231-f129b911e442?auto=format&fit=crop&w=1400&q=80',
  km: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1400&q=80',
  bilan: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1400&q=80',
} as const;

function parseOdometerKm(raw: string | undefined | null): number {
  if (raw == null || raw === '') return 0;
  const digits = String(raw).replace(/\s/g, '').replace(/\u00a0/g, '');
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

function formatKmFr(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  return Math.round(n).toLocaleString('fr-FR');
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

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ folders?: string }>();
  const { isLight } = useTheme();
  const { vehicleData } = useVehicle();
  const kmCtx = useKilometrage();
  const { animatedStyle: tabEntranceStyle } = usePremiumTabEntrance();

  const [ctBanner, setCtBanner] = useState({
    text: 'Échéance du prochain CT : NON DISPONIBLE',
    daysLeft: null as number | null,
  });
  const [entretienKpi, setEntretienKpi] = useState({
    filledModules: 0,
    lastUpdate: '-',
  });
  const [isFolderViewOpen, setIsFolderViewOpen] = useState(false);

  useEffect(() => {
    if (params.folders === '1') {
      setIsFolderViewOpen(true);
    }
  }, [params.folders]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const shouldOpen = await userGetItem(RETURN_TO_FOLDERS_FLAG);
        if (cancelled) return;
        if (shouldOpen === '1') {
          setIsFolderViewOpen(true);
          await userRemoveItem(RETURN_TO_FOLDERS_FLAG);
        }
      })().catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [])
  );

  /** 0 = recto (véhicule), 1 = verso (dossiers) */
  const flipAnim = useRef(new Animated.Value(0)).current;
  const [flipFace, setFlipFace] = useState<'front' | 'back'>('front');
  const flippingRef = useRef(false);
  /** Valeur courante du flip (pour Retour matériel : priorité fermeture dossiers) */
  const flipProgressRef = useRef(0);

  const screenIntro = useRef(new Animated.Value(0)).current;
  const scanArcSpin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const id = flipAnim.addListener(({ value }) => {
      flipProgressRef.current = value;
    });
    return () => {
      flipAnim.removeListener(id);
    };
  }, [flipAnim]);

  const flipRotation = useMemo(
    () =>
      flipAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '180deg'],
      }),
    [flipAnim]
  );

  /**
   * Sur Android / iOS, `backfaceVisibility` est souvent incorrect : le « dos » du recto
   * reste visible (texte à l’envers). On masque le recto dès la mi-rotation et on
   * n’affiche le verso qu’après — sans toucher au flip 3D (transforms inchangés).
   */
  const flipFaceFrontOpacity = useMemo(
    () =>
      flipAnim.interpolate({
        inputRange: [0, 0.499, 0.5, 1],
        outputRange: [1, 1, 0, 0],
      }),
    [flipAnim]
  );
  const flipFaceBackOpacity = useMemo(
    () =>
      flipAnim.interpolate({
        inputRange: [0, 0.499, 0.5, 1],
        outputRange: [0, 0, 1, 1],
      }),
    [flipAnim]
  );

  const totalKm = useMemo(() => parseOdometerKm(kmCtx?.km), [kmCtx]);

  const healthMarkerX = useMemo(() => {
    let p = 0.52;
    const d = ctBanner.daysLeft;
    if (d == null) p = 0.55;
    else if (d < 0) p = 0.94;
    else if (d < 30) p = 0.88;
    else if (d < 180) p = 0.55;
    else p = 0.22;
    const moduleBoost = (3 - Math.min(3, entretienKpi.filledModules)) * 0.04;
    return Math.max(0.06, Math.min(0.94, p + moduleBoost));
  }, [ctBanner.daysLeft, entretienKpi.filledModules]);

  const prochainEntretienLine = useMemo(() => {
    if (entretienKpi.filledModules >= 1 && entretienKpi.lastUpdate !== '-') {
      return `MODULES RENSEIGNÉS : ${entretienKpi.filledModules}/3 — MAJ ${entretienKpi.lastUpdate}`;
    }
    return 'PROCHAIN ENTRETIEN : À PLANIFIER (CARNET)';
  }, [entretienKpi]);

  const flipToBack = useCallback(() => {
    if (flippingRef.current || flipFace !== 'front') return;
    flippingRef.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(flipAnim, {
      toValue: 1,
      duration: FLIP_DURATION_MS,
      easing: FLIP_EASING,
      useNativeDriver: true,
    }).start(({ finished }) => {
      flippingRef.current = false;
      if (finished) {
        setFlipFace('back');
        setIsFolderViewOpen(true);
      }
    });
  }, [flipAnim, flipFace]);

  const openFoldersInstant = useCallback(() => {
    flipAnim.stopAnimation();
    flipAnim.setValue(0);
    setFlipFace('front');
    flippingRef.current = false;
    flipProgressRef.current = 0;
    setIsFolderViewOpen(true);
  }, [flipAnim]);

  const closeFoldersToHome = useCallback(() => {
    setIsFolderViewOpen(false);
    flipAnim.stopAnimation();
    flipAnim.setValue(0);
    setFlipFace('front');
    flippingRef.current = false;
    flipProgressRef.current = 0;
  }, [flipAnim]);

  const flipToFront = useCallback(() => {
    if (flippingRef.current) return;
    flipAnim.stopAnimation((value) => {
      if (value < 0.03) {
        setFlipFace('front');
        return;
      }
      flippingRef.current = true;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Animated.timing(flipAnim, {
        toValue: 0,
        duration: FLIP_DURATION_MS,
        easing: FLIP_EASING,
        useNativeDriver: true,
      }).start(({ finished }) => {
        flippingRef.current = false;
        if (finished) setFlipFace('front');
      });
    });
  }, [flipAnim]);

  /** Retour Android : d’abord retourner la carte (face dossiers), puis laisser la navigation dépiler. */
  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => {
        if (isFolderViewOpen) {
          closeFoldersToHome();
          return true;
        }
        const v = flipProgressRef.current;
        if (v > 0.03) {
          flipToFront();
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
      return () => sub.remove();
    }, [closeFoldersToHome, flipToFront, isFolderViewOpen])
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        flipAnim.setValue(0);
        setFlipFace('front');
        flippingRef.current = false;
        flipProgressRef.current = 0;
      };
    }, [flipAnim])
  );

  useFocusEffect(
    useCallback(() => {
      const loadCtStatus = async () => {
        try {
          const [raw, rawEntretien] = await Promise.all([
            userGetItem('@ma_voiture_ct_data'),
            userGetItem('@ma_voiture_entretien_modules_v1'),
          ]);
          if (!raw) {
            setCtBanner({ text: 'Échéance du prochain CT : NON DISPONIBLE', daysLeft: null });
          } else {
            const parsed = JSON.parse(raw) as { info?: Record<string, unknown> };
            const info = parsed?.info ?? {};
            const savedProchainCt = typeof info.prochainCt === 'string' ? info.prochainCt : '';
            const savedDateCt = typeof info.dateCt === 'string' ? info.dateCt : '';

            let expiryDate = parseFrDate(savedProchainCt);
            if (!expiryDate) {
              const visitDate = parseFrDate(savedDateCt);
              if (visitDate) expiryDate = addYears(visitDate, 2);
            }
            if (!expiryDate) {
              setCtBanner({ text: 'Échéance du prochain CT : NON DISPONIBLE', daysLeft: null });
            } else {
              const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              const expiry = formatFr(expiryDate);
              const text =
                daysLeft >= 0
                  ? `Échéance du prochain CT : ${daysLeft} j (${expiry})`
                  : `CT expiré depuis ${Math.abs(daysLeft)} j (${expiry})`;
              setCtBanner({ text, daysLeft });
            }
          }

          if (rawEntretien) {
            const parsedEntretien = JSON.parse(rawEntretien) as Record<string, unknown>;
            const pneus = (parsedEntretien?.pneus ?? {}) as Record<string, unknown>;
            const batterie = (parsedEntretien?.batterie ?? {}) as Record<string, unknown>;
            const phares = (parsedEntretien?.phares ?? {}) as Record<string, unknown>;
            const hasPneus = Boolean(pneus?.largeur || pneus?.photoUri || ((pneus?.history as unknown[])?.length ?? 0) > 0);
            const hasBatterie = Boolean(batterie?.modele || batterie?.dateAchat || batterie?.photoUri);
            const hasPhares = Boolean(phares?.ampoule || phares?.position || phares?.photoUri);
            const filledModules = [hasPneus, hasBatterie, hasPhares].filter(Boolean).length;
            const lastUpdatedAt = (pneus?.history as { updatedAt?: number }[] | undefined)?.[0]?.updatedAt;
            const lastUpdate = lastUpdatedAt
              ? new Date(lastUpdatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
              : '-';
            setEntretienKpi({ filledModules, lastUpdate });
          } else {
            setEntretienKpi({ filledModules: 0, lastUpdate: '-' });
          }
        } catch (error) {
          console.log('[Home] load CT status failed', error);
        }
      };
      loadCtStatus();
    }, [])
  );

  useEffect(() => {
    screenIntro.setValue(0);
    Animated.timing(screenIntro, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [screenIntro]);

  useEffect(() => {
    scanArcSpin.setValue(0);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scanArcSpin, {
        toValue: 0.55,
        duration: 520,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(scanArcSpin, {
        toValue: 1,
        duration: 980,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [scanArcSpin]);

  const scanArcSpinStyle = useMemo(
    () => ({
      transform: [
        {
          rotate: scanArcSpin.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '360deg'],
          }),
        },
      ],
    }),
    [scanArcSpin]
  );

  /** Accueil : fond toujours bleu nuit ; carte véhicule blanche (maquette). */
  const homeBg = '#091a34';

  if (isFolderViewOpen) {
    return (
      <SafeAreaView style={[styles.safeRoot, { backgroundColor: homeBg }]} edges={['top', 'left', 'right', 'bottom']}>
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'rgba(85, 204, 255, 0.06)', 'rgba(5, 10, 18, 0.98)']}
          locations={[0, 0.45, 1]}
          style={styles.bgGlow}
        />
        <Animated.View style={[tabEntranceStyle, { flex: 1, opacity: screenIntro }]}>
          <View style={styles.layer}>
            <View style={styles.mainColumn}>
              <View style={styles.topBar}>
                <View style={styles.logoWrap}>
                  <Text style={[styles.logoOttoBase, isLight && styles.logoOttoBaseLight]}>OTTO</Text>
                  <Text style={[styles.logoOtto, isLight && styles.logoOttoLight]}>OTTO</Text>
                  <Text style={[styles.logoOttoShine, isLight && styles.logoOttoShineLight]}>OTTO</Text>
                  <View style={styles.logoCutOne} pointerEvents="none" />
                  <View style={styles.logoCutTwo} pointerEvents="none" />
                  <View style={styles.logoCutThree} pointerEvents="none" />
                </View>
                <Pressable
                  style={({ pressed }) => [styles.profilBtn, pressed && styles.profilBtnPressed]}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    router.push('/profil');
                  }}
                >
                  <View style={styles.profilAvatar}>
                    <User size={20} color={isLight ? '#0f172a' : '#e2e8f0'} />
                  </View>
                  <View style={styles.proBadge}>
                    <Text style={styles.proBadgeText}>PRO</Text>
                  </View>
                  <Text style={[styles.profilLabel, isLight && styles.profilLabelLight]}>Profil</Text>
                </Pressable>
              </View>

              <View style={styles.cardSection}>
                <View style={styles.flipStage}>
                  <View style={styles.backTopControl}>
                    <Pressable
                      onPress={closeFoldersToHome}
                      style={({ pressed }) => [styles.backToFrontBtn, pressed && styles.backToFrontBtnPressed]}
                    >
                      <MaterialCommunityIcons name="arrow-left" size={18} color="#0f172a" />
                      <Text style={styles.backToFrontTxt}>ACCUEIL</Text>
                    </Pressable>
                  </View>
                  <View style={styles.whiteCardBack}>
                    <View style={styles.backFoldersGrid}>
                      <ElectricPressable
                        style={styles.docsFolderCard}
                        borderRadius={16}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          router.push('/docs');
                        }}
                      >
                        <ImageBackground source={{ uri: DOSSIER_BG.docs }} style={styles.folderPhoto} imageStyle={styles.folderPhotoImage}>
                          <LinearGradient
                            colors={['rgba(8,15,28,0.52)', 'rgba(8,15,28,0.18)', 'rgba(8,15,28,0.62)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.folderPhotoOverlay}
                          />
                        </ImageBackground>
                        <View style={styles.docsFolderIconWrap}>
                          <MaterialCommunityIcons name="file-document-multiple-outline" size={24} color="#e2e8f0" />
                        </View>
                        <View style={styles.gpsFolderTextCol}>
                          <Text style={styles.gpsFolderTitle}>MES DOCUMENTS</Text>
                          <Text style={styles.gpsFolderSub}>Permis, carte grise, CT et dossiers</Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={20} color="#f8fafc" />
                      </ElectricPressable>
                      <ElectricPressable
                        style={styles.usureFolderCard}
                        borderRadius={16}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          router.push('./usure');
                        }}
                      >
                        <ImageBackground source={{ uri: DOSSIER_BG.usure }} style={styles.folderPhoto} imageStyle={styles.folderPhotoImage}>
                          <LinearGradient
                            colors={['rgba(8,15,28,0.52)', 'rgba(8,15,28,0.18)', 'rgba(8,15,28,0.62)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.folderPhotoOverlay}
                          />
                        </ImageBackground>
                        <View style={styles.usureFolderIconWrap}>
                          <MaterialCommunityIcons name="car-wrench" size={24} color="#e2e8f0" />
                        </View>
                        <View style={styles.gpsFolderTextCol}>
                          <Text style={styles.gpsFolderTitle}>PIECES D'USURE</Text>
                          <Text style={styles.gpsFolderSub}>Phares, pneus, batterie et suivi</Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={20} color="#f8fafc" />
                      </ElectricPressable>
                      <ElectricPressable
                        style={styles.gpsFolderCard}
                        borderRadius={16}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          router.push('/location');
                        }}
                      >
                        <ImageBackground source={{ uri: DOSSIER_BG.gps }} style={styles.folderPhoto} imageStyle={styles.folderPhotoImage}>
                          <LinearGradient
                            colors={['rgba(8,15,28,0.52)', 'rgba(8,15,28,0.18)', 'rgba(8,15,28,0.62)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.folderPhotoOverlay}
                          />
                        </ImageBackground>
                        <View style={styles.gpsFolderIconWrap}>
                          <MaterialCommunityIcons name="earth" size={24} color="#e2e8f0" />
                        </View>
                        <View style={styles.gpsFolderTextCol}>
                          <Text style={styles.gpsFolderTitle}>GPS</Text>
                          <Text style={styles.gpsFolderSub}>Trajets, navigation et road trips</Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={20} color="#f8fafc" />
                      </ElectricPressable>
                      <ElectricPressable
                        style={styles.kmFolderCard}
                        borderRadius={16}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          router.push('/km');
                        }}
                      >
                        <ImageBackground source={{ uri: DOSSIER_BG.km }} style={styles.folderPhoto} imageStyle={styles.folderPhotoImage}>
                          <LinearGradient
                            colors={['rgba(8,15,28,0.52)', 'rgba(8,15,28,0.18)', 'rgba(8,15,28,0.62)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.folderPhotoOverlay}
                          />
                        </ImageBackground>
                        <View style={styles.kmFolderIconWrap}>
                          <MaterialCommunityIcons name="speedometer" size={24} color="#e2e8f0" />
                        </View>
                        <View style={styles.gpsFolderTextCol}>
                          <Text style={styles.gpsFolderTitle}>KM</Text>
                          <Text style={styles.gpsFolderSub}>Kilometrage et statistiques</Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={20} color="#f8fafc" />
                      </ElectricPressable>
                      <ElectricPressable
                        style={styles.kmFolderCard}
                        borderRadius={16}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          router.push('/bilan_stats');
                        }}
                      >
                        <ImageBackground source={{ uri: DOSSIER_BG.bilan }} style={styles.folderPhoto} imageStyle={styles.folderPhotoImage}>
                          <LinearGradient
                            colors={['rgba(8,15,28,0.52)', 'rgba(8,15,28,0.18)', 'rgba(8,15,28,0.62)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.folderPhotoOverlay}
                          />
                        </ImageBackground>
                        <View style={styles.kmFolderIconWrap}>
                          <MaterialCommunityIcons name="chart-line" size={24} color="#e2e8f0" />
                        </View>
                        <View style={styles.gpsFolderTextCol}>
                          <Text style={styles.gpsFolderTitle}>BILAN & STATISTIQUE</Text>
                          <Text style={styles.gpsFolderSub}>Vue globale et indicateurs clés</Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={20} color="#f8fafc" />
                      </ElectricPressable>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.dock} pointerEvents="box-none">
              <Pressable
                style={({ pressed }) => [styles.scanFab, pressed && styles.scanFabPressed]}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push('/scan');
                }}
              >
                <Svg style={styles.scanFabGradient} pointerEvents="none" viewBox="0 0 100 100">
                  <Defs>
                    <RadialGradient id="scanFlash" cx="50%" cy="42%" rx="60%" ry="60%">
                      <Stop offset="0%" stopColor="#1f6eff" stopOpacity="1" />
                      <Stop offset="58%" stopColor="#2f8dff" stopOpacity="1" />
                      <Stop offset="86%" stopColor="#59c7ff" stopOpacity="0.95" />
                      <Stop offset="100%" stopColor="#8de8ff" stopOpacity="0.95" />
                    </RadialGradient>
                  </Defs>
                  <Circle cx="50" cy="50" r="50" fill="url(#scanFlash)" />
                  <Circle cx="50" cy="50" r="39" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.2" />
                  <Circle cx="50" cy="50" r="30" fill="none" stroke="rgba(8,17,35,0.24)" strokeWidth="1.6" />
                  <Circle cx="50" cy="50" r="11" fill="rgba(15,23,42,0.2)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.4" />
                  <Line x1="50" y1="22" x2="50" y2="39" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" />
                  <Line x1="31" y1="56" x2="43" y2="50" stroke="rgba(255,255,255,0.42)" strokeWidth="2" strokeLinecap="round" />
                  <Line x1="69" y1="56" x2="57" y2="50" stroke="rgba(255,255,255,0.42)" strokeWidth="2" strokeLinecap="round" />
                </Svg>
                <Animated.View style={[styles.scanRimArcLayer, scanArcSpinStyle]} pointerEvents="none">
                  <Svg width={94} height={94} viewBox="0 0 94 94">
                    <Circle
                      cx="47"
                      cy="47"
                      r="43"
                      fill="none"
                      stroke="rgba(255,255,255,0.12)"
                      strokeWidth="1"
                    />
                    <Circle
                      cx="47"
                      cy="47"
                      r="43"
                      fill="none"
                      stroke="rgba(125,211,252,0.92)"
                      strokeWidth="1.85"
                      strokeLinecap="round"
                      strokeDasharray="40 248"
                    />
                    <Circle
                      cx="47"
                      cy="47"
                      r="41"
                      fill="none"
                      stroke="rgba(255,255,255,0.42)"
                      strokeWidth="1.05"
                      strokeLinecap="round"
                      strokeDasharray="14 256"
                    />
                  </Svg>
                </Animated.View>
                <Text style={styles.scanFabLetter}>O</Text>
              </Pressable>
              <View style={styles.scanDockCard}>
                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(255,255,255,0.24)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0)']}
                  locations={[0, 0.45, 1]}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.85, y: 1 }}
                  style={styles.scanDockSheen}
                />
                <Text style={styles.scanCaption}>OTTO SCAN</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeRoot, { backgroundColor: homeBg }]} edges={['top', 'left', 'right', 'bottom']}>
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', 'rgba(85, 204, 255, 0.06)', 'rgba(5, 10, 18, 0.98)']}
        locations={[0, 0.45, 1]}
        style={styles.bgGlow}
      />

      <Animated.View style={[tabEntranceStyle, { flex: 1, opacity: screenIntro }]}>
        <View style={styles.layer}>
          <View style={styles.flipFront}>
            <View style={styles.mainColumn}>
              <View style={styles.topBar}>
                <View style={styles.logoWrap}>
                  <Text style={[styles.logoOttoBase, isLight && styles.logoOttoBaseLight]}>OTTO</Text>
                  <Text style={[styles.logoOtto, isLight && styles.logoOttoLight]}>OTTO</Text>
                  <Text style={[styles.logoOttoShine, isLight && styles.logoOttoShineLight]}>OTTO</Text>
                  <View style={styles.logoCutOne} pointerEvents="none" />
                  <View style={styles.logoCutTwo} pointerEvents="none" />
                  <View style={styles.logoCutThree} pointerEvents="none" />
                </View>
                <Pressable
                  style={({ pressed }) => [styles.profilBtn, pressed && styles.profilBtnPressed]}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    router.push('/profil');
                  }}
                >
                  <View style={styles.profilAvatar}>
                    <User size={20} color={isLight ? '#0f172a' : '#e2e8f0'} />
                  </View>
                  <View style={styles.proBadge}>
                    <Text style={styles.proBadgeText}>PRO</Text>
                  </View>
                  <Text style={[styles.profilLabel, isLight && styles.profilLabelLight]}>Profil</Text>
                </Pressable>
              </View>

              <View style={styles.cardSection}>
                <View style={styles.flipStage}>
                  {/*
                    Technique double-face (équivalent CSS) :
                    parent perspective → enfant flipper (preserve-3d + rotateY animé)
                    → .front / .back en absolute, backface-visibility: hidden,
                    .back pré-rotée à 180° pour afficher le verso correctement.
                  */}
                  <View style={styles.perspectiveParent}>
                    <Animated.View
                      style={[
                        styles.flipper,
                        {
                          transformStyle: 'preserve-3d',
                          transform: [{ rotateY: flipRotation }],
                        } as ViewStyle & { transformStyle: 'preserve-3d' | 'flat' },
                      ]}
                    >
                      <View
                        style={[styles.cardFace, WEBKIT_BACKFACE_HIDDEN]}
                        pointerEvents={flipFace === 'back' ? 'none' : 'auto'}
                      >
                        <Animated.View
                          style={[styles.faceOpacityLayer, { opacity: flipFaceFrontOpacity }]}
                          needsOffscreenAlphaCompositing
                        >
                      <ElectricPressable
                        style={[styles.whiteCard, WEBKIT_BACKFACE_HIDDEN]}
                        borderRadius={40}
                        onPress={(e) => {
                          e.stopPropagation();
                          openFoldersInstant();
                        }}
                      >
                        <View style={styles.vehicleBrandRow}>
                          <Image source={{ uri: PEUGEOT_BADGE_URI }} style={styles.vehicleBrandLogo} resizeMode="contain" />
                          <Text style={styles.vehicleBrandTitle}>PEUGEOT 307</Text>
                        </View>
                        <Text style={styles.vehicleSubtitle} numberOfLines={1}>
                          {[vehicleData.marque, vehicleData.modele].filter(Boolean).join(' ') || 'Véhicule'}
                        </Text>

                        <View style={styles.photoFrame}>
                          <View style={styles.photoInner}>
                            {vehicleData.photoUri ? (
                              <>
                                <Image source={{ uri: vehicleData.photoUri }} style={styles.vehicleImg} resizeMode="contain" />
                                <View pointerEvents="none" style={styles.vehicleLeftEdgeMask} />
                                <View pointerEvents="none" style={styles.vehicleWatermarkMask} />
                              </>
                            ) : (
                              <View style={styles.photoPlaceholder}>
                                <MaterialCommunityIcons name="car-sports" size={40} color="#94a3b8" />
                                <Text style={styles.photoPlaceholderTxt}>Photo (Profil)</Text>
                              </View>
                            )}
                          </View>
                        </View>

                        <Text style={styles.kmHuge}>{formatKmFr(totalKm)} KM</Text>
                        <Text style={styles.kmLabel}>KILOMÉTRAGE</Text>
                        <Text style={styles.kmHint}>Automatiquement mis a jour par GPS</Text>

                        <View style={styles.healthBlock}>
                          <View style={styles.healthBarBg}>
                            <LinearGradient
                              colors={['#22c55e', '#eab308', '#ef4444']}
                              start={{ x: 0, y: 0.5 }}
                              end={{ x: 1, y: 0.5 }}
                              style={StyleSheet.absoluteFill}
                            />
                            <View
                              style={[
                                styles.healthMarker,
                                { left: `${healthMarkerX * 100}%`, transform: [{ translateX: -2 }] },
                              ]}
                            />
                          </View>
                          <View style={styles.healthLegend}>
                            <Text style={styles.healthLegendTxt}>Green</Text>
                            <Text style={styles.healthLegendTxt}>Red</Text>
                          </View>
                        </View>

                        <Text style={styles.nextMaint}>{prochainEntretienLine}</Text>
                        <Text style={styles.ctHint} numberOfLines={1}>
                          {ctBanner.text}
                        </Text>
                        <Text style={styles.santeFooter}>SANTÉ DU VÉHICULE</Text>
                      </ElectricPressable>
                        </Animated.View>
                      </View>

                      <View
                        style={[styles.cardFace, styles.cardBack, WEBKIT_BACKFACE_HIDDEN]}
                        pointerEvents={flipFace === 'front' ? 'none' : 'auto'}
                      >
                        <Animated.View
                          style={[styles.faceOpacityLayer, { opacity: flipFaceBackOpacity }]}
                          needsOffscreenAlphaCompositing
                        >
                        <Pressable
                          style={[styles.whiteCardBack, WEBKIT_BACKFACE_HIDDEN]}
                          onPress={(e) => {
                            e.stopPropagation();
                            flipToFront();
                          }}
                        />
                        </Animated.View>
                      </View>
                    </Animated.View>
                  </View>
                </View>
              </View>

            </View>

            <View style={styles.dock} pointerEvents="box-none">
              <Pressable
                style={({ pressed }) => [styles.scanFab, pressed && styles.scanFabPressed]}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push('/scan');
                }}
              >
                <Svg style={styles.scanFabGradient} pointerEvents="none" viewBox="0 0 100 100">
                  <Defs>
                    <RadialGradient id="scanFlash" cx="50%" cy="42%" rx="60%" ry="60%">
                      <Stop offset="0%" stopColor="#1f6eff" stopOpacity="1" />
                      <Stop offset="58%" stopColor="#2f8dff" stopOpacity="1" />
                      <Stop offset="86%" stopColor="#59c7ff" stopOpacity="0.95" />
                      <Stop offset="100%" stopColor="#8de8ff" stopOpacity="0.95" />
                    </RadialGradient>
                  </Defs>
                  <Circle cx="50" cy="50" r="50" fill="url(#scanFlash)" />
                  <Circle cx="50" cy="50" r="39" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.2" />
                  <Circle cx="50" cy="50" r="30" fill="none" stroke="rgba(8,17,35,0.24)" strokeWidth="1.6" />
                  <Circle cx="50" cy="50" r="11" fill="rgba(15,23,42,0.2)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.4" />
                  <Line x1="50" y1="22" x2="50" y2="39" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" />
                  <Line x1="31" y1="56" x2="43" y2="50" stroke="rgba(255,255,255,0.42)" strokeWidth="2" strokeLinecap="round" />
                  <Line x1="69" y1="56" x2="57" y2="50" stroke="rgba(255,255,255,0.42)" strokeWidth="2" strokeLinecap="round" />
                </Svg>
                <Animated.View style={[styles.scanRimArcLayer, scanArcSpinStyle]} pointerEvents="none">
                  <Svg width={94} height={94} viewBox="0 0 94 94">
                    <Circle
                      cx="47"
                      cy="47"
                      r="43"
                      fill="none"
                      stroke="rgba(255,255,255,0.12)"
                      strokeWidth="1"
                    />
                    <Circle
                      cx="47"
                      cy="47"
                      r="43"
                      fill="none"
                      stroke="rgba(125,211,252,0.92)"
                      strokeWidth="1.85"
                      strokeLinecap="round"
                      strokeDasharray="40 248"
                    />
                    <Circle
                      cx="47"
                      cy="47"
                      r="41"
                      fill="none"
                      stroke="rgba(255,255,255,0.42)"
                      strokeWidth="1.05"
                      strokeLinecap="round"
                      strokeDasharray="14 256"
                    />
                  </Svg>
                </Animated.View>
                <Text style={styles.scanFabLetter}>O</Text>
              </Pressable>
              <View style={styles.scanDockCard}>
                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(255,255,255,0.24)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0)']}
                  locations={[0, 0.45, 1]}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.85, y: 1 }}
                  style={styles.scanDockSheen}
                />
                <Text style={styles.scanCaption}>OTTO SCAN</Text>
              </View>
            </View>
          </View>

        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeRoot: {
    flex: 1,
  },
  layer: {
    flex: 1,
    position: 'relative',
  },
  bgGlow: {
    ...StyleSheet.absoluteFillObject,
    height: '52%',
    top: undefined,
    bottom: 0,
  },
  flipFront: {
    flex: 1,
    minHeight: 0,
  },
  mainColumn: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 16,
  },
  cardSection: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'flex-start',
    paddingTop: 8,
    paddingBottom: 0,
  },
  flipStage: {
    flex: 1,
    minHeight: FLIP_STAGE_MIN_H,
    width: '100%',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  /** Équivalent CSS : .scene { perspective: … } */
  perspectiveParent: {
    flex: 1,
    minHeight: FLIP_STAGE_MIN_H,
    width: '100%',
    alignSelf: 'center',
    transform: [{ perspective: 1800 }],
  },
  /** Équivalent : .flipper { transform-style: preserve-3d; transform: rotateY(…) } */
  flipper: {
    flex: 1,
    minHeight: FLIP_STAGE_MIN_H,
    width: '100%',
    position: 'relative',
  },
  /** Faces communes : positionnement + backface-visibility: hidden */
  cardFace: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backfaceVisibility: 'hidden',
  },
  /** Calque d’opacité natif (recto / verso) — remplit la face sans changer le layout du flip */
  faceOpacityLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  /** .back — rotateY(180deg) pour ne pas être en miroir une fois le flipper à 180° */
  cardBack: {
    transform: [{ rotateY: '180deg' }],
  },
  whiteCardBack: {
    flex: 1,
    backfaceVisibility: 'hidden',
    backgroundColor: '#ffffff',
    borderRadius: 40,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 10,
  },
  backTopControl: {
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  backToFrontBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  backToFrontBtnPressed: {
    opacity: 0.88,
  },
  backToFrontTxt: {
    color: '#0f172a',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  backFoldersGrid: {
    flex: 1,
    flexDirection: 'column',
    gap: 8,
    paddingHorizontal: 11,
    paddingTop: 10,
    paddingBottom: 10,
  },
  backFolderCard: {
    width: '100%',
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  backFolderCardPressed: {
    transform: [{ scale: 0.992 }],
    opacity: 0.96,
  },
  backFolderTitle: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'left',
    flex: 1,
  },
  docsFolderCard: {
    width: '100%',
    minHeight: 88,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.34)',
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  docsFolderIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(186,230,253,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.78)',
  },
  usureFolderCard: {
    width: '100%',
    minHeight: 88,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.34)',
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  usureFolderIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(191,219,254,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.78)',
  },
  gpsFolderCard: {
    width: '100%',
    minHeight: 88,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.34)',
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  gpsFolderIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(186,230,253,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.78)',
  },
  gpsFolderTextCol: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  folderPhoto: {
    ...StyleSheet.absoluteFillObject,
  },
  folderPhotoImage: {
    resizeMode: 'cover',
  },
  folderPhotoOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  gpsFolderTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.1,
    textShadowColor: 'rgba(2,6,23,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  gpsFolderSub: {
    marginTop: 4,
    color: 'rgba(226,232,240,0.94)',
    fontSize: 11,
    fontWeight: '600',
    textShadowColor: 'rgba(2,6,23,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  kmFolderCard: {
    width: '100%',
    minHeight: 88,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.34)',
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  kmFolderIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(191,219,254,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.78)',
  },
  topBar: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  logoWrap: {
    position: 'relative',
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  logoOttoBase: {
    fontSize: 34,
    fontWeight: '900',
    color: '#3e7eb8',
    letterSpacing: 3.6,
    fontStyle: 'italic',
    textShadowColor: 'rgba(120, 190, 255, 0.20)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  logoOttoBaseLight: {
    color: '#3777b0',
    textShadowRadius: 0,
  },
  logoOtto: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 34,
    fontWeight: '900',
    color: '#88d9ff',
    letterSpacing: 3.4,
    fontStyle: 'italic',
    textShadowColor: 'rgba(55, 176, 255, 0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 9,
  },
  logoOttoShine: {
    position: 'absolute',
    top: -1,
    left: 1,
    fontSize: 34,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: 3.4,
    fontStyle: 'italic',
    textShadowColor: 'rgba(125,211,252,0.95)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  logoCutOne: {
    position: 'absolute',
    top: 12,
    left: 18,
    width: 20,
    height: 2.2,
    borderRadius: 2,
    backgroundColor: '#1f4f7f',
    transform: [{ rotate: '-22deg' }],
    opacity: 0.95,
  },
  logoCutTwo: {
    position: 'absolute',
    top: 18,
    left: 61,
    width: 20,
    height: 2.2,
    borderRadius: 2,
    backgroundColor: '#1f4f7f',
    transform: [{ rotate: '-22deg' }],
    opacity: 0.95,
  },
  logoCutThree: {
    position: 'absolute',
    top: 12,
    left: 102,
    width: 19,
    height: 2.2,
    borderRadius: 2,
    backgroundColor: '#1f4f7f',
    transform: [{ rotate: '-22deg' }],
    opacity: 0.95,
  },
  logoOttoLight: {
    color: '#64b9f2',
    textShadowRadius: 0,
  },
  logoOttoShineLight: {
    color: 'rgba(255,255,255,0.62)',
    textShadowRadius: 6,
  },
  profilBtn: { alignItems: 'center' },
  profilBtnPressed: { opacity: 0.88 },
  profilAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(148,163,184,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  proBadge: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#0f172a',
  },
  proBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  profilLabel: { marginTop: 4, color: OTTO_THEME.textOnDark, fontSize: 11, fontWeight: '700' },
  profilLabelLight: { color: '#0f172a' },
  whiteCard: {
    backgroundColor: '#ffffff',
    borderRadius: 40,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    flex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 10,
  },
  whiteCardPressed: { opacity: 0.98 },
  vehicleBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 8,
  },
  vehicleBrandLogo: {
    width: 28,
    height: 28,
  },
  vehicleBrandTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: OTTO_THEME.textOnCard,
    letterSpacing: 0.9,
    textAlign: 'center',
  },
  vehicleSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'center',
  },
  photoFrame: {
    marginTop: 10,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    width: '100%',
    maxWidth: SCREEN_W - 36,
    alignSelf: 'center',
  },
  photoInner: {
    width: '100%',
    aspectRatio: 1.55,
    maxHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  vehicleImg: {
    width: '100%',
    height: '100%',
    transform: [{ translateX: 10 }, { scale: 1.03 }],
  },
  vehicleWatermarkMask: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 74,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopRightRadius: 12,
  },
  vehicleLeftEdgeMask: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 10,
    backgroundColor: 'rgba(255,255,255,0.98)',
  },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  photoPlaceholderTxt: { marginTop: 6, fontSize: 12, color: '#64748b', fontWeight: '600' },
  kmHuge: {
    marginTop: 8,
    fontSize: 49,
    fontWeight: '900',
    color: OTTO_THEME.textOnCard,
    letterSpacing: 1.4,
    textAlign: 'center',
  },
  kmLabel: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '800',
    color: '#4b5563',
    letterSpacing: 2,
    textAlign: 'center',
  },
  kmHint: {
    marginTop: 4,
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
  },
  healthBlock: { marginTop: 16 },
  healthBarBg: {
    height: 12,
    borderRadius: 999,
    overflow: 'hidden',
    position: 'relative',
  },
  healthMarker: {
    position: 'absolute',
    top: -4,
    width: 10,
    height: 20,
    marginLeft: -5,
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    borderWidth: 1.2,
    borderColor: 'rgba(37,99,235,0.75)',
    shadowColor: '#60a5fa',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 5,
    elevation: 3,
  },
  healthLegend: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  healthLegendTxt: { fontSize: 11, fontWeight: '700', color: '#4b5563' },
  nextMaint: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '800',
    color: OTTO_THEME.textOnCard,
    letterSpacing: 0.2,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  ctHint: {
    marginTop: 3,
    fontSize: 9,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
    opacity: 0.75,
  },
  santeFooter: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#334155',
  },
  dock: {
    marginTop: 12,
    height: 145,
    marginHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  scanDockCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 50,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: 'rgba(8, 17, 35, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(93, 173, 255, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  scanDockSheen: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.95,
  },
  scanFab: {
    position: 'absolute',
    top: -7,
    width: 94,
    height: 94,
    borderRadius: 47,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2c86ff',
    overflow: 'hidden',
    zIndex: 2,
    shadowColor: '#3b9dff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 30,
    elevation: 28,
  },
  scanFabGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  scanRimArcLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFabLetter: {
    color: '#ffffff',
    fontSize: 44,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 1.2,
    textShadowColor: 'rgba(125,211,252,0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 9,
    marginTop: -2,
  },
  scanFabPressed: { opacity: 0.97, transform: [{ scale: 0.985 }] },
  scanCaption: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 4,
    textShadowColor: 'rgba(125,211,252,0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
});
