import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OTTO_THEME } from '../constants/ottoTheme';

export type DossierFolderItem = {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

type Props = {
  items: DossierFolderItem[];
  onSelect: (key: string) => void;
  onClose: () => void;
  /** Verse d’une carte (fond blanc, texte foncé) — utilisé avec l’animation flip sur l’accueil. */
  variant?: 'overlay' | 'card';
};

export function OttoDossiersPanel({ items, onSelect, onClose, variant = 'overlay' }: Props) {
  const insets = useSafeAreaInsets();
  const isCard = variant === 'card';

  return (
    <View
      style={[
        styles.root,
        isCard ? styles.rootCard : null,
        !isCard ? { paddingTop: Math.max(insets.top, 10) } : { paddingTop: 6 },
      ]}
    >
      <View style={styles.topBar}>
        <Pressable
          style={({ pressed }) => [
            styles.backPill,
            isCard && styles.backPillCard,
            pressed && styles.backPillPressed,
          ]}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onClose();
          }}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={OTTO_THEME.cyan} />
          <Text style={styles.backText}>Tableau de bord</Text>
        </Pressable>
        <Text style={[styles.title, isCard && styles.titleCard]}>Mes dossiers</Text>
        <Text style={[styles.sub, isCard && styles.subCard]}>Factures, permis, documents…</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: isCard ? insets.bottom + 12 : insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {items.map((c) => {
          const Icon = c.icon;
          return (
            <Pressable
              key={c.key}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => {
                void Haptics.selectionAsync();
                onSelect(c.key);
              }}
            >
              <View style={styles.cardBody}>
                <View style={styles.iconRing}>
                  <Icon size={22} color={OTTO_THEME.cyan} />
                </View>
                <View style={styles.cardTextCol}>
                  <Text style={styles.cardTitle}>{c.title}</Text>
                  <Text style={styles.cardDesc}>{c.description}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={OTTO_THEME.textMutedOnCard} />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: OTTO_THEME.bg,
    paddingHorizontal: 16,
  },
  rootCard: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  topBar: {
    marginBottom: 14,
  },
  backPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: OTTO_THEME.cyanSoft,
    backgroundColor: 'rgba(85,204,255,0.08)',
    marginBottom: 14,
  },
  backPillPressed: {
    opacity: 0.88,
  },
  backPillCard: {
    backgroundColor: OTTO_THEME.cardMuted,
    borderColor: OTTO_THEME.borderHairline,
  },
  backText: {
    color: OTTO_THEME.cyan,
    fontSize: 14,
    fontWeight: '700',
  },
  title: {
    color: OTTO_THEME.textOnDark,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  titleCard: {
    color: OTTO_THEME.textOnCard,
    fontSize: 22,
  },
  sub: {
    marginTop: 6,
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
  },
  subCard: {
    color: OTTO_THEME.textMutedOnCard,
    fontSize: 12,
  },
  scroll: { flex: 1 },
  scrollContent: { gap: 12, paddingTop: 4 },
  card: {
    backgroundColor: OTTO_THEME.card,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderLeftWidth: 3,
    borderLeftColor: OTTO_THEME.cyan,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
    borderWidth: 1,
    borderColor: OTTO_THEME.borderHairline,
  },
  cardPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.96,
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconRing: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: OTTO_THEME.cyanSoft,
    backgroundColor: OTTO_THEME.cardMuted,
  },
  cardTextCol: { flex: 1 },
  cardTitle: {
    color: OTTO_THEME.textOnCard,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  cardDesc: {
    marginTop: 4,
    color: OTTO_THEME.textMutedOnCard,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
});
