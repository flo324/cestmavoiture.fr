import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Tabs } from 'expo-router';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { EntretienProvider } from '../../context/EntretienContext';
import { KilometrageProvider } from '../../context/KilometrageContext';
import { useScan } from '../../context/ScanContext';

export default function TabLayout() {
  const router = useRouter();
  const { setCapturedImageForSelection } = useScan();

  const handleGlobalScan = async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) return;

    const photo = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
    });
    if (photo.canceled || !photo.assets?.[0]) return;
    const imageUri = photo.assets[0].uri ?? '';
    if (!imageUri) return;
    setCapturedImageForSelection({ uri: imageUri, createdAt: Date.now() });
    router.replace('/(tabs)');
  };

  return (
    <KilometrageProvider>
    <EntretienProvider>
    <View style={styles.webWrapper}> 
    <View style={styles.appContainer}>
    <Tabs screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: '#D4AF37',
    tabBarInactiveTintColor: '#8b949e',
    tabBarStyle: (({
      height: 78,
      paddingBottom: 10,
      paddingTop: 6,
      backgroundColor: '#0A0E11',
      borderTopWidth: 0,
      elevation: 14,
      position: 'absolute',
      overflow: 'visible',
    } as any)),
}}>
      {/* 1. LES SEULS BOUTONS VISIBLES EN BAS */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'TdB',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="view-dashboard" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'SCAN',
          tabBarButton: (props: any) => (
            <TouchableOpacity
              {...props}
              activeOpacity={0.85}
              style={styles.scanBtnWrap}
              onPress={handleGlobalScan}
            >
              <View style={styles.scanBtnInner}>
                <Ionicons name="scan" size={30} color="#fff" />
                <Text style={styles.scanTextInside}>SCAN</Text>
              </View>
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="account" size={24} color={color} />,
        }}
      />

      {/* 2. ON DIT À L'ORDI DE NE PAS AFFICHER LES AUTRES CASES EN BAS */}
      <Tabs.Screen name="st" options={{ href: null }} />
      <Tabs.Screen name="en" options={{ href: null }} />
      <Tabs.Screen name="km" options={{ href: null }} />
      <Tabs.Screen name="factures" options={{ href: null }} />
      <Tabs.Screen name="entretien" options={{ href: null }} />
      <Tabs.Screen name="ct" options={{ href: null }} />
      <Tabs.Screen name="location" options={{ href: null }} />
      <Tabs.Screen name="pneus" options={{ href: null }} />
      <Tabs.Screen name="batterie" options={{ href: null }} />
      <Tabs.Screen name="carrosserie" options={{ href: null }} />
      <Tabs.Screen name="docs" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen name="scan_permis" options={{ href: null }} />
      <Tabs.Screen name="scan_cg" options={{ href: null }} />
    </Tabs>
    </View>
  </View>
    </EntretienProvider>
    </KilometrageProvider>
  );
}

const styles = StyleSheet.create({
  webWrapper: {
    flex: 1,
    backgroundColor: '#0A0E11',
    ...Platform.select({
      web: { cursor: 'pointer' },
      default: {},
    }),
  },
  appContainer: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 380 : '100%',
    alignSelf: 'center', // Centre l'appli horizontalement sur web
    backgroundColor: '#0A0E11',
  },
  scanBtnWrap: {
    top: -28,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 108,
  },
  scanBtnInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#00AEB8',
    borderWidth: 3,
    borderColor: '#aaf8ff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 16,
    shadowColor: '#00F2FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 18,
  },
  scanTextInside: {
    marginTop: 1,
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
