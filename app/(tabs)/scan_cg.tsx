import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { OttoDossierFrame } from '../../components/OttoDossierFrame';
import { STORAGE_PENDING_CG_FROM_SCAN, STORAGE_SCAN_FORCED_TARGET } from '../../constants/scanConstants';
import {
  deleteScanDocFromSupabase,
  fetchScanDocsFromSupabase,
  insertScanDocToSupabase,
} from '../../services/scanDocumentSupabase';
import { userGetItem, userRemoveItem, userSetItem } from '../../services/userStorage';

const STORAGE_KEY_CG_LIST = '@ma_voiture_cg_docs_v2';
const LEGACY_STORAGE_KEY_CG = '@ma_voiture_cg_data_complete';

type CgDoc = {
  id: string;
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

export default function ScanCG() {
  const router = useRouter();
  const navigation = useNavigation();
  const allowLeaveRef = useRef(false);
  const [docs, setDocs] = useState<CgDoc[]>([]);
  const [previewDoc, setPreviewDoc] = useState<CgDoc | null>(null);

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
      void userSetItem(STORAGE_SCAN_FORCED_TARGET, 'cg');
      return () => {
        void userRemoveItem(STORAGE_SCAN_FORCED_TARGET).catch(() => {});
      };
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

  useEffect(() => {
    (async () => {
      try {
        const listRaw = await userGetItem(STORAGE_KEY_CG_LIST);
        let localDocs: CgDoc[] = [];
        if (listRaw) {
          const parsed = JSON.parse(listRaw) as CgDoc[];
          if (Array.isArray(parsed)) localDocs = parsed.filter((d) => typeof d.imageUri === 'string' && d.imageUri.trim());
        } else {
          const legacyRaw = await userGetItem(LEGACY_STORAGE_KEY_CG);
          if (legacyRaw) {
            const legacy = JSON.parse(legacyRaw) as { image?: string; meta?: Record<string, string> };
            if (legacy?.image) {
              localDocs = [
                {
                  id: `legacy-${Date.now()}`,
                  imageUri: legacy.image,
                  createdAt: legacy.meta?.createdAt || nowFr(),
                  updatedAt: legacy.meta?.updatedAt || legacy.meta?.createdAt || nowFr(),
                  supabaseId: null,
                },
              ];
            }
          }
        }

        const remote = await fetchScanDocsFromSupabase({ docType: 'carte_grise', vehicleId: null });
        if (remote.length > 0) {
          const mapped: CgDoc[] = remote
            .map((r) => {
              const uri = payloadImage((r.payload ?? {}) as Record<string, unknown>);
              if (!uri) return null;
              return {
                id: `sb-${r.id}`,
                imageUri: uri,
                createdAt: r.created_at || nowFr(),
                updatedAt: r.updated_at || r.created_at || nowFr(),
                supabaseId: r.id,
              } as CgDoc;
            })
            .filter((v): v is CgDoc => v != null);
          setDocs(mapped);
          await userSetItem(STORAGE_KEY_CG_LIST, JSON.stringify(mapped));
          return;
        }

        setDocs(localDocs);
        await userSetItem(STORAGE_KEY_CG_LIST, JSON.stringify(localDocs));
      } catch {
        setDocs([]);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const fromGlobal = params.fromGlobalScan === '1';
      if (!fromGlobal) return;

      let incomingUri = '';
      if (params.pendingFromScan === '1') {
        const pending = await userGetItem(STORAGE_PENDING_CG_FROM_SCAN);
        if (typeof pending === 'string' && pending.trim()) incomingUri = pending.trim();
        if (incomingUri) await userRemoveItem(STORAGE_PENDING_CG_FROM_SCAN);
      }
      if (!incomingUri && typeof params.imageCaptured === 'string' && params.imageCaptured.trim()) {
        incomingUri = params.imageCaptured.trim();
      }
      if (!incomingUri) return;

      const base: CgDoc = {
        id: `local-${Date.now()}`,
        imageUri: incomingUri,
        createdAt: nowFr(),
        updatedAt: nowFr(),
        supabaseId: null,
      };
      setDocs((prev) => {
        const next = [base, ...prev];
        void userSetItem(STORAGE_KEY_CG_LIST, JSON.stringify(next));
        return next;
      });

      const supabaseId = await insertScanDocToSupabase({
        vehicleId: null,
        docType: 'carte_grise',
        title: 'Carte grise',
        payload: {
          imageUri: base.imageUri,
          createdAt: base.createdAt,
          updatedAt: base.updatedAt,
        },
      });
      if (supabaseId) {
        setDocs((prev) => {
          const next = prev.map((d) => (d.id === base.id ? { ...d, id: `sb-${supabaseId}`, supabaseId } : d));
          void userSetItem(STORAGE_KEY_CG_LIST, JSON.stringify(next));
          return next;
        });
      }

      Alert.alert('Carte grise ajoutée', 'La photo a été enregistrée.');
    })();
  }, [params.fromGlobalScan, params.imageCaptured, params.pendingFromScan]);

  const removeDoc = useCallback(async (doc: CgDoc) => {
    try {
      if (doc.supabaseId) await deleteScanDocFromSupabase(doc.supabaseId);
      setDocs((prev) => {
        const next = prev.filter((d) => d.id !== doc.id);
        void userSetItem(STORAGE_KEY_CG_LIST, JSON.stringify(next));
        return next;
      });
      if (previewDoc?.id === doc.id) setPreviewDoc(null);
    } catch {
      Alert.alert('Erreur', 'Impossible de supprimer ce document.');
    }
  }, [previewDoc?.id]);

  return (
    <OttoDossierFrame>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
            <MaterialCommunityIcons name="file-document-outline" size={20} color="#0284c7" />
          </View>
          <Text style={styles.title}>Carte grise</Text>
          <Text style={styles.subTitle}>Vous pouvez enregistrer plusieurs documents</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.createBtn, pressed && styles.scaleDown]}
          onPress={() => {
            void userSetItem(STORAGE_SCAN_FORCED_TARGET, 'cg');
            router.push('/scan');
          }}
        >
          <MaterialCommunityIcons name="camera-outline" size={18} color="#fff" />
          <Text style={styles.createBtnTxt}>OTTO SCAN: AJOUTER UNE CARTE GRISE</Text>
        </Pressable>
        <View style={styles.scanHintRow}>
          <MaterialCommunityIcons name="arrow-down-circle-outline" size={16} color="#1d4ed8" />
          <Text style={styles.scanHintText}>Appuyez aussi sur le bouton OTTO SCAN en bas pour la photo</Text>
        </View>

        {docs.length === 0 ? (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="camera-outline" size={26} color="#0284c7" />
            <Text style={styles.emptyTitle}>Aucune carte grise enregistrée</Text>
            <Text style={styles.emptySub}>Utilisez le bouton de création pour ajouter une photo.</Text>
          </View>
        ) : (
          docs.map((doc) => (
            <View key={doc.id} style={styles.docCard}>
              <Pressable onPress={() => setPreviewDoc(doc)} style={({ pressed }) => [styles.previewWrap, pressed && styles.scaleDown]}>
                <Image source={{ uri: doc.imageUri }} style={styles.previewImage} />
              </Pressable>
              <Text style={styles.metaLine}>Créé le: {doc.createdAt || '-'}</Text>
              <Text style={styles.metaLine}>Modifié le: {doc.updatedAt || '-'}</Text>
              <Pressable
                style={({ pressed }) => [styles.deleteBtn, pressed && styles.scaleDown]}
                onPress={() =>
                  Alert.alert('Supprimer ?', 'Supprimer cette carte grise (local + Supabase) ?', [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Supprimer', style: 'destructive', onPress: () => void removeDoc(doc) },
                  ])
                }
              >
                <MaterialCommunityIcons name="trash-can-outline" size={18} color="#ef4444" />
                <Text style={styles.deleteTxt}>SUPPRIMER</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={previewDoc != null} transparent animationType="fade" onRequestClose={() => setPreviewDoc(null)}>
        <View style={styles.modalBg}>
          <Pressable style={styles.closeBtn} onPress={() => setPreviewDoc(null)}>
            <MaterialCommunityIcons name="close-circle" size={44} color="#fff" />
          </Pressable>
          {previewDoc?.imageUri ? <Image source={{ uri: previewDoc.imageUri }} style={styles.fullImage} resizeMode="contain" /> : null}
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
    textAlign: 'center',
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
  createBtn: {
    borderRadius: 12,
    backgroundColor: '#1d4ed8',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  createBtnTxt: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  scanHintRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  scanHintText: {
    color: '#1e3a8a',
    fontSize: 11,
    fontWeight: '700',
  },
  docCard: {
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
    marginBottom: 8,
  },
  previewImage: { width: '100%', height: 180, backgroundColor: '#e2e8f0' },
  metaLine: {
    color: '#475569',
    fontSize: 12,
    marginBottom: 4,
  },
  deleteBtn: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
    backgroundColor: 'rgba(254,242,242,0.95)',
    paddingVertical: 10,
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
