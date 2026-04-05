import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Pressable, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Assure the import is correct (default export should be usedKilometrage, or adapt as needed)
import { useKilometrage } from '../../context/KilometrageContext';

// Add a wrapper to secure context usage
function useSafeKilometrage() {
  const context = useKilometrage();
  if (!context) {
    // Custom error handling, you could alternatively throw or return a loading flag
    return null;
  }
  return context;
}

const { width } = Dimensions.get('window');

const BUBBLES = [
  { key: 'total', label: 'TOTAL', icon: 'car-multiple', valueKey: 'total' },
  { key: 'journalier', label: 'JOUR', icon: 'calendar-today', valueKey: 'journalier' },
  { key: 'hebdo', label: 'HEBDO', icon: 'calendar-week', valueKey: 'hebdo' },
  { key: 'mensuel', label: 'MOIS', icon: 'calendar-month', valueKey: 'mensuel' },
  { key: 'annuel', label: 'AN', icon: 'calendar-star', valueKey: 'annuel' },
] as const;

export default function KmScreen() {
  const router = useRouter();
  const { data, updateKm } = useKilometrage();
  const [vitesse, setVitesse] = useState(0);
  const [lastPos, setLastPos] = useState<Location.LocationObject | null>(null);

  // Animation state
  const [activeIdx, setActiveIdx] = useState(0);
  const scales = useRef(BUBBLES.map((_, i) => new Animated.Value(i === 0 ? 1.2 : 1))).current;

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

  const selectBubble = (i: number) => {
    // Animate all bubbles: active scales to 1.2, others to 1
    scales.forEach((s, idx) => {
      Animated.spring(s, {
        toValue: idx === i ? 1.2 : 1,
        useNativeDriver: true,
        friction: 6,
        tension: 150,
      }).start();
    });
    setActiveIdx(i);
  };

  // Bubble rendering
  const renderBubbles = () => (
    <View style={styles.bubbleContainer}>
      {BUBBLES.map((b, idx) => {
        const isActive = idx === activeIdx;
        let bubbleValue = data[b.valueKey];
        if (b.key === 'total') bubbleValue = Math.floor(data.total);
        else bubbleValue = data[b.valueKey] || 0;

        return (
          <Pressable key={b.key} onPress={() => selectBubble(idx)} style={{ flex: 1, alignItems: 'center' }}>
            <Animated.View
              style={[
                styles.kmBubble,
                isActive && styles.kmBubbleActive,
                { 
                  transform: [{ scale: scales[idx] }],
                  shadowOpacity: isActive ? 0.22 : 0.10,
                }
              ]}
            >
              <MaterialCommunityIcons name={b.icon} size={30} color={isActive ? "#fff" : "#3498db"} />
              <Text style={[styles.bubbleValue, isActive ? styles.bubbleValueActive : undefined]}>
                {isActive
                  ? (b.key === 'total'
                    ? bubbleValue.toLocaleString('fr-FR')
                    : Number(bubbleValue).toFixed(1))
                  : (b.key === 'total'
                    ? bubbleValue.toLocaleString('fr-FR')
                    : Number(bubbleValue).toFixed(1))}
              </Text>
              <Text style={[styles.bubbleLabel, isActive ? styles.bubbleLabelActive : undefined]}>
                {b.label}
              </Text>
            </Animated.View>
          </Pressable>
        );
      })}
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

      {/* Intégration des bulles animées */}
      {renderBubbles()}

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

  // Nouvelle section pour les bulles
  bubbleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 10,
    marginTop: 15,
    marginBottom: 30,
    alignItems: 'flex-end',
    minHeight: 120,
    // permet que la ligne reste sur un fond neutre, ne touche pas les styles du container!
  },
  kmBubble: {
    backgroundColor: '#fff',
    borderRadius: 60,
    width: 68,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: "#576574",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
    marginHorizontal: 2,
    marginBottom: 0,
    borderWidth: 2,
    borderColor: "#e1eafd"
  },
  kmBubbleActive: {
    backgroundColor: '#3498db',
    borderColor: "#3498db",
    width: 90,
    height: 120,
    elevation: 8,
    shadowOpacity: 0.30,
  },
  bubbleValue: {
    color: '#3498db',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 8,
  },
  bubbleValueActive: {
    color: '#fff',
    fontSize: 26
  },
  bubbleLabel: {
    color: '#7f8c8d',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 3
  },
  bubbleLabelActive: {
    color: '#f7f8fa'
  },

  grid: { padding: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  card: { backgroundColor: '#fff', width: '47%', padding: 20, borderRadius: 20, alignItems: 'center', elevation: 3 },
  cardValue: { fontSize: 22, fontWeight: 'bold', color: '#2c3e50', marginTop: 10 },
  cardTitle: { fontSize: 12, color: '#7f8c8d', fontWeight: 'bold' },
  footer: { backgroundColor: '#2c3e50', padding: 25, borderTopLeftRadius: 30, borderTopRightRadius: 30, alignItems: 'center' },
  totalLabel: { color: '#bdc3c7', fontSize: 12, fontWeight: 'bold' },
  totalValue: { color: '#fff', fontSize: 32, fontWeight: 'bold' }
});