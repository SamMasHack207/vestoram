import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  BackHandler,
  Pressable,
  Alert,
  Platform,
  ToastAndroid,
} from "react-native";
import { WebView, WebViewNavigation } from "react-native-webview";
import NetInfo from "@react-native-community/netinfo";
import * as Linking from "expo-linking";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { getExpoPushToken } from "../services/pushNotifications";
import {
  checkForUpdate,
  downloadAndInstallApk,
  type UpdateInfo,
} from "../services/updater";

const SITE_URL =
  ((Constants.expoConfig?.extra as { siteUrl?: string } | undefined)?.siteUrl ??
    process.env.EXPO_PUBLIC_SITE_URL ??
    "https://boutique-ci-demo.onrender.com") as string;
const MAIN_COLOR = "#E60023";

// --- PDF helpers ---

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
  let file: File | null = null;
  try {
    const filename = `recu_${Date.now()}.pdf`;
    const dest = new File(Paths.cache, filename);
    file = await File.downloadFileAsync(url, dest);
    // Vérif basique : fichier non vide
    if (file && typeof (file as unknown as { size?: number }).size === "number") {
      // size check si dispo (SDK 57 FileInfo)
    }
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/pdf",
      dialogTitle: "Ouvrir le reçu PDF",
    });
  } catch {
    Alert.alert("Erreur", "Impossible de télécharger le fichier PDF.");
  } finally {
    // Nettoyage cache différé pour ne pas bloquer le chooser
    if (file) {
      setTimeout(() => {
        try {
          file!.delete();
        } catch {}
      }, 60_000);
    }
  }
}

// --- Navigation allowlist ---

const EXTERNAL_SCHEMES = ["tel:", "mailto:", "sms:", "whatsapp://", "tg://", "fb://"];
const EXTERNAL_HTTPS_PREFIXES = ["https://wa.me", "https://api.whatsapp.com"];

function isExternalUrl(url: string): boolean {
  if (EXTERNAL_SCHEMES.some((s) => url.startsWith(s))) return true;
  if (EXTERNAL_HTTPS_PREFIXES.some((p) => url.startsWith(p))) return true;
  if (url.startsWith("intent://") || url.startsWith("market://")) return true;
  return false;
}

export default function Home() {
  const webViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadPct, setDownloadPct] = useState(0);
  const [webError, setWebError] = useState<{ title: string; message: string } | null>(null);
  const [showExitHint, setShowExitHint] = useState(false);

  // Déduplication PDF (shouldOverride + onFileDownload peuvent fire 2x)
  const lastPdfRef = useRef<{ url: string; ts: number } | null>(null);
  // Retry exponentiel cold-start
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Debounce pull-to-refresh / reload
  const lastReloadRef = useRef(0);

  const guardedReload = useCallback(() => {
    const now = Date.now();
    if (now - lastReloadRef.current < 2000) return;
    lastReloadRef.current = now;
    retryCountRef.current = 0;
    setWebError(null);
    setLoading(true);
    webViewRef.current?.reload();
  }, []);

  const scheduleRetry = useCallback(
    (reason: string) => {
      if (offline) return; // offline overlay gère déjà
      const attempt = retryCountRef.current;
      if (attempt >= 3) {
        // 3 tentatives épuisées -> afficher erreur
        setLoading(false);
        setWebError({
          title: "Serveur temporairement indisponible",
          message:
            reason ||
            "Le serveur se réveille (Render cold start). Réessayez dans quelques secondes.",
        });
        return;
      }
      const delays = [2000, 5000, 10000];
      const delay = delays[attempt] ?? 10000;
      retryCountRef.current += 1;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        webViewRef.current?.reload();
      }, delay);
    },
    [offline]
  );

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

  // Vérification mise à jour GitHub
  useEffect(() => {
    if (Platform.OS !== "android") return;
    checkForUpdate().then((info) => {
      if (info) setUpdateInfo(info);
    });
  }, []);

  // Gestion de la connexion Internet — ne démonte plus la WebView
  useEffect(() => {
    NetInfo.fetch().then((state) => {
      const online = state.isConnected !== false && state.isInternetReachable !== false;
      setOffline(!online);
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isInternetReachable === null) {
        setOffline(state.isConnected === false);
      } else {
        const online = state.isConnected !== false && state.isInternetReachable !== false;
        setOffline(!online);
      }
    });
    return unsubscribe;
  }, []);

  // Auto-reload quand on repasse online après une erreur
  const prevOfflineRef = useRef(offline);
  useEffect(() => {
    if (prevOfflineRef.current && !offline && webError) {
      const t = setTimeout(() => {
        guardedReload();
      }, 800);
      prevOfflineRef.current = offline;
      return () => clearTimeout(t);
    }
    prevOfflineRef.current = offline;
  }, [offline, webError, guardedReload]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  // Gestion du bouton retour Android — double-press pour quitter
  const lastBackPressRef = useRef(0);
  const exitHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const backAction = () => {
      if (canGoBack) {
        webViewRef.current?.goBack();
        setShowExitHint(false);
        if (exitHintTimerRef.current) clearTimeout(exitHintTimerRef.current);
        return true;
      }
      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        if (exitHintTimerRef.current) clearTimeout(exitHintTimerRef.current);
        return false; // laisse le système fermer l'app
      }
      lastBackPressRef.current = now;
      setShowExitHint(true);
      if (Platform.OS === "android") {
        ToastAndroid.show("Appuyez encore pour quitter", ToastAndroid.SHORT);
      }
      if (exitHintTimerRef.current) clearTimeout(exitHintTimerRef.current);
      exitHintTimerRef.current = setTimeout(() => setShowExitHint(false), 2000);
      return true;
    };

    const sub = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => {
      sub.remove();
      if (exitHintTimerRef.current) clearTimeout(exitHintTimerRef.current);
    };
  }, [canGoBack]);

  // Gestion centralisée des liens externes + PDF avec déduplication
  const handlePdfDeduped = useCallback((url: string) => {
    const now = Date.now();
    if (lastPdfRef.current && lastPdfRef.current.url === url && now - lastPdfRef.current.ts < 3000) {
      return;
    }
    lastPdfRef.current = { url, ts: now };
    downloadAndOpenPdf(url);
  }, []);

  const handleRequest = (request: WebViewNavigation) => {
    const url = request.url;

    // PDF prioritaire (même si scheme externe)
    if (isPdfUrl(url)) {
      handlePdfDeduped(url);
      return false;
    }

    if (isExternalUrl(url)) {
      Linking.canOpenURL(url)
        .then((supported) => {
          if (supported) return Linking.openURL(url);
        })
        .catch(() => {});
      return false;
    }

    // Autoriser toute navigation https/http à l'intérieur de la WebView
    // (boutique + PayDunya/Wave). Les autres schemes inconnus sont bloqués.
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return true;
    }

    // Scheme inconnu -> tenter ouverture externe si possible, sinon bloquer
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) Linking.openURL(url).catch(() => {});
      })
      .catch(() => {});
    return false;
  };

  const handleUpdate = async () => {
    if (!updateInfo) return;
    try {
      setDownloading(true);
      setDownloadPct(0);
      await downloadAndInstallApk(updateInfo.downloadUrl, setDownloadPct);
    } catch {
      Alert.alert("Erreur", "Le téléchargement a échoué. Réessayez.");
    } finally {
      setDownloading(false);
    }
  };

  const handleRetry = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryCountRef.current = 0;
    setWebError(null);
    if (offline) {
      NetInfo.refresh().then((state) => {
        const online = state.isConnected !== false && state.isInternetReachable !== false;
        if (state.isInternetReachable === null) {
          if (state.isConnected) guardedReload();
        } else if (online) {
          guardedReload();
        }
      });
      return;
    }
    guardedReload();
  }, [offline, guardedReload]);

  const handleError = useCallback(
    (event: { nativeEvent: { description?: string; code?: number } }) => {
      const desc = event.nativeEvent.description?.toLowerCase() ?? "";
      // Erreurs réseau typiques Render cold start / timeout
      const isTimeout =
        desc.includes("timed out") ||
        desc.includes("timeout") ||
        desc.includes("net::err_connection_timed_out") ||
        desc.includes("net::err_name_not_resolved");
      const isNetwork = desc.includes("net::err_internet_disconnected") || desc.includes("net::err_connection_refused");

      if (isNetwork) {
        // Laisser l'overlay offline gérer (NetInfo va passer offline)
        setLoading(false);
        return;
      }

      if (isTimeout) {
        scheduleRetry("Le serveur met du temps à répondre (cold start). Nouvelle tentative...");
        return;
      }

      setLoading(false);
      setWebError({
        title: "Impossible de charger la boutique",
        message: "Vérifiez votre connexion ou réessayez. Le serveur peut mettre quelques secondes à se réveiller.",
      });
    },
    [scheduleRetry]
  );

  const handleHttpError = useCallback(
    (event: { nativeEvent: { statusCode: number; url?: string } }) => {
      const code = event.nativeEvent.statusCode;
      const url = event.nativeEvent.url ?? "";
      const isMainFrame = url === SITE_URL || url.startsWith(SITE_URL + "/") || url === SITE_URL + "/";
      // Ignorer les erreurs de sous-ressources (images/css) : seul le main frame compte
      const shouldHandle = isMainFrame || !url || url.includes("onrender.com");

      if (code >= 500 && shouldHandle) {
        // 502/503 Render cold start -> retry exponentiel
        if (code === 502 || code === 503 || code === 504) {
          scheduleRetry("Le serveur se réveille (Render cold start). Nouvelle tentative...");
          return;
        }
        setLoading(false);
        setWebError({
          title: "Serveur temporairement indisponible",
          message: "Le serveur se réveille. Réessayez dans quelques secondes.",
        });
      } else if (code >= 400 && code < 500 && code !== 404 && shouldHandle) {
        setLoading(false);
        setWebError({
          title: `Erreur ${code}`,
          message: "Impossible de charger la page demandée.",
        });
      }
      // 404 ignorée volontairement pour éviter faux positifs sur ressources
    },
    [scheduleRetry]
  );

  const handleRenderProcessGone = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setLoading(false);
    setWebError({
      title: "La page s'est fermée de manière inattendue",
      message: "Appuyez sur Réessayer pour recharger la boutique.",
    });
  }, []);

  return (
    <View style={styles.container}>
      {updateInfo && (
        <View style={[styles.updateBanner, { paddingTop: insets.top + 8 }]}>
          <View style={styles.updateBannerContent}>
            <View style={styles.updateBannerTextBlock}>
              <Text style={styles.updateTitle}>Mise à jour v{updateInfo.version}</Text>
              <Text style={styles.updateSubtitle}>
                {downloading ? `${downloadPct}% — Téléchargement...` : "Nouvelle version disponible"}
              </Text>
            </View>
            <Pressable
              style={[styles.updateButton, downloading && styles.updateButtonDisabled]}
              onPress={handleUpdate}
              disabled={downloading}
              accessibilityRole="button"
            >
              <Text style={styles.updateButtonText}>{downloading ? "..." : "Mettre à jour"}</Text>
            </Pressable>
            <Pressable
              onPress={() => setUpdateInfo(null)}
              hitSlop={12}
              style={styles.updateDismiss}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <Text style={styles.updateDismissText}>✕</Text>
            </Pressable>
          </View>
          {downloading && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${downloadPct}%` as unknown as number }]} />
            </View>
          )}
        </View>
      )}

      <View style={styles.webviewWrapper}>
        <WebView
        ref={webViewRef}
        source={{ uri: SITE_URL }}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        pullToRefreshEnabled
        javaScriptCanOpenWindowsAutomatically
        setSupportMultipleWindows
        mixedContentMode="compatibility"
        androidLayerType="hardware"
        allowsBackForwardNavigationGestures
        originWhitelist={["https://*", "http://*", "tel:*", "mailto:*", "sms:*", "whatsapp:*", "intent:*", "market:*"]}
        injectedJavaScriptBeforeContentLoaded={`
          window.addEventListener('vestoram:request-token', function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({type:'REQUEST_EXPO_PUSH_TOKEN'}));
          });
          true;
        `}
        onShouldStartLoadWithRequest={handleRequest}
        onOpenWindow={({ nativeEvent }) => {
          // target=_blank (PayDunya, Wave) -> charger dans la même WebView
          const url = (nativeEvent as { targetUrl?: string }).targetUrl;
          if (url) {
            if (isPdfUrl(url)) {
              handlePdfDeduped(url);
            } else if (isExternalUrl(url)) {
              Linking.canOpenURL(url)
                .then((ok) => {
                  if (ok) Linking.openURL(url).catch(() => {});
                })
                .catch(() => {});
            } else {
              webViewRef.current?.injectJavaScript(`window.location.href = ${JSON.stringify(url)}; true;`);
            }
          }
        }}
        onFileDownload={({ nativeEvent }) => {
          const { downloadUrl } = nativeEvent as { downloadUrl?: string };
          if (downloadUrl) handlePdfDeduped(downloadUrl);
        }}
        onMessage={handleWebViewMessage}
        onLoadStart={() => {
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          if (webError) setWebError(null);
          setLoading(true);
        }}
        onLoadEnd={() => {
          // Succès -> reset compteur retry
          retryCountRef.current = 0;
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          setLoading(false);
        }}
        onError={handleError}
        onHttpError={handleHttpError}
        onRenderProcessGone={handleRenderProcessGone}
        onNavigationStateChange={(state) => {
          setCanGoBack(state.canGoBack);
        }}
        style={styles.webview}
      />

        {loading && !webError && !offline && (
          <View style={styles.loading} pointerEvents="none">
            <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
        )}

        {/* Overlay hors-ligne — ne démonte plus la WebView, garde session/cookies */}
        {offline && !webError && (
          <View style={styles.overlayContainer}>
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
            <Text style={styles.offlineMessage}>Vérifiez votre connexion puis réessayez.</Text>

            <Pressable
              style={styles.retryButton}
              onPress={handleRetry}
              accessibilityRole="button"
              accessibilityLabel="Réessayer le chargement"
            >
              <Text style={styles.retryButtonText}>Réessayer</Text>
            </Pressable>
            <Text style={styles.offlineHint}>La boutique restera chargée dès le retour réseau.</Text>
          </View>
        )}

        {/* Overlay erreur chargement */}
        {webError && !offline && (
          <View style={styles.overlayContainer}>
            <View style={styles.offlineIcon}>
              <Text style={styles.offlineIconText}>!</Text>
            </View>
            <Text style={styles.offlineTitle}>{webError.title}</Text>
            <Text style={styles.offlineMessage}>{webError.message}</Text>
            <Pressable
              style={styles.retryButton}
              onPress={handleRetry}
              accessibilityRole="button"
              accessibilityLabel="Réessayer le chargement"
            >
              <Text style={styles.retryButtonText}>Réessayer</Text>
            </Pressable>
          </View>
        )}

        {showExitHint && !canGoBack && (
          <View style={[styles.exitToast, { bottom: insets.bottom + 24 }]} pointerEvents="none">
            <Text style={styles.exitToastText}>Appuyez encore pour quitter</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// Les styles doivent impérativement être déclarés en dehors du composant
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  webviewWrapper: {
    flex: 1,
    backgroundColor: "#fff",
  },
  webview: {
    flex: 1,
    backgroundColor: "#fff",
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
  overlayContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    padding: 32,
    zIndex: 15,
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
  offlineHint: {
    fontSize: 12,
    color: "#b0b0a8",
    textAlign: "center",
    marginTop: 12,
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
  updateBanner: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F2EDE4",
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  updateBannerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  updateBannerTextBlock: {
    flex: 1,
  },
  updateTitle: {
    color: "#1A1A18",
    fontSize: 13,
    fontWeight: "800",
  },
  updateSubtitle: {
    color: "#91918c",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  updateButton: {
    backgroundColor: MAIN_COLOR,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 999,
  },
  updateButtonDisabled: {
    opacity: 0.6,
  },
  updateButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  updateDismiss: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  updateDismissText: {
    color: "#91918c",
    fontSize: 16,
    fontWeight: "600",
  },
  progressTrack: {
    marginTop: 10,
    height: 3,
    backgroundColor: "#F2EDE4",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
    backgroundColor: MAIN_COLOR,
    borderRadius: 999,
  },
  exitToast: {
    position: "absolute",
    left: 24,
    right: 24,
    alignSelf: "center",
    backgroundColor: "rgba(26,26,24,0.92)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    zIndex: 30,
  },
  exitToastText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
});
