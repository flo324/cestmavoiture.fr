import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { BackHandler, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { userGetItem } from '../../services/userStorage';

type DocFolder = {
  id: string;
  titre: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  type: string;
  photoUri?: string;
};

const STORAGE_KEY = '@cestmavoiture_docs_v1';

export default function DocDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [doc, setDoc] = useState<DocFolder | null>(null);
  const goDocs = () => router.replace('/docs');

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await userGetItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as DocFolder[];
        const found = parsed.find((item) => item.id === id);
        if (found) setDoc(found);
      } catch (error) {
        console.log('[DocDetail] load failed', error);
      }
    };
    load();
  }, [id]);

  useFocusEffect(
    React.useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        goDocs();
        return true;
      });
      return () => sub.remove();
    }, [])
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={goDocs} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#00F2FF" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Document</Text>
        <View style={{ width: 24 }} />
      </View>
      {doc ? (
        <View style={styles.card}>
          <View style={styles.row}>
            <MaterialCommunityIcons name={doc.icon} size={30} color="#f1c40f" />
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.title}>{doc.titre}</Text>
              <Text style={styles.subtitle}>{doc.subtitle}</Text>
              <Text style={styles.type}>Type: {doc.type}</Text>
            </View>
          </View>
          {doc.photoUri ? (
            <Image source={{ uri: doc.photoUri }} style={styles.image} />
          ) : (
            <View style={styles.emptyImage}>
              <Text style={styles.emptyText}>Aucune photo</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Document introuvable</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0f14', paddingHorizontal: 16, paddingTop: 8 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingTop: 8,
  },
  topBarTitle: { fontSize: 17, fontWeight: '800', color: '#e2e8f0' },
  card: { backgroundColor: '#111827', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#1f2937' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  subtitle: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  type: { color: '#cbd5e1', fontSize: 12, marginTop: 4 },
  image: { width: '100%', height: 230, borderRadius: 12, backgroundColor: '#111827' },
  emptyImage: {
    width: '100%',
    height: 230,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#cbd5e1', fontSize: 14 },
});

