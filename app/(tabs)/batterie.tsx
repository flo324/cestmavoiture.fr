import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function BatterieScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={28} color="#2c3e50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Batterie</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.content}>
        <MaterialCommunityIcons name="battery-unknown" size={80} color="#bdc3c7" />
        <Text style={styles.title}>Infos Batterie</Text>
        <Text style={styles.subtitle}>Cette section est vide pour le moment.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f5f8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#2c3e50', marginTop: 20 },
  subtitle: { fontSize: 14, color: '#7f8c8d', marginTop: 10 },
});