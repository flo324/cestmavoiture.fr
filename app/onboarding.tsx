import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ONBOARDING_STATUS_KEY, type OnboardingStatus } from '../constants/onboarding';
import { autoAttachManualForVehicle } from '../services/manualAutofill';
import { lookupVehicleByPlate } from '../services/vehicleLookup';
import { userSetItem } from '../services/userStorage';

const STORAGE_KEY_VEHICLES = '@cestmavoiture_user_vehicles_v1';
const STORAGE_KEY_ACTIVE = '@cestmavoiture_user_active_vehicle_v1';

type StepId = 1 | 2;
const STEP_COUNT = 2;

/** Sous-étapes à l’intérieur de l’étape véhicule : plaque → nom → modèle (+ enregistrer). */
type VehicleUiStep = 1 | 2 | 3;

const STEP_META: Record<StepId, { title: string; subtitle: string }> = {
  1: {
    title: 'Profil conducteur',
    subtitle: 'Optionnel, pour personnaliser votre espace.',
  },
  2: {
    title: 'Véhicule principal',
    subtitle: 'Les informations véhicule améliorent le suivi IA.',
  },
};

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const prenomRef = useRef<TextInput | null>(null);
  const nomRef = useRef<TextInput | null>(null);
  const immatRef = useRef<TextInput | null>(null);
  const aliasRef = useRef<TextInput | null>(null);
  const modeleRef = useRef<TextInput | null>(null);

  const [step, setStep] = useState<StepId>(1);
  const [vehicleUiStep, setVehicleUiStep] = useState<VehicleUiStep>(1);
  const [busy, setBusy] = useState(false);
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [modele, setModele] = useState('');
  const [alias, setAlias] = useState('');
  const [immat, setImmat] = useState('');
  const [plateLookupStatus, setPlateLookupStatus] = useState<'idle' | 'loading' | 'done' | 'failed'>('idle');

  const canContinueVehicle = useMemo(
    () => immat.trim().length > 0 && alias.trim().length > 0 && modele.trim().length > 0,
    [immat, alias, modele]
  );
  const progressPct = useMemo(() => (step / STEP_COUNT) * 100, [step]);

  const goToStep2AndFocusImmat = () => {
    setStep(2);
    setVehicleUiStep(1);
    setTimeout(() => immatRef.current?.focus(), 280);
  };

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
    const palette = { center: '#334155', edge: '#0B1120' };
    const payload = [
      {
        id,
        alias: alias.trim() || modele.trim(),
        prenom: prenom.trim(),
        nom: nom.trim(),
        modele: modele.trim(),
        immat: immat.trim(),
        photoUri: '',
        photoBgCenter: palette.center,
        photoBgEdge: palette.edge,
      },
    ];
    await userSetItem(STORAGE_KEY_VEHICLES, JSON.stringify(payload));
    await userSetItem(STORAGE_KEY_ACTIVE, id);
  };

  /**
   * Après la recherche (succès ou échec) : passage à l’écran « nom du véhicule ».
   * Pas d’alerte « champs requis » ici.
   */
  const handleVehicleLookup = async () => {
    const immatValue = immat.trim();
    if (!immatValue) {
      Alert.alert('Immatriculation requise', 'Renseignez votre immatriculation avant de lancer la recherche.');
      return;
    }
    setPlateLookupStatus('loading');
    const found = await lookupVehicleByPlate(immatValue);

    if (!found) {
      setPlateLookupStatus('failed');
      return;
    }

    const nextModel = (found.fullModel || [found.make, found.model].filter(Boolean).join(' ')).trim();
    if (!nextModel) {
      setPlateLookupStatus('failed');
      return;
    }

    setModele(nextModel);
    if (!alias.trim()) {
      setAlias(found.model?.trim() || nextModel);
    }
    setPlateLookupStatus('done');
    goToVehicleStep2();
  };

  const goToVehicleStep2 = () => {
    setVehicleUiStep(2);
    setTimeout(() => aliasRef.current?.focus(), 220);
  };

  const goToVehicleStep3 = () => {
    setVehicleUiStep(3);
    setTimeout(() => modeleRef.current?.focus(), 220);
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
    if (busy) return;
    setBusy(true);
    try {
      await saveVehicleProfile();
      autoAttachManualForVehicle(modele.trim(), immat.trim()).catch(() => {});
      await saveOnboardingStatus(false);
      router.replace('/splash');
    } finally {
      setBusy(false);
    }
  };

  /** Alerte « champs requis » uniquement au clic sur Enregistrer. */
  const onPressEnregistrer = () => {
    if (busy) return;
    if (!immat.trim() || !alias.trim() || !modele.trim()) {
      Alert.alert('Champs requis', "Vous devez d'abord remplir les champs requis.");
      return;
    }
    completeProfileFlow();
  };

  const keyboardOffset = insets.top + 12;

  return (
    <View style={styles.shell}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? keyboardOffset : 0}
      >
        <View
          style={[
            styles.page,
            {
              paddingTop: insets.top + 14,
              paddingBottom: insets.bottom + 10,
              paddingHorizontal: 20,
            },
          ]}
        >
          <View style={styles.topBlock}>
            <View style={styles.topRow}>
              <Text style={styles.title}>Configuration initiale</Text>
              <TouchableOpacity onPress={finishAndGoHome} disabled={busy}>
                <Text style={styles.laterText}>Plus tard</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.progressWrap}>
              <View style={styles.progressHeadRow}>
                <Text style={styles.progressLabel}>
                  Étape {step} / {STEP_COUNT}
                </Text>
                <Text style={styles.progressPercent}>{Math.round(progressPct)}%</Text>
              </View>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
              </View>
              <View style={styles.stepsRow}>
                {[1, 2].map((item) => {
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
          </View>

          <View style={styles.scene}>
            <View style={styles.cardShell}>
              {step === 1 ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Informations personnelles</Text>
                  <Text style={styles.helper}>Ces champs restent facultatifs, vous pourrez les modifier ensuite.</Text>
                  <Text style={styles.label}>Prénom (optionnel)</Text>
                  <TextInput
                    ref={prenomRef}
                    style={styles.input}
                    value={prenom}
                    onChangeText={setPrenom}
                    placeholder="Prénom"
                    placeholderTextColor="#64748b"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => nomRef.current?.focus()}
                  />
                  <Text style={styles.label}>Nom (optionnel)</Text>
                  <TextInput
                    ref={nomRef}
                    style={styles.input}
                    value={nom}
                    onChangeText={setNom}
                    placeholder="Nom"
                    placeholderTextColor="#64748b"
                    returnKeyType="done"
                    onSubmitEditing={goToStep2AndFocusImmat}
                  />
                  <TouchableOpacity style={styles.btn} onPress={goToStep2AndFocusImmat}>
                    <Text style={styles.btnText}>Continuer</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {step === 2 ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Données véhicule</Text>

                  {vehicleUiStep === 1 ? (
                    <>
                      <Text style={styles.helper}>Saisissez l’immatriculation, puis lancez la recherche du modèle.</Text>
                      <Text style={styles.label}>Immatriculation (requis)</Text>
                      <TextInput
                        ref={immatRef}
                        style={styles.input}
                        value={immat}
                        onChangeText={(value) => {
                          setImmat(value);
                          if (plateLookupStatus !== 'idle') setPlateLookupStatus('idle');
                        }}
                        placeholder="AA-123-BB"
                        autoCapitalize="characters"
                        placeholderTextColor="#64748b"
                        returnKeyType="done"
                        onSubmitEditing={() => void handleVehicleLookup()}
                      />
                      <TouchableOpacity
                        style={[styles.lookupBtn, plateLookupStatus === 'loading' ? styles.lookupBtnDisabled : null]}
                        onPress={() => void handleVehicleLookup()}
                        disabled={plateLookupStatus === 'loading'}
                      >
                        <Text style={styles.lookupBtnText}>{plateLookupStatus === 'loading' ? 'Recherche...' : 'Rechercher le modèle'}</Text>
                      </TouchableOpacity>
                      {plateLookupStatus === 'failed' ? (
                        <>
                          <Text style={styles.lookupHintKo}>
                            Recherche indisponible pour cette plaque. Poursuivez la saisie manuelle à l’étape suivante. Token optionnel : EXPO_PUBLIC_API_PLAQUE_TOKEN.
                          </Text>
                          <TouchableOpacity style={styles.btn} onPress={goToVehicleStep2}>
                            <Text style={styles.btnText}>Continuer la saisie</Text>
                          </TouchableOpacity>
                        </>
                      ) : null}
                    </>
                  ) : null}

                  {vehicleUiStep === 2 ? (
                    <>
                      <Text style={styles.helper}>Nom affiché pour votre véhicule (vous pourrez le modifier plus tard).</Text>
                      <Text style={styles.label}>Nom du véhicule (requis)</Text>
                      <TextInput
                        ref={aliasRef}
                        style={styles.input}
                        value={alias}
                        onChangeText={setAlias}
                        placeholder="Ex: 307, Clio..."
                        placeholderTextColor="#64748b"
                        returnKeyType="next"
                        blurOnSubmit={false}
                        onSubmitEditing={goToVehicleStep3}
                      />
                      <TouchableOpacity style={styles.btn} onPress={goToVehicleStep3}>
                        <Text style={styles.btnText}>Continuer</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.backLink}
                        onPress={() => {
                          setVehicleUiStep(1);
                          setPlateLookupStatus('idle');
                        }}
                      >
                        <Text style={styles.backLinkText}>← Modifier l’immatriculation</Text>
                      </TouchableOpacity>
                    </>
                  ) : null}

                  {vehicleUiStep === 3 ? (
                    <>
                      <Text style={styles.helper}>Modèle complet (marque + version si besoin).</Text>
                      <Text style={styles.label}>Modèle du véhicule (requis)</Text>
                      <TextInput
                        ref={modeleRef}
                        style={styles.input}
                        value={modele}
                        onChangeText={setModele}
                        placeholder="Ex: Peugeot 307"
                        placeholderTextColor="#64748b"
                        returnKeyType="done"
                        blurOnSubmit
                        onSubmitEditing={() => {
                          if (busy) return;
                          if (canContinueVehicle) {
                            void completeProfileFlow();
                          }
                        }}
                      />

                      <View style={styles.row}>
                        <TouchableOpacity
                          style={styles.secondaryBtn}
                          onPress={() => {
                            setVehicleUiStep(2);
                            setTimeout(() => aliasRef.current?.focus(), 100);
                          }}
                        >
                          <Text style={styles.secondaryBtnText}>Retour</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.btn, !canContinueVehicle && !busy && styles.btnMuted]}
                          onPress={onPressEnregistrer}
                          disabled={busy}
                        >
                          <Text style={styles.btnText}>Enregistrer</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#0b0f14' },
  kav: { flex: 1 },
  page: { flex: 1 },
  topBlock: { flexShrink: 0 },
  scene: {
    flex: 1,
    minHeight: 0,
    marginTop: 8,
  },
  cardShell: {
    flex: 1,
    minHeight: 0,
    marginTop: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 10 },
    }),
  },
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
    marginBottom: 4,
    zIndex: 1,
  },
  heroTitle: { color: '#e2e8f0', fontWeight: '800', fontSize: 15 },
  heroSub: { color: '#94a3b8', marginTop: 5, lineHeight: 19, fontSize: 12 },
  card: {
    backgroundColor: '#111827',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 16,
  },
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
  row: { flexDirection: 'row', gap: 8, marginTop: 14 },
  btn: { flex: 1, marginTop: 14, backgroundColor: '#00E9F5', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnMuted: { opacity: 0.55 },
  btnText: { color: '#061018', fontWeight: '900', fontSize: 14, letterSpacing: 0.3 },
  secondaryBtn: {
    flex: 1,
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
  },
  secondaryBtnText: { color: '#94a3b8', fontWeight: '800', fontSize: 13 },
  backLink: { marginTop: 14, alignSelf: 'center', paddingVertical: 8 },
  backLinkText: { color: '#67e8f9', fontSize: 13, fontWeight: '700' },
  lookupBtn: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1d4ed8',
    backgroundColor: 'rgba(29,78,216,0.18)',
    paddingVertical: 10,
    alignItems: 'center',
  },
  lookupBtnDisabled: {
    opacity: 0.7,
  },
  lookupBtnText: {
    color: '#bfdbfe',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.2,
  },
  lookupHintOk: {
    marginTop: 8,
    color: '#86efac',
    fontSize: 11,
    fontWeight: '700',
  },
  lookupHintKo: {
    marginTop: 8,
    color: '#fca5a5',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
});
