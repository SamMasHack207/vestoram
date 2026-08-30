import { Platform } from "react-native";
import Constants from "expo-constants";
import { File, Paths } from "expo-file-system";
import { getContentUriAsync } from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Linking from "expo-linking";

const GITHUB_OWNER = "SamMasHack207";
const GITHUB_REPO = "vestoram";

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  assets: GitHubAsset[];
}

function cleanVersion(v: string): string {
  return v.replace(/^v/, "").split("-")[0]!.split("+")[0]!;
}

function getCurrentVersion(): string {
  const v = Constants.expoConfig?.version ?? "1.0.0";
  return cleanVersion(v);
}

function parseVersion(v: string): number[] {
  return cleanVersion(v)
    .split(".")
    .map((s) => {
      const n = parseInt(s, 10);
      return Number.isNaN(n) ? 0 : n;
    });
}

function isNewer(latest: string, current: string): boolean {
  const l = parseVersion(latest);
  const c = parseVersion(current);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const li = l[i] ?? 0;
    const ci = c[i] ?? 0;
    if (li > ci) return true;
    if (li < ci) return false;
  }
  return false;
}

export interface UpdateInfo {
  version: string;
  notes: string;
  downloadUrl: string;
  size: number;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (Platform.OS !== "android") return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
    // Token optionnel via EXPO_PUBLIC_GITHUB_TOKEN ou extra.githubToken (EAS secret)
    const token =
      (Constants.expoConfig?.extra as { githubToken?: string })?.githubToken ??
      process.env.EXPO_PUBLIC_GITHUB_TOKEN ??
      undefined;

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const resp = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    if (!resp.ok) {
      // 403 rate-limit -> silencieux mais on évite spam retry
      return null;
    }

    const release: GitHubRelease = await resp.json();
    const latestVersion = cleanVersion(release.tag_name);
    const currentVersion = getCurrentVersion();

    if (!isNewer(latestVersion, currentVersion)) return null;

    const apk = release.assets.find((a) => a.name.endsWith(".apk"));
    if (!apk) return null;

    return {
      version: latestVersion,
      notes: release.body || "",
      downloadUrl: apk.browser_download_url,
      size: apk.size,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function downloadAndInstallApk(
  downloadUrl: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  const filename = `vestoram_${Date.now()}.apk`;
  const dest = new File(Paths.cache, filename);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    if (onProgress) onProgress(0);

    const file = await File.downloadFileAsync(downloadUrl, dest, {
      idempotent: true,
      signal: controller.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        if (!onProgress) return;
        if (totalBytes > 0) {
          const pct = Math.round((bytesWritten / totalBytes) * 100);
          onProgress(Math.min(100, Math.max(0, pct)));
        }
      },
    });

    // Vérif taille si l'asset size était connu (optionnel)
    try {
      const info = file.info;
      // file.info peut être synchrone selon SDK — on ne bloque pas si indisponible
      void info;
    } catch {}

    if (onProgress) onProgress(100);

    // Android 7+ : file:// -> FileUriExposedException, on passe en content://
    let uriToOpen = file.uri;
    try {
      const contentUri = await getContentUriAsync(file.uri);
      if (contentUri) uriToOpen = contentUri;
    } catch {
      // fallback file://
    }

    // Intent natif avec permission lecture (évite FileUriExposedException)
    try {
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: uriToOpen,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: "application/vnd.android.package-archive",
      });
      return;
    } catch {
      // Fallback Linking (certains OEM)
      await Linking.openURL(uriToOpen);
    }
  } finally {
    clearTimeout(timeout);
  }
}
