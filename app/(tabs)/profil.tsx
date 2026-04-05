import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useKilometrage } from '../../context/KilometrageContext';

const USER_DATA_KEY = '@cestmavoiture_user_v2';

export default function ProfilScreen() {
  // 1. Gestion du Kilométrage (via le contexte pour la synchro)
  const context = useKilometrage();
  const kmValue = context ? context.km : "190 000";
  const updateKm = context ? context.updateKm : () => {};

  // 2. États pour les infos personnelles (Nom, Prénom, Véhicule)
  const [userData, setUserData] = useState({
    prenom: 'Florent',
    nom: 'DAMIANO',
    modele: '307 PEUGEOT',
    immat: '56 Ayw 13',
  });

  const [tempKm, setTempKm] = useState(kmValue);

  // Charger les infos au démarrage
  useEffect(() => {
    const loadUserData = async () => {
      const stored = await AsyncStorage.getItem(USER_DATA_KEY);
      if (stored) setUserData(JSON.parse(stored));
    };
    loadUserData();
    setTempKm(kmValue);
  }, [kmValue]);

  const handleSaveAll = async () => {
    try {
      // Sauvegarde du Nom/Prénom/Véhicule
      await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
     
      // Sauvegarde du KM (Synchro avec le Tableau de Bord)
      await updateKm(tempKm);
     
      Alert.alert("Succès", "Toutes vos informations ont été mises à jour !");
    } catch (e) {
      Alert.alert("Erreur", "Impossible de sauvegarder.");
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Informations Personnelles</Text>
       
        <Text style={styles.label}>Prénom</Text>
        <TextInput
          style={styles.input}
          value={userData.prenom}
          onChangeText={(t) => setUserData({...userData, prenom: t})}
        />

        <Text style={styles.label}>Nom</Text>
        <TextInput
          style={styles.input}
          value={userData.nom}
          onChangeText={(t) => setUserData({...userData, nom: t})}
        />

        <View style={styles.separator} />

        <Text style={styles.sectionTitle}>Véhicule</Text>

        <Text style={styles.label}>Modèle du véhicule</Text>
        <TextInput
          style={styles.input}
          value={userData.modele}
          onChangeText={(t) => setUserData({...userData, modele: t})}
        />

        <Text style={styles.label}>Immatriculation</Text>
        <TextInput
          style={styles.input}
          value={userData.immat}
          onChangeText={(t) => setUserData({...userData, immat: t})}
        />

        <Text style={styles.label}>Kilométrage actuel</Text>
        <TextInput
          style={styles.input}
          value={tempKm}
          onChangeText={setTempKm}
          keyboardType="numeric"
        />

        <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAll}>
          <Text style={styles.saveBtnText}>ENREGISTRER TOUT</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f5f8' },
  card: { margin: 20, padding: 20, backgroundColor: '#fff', borderRadius: 15, elevation: 4, marginTop: 130 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#3498db', marginBottom: 15, marginTop: 10 },
  label: { fontSize: 13, fontWeight: 'bold', color: '#7f8c8d', marginBottom: 5 },
  input: { backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#eee', fontSize: 16 },
  separator: { height: 1, backgroundColor: '#eee', marginVertical: 15 },
  saveBtn: { backgroundColor: '#27ae60', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});