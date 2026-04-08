import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function PharesScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Phares</Text>
      </View>

      <View style={styles.content}>
        <MaterialCommunityIcons name="car-light-high" size={80} color="#bdc3c7" />
        <Text style={styles.title}>Suivi des phares</Text>
        <Text style={styles.subtitle}>Cette section est prete pour vos controles phares.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0f14' },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#e2e8f0' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 },
  title: { fontSize: 22, fontWeight: '800', color: '#e2e8f0', marginTop: 20 },
  subtitle: { fontSize: 14, color: '#94a3b8', marginTop: 10, textAlign: 'center', paddingHorizontal: 24 },
});

