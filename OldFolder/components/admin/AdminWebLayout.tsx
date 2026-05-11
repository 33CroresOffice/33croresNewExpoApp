import React from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { Colors } from '@/constants/theme';
import AdminSidebar from './AdminSidebar';

interface Props {
  children: React.ReactNode;
  scrollable?: boolean;
}

export default function AdminWebLayout({ children, scrollable = true }: Props) {
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  return (
    <View style={styles.root}>
      <AdminSidebar />
      <View style={styles.main}>
        {scrollable ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={styles.fill}>{children}</View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.background,
  },
  main: {
    flex: 1,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 32,
    paddingBottom: 64,
  },
  fill: {
    flex: 1,
  },
});
