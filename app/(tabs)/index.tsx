import { LinearGradient } from 'expo-linear-gradient';
import { BarChart3, ClipboardList, FileText, PenTool, Settings } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const categories = [
  { id: 1, title: 'CARNET D\'ENTRETIEN', description: 'Gérez vos révisions et interventions.', icon: ClipboardList, color: '#3182CE' },
  { id: 2, title: 'DOCUMENTS DU VÉHICULE', description: 'Cartes grises, assurances...', icon: FileText, color: '#48BB78' },
  { id: 3, title: 'DIAGNOSTICS & ALERTES', description: 'Consultez les codes d\'erreur OBD-II.', icon: PenTool, color: '#ED8936' },
  { id: 4, title: 'FRAIS & DÉPENSES', description: 'Suivez votre budget auto.', icon: BarChart3, color: '#805AD5' },
  { id: 5, title: 'GESTION DU PROFIL', description: 'Informations personnelles, garage...', icon: Settings, color: '#F56565' },
  { id: 6, title: 'PARAMÈTRES', description: 'Notifications, unité de mesure...', icon: Settings, color: '#A0AEC0' },
];

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header Section */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>GARAGE CONNECT</Text>
          <View style={styles.headerRight}>
            <Text style={styles.headerUser}>FLORENT V.</Text>
            <View style={styles.userIconPlaceholder} />
          </View>
        </View>

        {/* Vehicle Card Section */}
        <LinearGradient
          colors={['#1A202C', '#111111']}
          style={styles.vehicleCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.vehicleCardTextContainer}>
            <Text style={styles.vehicleCardTitle}>VÉHICULE</Text>
            <Text style={styles.vehicleCardModel}>MODÈLE (MARQUE Y)</Text>
            <Text style={styles.vehicleCardImmat}>IMMAT (XX-000-XX)</Text>
          </View>
          {/* Silhouette PlaceHolder */}
          <View style={styles.silhouettePlaceholder}>
             <Text style={{color: '#FFFFFF', fontSize: 10}}>Silhouette</Text>
          </View>
        </LinearGradient>

        {/* Categories Grid */}
        <View style={styles.gridContainer}>
          {categories.map((category, index) => {
            const Icon = category.icon;
            const borderColor = index % 2 === 0 ? '#D4AF37' : '#00F2FF';
            return (
              <TouchableOpacity key={category.id} style={[styles.gridItem, { borderColor }]}>
                <View style={[styles.iconContainer, { borderColor }]}>
                  <Icon size={24} color={borderColor} />
                </View>
                <Text style={styles.categoryTitle}>{category.title}</Text>
                <Text style={styles.categoryDescription}>{category.description}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContainer: {
    padding: 20,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '300',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerUser: {
    color: '#FFFFFF',
    fontSize: 14,
    marginRight: 10,
    fontWeight: '300',
  },
  userIconPlaceholder: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
  },
  vehicleCard: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderColor: '#D4AF37',
    borderWidth: 1,
    height: 120,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  vehicleCardTextContainer: {
    flex: 1,
  },
  vehicleCardTitle: {
    color: '#888888',
    fontSize: 12,
    fontWeight: 'bold',
  },
  vehicleCardModel: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '500',
    marginTop: 5,
  },
  vehicleCardImmat: {
    color: '#D4AF37',
    fontSize: 14,
    marginTop: 2,
  },
  silhouettePlaceholder: {
    width: 80,
    height: 60,
    backgroundColor: '#333333',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridItem: {
    width: '48%', // Approx half the width
    backgroundColor: '#111111',
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
    alignItems: 'center',
    borderWidth: 1,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1,
  },
  categoryTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
  },
  categoryDescription: {
    color: '#AAAAAA',
    fontSize: 10,
    textAlign: 'center',
  },
});