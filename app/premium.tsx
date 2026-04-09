import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { CheckCircle2, Crown, Sparkles, Zap } from 'lucide-react-native';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const FEATURES = [
  'Scan intelligent de documents (Permis, Carte grise, Factures)',
  'Extraction IA automatique des données clés',
  'Analyse des factures et détection d’anomalies',
  'Alerte proactive entretien et échéances',
  'Priorité des nouveautés IA premium',
];

export default function PremiumScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <LinearGradient
        colors={['#090F16', '#0A1420', '#0B0F14']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bg}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.topRow}>
            <Pressable style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>RETOUR</Text>
            </Pressable>
          </View>

          <View style={styles.heroCard}>
            <View style={styles.heroIconWrap}>
              <Crown size={24} color="#fbbf24" />
            </View>
            <Text style={styles.heroTitle}>ABONNEMENT PREMIUM IA</Text>
            <Text style={styles.heroSubtitle}>
              Débloquez une expérience complète pour piloter vos dossiers auto avec l'intelligence artificielle.
            </Text>
          </View>

          <View style={styles.priceCard}>
            <View style={styles.planRow}>
              <Sparkles size={17} color="#67e8f9" />
              <Text style={styles.planLabel}>FORMULE PREMIUM</Text>
            </View>
            <Text style={styles.price}>9,99€ / mois</Text>
            <Text style={styles.priceHint}>Sans engagement - Annulable à tout moment</Text>

            <View style={styles.featuresWrap}>
              {FEATURES.map((feature) => (
                <View key={feature} style={styles.featureRow}>
                  <CheckCircle2 size={16} color="#34d399" />
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [styles.subscribeBtn, pressed && styles.pressed]}
              onPress={() => Alert.alert('Premium', "Le tunnel de paiement sera branché à l'étape suivante.")}
            >
              <LinearGradient
                colors={['#00E9F5', '#0ea5e9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.subscribeGradient}
              >
                <Zap size={16} color="#02111a" />
                <Text style={styles.subscribeText}>ACTIVER PREMIUM</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0B0F14' },
  bg: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 26, paddingTop: 6 },
  topRow: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 8 },
  backBtn: {
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.45)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(10,17,26,0.7)',
  },
  backBtnText: { color: '#dbeafe', fontWeight: '800', fontSize: 11, letterSpacing: 0.3 },
  heroCard: {
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.48)',
    backgroundColor: 'rgba(20,14,8,0.66)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  heroIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.7)',
    backgroundColor: 'rgba(251,191,36,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  heroTitle: { color: '#fff7da', fontSize: 18, fontWeight: '900', letterSpacing: 0.4 },
  heroSubtitle: { color: '#d5e2f0', fontSize: 13, marginTop: 6, lineHeight: 19 },
  priceCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,233,245,0.4)',
    backgroundColor: 'rgba(10,20,31,0.78)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  planLabel: { color: '#b6f6ff', fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  price: { color: '#ffffff', fontSize: 30, fontWeight: '900', marginTop: 6 },
  priceHint: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  featuresWrap: { marginTop: 14, gap: 9 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  featureText: { flex: 1, color: '#e2e8f0', fontSize: 13, lineHeight: 18 },
  subscribeBtn: { marginTop: 16, borderRadius: 12, overflow: 'hidden' },
  subscribeGradient: {
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  subscribeText: { color: '#02111a', fontSize: 13, fontWeight: '900', letterSpacing: 0.6 },
  pressed: { transform: [{ scale: 0.98 }] },
});
