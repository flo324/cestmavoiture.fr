import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, ImageBackground, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ElectricPressable } from '../../components/ElectricPressable';
import { OttoDossierFrame } from '../../components/OttoDossierFrame';
import { userGetItem, userSetItem } from '../../services/userStorage';

const RETURN_TO_FOLDERS_FLAG = '@otto_open_folders_on_return';
const CUSTOM_WEAR_FOLDERS_KEY = '@otto_usure_custom_folders_v1';
const WEAR_BG: Partial<Record<WearCard['action'], string>> = {
  phares: 'https://source.unsplash.com/1400x900/?car,headlight,luxury',
  pneus: 'https://source.unsplash.com/1400x900/?car,tire,road',
  batterie: 'https://source.unsplash.com/1400x900/?car,battery,engine',
};

type WearCard = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  action: 'phares' | 'pneus' | 'batterie' | 'new' | 'custom';
};

type CustomWearFolder = {
  id: string;
  title: string;
  createdAt: number;
};

type WearPalette = {
  gradient: [string, string, string];
  cardBorder: string;
  iconBg: string;
  iconBorder: string;
  iconColor: string;
  chevronColor: string;
  titleColor: string;
  subColor: string;
};

function getWearPalette(action: WearCard['action']): WearPalette {
  if (action === 'phares') {
    return {
      gradient: ['rgba(56,189,248,0.24)', 'rgba(125,211,252,0.16)', 'rgba(255,255,255,0.98)'],
      cardBorder: 'rgba(56,189,248,0.44)',
      iconBg: 'rgba(186,230,253,0.55)',
      iconBorder: 'rgba(56,189,248,0.36)',
      iconColor: '#0369a1',
      chevronColor: '#0369a1',
      titleColor: '#0f172a',
      subColor: '#475569',
    };
  }
  if (action === 'pneus') {
    return {
      gradient: ['rgba(99,102,241,0.24)', 'rgba(165,180,252,0.16)', 'rgba(255,255,255,0.98)'],
      cardBorder: 'rgba(99,102,241,0.44)',
      iconBg: 'rgba(224,231,255,0.55)',
      iconBorder: 'rgba(129,140,248,0.34)',
      iconColor: '#4338ca',
      chevronColor: '#4338ca',
      titleColor: '#0f172a',
      subColor: '#475569',
    };
  }
  if (action === 'batterie') {
    return {
      gradient: ['rgba(59,130,246,0.24)', 'rgba(147,197,253,0.16)', 'rgba(255,255,255,0.98)'],
      cardBorder: 'rgba(59,130,246,0.44)',
      iconBg: 'rgba(219,234,254,0.55)',
      iconBorder: 'rgba(96,165,250,0.34)',
      iconColor: '#2563eb',
      chevronColor: '#2563eb',
      titleColor: '#0f172a',
      subColor: '#475569',
    };
  }
  return {
    gradient: ['rgba(37,99,235,0.2)', 'rgba(125,211,252,0.14)', 'rgba(255,255,255,0.98)'],
    cardBorder: 'rgba(96,165,250,0.42)',
    iconBg: 'rgba(191,219,254,0.55)',
    iconBorder: 'rgba(147,197,253,0.36)',
    iconColor: '#0369a1',
    chevronColor: '#1d4ed8',
    titleColor: '#0f172a',
    subColor: '#475569',
  };
}

export default function UsureScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const allowLeaveRef = useRef(false);
  const [customFolders, setCustomFolders] = useState<CustomWearFolder[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newFolderTitle, setNewFolderTitle] = useState('');

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
        if (modalVisible) {
          setModalVisible(false);
          return true;
        }
        goToFolders();
        return true;
      });
      return () => sub.remove();
    }, [goToFolders, modalVisible])
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current) return;
      event.preventDefault();
      goToFolders();
    });
    return unsubscribe;
  }, [goToFolders, navigation]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await userGetItem(CUSTOM_WEAR_FOLDERS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as CustomWearFolder[];
        if (Array.isArray(parsed)) setCustomFolders(parsed);
      } catch {
        setCustomFolders([]);
      }
    })();
  }, []);

  useEffect(() => {
    void userSetItem(CUSTOM_WEAR_FOLDERS_KEY, JSON.stringify(customFolders));
  }, [customFolders]);

  const baseCards: WearCard[] = useMemo(
    () => [
      {
        id: 'phares',
        title: 'Phares',
        subtitle: 'Suivi ampoules et remplacements',
        icon: 'car-light-high',
        action: 'phares',
      },
      {
        id: 'pneus',
        title: 'Pneus',
        subtitle: 'Usure, montage et historique',
        icon: 'tire',
        action: 'pneus',
      },
      {
        id: 'batterie',
        title: 'Batterie',
        subtitle: 'Etat, age et risques de panne',
        icon: 'car-battery',
        action: 'batterie',
      },
      {
        id: 'new-folder',
        title: 'Créer un nouveau dossier',
        subtitle: 'Ajouter un dossier personnalise',
        icon: 'folder-plus',
        action: 'new',
      },
    ],
    []
  );

  const allCards: WearCard[] = useMemo(
    () => [
      ...baseCards,
      ...customFolders.map((f) => ({
        id: f.id,
        title: f.title,
        subtitle: `Dossier personnalise (${new Date(f.createdAt).toLocaleDateString('fr-FR')})`,
        icon: 'folder-outline',
        action: 'custom' as const,
      })),
    ],
    [baseCards, customFolders]
  );

  const openCard = (item: WearCard) => {
    if (item.action === 'phares') {
      router.push('/phares');
      return;
    }
    if (item.action === 'pneus') {
      router.push('/pneus');
      return;
    }
    if (item.action === 'batterie') {
      router.push('/batterie');
      return;
    }
    if (item.action === 'new') {
      setModalVisible(true);
      return;
    }
  };

  const createFolder = () => {
    const title = newFolderTitle.trim();
    if (!title) return;
    const now = Date.now();
    setCustomFolders((prev) => [{ id: `wear-custom-${now}`, title, createdAt: now }, ...prev]);
    setNewFolderTitle('');
    setModalVisible(false);
  };

  return (
    <OttoDossierFrame>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {allCards.map((item) => {
          const palette = getWearPalette(item.action);
          const bgUri = WEAR_BG[item.action];
          const hasPhoto = Boolean(bgUri);
          return (
          <ElectricPressable
            key={item.id}
            style={[styles.card, { borderColor: palette.cardBorder }]}
            borderRadius={16}
            onPress={() => openCard(item)}
          >
            {hasPhoto ? (
              <ImageBackground source={{ uri: bgUri }} style={styles.cardPhoto} imageStyle={styles.cardPhotoImage}>
                <LinearGradient
                  colors={['rgba(8,15,28,0.52)', 'rgba(8,15,28,0.18)', 'rgba(8,15,28,0.62)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cardPhotoOverlay}
                />
              </ImageBackground>
            ) : (
              <LinearGradient
                pointerEvents="none"
                colors={palette.gradient}
                locations={[0, 0.6, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardBlueNuance}
              />
            )}
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: palette.iconBg, borderColor: palette.iconBorder },
                hasPhoto && styles.iconWrapPhoto,
              ]}
            >
              <MaterialCommunityIcons name={item.icon} size={22} color={hasPhoto ? '#e2e8f0' : palette.iconColor} />
            </View>
            <View style={styles.textCol}>
              <Text style={[styles.title, { color: hasPhoto ? '#f8fafc' : palette.titleColor }, hasPhoto && styles.photoTextShadow]}>
                {item.title}
              </Text>
              <Text style={[styles.sub, { color: hasPhoto ? 'rgba(226,232,240,0.94)' : palette.subColor }, hasPhoto && styles.photoTextShadow]}>
                {item.subtitle}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={hasPhoto ? '#f8fafc' : palette.chevronColor} />
          </ElectricPressable>
        )})}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Creer un nouveau dossier</Text>
            <TextInput
              value={newFolderTitle}
              onChangeText={setNewFolderTitle}
              placeholder="Nom du dossier"
              placeholderTextColor="#64748b"
              style={styles.modalInput}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable style={({ pressed }) => [styles.cancelBtn, pressed && styles.scaleDown]} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelTxt}>Annuler</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.saveBtn, pressed && styles.scaleDown]} onPress={createFolder}>
                <Text style={styles.saveTxt}>Creer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    minHeight: 86,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.35)',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  cardBlueNuance: {
    ...StyleSheet.absoluteFillObject,
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
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  sub: {
    marginTop: 4,
    color: '#475569',
    fontSize: 11,
    fontWeight: '500',
  },
  photoTextShadow: {
    textShadowColor: 'rgba(2,6,23,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.28)',
    padding: 14,
  },
  modalTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 10,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  cancelBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#ffffff',
  },
  cancelTxt: { color: '#334155', fontWeight: '700' },
  saveBtn: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#2563eb',
  },
  saveTxt: { color: '#ffffff', fontWeight: '900' },
});
