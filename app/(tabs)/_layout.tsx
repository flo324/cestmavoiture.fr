import { Tabs } from 'expo-router';
import { LayoutDashboard, Camera, User } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const CustomTabBarButton = ({ children, style, ...props }: any) => (
  <TouchableOpacity {...props} style={[styles.scanButtonWrap, style]} activeOpacity={0.85}>
    <View style={styles.scanButton}>
      {children}
      <Text style={styles.scanText}>SCAN</Text>
    </View>
  </TouchableOpacity>
);

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#D4AF37',
        tabBarInactiveTintColor: '#AAAAAA',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarButton: (props) => <CustomTabBarButton {...props}><Camera size={22} color="#FFFFFF" /></CustomTabBarButton>,
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 25,
    left: 20,
    right: 20,
    backgroundColor: '#000000',
    borderRadius: 15,
    height: 70,
    borderColor: '#111111',
    borderWidth: 1,
  },
  scanButtonWrap: {
    top: -20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#00F2FF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 14,
    shadowColor: '#00F2FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 18,
  },
  scanText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
});