import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

type LogoSize = 'sm' | 'md' | 'lg' | 'hero';

const DIM: Record<LogoSize, { box: number; font: number; gap: number; radius: number }> = {
  sm: { box: 32, font: 17, gap: 4, radius: 8 },
  md: { box: 44, font: 23, gap: 6, radius: 11 },
  lg: { box: 64, font: 34, gap: 8, radius: 14 },
  hero: { box: 96, font: 50, gap: 12, radius: 18 },
};

const defaultAnimated = (size: LogoSize) => size === 'hero' || size === 'lg';

/**
 * Monogramme OT : deux blocs miroir (dégradés inversés).
 * @param animated — Roulement + léger choc puis retour côte à côte (défaut : hero/lg uniquement).
 */
export function OttoLogo({
  size = 'md',
  showWordmark = false,
  animated: animatedProp,
}: {
  size?: LogoSize;
  /** Affiche « OT » + « TO » (OTTO) sous le sigle (ex. splash) */
  showWordmark?: boolean;
  animated?: boolean;
}) {
  const d = DIM[size];
  const animated = animatedProp ?? defaultAnimated(size);

  const oRotate = useSharedValue(0);
  const tRotate = useSharedValue(0);
  const oTx = useSharedValue(0);
  const tTx = useSharedValue(0);
  const wordOpacity = useSharedValue(showWordmark && animated ? 0 : 1);

  useEffect(() => {
    if (!animated) {
      oRotate.value = 0;
      tRotate.value = 0;
      oTx.value = 0;
      tTx.value = 0;
      wordOpacity.value = 1;
      return;
    }

    const rollMs = 560;
    const bumpMs = 75;
    const easeOut = Easing.bezier(0.22, 0.99, 0.36, 1);

    oRotate.value = -34;
    tRotate.value = 34;
    oTx.value = -18;
    tTx.value = 18;

    oRotate.value = withSequence(
      withTiming(-10, { duration: rollMs, easing: easeOut }),
      withTiming(5, { duration: bumpMs, easing: Easing.out(Easing.quad) }),
      withSpring(0, { damping: 14, stiffness: 220, mass: 0.65 })
    );
    tRotate.value = withSequence(
      withTiming(10, { duration: rollMs, easing: easeOut }),
      withTiming(-5, { duration: bumpMs, easing: Easing.out(Easing.quad) }),
      withSpring(0, { damping: 14, stiffness: 220, mass: 0.65 })
    );
    oTx.value = withSequence(
      withTiming(-5, { duration: rollMs, easing: easeOut }),
      withTiming(4, { duration: bumpMs, easing: Easing.out(Easing.quad) }),
      withSpring(0, { damping: 16, stiffness: 260 })
    );
    tTx.value = withSequence(
      withTiming(5, { duration: rollMs, easing: easeOut }),
      withTiming(-4, { duration: bumpMs, easing: Easing.out(Easing.quad) }),
      withSpring(0, { damping: 16, stiffness: 260 })
    );

    if (showWordmark) {
      wordOpacity.value = 0;
      wordOpacity.value = withDelay(
        780,
        withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) })
      );
    }
  }, [animated, showWordmark]);

  const oStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: oTx.value }, { rotate: `${oRotate.value}deg` }],
  }));

  const tStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tTx.value }, { rotate: `${tRotate.value}deg` }],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordOpacity.value,
  }));

  const blockSize = {
    width: d.box,
    height: d.box * 1.05,
    borderRadius: d.radius,
  };

  const gradientFill = { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const };

  const outerAnimated = [blockSize, styles.blockShadow, { overflow: 'hidden' as const }];

  return (
    <View style={styles.wrap}>
      <View style={[styles.row, { gap: d.gap }]}>
        {animated ? (
          <>
            <Animated.View style={[oStyle, outerAnimated]}>
              <LinearGradient
                colors={['#5FF4FF', '#00E9F5', '#00A8B8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.block, gradientFill]}
              >
                <Text style={[styles.letter, { fontSize: d.font }]}>O</Text>
              </LinearGradient>
            </Animated.View>
            <Animated.View style={[tStyle, outerAnimated]}>
              <LinearGradient
                colors={['#00A8B8', '#00E9F5', '#5FF4FF']}
                start={{ x: 1, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={[styles.block, gradientFill]}
              >
                <Text style={[styles.letter, { fontSize: d.font }]}>T</Text>
              </LinearGradient>
            </Animated.View>
          </>
        ) : (
          <>
            <LinearGradient
              colors={['#5FF4FF', '#00E9F5', '#00A8B8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.block, blockSize, styles.blockShadow]}
            >
              <Text style={[styles.letter, { fontSize: d.font }]}>O</Text>
            </LinearGradient>
            <LinearGradient
              colors={['#00A8B8', '#00E9F5', '#5FF4FF']}
              start={{ x: 1, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[styles.block, blockSize, styles.blockShadow]}
            >
              <Text style={[styles.letter, { fontSize: d.font }]}>T</Text>
            </LinearGradient>
          </>
        )}
      </View>
      {showWordmark ? (
        <Animated.View style={[styles.wordmark, wordmarkStyle]}>
          <View style={styles.wordmarkRow}>
            <Text style={styles.wTop}>OT</Text>
            <Text style={styles.wBottom}>TO</Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  blockShadow: {
    shadowColor: '#00E9F5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  block: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  letter: {
    fontWeight: '900',
    color: '#061018',
    letterSpacing: -1,
  },
  wordmark: { marginTop: 14, alignItems: 'center' },
  wordmarkRow: { flexDirection: 'row', alignItems: 'baseline' },
  wTop: {
    fontSize: 22,
    fontWeight: '200',
    color: '#e2e8f0',
    letterSpacing: 4,
  },
  wBottom: {
    fontSize: 22,
    fontWeight: '800',
    color: '#00E9F5',
    letterSpacing: 4,
    marginLeft: 2,
  },
});
