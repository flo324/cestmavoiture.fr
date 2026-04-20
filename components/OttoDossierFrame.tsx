import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { User } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from 'react-native-svg';

import { userSetItem } from '../services/userStorage';

const RETURN_TO_FOLDERS_FLAG = '@otto_open_folders_on_return';
const SCREEN_H = Dimensions.get('window').height;
const FLIP_STAGE_MIN_H = Math.min(Math.max(SCREEN_H * 0.5, 400), 560);

type OttoDossierFrameProps = {
  children: React.ReactNode;
};

export function OttoDossierFrame({ children }: OttoDossierFrameProps) {
  const router = useRouter();
  const scanArcSpin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    scanArcSpin.setValue(0);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scanArcSpin, {
        toValue: 0.55,
        duration: 520,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(scanArcSpin, {
        toValue: 1,
        duration: 980,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [scanArcSpin]);

  const scanArcSpinStyle = useMemo(
    () => ({
      transform: [
        {
          rotate: scanArcSpin.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '360deg'],
          }),
        },
      ],
    }),
    [scanArcSpin]
  );

  const goFolders = () => {
    void userSetItem(RETURN_TO_FOLDERS_FLAG, '1');
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safeRoot} edges={['top', 'left', 'right', 'bottom']}>
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', 'rgba(85, 204, 255, 0.06)', 'rgba(5, 10, 18, 0.98)']}
        locations={[0, 0.45, 1]}
        style={styles.bgGlow}
      />

      <View style={styles.layer}>
        <View style={styles.mainColumn}>
          <View style={styles.topBar}>
            <View style={styles.logoWrap}>
              <Text style={styles.logoOttoBase}>OTTO</Text>
              <Text style={styles.logoOtto}>OTTO</Text>
              <Text style={styles.logoOttoShine}>OTTO</Text>
              <View style={styles.logoCutOne} pointerEvents="none" />
              <View style={styles.logoCutTwo} pointerEvents="none" />
              <View style={styles.logoCutThree} pointerEvents="none" />
            </View>

            <Pressable
              style={({ pressed }) => [styles.profilBtn, pressed && styles.profilBtnPressed]}
              onPress={() => {
                void Haptics.selectionAsync();
                router.push('/profil');
              }}
            >
              <View style={styles.profilAvatar}>
                <User size={20} color="#e2e8f0" />
              </View>
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
              <Text style={styles.profilLabel}>Profil</Text>
            </Pressable>
          </View>

          <View style={styles.cardSection}>
            <View style={styles.flipStage}>
              <View style={styles.whiteCard}>
              <View style={styles.cardHeader}>
                <Pressable
                  onPress={goFolders}
                  style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
                >
                  <MaterialCommunityIcons name="arrow-left" size={18} color="#0f172a" />
                  <Text style={styles.backTxt}>DOSSIERS</Text>
                </Pressable>
              </View>
              <View style={styles.cardBody}>{children}</View>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.dock} pointerEvents="box-none">
          <Pressable
            style={({ pressed }) => [styles.scanFab, pressed && styles.scanFabPressed]}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/scan');
            }}
          >
            <Svg style={styles.scanFabGradient} pointerEvents="none" viewBox="0 0 100 100">
              <Defs>
                <RadialGradient id="scanFlashDossier" cx="50%" cy="42%" rx="60%" ry="60%">
                  <Stop offset="0%" stopColor="#1f6eff" stopOpacity="1" />
                  <Stop offset="58%" stopColor="#2f8dff" stopOpacity="1" />
                  <Stop offset="86%" stopColor="#59c7ff" stopOpacity="0.95" />
                  <Stop offset="100%" stopColor="#8de8ff" stopOpacity="0.95" />
                </RadialGradient>
              </Defs>
              <Circle cx="50" cy="50" r="50" fill="url(#scanFlashDossier)" />
              <Circle cx="50" cy="50" r="39" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.2" />
              <Circle cx="50" cy="50" r="30" fill="none" stroke="rgba(8,17,35,0.24)" strokeWidth="1.6" />
              <Circle cx="50" cy="50" r="11" fill="rgba(15,23,42,0.2)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.4" />
              <Line x1="50" y1="22" x2="50" y2="39" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" />
              <Line x1="31" y1="56" x2="43" y2="50" stroke="rgba(255,255,255,0.42)" strokeWidth="2" strokeLinecap="round" />
              <Line x1="69" y1="56" x2="57" y2="50" stroke="rgba(255,255,255,0.42)" strokeWidth="2" strokeLinecap="round" />
            </Svg>
            <Animated.View style={[styles.scanRimArcLayer, scanArcSpinStyle]} pointerEvents="none">
              <Svg width={94} height={94} viewBox="0 0 94 94">
                <Circle
                  cx="47"
                  cy="47"
                  r="43"
                  fill="none"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="1"
                />
                <Circle
                  cx="47"
                  cy="47"
                  r="43"
                  fill="none"
                  stroke="rgba(125,211,252,0.92)"
                  strokeWidth="1.85"
                  strokeLinecap="round"
                  strokeDasharray="40 248"
                />
                <Circle
                  cx="47"
                  cy="47"
                  r="41"
                  fill="none"
                  stroke="rgba(255,255,255,0.42)"
                  strokeWidth="1.05"
                  strokeLinecap="round"
                  strokeDasharray="14 256"
                />
              </Svg>
            </Animated.View>
            <Text style={styles.scanFabLetter}>O</Text>
          </Pressable>
          <View style={styles.scanDockCard}>
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(255,255,255,0.24)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0)']}
              locations={[0, 0.45, 1]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={styles.scanDockSheen}
            />
            <Text style={styles.scanCaption}>OTTO SCAN</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeRoot: { flex: 1, backgroundColor: '#0b1220' },
  bgGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  layer: { flex: 1, position: 'relative' },
  mainColumn: { flex: 1, minHeight: 0, paddingHorizontal: 16 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  logoWrap: { position: 'relative', alignSelf: 'flex-start', justifyContent: 'center' },
  logoOttoBase: {
    fontSize: 34,
    fontWeight: '900',
    color: '#3e7eb8',
    letterSpacing: 3.6,
    fontStyle: 'italic',
    textShadowColor: 'rgba(120, 190, 255, 0.20)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  logoOtto: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 34,
    fontWeight: '900',
    color: '#88d9ff',
    letterSpacing: 3.4,
    fontStyle: 'italic',
    textShadowColor: 'rgba(55, 176, 255, 0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 9,
  },
  logoOttoShine: {
    position: 'absolute',
    top: -1,
    left: 1,
    fontSize: 34,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: 3.4,
    fontStyle: 'italic',
    textShadowColor: 'rgba(125,211,252,0.95)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  logoCutOne: {
    position: 'absolute',
    top: 12,
    left: 18,
    width: 20,
    height: 2.2,
    borderRadius: 2,
    backgroundColor: '#1f4f7f',
    transform: [{ rotate: '-22deg' }],
    opacity: 0.95,
  },
  logoCutTwo: {
    position: 'absolute',
    top: 18,
    left: 61,
    width: 20,
    height: 2.2,
    borderRadius: 2,
    backgroundColor: '#1f4f7f',
    transform: [{ rotate: '-22deg' }],
    opacity: 0.95,
  },
  logoCutThree: {
    position: 'absolute',
    top: 12,
    left: 102,
    width: 19,
    height: 2.2,
    borderRadius: 2,
    backgroundColor: '#1f4f7f',
    transform: [{ rotate: '-22deg' }],
    opacity: 0.95,
  },
  profilBtn: { alignItems: 'center' },
  profilBtnPressed: { opacity: 0.88 },
  profilAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(148,163,184,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  proBadge: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#0f172a',
  },
  proBadgeText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  profilLabel: { marginTop: 4, color: '#f8fafc', fontSize: 11, fontWeight: '700' },
  cardSection: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'flex-start',
    paddingTop: 8,
    paddingBottom: 0,
  },
  flipStage: {
    flex: 1,
    minHeight: FLIP_STAGE_MIN_H,
    width: '100%',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  whiteCard: {
    backgroundColor: '#ffffff',
    borderRadius: 40,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    flex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 10,
  },
  cardHeader: {
    paddingBottom: 6,
  },
  backBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: 'rgba(14,165,233,0.2)',
  },
  backBtnPressed: { opacity: 0.86 },
  backTxt: {
    color: '#0f172a',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  cardBody: {
    flex: 1,
    paddingBottom: 10,
  },
  dock: {
    marginTop: 12,
    height: 145,
    marginHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  scanDockCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 50,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: 'rgba(8, 17, 35, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(93, 173, 255, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  scanDockSheen: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.95,
  },
  scanFab: {
    position: 'absolute',
    top: -7,
    width: 94,
    height: 94,
    borderRadius: 47,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2c86ff',
    overflow: 'hidden',
    zIndex: 2,
    shadowColor: '#3b9dff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 30,
    elevation: 28,
  },
  scanFabGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  scanRimArcLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFabLetter: {
    color: '#ffffff',
    fontSize: 44,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 1.2,
    textShadowColor: 'rgba(125,211,252,0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 9,
    marginTop: -2,
  },
  scanFabPressed: { opacity: 0.97, transform: [{ scale: 0.985 }] },
  scanCaption: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 4,
    textShadowColor: 'rgba(125,211,252,0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
});
