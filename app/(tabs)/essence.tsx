import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { OttoDossierFrame } from '../../components/OttoDossierFrame';
import { STORAGE_ESSENCE_LOGS } from '../../constants/depensesConstants';
import { userGetItem, userSetItem } from '../../services/userStorage';

type EssenceEntry = {
  id: string;
  amount: number;
  createdAt: number;
};

function formatFrDateTime(ts: number): { dayLabel: string; dateLabel: string; timeLabel: string } {
  const d = new Date(ts);
  const dayLabel = d.toLocaleDateString('fr-FR', { weekday: 'long' });
  const dateLabel = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeLabel = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return { dayLabel, dateLabel, timeLabel };
}

function normalizeAmount(raw: string): number | null {
  const clean = raw.replace(',', '.').trim();
  if (!clean) return null;
  const n = Number(clean);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export default function EssenceScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const allowLeaveRef = useRef(false);
  const backNavLockRef = useRef(false);
  const [amountInput, setAmountInput] = useState('');
  const [entries, setEntries] = useState<EssenceEntry[]>([]);

  const goBackToDepenses = useCallback(() => {
    if (backNavLockRef.current) return;
    backNavLockRef.current = true;
    allowLeaveRef.current = true;
    router.replace('/depenses');
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
        goBackToDepenses();
        return true;
      });
      return () => sub.remove();
    }, [goBackToDepenses])
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current) return;
      event.preventDefault();
      goBackToDepenses();
    });
    return unsubscribe;
  }, [goBackToDepenses, navigation]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await userGetItem(STORAGE_ESSENCE_LOGS);
        if (!raw) return;
        const parsed = JSON.parse(raw) as EssenceEntry[];
        if (Array.isArray(parsed)) {
          const sanitized = parsed.filter((x) => Number.isFinite(x?.amount) && Number.isFinite(x?.createdAt));
          setEntries(sanitized.sort((a, b) => b.createdAt - a.createdAt));
        }
      } catch {
        setEntries([]);
      }
    })();
  }, []);

  const saveEntry = async () => {
    const amount = normalizeAmount(amountInput);
    if (amount == null) return;
    const next: EssenceEntry = {
      id: `ess-${Date.now()}`,
      amount,
      createdAt: Date.now(),
    };
    const updated = [next, ...entries];
    setEntries(updated);
    setAmountInput('');
    await userSetItem(STORAGE_ESSENCE_LOGS, JSON.stringify(updated));
  };

  const monthlyTotal = useMemo(() => {
    const now = new Date();
    return entries
      .filter((x) => {
        const d = new Date(x.createdAt);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((sum, x) => sum + x.amount, 0);
  }, [entries]);

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
            <MaterialCommunityIcons name="gas-station" size={20} color="#0284c7" />
          </View>
          <Text style={styles.heroTitle}>Dépenses essence</Text>
          <Text style={styles.heroSub}>Enregistrement automatique avec jour, date et heure.</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.label}>Montant du plein (€)</Text>
          <TextInput
            style={styles.input}
            value={amountInput}
            onChangeText={setAmountInput}
            keyboardType="decimal-pad"
            placeholder="Ex: 72.40"
            placeholderTextColor="#64748b"
          />
          <Pressable style={({ pressed }) => [styles.saveBtn, pressed && styles.scaleDown]} onPress={saveEntry}>
            <Text style={styles.saveBtnText}>ENREGISTRER LE PLEIN</Text>
          </Pressable>
          <Text style={styles.monthHint}>Total mois en cours : {monthlyTotal.toFixed(2)} €</Text>
        </View>

        {entries.map((item) => {
          const f = formatFrDateTime(item.createdAt);
          return (
            <View key={item.id} style={styles.logCard}>
              <View style={styles.logIconWrap}>
                <MaterialCommunityIcons name="calendar-clock" size={18} color="#2563eb" />
              </View>
              <View style={styles.logTextCol}>
                <Text style={styles.logAmount}>{item.amount.toFixed(2)} €</Text>
                <Text style={styles.logMeta}>
                  {f.dayLabel} • {f.dateLabel} • {f.timeLabel}
                </Text>
              </View>
            </View>
          );
        })}

        {entries.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Aucune dépense essence</Text>
            <Text style={styles.emptySub}>Ajoute ton premier plein pour démarrer les statistiques.</Text>
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
  scaleDown: { transform: [{ scale: 0.992 }] },
  heroCard: {
    minHeight: 84,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.46)',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: 'relative',
    overflow: 'hidden',
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
  formCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.28)',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  label: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  saveBtn: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: '#1d4ed8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  monthHint: {
    marginTop: 8,
    color: '#2563eb',
    fontSize: 11,
    fontWeight: '700',
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

