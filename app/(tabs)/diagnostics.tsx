import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Image, ImageBackground, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { STORAGE_DIAG_SCAN } from '../../constants/scanConstants';
import { UI_THEME } from '../../constants/uiTheme';
import { userGetItem } from '../../services/userStorage';

type DiagScanItem = {
  id: string;
  titre: string;
  notes: string;
  imageUri: string;
  createdAt: number;
  updatedAt?: number;
};

type DiagFolder = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  route: '/entretien';
};

const folders: DiagFolder[] = [
  {
    id: 'afaire',
    title: 'A FAIRE',
    subtitle: "Taches a traiter en priorite (pneus, batterie et phares inclus)",
    icon: 'clipboard-list-outline',
    route: '/entretien',
  },
];

export default function DiagnosticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [scanItems, setScanItems] = useState<DiagScanItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const raw = await userGetItem(STORAGE_DIAG_SCAN);
          if (cancelled) return;
          if (!raw) {
            setScanItems([]);
            return;
          }
          const parsed = JSON.parse(raw) as DiagScanItem[];
          setScanItems(Array.isArray(parsed) ? parsed : []);
        } catch {
          if (!cancelled) setScanItems([]);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
      <ImageBackground
        source={{ uri: 'https://images.unsplash.com/photo-1486754735734-325b5831c3ad?auto=format&fit=crop&w=1600&q=70' }}
        style={styles.heroBanner}
        imageStyle={styles.heroBannerImage}
      >
        <LinearGradient colors={['rgba(0,0,0,0.18)', 'rgba(0,0,0,0.72)', UI_THEME.bg]} locations={[0, 0.56, 1]} style={styles.heroOverlay}>
          <View style={styles.heroIconWrap}>
            <MaterialCommunityIcons name="alert-decagram-outline" size={28} color={UI_THEME.cyan} />
          </View>
          <Text style={styles.headerTitle}>Diagnostics et alertes</Text>
          <Text style={styles.heroSubtitle}>Surveillez les alertes et priorisez les actions importantes</Text>
        </LinearGradient>
      </ImageBackground>

      <View style={styles.listWrap}>
        {folders.map((folder) => (
          <Pressable
            key={folder.id}
            style={({ pressed }) => [styles.card, pressed && styles.scaleDown]}
            onPress={() => router.push(folder.route)}
          >
            <View style={styles.iconChip}>
              <MaterialCommunityIcons name={folder.icon} size={22} color={UI_THEME.cyan} />
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.cardTitle}>{folder.title}</Text>
              <Text style={styles.cardSubtitle}>{folder.subtitle}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#86efac" />
          </Pressable>
        ))}
      </View>

      {scanItems.length > 0 ? (
        <View style={styles.scanSection}>
          <Text style={styles.scanSectionTitle}>Scans rapides (IA)</Text>
          {scanItems.map((s) => (
            <View key={s.id} style={styles.scanCard}>
              {s.imageUri ? (
                <Image source={{ uri: s.imageUri }} style={styles.scanThumb} />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{s.titre}</Text>
                {s.notes ? <Text style={styles.scanNotes}>{s.notes}</Text> : null}
                <Text style={styles.scanDate}>
                  Créé le: {new Date(s.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                </Text>
                <Text style={styles.scanDate}>
                  Modifié le:{' '}
                  {new Date(s.updatedAt || s.createdAt).toLocaleString('fr-FR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_THEME.bg },
  heroBanner: {
    height: 140,
    marginHorizontal: 16,
    marginTop: 0,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: UI_THEME.cyanBorder,
  },
  heroBannerImage: { resizeMode: 'cover' },
  heroOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,242,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,242,255,0.4)',
    marginBottom: 8,
  },
  headerTitle: { fontSize: 23, fontWeight: '900', color: UI_THEME.textPrimary },
  heroSubtitle: { marginTop: 4, color: '#cbd5e1', fontSize: 12, textAlign: 'center' },
  listWrap: { padding: 16 },
  scaleDown: { transform: [{ scale: 0.98 }] },
  card: {
    backgroundColor: UI_THEME.glass,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: UI_THEME.cyanBorder,
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderWidth: 0.5,
    borderColor: UI_THEME.goldBorder,
  },
  cardTitle: { color: UI_THEME.textPrimary, fontWeight: '800', fontSize: 13 },
  cardSubtitle: { color: '#9fc6da', fontSize: 11, marginTop: 2 },
  scanSection: { paddingHorizontal: 16, paddingBottom: 24 },
  scanSectionTitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scanCard: {
    flexDirection: 'row',
    backgroundColor: UI_THEME.glass,
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: UI_THEME.goldBorder,
    gap: 10,
  },
  scanThumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#0f172a' },
  scanNotes: { color: '#cbd5e1', fontSize: 12, marginTop: 4, lineHeight: 18 },
  scanDate: { color: '#64748b', fontSize: 10, marginTop: 6 },
});

