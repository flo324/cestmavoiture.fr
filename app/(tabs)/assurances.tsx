import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { OttoDossierFrame } from '../../components/OttoDossierFrame';
import { STORAGE_ASSURANCE_PLANS } from '../../constants/depensesConstants';
import { userGetItem, userSetItem } from '../../services/userStorage';

type AssurancePlan = {
  id: string;
  amount: number;
  debitDay: number;
  createdAt: number;
};

function parseAmount(raw: string): number | null {
  const clean = raw.replace(',', '.').trim();
  if (!clean) return null;
  const n = Number(clean);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function parseDebitDay(raw: string): number | null {
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return null;
  const d = Math.round(n);
  if (d < 1 || d > 31) return null;
  return d;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function countMonthlyOccurrences(plan: AssurancePlan, nowTs: number): number {
  const start = new Date(plan.createdAt);
  const now = new Date(nowTs);

  const startMonthIndex = start.getFullYear() * 12 + start.getMonth();
  const currentMonthIndex = now.getFullYear() * 12 + now.getMonth();
  const firstChargeMonthIndex = startMonthIndex + (start.getDate() > plan.debitDay ? 1 : 0);

  if (currentMonthIndex < firstChargeMonthIndex) return 0;

  const fullMonthsBeforeCurrent = currentMonthIndex - firstChargeMonthIndex;
  const effectiveDebitDayCurrent = Math.min(plan.debitDay, daysInMonth(now.getFullYear(), now.getMonth()));
  const hasCurrentMonthCharge = now.getDate() >= effectiveDebitDayCurrent;

  return fullMonthsBeforeCurrent + (hasCurrentMonthCharge ? 1 : 0);
}

function countOccurrencesInYear(plan: AssurancePlan, year: number, nowTs: number): number {
  let count = 0;
  for (let month = 0; month < 12; month += 1) {
    const chargeDate = new Date(year, month, Math.min(plan.debitDay, daysInMonth(year, month)));
    if (chargeDate.getTime() < plan.createdAt) continue;
    if (chargeDate.getTime() > nowTs) continue;
    count += 1;
  }
  return count;
}

export default function AssurancesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const allowLeaveRef = useRef(false);
  const backNavLockRef = useRef(false);
  const [amountInput, setAmountInput] = useState('');
  const [debitDayInput, setDebitDayInput] = useState('');
  const [plans, setPlans] = useState<AssurancePlan[]>([]);

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
        const raw = await userGetItem(STORAGE_ASSURANCE_PLANS);
        if (!raw) return;
        const parsed = JSON.parse(raw) as AssurancePlan[];
        if (Array.isArray(parsed)) {
          const safe = parsed.filter(
            (x) => Number.isFinite(x?.amount) && Number.isFinite(x?.debitDay) && Number.isFinite(x?.createdAt)
          );
          setPlans(safe.sort((a, b) => b.createdAt - a.createdAt));
        }
      } catch {
        setPlans([]);
      }
    })();
  }, []);

  const addPlan = async () => {
    const amount = parseAmount(amountInput);
    const debitDay = parseDebitDay(debitDayInput);
    if (amount == null || debitDay == null) return;

    const next: AssurancePlan = {
      id: `ass-${Date.now()}`,
      amount,
      debitDay,
      createdAt: Date.now(),
    };
    const updated = [next, ...plans];
    setPlans(updated);
    setAmountInput('');
    setDebitDayInput('');
    await userSetItem(STORAGE_ASSURANCE_PLANS, JSON.stringify(updated));
  };

  const nowTs = Date.now();
  const insuranceMonthTotal = useMemo(() => {
    const now = new Date(nowTs);
    let total = 0;
    for (const plan of plans) {
      const chargeDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        Math.min(plan.debitDay, daysInMonth(now.getFullYear(), now.getMonth()))
      );
      if (chargeDate.getTime() >= plan.createdAt && chargeDate.getTime() <= nowTs) {
        total += plan.amount;
      }
    }
    return Math.round(total * 100) / 100;
  }, [plans, nowTs]);

  const insuranceYearTotal = useMemo(() => {
    const now = new Date(nowTs);
    const y = now.getFullYear();
    let total = 0;
    for (const plan of plans) {
      total += countOccurrencesInYear(plan, y, nowTs) * plan.amount;
    }
    return Math.round(total * 100) / 100;
  }, [plans, nowTs]);

  return (
    <OttoDossierFrame>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <LinearGradient
            colors={['rgba(31,110,255,0.16)', 'rgba(89,199,255,0.08)', 'rgba(255,255,255,0.97)']}
            locations={[0, 0.58, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="shield-check-outline" size={22} color="#0284c7" />
          </View>
          <Text style={styles.title}>Assurances automatiques</Text>
          <Text style={styles.sub}>
            Saisis une fois le montant et le jour de prélèvement : l'application additionne automatiquement chaque mois.
          </Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.label}>Montant mensuel (€)</Text>
          <TextInput
            style={styles.input}
            value={amountInput}
            onChangeText={setAmountInput}
            keyboardType="decimal-pad"
            placeholder="Ex: 89.90"
            placeholderTextColor="#64748b"
          />
          <Text style={[styles.label, { marginTop: 10 }]}>Jour de prélèvement (1 à 31)</Text>
          <TextInput
            style={styles.input}
            value={debitDayInput}
            onChangeText={setDebitDayInput}
            keyboardType="number-pad"
            placeholder="Ex: 5"
            placeholderTextColor="#64748b"
          />
          <Pressable style={({ pressed }) => [styles.saveBtn, pressed && styles.scaleDown]} onPress={addPlan}>
            <Text style={styles.saveBtnText}>ENREGISTRER LE PRÉLÈVEMENT</Text>
          </Pressable>
          <Text style={styles.statText}>Mois en cours : {insuranceMonthTotal.toFixed(2)} €</Text>
          <Text style={styles.statText}>Année en cours : {insuranceYearTotal.toFixed(2)} €</Text>
        </View>

        {plans.map((plan) => {
          const occurrences = countMonthlyOccurrences(plan, nowTs);
          const cumulative = Math.round(occurrences * plan.amount * 100) / 100;
          const created = new Date(plan.createdAt).toLocaleDateString('fr-FR');
          return (
            <View key={plan.id} style={styles.planCard}>
              <View style={styles.planIconWrap}>
                <MaterialCommunityIcons name="calendar-sync" size={18} color="#2563eb" />
              </View>
              <View style={styles.planTextCol}>
                <Text style={styles.planTitle}>{plan.amount.toFixed(2)} € / mois</Text>
                <Text style={styles.planSub}>
                  Prélèvement chaque mois le {plan.debitDay} • Contrat saisi le {created}
                </Text>
                <Text style={styles.planCumul}>Cumul automatique : {cumulative.toFixed(2)} €</Text>
              </View>
            </View>
          );
        })}
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
  card: {
    minHeight: 100,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.46)',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(186,230,253,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.78)',
    marginBottom: 8,
  },
  title: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
  },
  sub: {
    marginTop: 4,
    color: '#475569',
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 17,
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
  statText: {
    marginTop: 8,
    color: '#2563eb',
    fontSize: 11,
    fontWeight: '700',
  },
  planCard: {
    minHeight: 78,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.36)',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  planIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(219,234,254,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTextCol: {
    marginLeft: 10,
    flex: 1,
  },
  planTitle: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
  },
  planSub: {
    marginTop: 3,
    color: '#475569',
    fontSize: 11,
    fontWeight: '500',
  },
  planCumul: {
    marginTop: 4,
    color: '#1d4ed8',
    fontSize: 11,
    fontWeight: '700',
  },
});

