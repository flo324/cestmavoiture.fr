import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

// L'utilisation de "export default" ici est très importante
export default function BatteryCard() {
  return (
    <View style={styles.card}>
      <MaterialCommunityIcons name="battery-charging" size={32} color="#f1c40f" />
      <Text style={styles.cardTitle}>BAT</Text>
      <Text style={styles.cardSubtitle}>BATTERIE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#2c3e50',
    width: '31%',
    aspectRatio: 1,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#f1c40f',
  },
  cardTitle: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  cardSubtitle: { color: '#3498db', fontSize: 8, fontWeight: 'bold' },
});