import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BarChart3, ClipboardList, FileText, MapPin, PenTool, Settings } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Image, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';

import { GarageConnectLogo } from '../../components/GarageConnectLogo';
import { UI_THEME } from '../../constants/uiTheme';
import { useKilometrage } from '../../context/KilometrageContext';
import { useTheme } from '../../context/ThemeContext';
import { useVehicle } from '../../context/VehicleContext';
import { userGetItem } from '../../services/userStorage';

const categories = [
  { id: 1, title: 'CARNET D\'ENTRETIEN', description: 'Gérez vos révisions et interventions.', icon: ClipboardList, color: '#3182CE' },
  { id: 2, title: 'DOCUMENTS DU VÉHICULE', description: 'Cartes grises, assurances...', icon: FileText, color: '#48BB78' },
  { id: 3, title: 'DIAGNOSTICS & ALERTES', description: 'Consultez les codes d\'erreur OBD-II.', icon: PenTool, color: '#ED8936' },
  { id: 4, title: 'FRAIS & DÉPENSES', description: 'Suivez votre budget auto.', icon: BarChart3, color: '#805AD5' },
  { id: 5, title: 'GPS', description: 'Trajets intelligents et position live', icon: MapPin, color: '#F56565' },
  { id: 6, title: 'KM', description: 'Statistiques synchronisées', icon: Settings, color: '#00F2FF' },
];

function parseOdometerKm(raw: string | undefined | null): number {
  if (raw == null || raw === '') return 0;
  const digits = String(raw).replace(/\s/g, '').replace(/\u00a0/g, '');
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

function readNumericStat(ctx: unknown, key: string): number {
  if (ctx == null || typeof ctx !== 'object') return 0;
  const v = (ctx as Record<string, unknown>)[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
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

function extractDepartementFromImmat(immat: string | undefined): string {
  const raw = String(immat ?? '').toUpperCase().trim();
  if (!raw) return '--';
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  const m = cleaned.match(/(\d{2,3})$/);
  if (!m) return '--';
  const dep = m[1];
  if (dep.length === 2) return dep;
  if (dep.length === 3 && dep.startsWith('0')) return dep.slice(1);
  return dep;
}

const MARSEILLE_ESCUTCHEON_URI =
  'https://commons.wikimedia.org/wiki/Special:FilePath/Blason-Marseille.png';

function ctUrgencyColor(daysLeft: number): string {
  if (daysLeft < 0) return '#C53030';
  if (daysLeft < 30) return '#C53030';
  if (daysLeft < 180) return '#e67e22';
  return '#2ecc71';
}

export default function HomeScreen() {
  const router = useRouter();
  const { theme, isLight } = useTheme();
  const { vehicleData } = useVehicle();
  const kmCtx = useKilometrage();
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [ctBanner, setCtBanner] = useState({
    text: 'Échéance du prochain CT : NON DISPONIBLE',
    daysLeft: null as number | null,
  });
  const [entretienKpi, setEntretienKpi] = useState({
    filledModules: 0,
    lastUpdate: '-',
  });
  const [docPreview, setDocPreview] = useState({ permis: '', cg: '' });
  const [docModal, setDocModal] = useState<null | 'permis' | 'cg'>(null);
  const compact = screenH < 820;
  const ANIM_TIMING = {
    pulse: 620,
    premiumPulse: 680,
    intro: 420,
  } as const;
  const marqueeAnim = useRef(new Animated.Value(0)).current;
  const alertPulse = useRef(new Animated.Value(1)).current;
  const onlineBlink = useRef(new Animated.Value(1)).current;
  const premiumPulse = useRef(new Animated.Value(1)).current;
  const brandRollAnim = useRef(new Animated.Value(0)).current;
  const screenIntro = useRef(new Animated.Value(0)).current;
  const gpsPulse = useRef(new Animated.Value(1)).current;

  const kmStats = useMemo(() => {
    const total = parseOdometerKm(kmCtx?.km);
    const jour = readNumericStat(kmCtx, 'kmJour');
    const semaine = readNumericStat(kmCtx, 'kmHebdo');
    const mois = readNumericStat(kmCtx, 'kmMois');
    const an = readNumericStat(kmCtx, 'kmAn');
    return { total, jour, semaine, mois, an };
  }, [kmCtx]);
  const immatDisplay = useMemo(() => (vehicleData.immat || '-').toUpperCase(), [vehicleData.immat]);
  const depCode = useMemo(() => extractDepartementFromImmat(vehicleData.immat), [vehicleData.immat]);

  useFocusEffect(
    useCallback(() => {
      const loadCtStatus = async () => {
        try {
          const [raw, rawEntretien, rawPermis, rawCg] = await Promise.all([
            userGetItem('@ma_voiture_ct_data'),
            userGetItem('@ma_voiture_entretien_modules_v1'),
            userGetItem('@ma_voiture_permis_data'),
            userGetItem('@ma_voiture_cg_data_complete'),
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
            const parsedEntretien = JSON.parse(rawEntretien) as Record<string, any>;
            const pneus = parsedEntretien?.pneus ?? {};
            const batterie = parsedEntretien?.batterie ?? {};
            const phares = parsedEntretien?.phares ?? {};
            const hasPneus = Boolean(pneus?.largeur || pneus?.photoUri || (pneus?.history?.length ?? 0) > 0);
            const hasBatterie = Boolean(batterie?.modele || batterie?.dateAchat || batterie?.photoUri);
            const hasPhares = Boolean(phares?.ampoule || phares?.position || phares?.photoUri);
            const filledModules = [hasPneus, hasBatterie, hasPhares].filter(Boolean).length;
            const lastUpdatedAt = pneus?.history?.[0]?.updatedAt;
            const lastUpdate = lastUpdatedAt
              ? new Date(lastUpdatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
              : '-';
            setEntretienKpi({ filledModules, lastUpdate });
          } else {
            setEntretienKpi({ filledModules: 0, lastUpdate: '-' });
          }

          try {
            const permisImage = rawPermis ? String((JSON.parse(rawPermis) as { image?: string })?.image ?? '') : '';
            const cgImage = rawCg ? String((JSON.parse(rawCg) as { image?: string })?.image ?? '') : '';
            setDocPreview({ permis: permisImage, cg: cgImage });
          } catch {
            setDocPreview({ permis: '', cg: '' });
          }
        } catch (error) {
          console.log('[Home] load CT status failed', error);
        }
      };
      loadCtStatus();
    }, [])
  );

  const handleCategoryPress = (id: number) => {
    switch (id) {
      case 1:
        router.push('/entretien');
        break;
      case 2:
        router.push('/docs');
        break;
      case 3:
        router.push('/diagnostics');
        break;
      case 4:
        router.push('/factures');
        break;
      case 5:
        router.push('/location');
        break;
      case 6:
        router.push('/km');
        break;
      default:
        break;
    }
  };

  const dashboardTickerText = useMemo(() => {
    return "SCAN AVEC L'IA : ABONNEZ-VOUS AU PREMIUM ET PROFITEZ DE TOUTES LES FONCTIONNALITÉS IA •";
  }, []);

  const tickerTone = useMemo(() => {
    return {
      priority: 'premium' as const,
      dot: '#fbbf24',
      border: 'rgba(251,191,36,0.7)',
      text: '#fff7da',
      label: 'IA PREMIUM',
      gradient: ['rgba(251,191,36,0.26)', 'rgba(22,12,5,0.94)', 'rgba(0,242,255,0.2)'] as const,
    };
  }, []);

  useEffect(() => {
    screenIntro.setValue(0);
    Animated.timing(screenIntro, {
      toValue: 1,
      duration: ANIM_TIMING.intro,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [screenIntro]);

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(alertPulse, {
          toValue: 1.18,
          duration: ANIM_TIMING.pulse,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(alertPulse, {
          toValue: 1,
          duration: ANIM_TIMING.pulse,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [alertPulse]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(premiumPulse, {
          toValue: 1.08,
          duration: ANIM_TIMING.premiumPulse,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(premiumPulse, {
          toValue: 1,
          duration: ANIM_TIMING.premiumPulse,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [premiumPulse]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(gpsPulse, {
          toValue: 1.12,
          duration: 760,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(gpsPulse, {
          toValue: 1,
          duration: 760,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [gpsPulse]);

  useEffect(() => {
    marqueeAnim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(marqueeAnim, {
        toValue: 1,
        duration: 18000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [marqueeAnim, dashboardTickerText]);

  useEffect(() => {
    // Au démarrage: "recherche de connexion" courte, puis état stable.
    onlineBlink.setValue(1);
    const startupBlink = Animated.sequence([
      Animated.timing(onlineBlink, {
        toValue: 0.28,
        duration: 300,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(onlineBlink, {
        toValue: 1,
        duration: 300,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(onlineBlink, {
        toValue: 0.28,
        duration: 300,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(onlineBlink, {
        toValue: 1,
        duration: 300,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(onlineBlink, {
        toValue: 0.28,
        duration: 300,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(onlineBlink, {
        toValue: 1,
        duration: 300,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(onlineBlink, {
        toValue: 0.28,
        duration: 300,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(onlineBlink, {
        toValue: 1,
        duration: 300,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    startupBlink.start();
    return () => startupBlink.stop();
  }, [onlineBlink]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(brandRollAnim, {
        toValue: 1,
        duration: 11000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [brandRollAnim]);

  const marqueeTranslateX = marqueeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -520],
  });
  const brandRollTranslateY = brandRollAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -26],
  });
  const introTranslateY = screenIntro.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });

  const notificationItems = useMemo(() => {
    const items: string[] = [];
    if (ctBanner.daysLeft == null) {
      items.push('Date du prochain CT non renseignée.');
    } else if (ctBanner.daysLeft < 0) {
      items.push(`CT expiré depuis ${Math.abs(ctBanner.daysLeft)} jour(s).`);
    } else if (ctBanner.daysLeft < 30) {
      items.push(`CT à faire dans ${ctBanner.daysLeft} jour(s).`);
    }
    if (entretienKpi.filledModules < 3) {
      items.push(`Entretien incomplet: ${entretienKpi.filledModules}/3 modules actifs.`);
    }
    if (!docPreview.permis) items.push('Permis non scanné.');
    if (!docPreview.cg) items.push('Carte grise non scannée.');
    return items;
  }, [ctBanner.daysLeft, entretienKpi.filledModules, docPreview.permis, docPreview.cg]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <LinearGradient
        pointerEvents="none"
        colors={
          isLight
            ? ['rgba(255,255,255,0)', 'rgba(186,230,253,0.24)', 'rgba(226,232,240,0.55)']
            : ['transparent', 'rgba(8, 14, 22, 0.35)', 'rgba(4, 8, 14, 0.72)']
        }
        locations={[0, 0.55, 1]}
        style={styles.bottomAtmosphere}
      />
      <Animated.View
        style={[
          styles.content,
          compact ? styles.contentCompact : null,
          {
            paddingTop: Math.max(insets.top + 8, compact ? 24 : 30),
            opacity: screenIntro,
            transform: [{ translateY: introTranslateY }],
          },
        ]}
      >
        {/* Header Section */}
        <View style={[styles.header, compact ? styles.headerCompact : null]}>
          <View style={styles.headerBrandRow}>
            <GarageConnectLogo size="sm" />
            <View style={styles.brandRollViewport}>
              <Animated.View style={[styles.brandRollTrack, { transform: [{ translateY: brandRollTranslateY }] }]}>
                <View style={styles.headerBrandTextCol}>
              <Text style={[styles.headerBrandTop, isLight ? { color: '#475569' } : null]}>GARAGE</Text>
              <Text style={[styles.headerBrandBottom, isLight ? { color: '#0f172a' } : null]}>CONNECT</Text>
                </View>
                <View style={styles.headerBrandTextCol}>
              <Text style={[styles.headerBrandTop, isLight ? { color: '#475569' } : null]}>GARAGE</Text>
              <Text style={[styles.headerBrandBottom, isLight ? { color: '#0f172a' } : null]}>CONNECT</Text>
                </View>
              </Animated.View>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Animated.View
              style={[
                styles.onlinePill,
                isLight ? { backgroundColor: 'rgba(220,252,231,0.85)', borderColor: 'rgba(22,163,74,0.5)' } : null,
                { opacity: onlineBlink },
              ]}
            >
              <View style={styles.onlineDot} />
              <Text style={[styles.onlineText, isLight ? { color: '#166534' } : null]}>EN LIGNE</Text>
            </Animated.View>
            <Pressable
              style={({ pressed }) => [
                styles.notificationBtn,
                isLight ? styles.notificationBtnLight : null,
                pressed && styles.notificationBtnPressed,
              ]}
              onPress={() => {
                void Haptics.selectionAsync();
                if (notificationItems.length === 0) {
                  Alert.alert('Notifications', "Vous n'avez pas de nouvelles notifications.");
                  return;
                }
                Alert.alert(
                  `Notifications (${notificationItems.length})`,
                  notificationItems.map((item, idx) => `${idx + 1}. ${item}`).join('\n')
                );
              }}
            >
              <MaterialCommunityIcons name="bell-outline" size={18} color="#ffffff" />
              {notificationItems.length > 0 ? (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>
                    {notificationItems.length > 99 ? '99+' : String(notificationItems.length)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>

        {/* Vehicle Card Section */}
        <LinearGradient
          colors={isLight ? ['#ffffff', '#eef3fb'] : ['#1A202C', '#111111']}
          style={[styles.vehicleCard, isLight ? styles.vehicleCardLight : null, compact ? styles.vehicleCardCompact : null]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <LinearGradient
            colors={['rgba(95,244,255,0.0)', 'rgba(95,244,255,0.55)', 'rgba(95,244,255,0.0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.vehicleTopBeam}
          />
          <View style={styles.vehicleCardTextContainer}>
            <Text style={[styles.vehicleCardName, isLight ? { color: '#0f172a' } : null]}>
              {vehicleData.alias || vehicleData.modele || '-'}
            </Text>
            <Text style={[styles.vehicleCardModel, isLight ? { color: '#334155' } : null]}>{vehicleData.modele || '-'}</Text>
            <View style={[styles.immatBadge, isLight ? styles.immatBadgeLight : null]}>
              <View style={[styles.plateEuroBand, isLight ? styles.plateEuroBandLight : null]}>
                <Text style={styles.plateEuroStars}>★</Text>
                <Text style={styles.plateEuroF}>F</Text>
              </View>
              <Text style={[styles.immatBadgeValue, isLight ? styles.immatBadgeValueLight : null]} numberOfLines={1}>
                {immatDisplay}
              </Text>
              <View style={[styles.plateDeptBand, isLight ? styles.plateDeptBandLight : null]}>
                {depCode === '13' ? (
                  <Image source={{ uri: MARSEILLE_ESCUTCHEON_URI }} style={styles.plateDeptEmblem} resizeMode="contain" />
                ) : (
                  <Text style={[styles.plateDeptCode, isLight ? styles.plateDeptCodeLight : null]}>🇫🇷</Text>
                )}
              </View>
            </View>
            <View style={styles.docQuickRow}>
              <Pressable
                style={({ pressed }) => [styles.docQuickBtn, isLight ? styles.docQuickBtnLight : null, pressed ? styles.docQuickBtnPressed : null]}
                onPress={() => {
                  if (!docPreview.permis) return;
                  void Haptics.selectionAsync();
                  setDocModal('permis');
                }}
              >
                {({ pressed }) => (
                  <>
                    {pressed ? <View pointerEvents="none" style={styles.docQuickFlash} /> : null}
                    <MaterialCommunityIcons
                      name="card-account-details-outline"
                      size={16}
                      color={docPreview.permis ? '#7dd3fc' : '#64748b'}
                    />
                    <Text
                      style={[
                        styles.docQuickText,
                        isLight ? styles.docQuickTextLight : null,
                        !docPreview.permis && styles.docQuickTextDisabled,
                      ]}
                    >
                      Permis
                    </Text>
                  </>
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.docQuickBtn, isLight ? styles.docQuickBtnLight : null, pressed ? styles.docQuickBtnPressed : null]}
                onPress={() => {
                  if (!docPreview.cg) return;
                  void Haptics.selectionAsync();
                  setDocModal('cg');
                }}
              >
                {({ pressed }) => (
                  <>
                    {pressed ? <View pointerEvents="none" style={styles.docQuickFlash} /> : null}
                    <MaterialCommunityIcons
                      name="file-document-outline"
                      size={16}
                      color={docPreview.cg ? '#f7e8b8' : '#64748b'}
                    />
                    <Text
                      style={[
                        styles.docQuickText,
                        isLight ? styles.docQuickTextLight : null,
                        !docPreview.cg && styles.docQuickTextDisabled,
                      ]}
                    >
                      Carte grise
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
            <Text style={[styles.vehicleCardKm, isLight ? { color: '#475569' } : null]}>{formatKmFr(kmStats.total)} KM</Text>
          </View>
          <LinearGradient
            colors={['#f7e8b8', '#9a7428', '#d4af37', '#f7e8b8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.vehiclePhotoFrame}
          >
            <View style={styles.silhouettePlaceholder}>
              {vehicleData.photoUri ? (
                <>
                  <LinearGradient
                    colors={['rgba(255,255,255,0.16)', 'rgba(8,12,22,0.9)', 'rgba(6,10,18,0.98)']}
                    start={{ x: 0.1, y: 0 }}
                    end={{ x: 0.95, y: 1 }}
                    style={styles.vehicleStudioBg}
                  />
                  <Svg style={styles.radialStudio}>
                    <Defs>
                      <RadialGradient id="studioGradient" cx="50%" cy="42%" rx="70%" ry="78%">
                        <Stop offset="0%" stopColor={vehicleData.photoBgCenter || '#334155'} stopOpacity="1" />
                        <Stop offset="45%" stopColor={vehicleData.photoBgCenter || '#334155'} stopOpacity="0.62" />
                        <Stop offset="100%" stopColor={vehicleData.photoBgEdge || '#0B1120'} stopOpacity="1" />
                      </RadialGradient>
                    </Defs>
                    <Rect x="0" y="0" width="100%" height="100%" fill="url(#studioGradient)" />
                  </Svg>
                  <View style={styles.dropShadow} />
                  <LinearGradient
                    colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0)']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 0.45 }}
                    style={styles.vehicleSpecular}
                  />
                  <View style={styles.vehicleVignette} />
                  <View style={styles.vehicleImageHighlight} />
                  <Image source={{ uri: vehicleData.photoUri }} style={styles.vehicleImage} resizeMode="contain" />
                </>
              ) : (
                <Text style={styles.silhouetteText}>Photo</Text>
              )}
            </View>
          </LinearGradient>
        </LinearGradient>

        <View style={styles.tickerWrap}>
          <LinearGradient
            colors={tickerTone.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.tickerCard,
              isLight ? styles.tickerCardLight : null,
              { borderColor: tickerTone.border },
            ]}
          >
            <View style={styles.tickerHeaderRow}>
              <Animated.View
                style={[
                  styles.tickerDot,
                  { backgroundColor: tickerTone.dot, transform: [{ scale: alertPulse }] },
                ]}
              />
              <MaterialCommunityIcons name="star-four-points" size={13} color="#fbbf24" style={styles.tickerSparkIcon} />
              <Text style={[styles.tickerHeader, { color: isLight ? '#0f172a' : tickerTone.text }]}>{tickerTone.label}</Text>
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push('/premium');
                }}
                style={({ pressed }) => [styles.tickerCtaWrap, pressed ? styles.tickerCtaPressed : null]}
              >
                <Animated.View style={[styles.tickerCtaPill, { transform: [{ scale: premiumPulse }] }]}>
                  <Text style={[styles.tickerCtaText, isLight ? styles.tickerCtaTextLight : null]}>S'ABONNER</Text>
                </Animated.View>
              </Pressable>
            </View>
            <View style={styles.tickerViewport}>
              <Animated.View style={[styles.tickerTrack, { transform: [{ translateX: marqueeTranslateX }] }]}>
                <Text style={[styles.tickerText, { color: isLight ? '#0f172a' : tickerTone.text }]}>{dashboardTickerText}</Text>
                <Text style={[styles.tickerText, { color: isLight ? '#0f172a' : tickerTone.text }]}>   {dashboardTickerText}</Text>
              </Animated.View>
            </View>
          </LinearGradient>
        </View>

        {/* Categories Grid */}
        <View style={[styles.gridContainer, compact ? styles.gridContainerCompact : null]}>
          {categories.map((category, index) => {
            const Icon = category.icon;
            const borderColor = isLight
              ? category.id === 6
                ? '#38bdf8'
                : index % 2 === 0
                  ? '#caa54a'
                  : '#60a5fa'
              : category.id === 6
                ? '#00F2FF'
                : index % 2 === 0
                  ? '#D4AF37'
                  : '#00F2FF';
            return (
              <Pressable
                key={category.id}
                style={({ pressed }) => [
                  styles.gridItem,
                  compact ? styles.gridItemCompact : null,
                  isLight ? styles.gridItemLight : null,
                  { borderColor },
                  pressed ? styles.cardPressedStrong : null,
                ]}
                onPressIn={() => {
                  void Haptics.selectionAsync();
                }}
                onPress={() => handleCategoryPress(category.id)}
              >
                {({ pressed }) => (
                  <>
                    {pressed ? <View pointerEvents="none" style={styles.gridPressFlash} /> : null}
                    {category.id === 6 ? (
                      <>
                        <View style={[styles.iconContainer, isLight ? styles.iconContainerLight : null, { borderColor }]}>
                          <Icon size={24} color={borderColor} />
                        </View>
                        <Text style={[styles.categoryTitle, isLight ? styles.categoryTitleLight : null]}>{category.title}</Text>
                        <Text style={[styles.categoryDescription, isLight ? styles.categoryDescriptionLight : null]}>
                          {category.description}
                        </Text>
                        <View
                          style={[
                            styles.kmStatusBadge,
                            isLight ? styles.kmStatusBadgeLight : null,
                            kmCtx?.isDriving
                              ? styles.kmStatusDriving
                              : kmCtx?.isTracking
                                ? styles.kmStatusTracking
                                : styles.kmStatusStopped,
                            isLight
                              ? kmCtx?.isDriving
                                ? styles.kmStatusDrivingLight
                                : kmCtx?.isTracking
                                  ? styles.kmStatusTrackingLight
                                  : styles.kmStatusStoppedLight
                              : null,
                          ]}
                        >
                          <Text style={[styles.kmStatusText, isLight ? styles.kmStatusTextLight : null]}>
                            {kmCtx?.isDriving ? 'EN VOITURE' : kmCtx?.isTracking ? 'GPS ACTIF' : 'A L\'ARRET'}
                          </Text>
                        </View>
                      </>
                    ) : category.id === 5 ? (
                      <>
                        <Animated.View
                          style={[
                            styles.iconContainer,
                            isLight ? styles.iconContainerLight : null,
                            { borderColor, transform: [{ scale: gpsPulse }] },
                          ]}
                        >
                          <Icon size={24} color={borderColor} />
                        </Animated.View>
                        <Text style={[styles.categoryTitle, isLight ? styles.categoryTitleLight : null]}>{category.title}</Text>
                        <Text style={[styles.categoryDescription, isLight ? styles.categoryDescriptionLight : null]}>
                          {category.description}
                        </Text>
                      </>
                    ) : category.id === 1 ? (
                      <>
                        <View style={[styles.iconContainer, isLight ? styles.iconContainerLight : null, { borderColor }]}>
                          <Icon size={24} color={borderColor} />
                        </View>
                        <Text style={[styles.categoryTitle, isLight ? styles.categoryTitleLight : null]}>{category.title}</Text>
                        <Text style={[styles.categoryDescription, isLight ? styles.categoryDescriptionLight : null]}>
                          {category.description}
                        </Text>
                      </>
                    ) : (
                      <>
                        <View style={[styles.iconContainer, isLight ? styles.iconContainerLight : null, { borderColor }]}>
                          <Icon size={24} color={borderColor} />
                        </View>
                        <Text style={[styles.categoryTitle, isLight ? styles.categoryTitleLight : null]}>{category.title}</Text>
                        <Text style={[styles.categoryDescription, isLight ? styles.categoryDescriptionLight : null]}>
                          {category.description}
                        </Text>
                      </>
                    )}
                  </>
                )}
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
      <Modal visible={docModal != null} transparent animationType="fade" onRequestClose={() => setDocModal(null)}>
        <View style={styles.docModalBg}>
          <TouchableOpacity style={styles.docModalClose} onPress={() => setDocModal(null)}>
            <MaterialCommunityIcons name="close-circle" size={42} color="#ffffff" />
          </TouchableOpacity>
          <Image
            source={{ uri: docModal === 'permis' ? docPreview.permis : docPreview.cg }}
            style={styles.docModalImage}
            resizeMode="contain"
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_THEME.bg,
  },
  bottomAtmosphere: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
    zIndex: 0,
  },
  content: {
    zIndex: 1,
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 30,
    paddingBottom: 12,
  },
  contentCompact: {
    paddingTop: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerCompact: {
    marginBottom: 6,
  },
  headerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandRollViewport: {
    height: 30,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  brandRollTrack: {
    justifyContent: 'flex-start',
  },
  headerBrandTextCol: {
    justifyContent: 'center',
  },
  headerBrandTop: {
    color: '#d7dee8',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2.6,
    textTransform: 'uppercase',
  },
  headerBrandBottom: {
    color: UI_THEME.textPrimary,
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: 2.1,
    marginTop: -1,
    textTransform: 'uppercase',
  },
  notificationBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    marginTop: 6,
  },
  notificationBtnLight: {
    backgroundColor: '#dc2626',
    borderColor: 'rgba(255,255,255,0.45)',
    shadowColor: '#f87171',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  notificationBadge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    paddingHorizontal: 4,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadgeText: {
    color: '#b91c1c',
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 11,
  },
  notificationBtnPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.92,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  onlinePill: {
    marginTop: 6,
    height: 24,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.58)',
    backgroundColor: 'rgba(8,30,18,0.6)',
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 99,
    marginRight: 6,
    backgroundColor: '#22c55e',
  },
  onlineText: {
    color: '#86efac',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  vehicleCard: {
    flexDirection: 'row',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 11,
    borderColor: UI_THEME.gold,
    borderWidth: 1,
    height: 164,
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  vehicleCardLight: {
    borderColor: 'rgba(179,135,40,0.35)',
    shadowColor: '#93c5fd',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  vehicleTopBeam: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    zIndex: 5,
  },
  vehicleCardCompact: {
    height: 154,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  vehicleCardTextContainer: {
    flex: 1,
  },
  vehicleCardTitle: {
    color: '#888888',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  vehicleCardName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  vehicleCardModel: {
    color: '#dbe4ee',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  docQuickRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  docQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.45)',
    backgroundColor: 'rgba(4,8,14,0.55)',
    position: 'relative',
    overflow: 'hidden',
  },
  docQuickBtnLight: {
    borderColor: 'rgba(2,132,199,0.35)',
    backgroundColor: 'rgba(240,249,255,0.95)',
  },
  docQuickBtnPressed: {
    transform: [{ scale: 0.96 }],
  },
  docQuickFlash: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  docQuickText: {
    color: '#dbeafe',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  docQuickTextLight: {
    color: '#0f172a',
  },
  docQuickTextDisabled: {
    color: '#64748b',
  },
  immatBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
    height: 26,
  },
  immatBadgeLight: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
  },
  plateEuroBand: {
    width: 16,
    height: '100%',
    backgroundColor: '#1d4ed8',
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.55)',
  },
  plateEuroBandLight: {
    backgroundColor: '#2563eb',
  },
  plateEuroStars: {
    color: '#fbbf24',
    fontSize: 7,
    lineHeight: 8,
    marginTop: 1,
  },
  plateEuroF: {
    color: '#ffffff',
    fontSize: 7,
    fontWeight: '800',
    lineHeight: 8,
    marginTop: -1,
  },
  plateDeptBand: {
    width: 20,
    height: '100%',
    backgroundColor: '#1d4ed8',
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.55)',
  },
  plateDeptBandLight: {
    backgroundColor: '#2563eb',
  },
  plateDeptCode: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  plateDeptCodeLight: {
    color: '#ffffff',
  },
  plateDeptEmblem: {
    width: 14,
    height: 14,
  },
  immatBadgeLabel: {
    color: '#9fb0c3',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  immatBadgeLabelLight: {
    color: '#64748b',
  },
  immatBadgeValue: {
    color: '#111827',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    paddingHorizontal: 7,
    minWidth: 86,
    textAlign: 'center',
  },
  immatBadgeValueLight: {
    color: '#0f172a',
  },
  vehicleCardKm: {
    color: '#b8c9d8',
    fontSize: 11,
    marginTop: 8,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  vehiclePhotoFrame: {
    width: 156,
    height: 90,
    borderRadius: 12,
    padding: 0,
    overflow: 'visible',
    shadowColor: '#d4af37',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.26,
    shadowRadius: 8,
    elevation: 7,
  },
  silhouettePlaceholder: {
    flex: 1,
    backgroundColor: '#070b12',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  vehicleStudioBg: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  vehicleSpecular: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '42%',
    zIndex: 2,
  },
  radialStudio: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  dropShadow: {
    position: 'absolute',
    bottom: 6,
    width: '68%',
    height: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.56)',
    zIndex: 2,
  },
  vehicleReflection: {
    position: 'absolute',
    bottom: -12,
    width: '100%',
    height: '44%',
    opacity: 0.14,
    transform: [{ scaleY: -1 }],
    zIndex: 2,
  },
  silhouetteText: { color: '#FFFFFF', fontSize: 10 },
  vehicleImage: {
    position: 'absolute',
    width: '118%',
    height: '118%',
    top: -12,
    right: -16,
    transform: [{ scale: 1.08 }],
    zIndex: 3,
  },
  vehicleVignette: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(4,8,16,0.16)',
    zIndex: 1,
  },
  vehicleImageHighlight: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.14)',
    zIndex: 2,
  },
  docModalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  docModalClose: {
    position: 'absolute',
    top: 52,
    right: 18,
    zIndex: 2,
  },
  docModalImage: {
    width: '94%',
    height: '86%',
  },
  tickerWrap: {
    marginBottom: 10,
  },
  tickerCard: {
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: 'rgba(0,242,255,0.34)',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 11,
    shadowColor: '#00F2FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  tickerCardLight: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: 'rgba(2,132,199,0.25)',
    shadowColor: '#60a5fa',
    shadowOpacity: 0.2,
  },
  tickerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  tickerSparkIcon: {
    marginRight: 5,
  },
  tickerDot: {
    width: 8,
    height: 8,
    borderRadius: 4.5,
    backgroundColor: '#22c55e',
    marginRight: 7,
  },
  tickerHeader: {
    color: '#dbeafe',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.8,
    textShadowColor: 'rgba(251,191,36,0.32)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  tickerCtaPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(0,242,255,0.58)',
    backgroundColor: 'rgba(0,242,255,0.16)',
  },
  tickerCtaText: {
    color: '#b6f6ff',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.45,
  },
  tickerCtaTextLight: {
    color: '#075985',
  },
  tickerCtaPressed: {
    transform: [{ scale: 0.96 }],
  },
  tickerCtaWrap: {
    marginLeft: 'auto',
  },
  tickerViewport: {
    width: '100%',
    overflow: 'hidden',
  },
  tickerTrack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tickerText: {
    color: '#eef7ff',
    fontSize: 11.8,
    fontWeight: '800',
    letterSpacing: 0.25,
  },
  gridContainer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
    columnGap: 0,
  },
  gridContainerCompact: {
    rowGap: 5,
  },
  gridItem: {
    width: '48.5%',
    backgroundColor: '#111111',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    height: '30.5%',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  gridItemLight: {
    backgroundColor: '#ffffff',
    borderColor: 'rgba(148,163,184,0.35)',
    shadowColor: '#93c5fd',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  gridItemCompact: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 16,
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
  },
  cardPressedStrong: {
    transform: [{ scale: 0.965 }],
    shadowColor: '#ffffff',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  gridPressFlash: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9,
    borderWidth: 1,
  },
  iconContainerLight: {
    backgroundColor: '#f8fbff',
  },
  categoryTitle: {
    color: UI_THEME.textPrimary,
    fontSize: 10.5,
    fontWeight: 'bold',
    textAlign: 'left',
    marginBottom: 4,
  },
  categoryTitleLight: {
    color: '#0f172a',
  },
  categoryDescription: {
    color: '#AAAAAA',
    fontSize: 8.5,
    textAlign: 'left',
  },
  categoryDescriptionLight: {
    color: '#64748b',
  },
  ctBanner: {
    marginTop: 8,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    width: '100%',
  },
  ctBannerText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  kmStatusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 8,
    borderWidth: 1,
  },
  kmStatusBadgeLight: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  kmStatusDriving: {
    backgroundColor: 'rgba(46,204,113,0.15)',
    borderColor: '#2ecc71',
  },
  kmStatusDrivingLight: {
    backgroundColor: 'rgba(220,252,231,0.95)',
    borderColor: 'rgba(22,163,74,0.45)',
  },
  kmStatusTracking: {
    backgroundColor: 'rgba(0,242,255,0.14)',
    borderColor: '#00F2FF',
  },
  kmStatusTrackingLight: {
    backgroundColor: 'rgba(224,242,254,0.95)',
    borderColor: 'rgba(2,132,199,0.45)',
  },
  kmStatusStopped: {
    backgroundColor: 'rgba(142,142,142,0.14)',
    borderColor: '#8e8e8e',
  },
  kmStatusStoppedLight: {
    backgroundColor: 'rgba(241,245,249,0.95)',
    borderColor: 'rgba(100,116,139,0.38)',
  },
  kmStatusText: {
    color: '#e8f7ff',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  kmStatusTextLight: {
    color: '#0f172a',
  },
  maintenanceStatusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 8,
    borderWidth: 1,
  },
  maintenanceStatusOk: {
    backgroundColor: 'rgba(46,204,113,0.15)',
    borderColor: '#2ecc71',
  },
  maintenanceStatusPlan: {
    backgroundColor: 'rgba(230,126,34,0.16)',
    borderColor: '#e67e22',
  },
  maintenanceStatusInit: {
    backgroundColor: 'rgba(142,142,142,0.14)',
    borderColor: '#8e8e8e',
  },
  maintenanceStatusText: {
    color: '#e8f7ff',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  maintenanceMeta: {
    color: '#9fb0c3',
    fontSize: 8.5,
    marginTop: 6,
  },
});