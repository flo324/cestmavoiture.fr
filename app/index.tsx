import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ONBOARDING_STATUS_KEY, type OnboardingStatus } from '../constants/onboarding';
import { GarageConnectLogo } from '../components/GarageConnectLogo';
import { useAuth } from '../context/AuthContext';
import { userGetItem } from '../services/userStorage';

/**
 * Point d'entrée : charge la session, puis connexion ou animation d'accueil.
 */
export default function GateScreen() {
  const { isReady, isLoggedIn } = useAuth();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [isOnboardingDone, setIsOnboardingDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isReady || !isLoggedIn) {
        if (!cancelled) {
          setIsOnboardingDone(false);
          setOnboardingChecked(true);
        }
        return;
      }
      try {
        const raw = await userGetItem(ONBOARDING_STATUS_KEY);
        if (!raw) {
          if (!cancelled) setIsOnboardingDone(false);
          return;
        }
        const parsed = JSON.parse(raw) as Partial<OnboardingStatus>;
        if (!cancelled) setIsOnboardingDone(Boolean(parsed?.completed || parsed?.skipped));
      } catch {
        if (!cancelled) setIsOnboardingDone(false);
      } finally {
        if (!cancelled) setOnboardingChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isReady, isLoggedIn]);

  if (!isReady || (isLoggedIn && !onboardingChecked)) {
    return (
      <View style={styles.boot}>
        <Animated.View entering={FadeIn.duration(280)}>
          <GarageConnectLogo size="lg" animated={false} />
        </Animated.View>
      </View>
    );
  }

  if (!isLoggedIn) {
    return <Redirect href="/login" />;
  }

  if (!isOnboardingDone) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/splash" />;
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: '#0b0f14',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
