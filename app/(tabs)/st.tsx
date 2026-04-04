import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function EntretienScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>⬅ Retour</Text></TouchableOpacity>
      <Text style={styles.title}>IA ENTRETIEN</Text>
      <View style={styles.iaBox}>
        <Text style={styles.iaTxt}>🚩 <Text style={{fontWeight:'bold'}}>COURROIE :</Text> À changer (Urgence !)</Text>
        <Text style={styles.iaTxt}>✅ <Text style={{fontWeight:'bold'}}>VIDANGE :</Text> OK jusqu'à 205 000 km</Text>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white', padding: 25, paddingTop: 60 },
  back: { fontSize: 16, color: '#2c3e50', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 30 },
  iaBox: { backgroundColor: '#fdf2f2', padding: 20, borderRadius: 15, borderLeftWidth: 6, borderLeftColor: '#f39c12' },
  iaTxt: { fontSize: 14, marginBottom: 10 }
});