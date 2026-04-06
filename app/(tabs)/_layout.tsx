import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { EntretienProvider } from '../../context/EntretienContext';
import { KilometrageProvider } from '../../context/KilometrageContext';

export default function TabLayout() {
  return (
    <KilometrageProvider>
    <EntretienProvider>
    <View style={styles.webWrapper}> 
    <View style={styles.appContainer}>
    <Tabs screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: '#1aa6a6',
    tabBarInactiveTintColor: '#7f8c8d',
    tabBarStyle: (({
      height: 72,
      paddingBottom: 8,
      paddingTop: 6,
      backgroundColor: '#fff',
      borderTopWidth: 0,
      elevation: 5,
      position: 'absolute',
      overflow: 'visible', // 👈 L'astuce est dans les parenthèses autour de l'objet
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
            >
              <View style={styles.scanBtnInner}>
                <Ionicons name="scan" size={30} color="#fff" />
              </View>
              <Text style={styles.scanBtnTxt}>SCAN</Text>
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
    backgroundColor: '#f0f2f5',
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
    backgroundColor: '#fff',
  },
  scanBtnWrap: {
    top: -24,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 96,
  },
  scanBtnInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#18b7b7',
    borderWidth: 4,
    borderColor: '#d8f8f8',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#0f8e8e',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 9,
  },
  scanBtnTxt: {
    marginTop: 4,
    color: '#18b7b7',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
});
