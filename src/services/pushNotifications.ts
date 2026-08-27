import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

let Notifications: typeof import("expo-notifications") | null = null;

try {
  const N = require("expo-notifications") as typeof import("expo-notifications");
  Notifications = N;
  if (Platform.OS !== "web") {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
} catch {
  // Expo Go (SDK 53+) — push notifications not supported
}

function isExpoGo(): boolean {
  const env = Constants.executionEnvironment;
  return env === "storeClient";
}

/** Demande l'autorisation native et retourne le jeton Expo de cet appareil. */
export async function getExpoPushToken(): Promise<string> {
  if (Platform.OS === "web") {
    throw new Error("Les notifications natives ne sont disponibles que dans l'application.");
  }

  if (isExpoGo()) {
    throw new Error("Les notifications push ne sont pas disponibles dans Expo Go. Utilisez un build de développement.");
  }

  if (!Notifications) {
    throw new Error("Le module expo-notifications n'est pas disponible.");
  }

  if (!Device.isDevice) {
    throw new Error("Les notifications push nécessitent un appareil physique.");
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("orders", {
      name: "Commandes BoutiqueCI",
      description: "Nouvelles commandes et mises à jour de livraison",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#E60023",
    });
  }

  const current = await Notifications.getPermissionsAsync();
  const permissions = current.granted
    ? current
    : await Notifications.requestPermissionsAsync();

  if (!permissions.granted) {
    throw new Error("L'autorisation de notification a été refusée.");
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  if (!projectId) {
    throw new Error("L'identifiant EAS du projet est introuvable.");
  }

  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}
