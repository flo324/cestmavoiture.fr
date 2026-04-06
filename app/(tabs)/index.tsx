import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ImageBackground, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View, } from 'react-native';

// Importation de la synchro
import { useKilometrage } from '../../context/KilometrageContext';
import { useScan } from '../../context/ScanContext';

const USER_DATA_KEY = '@cestmavoiture_user_v2';

export default function HomeScreen() {
  const router = useRouter();
  const { tempImage, isSelecting, saveImageToFolder, clearSelection } = useScan();
 
  // CORRECTION DU CRASH : Sécurité si le contexte est vide au démarrage
  const kilometrageContext = useKilometrage();
  const kmValue = kilometrageContext ? kilometrageContext.km : "190 000";

  const [statusBanner, setStatusBanner] = useState('');

  const [userData, setUserData] = useState({
    prenom: 'Florent', nom: 'DAMIANO', modele: '307 PEUGEOT', immat: '56 Ayw 13',
  });

  useFocusEffect(
    useCallback(() => {
      const fetchData = async () => {
        try {
          const storedData = await AsyncStorage.getItem(USER_DATA_KEY);
          if (storedData) setUserData(JSON.parse(storedData));
        } catch (e) {
          console.log('Erreur', e);
        }
      };
      fetchData();
    }, [])
  );

  const handleGridPress = async (route: string) => {
    if (!isSelecting || !tempImage) {
      console.log('[Home] normal click, no scan selecting', { route, isSelecting, hasTempImage: !!tempImage });
      setStatusBanner('');
      router.push(route as any);
      return;
    }

    try {
      const folderName = route.replace('/', '');
      console.log('[Home] selecting destination', { folderName, route, uri: tempImage.uri });
      const saved = await saveImageToFolder(folderName);
      console.log('[Home] saveImageToFolder result', saved);
      setStatusBanner('Document enregistré avec succès');

      router.push({
        pathname: route as any,
        params: {
          imageCaptured: tempImage.uri,
          fromGlobalScan: '1',
        },
      });
    } catch (error) {
      console.log('[Home] handleGridPress ignored error', error);
    } finally {
      clearSelection();
    }
  };

  const SectionTile = ({
    title,
    subtitle,
    icon,
    color,
    route,
  }: {
    title: string;
    subtitle: string;
    icon: React.ComponentProps<typeof Feather>['name'];
    color: string;
    route: string;
  }) => (
    <TouchableOpacity style={[styles.sectionTile, { borderLeftColor: color }]} onPress={() => handleGridPress(route)}>
      <View style={styles.sectionIconWrap}>
        <Feather name={icon} size={23} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={24} color="#bdc3c7" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.contentBody} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.headerBlock}>
          <View>
            <Text style={styles.appName}>GARAGE CONNECT</Text>
            <Text style={styles.userIdentity}>MON GARAGE IA</Text>
          </View>
          <View style={styles.userBadge}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitial}>FV</Text>
            </View>
            <Text style={styles.userBadgeName}>FLORENT V.</Text>
          </View>
        </View>

        <View style={styles.vehicleCardShadow}>
          <ImageBackground
            source={{
              uri: 'https://images.unsplash.com/photo-1617531653332-bd46c24f2068?auto=format&fit=crop&w=1200&q=80',
            }}
            style={styles.vehicleCard}
            imageStyle={styles.vehicleBgImage}
          >
            <View style={styles.vehicleOverlay} />
            <View style={styles.vehicleContent}>
              <Text style={styles.vehicleTitlePremium}>VÉHICULE</Text>
              <Text style={styles.vehicleLinePremium}>MODÈLE: Peugeot 308 (T9)</Text>
              <Text style={styles.vehicleLinePremium}>IMMAT: FL-001-VT</Text>
              <Text style={styles.vehicleLinePremium}>KILOMÉTRAGE: 85,000 km</Text>
            </View>
          </ImageBackground>
        </View>

          {isSelecting ? <Text style={styles.pendingHint}>Photo prête ! Cliquez sur un dossier pour l&apos;enregistrer</Text> : null}
          {!isSelecting && statusBanner ? <Text style={styles.successHint}>{statusBanner}</Text> : null}

        <View style={styles.sectionsWrap}>
          <SectionTile
            title="MAINTENANCE"
            subtitle="Entretien, révisions, interventions"
            icon="tool"
            color="#d7b26a"
            route="/entretien"
          />
          <SectionTile
            title="DOCUMENTS"
            subtitle="Permis, carte grise, pièces"
            icon="folder"
            color="#d7b26a"
            route="/docs"
          />
          <SectionTile
            title="COMPTES & FACTURES"
            subtitle="Suivi dépenses et reçus"
            icon="file-text"
            color="#d7b26a"
            route="/factures"
          />
          <SectionTile
            title="HISTORIQUE D'USAGE"
            subtitle="Statistiques et timeline"
            icon="bar-chart-2"
            color="#d7b26a"
            route="/st"
          />
          <SectionTile
            title="ASSISTANCE & PANNES"
            subtitle="Alertes, incidents, dépannage"
            icon="alert-triangle"
            color="#d7b26a"
            route="/panne"
          />
          <SectionTile
            title="OPTIONS & ÉQUIPEMENTS"
            subtitle="Pneus, phares, batterie"
            icon="settings"
            color="#d7b26a"
            route="/pneus"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  contentBody: {
    flex: 1,
    backgroundColor: '#f2f5f8',
    paddingTop: Platform.OS === 'web' ? 20 : 50,
    paddingHorizontal: 16,
  },
  headerBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  appName: {
    fontSize: 24,
    fontWeight: '900',
    color: '#3498db',
  },
  userIdentity: {
    marginTop: 4,
    fontSize: 12,
    color: '#6c7a89',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  userBadge: {
    alignItems: 'center',
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#2c3e50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#f7d691',
    fontWeight: '900',
    fontSize: 14,
  },
  userBadgeName: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '800',
    color: '#2c3e50',
  },
  vehicleCardShadow: {
    borderRadius: 26,
    marginBottom: 14,
    shadowColor: '#0a1020',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 10,
  },
  vehicleCard: {
    minHeight: 190,
    borderRadius: 26,
    overflow: 'hidden',
    justifyContent: 'center',
    backgroundColor: '#0f1a2f',
  },
  vehicleBgImage: {
    opacity: 0.22,
    resizeMode: 'cover',
  },
  vehicleOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 15, 30, 0.72)',
  },
  vehicleContent: {
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  vehicleTitlePremium: {
    fontSize: 20,
    fontWeight: '900',
    color: '#e2c27d',
    letterSpacing: 1,
    marginBottom: 10,
  },
  vehicleLinePremium: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f2d49a',
    marginBottom: 6,
  },
  sectionsWrap: {
    marginTop: 8,
    gap: 10,
  },
  pendingHint: {
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: '#fff3cd',
    color: '#8a6d3b',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  successHint: {
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: '#d4edda',
    color: '#155724',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  sectionTile: {
    backgroundColor: '#0f3b46',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 6,
    borderWidth: 1,
    borderColor: '#1d5966',
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#124957',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: '#f6e3b4' },
  sectionSubtitle: { marginTop: 2, fontSize: 12, color: '#d5e6ea', fontWeight: '600' },
});