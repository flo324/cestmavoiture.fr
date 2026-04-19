import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { UI_THEME } from '../../constants/uiTheme';
import {
  fetchRoadTripPlannerFromForm,
  ROAD_TRIP_STYLE_OPTIONS,
  type RoadTripStyleOption,
} from '../../services/roadTripAI';

type ChatMsg = { role: 'user' | 'assistant'; text: string };

export default function LocationScreen() {
  const insets = useSafeAreaInsets();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [style, setStyle] = useState<RoadTripStyleOption>('Touristique');
  const [durationStr, setDurationStr] = useState('5');
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);

  const [rtMessages, setRtMessages] = useState<ChatMsg[]>([]);
  const [rtLoading, setRtLoading] = useState(false);
  /** Départ / arrivée du dernier itinéraire généré avec succès (deep links). */
  const [navRoute, setNavRoute] = useState<{ from: string; to: string } | null>(null);

  const durationDays = Math.min(21, Math.max(1, parseInt(durationStr.replace(/\D/g, '') || '1', 10) || 1));

  const formValid = from.trim().length > 0 && to.trim().length > 0 && durationDays >= 1;

  const buildUserSummary = useCallback(() => {
    return [
      `Départ : ${from.trim()}`,
      `Arrivée : ${to.trim()}`,
      `Style : ${style}`,
      `Durée : ${durationDays} jour${durationDays > 1 ? 's' : ''}`,
    ].join('\n');
  }, [from, to, style, durationDays]);

  const generateItinerary = async () => {
    if (!formValid || rtLoading) return;
    const userText = buildUserSummary();
    const depart = from.trim();
    const arrivee = to.trim();
    setRtMessages((m) => [...m, { role: 'user', text: userText }]);
    setRtLoading(true);
    setNavRoute(null);
    try {
      const result = await fetchRoadTripPlannerFromForm({
        from: depart,
        to: arrivee,
        style,
        durationDays,
      });
      setRtMessages((m) => [...m, { role: 'assistant', text: result.chatText }]);
      setNavRoute({ from: depart, to: arrivee });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue';
      setRtMessages((m) => [...m, { role: 'assistant', text: `Impossible de générer l’itinéraire.\n\n${msg}` }]);
    } finally {
      setRtLoading(false);
    }
  };

  const openInGoogleMaps = useCallback(async () => {
    if (!navRoute) return;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(navRoute.from)}&destination=${encodeURIComponent(navRoute.to)}`;
    try {
      await Linking.openURL(url);
    } catch {
      // ignore
    }
  }, [navRoute]);

  const openInWaze = useCallback(async () => {
    if (!navRoute) return;
    const url = `https://waze.com/ul?q=${encodeURIComponent(navRoute.to)}&navigate=yes`;
    try {
      await Linking.openURL(url);
    } catch {
      // ignore
    }
  }, [navRoute]);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
        <ScrollView
          style={styles.pageScroll}
          contentContainerStyle={[styles.pageScrollContent, { paddingTop: Math.max(insets.top, 8) }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={['rgba(14,165,233,0.55)', 'rgba(15,23,42,0.95)', UI_THEME.bg]}
            locations={[0, 0.45, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.plannerBanner}
          >
            <View style={styles.plannerBannerIcon}>
              <MaterialCommunityIcons name="map-marker-path" size={32} color={UI_THEME.cyan} />
            </View>
            <Text style={styles.plannerBannerTitle}>Planificateur de Road Trip</Text>
            <Text style={styles.plannerBannerSub}>
              Renseignez votre départ, votre arrivée et la durée : l’IA propose un itinéraire clair, jour par jour.
            </Text>
          </LinearGradient>

          <View style={styles.formCard}>
            <Text style={styles.formLabel}>D’où partez-vous ?</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Ex. : Lyon"
              placeholderTextColor="#64748b"
              value={from}
              onChangeText={setFrom}
              editable={!rtLoading}
              autoCorrect={false}
            />

            <Text style={styles.formLabel}>Où allez-vous ?</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Ex. : Bretagne, Saint-Malo"
              placeholderTextColor="#64748b"
              value={to}
              onChangeText={setTo}
              editable={!rtLoading}
              autoCorrect={false}
            />

            <Text style={styles.formLabel}>Style de trajet</Text>
            <TouchableOpacity
              style={styles.selectRow}
              onPress={() => setStyleMenuOpen(true)}
              disabled={rtLoading}
              activeOpacity={0.85}
            >
              <Text style={styles.selectValue}>{style}</Text>
              <MaterialCommunityIcons name="chevron-down" size={22} color={UI_THEME.textMuted} />
            </TouchableOpacity>

            <Text style={styles.formLabel}>Durée du séjour (jours)</Text>
            <TextInput
              style={styles.formInput}
              placeholder="5"
              placeholderTextColor="#64748b"
              value={durationStr}
              onChangeText={setDurationStr}
              keyboardType="number-pad"
              editable={!rtLoading}
              maxLength={2}
            />

            <TouchableOpacity
              style={[styles.generateBtn, (!formValid || rtLoading) && styles.generateBtnDisabled]}
              onPress={() => void generateItinerary()}
              disabled={!formValid || rtLoading}
              activeOpacity={0.9}
            >
              <MaterialCommunityIcons name="auto-fix" size={20} color="#061018" />
              <Text style={styles.generateBtnText}>Générer mon itinéraire</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.chatSection}>
            <View style={styles.chatHeaderRow}>
              <MaterialCommunityIcons name="chat-processing-outline" size={22} color={UI_THEME.cyan} />
              <Text style={styles.chatSectionTitle}>Votre itinéraire</Text>
            </View>
            <Text style={styles.chatSectionSub}>Les réponses apparaissent ici, avec une section par jour.</Text>

            <View style={styles.chatList}>
              {rtMessages.map((item, i) => (
                <View key={`m-${i}`} style={styles.chatBubbleWrap}>
                  <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}>
                    <Text style={item.role === 'user' ? styles.bubbleUserText : styles.bubbleAssistantText}>{item.text}</Text>
                  </View>
                </View>
              ))}
              {rtLoading ? (
                <View style={styles.rtLoadingRow}>
                  <ActivityIndicator size="small" color={UI_THEME.cyan} />
                  <Text style={styles.rtLoadingText}>Génération de l’itinéraire…</Text>
                </View>
              ) : null}
            </View>

            {navRoute ? (
              <View style={styles.navDeepLinks}>
                <TouchableOpacity style={styles.mapsBtn} onPress={() => void openInGoogleMaps()} activeOpacity={0.9}>
                  <MaterialCommunityIcons name="map-marker-path" size={20} color="#061018" />
                  <Text style={styles.mapsBtnText}>Ouvrir dans Google Maps</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.wazeBtn} onPress={() => void openInWaze()} activeOpacity={0.9}>
                  <MaterialCommunityIcons name="navigation-variant" size={20} color="#061018" />
                  <Text style={styles.wazeBtnText}>Ouvrir dans Waze</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={styleMenuOpen} transparent animationType="fade" onRequestClose={() => setStyleMenuOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setStyleMenuOpen(false)} />
          <View style={styles.modalSheetWrap} pointerEvents="box-none">
            <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>Style de trajet</Text>
            {ROAD_TRIP_STYLE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.modalOption, opt === style && styles.modalOptionActive]}
                onPress={() => {
                  setStyle(opt);
                  setStyleMenuOpen(false);
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.modalOptionText, opt === style && styles.modalOptionTextActive]}>{opt}</Text>
                {opt === style ? <MaterialCommunityIcons name="check" size={20} color={UI_THEME.cyan} /> : null}
              </TouchableOpacity>
            ))}
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI_THEME.bg },
  safe: { flex: 1 },
  pageScroll: { flex: 1 },
  pageScrollContent: {
    paddingHorizontal: 10,
    paddingBottom: 24,
    flexGrow: 1,
  },
  plannerBanner: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 22,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,242,255,0.2)',
    overflow: 'hidden',
  },
  plannerBannerIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: UI_THEME.glass,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  plannerBannerTitle: {
    color: UI_THEME.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  plannerBannerSub: {
    color: UI_THEME.textMuted,
    fontSize: 13,
    marginTop: 8,
    lineHeight: 19,
  },
  formCard: {
    backgroundColor: UI_THEME.panelSoft,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
  },
  formLabel: {
    color: UI_THEME.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
    marginTop: 4,
  },
  formInput: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    color: '#e2e8f0',
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
  },
  selectValue: { color: '#e2e8f0', fontSize: 15, fontWeight: '700' },
  generateBtn: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: UI_THEME.cyan,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    columnGap: 8,
  },
  generateBtnDisabled: { opacity: 0.4 },
  generateBtnText: { color: '#061018', fontWeight: '900', fontSize: 14 },
  chatSection: {
    marginTop: 4,
    backgroundColor: UI_THEME.panelSoft,
    borderRadius: 16,
    padding: 12,
    minHeight: 200,
  },
  chatHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    marginBottom: 4,
  },
  chatSectionTitle: {
    color: UI_THEME.textSecondary,
    fontSize: 16,
    fontWeight: '900',
  },
  chatSectionSub: {
    color: UI_THEME.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  chatList: { paddingVertical: 4 },
  chatBubbleWrap: { marginBottom: 8 },
  bubble: {
    maxWidth: '96%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(0,233,245,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(0,233,245,0.35)',
  },
  bubbleAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
  },
  bubbleUserText: { color: '#e2e8f0', fontSize: 13, lineHeight: 20 },
  bubbleAssistantText: { color: '#cbd5e1', fontSize: 13, lineHeight: 20 },
  rtLoadingRow: { flexDirection: 'row', alignItems: 'center', columnGap: 8, paddingVertical: 6 },
  rtLoadingText: { color: '#94a3b8', fontSize: 12 },
  navDeepLinks: {
    marginTop: 12,
    gap: 10,
  },
  mapsBtn: {
    borderRadius: 12,
    backgroundColor: UI_THEME.cyan,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    columnGap: 8,
  },
  mapsBtnText: { color: '#061018', fontWeight: '900', fontSize: 13, letterSpacing: 0.2 },
  wazeBtn: {
    borderRadius: 12,
    backgroundColor: '#33CCFF',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    columnGap: 8,
  },
  wazeBtnText: { color: '#061018', fontWeight: '900', fontSize: 13, letterSpacing: 0.2 },
  modalRoot: {
    flex: 1,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalSheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
  },
  modalTitle: {
    color: UI_THEME.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 10,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  modalOptionActive: {
    backgroundColor: 'rgba(0,242,255,0.1)',
  },
  modalOptionText: { color: '#e2e8f0', fontSize: 16, fontWeight: '700' },
  modalOptionTextActive: { color: UI_THEME.cyan },
});
