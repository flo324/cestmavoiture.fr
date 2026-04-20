import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { OttoDossierFrame } from '../../components/OttoDossierFrame';
import { STORAGE_PENDING_PERMIS_FROM_SCAN } from '../../constants/scanConstants';
import {
  deleteScanDocFromSupabase,
  fetchScanDocsFromSupabase,
  upsertSingleScanDocToSupabase,
} from '../../services/scanDocumentSupabase';
import { userGetItem, userRemoveItem, userSetItem } from '../../services/userStorage';

const STORAGE_KEY_PERMIS = '@ma_voiture_permis_data';

type PermisDoc = {
  imageUri: string;
  createdAt: string;
  updatedAt: string;
  supabaseId?: string | null;
};

function nowFr(): string {
  return new Date().toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function payloadImage(payload: Record<string, unknown>): string {
  const imageUri = payload?.imageUri;
  if (typeof imageUri === 'string' && imageUri.trim()) return imageUri.trim();
  const image = payload?.image;
  if (typeof image === 'string' && image.trim()) return image.trim();
  return '';
}

export default function ScanPermis() {
  const router = useRouter();
  const navigation = useNavigation();
  const allowLeaveRef = useRef(false);
  const [doc, setDoc] = useState<PermisDoc | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const params = useLocalSearchParams<{
    imageCaptured?: string;
    fromGlobalScan?: string;
    pendingFromScan?: string;
  }>();

  const goDocs = useCallback(() => {
    allowLeaveRef.current = true;
    router.replace('/docs');
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
        goDocs();
        return true;
      });
      return () => sub.remove();
    }, [goDocs])
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current) return;
      event.preventDefault();
      goDocs();
    });
    return unsubscribe;
  }, [goDocs, navigation]);

  const persistDoc = useCallback(async (next: PermisDoc) => {
    setDoc(next);
    await userSetItem(STORAGE_KEY_PERMIS, JSON.stringify(next));
    const supabaseId = await upsertSingleScanDocToSupabase({
      vehicleId: null,
      docType: 'permis',
      title: 'Permis de conduire',
      payload: {
        imageUri: next.imageUri,
        createdAt: next.createdAt,
        updatedAt: next.updatedAt,
      },
    });
    if (supabaseId && next.supabaseId !== supabaseId) {
      const synced = { ...next, supabaseId };
      setDoc(synced);
      await userSetItem(STORAGE_KEY_PERMIS, JSON.stringify(synced));
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const localRaw = await userGetItem(STORAGE_KEY_PERMIS);
        let localDoc: PermisDoc | null = null;
        if (localRaw) {
          const parsed = JSON.parse(localRaw) as Partial<PermisDoc>;
          if (typeof parsed.imageUri === 'string' && parsed.imageUri.trim()) {
            localDoc = {
              imageUri: parsed.imageUri.trim(),
              createdAt: parsed.createdAt || nowFr(),
              updatedAt: parsed.updatedAt || parsed.createdAt || nowFr(),
              supabaseId: parsed.supabaseId ?? null,
            };
          }
        }

        const remote = await fetchScanDocsFromSupabase({ docType: 'permis', vehicleId: null });
        if (remote.length > 0) {
          const first = remote[0];
          const uri = payloadImage((first.payload ?? {}) as Record<string, unknown>);
          if (uri) {
            const remoteDoc: PermisDoc = {
              imageUri: uri,
              createdAt: first.created_at || nowFr(),
              updatedAt: first.updated_at || first.created_at || nowFr(),
              supabaseId: first.id,
            };
            setDoc(remoteDoc);
            await userSetItem(STORAGE_KEY_PERMIS, JSON.stringify(remoteDoc));
            return;
          }
        }

        setDoc(localDoc);
      } catch {
        setDoc(null);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const fromGlobal = params.fromGlobalScan === '1';
      if (!fromGlobal) return;

      let incomingUri = '';
      if (params.pendingFromScan === '1') {
        const pending = await userGetItem(STORAGE_PENDING_PERMIS_FROM_SCAN);
        if (typeof pending === 'string' && pending.trim()) incomingUri = pending.trim();
        if (incomingUri) await userRemoveItem(STORAGE_PENDING_PERMIS_FROM_SCAN);
      }
      if (!incomingUri && typeof params.imageCaptured === 'string' && params.imageCaptured.trim()) {
        incomingUri = params.imageCaptured.trim();
      }
      if (!incomingUri) return;

      const existingCreatedAt = doc?.createdAt || nowFr();
      const next: PermisDoc = {
        imageUri: incomingUri,
        createdAt: existingCreatedAt,
        updatedAt: nowFr(),
        supabaseId: doc?.supabaseId ?? null,
      };
      await persistDoc(next);
      Alert.alert('Permis enregistré', 'Photo du permis sauvegardée avec succès.');
    })();
  }, [doc?.createdAt, doc?.supabaseId, params.fromGlobalScan, params.imageCaptured, params.pendingFromScan, persistDoc]);

  const removePermis = useCallback(async () => {
    try {
      if (doc?.supabaseId) {
        await deleteScanDocFromSupabase(doc.supabaseId);
      } else {
        const all = await fetchScanDocsFromSupabase({ docType: 'permis', vehicleId: null });
        await Promise.all(all.map((d) => deleteScanDocFromSupabase(d.id)));
      }
      await userRemoveItem(STORAGE_KEY_PERMIS);
      setDoc(null);
    } catch {
      Alert.alert('Erreur', 'Impossible de supprimer le permis.');
    }
  }, [doc?.supabaseId]);

  return (
    <OttoDossierFrame>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {doc?.imageUri ? (
          <>
            <View style={styles.headerCard}>
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(31,110,255,0.14)', 'rgba(89,199,255,0.08)', 'rgba(255,255,255,0.97)']}
                locations={[0, 0.58, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.headerIcon}>
                <MaterialCommunityIcons name="card-account-details-outline" size={20} color="#0284c7" />
              </View>
              <Text style={styles.title}>Permis de conduire</Text>
              <Text style={styles.subTitle}>Un seul document par compte</Text>
            </View>

            <View style={styles.photoCard}>
              <Pressable onPress={() => setModalVisible(true)} style={({ pressed }) => [styles.previewWrap, pressed && styles.scaleDown]}>
                <Image source={{ uri: doc.imageUri }} style={styles.previewImage} />
                <Text style={styles.previewHint}>Appuyer pour agrandir</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.emptyOnlyCard}>
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(37,99,235,0.1)', 'rgba(148,163,184,0.08)', 'rgba(255,255,255,0.98)']}
              locations={[0, 0.6, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.emptyOnlyIconWrap}>
              <MaterialCommunityIcons name="card-account-details-outline" size={20} color="#1d4ed8" />
            </View>
            <Text style={styles.emptyOnlyText}>Aucun permis enregistré, un seul document par compte.</Text>
          </View>
        )}

        {doc ? (
          <View style={styles.metaCard}>
            <Text style={styles.metaLine}>Créé le: {doc.createdAt || '-'}</Text>
            <Text style={styles.metaLine}>Modifié le: {doc.updatedAt || '-'}</Text>
          </View>
        ) : null}

        {doc ? (
          <Pressable
            style={({ pressed }) => [styles.deleteBtn, pressed && styles.scaleDown]}
            onPress={() =>
              Alert.alert('Supprimer le permis ?', 'Cette action supprimera le document local et Supabase.', [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Supprimer', style: 'destructive', onPress: () => void removePermis() },
              ])
            }
          >
            <MaterialCommunityIcons name="trash-can-outline" size={18} color="#ef4444" />
            <Text style={styles.deleteTxt}>SUPPRIMER LE DOCUMENT</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBg}>
          <Pressable style={styles.closeBtn} onPress={() => setModalVisible(false)}>
            <MaterialCommunityIcons name="close-circle" size={44} color="#fff" />
          </Pressable>
          {doc?.imageUri ? <Image source={{ uri: doc.imageUri }} style={styles.fullImage} resizeMode="contain" /> : null}
        </View>
      </Modal>
    </OttoDossierFrame>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 4,
    paddingBottom: 24,
    gap: 10,
  },
  scaleDown: { transform: [{ scale: 0.98 }] },
  headerCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.26)',
    backgroundColor: '#ffffff',
    padding: 14,
    alignItems: 'center',
    overflow: 'hidden',
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(186,230,253,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.78)',
    marginBottom: 8,
  },
  title: {
    color: '#0c4a6e',
    fontSize: 18,
    fontWeight: '900',
  },
  subTitle: {
    color: '#0369a1',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  photoCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.22)',
    backgroundColor: '#ffffff',
    padding: 12,
  },
  previewWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.36)',
  },
  previewImage: { width: '100%', height: 210, backgroundColor: '#e2e8f0' },
  previewHint: {
    textAlign: 'center',
    paddingVertical: 8,
    color: '#0369a1',
    fontWeight: '700',
    fontSize: 12,
    backgroundColor: '#f8fafc',
  },
  emptyBox: {
    height: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(14,165,233,0.4)',
    backgroundColor: 'rgba(239,246,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    gap: 6,
  },
  emptyTitle: { color: '#0c4a6e', fontSize: 14, fontWeight: '800' },
  emptySub: { color: '#475569', fontSize: 12, textAlign: 'center' },
  emptyOnlyCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    gap: 8,
  },
  emptyOnlyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(219,234,254,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.34)',
  },
  emptyOnlyText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  metaCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.22)',
    backgroundColor: '#ffffff',
    padding: 12,
  },
  metaLine: {
    color: '#475569',
    fontSize: 12,
    marginBottom: 4,
  },
  deleteBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
    backgroundColor: 'rgba(254,242,242,0.95)',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  deleteTxt: {
    color: '#dc2626',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  closeBtn: { position: 'absolute', top: 48, right: 20, zIndex: 2 },
  fullImage: { width: '100%', height: '85%' },
});
