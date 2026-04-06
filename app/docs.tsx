import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type DocFolder = {
  id: string;
  titre: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  route: '/scan_permis' | '/scan_cg';
};

const folders: DocFolder[] = [
  {
    id: 'permis',
    titre: 'PERMIS',
    subtitle: 'Dossier permis de conduire',
    icon: 'card-account-details-outline',
    route: '/scan_permis',
  },
  {
    id: 'carte-grise',
    titre: 'CARTE GRISE',
    subtitle: 'Dossier véhicule',
    icon: 'file-document-outline',
    route: '/scan_cg',
  },
];

export default function DocsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    imageCaptured?: string;
    imageCapturedBase64?: string;
    fromGlobalScan?: string;
  }>();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mes réparations et entretiens</Text>
      </View>

      <FlatList
        data={folders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.folderCard}
            onPress={() =>
              router.push({
                pathname: item.route,
                params: {
                  imageCaptured: (params.imageCaptured as string) || '',
                  imageCapturedBase64: (params.imageCapturedBase64 as string) || '',
                  fromGlobalScan: (params.fromGlobalScan as string) || '',
                },
              })
            }
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name={item.icon} size={40} color="#f1c40f" />
            <View style={{ marginLeft: 15, flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>{item.titre}</Text>
              <Text style={{ color: '#3498db', fontSize: 11 }}>{item.subtitle}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color="#2ecc71" />
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f5f8' },
  header: { backgroundColor: '#fff', padding: 20, paddingTop: 40, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900' },
  folderCard: {
    backgroundColor: '#2c3e50',
    padding: 20,
    borderRadius: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
});