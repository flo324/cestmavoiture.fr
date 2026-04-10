import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/** Courbe type Material / premium */
const PREMIUM_EASING = Easing.bezier(0.4, 0, 0.2, 1);

const BOX = 96;
const GAP = 12;
const FONT = 50;
const RADIUS = 18;
/** Assez grand pour couvrir l’écran une fois mis à l’échelle */
const EXPLODE_SCALE = 36;

type Props = {
  active: boolean;
  isLight: boolean;
  onComplete: () => void;
};

/**
 * Overlay plein écran : G / C au centre, pop-in puis zoom massif + flash blanc, puis callback.
 */
export function LoginExitTransition({ active, isLight, onComplete }: Props) {
  const scale = useSharedValue(0);
  const flashOpacity = useSharedValue(0);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!active) {
      hasStarted.current = false;
      scale.value = 0;
      flashOpacity.value = 0;
      return;
    }
    if (hasStarted.current) return;
    hasStarted.current = true;

    requestAnimationFrame(() => {
      scale.value = withSequence(
        withTiming(1, { duration: 240, easing: PREMIUM_EASING }),
        withTiming(EXPLODE_SCALE, { duration: 680, easing: PREMIUM_EASING })
      );
      flashOpacity.value = withDelay(
        520,
        withTiming(1, { duration: 320, easing: PREMIUM_EASING }, (finished) => {
          if (finished) {
            // Court palier blanc puis navigation au frame suivant pour éviter le « saut » visuel.
            runOnJS(onComplete)();
          }
        })
      );
    });
  }, [active, onComplete, scale, flashOpacity]);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const flashAnimatedStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  if (!active) {
    return null;
  }

  const bg = isLight ? '#f5f8fc' : '#0b0f14';

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: bg }]} />
      <Animated.View style={[styles.centerBlock, logoAnimatedStyle]}>
        <View style={[styles.row, { gap: GAP }]}>
          <LinearGradient
            colors={['#5FF4FF', '#00E9F5', '#00A8B8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.block, { width: BOX, height: BOX * 1.05, borderRadius: RADIUS }]}
          >
            <Text style={[styles.letter, { fontSize: FONT }]}>G</Text>
          </LinearGradient>
          <LinearGradient
            colors={['#00A8B8', '#00E9F5', '#5FF4FF']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.block, { width: BOX, height: BOX * 1.05, borderRadius: RADIUS }]}
          >
            <Text style={[styles.letterMirror, { fontSize: FONT }]}>C</Text>
          </LinearGradient>
        </View>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: '#ffffff' }, flashAnimatedStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    elevation: 2000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerBlock: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  block: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#00E9F5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  letter: {
    fontWeight: '900',
    color: '#061018',
    letterSpacing: -1,
  },
  letterMirror: {
    fontWeight: '900',
    color: '#061018',
    letterSpacing: -1,
    transform: [{ scaleX: -1 }],
  },
});
