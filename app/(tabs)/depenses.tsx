import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef } from 'react';
import { BackHandler, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ElectricPressable } from '../../components/ElectricPressable';
import { OttoDossierFrame } from '../../components/OttoDossierFrame';
import { userSetItem } from '../../services/userStorage';

const RETURN_TO_FOLDERS_FLAG = '@otto_open_folders_on_return';
const DEPENSES_BG = {
  essence: 'https://images.unsplash.com/photo-1551269901-5c5e14c25df7?auto=format&fit=crop&w=1400&q=80',
  assurances: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1400&q=80',
  reparations: 'https://images.unsplash.com/photo-1486006920555-c77dcf18193c?auto=format&fit=crop&w=1400&q=80',
} as const;

export default function DepensesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const allowLeaveRef = useRef(false);
  const backNavLockRef = useRef(false);

  const goToFolders = useCallback(() => {
    if (backNavLockRef.current) return;
    backNavLockRef.current = true;
    allowLeaveRef.current = true;
    void userSetItem(RETURN_TO_FOLDERS_FLAG, '1');
    router.replace('/(tabs)');
    setTimeout(() => {
      backNavLockRef.current = false;
    }, 280);
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
    <OttoDossierFrame>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ElectricPressable style={styles.card} borderRadius={16} onPress={() => router.push('/essence')}>
          <ImageBackground source={{ uri: DEPENSES_BG.essence }} style={styles.cardPhoto} imageStyle={styles.cardPhotoImage}>
            <LinearGradient
              colors={['rgba(8,15,28,0.52)', 'rgba(8,15,28,0.18)', 'rgba(8,15,28,0.62)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardPhotoOverlay}
            />
          </ImageBackground>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="gas-station" size={22} color="#e2e8f0" />
          </View>
          <View style={styles.textCol}>
            <Text style={styles.title}>Essence</Text>
            <Text style={styles.sub}>Saisir et suivre les pleins de carburant.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#f8fafc" />
        </ElectricPressable>

        <ElectricPressable style={styles.card} borderRadius={16} onPress={() => router.push('/assurances')}>
          <ImageBackground source={{ uri: DEPENSES_BG.assurances }} style={styles.cardPhoto} imageStyle={styles.cardPhotoImage}>
            <LinearGradient
              colors={['rgba(8,15,28,0.52)', 'rgba(8,15,28,0.18)', 'rgba(8,15,28,0.62)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardPhotoOverlay}
            />
          </ImageBackground>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="shield-check-outline" size={22} color="#e2e8f0" />
          </View>
          <View style={styles.textCol}>
            <Text style={styles.title}>Assurances</Text>
            <Text style={styles.sub}>Regrouper les informations d'assurance.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#f8fafc" />
        </ElectricPressable>

        <ElectricPressable style={styles.card} borderRadius={16} onPress={() => router.push('/factures')}>
          <ImageBackground source={{ uri: DEPENSES_BG.reparations }} style={styles.cardPhoto} imageStyle={styles.cardPhotoImage}>
            <LinearGradient
              colors={['rgba(8,15,28,0.52)', 'rgba(8,15,28,0.18)', 'rgba(8,15,28,0.62)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardPhotoOverlay}
            />
          </ImageBackground>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="wrench-outline" size={22} color="#e2e8f0" />
          </View>
          <View style={styles.textCol}>
            <Text style={styles.title}>Reparations</Text>
            <Text style={styles.sub}>Creer des dossiers de factures de reparations.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#f8fafc" />
        </ElectricPressable>
      </ScrollView>
    </OttoDossierFrame>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 4,
    paddingBottom: 20,
    gap: 10,
  },
  card: {
    minHeight: 86,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.46)',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  cardPhoto: {
    ...StyleSheet.absoluteFillObject,
  },
  cardPhotoImage: {
    resizeMode: 'cover',
  },
  cardPhotoOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.34)',
  },
  textCol: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  title: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.1,
    textShadowColor: 'rgba(2,6,23,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  sub: {
    marginTop: 4,
    color: 'rgba(226,232,240,0.94)',
    fontSize: 11,
    fontWeight: '500',
    textShadowColor: 'rgba(2,6,23,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});

