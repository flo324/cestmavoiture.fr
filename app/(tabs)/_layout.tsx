import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';



export default function TabLayout() {
  return (
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
  name="scan"
  options={{
    title: 'Scan',
    tabBarButton: (props: any) => (
  <TouchableOpacity
    {...props}
    activeOpacity={0.8}
    style={{
      // --- RÉGLAGES POSITION ---
      top: -35,               // 👈 Augmente ce chiffre (ex: -40) pour qu'il monte encore plus
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
    }}
  >
    <View style={{
      // --- RÉGLAGES TAILLE ---
      width: 85,              // 👈 Augmente ici pour l'agrandir (avant c'était 70)
      height: 85,             // 👈 Doit être identique à width
      borderRadius: 42.5,     // 👈 Doit être PILE la moitié de width (85/2)
     
      // --- DESIGN ---
      backgroundColor: '#ef5350',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 4,         // 👈 Optionnel : ajoute une petite bordure blanche
      borderColor: '#f1f4f9', // pour mieux détacher le bouton du fond
     
      // --- OMBRE ---
      elevation: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 5,
    }}>
      {/* Agrandis aussi l'icône si tu veux */}
      <Ionicons name="camera" size={32} color="#fff" />
      <Text style={{
        color: '#fff',
        fontSize: 12,         // Un peu plus grand pour la lisibilité
        fontWeight: 'bold',
        marginTop: 2
      }}>
        SCAN
      </Text>
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