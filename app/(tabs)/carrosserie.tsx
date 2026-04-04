import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function CarrosserieScreen() {
  const router = useRouter();

  // Coordonnées en chiffres simples pour éviter les erreurs rouges
  const detections = [
    { id: 1, x: 60, y: 150 },
    { id: 2, x: 200, y: 300 }
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header avec bouton retour */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color="#2c3e50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ÉTAT CARROSSERIE</Text>
      </View>

      <View style={styles.content}>
        {/* Zone de la photo avec les marqueurs orange */}
        <View style={styles.photoContainer}>
          <Ionicons name="camera-outline" size={80} color="#bdc3c7" />
          <Text style={styles.photoText}>Photo enregistrée</Text>
         
          {detections.map((dot) => (
            <View
              key={dot.id}
              style={[styles.dot, { top: dot.y, left: dot.x }]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.confirmButton} onPress={() => router.back()}>
          <Text style={styles.confirmButtonText}>VALIDER LE RANGEMENT</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f5f8' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: '#fff' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', marginLeft: 15, color: '#2c3e50' },
  content: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
  photoContainer: {
    width: '100%',
    height: 450,
    backgroundColor: '#fff',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#dcdde1'
  },
  photoText: { marginTop: 15, color: '#7f8c8d', fontSize: 16 },
  dot: {
    position: 'absolute',
    width: 35,
    height: 35,
    borderRadius: 17.5,
    borderWidth: 3,
    borderColor: '#e67e22',
    backgroundColor: 'rgba(230, 126, 34, 0.25)',
  },
  confirmButton: {
    marginTop: 30,
    backgroundColor: '#e67e22',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 30
  },
  confirmButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});