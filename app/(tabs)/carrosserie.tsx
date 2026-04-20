import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CarrosserieScreen() {
  // Coordonnées en chiffres simples pour éviter les erreurs rouges
  const detections = [
    { id: 1, x: 60, y: 150 },
    { id: 2, x: 200, y: 300 }
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
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

        <TouchableOpacity
          style={styles.confirmButton}
          onPress={() => Alert.alert('Enregistré', 'Rangement validé.')}
        >
          <Text style={styles.confirmButtonText}>VALIDER LE RANGEMENT</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0f14' },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    paddingTop: 24,
    backgroundColor: '#0b0f14',
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#e2e8f0' },
  content: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
  photoContainer: {
    width: '100%',
    height: 450,
    backgroundColor: '#111827',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#334155',
  },
  photoText: { marginTop: 15, color: '#94a3b8', fontSize: 16 },
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
    backgroundColor: '#00a8b8',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 30,
  },
  confirmButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});