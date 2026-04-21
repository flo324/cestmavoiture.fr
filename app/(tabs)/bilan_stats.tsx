import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef } from 'react';
import { BackHandler, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { OttoDossierFrame } from '../../components/OttoDossierFrame';
import { STORAGE_ESSENCE_LOGS } from '../../constants/depensesConstants';
import { userGetItem, userSetItem } from '../../services/userStorage';

const RETURN_TO_FOLDERS_FLAG = '@otto_open_folders_on_return';
const BILAN_BG = {
  global: 'https://images.unsplash.com/photo-1493238792000-8113da705763?auto=format&fit=crop&w=1400&q=80',
  stats: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1400&q=80',
  preventive: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1400&q=80',
} as const;

export default function BilanStatsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const allowLeaveRef = useRef(false);
  const [essenceMonth, setEssenceMonth] = React.useState(0);
  const [essenceYear, setEssenceYear] = React.useState(0);

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

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const raw = await userGetItem(STORAGE_ESSENCE_LOGS);
          const parsed = raw ? (JSON.parse(raw) as { amount: number; createdAt: number }[]) : [];
          const now = new Date();
          let month = 0;
          let year = 0;
          for (const item of parsed) {
            if (!Number.isFinite(item?.amount) || !Number.isFinite(item?.createdAt)) continue;
            const d = new Date(item.createdAt);
            if (d.getFullYear() === now.getFullYear()) {
              year += item.amount;
              if (d.getMonth() === now.getMonth()) month += item.amount;
            }
          }
          setEssenceMonth(Math.round(month * 100) / 100);
          setEssenceYear(Math.round(year * 100) / 100);
        } catch {
          setEssenceMonth(0);
          setEssenceYear(0);
        }
      })();
    }, [])
  );

  return (
    <OttoDossierFrame>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.card}>
          <ImageBackground source={{ uri: BILAN_BG.global }} style={styles.cardPhoto} imageStyle={styles.cardPhotoImage}>
            <LinearGradient
              colors={['rgba(8,15,28,0.52)', 'rgba(8,15,28,0.18)', 'rgba(8,15,28,0.62)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardPhotoOverlay}
            />
          </ImageBackground>
          <View style={[styles.iconWrap, styles.iconWrapPhoto]}>
            <MaterialCommunityIcons name="car-info" size={22} color="#e2e8f0" />
          </View>
          <View style={styles.textCol}>
            <Text style={[styles.title, styles.textPhoto]}>Bilan général</Text>
            <Text style={[styles.sub, styles.subPhoto, styles.textPhoto]}>État global du véhicule et points d’attention.</Text>
          </View>
        </Pressable>

        <Pressable style={styles.card}>
          <ImageBackground source={{ uri: BILAN_BG.stats }} style={styles.cardPhoto} imageStyle={styles.cardPhotoImage}>
            <LinearGradient
              colors={['rgba(8,15,28,0.52)', 'rgba(8,15,28,0.18)', 'rgba(8,15,28,0.62)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardPhotoOverlay}
            />
          </ImageBackground>
          <View style={[styles.iconWrap, styles.iconWrapPhoto]}>
            <MaterialCommunityIcons name="chart-line" size={22} color="#e2e8f0" />
          </View>
          <View style={styles.textCol}>
            <Text style={[styles.title, styles.textPhoto]}>Statistiques de conduite</Text>
            <Text style={[styles.sub, styles.subPhoto, styles.textPhoto]}>Kilométrage, usage et évolution dans le temps.</Text>
          </View>
        </Pressable>

        <Pressable style={styles.card}>
          <ImageBackground source={{ uri: BILAN_BG.preventive }} style={styles.cardPhoto} imageStyle={styles.cardPhotoImage}>
            <LinearGradient
              colors={['rgba(8,15,28,0.52)', 'rgba(8,15,28,0.18)', 'rgba(8,15,28,0.62)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardPhotoOverlay}
            />
          </ImageBackground>
          <View style={[styles.iconWrap, styles.iconWrapPhoto]}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={22} color="#e2e8f0" />
          </View>
          <View style={styles.textCol}>
            <Text style={[styles.title, styles.textPhoto]}>Synthèse préventive</Text>
            <Text style={[styles.sub, styles.subPhoto, styles.textPhoto]}>Historique, rappels et suivi des actions recommandées.</Text>
          </View>
        </Pressable>

        <Pressable style={({ pressed }) => [styles.card, pressed && styles.scaleDown]} onPress={() => router.push('/essence_stats')}>
          <ImageBackground source={{ uri: BILAN_BG.stats }} style={styles.cardPhoto} imageStyle={styles.cardPhotoImage}>
            <LinearGradient
              colors={['rgba(8,15,28,0.52)', 'rgba(8,15,28,0.18)', 'rgba(8,15,28,0.62)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardPhotoOverlay}
            />
          </ImageBackground>
          <View style={[styles.iconWrap, styles.iconWrapPhoto]}>
            <MaterialCommunityIcons name="gas-station" size={22} color="#e2e8f0" />
          </View>
          <View style={styles.textCol}>
            <Text style={[styles.title, styles.textPhoto]}>Essence par mois et par an</Text>
            <Text style={[styles.sub, styles.subPhoto, styles.textPhoto]}>
              Mois en cours: {essenceMonth.toFixed(2)} € • Année en cours: {essenceYear.toFixed(2)} €
            </Text>
          </View>
        </Pressable>
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
  scaleDown: { transform: [{ scale: 0.992 }] },
  card: {
    minHeight: 92,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.42)',
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
    backgroundColor: 'rgba(191,219,254,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.78)',
  },
  iconWrapPhoto: {
    backgroundColor: 'rgba(15,23,42,0.45)',
    borderColor: 'rgba(226,232,240,0.34)',
  },
  textCol: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  title: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  sub: {
    marginTop: 4,
    color: '#475569',
    fontSize: 11,
    fontWeight: '500',
  },
  subPhoto: {
    color: 'rgba(226,232,240,0.94)',
  },
  textPhoto: {
    color: '#f8fafc',
    textShadowColor: 'rgba(2,6,23,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
