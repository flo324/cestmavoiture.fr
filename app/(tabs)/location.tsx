import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PremiumHeroBanner } from '../../components/PremiumHeroBanner';
import { UI_THEME } from '../../constants/uiTheme';
import {
  buildGoogleMapsDirectionsUrl,
  fetchRoadTripPlanFromAI,
  geocodeRoadTripSteps,
} from '../../services/roadTripAI';
import { buildOrderedStops, fetchDrivingPath } from '../../services/googleDirections';
import { staticOsmMapUrl } from '../../services/mapStatic';

type Coords = { latitude: number; longitude: number; accuracy?: number | null; speed?: number | null };

type ChatMsg = { role: 'user' | 'assistant'; text: string };

export default function LocationScreen() {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const previewMapRef = useRef<MapView | null>(null);
  const modalMapRef = useRef<MapView | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [address, setAddress] = useState('');
  const [gpsLive, setGpsLive] = useState(false);

  const [mapExpanded, setMapExpanded] = useState(false);

  const [rtMessages, setRtMessages] = useState<ChatMsg[]>([]);
  const [rtInput, setRtInput] = useState('');
  const [rtLoading, setRtLoading] = useState(false);
  const [rtPlan, setRtPlan] = useState<{
    title: string;
    geocoded: { name: string; label: string; latitude: number; longitude: number }[];
    tips?: string;
  } | null>(null);
  const [mapBase, setMapBase] = useState<'standard' | 'satellite' | 'hybrid'>('standard');
  const [directionsPath, setDirectionsPath] = useState<{ latitude: number; longitude: number }[] | null>(null);
  const [directionsLoading, setDirectionsLoading] = useState(false);
  const coordsRef = useRef(coords);
  coordsRef.current = coords;

  const routeCoords = useMemo(
    () =>
      (rtPlan?.geocoded?.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
      })) ?? []) as { latitude: number; longitude: number }[],
    [rtPlan]
  );

  const straightLinePath = useMemo(() => {
    const pts: { latitude: number; longitude: number }[] = [];
    if (coords) pts.push({ latitude: coords.latitude, longitude: coords.longitude });
    rtPlan?.geocoded.forEach((g) => pts.push({ latitude: g.latitude, longitude: g.longitude }));
    return pts;
  }, [coords?.latitude, coords?.longitude, rtPlan]);

  const polylineCoords = useMemo(() => {
    if (directionsPath && directionsPath.length >= 2) return directionsPath;
    if (straightLinePath.length >= 2) return straightLinePath;
    return [] as { latitude: number; longitude: number }[];
  }, [directionsPath, straightLinePath]);

  useEffect(() => {
    if (!rtPlan?.geocoded?.length) {
      setDirectionsPath(null);
      setDirectionsLoading(false);
      return;
    }
    const c = coordsRef.current;
    const stops = buildOrderedStops(
      c ? { latitude: c.latitude, longitude: c.longitude } : null,
      rtPlan.geocoded.map((g) => ({ latitude: g.latitude, longitude: g.longitude }))
    );
    if (stops.length < 2) {
      setDirectionsPath(null);
      setDirectionsLoading(false);
      return;
    }
    let cancelled = false;
    setDirectionsLoading(true);
    void fetchDrivingPath(stops).then((path) => {
      if (cancelled) return;
      setDirectionsPath(path && path.length >= 2 ? path : null);
      setDirectionsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [rtPlan]);

  const previewSize = useMemo(
    () => Math.min(Math.floor(winW - 16), Math.floor(winH * 0.4), 340),
    [winW, winH]
  );
  const webMapPx = useMemo(() => Math.min(640, Math.max(280, Math.round(previewSize * 2))), [previewSize]);

  const startLiveTracking = useCallback(async () => {
    if (watchRef.current) return;
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 6,
          timeInterval: 3500,
        },
        (loc) => {
          setCoords({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy ?? null,
            speed: loc.coords.speed ?? null,
          });
        }
      );
      setGpsLive(true);
    } catch {
      setGpsLive(false);
    }
  }, []);

  const loadPosition = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (mode === 'initial') {
            Alert.alert('Permission GPS', 'Autorisez la localisation pour utiliser le GPS.');
          }
          return;
        }
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        const next: Coords = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          accuracy: current.coords.accuracy,
          speed: current.coords.speed,
        };
        setCoords(next);
        void startLiveTracking();
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
        if (mode === 'initial') {
          Alert.alert('GPS', "Impossible d'obtenir la position actuelle.");
        }
      } finally {
        if (mode === 'initial') setLoading(false);
        else setRefreshing(false);
      }
    },
    [startLiveTracking]
  );

  useEffect(() => {
    void loadPosition('initial');
  }, [loadPosition]);

  useEffect(() => {
    const pts: { latitude: number; longitude: number }[] = [];
    if (polylineCoords.length >= 2) pts.push(...polylineCoords);
    else if (straightLinePath.length >= 2) pts.push(...straightLinePath);
    else {
      if (routeCoords.length) pts.push(...routeCoords);
      if (coords) pts.push({ latitude: coords.latitude, longitude: coords.longitude });
    }
    if (pts.length === 0 && coords) pts.push({ latitude: coords.latitude, longitude: coords.longitude });
    if (pts.length === 0) return;

    const padPreview = { top: 12, right: 10, bottom: 36, left: 10 };
    const padModal = { top: 88, right: 16, bottom: 200, left: 16 };

    const run = () => {
      if (pts.length === 1) {
        const wide = routeCoords.length > 0;
        const r = {
          latitude: pts[0].latitude,
          longitude: pts[0].longitude,
          latitudeDelta: wide ? 0.2 : 0.008,
          longitudeDelta: wide ? 0.2 : 0.008,
        };
        previewMapRef.current?.animateToRegion(r, 420);
        modalMapRef.current?.animateToRegion(r, 420);
        return;
      }
      previewMapRef.current?.fitToCoordinates(pts, { edgePadding: padPreview, animated: true });
      modalMapRef.current?.fitToCoordinates(pts, { edgePadding: padModal, animated: true });
    };
    const t = setTimeout(run, polylineCoords.length >= 2 ? 420 : 320);
    return () => clearTimeout(t);
  }, [coords?.latitude, coords?.longitude, routeCoords, polylineCoords, straightLinePath]);

  useEffect(() => {
    return () => {
      watchRef.current?.remove();
      watchRef.current = null;
      setGpsLive(false);
    };
  }, []);

  const sendRoadTrip = async () => {
    const text = rtInput.trim();
    if (!text || rtLoading) return;
    setRtInput('');
    setRtPlan(null);
    setDirectionsPath(null);
    setDirectionsLoading(false);
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

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
        <ScrollView
          style={styles.pageScroll}
          contentContainerStyle={[styles.pageScrollContent, { paddingTop: Math.max(insets.top, 8) }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadPosition('refresh')}
              tintColor={UI_THEME.cyan}
              colors={[UI_THEME.cyan]}
            />
          }
        >
          <PremiumHeroBanner variant="gps" height={108}>
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
              {gpsLive && coords ? (
                <View style={styles.gpsLivePill}>
                  <View style={styles.gpsLiveDot} />
                  <Text style={styles.gpsLiveText}>GPS actif</Text>
                </View>
              ) : null}
            </View>

            <View style={[styles.mapSquare, { width: previewSize, height: previewSize }]}>
              {loading && !coords ? (
                <View style={styles.mapSquareInner}>
                  <ActivityIndicator color={UI_THEME.cyan} />
                  <Text style={styles.mapHint}>Signal GPS…</Text>
                </View>
              ) : coords ? (
                Platform.OS === 'web' ? (
                  <>
                    <Image
                      source={{ uri: staticOsmMapUrl(coords.latitude, coords.longitude, webMapPx) }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.82)']}
                      style={styles.mapSquareBottomFade}
                    />
                    <View style={styles.mapSquareFooter} pointerEvents="none">
                      <Text style={styles.mapCoords} numberOfLines={1}>
                        {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                      </Text>
                      <Text style={styles.mapTapHint}>Carte statique (web)</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <MapView
                      ref={previewMapRef}
                      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                      style={StyleSheet.absoluteFill}
                      initialRegion={{
                        latitude: coords.latitude,
                        longitude: coords.longitude,
                        latitudeDelta: 0.006,
                        longitudeDelta: 0.006,
                      }}
                      mapType={mapBase}
                      showsUserLocation={!!coords}
                      showsMyLocationButton={false}
                      scrollEnabled
                      zoomEnabled
                      rotateEnabled
                      pitchEnabled={false}
                      loadingEnabled
                      onPress={() => setMapExpanded(true)}
                    >
                      {polylineCoords.length >= 2 ? (
                        <Polyline
                          coordinates={polylineCoords}
                          strokeWidth={4}
                          strokeColor="rgba(0,233,245,0.92)"
                          lineCap="round"
                          lineJoin="round"
                        />
                      ) : null}
                      {rtPlan?.geocoded.map((s, i) => (
                        <Marker
                          key={`pv-w-${i}`}
                          coordinate={{ latitude: s.latitude, longitude: s.longitude }}
                          title={`${i + 1}. ${s.name}`}
                          pinColor="#22d3ee"
                        />
                      ))}
                    </MapView>
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.82)']}
                      style={styles.mapSquareBottomFade}
                      pointerEvents="none"
                    />
                    <View style={styles.mapSquareFooter} pointerEvents="none">
                      <Text style={styles.mapCoords} numberOfLines={1}>
                        {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                      </Text>
                      <Text style={styles.mapTapHint}>Pincer pour zoom · appui pour plein écran</Text>
                    </View>
                  </>
                )
              ) : (
                <View style={styles.mapSquareInner}>
                  <MaterialCommunityIcons name="map-marker-off" size={40} color="#64748b" />
                  <Text style={styles.mapHint}>Position indisponible</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.rtSection}>
            <View style={styles.rtHeaderRow}>
              <MaterialCommunityIcons name="chat-processing-outline" size={22} color={UI_THEME.cyan} />
              <Text style={styles.rtSectionTitle}>Road trip IA</Text>
            </View>
            <Text style={styles.rtSectionSub}>
              Décrivez votre trajet : l’IA propose des étapes, puis un tracé routier (Google Directions) s’affiche sur la
              carte quand la clé API autorise l’API Directions ; sinon ligne droite entre les points.
            </Text>
            {directionsLoading ? (
              <View style={styles.directionsLoadingRow}>
                <ActivityIndicator size="small" color={UI_THEME.cyan} />
                <Text style={styles.directionsLoadingText}>Calcul de l’itinéraire routier…</Text>
              </View>
            ) : null}
            {!coords ? <Text style={styles.rtHint}>Activez le GPS pour partir de votre position actuelle.</Text> : null}

            <TextInput
              style={[styles.rtInputLarge, { maxHeight: Math.min(120, Math.round(winH * 0.14)) }]}
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
                  <Text style={styles.rtLoadingText}>Préparation du trajet…</Text>
                </View>
              ) : null}
            </View>

            {rtPlan && rtPlan.geocoded.length > 0 ? (
              <TouchableOpacity style={styles.rtMapsBtn} onPress={() => void openRoadTripInMaps()} activeOpacity={0.9}>
                <MaterialCommunityIcons name="navigation-variant" size={20} color="#061018" />
                <Text style={styles.rtMapsBtnText}>OUVRIR L’ITINÉRAIRE DANS GOOGLE MAPS</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={mapExpanded} animationType="fade" transparent={false} onRequestClose={() => setMapExpanded(false)}>
        <SafeAreaView style={styles.modalSafe} edges={['top', 'left', 'right']}>
          <View style={styles.modalBody}>
            {coords && Platform.OS !== 'web' ? (
              <MapView
                ref={modalMapRef}
                provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                style={styles.modalMapFill}
                initialRegion={{
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                  latitudeDelta: 0.006,
                  longitudeDelta: 0.006,
                }}
                mapType={mapBase}
                showsUserLocation
                showsMyLocationButton
                rotateEnabled
                pitchEnabled
                loadingEnabled
              >
                {polylineCoords.length >= 2 ? (
                  <Polyline
                    coordinates={polylineCoords}
                    strokeWidth={5}
                    strokeColor="rgba(0,233,245,0.95)"
                    lineCap="round"
                    lineJoin="round"
                  />
                ) : null}
                {rtPlan?.geocoded.map((s, i) => (
                  <Marker
                    key={`md-w-${i}`}
                    coordinate={{ latitude: s.latitude, longitude: s.longitude }}
                    title={`${i + 1}. ${s.name}`}
                    pinColor="#22d3ee"
                  />
                ))}
              </MapView>
            ) : coords ? (
              <Image
                source={{ uri: staticOsmMapUrl(coords.latitude, coords.longitude, 1200, 14) }}
                style={styles.modalMapFill}
                resizeMode="cover"
              />
            ) : (
              <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.modalMapFill} />
            )}
            <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent']} style={styles.modalTopFade} />
            <View style={[styles.modalMapModeRow, { top: insets.top + 52 }]} pointerEvents="box-none">
              {(['standard', 'satellite', 'hybrid'] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setMapBase(m)}
                  style={[styles.modalMapChip, mapBase === m ? styles.modalMapChipActive : null]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.modalMapChipText, mapBase === m ? styles.modalMapChipTextActive : null]}>
                    {m === 'standard' ? 'Plan' : m === 'satellite' ? 'Satellite' : 'Mixte'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
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
  pageScroll: { flex: 1 },
  pageScrollContent: {
    paddingHorizontal: 10,
    paddingBottom: 14,
    flexGrow: 1,
  },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: UI_THEME.glass,
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
    backgroundColor: 'rgba(212,175,55,0.22)',
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
    marginBottom: 8,
  },
  folderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 6,
    marginBottom: 8,
  },
  gpsLivePill: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.14)',
  },
  gpsLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  gpsLiveText: {
    color: '#86efac',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
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
  rtSection: {
    marginTop: 6,
    backgroundColor: UI_THEME.panelSoft,
    borderRadius: 16,
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
  directionsLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    marginBottom: 8,
  },
  directionsLoadingText: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  chatList: { marginTop: 8, paddingVertical: 4 },
  chatBubbleWrap: { marginBottom: 8 },
  rtInputLarge: {
    minHeight: 80,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  modalTopFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 120,
  },
  modalMapModeRow: {
    position: 'absolute',
    left: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    zIndex: 9,
  },
  modalMapChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
  },
  modalMapChipActive: {
    backgroundColor: 'rgba(0,233,245,0.22)',
    borderColor: 'rgba(0,233,245,0.55)',
  },
  modalMapChipText: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '800',
  },
  modalMapChipTextActive: {
    color: '#ecfeff',
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
