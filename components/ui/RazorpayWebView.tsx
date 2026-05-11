import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  SafeAreaView,
} from 'react-native';
import { WebView, WebViewNavigation, WebViewRequest } from 'react-native-webview';
import { X } from 'lucide-react-native';
import { Colors, Typography, Spacing } from '@/constants/theme';

interface RazorpayWebViewProps {
  paymentUrl: string;
  callbackUrlPrefix: string;
  onSuccess: (params: Record<string, string>) => void;
  onCancel: () => void;
}

const INJECTED_JS = `
  (function() {
    var originalOpen = window.open;
    window.open = function(url, target, features) {
      if (url) {
        window.location.href = url;
        return window;
      }
      return originalOpen.call(window, url, target, features);
    };
  })();
  true;
`;

export default function RazorpayWebView({
  paymentUrl,
  callbackUrlPrefix,
  onSuccess,
  onCancel,
}: RazorpayWebViewProps) {
  const [loading, setLoading] = React.useState(true);
  const webViewRef = useRef<WebView>(null);

  const extractAndCallSuccess = (url: string) => {
    try {
      const urlObj = new URL(url);
      const params: Record<string, string> = {};
      urlObj.searchParams.forEach((value, key) => {
        params[key] = value;
      });
      onSuccess(params);
    } catch {
      onSuccess({});
    }
  };

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    const { url } = navState;
    if (!url) return;
    if (url.startsWith(callbackUrlPrefix)) {
      extractAndCallSuccess(url);
    }
  };

  const handleShouldStartLoadWithRequest = (request: WebViewRequest): boolean => {
    const { url } = request;
    if (!url) return true;
    if (url.startsWith(callbackUrlPrefix)) {
      extractAndCallSuccess(url);
      return false;
    }
    return true;
  };

  if (Platform.OS === 'web') {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Complete Payment</Text>
          <TouchableOpacity onPress={onCancel} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <WebView
          ref={webViewRef}
          source={{ uri: paymentUrl }}
          style={styles.webview}
          onNavigationStateChange={handleNavigationStateChange}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          injectedJavaScript={INJECTED_JS}
          injectedJavaScriptBeforeContentLoaded={INJECTED_JS}
          setSupportMultipleWindows={false}
          renderLoading={() => (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading payment...</Text>
            </View>
          )}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  closeBtn: {
    padding: Spacing[1],
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    gap: Spacing[3],
  },
  loadingText: {
    fontFamily: Typography.fontFamily.sansRegular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
});
