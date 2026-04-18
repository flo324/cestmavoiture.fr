import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  type LayoutChangeEvent,
  StyleSheet,
  type ViewStyle,
  useWindowDimensions,
  View,
} from 'react-native';
import { UI_THEME } from '../constants/uiTheme';

export type PremiumHeroVariant =
  | 'gps'
  | 'km'
  | 'docs'
  | 'diagnostics'
  | 'ct'
  | 'entretien'
  | 'entretien_pneus';

const VARIANTS: Record<
  PremiumHeroVariant,
  { uri: string; grad: [string, string, string]; locations: [number, number, number] }
> = {
  gps: {
    uri: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=2000&q=78',
    grad: ['rgba(18,95,110,0.48)', 'rgba(4,14,28,0.86)', UI_THEME.bg],
    locations: [0, 0.52, 1],
  },
  km: {
    uri: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=2000&q=78',
    grad: ['rgba(130,65,35,0.42)', 'rgba(12,8,6,0.84)', UI_THEME.bg],
    locations: [0, 0.55, 1],
  },
  docs: {
    uri: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=2000&q=78',
    grad: ['rgba(45,55,120,0.44)', 'rgba(6,8,20,0.85)', UI_THEME.bg],
    locations: [0, 0.54, 1],
  },
  diagnostics: {
    uri: 'https://images.unsplash.com/photo-1486754735734-325b5831c3ad?auto=format&fit=crop&w=2000&q=78',
    grad: ['rgba(110,45,50,0.38)', 'rgba(8,6,12,0.86)', UI_THEME.bg],
    locations: [0, 0.56, 1],
  },
  ct: {
    uri: 'https://images.unsplash.com/photo-1486006920555-c77dcf18193c?auto=format&fit=crop&w=2000&q=78',
    grad: ['rgba(35,85,65,0.42)', 'rgba(4,12,14,0.83)', UI_THEME.bg],
    locations: [0, 0.53, 1],
  },
  entretien: {
    uri: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=2000&q=78',
    grad: ['rgba(75,58,28,0.4)', 'rgba(10,8,5,0.85)', UI_THEME.bg],
    locations: [0, 0.56, 1],
  },
  entretien_pneus: {
    uri: 'https://images.unsplash.com/photo-1487754180451-c456f719a1fc?auto=format&fit=crop&w=2000&q=78',
    grad: ['rgba(95,72,32,0.44)', 'rgba(8,7,5,0.84)', UI_THEME.bg],
    locations: [0, 0.56, 1],
  },
};

type Props = {
  variant: PremiumHeroVariant;
  height?: number;
  style?: ViewStyle;
  /** Contenu au-dessus du dégradé (titres, icônes) */
  children: React.ReactNode;
  /** Aligner le contenu en bas (défaut) ou centré */
  contentBottom?: boolean;
  /** @deprecated conservé pour compat ; plus de bordure sur le bandeau */
  borderAccent?: 'cyan' | 'gold';
  /** Centrer le contenu horizontalement (titres) */
  alignCenter?: boolean;
};

/**
 * Bandeau image + dégradé nuancé (couleur par écran) + léger mouvement lent type « nuage ».
 */
export function PremiumHeroBanner({
  variant,
  height = 132,
  style,
  children,
  contentBottom = true,
  alignCenter = false,
}: Props) {
  const { width: winW } = useWindowDimensions();
  const drift = useRef(new Animated.Value(0)).current;
  const [cw, setCw] = useState(0);
  const w = cw > 0 ? cw : Math.max(200, winW - 32);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 56000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 56000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [drift]);

  const tx = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -22],
  });
  const ty = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 8],
  });

  const v = VARIANTS[variant];
  const imgW = w * 1.34;
  const leftOffset = (w - imgW) / 2;

  const onLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    if (next > 0 && Math.abs(next - cw) > 1) setCw(next);
  };

  return (
    <View style={[styles.wrap, { height }, style]} onLayout={onLayout}>
      <Animated.View
        style={[
          styles.imgLayer,
          {
            width: imgW,
            height: height * 1.18,
            left: leftOffset,
            top: -height * 0.07,
            transform: [{ translateX: tx }, { translateY: ty }],
          },
        ]}
      >
        <Image source={{ uri: v.uri }} style={styles.imgFill} resizeMode="cover" />
      </Animated.View>
      <LinearGradient
        colors={v.grad}
        locations={v.locations}
        pointerEvents="box-none"
        style={[
          StyleSheet.absoluteFillObject,
          contentBottom ? styles.gradBottom : styles.gradCenter,
          alignCenter && styles.gradAlignCenter,
        ]}
      >
        {children}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: '#0a0e14',
  },
  imgLayer: {
    position: 'absolute',
    zIndex: 0,
  },
  imgFill: {
    width: '100%',
    height: '100%',
  },
  gradBottom: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 12,
    zIndex: 1,
  },
  gradCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    zIndex: 1,
  },
  gradAlignCenter: {
    alignItems: 'center',
  },
});
