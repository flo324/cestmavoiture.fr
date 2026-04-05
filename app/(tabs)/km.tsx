import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useKilometrage } from '../../context/KilometrageContext';

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
};

export default function KilometrageScreen() {
  const ctx = useKilometrage();

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
    ],
    [ctx, totalKm]
  );

  const scales = useRef(
    bubbles.map(() => new Animated.Value(1))
  ).current;

  useEffect(() => {
    const loops = scales.map((scale, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.05,
            duration: 900,
            delay: index * 120,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => {
      loops.forEach((l) => l.stop());
    };
  }, [scales]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <MaterialCommunityIcons name="speedometer" size={36} color="#f39c12" />
          <Text style={styles.title}>Kilométrage</Text>
          <Text style={styles.subtitle}>Synthèse</Text>
        </View>

        <View style={styles.grid}>
          {bubbles.map((b, idx) => (
            <Animated.View
              key={b.key}
              style={[
                styles.bubble,
                { transform: [{ scale: scales[idx] ?? new Animated.Value(1) }] },
              ]}
            >
              <MaterialCommunityIcons name={b.icon} size={28} color="#fff" />
              <Text style={styles.bubbleLabel}>{b.label}</Text>
              <Text style={styles.bubbleValue}>{formatKmFr(b.value)}</Text>
              <Text style={styles.bubbleUnit}>km</Text>
            </Animated.View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f2f5f8',
  },
  scrollContent: {
    paddingBottom: Platform.OS === 'web' ? 24 : 100,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 16 : 8,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#7f8c8d',
    marginTop: 4,
  },
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
    backgroundColor: '#2c3e50',
    borderRadius: 20,
    padding: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#f39c12',
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
});
