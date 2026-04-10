import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useKilometrage } from '../../context/KilometrageContext';
import { UI_THEME } from '../../constants/uiTheme';
import { STORAGE_KM_MEMOS } from '../../constants/scanConstants';
import { PremiumHeroBanner } from '../../components/PremiumHeroBanner';
import { userGetItem } from '../../services/userStorage';

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

export default function KilometrageScreen() {
  const ctx = useKilometrage();
  const [memos, setMemos] = useState<KmMemo[]>([]);

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
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={false}
      >
        <PremiumHeroBanner variant="km" height={140} alignCenter>
          <View style={styles.heroIconWrap}>
            <MaterialCommunityIcons name="speedometer" size={28} color={UI_THEME.cyan} />
          </View>
          <Text style={styles.title}>Kilométrage</Text>
          <Text style={styles.subtitle}>Suivi précis des distances et stats de conduite</Text>
        </PremiumHeroBanner>

        <View style={styles.grid}>
          {bubbles.map((b, idx) => (
            <Pressable key={b.key} style={({ pressed }) => [styles.bubble, pressed && styles.scaleDown]}>
              <MaterialCommunityIcons name={b.icon} size={28} color="#fff" />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UI_THEME.bg },
  scrollContent: {
    paddingBottom: Platform.OS === 'web' ? 24 : 100,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 16 : 8,
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
  title: {
    fontSize: 23,
    fontWeight: '900',
    color: UI_THEME.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: '#cbd5e1',
    marginTop: 4,
    textAlign: 'center',
  },
  scaleDown: { transform: [{ scale: 0.98 }] },
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
    backgroundColor: UI_THEME.glass,
    borderRadius: 20,
    padding: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: UI_THEME.cyanBorder,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  bubbleLabel: {
    color: '#bdc3c7',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginTop: 6,
  },
  bubbleValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 4,
  },
  bubbleUnit: {
    color: '#95a5a6',
    fontSize: 11,
    marginTop: 2,
  },
  memoBlock: { marginTop: 20 },
  memoTitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  memoCard: {
    flexDirection: 'row',
    backgroundColor: UI_THEME.glass,
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: UI_THEME.goldBorder,
    gap: 10,
  },
  memoThumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#0f172a' },
  memoTitre: { color: '#e2e8f0', fontWeight: '700', fontSize: 14 },
  memoNote: { color: '#cbd5e1', fontSize: 12, marginTop: 4, lineHeight: 18 },
  memoDate: { color: '#64748b', fontSize: 10, marginTop: 6 },
});
