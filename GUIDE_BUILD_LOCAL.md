# Guide Build Local — Sans limite EAS (Windows)

> Alternative à `eas build` cloud (limite 15 APK). 2 méthodes **illimitées**.

---

## Méthode 1 — `eas build --local` (recommandée, 2 min)

Lance le même build EAS mais **sur ton PC** → **0 décompté** sur les 30.

```bash
# 1. Pré-requis (une fois)
# - JDK 17 : https://adoptium.net/temurin/releases/?version=17
#   Vérifie : java -version  → 17.x
# - Android Studio : https://developer.android.com/studio
#   Installe SDK 35, Platform-tools, Build-tools 35
# - Variables d'environnement (Windows) :
#   ANDROID_HOME = C:\Users\prosp\AppData\Local\Android\Sdk
#   Ajoute au PATH : %ANDROID_HOME%\platform-tools ; %ANDROID_HOME%\emulator

# Vérifie :
echo %ANDROID_HOME%
adb --version
java -version

# 2. Build
cd "C:\Users\prosp\Desktop\allmyprogr\E-COMMERCE PROJECT\boutiqueci-app\shop-app"
eas build --platform android --profile preview --local

# Résultat : build-*.apk dans le dossier (ou shop-app/build/)
# Le signing EAS est réutilisé auto, versionCode autoIncrement ok

# 3. Upload manuel comme avant :
# GitHub → Releases → New → Tag v1.0.2 → Upload .apk → Set as latest → Publish
```

**Quand l'utiliser** : 90% du temps. Tu gardes `app.json`/`eas.json` inchangés.

> Note : la première fois `eas build --local` télécharge le NDK/Gradle (~1.5 Go), c'est normal.

---

## Méthode 2 — Gradle pur (sans EAS du tout, 100% offline)

Pour build sans même passer par EAS.

### A. Préparation (une fois)

1. **JDK 17** + **Android Studio** + `ANDROID_HOME` comme ci-dessus.
2. **Keystore release** (pour signer, sinon tu restes en debug et l'install échouera après la 1ère release) :
```powershell
# Dans shop-app/
keytool -genkey -v -keystore vestoram.keystore -alias vestoram -keyalg RSA -keysize 2048 -validity 10000
# Mot de passe : choisis (ex: Vestoram2026!)
# CN= Vestoram, OU= Lomé, etc. → génère vestoram.keystore
# Déplace-le :
move vestoram.keystore android\app\vestoram.keystore
```

3. **Configure `android/gradle.properties`** (ajoute à la fin) :
```properties
MYAPP_RELEASE_STORE_FILE=vestoram.keystore
MYAPP_RELEASE_KEY_ALIAS=vestoram
MYAPP_RELEASE_STORE_PASSWORD=Vestoram2026!
MYAPP_RELEASE_KEY_PASSWORD=Vestoram2026!
```

4. **Configure `android/app/build.gradle`** — vérifie que `signingConfigs.release` existe (généré par prebuild) :
```gradle
signingConfigs {
  release {
    storeFile file(MYAPP_RELEASE_STORE_FILE)
    storePassword MYAPP_RELEASE_STORE_PASSWORD
    keyAlias MYAPP_RELEASE_KEY_ALIAS
    keyPassword MYAPP_RELEASE_KEY_PASSWORD
  }
}
buildTypes {
  release {
    signingConfig signingConfigs.release
  }
}
```

### B. Build à chaque release

```powershell
cd "C:\Users\prosp\Desktop\allmyprogr\E-COMMERCE PROJECT\boutiqueci-app\shop-app"

# 1. Bump version (OBLIGATOIRE comme pour EAS)
# app.json : "version": "1.0.1" → "1.0.2"

# 2. Regen natif si app.json changé (permissions, splash, siteUrl natif)
npx expo prebuild --platform android --clean

# 3. Ne pas oublier de remettre le keystore après --clean (il efface android/)
# Si tu as mis vestoram.keystore hors de android/, copie-le :
copy vestoram.keystore android\app\vestoram.keystore

# 4. Build APK
cd android
.\gradlew assembleRelease
# → android\app\build\outputs\apk\release\app-release.apk  (~40 Mo)
# Renomme :
copy app\build\outputs\apk\release\app-release.apk ..\vestoram-v1.0.2.apk
cd ..

# 5. Teste local :
adb install -r vestoram-v1.0.2.apk
# ou glisse le fichier sur l'émulateur / partage via USB

# 6. GitHub Release manuelle : Tag v1.0.2 → Upload vestoram-v1.0.2.apk → Set as latest
```

### C. Astuces Gradle

```powershell
# Build plus rapide (skip lint)
.\gradlew assembleRelease -x lint

# Bundle AAB (si Play Store plus tard)
.\gradlew bundleRelease

# Nettoyer
.\gradlew clean
```

---

## Quelle méthode choisir ?

| Besoin | Commande | Décompte EAS | Signing |
|---|---|---|---|
| Fix JS rapide + siteUrl | `eas update --channel preview` (OTA, pas de build) | 0 | Auto |
| APK preview sideload régulier | `eas build --local --profile preview` | **0** | EAS |
| APK sans EAS du tout / offline | `gradlew assembleRelease` | 0 | Ton keystore |

**Reco sideload Vestoram :**
*   Quotidien → `eas update` (OTA)
*   Release APK → `eas build --local` (garde la simplicité EAS)
*   Si EAS est down / plus de compte → `gradlew`

---

## Troubleshooting Windows

*   `JAVA_HOME not set` → `setx JAVA_HOME "C:\Program Files\Eclipse Adoptium\jdk-17.x-hotspot"`
*   `SDK not found` → Vérifie `ANDROID_HOME` et `local.properties` (généré auto)
*   `Task :app:processReleaseMainManifest FAILED` → `npx expo prebuild --clean` puis rebuild
*   `keystore not found` après `--clean` → recopie `vestoram.keystore` dans `android/app/`
*   APK debug ne s'installe pas par-dessus release → désinstalle l'ancienne ou signe avec le même keystore

---

## Après le build (les deux méthodes)

```bash
# Vérifie l'APK
adb shell dumpsys package com.boutiqueci.app | findstr version

# Push Git
git add app.json
git commit -m "release: v1.0.2"
git push origin master
# + GitHub Release v1.0.2
```

*Garde `vestoram.keystore` **hors git** (déjà gitignoré) + backup sur Drive. Sans lui tu ne pourras plus mettre à jour l'app installée.*
