import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useRef } from 'react';
import { Animated, Platform, type ViewStyle } from 'react-native';

/**
 * Rebond « premium » à chaque focus d’onglet : léger glissement + ressort, haptique discret sur iOS.
 */
export function usePremiumTabEntrance(): { animatedStyle: Animated.WithAnimatedObject<ViewStyle> } {
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'ios') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      scale.setValue(0.93);
      translateY.setValue(16);
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          friction: 3.8,
          tension: 88,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          friction: 4.2,
          tension: 96,
          useNativeDriver: true,
        }),
      ]).start();
    }, [scale, translateY])
  );

  const animatedStyle: Animated.WithAnimatedObject<ViewStyle> = {
    flex: 1,
    transform: [{ translateY }, { scale }],
  };
  return { animatedStyle };
}
