import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GarageConnectLogo } from '../components/GarageConnectLogo';
import { LoginExitTransition } from '../components/LoginExitTransition';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { userGetItem, userRemoveItem, userSetItem } from '../services/userStorage';

const REMEMBER_LOGIN_KEY = '@garage_connect_remember_login_v1';
const SUPABASE_URL_INFO = process.env.EXPO_PUBLIC_SUPABASE_URL || 'URL Supabase non configurée';
type RememberLoginPayload = {
  remember: boolean;
  email: string;
  password: string;
  byEmail?: Record<string, string>;
};

function humanizeAuthError(message: string): string {
  const m = String(message || '').toLowerCase();
  if (m.includes('rate limit') && (m.includes('email') || m.includes('signup'))) {
    return "Trop d'emails d'inscription ou de confirmation envoyés (limite Supabase). Attendez quelques minutes, vérifiez vos spams/courriers indésirables, ou réessayez plus tard.";
  }
  if (m.includes('rate limit')) {
    return 'Trop de tentatives ou d\'emails envoyés. Patientez quelques minutes puis réessayez.';
  }
  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) {
    return "Connexion refusée : email ou mot de passe incorrect. Si un compte existe déjà avec cet email, utilisez « MOT DE PASSE OUBLIÉ » pour recevoir un lien et en choisir un nouveau. Sinon vérifiez l'orthographe de l'email.";
  }
  if (m.includes('email not confirmed') || m.includes('email_not_confirmed')) {
    return "Cette adresse n'est pas encore confirmée côté Supabase. Ouvrez le lien reçu par mail, ou dans le tableau de bord : Authentication → Users → confirmer l'utilisateur manuellement.";
  }
  if (m.includes('already registered') || m.includes('user already registered')) {
    return "Un compte existe déjà avec cet email. Connectez-vous avec ce mail, ou utilisez « MOT DE PASSE OUBLIÉ » si vous ne connaissez plus le mot de passe.";
  }
  return message;
}

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { register, login, resetPassword } = useAuth();
  const { isLight } = useTheme();

  const scrollRef = useRef<ScrollView | null>(null);
  const emailRef = useRef<TextInput | null>(null);
  const passRef = useRef<TextInput | null>(null);
  const pass2Ref = useRef<TextInput | null>(null);

  const scrollToBottomForKeyboard = () => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 120);
    });
  };

  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(true);
  const [savedByEmail, setSavedByEmail] = useState<Record<string, string>>({});
  /** Transition plein écran G/C + flash après connexion ou inscription réussie */
  const [loginExitActive, setLoginExitActive] = useState(false);

  useEffect(() => {
    const loadRememberedLogin = async () => {
      try {
        const raw = await userGetItem(REMEMBER_LOGIN_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<RememberLoginPayload>;
        if (parsed.remember) {
          setRememberLogin(true);
          const mapping = parsed.byEmail && typeof parsed.byEmail === 'object' ? parsed.byEmail : {};
          const safeMap: Record<string, string> = Object.entries(mapping).reduce(
            (acc, [k, v]) => (typeof v === 'string' && v ? { ...acc, [k.toLowerCase()]: v } : acc),
            {}
          );
          // Migration compat: ancien format {email,password}
          if (typeof parsed.email === 'string' && typeof parsed.password === 'string' && parsed.email.trim()) {
            safeMap[parsed.email.trim().toLowerCase()] = parsed.password;
          }
          setSavedByEmail(safeMap);
          const lastEmail = typeof parsed.email === 'string' ? parsed.email : '';
          setEmail(lastEmail);
          const lastPass = lastEmail ? safeMap[lastEmail.trim().toLowerCase()] : '';
          setPass(lastPass ?? '');
        }
      } catch {
        // ignore corrupted local payload
      }
    };
    loadRememberedLogin();
  }, []);

  const completeLoginTransition = useCallback(() => {
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        router.replace('/');
      });
    });
  }, [router]);

  /** Persistance « se souvenir » puis transition plein écran (connexion ou inscription avec session). */
  const finishLoginVisualTransition = useCallback(async () => {
    if (rememberLogin) {
      const key = email.trim().toLowerCase();
      const nextMap = key ? { ...savedByEmail, [key]: pass } : savedByEmail;
      setSavedByEmail(nextMap);
      const payload: RememberLoginPayload = {
        remember: true,
        email,
        password: pass,
        byEmail: nextMap,
      };
      await userSetItem(REMEMBER_LOGIN_KEY, JSON.stringify(payload));
    } else {
      await userRemoveItem(REMEMBER_LOGIN_KEY);
    }
    setLoginExitActive(true);
  }, [rememberLogin, email, pass, savedByEmail]);

  const handleLogin = async () => {
    const r = await login(email, pass);
    if (!r.ok) {
      Alert.alert('Connexion', humanizeAuthError(r.error ?? 'Échec de la connexion.'));
      return;
    }
    await finishLoginVisualTransition();
  };

  const handleEmailChange = (nextEmail: string) => {
    setEmail(nextEmail);
    if (createMode || !rememberLogin) return;
    const key = nextEmail.trim().toLowerCase();
    const rememberedPass = savedByEmail[key];
    if (rememberedPass) {
      setPass(rememberedPass);
    } else {
      setPass('');
    }
  };

  const submit = async () => {
    if (busy || loginExitActive) return;
    setBusy(true);
    try {
      if (createMode) {
        if (pass !== pass2) {
          Alert.alert('Vérification', 'Les deux mots de passe ne correspondent pas.');
          return;
        }
        const r = await register(email, pass);
        if (!r.ok) {
          Alert.alert('Erreur', humanizeAuthError(r.error ?? 'Impossible de créer le compte.'));
          return;
        }
        if (r.hasSession) {
          setCreateMode(false);
          setPass2('');
          await finishLoginVisualTransition();
          return;
        }
        Alert.alert(
          'Compte créé',
          'Aucune session immédiate. Dans Supabase : Authentication → Sign In / Providers, désactivez « Confirm email », puis reconnectez-vous. Vous pouvez aussi ouvrir le lien reçu par mail si un email a été envoyé.'
        );
        setCreateMode(false);
        setPass2('');
        return;
      }
      await handleLogin();
    } finally {
      setBusy(false);
    }
  };

  const onForgotPassword = async () => {
    if (busy || loginExitActive) return;
    if (!email.trim()) {
      Alert.alert('Mot de passe oublié', 'Entrez votre email puis réessayez.');
      return;
    }
    setBusy(true);
    try {
      const r = await resetPassword(email);
      if (!r.ok) {
        Alert.alert('Mot de passe oublié', humanizeAuthError(r.error ?? "Impossible d'envoyer l'email."));
        return;
      }
      Alert.alert('Email envoyé', 'Vérifiez votre boîte mail pour réinitialiser votre mot de passe.');
    } finally {
      setBusy(false);
    }
  };

  const migrateRememberedAccountsToSupabase = async () => {
    if (busy || loginExitActive) return;
    const entriesMap = new Map<string, string>();
    for (const [emailKey, passwordValue] of Object.entries(savedByEmail)) {
      const key = String(emailKey || '').trim().toLowerCase();
      const value = String(passwordValue || '').trim();
      if (key.includes('@') && value.length >= 8) {
        entriesMap.set(key, value);
      }
    }
    const typedEmail = String(email || '').trim().toLowerCase();
    const typedPass = String(pass || '').trim();
    if (typedEmail.includes('@') && typedPass.length >= 8) {
      entriesMap.set(typedEmail, typedPass);
    }
    const entries = Array.from(entriesMap.entries());
    if (entries.length === 0) {
      Alert.alert(
        'Migration',
        'Aucun compte valide à migrer. Activez "Se souvenir..." ou saisissez un email + mot de passe (8+ caractères) avant de migrer.'
      );
      return;
    }

    setBusy(true);
    try {
      let created = 0;
      let already = 0;
      let failed = 0;
      const failedDetails: string[] = [];

      for (const [emailKey, passwordValue] of entries) {
        const res = await register(emailKey, passwordValue);
        if (res.ok) {
          created += 1;
          continue;
        }
        const msg = String(res.error || '').toLowerCase();
        if (msg.includes('already') || msg.includes('existe') || msg.includes('registered')) {
          already += 1;
        } else {
          failed += 1;
          failedDetails.push(`${emailKey}: ${humanizeAuthError(res.error ?? 'échec inconnu')}`);
        }
      }

      Alert.alert(
        'Migration terminée',
        `Créés: ${created}\nDéjà présents: ${already}\nÉchecs: ${failed}${failedDetails.length ? `\n\nDétails:\n${failedDetails.slice(0, 3).join('\n')}` : ''}\n\nProjet Supabase utilisé:\n${SUPABASE_URL_INFO}`
      );
    } finally {
      setBusy(false);
    }
  };

  const keyboardOffset = insets.top + 12;
  const interactionLocked = busy || loginExitActive;
  const scrollBottomPad = insets.bottom + (createMode ? 260 : 120);

  return (
    <View style={styles.screenRoot}>
    <KeyboardAvoidingView
      style={[styles.root, isLight ? styles.rootLight : null]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? keyboardOffset : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 24, paddingBottom: scrollBottomPad },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        <GarageConnectLogo size="hero" />
        <Text style={[styles.brandLine, isLight ? styles.brandLineLight : null]}>GARAGE CONNECT</Text>
        <Text style={[styles.sub, isLight ? styles.subLight : null]}>
          {createMode
            ? 'Créez votre compte avec votre email et votre mot de passe.'
            : 'Connectez-vous avec votre email pour accéder à votre garage.'}
        </Text>

        <View style={[styles.card, isLight ? styles.cardLight : null]}>
          <Text style={[styles.label, isLight ? styles.labelLight : null]}>Email</Text>
          <TextInput
            ref={emailRef}
            style={[styles.input, isLight ? styles.inputLight : null]}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            value={email}
            onChangeText={handleEmailChange}
            placeholder="ex: vous@email.com"
            placeholderTextColor="#64748b"
            editable={!interactionLocked}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => passRef.current?.focus()}
          />
          <Text style={[styles.label, isLight ? styles.labelLight : null]}>Mot de passe</Text>
          <View style={[styles.passwordWrap, isLight ? styles.passwordWrapLight : null]}>
            <TextInput
              ref={passRef}
              style={[styles.passwordInput, isLight ? styles.passwordInputLight : null]}
              secureTextEntry={!showPass}
              value={pass}
              onChangeText={setPass}
              placeholder="••••••••"
              placeholderTextColor="#64748b"
              editable={!interactionLocked}
              returnKeyType={createMode ? 'next' : 'done'}
              blurOnSubmit={false}
              onSubmitEditing={() => {
                if (createMode) {
                  pass2Ref.current?.focus();
                  scrollToBottomForKeyboard();
                } else {
                  void submit();
                }
              }}
              textContentType={createMode ? 'newPassword' : 'password'}
              onFocus={createMode ? scrollToBottomForKeyboard : undefined}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPass((v) => !v)}
              disabled={interactionLocked}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons
                name={showPass ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color="#94a3b8"
              />
            </TouchableOpacity>
          </View>
          {createMode ? (
            <>
              <Text style={[styles.label, isLight ? styles.labelLight : null]}>Confirmer le mot de passe</Text>
              <View style={[styles.passwordWrap, isLight ? styles.passwordWrapLight : null]}>
                <TextInput
                  ref={pass2Ref}
                  style={[styles.passwordInput, isLight ? styles.passwordInputLight : null]}
                  secureTextEntry={!showPass2}
                  value={pass2}
                  onChangeText={setPass2}
                  placeholder="••••••••"
                  placeholderTextColor="#64748b"
                  editable={!interactionLocked}
                  returnKeyType="done"
                  textContentType="newPassword"
                  blurOnSubmit
                  onSubmitEditing={() => void submit()}
                  onFocus={scrollToBottomForKeyboard}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPass2((v) => !v)}
                  disabled={interactionLocked}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialCommunityIcons
                    name={showPass2 ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#94a3b8"
                  />
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          {!createMode ? (
            <TouchableOpacity
              style={styles.rememberRow}
              disabled={interactionLocked}
              onPress={async () => {
                const next = !rememberLogin;
                setRememberLogin(next);
                if (!next) {
                  setSavedByEmail({});
                  await userRemoveItem(REMEMBER_LOGIN_KEY);
                } else {
                  const key = email.trim().toLowerCase();
                  const nextMap = key && pass ? { ...savedByEmail, [key]: pass } : savedByEmail;
                  setSavedByEmail(nextMap);
                  const payload: RememberLoginPayload = {
                    remember: true,
                    email,
                    password: pass,
                    byEmail: nextMap,
                  };
                  await userSetItem(REMEMBER_LOGIN_KEY, JSON.stringify(payload));
                }
              }}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons
                name={rememberLogin ? 'checkbox-marked-circle-outline' : 'checkbox-blank-circle-outline'}
                size={20}
                color={rememberLogin ? '#00E9F5' : '#64748b'}
              />
              <Text style={[styles.rememberText, isLight ? styles.rememberTextLight : null]}>
                Se souvenir de mon identifiant et mot de passe
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.btn, interactionLocked && styles.btnDisabled]}
            onPress={submit}
            disabled={interactionLocked}
            activeOpacity={0.9}
          >
            {busy ? (
              <ActivityIndicator color="#061018" />
            ) : (
              <Text style={styles.btnText}>
                {createMode ? 'CRÉER MON COMPTE' : 'SE CONNECTER'}
              </Text>
            )}
          </TouchableOpacity>
          {!createMode ? (
            <TouchableOpacity style={styles.switchBtn} onPress={onForgotPassword} disabled={interactionLocked}>
              <Text style={styles.switchBtnText}>MOT DE PASSE OUBLIÉ</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.switchBtn}
            onPress={() => {
              if (interactionLocked) return;
              setCreateMode((v) => !v);
              setPass('');
              setPass2('');
            }}
          >
            <Text style={styles.switchBtnText}>
              {createMode ? 'J’AI DÉJÀ UN COMPTE' : 'CRÉER UN NOUVEAU COMPTE'}
            </Text>
          </TouchableOpacity>
          {!createMode ? (
            <TouchableOpacity style={styles.switchBtn} onPress={migrateRememberedAccountsToSupabase} disabled={interactionLocked}>
              <Text style={styles.switchBtnText}>MIGRER MES COMPTES EXISTANTS VERS SUPABASE</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    <LoginExitTransition active={loginExitActive} isLight={isLight} onComplete={completeLoginTransition} />
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, position: 'relative' },
  root: { flex: 1, backgroundColor: '#0b0f14' },
  rootLight: { backgroundColor: '#f5f8fc' },
  scrollView: { flex: 1 },
  scrollContent: { alignItems: 'center', paddingHorizontal: 22, flexGrow: 1 },
  brandLine: {
    marginTop: 18,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 4,
    color: '#94a3b8',
  },
  brandLineLight: {
    color: '#475569',
  },
  sub: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  subLight: {
    color: '#64748b',
  },
  card: {
    marginTop: 28,
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  cardLight: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e4f2',
  },
  label: { fontSize: 11, fontWeight: '700', color: '#94a3b8', marginBottom: 6, marginTop: 8 },
  labelLight: { color: '#475569' },
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
  inputLight: {
    backgroundColor: '#f8fbff',
    borderColor: '#c7d7ea',
    color: '#0f172a',
  },
  passwordWrap: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingLeft: 12,
    paddingRight: 8,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordWrapLight: {
    backgroundColor: '#f8fbff',
    borderColor: '#c7d7ea',
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    color: '#e2e8f0',
    fontSize: 15,
  },
  passwordInputLight: {
    color: '#0f172a',
  },
  eyeBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rememberRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rememberText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  rememberTextLight: {
    color: '#475569',
  },
  btn: {
    marginTop: 22,
    backgroundColor: '#00E9F5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#061018', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
  switchBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 6 },
  switchBtnText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
});
