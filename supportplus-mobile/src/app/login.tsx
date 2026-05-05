// ============================================
// Login screen with WebView SSO
// ============================================

import React, { useRef, useCallback } from "react";
import { View, StyleSheet, ActivityIndicator, Text } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { SP_LOGIN_URL } from "../utils/constants";
import { loginWithToken } from "../store/auth";
import { useRouter } from "expo-router";

const INJECT_JS = `
  (function() {
    function sendToken() {
      var token = localStorage.getItem("token");
      if (token) {
        window.ReactNativeWebView.postMessage(token);
      }
    }
    // Check immediately and then poll
    sendToken();
    setInterval(sendToken, 1500);
  })();
  true;
`;

export default function LoginScreen() {
  const router = useRouter();
  const handledRef = useRef(false);

  const onMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      const token = event.nativeEvent.data;
      if (!token || handledRef.current) return;
      handledRef.current = true;

      const user = await loginWithToken(token);
      if (user) {
        router.replace("/");
      } else {
        handledRef.current = false;
      }
    },
    [router],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SupportPlus DBA</Text>
        <Text style={styles.headerSub}>Inicia sesión con Microsoft 365</Text>
      </View>
      <WebView
        source={{ uri: SP_LOGIN_URL }}
        style={styles.webview}
        injectedJavaScript={INJECT_JS}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#1a1a2e" />
            <Text style={styles.loadingText}>Cargando...</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  header: {
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: "#1a1a2e",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#fff",
  },
  headerSub: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    marginTop: 4,
  },
  webview: {
    flex: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  loadingText: {
    marginTop: 12,
    color: "#888",
    fontSize: 14,
  },
});
