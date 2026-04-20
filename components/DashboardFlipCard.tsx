import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

type Props = {
  /** true = face « dos » (dossiers) */
  flipped: boolean;
  front: React.ReactNode;
  back: React.ReactNode;
};

/**
 * Retournement 3D (axe Y) — deux faces en absolute fill, backfaceVisibility.
 */
export function DashboardFlipCard({ flipped, front, back }: Props) {
  const rot = useSharedValue(0);

  useEffect(() => {
    rot.value = withTiming(flipped ? 180 : 0, {
      duration: 620,
      easing: Easing.out(Easing.cubic),
    });
  }, [flipped, rot]);

  const spin = useAnimatedStyle(() => ({
    transform: [{ perspective: 1400 }, { rotateY: `${rot.value}deg` }],
  }));

  return (
    <View style={styles.stage}>
      <Animated.View style={[styles.flipBox, spin]}>
        <View style={[styles.face, styles.front]} pointerEvents="box-none">
          {front}
        </View>
        <View style={[styles.face, styles.back]} pointerEvents="box-none">
          {back}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    overflow: 'hidden',
  },
  flipBox: {
    flex: 1,
    position: 'relative',
  },
  face: {
    ...StyleSheet.absoluteFillObject,
    backfaceVisibility: 'hidden',
    overflow: 'hidden',
  },
  front: {
    zIndex: 2,
  },
  back: {
    zIndex: 1,
    transform: [{ rotateY: '180deg' }],
  },
});
