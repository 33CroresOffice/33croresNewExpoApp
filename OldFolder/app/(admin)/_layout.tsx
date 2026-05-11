import { Tabs } from 'expo-router';
import { LayoutDashboard, ClipboardList, Flower2, Users } from 'lucide-react-native';
import { Colors, Typography } from '@/constants/theme';
import { Platform, View, StyleSheet } from 'react-native';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { Slot } from 'expo-router';

function WebLayout() {
  return (
    <View style={styles.webRoot}>
      <AdminSidebar />
      <View style={styles.webContent}>
        <Slot />
      </View>
    </View>
  );
}

export default function AdminLayout() {
  if (Platform.OS === 'web') {
    return <WebLayout />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.tabBarInactive,
        tabBarStyle: {
          backgroundColor: Colors.tabBar,
          borderTopColor: Colors.tabBarBorder,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontFamily: Typography.fontFamily.sansMedium,
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, size }) => <ClipboardList size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: 'Plans',
          tabBarIcon: ({ color, size }) => <Flower2 size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Customers',
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen name="order-detail"        options={{ href: null }} />
      <Tabs.Screen name="customer-detail"     options={{ href: null }} />
      <Tabs.Screen name="flower-types"        options={{ href: null }} />
      <Tabs.Screen name="vendors"             options={{ href: null }} />
      <Tabs.Screen name="daily-requirements"  options={{ href: null }} />
      <Tabs.Screen name="procurement-orders"  options={{ href: null }} />
      <Tabs.Screen name="warehouse-receipts"  options={{ href: null }} />
      <Tabs.Screen name="procurement-order-detail" options={{ href: null }} />
<Tabs.Screen name="finance"             options={{ href: null }} />
      <Tabs.Screen name="finance-payments"    options={{ href: null }} />
      <Tabs.Screen name="expenses"            options={{ href: null }} />
      <Tabs.Screen name="ledger"              options={{ href: null }} />
      <Tabs.Screen name="crm"                 options={{ href: null }} />
      <Tabs.Screen name="crm-segments"        options={{ href: null }} />
      <Tabs.Screen name="crm-tasks"           options={{ href: null }} />
      <Tabs.Screen name="riders"              options={{ href: null }} />
      <Tabs.Screen name="rider-detail"        options={{ href: null }} />
      <Tabs.Screen name="rider-assignments"   options={{ href: null }} />
      <Tabs.Screen name="admin-users"         options={{ href: null }} />
      <Tabs.Screen name="logs"                  options={{ href: null }} />
      <Tabs.Screen name="create-subscription"   options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  webRoot: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F5F5F0',
  },
  webContent: {
    flex: 1,
    overflow: 'hidden',
  },
});
