import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BarChart3, ClipboardList, FileText, PenTool, Settings } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';

import { GarageConnectLogo } from '../../components/GarageConnectLogo';
import { UI_THEME } from '../../constants/uiTheme';
import { useKilometrage } from '../../context/KilometrageContext';
import { useVehicle } from '../../context/VehicleContext';
import { userGetItem } from '../../services/userStorage';

const categories = [
  { id: 1, title: 'CARNET D\'ENTRETIEN', description: 'Gérez vos révisions et interventions.', icon: ClipboardList, color: '#3182CE' },
  { id: 2, title: 'DOCUMENTS DU VÉHICULE', description: 'Cartes grises, assurances...', icon: FileText, color: '#48BB78' },
  { id: 3, title: 'DIAGNOSTICS & ALERTES', description: 'Consultez les codes d\'erreur OBD-II.', icon: PenTool, color: '#ED8936' },
  { id: 4, title: 'FRAIS & DÉPENSES', description: 'Suivez votre budget auto.', icon: BarChart3, color: '#805AD5' },
  { id: 5, title: 'CT', description: 'Contrôle technique et échéance', icon: FileText, color: '#F56565' },
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

function ctUrgencyColor(daysLeft: number): string {
  if (daysLeft < 0) return '#C53030';
  if (daysLeft < 30) return '#C53030';
  if (daysLeft < 180) return '#e67e22';
  return '#2ecc71';
}

export default function HomeScreen() {
  const router = useRouter();
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
  const marqueeAnim = useRef(new Animated.Value(0)).current;
  const alertPulse = useRef(new Animated.Value(1)).current;

  const kmStats = useMemo(() => {
    const total = parseOdometerKm(kmCtx?.km);
    const jour = readNumericStat(kmCtx, 'kmJour');
    const semaine = readNumericStat(kmCtx, 'kmHebdo');
    const mois = readNumericStat(kmCtx, 'kmMois');
    const an = readNumericStat(kmCtx, 'kmAn');
    return { total, jour, semaine, mois, an };
  }, [kmCtx]);

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
        router.push('/ct');
        break;
      case 6:
        router.push('/km');
        break;
      default:
        break;
    }
  };

  const dashboardTickerText = useMemo(() => {
    const messages: string[] = [];
    if (ctBanner.daysLeft == null) {
      messages.push('CT: DATE NON DISPONIBLE, À RENSEIGNER');
    } else if (ctBanner.daysLeft < 0) {
      messages.push(`URGENT: CT EXPIRÉ DEPUIS ${Math.abs(ctBanner.daysLeft)} JOURS`);
    } else if (ctBanner.daysLeft < 30) {
      messages.push(`PRIORITÉ: CT À FAIRE DANS ${ctBanner.daysLeft} JOURS`);
    } else {
      messages.push(`CT OK: ÉCHÉANCE DANS ${ctBanner.daysLeft} JOURS`);
    }

    if (entretienKpi.filledModules === 0) {
      messages.push('ENTRETIEN: AUCUN MODULE INITIALISÉ');
    } else if (entretienKpi.filledModules < 3) {
      messages.push(`ENTRETIEN: ${entretienKpi.filledModules}/3 MODULES ACTIFS`);
    } else {
      messages.push('ENTRETIEN: TOUS LES MODULES SONT À JOUR');
    }

    messages.push(`KILOMÉTRAGE TOTAL: ${formatKmFr(kmStats.total)} KM`);
    return `INFO IMPORTANTE • ${messages.join(' • ')} •`;
  }, [ctBanner.daysLeft, entretienKpi.filledModules, kmStats.total]);

  const tickerTone = useMemo(() => {
    if (ctBanner.daysLeft == null) {
      return {
        dot: '#8e8e8e',
        border: 'rgba(148,163,184,0.45)',
        text: '#dbeafe',
        label: 'INFO',
        gradient: ['rgba(148,163,184,0.16)', 'rgba(7,10,16,0.85)', 'rgba(148,163,184,0.14)'] as const,
      };
    }
    if (ctBanner.daysLeft < 30) {
      return {
        priority: 'high' as const,
        dot: '#ef4444',
        border: 'rgba(239,68,68,0.72)',
        text: '#ffe4e6',
        label: 'ALERTE PRIORITAIRE',
        gradient: ['rgba(239,68,68,0.34)', 'rgba(20,8,10,0.94)', 'rgba(239,68,68,0.26)'] as const,
      };
    }
    if (ctBanner.daysLeft < 90) {
      return {
        priority: 'medium' as const,
        dot: '#f59e0b',
        border: 'rgba(245,158,11,0.7)',
        text: '#fff3c4',
        label: 'VIGILANCE',
        gradient: ['rgba(245,158,11,0.3)', 'rgba(18,12,7,0.92)', 'rgba(245,158,11,0.22)'] as const,
      };
    }
    return {
      priority: 'low' as const,
      dot: '#22c55e',
      border: 'rgba(34,197,94,0.64)',
      text: '#ecfdf5',
      label: 'INFO LIVE',
      gradient: ['rgba(0,242,255,0.24)', 'rgba(7,10,16,0.92)', 'rgba(212,175,55,0.2)'] as const,
    };
  }, [ctBanner.daysLeft]);

  useEffect(() => {
    if (tickerTone.priority !== 'high') {
      alertPulse.setValue(1);
      return;
    }
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(alertPulse, {
          toValue: 1.22,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(alertPulse, {
          toValue: 1,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [alertPulse, tickerTone.priority]);

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

  const marqueeTranslateX = marqueeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -520],
  });

  return (
    <View style={styles.container}>
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', 'rgba(8, 14, 22, 0.35)', 'rgba(4, 8, 14, 0.72)']}
        locations={[0, 0.55, 1]}
        style={styles.bottomAtmosphere}
      />
      <View
        style={[
          styles.content,
          compact ? styles.contentCompact : null,
          { paddingTop: Math.max(insets.top + 8, compact ? 24 : 30) },
        ]}
      >
        {/* Header Section */}
        <View style={[styles.header, compact ? styles.headerCompact : null]}>
          <View style={styles.headerBrandRow}>
            <GarageConnectLogo size="sm" />
            <View style={styles.headerBrandTextCol}>
              <Text style={styles.headerBrandTop}>GARAGE</Text>
              <Text style={styles.headerBrandBottom}>CONNECT</Text>
            </View>
          </View>
          <View style={styles.userIconPlaceholder} />
        </View>

        {/* Vehicle Card Section */}
        <LinearGradient
          colors={['#1A202C', '#111111']}
          style={[styles.vehicleCard, compact ? styles.vehicleCardCompact : null]}
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
            <Text style={styles.vehicleCardName}>{vehicleData.alias || vehicleData.modele || '-'}</Text>
            <Text style={styles.vehicleCardModel}>MODÈLE {vehicleData.modele || '-'}</Text>
            <View style={styles.immatBadge}>
              <Text style={styles.immatBadgeLabel}>IMMAT</Text>
              <Text style={styles.immatBadgeValue}>{vehicleData.immat || '-'}</Text>
            </View>
            <View style={styles.docQuickRow}>
              <Pressable
                style={({ pressed }) => [styles.docQuickBtn, pressed ? styles.cardPressed : null]}
                onPress={() => {
                  if (!docPreview.permis) return;
                  setDocModal('permis');
                }}
              >
                <MaterialCommunityIcons
                  name="card-account-details-outline"
                  size={16}
                  color={docPreview.permis ? '#7dd3fc' : '#64748b'}
                />
                <Text style={[styles.docQuickText, !docPreview.permis && styles.docQuickTextDisabled]}>Permis</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.docQuickBtn, pressed ? styles.cardPressed : null]}
                onPress={() => {
                  if (!docPreview.cg) return;
                  setDocModal('cg');
                }}
              >
                <MaterialCommunityIcons
                  name="file-document-outline"
                  size={16}
                  color={docPreview.cg ? '#f7e8b8' : '#64748b'}
                />
                <Text style={[styles.docQuickText, !docPreview.cg && styles.docQuickTextDisabled]}>Carte grise</Text>
              </Pressable>
            </View>
            <Text style={styles.vehicleCardKm}>{formatKmFr(kmStats.total)} KM</Text>
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
                  <Image source={{ uri: vehicleData.photoUri }} style={styles.vehicleReflection} resizeMode="contain" />
                  <LinearGradient
                    colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0)']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 0.45 }}
                    style={styles.vehicleSpecular}
                  />
                  <Image source={{ uri: vehicleData.photoUri }} style={styles.vehicleImageGlow} blurRadius={16} />
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
            style={[styles.tickerCard, { borderColor: tickerTone.border }]}
          >
            <View style={styles.tickerHeaderRow}>
              <Animated.View
                style={[
                  styles.tickerDot,
                  { backgroundColor: tickerTone.dot, transform: [{ scale: alertPulse }] },
                ]}
              />
              <Text style={[styles.tickerHeader, { color: tickerTone.text }]}>{tickerTone.label}</Text>
            </View>
            <View style={styles.tickerViewport}>
              <Animated.View style={[styles.tickerTrack, { transform: [{ translateX: marqueeTranslateX }] }]}>
                <Text style={[styles.tickerText, { color: tickerTone.text }]}>{dashboardTickerText}</Text>
                <Text style={[styles.tickerText, { color: tickerTone.text }]}>   {dashboardTickerText}</Text>
              </Animated.View>
            </View>
          </LinearGradient>
        </View>

        {/* Categories Grid */}
        <View style={[styles.gridContainer, compact ? styles.gridContainerCompact : null]}>
          {categories.map((category, index) => {
            const Icon = category.icon;
            const borderColor = category.id === 6 ? '#00F2FF' : index % 2 === 0 ? '#D4AF37' : '#00F2FF';
            return (
              <Pressable
                key={category.id}
                style={({ pressed }) => [
                  styles.gridItem,
                  compact ? styles.gridItemCompact : null,
                  { borderColor },
                  pressed ? styles.cardPressed : null,
                ]}
                onPress={() => handleCategoryPress(category.id)}
              >
                {category.id === 6 ? (
                  <>
                    <View style={[styles.iconContainer, { borderColor }]}>
                      <Icon size={24} color={borderColor} />
                    </View>
                    <Text style={styles.categoryTitle}>{category.title}</Text>
                    <Text style={styles.categoryDescription}>{category.description}</Text>
                    <View
                      style={[
                        styles.kmStatusBadge,
                        kmCtx?.isDriving
                          ? styles.kmStatusDriving
                          : kmCtx?.isTracking
                            ? styles.kmStatusTracking
                            : styles.kmStatusStopped,
                      ]}
                    >
                      <Text style={styles.kmStatusText}>
                        {kmCtx?.isDriving ? 'EN VOITURE' : kmCtx?.isTracking ? 'GPS ACTIF' : 'A L\'ARRET'}
                      </Text>
                    </View>
                  </>
                ) : category.id === 5 ? (
                  <>
                    <View style={[styles.iconContainer, { borderColor }]}>
                      <Icon size={24} color={borderColor} />
                    </View>
                    <Text style={styles.categoryTitle}>{category.title}</Text>
                    <Text style={styles.categoryDescription}>{category.description}</Text>
                  </>
                ) : category.id === 1 ? (
                  <>
                    <View style={[styles.iconContainer, { borderColor }]}>
                      <Icon size={24} color={borderColor} />
                    </View>
                    <Text style={styles.categoryTitle}>{category.title}</Text>
                    <Text style={styles.categoryDescription}>{category.description}</Text>
                  </>
                ) : (
                  <>
                    <View style={[styles.iconContainer, { borderColor }]}>
                      <Icon size={24} color={borderColor} />
                    </View>
                    <Text style={styles.categoryTitle}>{category.title}</Text>
                    <Text style={styles.categoryDescription}>{category.description}</Text>
                  </>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
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
  userIconPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: UI_THEME.cyan,
    marginTop: 6,
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
  },
  docQuickText: {
    color: '#dbeafe',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  docQuickTextDisabled: {
    color: '#64748b',
  },
  immatBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(4,8,14,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.55)',
  },
  immatBadgeLabel: {
    color: '#9fb0c3',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  immatBadgeValue: {
    color: '#f7e8b8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
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
    padding: 2,
  },
  silhouettePlaceholder: {
    flex: 1,
    backgroundColor: '#070b12',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
    bottom: 10,
    width: '64%',
    height: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
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
    width: '100%',
    height: '100%',
    zIndex: 3,
  },
  vehicleImageGlow: {
    position: 'absolute',
    width: '108%',
    height: '108%',
    opacity: 0.4,
    zIndex: 1,
  },
  vehicleVignette: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(4,8,16,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
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
  tickerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
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
  },
  gridItemCompact: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 16,
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
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
  categoryTitle: {
    color: UI_THEME.textPrimary,
    fontSize: 10.5,
    fontWeight: 'bold',
    textAlign: 'left',
    marginBottom: 4,
  },
  categoryDescription: {
    color: '#AAAAAA',
    fontSize: 8.5,
    textAlign: 'left',
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
  kmStatusDriving: {
    backgroundColor: 'rgba(46,204,113,0.15)',
    borderColor: '#2ecc71',
  },
  kmStatusTracking: {
    backgroundColor: 'rgba(0,242,255,0.14)',
    borderColor: '#00F2FF',
  },
  kmStatusStopped: {
    backgroundColor: 'rgba(142,142,142,0.14)',
    borderColor: '#8e8e8e',
  },
  kmStatusText: {
    color: '#e8f7ff',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.3,
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