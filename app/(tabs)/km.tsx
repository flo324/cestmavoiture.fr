import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Dimensions, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useKilometrage } from '../../context/KilometrageContext';


const { width } = Dimensions.get('window');

export default function KmScreen() {
  const router = useRouter();
  const { data, updateKm } = useKilometrage();
  const [vitesse, setVitesse] = useState(0);
  const [lastPos, setLastPos] = useState<Location.LocationObject | null>(null);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      await Location.watchPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: 2000,
        distanceInterval: 5,
      }, (newLoc) => {
        setVitesse(Math.round((newLoc.coords.speed || 0) * 3.6));
       
        if (lastPos) {
          const dist = calculateDistance(lastPos.coords, newLoc.coords);
          if (dist > 0.01) updateKm(dist);
        }
        setLastPos(newLoc);
      });
    })();
  }, [lastPos]);

  const calculateDistance = (p1: any, p2: any) => {
    const R = 6371;
    const dLat = (p2.latitude - p1.latitude) * Math.PI / 180;
    const dLon = (p2.longitude - p1.longitude) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(p1.latitude * Math.PI / 180) * Math.cos(p2.latitude * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const KmCard = ({ title, value, icon }: any) => (
    <View style={styles.card}>
      <MaterialCommunityIcons name={icon} size={24} color="#3498db" />
      <Text style={styles.cardValue}>{value.toFixed(1)}</Text>
      <Text style={styles.cardTitle}>{title}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/')}>
          <MaterialCommunityIcons name="arrow-left" size={30} color="#2c3e50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>COMPTEUR</Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={styles.vitesseCircle}>
        <Text style={styles.vitesseNum}>{vitesse}</Text>
        <Text style={styles.vitesseUnit}>KM/H</Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.row}>
          <KmCard title="JOUR" value={data.journalier} icon="calendar-today" />
          <KmCard title="HEBDO" value={data.hebdo} icon="calendar-week" />
        </View>
        <View style={styles.row}>
          <KmCard title="MOIS" value={data.mensuel} icon="calendar-month" />
          <KmCard title="AN" value={data.annuel} icon="calendar-star" />
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.totalLabel}>TOTAL VÉHICULE</Text>
        <Text style={styles.totalValue}>{Math.floor(data.total).toLocaleString('fr-FR')} KM</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f5f8' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, paddingTop: 40, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#2c3e50' },
  vitesseCircle: { alignSelf: 'center', width: 180, height: 180, borderRadius: 90, borderWidth: 8, borderColor: '#3498db', justifyContent: 'center', alignItems: 'center', marginVertical: 20, backgroundColor: '#fff' },
  vitesseNum: { fontSize: 60, fontWeight: '900', color: '#2c3e50' },
  vitesseUnit: { fontSize: 14, color: '#bdc3c7', fontWeight: 'bold' },
  grid: { padding: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  card: { backgroundColor: '#fff', width: '47%', padding: 20, borderRadius: 20, alignItems: 'center', elevation: 3 },
  cardValue: { fontSize: 22, fontWeight: 'bold', color: '#2c3e50', marginTop: 10 },
  cardTitle: { fontSize: 12, color: '#7f8c8d', fontWeight: 'bold' },
  footer: { backgroundColor: '#2c3e50', padding: 25, borderTopLeftRadius: 30, borderTopRightRadius: 30, alignItems: 'center' },
  totalLabel: { color: '#bdc3c7', fontSize: 12, fontWeight: 'bold' },
  totalValue: { color: '#fff', fontSize: 32, fontWeight: 'bold' }
});