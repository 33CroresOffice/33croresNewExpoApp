import React from 'react';
import { Tabs } from 'expo-router';
import { CalendarCheck, UserRound, BriefcaseBusiness, Flame, ClipboardList } from 'lucide-react-native';
import { Colors } from '@/constants/theme';

export default function ProviderLayout() {
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: Colors.primary, tabBarInactiveTintColor: Colors.textTertiary }}><Tabs.Screen name="index" options={{ title: 'Bookings', tabBarIcon: ({ color, size }) => <CalendarCheck size={size} color={color} /> }} /><Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: ({ color, size }) => <ClipboardList size={size} color={color} /> }} /><Tabs.Screen name="services" options={{ title: 'Services', tabBarIcon: ({ color, size }) => <BriefcaseBusiness size={size} color={color} /> }} /><Tabs.Screen name="pooja" options={{ title: 'My Poojas', tabBarIcon: ({ color, size }) => <Flame size={size} color={color} /> }} /><Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <UserRound size={size} color={color} /> }} /><Tabs.Screen name="pooja-details" options={{ href: null }} /></Tabs>;
}
