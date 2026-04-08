import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, LayoutDashboard, User } from 'lucide-react-native';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KilometrageProvider } from '../../context/KilometrageContext';
import { VehicleProvider } from '../../context/VehicleContext';

const TAB_BAR_BODY = 52;
const SCAN_BTN = 56;
const SCAN_LIFT = -16;
const SCENE_BOTTOM_SAFE = 78;
const NOTCH_WIDTH = SCAN_BTN + 56;
const NOTCH_DEPTH = 24;

const C_ACTIVE = '#00E9F5';
const C_ACTIVE_SOFT = 'rgba(0, 233, 245, 0.42)';
const C_INACTIVE = '#8B95A3';
const C_BAR_TOP = '#0E1924';
const C_BAR_MID = '#081018';
const C_BAR_BOTTOM = '#04070B';

const ROUTE_ORDER = ['index', 'scan', 'profil'] as const;

function LuxuryTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.tabBarRoot} pointerEvents="box-none">
      <BlurView
        intensity={48}
        tint="dark"
        style={[
          styles.tabBarInnerGlass,
          {
            minHeight: TAB_BAR_BODY,
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(14,25,36,0.95)', 'rgba(8,16,24,0.92)', 'rgba(4,7,11,0.96)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.notchCutout} pointerEvents="none" />
        <Svg
          width="100%"
          height={40}
          viewBox="0 0 1000 100"
          preserveAspectRatio="none"
          style={styles.notchGlowSvg}
          pointerEvents="none"
        >
          <Path
            d="M0 50 L390 50 C430 50 442 18 500 18 C558 18 570 50 610 50 L1000 50"
            stroke="rgba(94,244,255,0.45)"
            strokeWidth="2.5"
            fill="none"
          />
          <Path
            d="M0 52 L390 52 C430 52 442 20 500 20 C558 20 570 52 610 52 L1000 52"
            stroke="rgba(0,233,245,0.18)"
            strokeWidth="5"
            fill="none"
          />
        </Svg>
        <View style={styles.tabRow}>
          {ROUTE_ORDER.map((name) => {
            const route = state.routes.find((r) => r.name === name);
            if (!route) return null;
            const isFocused = state.routes[state.index]?.key === route.key;

            if (name === 'scan') {
              return (
                <View key={route.key} style={styles.scanCol}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={isFocused ? { selected: true } : {}}
                    onPress={() => {
                      const e = navigation.emit({
                        type: 'tabPress',
                        target: route.key,
                        canPreventDefault: true,
                      });
                      if (!isFocused && !e.defaultPrevented) {
                        navigation.navigate(route.name);
                      }
                    }}
                    style={styles.scanButtonWrap}
                  >
                    <View
                      style={[
                        styles.scanButton,
                        isFocused ? styles.scanButtonActive : null,
                      ]}
                    >
                      <Camera size={24} color="#FFFFFF" />
                    </View>
                    <Text style={styles.scanLabel}>SCAN</Text>
                  </Pressable>
                </View>
              );
            }

            const label = name === 'index' ? 'DASHBOARD' : 'PROFIL';
            const Icon = name === 'index' ? LayoutDashboard : User;
            const color = isFocused ? C_ACTIVE : C_INACTIVE;
            const profileIconColor = isFocused ? C_ACTIVE : '#8B5CF6';

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                onPress={() => {
                  const e = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!isFocused && !e.defaultPrevented) {
                    navigation.navigate(route.name);
                  }
                }}
                style={styles.sideTab}
              >
                <View style={styles.indicatorSlot}>
                  {isFocused ? (
                    <LinearGradient
                      colors={['#5FF4FF', C_ACTIVE, '#00B8CC']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.activeIndicator}
                    />
                  ) : (
                    <View style={styles.indicatorSpacer} />
                  )}
                </View>
                {name === 'profil' ? (
                  <View
                    style={[
                      styles.profilIconRing,
                      isFocused ? styles.profilIconRingActive : styles.profilIconRingIdle,
                    ]}
                  >
                    <User size={20} color={profileIconColor} />
                  </View>
                ) : (
                  <Icon size={22} color={color} />
                )}
                <Text style={[styles.tabLabel, { color }]} numberOfLines={1}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

export default function TabLayout() {
  return (
    <KilometrageProvider>
      <VehicleProvider>
        <Tabs
          tabBar={(props) => <LuxuryTabBar {...props} />}
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: false,
            sceneStyle: { paddingBottom: SCENE_BOTTOM_SAFE },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'DASHBOARD',
            }}
          />
          <Tabs.Screen
            name="scan"
            options={{
              title: 'SCAN',
            }}
          />
          <Tabs.Screen
            name="profil"
            options={{
              title: 'PROFIL',
            }}
          />

          <Tabs.Screen name="st" options={{ href: null }} />
          <Tabs.Screen name="km" options={{ href: null }} />
          <Tabs.Screen name="factures" options={{ href: null }} />
          <Tabs.Screen name="entretien" options={{ href: null }} />
          <Tabs.Screen name="ct" options={{ href: null }} />
          <Tabs.Screen name="location" options={{ href: null }} />
          <Tabs.Screen name="pneus" options={{ href: null }} />
          <Tabs.Screen name="batterie" options={{ href: null }} />
          <Tabs.Screen name="carrosserie" options={{ href: null }} />
          <Tabs.Screen name="docs" options={{ href: null }} />
          <Tabs.Screen name="diagnostics" options={{ href: null }} />
          <Tabs.Screen name="doc_detail" options={{ href: null }} />
          <Tabs.Screen name="phares" options={{ href: null }} />
          <Tabs.Screen name="modal" options={{ href: null }} />
          <Tabs.Screen name="explore" options={{ href: null }} />
          <Tabs.Screen name="scan_permis" options={{ href: null }} />
          <Tabs.Screen name="scan_cg" options={{ href: null }} />
        </Tabs>
      </VehicleProvider>
    </KilometrageProvider>
  );
}

const styles = StyleSheet.create({
  tabBarRoot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -4,
    backgroundColor: 'transparent',
  },
  tabBarInnerGlass: {
    position: 'relative',
    backgroundColor: 'rgba(5,9,14,0.72)',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 1,
    borderColor: 'rgba(0, 232, 245, 0.16)',
    overflow: 'visible',
  },
  notchCutout: {
    position: 'absolute',
    alignSelf: 'center',
    top: -1,
    width: NOTCH_WIDTH,
    height: NOTCH_DEPTH,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
    backgroundColor: '#0b0f14',
  },
  notchGlowSvg: {
    position: 'absolute',
    top: -18,
    left: 0,
    right: 0,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  sideTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 2,
    minHeight: 36,
  },
  indicatorSlot: {
    height: 8,
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 4,
  },
  activeIndicator: {
    width: 34,
    height: 3,
    borderRadius: 2,
    shadowColor: C_ACTIVE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 8,
    elevation: 6,
  },
  indicatorSpacer: {
    width: 34,
    height: 3,
  },
  tabLabel: {
    marginTop: 3,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.35,
  },
  scanCol: {
    flex: 1,
    alignItems: 'center',
  },
  scanButtonWrap: {
    top: SCAN_LIFT,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  scanButton: {
    width: SCAN_BTN,
    height: SCAN_BTN,
    borderRadius: SCAN_BTN / 2,
    backgroundColor: '#0A1622',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
    borderColor: 'rgba(0, 233, 245, 0.55)',
    ...Platform.select({
      ios: {
        shadowColor: C_ACTIVE,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.38,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  scanButtonActive: {
    borderColor: C_ACTIVE,
    backgroundColor: '#0C1E2E',
    shadowColor: C_ACTIVE,
    shadowOpacity: 0.55,
    shadowRadius: 12,
  },
  scanLabel: {
    color: '#E2E8F0',
    fontSize: 9.5,
    fontWeight: '800',
    marginTop: 5,
    letterSpacing: 0.45,
  },
  profilIconRing: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#05080C',
  },
  profilIconRingActive: {
    borderWidth: 1.5,
    borderColor: C_ACTIVE,
  },
  profilIconRingIdle: {
    borderWidth: 1,
    borderColor: 'rgba(139,149,163,0.45)',
    backgroundColor: 'rgba(124,58,237,0.16)',
  },
});
