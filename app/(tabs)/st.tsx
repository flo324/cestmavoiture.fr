import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EntretienScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>IA ENTRETIEN</Text>
      <View style={styles.iaBox}>
        <Text style={styles.iaTxt}>
          🚩 <Text style={{ fontWeight: 'bold' }}>COURROIE :</Text> À changer (Urgence !)
        </Text>
        <Text style={styles.iaTxt}>
          ✅ <Text style={{ fontWeight: 'bold' }}>VIDANGE :</Text> OK jusqu&apos;à 205 000 km
        </Text>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0f14', padding: 25, paddingTop: 24 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 24, color: '#e2e8f0', textAlign: 'center' },
  iaBox: {
    backgroundColor: '#111827',
    padding: 20,
    borderRadius: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#00F2FF',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  iaTxt: { fontSize: 14, marginBottom: 10, color: '#cbd5e1' },
});