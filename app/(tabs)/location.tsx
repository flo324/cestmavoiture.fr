import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PremiumHeroBanner } from '../../components/PremiumHeroBanner';
import { UI_THEME } from '../../constants/uiTheme';
import {
  buildGoogleMapsDirectionsUrl,
  fetchRoadTripPlanFromAI,
  geocodeRoadTripSteps,
} from '../../services/roadTripAI';

type Coords = { latitude: number; longitude: number; accuracy?: number | null; speed?: number | null };

type ChatMsg = { role: 'user' | 'assistant'; text: string };

function staticMapUrl(lat: number, lng: number, sizePx: number): string {
  const z = 14;
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${z}&size=${sizePx}x${sizePx}&maptype=mapnik`;
}

export default function LocationScreen() {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [address, setAddress] = useState('');

  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapImageErr, setMapImageErr] = useState(false);
  const [modalMapErr, setModalMapErr] = useState(false);

  const [rtMessages, setRtMessages] = useState<ChatMsg[]>([]);
  const [rtInput, setRtInput] = useState('');
  const [rtLoading, setRtLoading] = useState(false);
  const [rtPlan, setRtPlan] = useState<{
    title: string;
    geocoded: { name: string; label: string; latitude: number; longitude: number }[];
    tips?: string;
  } | null>(null);

  const previewSize = useMemo(() => Math.min(winW - 20, 340), [winW]);
  const mapUri = coords && !mapImageErr ? staticMapUrl(coords.latitude, coords.longitude, 800) : null;

  const loadPosition = useCallback(async () => {
    setLoading(true);
    setMapImageErr(false);
    setModalMapErr(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission GPS', 'Autorisez la localisation pour utiliser le GPS.');
        return;
      }
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const next: Coords = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        accuracy: current.coords.accuracy,
        speed: current.coords.speed,
      };
      setCoords(next);
      try {
        const rev = await Location.reverseGeocodeAsync({
          latitude: next.latitude,
          longitude: next.longitude,
        });
        const first = rev?.[0];
        if (first) {
          const city = [first.postalCode, first.city].filter(Boolean).join(' ');
          const street = [first.name, first.street].filter(Boolean).join(' ');
          setAddress([street, city, first.country].filter(Boolean).join(', '));
        } else {
          setAddress('');
        }
      } catch {
        setAddress('');
      }
    } catch {
      Alert.alert('GPS', "Impossible d'obtenir la position actuelle.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPosition();
  }, [loadPosition]);

  const sendRoadTrip = async () => {
    const text = rtInput.trim();
    if (!text || rtLoading) return;
    setRtInput('');
    setRtPlan(null);
    setRtMessages((m) => [...m, { role: 'user', text }]);
    setRtLoading(true);
    try {
      const ctx = coords
        ? `Position approximative: ${address || `${coords.latitude.toFixed(3)}, ${coords.longitude.toFixed(3)}`}`
        : 'Position GPS non disponible (l’itinéraire partira de la première étape).';
      const draft = await fetchRoadTripPlanFromAI(text, ctx);
      const geocoded = await geocodeRoadTripSteps(draft.steps);
      setRtPlan({ title: draft.title, geocoded, tips: draft.tips });
      const lines = geocoded.map((s, i) => `${i + 1}. ${s.name}`);
      const summary = [draft.title, '', ...lines, draft.tips ? `\n${draft.tips}` : ''].join('\n');
      setRtMessages((m) => [...m, { role: 'assistant', text: summary }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue';
      setRtMessages((m) => [...m, { role: 'assistant', text: `Impossible de préparer l’itinéraire.\n\n${msg}` }]);
    } finally {
      setRtLoading(false);
    }
  };

  const openRoadTripInMaps = async () => {
    if (!rtPlan?.geocoded.length) return;
    try {
      const url = buildGoogleMapsDirectionsUrl(rtPlan.geocoded, coords);
      const can = await Linking.canOpenURL(url);
      if (!can) {
        Alert.alert('Cartes', "Impossible d'ouvrir Google Maps.");
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Navigation', e instanceof Error ? e.message : 'Erreur');
    }
  };

  const renderChatItem = ({ item }: { item: ChatMsg }) => (
    <View style={styles.chatBubbleWrap}>
      <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={item.role === 'user' ? styles.bubbleUserText : styles.bubbleAssistantText}>{item.text}</Text>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
        <View style={[styles.page, { paddingTop: Math.max(insets.top, 8) }]}>
          <PremiumHeroBanner variant="gps" height={132}>
            <View style={styles.heroIconWrap}>
              <MaterialCommunityIcons name="crosshairs-gps" size={28} color={UI_THEME.cyan} />
            </View>
            <View style={styles.heroTitleRow}>
              <Text style={styles.heroTitle}>GPS</Text>
              <View style={styles.premiumBadge}>
                <Text style={styles.premiumBadgeText}>PREMIUM</Text>
              </View>
            </View>
            <Text style={styles.heroSubtitle}>Position précise, carte live et road trip assisté par IA</Text>
          </PremiumHeroBanner>

          <View style={styles.folderBlock}>
            <View style={styles.folderHeader}>
              <MaterialCommunityIcons name="map-marker" size={24} color="#f56565" />
              <Text style={styles.folderTitle}>Ma position</Text>
            </View>

            <Pressable
              style={[styles.mapSquare, { width: previewSize, height: previewSize }]}
              onPress={() => {
                if (!coords) return;
                setModalMapErr(false);
                setMapExpanded(true);
              }}
              disabled={!coords || loading}
            >
              {loading ? (
                <View style={styles.mapSquareInner}>
                  <ActivityIndicator color={UI_THEME.cyan} />
                  <Text style={styles.mapHint}>Signal GPS…</Text>
                </View>
              ) : coords ? (
                <>
                  {mapUri && !mapImageErr ? (
                    <Image
                      source={{ uri: mapUri }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                      onError={() => setMapImageErr(true)}
                    />
                  ) : (
                    <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />
                  )}
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.82)']}
                    style={styles.mapSquareBottomFade}
                  />
                  <View style={styles.mapPin} pointerEvents="none">
                    <MaterialCommunityIcons name="map-marker" size={36} color="#f56565" />
                  </View>
                  <View style={styles.mapSquareFooter}>
                    <Text style={styles.mapCoords} numberOfLines={1}>
                      {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                    </Text>
                    <Text style={styles.mapTapHint}>Appuyer pour agrandir</Text>
                  </View>
                </>
              ) : (
                <View style={styles.mapSquareInner}>
                  <MaterialCommunityIcons name="map-marker-off" size={40} color="#64748b" />
                  <Text style={styles.mapHint}>Position indisponible</Text>
                </View>
              )}
            </Pressable>

            <TouchableOpacity style={styles.refreshBtn} onPress={() => void loadPosition()} activeOpacity={0.9}>
              <MaterialCommunityIcons name="refresh" size={18} color="#061018" />
              <Text style={styles.refreshBtnText}>ACTUALISER GPS</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.rtSection}>
            <View style={styles.rtHeaderRow}>
              <MaterialCommunityIcons name="chat-processing-outline" size={22} color={UI_THEME.cyan} />
              <Text style={styles.rtSectionTitle}>Road trip IA</Text>
            </View>
            <Text style={styles.rtSectionSub}>
              Décrivez votre trajet : l’IA propose des étapes, puis ouvrez l’itinéraire dans Google Maps.
            </Text>
            {!coords ? <Text style={styles.rtHint}>Activez le GPS pour partir de votre position actuelle.</Text> : null}

            <TextInput
              style={styles.rtInputLarge}
              placeholder="Ex. : une semaine en Bretagne depuis Rennes, j’aime la côte"
              placeholderTextColor="#64748b"
              value={rtInput}
              onChangeText={setRtInput}
              multiline
              maxLength={800}
              editable={!rtLoading}
              {...(Platform.OS === 'android' ? { textAlignVertical: 'top' as const } : {})}
            />
            <TouchableOpacity
              style={[styles.rtSendWide, (!rtInput.trim() || rtLoading) && styles.rtSendDisabled]}
              onPress={() => void sendRoadTrip()}
              disabled={!rtInput.trim() || rtLoading}
              activeOpacity={0.9}
            >
              <MaterialCommunityIcons name="send" size={18} color="#061018" />
              <Text style={styles.rtSendWideText}>Envoyer à l’IA</Text>
            </TouchableOpacity>

            <FlatList
              data={rtMessages}
              keyExtractor={(_, i) => `m-${i}`}
              renderItem={renderChatItem}
              style={styles.chatList}
              contentContainerStyle={styles.chatListContent}
              ListFooterComponent={
                rtLoading ? (
                  <View style={styles.rtLoadingRow}>
                    <ActivityIndicator size="small" color={UI_THEME.cyan} />
                    <Text style={styles.rtLoadingText}>Préparation du trajet…</Text>
                  </View>
                ) : null
              }
            />

            {rtPlan && rtPlan.geocoded.length > 0 ? (
              <TouchableOpacity style={styles.rtMapsBtn} onPress={() => void openRoadTripInMaps()} activeOpacity={0.9}>
                <MaterialCommunityIcons name="navigation-variant" size={20} color="#061018" />
                <Text style={styles.rtMapsBtnText}>OUVRIR L’ITINÉRAIRE DANS GOOGLE MAPS</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </SafeAreaView>

      <Modal visible={mapExpanded} animationType="fade" transparent={false} onRequestClose={() => setMapExpanded(false)}>
        <SafeAreaView style={styles.modalSafe} edges={['top', 'left', 'right']}>
          <View style={styles.modalBody}>
            {coords && !modalMapErr ? (
              <Image
                source={{ uri: staticMapUrl(coords.latitude, coords.longitude, 1200) }}
                style={styles.modalMapFill}
                resizeMode="cover"
                onError={() => setModalMapErr(true)}
              />
            ) : (
              <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.modalMapFill} />
            )}
            <View style={styles.modalPinOverlay} pointerEvents="none">
              <MaterialCommunityIcons name="map-marker" size={48} color="#f56565" />
            </View>
            <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent']} style={styles.modalTopFade} />
            <TouchableOpacity style={[styles.modalClose, { top: insets.top + 8 }]} onPress={() => setMapExpanded(false)} activeOpacity={0.85}>
              <MaterialCommunityIcons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <View style={[styles.modalFooter, { paddingBottom: insets.bottom + 16 }]}>
              <Text style={styles.modalCoords}>
                {coords ? `${coords.latitude.toFixed(6)}  ·  ${coords.longitude.toFixed(6)}` : '—'}
              </Text>
              {address ? <Text style={styles.modalAddress}>{address}</Text> : null}
              {coords?.accuracy != null ? (
                <Text style={styles.modalMeta}>Précision ~ {Math.round(coords.accuracy)} m</Text>
              ) : null}
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI_THEME.bg },
  safe: { flex: 1 },
  page: {
    flex: 1,
    paddingHorizontal: 10,
  },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: UI_THEME.glass,
    borderWidth: 1,
    borderColor: UI_THEME.goldBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 10,
  },
  heroTitle: {
    color: UI_THEME.textPrimary,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  premiumBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: UI_THEME.goldBorder,
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  premiumBadgeText: {
    color: UI_THEME.gold,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  heroSubtitle: {
    color: UI_THEME.textMuted,
    fontSize: 12,
    marginTop: 6,
    lineHeight: 17,
    maxWidth: '100%',
  },
  folderBlock: {
    marginBottom: 10,
  },
  folderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    marginBottom: 10,
  },
  folderTitle: {
    color: UI_THEME.textSecondary,
    fontSize: 15,
    fontWeight: '800',
  },
  mapSquare: {
    alignSelf: 'center',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: UI_THEME.cyanBorder,
    backgroundColor: '#0f172a',
  },
  mapSquareInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    rowGap: 8,
  },
  mapSquareBottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '42%',
  },
  mapPin: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  mapSquareFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 24,
  },
  mapCoords: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  mapTapHint: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  mapHint: { color: UI_THEME.textMuted, fontSize: 12 },
  refreshBtn: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: UI_THEME.cyan,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    columnGap: 8,
  },
  refreshBtnText: { color: '#061018', fontWeight: '900', fontSize: 12, letterSpacing: 0.3 },
  rtSection: {
    flex: 1,
    minHeight: 0,
    marginTop: 8,
    backgroundColor: UI_THEME.panelSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 12,
  },
  rtHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    marginBottom: 4,
  },
  rtSectionTitle: {
    color: UI_THEME.textSecondary,
    fontSize: 16,
    fontWeight: '900',
  },
  rtSectionSub: {
    color: UI_THEME.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  rtHint: { color: '#a5b4fc', fontSize: 11, marginBottom: 6 },
  chatList: { flex: 1, minHeight: 60, marginTop: 8 },
  chatListContent: { paddingVertical: 6, flexGrow: 1 },
  chatBubbleWrap: { marginBottom: 8 },
  rtInputLarge: {
    minHeight: 132,
    maxHeight: 200,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#e2e8f0',
    fontSize: 14,
    lineHeight: 20,
  },
  rtSendWide: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: UI_THEME.cyan,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    columnGap: 8,
  },
  rtSendWideText: { color: '#061018', fontWeight: '900', fontSize: 13, letterSpacing: 0.2 },
  bubble: {
    maxWidth: '92%',
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
  bubbleUserText: { color: '#e2e8f0', fontSize: 13, lineHeight: 19 },
  bubbleAssistantText: { color: '#cbd5e1', fontSize: 13, lineHeight: 19 },
  rtLoadingRow: { flexDirection: 'row', alignItems: 'center', columnGap: 8, paddingVertical: 6 },
  rtLoadingText: { color: '#94a3b8', fontSize: 12 },
  rtSendDisabled: { opacity: 0.4 },
  rtMapsBtn: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: UI_THEME.cyan,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    columnGap: 8,
  },
  rtMapsBtnText: { color: '#061018', fontWeight: '900', fontSize: 11, letterSpacing: 0.2 },
  modalSafe: { flex: 1, backgroundColor: '#000' },
  modalBody: { flex: 1 },
  modalMapFill: { flex: 1, width: '100%' },
  modalPinOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 80,
  },
  modalTopFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 120,
  },
  modalClose: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(11,15,20,0.92)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    alignItems: 'center',
    paddingTop: 16,
  },
  modalCoords: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  modalAddress: {
    color: UI_THEME.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  modalMeta: { color: '#64748b', fontSize: 11, marginTop: 6, marginBottom: 4 },
});
