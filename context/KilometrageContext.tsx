import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';

const KM_KEY = '@kilometrage_save';
const KilometrageContext = createContext<any>(null);

export const KilometrageProvider = ({ children }: any) => {
  const [km, setKm] = useState('190 000');

  // Charger le KM au démarrage de l'appli
  useEffect(() => {
    const loadKm = async () => {
      const savedKm = await AsyncStorage.getItem(KM_KEY);
      if (savedKm) setKm(savedKm);
    };
    loadKm();
  }, []);

  // Fonction pour changer le KM et l'enregistrer
  const updateKm = async (newKm: string) => {
    setKm(newKm);
    await AsyncStorage.setItem(KM_KEY, newKm);
  };

  return (
    <KilometrageContext.Provider value={{ km, updateKm }}>
      {children}
    </KilometrageContext.Provider>
  );
};

export const useKilometrage = () => useContext(KilometrageContext);