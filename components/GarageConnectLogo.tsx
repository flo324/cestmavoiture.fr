import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type LogoSize = 'sm' | 'md' | 'lg' | 'hero';

const DIM: Record<LogoSize, { box: number; font: number; gap: number; radius: number }> = {
  sm: { box: 32, font: 17, gap: 4, radius: 8 },
  md: { box: 44, font: 23, gap: 6, radius: 11 },
  lg: { box: 64, font: 34, gap: 8, radius: 14 },
  hero: { box: 96, font: 50, gap: 12, radius: 18 },
};

/**
 * Monogramme GC en symétrie : deux blocs miroir (dégradés inversés), C retourné pour équilibre visuel.
 */
export function GarageConnectLogo({
  size = 'md',
  showWordmark = false,
}: {
  size?: LogoSize;
  /** Affiche « GARAGE » / « CONNECT » sous le sigle (ex. splash) */
  showWordmark?: boolean;
}) {
  const d = DIM[size];

  return (
    <View style={styles.wrap}>
      <View style={[styles.row, { gap: d.gap }]}>
        <LinearGradient
          colors={['#5FF4FF', '#00E9F5', '#00A8B8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.block,
            {
              width: d.box,
              height: d.box * 1.05,
              borderRadius: d.radius,
            },
          ]}
        >
          <Text style={[styles.letter, { fontSize: d.font }]}>G</Text>
        </LinearGradient>
        <LinearGradient
          colors={['#00A8B8', '#00E9F5', '#5FF4FF']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[
            styles.block,
            {
              width: d.box,
              height: d.box * 1.05,
              borderRadius: d.radius,
            },
          ]}
        >
          <Text style={[styles.letterMirror, { fontSize: d.font }]}>C</Text>
        </LinearGradient>
      </View>
      {showWordmark ? (
        <View style={styles.wordmark}>
          <Text style={styles.wTop}>GARAGE</Text>
          <Text style={styles.wBottom}>CONNECT</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
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
  /** Symétrie : lettre C inversée horizontalement pour rappeler un pare-chocs / crochet miroir */
  letterMirror: {
    fontWeight: '900',
    color: '#061018',
    letterSpacing: -1,
    transform: [{ scaleX: -1 }],
  },
  wordmark: { marginTop: 14, alignItems: 'center' },
  wTop: {
    fontSize: 22,
    fontWeight: '200',
    color: '#e2e8f0',
    letterSpacing: 10,
  },
  wBottom: {
    fontSize: 22,
    fontWeight: '800',
    color: '#00E9F5',
    letterSpacing: 6,
    marginTop: 2,
  },
});
