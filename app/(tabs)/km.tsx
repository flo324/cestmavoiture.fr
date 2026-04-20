import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useKilometrage } from '../../context/KilometrageContext';
import { STORAGE_KM_MEMOS } from '../../constants/scanConstants';
import { OttoDossierFrame } from '../../components/OttoDossierFrame';
import { userGetItem, userSetItem } from '../../services/userStorage';

/** Odomètre total : chaîne type "190 000" → nombre, sinon 0 */
function parseOdometerKm(raw: string | undefined | null): number {
  if (raw == null || raw === '') return 0;
  const digits = String(raw).replace(/\s/g, '').replace(/\u00a0/g, '');
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Statistiques période si le contexte les expose plus tard (kmJour, kmHebdo, …) */
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

type BubbleDef = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  value: number;
  unit?: string;
};

type KmMemo = { id: string; titre: string; note: string; imageUri: string; createdAt: number };
const RETURN_TO_FOLDERS_FLAG = '@otto_open_folders_on_return';

export default function KilometrageScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const allowLeaveRef = useRef(false);
  const ctx = useKilometrage();
  const [memos, setMemos] = useState<KmMemo[]>([]);
  const goToFolders = useCallback(() => {
    allowLeaveRef.current = true;
    void userSetItem(RETURN_TO_FOLDERS_FLAG, '1');
    router.replace('/(tabs)');
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      allowLeaveRef.current = false;
      return () => {};
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const raw = await userGetItem(STORAGE_KM_MEMOS);
          if (cancelled) return;
          if (!raw) {
            setMemos([]);
            return;
          }
          const parsed = JSON.parse(raw) as KmMemo[];
          setMemos(Array.isArray(parsed) ? parsed : []);
        } catch {
          if (!cancelled) setMemos([]);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current) return;
      event.preventDefault();
      goToFolders();
    });
    return unsubscribe;
  }, [goToFolders, navigation]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        goToFolders();
        return true;
      });
      return () => sub.remove();
    }, [goToFolders])
  );

  const totalKm = useMemo(() => parseOdometerKm(ctx?.km), [ctx?.km]);

  const bubbles: BubbleDef[] = useMemo(
    () => [
      {
        key: 'total',
        label: 'Total',
        icon: 'speedometer',
        value: totalKm,
      },
      {
        key: 'jour',
        label: 'Jour',
        icon: 'calendar-today',
        value: readNumericStat(ctx, 'kmJour'),
      },
      {
        key: 'hebdo',
        label: 'Hebdo',
        icon: 'calendar-week',
        value: readNumericStat(ctx, 'kmHebdo'),
      },
      {
        key: 'mois',
        label: 'Mois',
        icon: 'calendar-month',
        value: readNumericStat(ctx, 'kmMois'),
      },
      {
        key: 'an',
        label: 'An',
        icon: 'calendar-star',
        value: readNumericStat(ctx, 'kmAn'),
      },
      {
        key: 'speed',
        label: 'Vitesse',
        icon: 'speedometer-medium',
        value: readNumericStat(ctx, 'speedKmh'),
        unit: 'km/h',
      },
    ],
    [ctx, totalKm]
  );

  return (
    <OttoDossierFrame>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled
      >
        <View style={styles.grid}>
          {bubbles.map((b, idx) => (
            <Pressable key={b.key} style={({ pressed }) => [styles.bubble, pressed && styles.scaleDown]}>
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(59,130,246,0.11)', 'rgba(148,163,184,0.08)', 'rgba(255,255,255,0.98)']}
                locations={[0, 0.58, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.bubbleBlueNuance}
              />
              <MaterialCommunityIcons name={b.icon} size={28} color="#1d4ed8" />
              <Text style={styles.bubbleLabel}>{b.label}</Text>
              <Text style={styles.bubbleValue}>{formatKmFr(b.value)}</Text>
              <Text style={styles.bubbleUnit}>{b.unit ?? 'km'}</Text>
            </Pressable>
          ))}
        </View>

        {memos.length > 0 ? (
          <View style={styles.memoBlock}>
            <Text style={styles.memoTitle}>Mémos photo (scan)</Text>
            {memos.map((m) => (
              <View key={m.id} style={styles.memoCard}>
                {m.imageUri ? (
                  <Image source={{ uri: m.imageUri }} style={styles.memoThumb} />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={styles.memoTitre}>{m.titre}</Text>
                  {m.note ? <Text style={styles.memoNote}>{m.note}</Text> : null}
                  <Text style={styles.memoDate}>
                    {new Date(m.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </OttoDossierFrame>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: Platform.OS === 'web' ? 16 : 22,
    paddingTop: 4,
  },
  scaleDown: { transform: [{ scale: 0.992 }] },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  bubble: {
    width: '48%',
    aspectRatio: 1,
    maxWidth: Platform.OS === 'web' ? 170 : undefined,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.32)',
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  bubbleBlueNuance: {
    ...StyleSheet.absoluteFillObject,
  },
  bubbleLabel: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  bubbleValue: {
    color: '#1e293b',
    fontSize: 21,
    fontWeight: '700',
    marginTop: 4,
  },
  bubbleUnit: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  memoBlock: { marginTop: 20 },
  memoTitle: {
    color: '#1e293b',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  memoCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.28)',
    gap: 10,
  },
  memoThumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#0f172a' },
  memoTitre: { color: '#0f172a', fontWeight: '700', fontSize: 14 },
  memoNote: { color: '#475569', fontSize: 12, marginTop: 4, lineHeight: 18 },
  memoDate: { color: '#3b82f6', fontSize: 10, marginTop: 6 },
});
