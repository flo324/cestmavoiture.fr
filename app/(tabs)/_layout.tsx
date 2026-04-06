import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

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
    tabBarActiveTintColor: '#3498db',
    tabBarStyle: (({
      height: 60,
      paddingBottom: 5,
      paddingTop: 5,
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
          title: 'Tableau de bord',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="view-dashboard" size={24} color={color} />,
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
      <Tabs.Screen name="scan" options={{ href: null }} />
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
});
