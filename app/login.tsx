import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useAuth } from '../context/AuthContext';
import { userGetItem, userRemoveItem, userSetItem } from '../services/userStorage';

const REMEMBER_LOGIN_KEY = '@garage_connect_remember_login_v1';
type RememberLoginPayload = {
  remember: boolean;
  email: string;
  password: string;
  byEmail?: Record<string, string>;
};

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { register, login, resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(true);
  const [savedByEmail, setSavedByEmail] = useState<Record<string, string>>({});

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
    if (busy) return;
    setBusy(true);
    try {
      if (createMode) {
        if (pass !== pass2) {
          Alert.alert('Vérification', 'Les deux mots de passe ne correspondent pas.');
          setBusy(false);
          return;
        }
        const r = await register(email, pass);
        if (!r.ok) {
          Alert.alert('Erreur', r.error ?? 'Impossible de créer le compte.');
          return;
        }
        Alert.alert(
          'Compte créé',
          'Un email de confirmation a été envoyé. Confirmez votre adresse puis connectez-vous.'
        );
        setCreateMode(false);
        setPass('');
        setPass2('');
        return;
      }
      const r = await login(email, pass);
      if (!r.ok) {
        Alert.alert('Connexion', r.error ?? 'Échec de la connexion.');
        return;
      }
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
      router.replace('/splash');
    } finally {
      setBusy(false);
    }
  };

  const onForgotPassword = async () => {
    if (busy) return;
    if (!email.trim()) {
      Alert.alert('Mot de passe oublié', 'Entrez votre email puis réessayez.');
      return;
    }
    setBusy(true);
    try {
      const r = await resetPassword(email);
      if (!r.ok) {
        Alert.alert('Mot de passe oublié', r.error ?? "Impossible d'envoyer l'email.");
        return;
      }
      Alert.alert('Email envoyé', 'Vérifiez votre boîte mail pour réinitialiser votre mot de passe.');
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
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <GarageConnectLogo size="hero" />
        <Text style={styles.brandLine}>GARAGE CONNECT</Text>
        <Text style={styles.sub}>
          {createMode
            ? 'Créez votre compte avec votre email et confirmez-le dans votre boîte mail.'
            : 'Connectez-vous avec votre email pour accéder à votre garage.'}
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            value={email}
            onChangeText={handleEmailChange}
            placeholder="ex: vous@email.com"
            placeholderTextColor="#64748b"
            editable={!busy}
          />
          <Text style={styles.label}>Mot de passe</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              style={styles.passwordInput}
              secureTextEntry={!showPass}
              value={pass}
              onChangeText={setPass}
              placeholder="••••••••"
              placeholderTextColor="#64748b"
              editable={!busy}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPass((v) => !v)}
              disabled={busy}
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
              <Text style={styles.label}>Confirmer le mot de passe</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={styles.passwordInput}
                  secureTextEntry={!showPass2}
                  value={pass2}
                  onChangeText={setPass2}
                  placeholder="••••••••"
                  placeholderTextColor="#64748b"
                  editable={!busy}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPass2((v) => !v)}
                  disabled={busy}
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
              <Text style={styles.rememberText}>Se souvenir de mon identifiant et mot de passe</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.btn, busy && styles.btnDisabled]}
            onPress={submit}
            disabled={busy}
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
            <TouchableOpacity style={styles.switchBtn} onPress={onForgotPassword} disabled={busy}>
              <Text style={styles.switchBtnText}>MOT DE PASSE OUBLIÉ</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.switchBtn}
            onPress={() => {
              if (busy) return;
              setCreateMode((v) => !v);
              setPass('');
              setPass2('');
            }}
          >
            <Text style={styles.switchBtnText}>
              {createMode ? 'J’AI DÉJÀ UN COMPTE' : 'CRÉER UN NOUVEAU COMPTE'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0f14' },
  scroll: { alignItems: 'center', paddingHorizontal: 22 },
  brandLine: {
    marginTop: 18,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 4,
    color: '#94a3b8',
  },
  sub: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
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
  label: { fontSize: 11, fontWeight: '700', color: '#94a3b8', marginBottom: 6, marginTop: 8 },
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
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    color: '#e2e8f0',
    fontSize: 15,
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
