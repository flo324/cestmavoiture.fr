import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#3498db',
      tabBarStyle: { height: 60 }
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
      <Tabs.Screen name="ct" options={{ href: null }} />
      <Tabs.Screen name="cg" options={{ href: null }} />
      <Tabs.Screen name="location" options={{ href: null }} />
      <Tabs.Screen name="pneus" options={{ href: null }} />
      <Tabs.Screen name="permis" options={{ href: null }} />
      <Tabs.Screen name="batterie" options={{ href: null }} />
      <Tabs.Screen name="carrosserie" options={{ href: null }} />
      <Tabs.Screen name="docs" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}