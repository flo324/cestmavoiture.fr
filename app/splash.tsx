import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GarageConnectLogo } from '../components/GarageConnectLogo';

const SPLASH_MS = 2800;

export default function SplashScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const t = setTimeout(() => {
      router.replace('/(tabs)');
    }, SPLASH_MS);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Animated.View entering={FadeIn.duration(700)} style={styles.center}>
        <Animated.View entering={FadeInDown.delay(120).duration(900)}>
          <GarageConnectLogo size="hero" />
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(400).duration(800)}>
          <Text style={styles.title}>GARAGE</Text>
          <Text style={styles.titleAccent}>CONNECT</Text>
        </Animated.View>
        <Animated.View entering={FadeIn.delay(900).duration(600)}>
          <Text style={styles.tagline}>Votre atelier numérique</Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#05080c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { alignItems: 'center', paddingHorizontal: 24 },
  title: {
    marginTop: 28,
    fontSize: 28,
    fontWeight: '200',
    color: '#e2e8f0',
    letterSpacing: 14,
    textAlign: 'center',
  },
  titleAccent: {
    fontSize: 28,
    fontWeight: '900',
    color: '#00E9F5',
    letterSpacing: 8,
    textAlign: 'center',
    marginTop: 4,
  },
  tagline: {
    marginTop: 20,
    fontSize: 13,
    color: '#64748b',
    letterSpacing: 1,
  },
});
