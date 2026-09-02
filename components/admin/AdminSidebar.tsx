import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { router, usePathname } from 'expo-router';
import {
  LayoutDashboard, ClipboardList, Flower2, Users, LogOut, ChevronRight,
  Leaf, Store, Package, Warehouse, Sprout, ChartBar as BarChart3,
  Receipt, CreditCard, ChartPie as PieChart, Tag, MessageSquare, Bike,
  MapPin, ShieldCheck, Activity, CirclePlus as PlusCircle, Smartphone, Building2,
  Bell, Send, FileText, UserCog, Shield, CalendarDays, ShieldCheck as LoginLogIcon,
  KeyRound,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { AdminRole } from '@/types/database';

const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  finance:     'Finance Admin',
  operations:  'Operations Admin',
  crm:         'CRM Admin',
  catalog:     'Catalog Admin',
};

const ROLE_COLOR: Record<AdminRole, string> = {
  super_admin: Colors.primary,
  finance:     '#1565C0',
  operations:  '#6A1B9A',
  crm:         Colors.secondary,
  catalog:     Colors.warning,
};

type NavItem = { label: string; icon: any; href: string };
type NavSection = { title: string; module: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Operations',
    module: 'orders',
    items: [
      { label: 'Dashboard',        icon: LayoutDashboard, href: '/(admin)' },
      { label: 'Orders',           icon: ClipboardList,   href: '/(admin)/orders' },
      { label: 'New Subscription', icon: PlusCircle,      href: '/(admin)/create-subscription' },
      { label: 'Customers',        icon: Users,           href: '/(admin)/operations-customers' },
      { label: 'Payment History',  icon: CreditCard,     href: '/(admin)/payment-history' },
    ],
  },
  {
    title: 'Procurement',
    module: 'procurement',
    items: [
      { label: 'Daily Requirements', icon: Leaf,      href: '/(admin)/daily-requirements' },
      { label: 'Procurement Orders', icon: Package,   href: '/(admin)/procurement-orders' },
      { label: 'Vendors',            icon: Store,     href: '/(admin)/vendors' },
      { label: 'Warehouse Receipts', icon: Warehouse, href: '/(admin)/warehouse-receipts' },
    ],
  },
  {
    title: 'Catalog',
    module: 'catalog',
    items: [
      { label: 'Plans',        icon: Flower2,    href: '/(admin)/plans' },
      { label: 'Flower Types', icon: Sprout,     href: '/(admin)/flower-types' },
      { label: 'Add Flower',   icon: PlusCircle, href: '/(admin)/flower-types?action=add' },
      { label: 'Localities',   icon: MapPin,     href: '/(admin)/localities' },
      { label: 'Apartments',   icon: Building2,  href: '/(admin)/apartments' },
    ],
  },
  {
    title: 'Finance',
    module: 'finance',
    items: [
      { label: 'Overview', icon: BarChart3,  href: '/(admin)/finance' },
      { label: 'Payments', icon: CreditCard, href: '/(admin)/finance-payments' },
      { label: 'Expenses', icon: Receipt,    href: '/(admin)/expenses' },
      { label: 'Ledger',   icon: PieChart,   href: '/(admin)/ledger' },
    ],
  },
  {
    title: 'CRM',
    module: 'crm',
    items: [
      { label: 'CRM Overview',    icon: MessageSquare, href: '/(admin)/crm' },
      { label: 'Users',           icon: Users,         href: '/(admin)/customers' },
      { label: 'Segments',        icon: Tag,           href: '/(admin)/crm-segments' },
      { label: 'Tasks',           icon: ClipboardList, href: '/(admin)/crm-tasks' },
      { label: 'Customer Logins', icon: Smartphone,    href: '/(admin)/customer-logins' },
    ],
  },
  {
    title: 'Riders',
    module: 'riders',
    items: [
      { label: 'Riders',               icon: Bike,        href: '/(admin)/riders' },
      { label: 'Assigned Riders',      icon: ClipboardList, href: '/(admin)/assigned-riders' },
      { label: 'Assignments',          icon: MapPin,      href: '/(admin)/rider-assignments' },
      { label: 'Attendance Locations', icon: ShieldCheck, href: '/(admin)/attendance-locations' },
    ],
  },
  {
    title: 'Notifications',
    module: 'notifications',
    items: [
      { label: 'Templates',         icon: FileText, href: '/(admin)/notification-templates' },
      { label: 'Send Notification', icon: Send,     href: '/(admin)/send-notification' },
      { label: 'Delivery Logs',     icon: Bell,     href: '/(admin)/notification-logs' },
    ],
  },
  {
    title: 'Panji',
    module: 'panji',
    items: [
      { label: 'Panji Calendar', icon: CalendarDays, href: '/(admin)/panji' },
    ],
  },
];

const SYSTEM_ITEMS: (NavItem & { module: string })[] = [
  { label: 'Activity Logs', icon: Activity,  href: '/(admin)/logs',        module: 'logs' },
  { label: 'Admin Users',      icon: UserCog,      href: '/(admin)/admin-users',      module: 'admin_users' },
  { label: 'Admin Login Logs',  icon: LoginLogIcon, href: '/(admin)/admin-login-logs', module: 'admin_users' },
  { label: 'Roles & Access',    icon: Shield,       href: '/(admin)/roles',             module: 'roles' },
  { label: 'Secret Keys',       icon: KeyRound,     href: '/(admin)/secret-keys',      module: 'secret_keys' },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const { signOut, profile, isSuperAdmin, adminRole, hasModule, customRoleName, customRoleColor } = useAuthStore();

  const isActive = (href: string) => {
    if (href === '/(admin)') return pathname === '/' || pathname === '/(admin)' || pathname === '/index';
    return pathname.includes(href.replace('/(admin)/', ''));
  };

  const roleLabel = customRoleName ?? (adminRole ? ROLE_LABEL[adminRole] : 'Administrator');
  const roleColor = customRoleColor ?? (adminRole ? ROLE_COLOR[adminRole] : Colors.primary);

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <TouchableOpacity
        key={item.href}
        style={[styles.navItem, active && styles.navItemActive]}
        onPress={() => router.push(item.href as any)}
      >
        <Icon size={17} color={active ? Colors.primary : Colors.textSecondary} strokeWidth={active ? 2.2 : 1.8} />
        <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
        {active && <ChevronRight size={13} color={Colors.primary} style={styles.navChevron} />}
      </TouchableOpacity>
    );
  };

  const visibleSections = NAV_SECTIONS.filter((s) => hasModule(s.module));
  const visibleSystemItems = SYSTEM_ITEMS.filter((i) => isSuperAdmin || hasModule(i.module));

  return (
    <View style={styles.sidebar}>
      <View style={styles.brand}>
        <Image source={require('@/assets/images/2.jpg')} style={styles.brandLogoImg} resizeMode="contain" />
        <View>
          <Text style={styles.brandName}>33 Crores</Text>
          <Text style={styles.brandSub}>Admin Dashboard</Text>
        </View>
      </View>

      <View style={[styles.nav, { overflowY: 'auto' } as any]}>
        {visibleSections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionLabel}>{section.title.toUpperCase()}</Text>
            {section.items.map(renderNavItem)}
          </View>
        ))}

        {visibleSystemItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SYSTEM</Text>
            {visibleSystemItems.map(renderNavItem)}
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.userRow}>
          <View style={[styles.avatar, { backgroundColor: roleColor + '18' }]}>
            <Text style={[styles.avatarText, { color: roleColor }]}>
              {profile?.full_name?.[0]?.toUpperCase() ?? 'A'}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>
              {profile?.full_name ?? 'Admin'}
            </Text>
            <View style={styles.rolePill}>
              <View style={[styles.roleDot, { backgroundColor: roleColor }]} />
              <Text style={[styles.userRole, { color: roleColor }]}>{roleLabel}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity style={styles.signOutBtn} onPress={() => signOut()}>
          <LogOut size={16} color={Colors.error} />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 240,
    height: '100%',
    backgroundColor: Colors.white,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    flexDirection: 'column',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[5],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  brandLogoImg: { width: 38, height: 38, borderRadius: Radius.md },
  brandName: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  brandSub: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  nav: {
    flex: 1,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[3],
    gap: Spacing[1],
  },
  section: { marginBottom: Spacing[2] },
  sectionLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 10,
    color: Colors.textTertiary,
    letterSpacing: 0.8,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingVertical: 9,
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
  },
  navItemActive: { backgroundColor: Colors.primarySurface },
  navLabel: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  navLabelActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  navChevron: { marginLeft: 'auto' },
  footer: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[4],
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing[3],
  },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
  },
  userInfo: { flex: 1 },
  userName: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  rolePill: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  roleDot: { width: 6, height: 6, borderRadius: 3 },
  userRole: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.xs,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[2],
  },
  signOutText: {
    fontFamily: Typography.fontFamily.sansMedium,
    fontSize: Typography.size.sm,
    color: Colors.error,
  },
});
