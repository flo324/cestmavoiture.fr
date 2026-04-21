import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { OttoDossierFrame } from '../../components/OttoDossierFrame';
import { AddressPartsAutocompleteInput, type AddressParts } from '../../components/AddressPartsAutocompleteInput';
import { DateParts, formatDateParts, parseDateParts, SmartDatePartsInput } from '../../components/SmartDatePartsInput';
import { userGetItem, userSetItem } from '../../services/userStorage';

const STORAGE_KEY = '@mes_factures_v5';

type RepairFolder = {
  id: string;
  titre: string;
  date: string;
  km: string;
  prixTTC: string;
  details: string;
  garage: string;
  numero: string;
  rue: string;
  ville: string;
  dep: string;
  imageUri: string;
  createdAt: number;
  updatedAt: number;
};

type Draft = {
  titre: string;
  dateParts: DateParts;
  km: string;
  prixTTC: string;
  details: string;
  garage: string;
  numero: string;
  rue: string;
  ville: string;
  dep: string;
  imageUri: string;
};

const EMPTY_DRAFT: Draft = {
  titre: '',
  dateParts: parseDateParts(''),
  km: '',
  prixTTC: '',
  details: '',
  garage: '',
  numero: '',
  rue: '',
  ville: '',
  dep: '',
  imageUri: '',
};

function normalizeRepair(raw: any): RepairFolder {
  const now = Date.now();
  const date = typeof raw?.date === 'string' ? raw.date : '';
  const adresse = typeof raw?.adresse === 'string' ? raw.adresse : '';
  return {
    id: String(raw?.id ?? now),
    titre: String(raw?.titre ?? 'Dossier reparation'),
    date,
    km: String(raw?.km ?? ''),
    prixTTC: String(raw?.prixTTC ?? ''),
    details: String(raw?.details ?? ''),
    garage: String(raw?.garage ?? ''),
    numero: String(raw?.numero ?? ''),
    rue: String(raw?.rue ?? adresse),
    ville: String(raw?.ville ?? ''),
    dep: String(raw?.dep ?? ''),
    imageUri: String(raw?.imageUri ?? ''),
    createdAt: Number(raw?.createdAt ?? now),
    updatedAt: Number(raw?.updatedAt ?? raw?.createdAt ?? now),
  };
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function FacturesScreen() {
  const params = useLocalSearchParams<{
    imageCaptured?: string;
    imageCapturedBase64?: string;
    fromGlobalScan?: string;
  }>();
  const [items, setItems] = useState<RepairFolder[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  useEffect(() => {
    (async () => {
      const raw = await userGetItem(STORAGE_KEY);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        setItems(parsed.map((x) => normalizeRepair(x)));
      } catch {
        setItems([]);
      }
    })();
  }, []);

  useEffect(() => {
    const incomingUri = typeof params.imageCaptured === 'string' ? params.imageCaptured : '';
    const fromGlobal = typeof params.fromGlobalScan === 'string' ? params.fromGlobalScan : '';
    if (incomingUri && fromGlobal === '1') {
      setDraft((prev) => ({ ...prev, imageUri: incomingUri }));
      setEditingId(null);
      setModalVisible(true);
    }
  }, [params.fromGlobalScan, params.imageCaptured]);

  const orderedItems = useMemo(() => [...items].sort((a, b) => b.updatedAt - a.updatedAt), [items]);

  const openCreate = () => {
    const now = new Date();
    const dateParts: DateParts = {
      day: String(now.getDate()).padStart(2, '0'),
      month: String(now.getMonth() + 1).padStart(2, '0'),
      year: String(now.getFullYear()),
    };
    setDraft({ ...EMPTY_DRAFT, dateParts });
    setEditingId(null);
    setModalVisible(true);
  };

  const openEdit = (item: RepairFolder) => {
    setEditingId(item.id);
    setDraft({
      titre: item.titre,
      dateParts: parseDateParts(item.date),
      km: item.km,
      prixTTC: item.prixTTC,
      details: item.details,
      garage: item.garage,
      numero: item.numero,
      rue: item.rue,
      ville: item.ville,
      dep: item.dep,
      imageUri: item.imageUri,
    });
    setModalVisible(true);
  };

  const persist = async (next: RepairFolder[]) => {
    setItems(next);
    await userSetItem(STORAGE_KEY, JSON.stringify(next));
  };

  const saveDraft = async () => {
    const formattedDate = formatDateParts(draft.dateParts);
    if (!draft.titre.trim()) {
      Alert.alert('Titre requis', 'Ajoutez un titre pour le dossier de reparation.');
      return;
    }
    if (!formattedDate) {
      Alert.alert('Date incomplete', 'Saisissez la date complete (jour, mois, annee).');
      return;
    }
    const now = Date.now();
    if (editingId) {
      const updated = items.map((item) =>
        item.id === editingId
          ? {
              ...item,
              titre: draft.titre.trim(),
              date: formattedDate,
              km: draft.km.trim(),
              prixTTC: draft.prixTTC.trim(),
              details: draft.details.trim(),
              garage: draft.garage.trim(),
              numero: draft.numero.trim(),
              rue: draft.rue.trim(),
              ville: draft.ville.trim(),
              dep: draft.dep.trim(),
              imageUri: draft.imageUri.trim(),
              updatedAt: now,
            }
          : item
      );
      await persist(updated);
    } else {
      const created: RepairFolder = {
        id: String(now),
        titre: draft.titre.trim(),
        date: formattedDate,
        km: draft.km.trim(),
        prixTTC: draft.prixTTC.trim(),
        details: draft.details.trim(),
        garage: draft.garage.trim(),
        numero: draft.numero.trim(),
        rue: draft.rue.trim(),
        ville: draft.ville.trim(),
        dep: draft.dep.trim(),
        imageUri: draft.imageUri.trim(),
        createdAt: now,
        updatedAt: now,
      };
      await persist([created, ...items]);
    }
    setModalVisible(false);
  };

  const deleteEditing = async () => {
    if (!editingId) return;
    const filtered = items.filter((item) => item.id !== editingId);
    await persist(filtered);
    setModalVisible(false);
  };

  return (
    <OttoDossierFrame>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.createBtn} onPress={openCreate}>
          <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#d1fae5" />
          <Text style={styles.createBtnText}>Nouveau dossier reparation</Text>
        </Pressable>

        {orderedItems.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="wrench-outline" size={54} color="#94a3b8" />
            <Text style={styles.emptyText}>Aucun dossier reparation.</Text>
          </View>
        ) : (
          orderedItems.map((item) => (
            <Pressable key={item.id} style={styles.card} onPress={() => openEdit(item)}>
              <View style={styles.cardLeft}>
                <MaterialCommunityIcons name="folder-wrench-outline" size={28} color="#60a5fa" />
                <View style={styles.cardTextCol}>
                  <Text style={styles.cardTitle}>{item.titre}</Text>
                  <Text style={styles.cardSub}>
                    {item.date || '--/--/----'} • {item.km || '-'} km
                  </Text>
                  <Text style={styles.cardMeta}>Modifie le {formatDateTime(item.updatedAt)}</Text>
                </View>
              </View>
              <Text style={styles.cardPrice}>{item.prixTTC || '0'} €</Text>
            </Pressable>
          ))
        )}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <MaterialCommunityIcons name="arrow-left" size={24} color="#60a5fa" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editingId ? 'Modifier dossier' : 'Nouveau dossier'}</Text>
            {editingId ? (
              <TouchableOpacity onPress={() => void deleteEditing()}>
                <MaterialCommunityIcons name="delete-outline" size={24} color="#ef4444" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 24 }} />
            )}
          </View>

          <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Titre</Text>
            <TextInput
              style={styles.input}
              value={draft.titre}
              placeholder="Ex: Changement embrayage"
              placeholderTextColor="#64748b"
              onChangeText={(value) => setDraft((prev) => ({ ...prev, titre: value }))}
            />

            <Text style={styles.label}>Date de facture</Text>
            <SmartDatePartsInput
              value={draft.dateParts}
              onChange={(dateParts) => setDraft((prev) => ({ ...prev, dateParts }))}
            />

            <Text style={styles.label}>Garage</Text>
            <TextInput
              style={styles.input}
              value={draft.garage}
              placeholder="Nom du garage"
              placeholderTextColor="#64748b"
              onChangeText={(value) => setDraft((prev) => ({ ...prev, garage: value }))}
            />

            <Text style={styles.label}>Adresse</Text>
            <AddressPartsAutocompleteInput
              value={{ numero: draft.numero, rue: draft.rue, ville: draft.ville, dep: draft.dep }}
              onChange={(next: AddressParts) =>
                setDraft((prev) => ({
                  ...prev,
                  numero: next.numero,
                  rue: next.rue,
                  ville: next.ville,
                  dep: next.dep,
                }))
              }
            />

            <Text style={styles.label}>Kilometrage</Text>
            <TextInput
              style={styles.input}
              value={draft.km}
              placeholder="Ex: 125000"
              placeholderTextColor="#64748b"
              keyboardType="number-pad"
              onChangeText={(value) => setDraft((prev) => ({ ...prev, km: value }))}
            />

            <Text style={styles.label}>Montant TTC (€)</Text>
            <TextInput
              style={styles.input}
              value={draft.prixTTC}
              placeholder="Ex: 480"
              placeholderTextColor="#64748b"
              keyboardType="decimal-pad"
              onChangeText={(value) => setDraft((prev) => ({ ...prev, prixTTC: value }))}
            />

            <Text style={styles.label}>Details</Text>
            <TextInput
              style={[styles.input, styles.multiInput]}
              value={draft.details}
              placeholder="Intervention realisee, pieces, observations..."
              placeholderTextColor="#64748b"
              multiline
              onChangeText={(value) => setDraft((prev) => ({ ...prev, details: value }))}
            />

            <Pressable style={styles.saveBtn} onPress={() => void saveDraft()}>
              <MaterialCommunityIcons name="content-save-outline" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>{editingId ? 'Enregistrer modifications' : 'Creer dossier'}</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
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
  createBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#0f3a2a',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  createBtnText: {
    color: '#d1fae5',
    fontWeight: '800',
    fontSize: 14,
  },
  emptyState: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.28)',
    backgroundColor: '#0f1720',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    marginTop: 8,
    color: '#94a3b8',
    fontWeight: '700',
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.4)',
    backgroundColor: '#111827',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardTextCol: {
    marginLeft: 10,
    flex: 1,
  },
  cardTitle: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '800',
  },
  cardSub: {
    marginTop: 2,
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '600',
  },
  cardMeta: {
    marginTop: 2,
    color: '#64748b',
    fontSize: 10,
  },
  cardPrice: {
    color: '#22c55e',
    fontSize: 15,
    fontWeight: '800',
  },
  modalRoot: {
    flex: 1,
    backgroundColor: '#0b1220',
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.2)',
  },
  modalTitle: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '800',
  },
  formContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 6,
  },
  label: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0f1720',
    color: '#e5edf7',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontWeight: '600',
  },
  multiInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  saveBtn: {
    marginTop: 14,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
});