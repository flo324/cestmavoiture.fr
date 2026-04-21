import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { OttoDossierFrame } from '../../components/OttoDossierFrame';
import { STORAGE_ESSENCE_LOGS } from '../../constants/depensesConstants';
import { userGetItem } from '../../services/userStorage';

type EssenceEntry = {
  id: string;
  amount: number;
  createdAt: number;
};

const MONTHS_FR = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const day = d.toLocaleDateString('fr-FR', { weekday: 'long' });
  const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${day} • ${date} • ${time}`;
}

export default function EssenceStatsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const allowLeaveRef = useRef(false);
  const backNavLockRef = useRef(false);
  const [entries, setEntries] = useState<EssenceEntry[]>([]);

  const goBackToBilan = useCallback(() => {
    if (backNavLockRef.current) return;
    backNavLockRef.current = true;
    allowLeaveRef.current = true;
    router.replace('/bilan_stats');
    setTimeout(() => {
      backNavLockRef.current = false;
    }, 280);
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      allowLeaveRef.current = false;
      return () => {};
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        goBackToBilan();
        return true;
      });
      return () => sub.remove();
    }, [goBackToBilan])
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current) return;
      event.preventDefault();
      goBackToBilan();
    });
    return unsubscribe;
  }, [goBackToBilan, navigation]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const raw = await userGetItem(STORAGE_ESSENCE_LOGS);
          const parsed = raw ? (JSON.parse(raw) as EssenceEntry[]) : [];
          const safe = Array.isArray(parsed)
            ? parsed.filter((x) => Number.isFinite(x?.amount) && Number.isFinite(x?.createdAt))
            : [];
          setEntries(safe.sort((a, b) => b.createdAt - a.createdAt));
        } catch {
          setEntries([]);
        }
      })();
    }, [])
  );

  const year = new Date().getFullYear();

  const monthlyTotals = useMemo(() => {
    const totals = new Array<number>(12).fill(0);
    for (const item of entries) {
      const d = new Date(item.createdAt);
      if (d.getFullYear() !== year) continue;
      totals[d.getMonth()] += item.amount;
    }
    return totals.map((v) => Math.round(v * 100) / 100);
  }, [entries, year]);

  const maxValue = useMemo(() => Math.max(1, ...monthlyTotals), [monthlyTotals]);

  return (
    <OttoDossierFrame>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <LinearGradient
            colors={['rgba(31,110,255,0.16)', 'rgba(89,199,255,0.08)', 'rgba(255,255,255,0.97)']}
            locations={[0, 0.58, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroIconWrap}>
            <MaterialCommunityIcons name="chart-bar" size={20} color="#0284c7" />
          </View>
          <Text style={styles.heroTitle}>Essence par mois - {year}</Text>
          <Text style={styles.heroSub}>Graphique annuel + historique détaillé des pleins.</Text>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.chartRow}>
            {monthlyTotals.map((value, idx) => {
              const height = Math.max(6, (value / maxValue) * 130);
              return (
                <View key={MONTHS_FR[idx]} style={styles.monthCol}>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { height }]} />
                  </View>
                  <Text style={styles.monthLabel}>{MONTHS_FR[idx]}</Text>
                  <Text style={styles.monthValue}>{value.toFixed(0)}€</Text>
                </View>
              );
            })}
          </View>
        </View>

        {entries.map((item) => (
          <View key={item.id} style={styles.logCard}>
            <View style={styles.logIconWrap}>
              <MaterialCommunityIcons name="gas-station" size={18} color="#2563eb" />
            </View>
            <View style={styles.logTextCol}>
              <Text style={styles.logAmount}>{item.amount.toFixed(2)} €</Text>
              <Text style={styles.logMeta}>{formatDateTime(item.createdAt)}</Text>
            </View>
          </View>
        ))}

        {entries.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Aucune donnée essence</Text>
            <Text style={styles.emptySub}>Ajoute des pleins dans le dossier Essence pour afficher le graphique annuel.</Text>
          </View>
        ) : null}
      </ScrollView>
    </OttoDossierFrame>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 4,
    paddingBottom: 20,
    gap: 10,
  },
  heroCard: {
    minHeight: 84,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.46)',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  heroIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(186,230,253,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.78)',
    marginBottom: 8,
  },
  heroTitle: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
  },
  heroSub: {
    marginTop: 4,
    color: '#475569',
    fontSize: 11,
    fontWeight: '500',
  },
  chartCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.38)',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  chartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 4,
  },
  monthCol: {
    flex: 1,
    alignItems: 'center',
  },
  barTrack: {
    width: 12,
    height: 130,
    borderRadius: 999,
    backgroundColor: 'rgba(191,219,254,0.55)',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 999,
    backgroundColor: '#2563eb',
  },
  monthLabel: {
    marginTop: 6,
    fontSize: 9,
    fontWeight: '700',
    color: '#334155',
  },
  monthValue: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  logCard: {
    minHeight: 70,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.38)',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  logIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(219,234,254,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logTextCol: {
    marginLeft: 10,
    flex: 1,
  },
  logAmount: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
  },
  logMeta: {
    marginTop: 3,
    color: '#475569',
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.26)',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  emptyTitle: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
  },
  emptySub: {
    marginTop: 4,
    color: '#64748b',
    fontSize: 11,
    fontWeight: '500',
  },
});

