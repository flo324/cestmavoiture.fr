import { Tabs } from 'expo-router';
import React from 'react';

import { KilometrageProvider } from '../../context/KilometrageContext';
import { VehicleProvider } from '../../context/VehicleContext';

/**
 * Navigation par écrans sans barre du bas : accueil = maquette Otto ;
 * scan, profil et dossiers sont ouverts en push depuis l’accueil.
 */
export default function TabLayout() {
  return (
    <KilometrageProvider>
      <VehicleProvider>
        <Tabs
          tabBar={() => null}
          screenOptions={{
            headerShown: false,
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
          <Tabs.Screen name="scan" options={{ href: null, title: 'Scan' }} />
          <Tabs.Screen name="profil" options={{ href: null, title: 'Profil' }} />
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
          <Tabs.Screen name="depenses" options={{ href: null }} />
          <Tabs.Screen name="essence" options={{ href: null }} />
          <Tabs.Screen name="assurances" options={{ href: null }} />
          <Tabs.Screen name="essence_stats" options={{ href: null }} />
          <Tabs.Screen name="diagnostics" options={{ href: null }} />
          <Tabs.Screen name="doc_detail" options={{ href: null }} />
          <Tabs.Screen name="phares" options={{ href: null }} />
          <Tabs.Screen name="modal" options={{ href: null }} />
          <Tabs.Screen name="explore" options={{ href: null }} />
          <Tabs.Screen name="scan_permis" options={{ href: null }} />
          <Tabs.Screen name="scan_cg" options={{ href: null }} />
          <Tabs.Screen name="bilan_stats" options={{ href: null }} />
        </Tabs>
      </VehicleProvider>
    </KilometrageProvider>
  );
}
