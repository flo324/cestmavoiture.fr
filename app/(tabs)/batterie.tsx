import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { userSetItem } from '../../services/userStorage';

const RETURN_TO_FOLDERS_FLAG = '@otto_open_folders_on_return';

export default function BatterieScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const allowLeaveRef = useRef(false);

  const goToFolders = useCallback(() => {
    allowLeaveRef.current = true;
    void userSetItem(RETURN_TO_FOLDERS_FLAG, '1');
    router.replace('/(tabs)');
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      allowLeaveRef.current = false;
      return () => {};
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        goToFolders();
        return true;
      });
      return () => sub.remove();
    }, [goToFolders])
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current) return;
      event.preventDefault();
      goToFolders();
    });
    return unsubscribe;
  }, [goToFolders, navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Batterie</Text>
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