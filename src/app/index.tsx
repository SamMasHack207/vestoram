import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  BackHandler,
  SafeAreaView,
  Pressable,
  Alert,
} from "react-native";
import { WebView, WebViewNavigation } from "react-native-webview";
import NetInfo from "@react-native-community/netinfo";
import * as Linking from "expo-linking";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getExpoPushToken } from "../services/pushNotifications";

const SITE_URL = "https://boutique-ci-demo.onrender.com";
const MAIN_COLOR = "#E60023";

function isPdfUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      /\/recu\//.test(u.pathname) ||
      u.pathname.endsWith(".pdf") ||
      /\/recus\//.test(u.pathname)
    );
  } catch {
    return false;
  }
}

async function downloadAndOpenPdf(url: string) {
  try {
    const filename = `recu_${Date.now()}.pdf`;
    const dest = new File(Paths.cache, filename);
    const file = await File.downloadFileAsync(url, dest);
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/pdf",
      dialogTitle: "Ouvrir le reçu PDF",
    });
  } catch {
    Alert.alert("Erreur", "Impossible de télécharger le fichier PDF.");
  }
}

export default function Home() {
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  const notifyWebApp = (message: Record<string, string>) => {
    const serializedMessage = JSON.stringify(message).replace(/</g, "\\u003c");
    webViewRef.current?.injectJavaScript(
      `window.dispatchEvent(new CustomEvent('vestoram:expo-push', { detail: ${serializedMessage} })); true;`
    );
  };

  const handleWebViewMessage = async (event: { nativeEvent: { data: string } }) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      if (message.type !== "REQUEST_EXPO_PUSH_TOKEN") return;

      notifyWebApp({ type: "EXPO_PUSH_TOKEN", token: await getExpoPushToken() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible d'activer les notifications.";
      notifyWebApp({ type: "EXPO_PUSH_ERROR", message });
    }
  };

  // Gestion de la connexion Internet
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOffline(!state.isConnected);
    });
    return unsubscribe;
  }, []);

  // Garde-fou : ne jamais laisser le spinner tourner plus de 10s
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), 10000);
    return () => clearTimeout(timer);
  }, [loading]);

  // Gestion du bouton retour Android
  useEffect(() => {
    const backAction = () => {
      if (canGoBack) {
        webViewRef.current?.goBack();
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => sub.remove();
  }, [canGoBack]);

  // Gestion des liens externes (Tel, Mail, WhatsApp, PDF, etc.)
  const handleRequest = (request: WebViewNavigation) => {
    const url = request.url;

    if (
      url.startsWith("tel:") ||
      url.startsWith("mailto:") ||
      url.startsWith("sms:") ||
      url.startsWith("https://wa.me")
    ) {
      Linking.openURL(url);
      return false;
    }

    if (isPdfUrl(url)) {
      downloadAndOpenPdf(url);
      return false;
    }

    return true;
  };

  // Écran d'erreur hors-ligne (design du site)
  if (offline) {
    return (
      <SafeAreaView style={styles.offlineContainer}>
        <View style={styles.offlineCard}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>B</Text>
          </View>
          <View style={styles.brandNameBlock}>
            <Text style={styles.brandName}>Vestoram</Text>
            <Text style={styles.brandTagline}>Marketplace • Lomé</Text>
          </View>
        </View>

        <View style={styles.offlineIcon}>
          <Text style={styles.offlineIconText}>!</Text>
        </View>

        <Text style={styles.offlineTitle}>Pas de connexion Internet</Text>
        <Text style={styles.offlineMessage}>
          Vérifiez votre connexion puis réessayez.
        </Text>

        <Pressable style={styles.retryButton} onPress={() => NetInfo.refresh()}>
          <Text style={styles.retryButtonText}>Réessayer</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      )}

      <WebView
        ref={webViewRef}
        source={{ uri: SITE_URL }}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        pullToRefreshEnabled
        startInLoadingState={false}
        allowsBackForwardNavigationGestures
        onShouldStartLoadWithRequest={handleRequest}
        onFileDownload={({ nativeEvent }) => {
          const { downloadUrl } = nativeEvent as { downloadUrl?: string };
          if (downloadUrl) downloadAndOpenPdf(downloadUrl);
        }}
        onMessage={handleWebViewMessage}
        onLoadStart={() => {
          setLoading(true);
        }}
        onLoadEnd={() => {
          setLoading(false);
        }}
        onError={() => {
          setLoading(false);
        }}
        onHttpError={() => {
          setLoading(false);
        }}
        onNavigationStateChange={(state) => {
          setCanGoBack(state.canGoBack);
        }}
        style={styles.webview}
      />
    </View>
  );
}

// Les styles doivent impérativement être déclarés en dehors du composant
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: MAIN_COLOR,
    zIndex: 10,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  offlineContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    padding: 32,
  },
  offlineCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 48,
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#e60023",
    alignItems: "center",
    justifyContent: "center",
  },
  brandMarkText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },
  brandNameBlock: {
    flexShrink: 1,
  },
  brandName: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.6,
    color: "#1A1A18",
    lineHeight: 20,
  },
  brandTagline: {
    fontSize: 12,
    color: "#91918c",
    fontWeight: "600",
    marginTop: 4,
  },
  offlineIcon: {
    width: 84,
    height: 84,
    borderRadius: 28,
    backgroundColor: "#F2EDE4",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  offlineIconText: {
    fontSize: 36,
    fontWeight: "800",
    color: "#C1440E",
  },
  offlineTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: "#1A1A18",
    textAlign: "center",
  },
  offlineMessage: {
    fontSize: 14,
    color: "#91918c",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 28,
    backgroundColor: "#1E4D3B",
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 999,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
