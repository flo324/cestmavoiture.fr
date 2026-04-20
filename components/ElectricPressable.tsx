import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  type GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

type ElectricPressableProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
};

export function ElectricPressable({ children, style, borderRadius = 16, onPress, disabled }: ElectricPressableProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [isActive, setIsActive] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const gradientId = useMemo(() => `electric-${Math.random().toString(36).slice(2, 10)}`, []);

  const perimeter = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) return 0;
    return Math.max(1, 2 * ((size.width - 2) + (size.height - 2)));
  }, [size.height, size.width]);

  const segment = Math.max(56, Math.min(108, Math.round(perimeter * 0.22)));
  const dashOffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -perimeter],
  });

  const startEffect = () => {
    setIsActive(true);
    progress.setValue(0);
    loopRef.current?.stop();
    loopRef.current = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
      { iterations: 1 }
    );
    loopRef.current.start(({ finished }) => {
      if (finished) setIsActive(false);
    });
  };

  const stopEffect = () => {
    loopRef.current?.stop();
    setIsActive(false);
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <Pressable
      disabled={disabled}
      onLayout={onLayout}
      onPress={onPress}
      onPressIn={startEffect}
      onPressOut={stopEffect}
      style={({ pressed }) => [style, pressed && styles.pressed]}
    >
      {children}
      {isActive && perimeter > 0 ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg width={size.width} height={size.height}>
            <Defs>
              <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor="#dbeafe" stopOpacity="0.12" />
                <Stop offset="48%" stopColor="#67e8f9" stopOpacity="1" />
                <Stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.18" />
              </LinearGradient>
            </Defs>
            <AnimatedRect
              x="1"
              y="1"
              width={Math.max(0, size.width - 2)}
              height={Math.max(0, size.height - 2)}
              rx={borderRadius}
              ry={borderRadius}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeDasharray={`${segment} ${Math.max(1, perimeter - segment)}`}
              strokeDashoffset={dashOffset as unknown as number}
            />
          </Svg>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.985,
  },
});
