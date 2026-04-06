import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function DocsScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Mes Documents</Text>
     
      <View style={styles.grid}>
        {/* Carré PERMIS */}
        <TouchableOpacity style={styles.square} onPress={() => router.push('/scan_permis' as any)}>
          <MaterialCommunityIcons name="card-account-details" size={50} color="white" />
          <Text style={styles.squareLabel}>PERMIS</Text>
        </TouchableOpacity>

        {/* Carré CARTE GRISE */}
        <TouchableOpacity style={styles.square} onPress={() => router.push('/scan_cg' as any)}>
          <MaterialCommunityIcons name="file-document" size={50} color="white" />
          <Text style={styles.squareLabel}>C. GRISE</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', padding: 20, paddingTop: 60 },
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 30, textAlign: 'center' },
  grid: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap' },
  square: {
    backgroundColor: '#2978b5',
    width: '45%',
    aspectRatio: 1,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    marginBottom: 20
  },
  squareLabel: { color: 'white', fontWeight: 'bold', marginTop: 10, fontSize: 16 }
});