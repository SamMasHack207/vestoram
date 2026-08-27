import { Platform } from "react-native";
import Constants from "expo-constants";
import { File, Paths } from "expo-file-system";
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

function getCurrentVersion(): string {
  const v =
    Constants.expoConfig?.version ??
    Constants.expoConfig?.android?.versionCode?.toString() ??
    "1.0.0";
  return v.replace(/^v/, "");
}

function parseVersion(v: string): number[] {
  return v.split(".").map(Number);
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

  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
    const resp = await fetch(url, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (!resp.ok) return null;

    const release: GitHubRelease = await resp.json();
    const latestVersion = release.tag_name.replace(/^v/, "");
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
  }
}

export async function downloadAndInstallApk(
  downloadUrl: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const filename = `vestoram_${Date.now()}.apk`;
  const dest = new File(Paths.cache, filename);

  if (onProgress) onProgress(0);
  const file = await File.downloadFileAsync(downloadUrl, dest);
  if (onProgress) onProgress(100);

  await Linking.openURL(file.uri);
}
