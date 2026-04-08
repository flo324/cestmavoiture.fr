import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ONBOARDING_STATUS_KEY, type OnboardingStatus } from '../constants/onboarding';
import { userSetItem } from '../services/userStorage';

const STORAGE_KEY_VEHICLES = '@cestmavoiture_user_vehicles_v1';
const STORAGE_KEY_ACTIVE = '@cestmavoiture_user_active_vehicle_v1';

type StepId = 1 | 2 | 3;
const STEP_COUNT = 3;

const STEP_META: Record<StepId, { title: string; subtitle: string }> = {
  1: {
    title: 'Profil conducteur',
    subtitle: 'Optionnel, pour personnaliser votre espace.',
  },
  2: {
    title: 'Véhicule principal',
    subtitle: 'Les informations véhicule améliorent le suivi IA.',
  },
  3: {
    title: 'Premier document',
    subtitle: 'Scannez maintenant ou continuez plus tard.',
  },
};

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<StepId>(1);
  const [busy, setBusy] = useState(false);
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [modele, setModele] = useState('');
  const [alias, setAlias] = useState('');
  const [immat, setImmat] = useState('');
  const [photoUri, setPhotoUri] = useState('');

  const canContinueVehicle = useMemo(() => alias.trim().length > 0 && modele.trim().length > 0, [alias, modele]);
  const progressPct = useMemo(() => (step / STEP_COUNT) * 100, [step]);

  const saveOnboardingStatus = async (skipped: boolean) => {
    const status: OnboardingStatus = {
      completed: !skipped,
      skipped,
      completedAt: new Date().toISOString(),
    };
    await userSetItem(ONBOARDING_STATUS_KEY, JSON.stringify(status));
  };

  const saveVehicleProfile = async () => {
    const id = 'default';
    const payload = [
      {
        id,
        alias: alias.trim(),
        prenom: prenom.trim(),
        nom: nom.trim(),
        modele: modele.trim(),
        immat: immat.trim(),
        photoUri: photoUri.trim(),
        photoBgCenter: '#334155',
        photoBgEdge: '#0B1120',
      },
    ];
    await userSetItem(STORAGE_KEY_VEHICLES, JSON.stringify(payload));
    await userSetItem(STORAGE_KEY_ACTIVE, id);
  };

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Autorisation requise', 'Autorisez la galerie pour ajouter une photo du véhicule.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.92,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setPhotoUri(result.assets[0].uri);
  };

  const finishAndGoHome = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await saveOnboardingStatus(true);
      router.replace('/splash');
    } finally {
      setBusy(false);
    }
  };

  const completeProfileFlow = async () => {
    if (!canContinueVehicle) {
      Alert.alert('Informations requises', 'Le nom du véhicule et le modèle sont requis pour continuer.');
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await saveVehicleProfile();
      await saveOnboardingStatus(false);
      setStep(3);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : insets.top}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 22 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.topRow}>
          <Text style={styles.title}>Configuration initiale</Text>
          <TouchableOpacity onPress={finishAndGoHome} disabled={busy}>
            <Text style={styles.laterText}>Plus tard</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.progressWrap}>
          <View style={styles.progressHeadRow}>
            <Text style={styles.progressLabel}>Étape {step} / {STEP_COUNT}</Text>
            <Text style={styles.progressPercent}>{Math.round(progressPct)}%</Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
          </View>
          <View style={styles.stepsRow}>
            {[1, 2, 3].map((item) => {
              const id = item as StepId;
              const active = step === id;
              const done = step > id;
              return (
                <View key={id} style={styles.stepItem}>
                  <View style={[styles.stepDot, active && styles.stepDotActive, done && styles.stepDotDone]}>
                    <Text style={[styles.stepDotText, (active || done) && styles.stepDotTextActive]}>{id}</Text>
                  </View>
                  <Text style={[styles.stepText, (active || done) && styles.stepTextActive]}>{STEP_META[id].title}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{STEP_META[step].title}</Text>
          <Text style={styles.heroSub}>{STEP_META[step].subtitle}</Text>
        </View>

        {step === 1 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Informations personnelles</Text>
            <Text style={styles.helper}>Ces champs restent facultatifs, vous pourrez les modifier ensuite.</Text>
            <Text style={styles.label}>Prénom (optionnel)</Text>
            <TextInput style={styles.input} value={prenom} onChangeText={setPrenom} placeholder="Prénom" placeholderTextColor="#64748b" />
            <Text style={styles.label}>Nom (optionnel)</Text>
            <TextInput style={styles.input} value={nom} onChangeText={setNom} placeholder="Nom" placeholderTextColor="#64748b" />
            <TouchableOpacity style={styles.btn} onPress={() => setStep(2)}>
              <Text style={styles.btnText}>Continuer</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Données véhicule</Text>
            <Text style={styles.helper}>Le nom du véhicule et le modèle sont requis pour activer un suivi pertinent.</Text>
            <Text style={styles.label}>Nom du véhicule (requis)</Text>
            <TextInput style={styles.input} value={alias} onChangeText={setAlias} placeholder="Ex: 307, Clio..." placeholderTextColor="#64748b" />
            <Text style={styles.label}>Modèle du véhicule (requis)</Text>
            <TextInput style={styles.input} value={modele} onChangeText={setModele} placeholder="Ex: Peugeot 307" placeholderTextColor="#64748b" />
            <Text style={styles.label}>Immatriculation (optionnel)</Text>
            <TextInput style={styles.input} value={immat} onChangeText={setImmat} placeholder="AA-123-BB" placeholderTextColor="#64748b" />
            <Text style={styles.label}>Photo (optionnel)</Text>
            <TouchableOpacity style={styles.photoBtn} onPress={pickPhoto} activeOpacity={0.85}>
              {photoUri ? <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" /> : <Text style={styles.photoText}>Choisir une photo</Text>}
            </TouchableOpacity>

            <View style={styles.row}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep(1)}>
                <Text style={styles.secondaryBtnText}>Retour</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, !canContinueVehicle && styles.btnDisabled]} onPress={completeProfileFlow} disabled={!canContinueVehicle || busy}>
                <Text style={styles.btnText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Démarrage intelligent</Text>
            <Text style={styles.helper}>Scannez un premier document pour alimenter votre assistant véhicule dès maintenant.</Text>
            <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(tabs)/scan')}>
              <Text style={styles.btnText}>Scanner mon premier document</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.switchBtn} onPress={() => router.replace('/splash')}>
              <Text style={styles.switchBtnText}>Je le ferai plus tard</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0f14' },
  scroll: { paddingHorizontal: 20 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#e2e8f0', fontWeight: '900', fontSize: 18, letterSpacing: 0.2 },
  laterText: { color: '#94a3b8', fontWeight: '700', fontSize: 12 },
  progressWrap: { marginTop: 14, marginBottom: 10 },
  progressHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { color: '#67e8f9', fontSize: 12, fontWeight: '800' },
  progressPercent: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  progressBarTrack: {
    marginTop: 8,
    height: 7,
    backgroundColor: '#1e293b',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 7,
    borderRadius: 999,
    backgroundColor: '#00E9F5',
  },
  stepsRow: { flexDirection: 'row', marginTop: 12, gap: 8 },
  stepItem: { flex: 1, alignItems: 'center' },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { borderColor: '#00E9F5', backgroundColor: 'rgba(0,233,245,0.16)' },
  stepDotDone: { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.14)' },
  stepDotText: { color: '#94a3b8', fontSize: 11, fontWeight: '800' },
  stepDotTextActive: { color: '#e2e8f0' },
  stepText: { marginTop: 6, color: '#64748b', fontSize: 10, textAlign: 'center', lineHeight: 13 },
  stepTextActive: { color: '#94a3b8' },
  heroCard: {
    backgroundColor: '#0f172a',
    borderColor: '#1f2937',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  heroTitle: { color: '#e2e8f0', fontWeight: '800', fontSize: 15 },
  heroSub: { color: '#94a3b8', marginTop: 5, lineHeight: 19, fontSize: 12 },
  card: { backgroundColor: '#111827', borderRadius: 14, borderWidth: 1, borderColor: '#1f2937', padding: 16, marginTop: 8 },
  cardTitle: { color: '#e2e8f0', fontSize: 17, fontWeight: '800' },
  helper: { color: '#94a3b8', marginTop: 8, marginBottom: 10, lineHeight: 20 },
  label: { color: '#94a3b8', fontSize: 11, fontWeight: '700', marginTop: 4, marginBottom: 6 },
  input: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#e2e8f0',
    fontSize: 15,
  },
  photoBtn: {
    height: 120,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoText: { color: '#94a3b8', fontWeight: '700' },
  preview: { width: '100%', height: '100%' },
  row: { flexDirection: 'row', gap: 8, marginTop: 14 },
  btn: { flex: 1, marginTop: 14, backgroundColor: '#00E9F5', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#061018', fontWeight: '900', fontSize: 14, letterSpacing: 0.3 },
  secondaryBtn: { flex: 1, marginTop: 14, borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: '#334155', backgroundColor: '#0f172a' },
  secondaryBtnText: { color: '#94a3b8', fontWeight: '800', fontSize: 13 },
  switchBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 6 },
  switchBtnText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
});

