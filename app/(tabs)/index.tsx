import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Image, ImageBackground, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View, } from 'react-native';

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
    glowColor,
    route,
    rightColumn,
  }: {
    title: string;
    subtitle: string;
    icon: React.ComponentProps<typeof Feather>['name'];
    glowColor: string;
    route: string;
    rightColumn?: boolean;
  }) => (
    <TouchableOpacity
      style={[
        styles.sectionTile,
        rightColumn ? styles.sectionTileRight : styles.sectionTileLeft,
        { shadowColor: glowColor, borderColor: glowColor },
      ]}
      onPress={() => handleGridPress(route)}
    >
      <View style={styles.sectionIconWrap}>
        <Feather name={icon} size={22} color="#D4AF37" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color="#D4AF37" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.bgBase} />
      <View style={styles.bgRadialCore} />
      <View style={styles.bgRadialSoft} />
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
              uri: 'https://images.unsplash.com/photo-1599901860904-17e6ed201b1a?q=80&w=600&auto=format&fit=crop',
            }}
            style={styles.vehicleCard}
            imageStyle={styles.vehicleBgImage}
          >
            <View style={styles.vehicleOverlay} />
            <View style={styles.vehicleGlassEdge} />
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
            glowColor="#D4AF37"
            route="/entretien"
          />
          <SectionTile
            title="DOCUMENTS"
            subtitle="Permis, carte grise, pièces"
            icon="folder"
            glowColor="#00F2FF"
            rightColumn
            route="/docs"
          />
          <SectionTile
            title="COMPTES & FACTURES"
            subtitle="Suivi dépenses et reçus"
            icon="file-text"
            glowColor="#D4AF37"
            route="/factures"
          />
          <SectionTile
            title="HISTORIQUE D'USAGE"
            subtitle="Statistiques et timeline"
            icon="bar-chart-2"
            glowColor="#00F2FF"
            rightColumn
            route="/st"
          />
          <SectionTile
            title="ASSISTANCE & PANNES"
            subtitle="Alertes, incidents, dépannage"
            icon="alert-triangle"
            glowColor="#D4AF37"
            route="/panne"
          />
          <SectionTile
            title="OPTIONS & ÉQUIPEMENTS"
            subtitle="Pneus, phares, batterie"
            icon="settings"
            glowColor="#00F2FF"
            rightColumn
            route="/pneus"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E11' },
  bgBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A0E11',
  },
  bgRadialCore: {
    position: 'absolute',
    top: -180,
    alignSelf: 'center',
    width: 620,
    height: 620,
    borderRadius: 310,
    backgroundColor: '#1A1F25',
    opacity: 0.35,
  },
  bgRadialSoft: {
    position: 'absolute',
    top: -60,
    alignSelf: 'center',
    width: 480,
    height: 480,
    borderRadius: 240,
    backgroundColor: '#1A1F25',
    opacity: 0.22,
  },
  contentBody: {
    flex: 1,
    backgroundColor: 'transparent',
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
    color: '#e9edf2',
  },
  userIdentity: {
    marginTop: 4,
    fontSize: 12,
    color: '#95a1ad',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 10,
  },
  vehicleCard: {
    minHeight: 190,
    borderRadius: 26,
    overflow: 'hidden',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  vehicleBgImage: {
    opacity: 0.1,
    resizeMode: 'cover',
    width: '62%',
    alignSelf: 'flex-end',
  },
  vehicleOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
  },
  vehicleGlassEdge: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  vehicleContent: {
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  vehicleTitlePremium: {
    fontSize: 20,
    fontWeight: '900',
    color: '#D4AF37',
    letterSpacing: 1,
    marginBottom: 10,
  },
  vehicleLinePremium: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D4AF37',
    marginBottom: 6,
  },
  sectionsWrap: {
    marginTop: 8,
    gap: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
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
    width: '48%',
    backgroundColor: '#111111',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 14,
    minHeight: 120,
    borderWidth: 0.5,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  sectionTileLeft: {
    shadowColor: '#D4AF37',
  },
  sectionTileRight: {
    shadowColor: '#00F2FF',
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#171717',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#e7cea2' },
  sectionSubtitle: { marginTop: 4, fontSize: 11, color: '#f7f5ef', fontWeight: '400' },
});