# Guide Mise à Jour — Vestoram (Expo SDK 57)

> **Sideload APK GitHub + OTA EAS** — tout ce que tu dois savoir pour pousser une correction sans te tromper.

---

## 1. Le principe en 30 secondes

Ton app est **100% WebView**. Il y a **3 niveaux** de changement :

| Tu changes quoi ? | Exemple | Besoin de faire une mise à jour app ? | Méthode |
|---|---|---|---|
| **Le site web** lui-même | Nouveau produit, prix, design Shopify/Render | **NON** | Rien — la WebView charge `siteUrl` en live |
| **Le wrapper JS** | Fix du bandeau, offline, splash, `siteUrl`, `index.tsx`, `updater.ts` | **OUI mais léger** | **OTA** `eas update` (2 Mo, 2s) |
| **Le natif** | Permissions, `app.json` `package`, nouvelle lib native (`expo-intent-launcher`), icône, splash natif, `android/` | **OUI lourd** | **APK complet** via Release GitHub manuelle (40 Mo) |

**Règle d'or :**
*   **Par défaut → OTA** (`eas update --channel preview`). C'est instantané.
*   **APK que si `npx expo prebuild` aurait été nécessaire** (tu as touché au natif).

---

## 2. Architecture actuelle

*   **Site** : `app.json` `extra.siteUrl` → `src/app/index.tsx:26` `SITE_URL = extra.siteUrl ?? EXPO_PUBLIC_SITE_URL ?? fallback`
*   **OTA** : `app.json` `updates.url = https://u.expo.dev/e384ffb7...` + `checkAutomatically: ON_LOAD`. Le JS est hébergé chez Expo, pas sur ton site. **Même si ton site est down (502 Render), l'OTA passe.**
*   **APK sideload** : `src/services/updater.ts` check `GET /repos/SamMasHack207/vestoram/releases/latest` → compare `tag_name` (ex: `v1.0.1`) vs `app.json` `version` → si plus récent + `.apk` trouvé → bandeau rouge "Mettre à jour".

```
App installée (1.0.0)  --ON_LOAD-->  EAS (OTA ?)  --puis--> GitHub latest (APK ?)
      | lance siteUrl (extra.siteUrl)
```

---

## 3. Pré-requis (une fois)

```bash
npm install -g eas-cli
eas login                 # samhacher
eas whoami                # vérifie

# Optionnel mais recommandé : token GitHub pour éviter le rate-limit 60/h
# Crée un PAT classic read-only puis :
# EAS Secret : eas secret:create --name EXPO_PUBLIC_GITHUB_TOKEN --value ghp_xxx --scope project
# ou local : echo 'EXPO_PUBLIC_GITHUB_TOKEN=ghp_xxx' >> .env.local  (gitignoré)
```

Vérifie les channels `eas.json` :
```json
{
  "preview": { "channel": "preview", "autoIncrement": true, "android": {"buildType": "apk"} },
  "production": { "channel": "production", "autoIncrement": true }
}
```

---

## 4. Cas A — Site web (0 commande)

Tu as poussé sur `boutique-ci-demo.onrender.com` ?

> **Tu n'as rien à faire.** Rouvre l'app → la WebView charge la nouvelle version (avec retry 2s/5s/10s si Render cold start).

---

## 5. Cas B — Wrapper JS / `siteUrl` → OTA (recommandé)

### Quand l'utiliser ?
*   Tout ce qui est dans `src/` (bandeau, offline, retry, PDF, WebView props)
*   Changer l'URL du site (`extra.siteUrl`)

### Étapes

1. **Modifie le code** (ex: `src/app/index.tsx`) ou `app.json` `extra.siteUrl`:
    ```json
    // app.json
    "extra": {
      "siteUrl": "https://boutique-ci.com",  // <-- nouvelle URL
      "eas": { "projectId": "e384ffb7..." }
    }
    ```
    ou via `.env.local` :
    ```
    EXPO_PUBLIC_SITE_URL=https://boutique-ci.com
    ```

2. **Pousse l'OTA** (pas besoin de bump `app.json` `version`) :
    ```bash
    # Depuis shop-app/
    eas update --channel preview --message "fix: nouveau siteUrl boutique-ci.com"

    # Optionnel : vérifie
    eas update:list --channel preview
    ```

3. **Teste** :
    ```bash
    npx expo start --clear  # puis ouvre avec le build preview existant
    # Ou juste ferme/rouvre l'app 2x : ON_LOAD → download OTA → restart auto
    ```

4. **Commit** si c'est définitif :
    ```bash
    git add app.json src/app/index.tsx
    git commit -m "ota: nouveau siteUrl"
    git push origin master
    ```

> **Astuce `siteUrl` temporaire** (test sans commit) :
> ```bash
> EXPO_PUBLIC_SITE_URL=https://staging.boutique-ci.com eas update --channel preview --message "test staging"
> # Pour revenir : repousse avec l'URL de prod
> ```

**Avantages** : 2 Mo, pas de bandeau "0% → 100%", pas de permission `INSTALL_PACKAGES`, pas de version à bump.

**Limites** : Ne met PAS à jour le natif (permissions, `app.json:package`, nouvelle lib native, `splash-icon.png` natif). Si tu as touché à ça → Cas C.

---

## 6. Cas C — Natif → APK GitHub manuel (rare)

### Quand l'utiliser ?
*   `app.json` `android.permissions`, `package`, `scheme`, `adaptiveIcon`
*   Ajout d'une lib avec code natif (`expo-intent-launcher`, `expo-file-system` nouvelle version, etc.)
*   Changement `assets/images/splash-icon.png` natif ou `icon.png`
*   `npm install` d'un package qui a un plugin `app.json` `plugins`

### Étapes complètes

1. **Bump la version** (OBLIGATOIRE) :
    ```json
    // app.json
    "version": "1.0.1"  // 1.0.0 → 1.0.1 (ou 1.1.0 pour feature)
    ```
    > Sans ça, l'ancienne app ne verra JAMAIS la mise à jour (`isNewer: 1.0.1 > 1.0.0` serait false) et la nouvelle app bouclerait.

2. **Build l'APK en local** (ou via EAS sans GitHub Action) :
    ```bash
    eas build --platform android --profile preview
    # Attends le lien → Download APK → ex: vestoram-1.0.1.apk
    # Le versionCode s'incrémente seul (autoIncrement: true)
    ```

3. **Crée la Release GitHub** (manuel, plus de `release.yml`) :
    *   Va sur https://github.com/SamMasHack207/vestoram/releases/new
    *   **Tag** : `v1.0.1` (avec `v`, le code gère `v1.0.1` et `1.0.1`)
    *   **Target** : `master` (ou `main`)
    *   **Title** : `Vestoram v1.0.1`
    *   Upload l'APK (le nom **doit finir par `.apk`**, ex: `vestoram.apk` ou `vestoram-v1.0.1.apk` — `updater.ts:95` cherche `*.apk`)
    *   Coche **Set as the latest release** (sinon `/releases/latest` ne le verra pas)
    *   **Publish release**

4. **Vérifie côté app** :
    *   Ouvre l'ancienne app (1.0.0) → après `ON_LOAD` le bandeau blanc/rouge "Mise à jour v1.0.1 — Mettre à jour" apparaît en haut (pousse le contenu, ne cache plus le header)
    *   Tape **Mettre à jour** → `0% → 100%` réel (fix phase 3) → intent `content://` → installeur système
    *   Après install et relance, le bandeau disparaît (plus de `isNewer`)

5. **Commit la version** :
    ```bash
    git add app.json
    git commit -m "release: v1.0.1 apk natif"
    git tag v1.0.1   # optionnel local
    git push origin master
    ```

---

## 7. Changer l'URL du site — résumé pratique

| Scénario | Méthode | Commande |
|---|---|---|
| **Changement définitif** de domaine | OTA | Edit `app.json` `extra.siteUrl` → `eas update --channel preview` → commit |
| **Test temporaire** (staging) | OTA sans commit | `EXPO_PUBLIC_SITE_URL=https://staging... eas update --channel preview` |
| **Changement + natif** (ex: nouveau scheme deep link `boutiqueci://`) | APK | Bump version + `eas build` + Release GitHub |

> **Si l'ancien site est déjà mort (DNS/404)** : l'OTA marche quand même, car il ne dépend pas du site mais de `u.expo.dev`. L'app récupère la nouvelle URL même en erreur 502.

---

## 8. Que choisir ? Arbre de décision

```
Tu as modifié quelque chose ?
 ├─ Site web seul ? → RIEN À FAIRE
 ├─ src/ ou app.json extra.siteUrl ? → eas update --channel preview
 └─ app.json android/ios, plugins, assets natifs, package name ? 
       → bump app.json version → eas build --profile preview → Release GitHub manuelle
```

**En cas de doute :** lance `npx expo prebuild --platform android --clean` en local :
*   Si ça affiche des changements dans `android/` → c'est natif → APK.
*   Si aucun changement → OTA suffit.

---

## 9. FAQ

**OTA et APK cohabitent ?** Oui. L'app check d'abord l'OTA au démarrage (`ON_LOAD`), puis le GitHub latest pour l'APK. Tu peux avoir une OTA `preview` du jour + une Release GitHub `v1.0.2` de la semaine.

**Je dois bump `version` pour OTA ?** Non. Seulement pour APK.

**Le bandeau vert qui cachait le header est réglé ?** Oui (phase 4) : maintenant bandeau **blanc** qui pousse la WebView, bouton rouge `#E60023`, progress bar, croix `✕` pour fermer.

**Le splash logo était petit ?** Fixé : `app.json` `imageWidth 76→180` + image recadrée (680px/1024) → icône 3× plus grande, `prebuild` regen.

**Channel `preview` vs `production` ?** Tu es en sideload → reste sur `preview`. `production` = Play Store `aab`.

**Rate-limit GitHub 60/h ?** En sideload perso ça suffit. Pour équipe : ajout `EXPO_PUBLIC_GITHUB_TOKEN` (PAT).

---

## 10. Checklist avant de publier

**OTA :**
- [ ] `eas update --channel preview --message "fix: ..."` → `eas update:list` OK ?

**APK :**
- [ ] `app.json` `version` bumpée ? (`1.0.0` → `1.0.1`)
- [ ] `eas build --profile preview` → APK téléchargé ?
- [ ] Release GitHub tag `v1.0.1` + `.apk` + **Set as latest** ?
- [ ] Test sur ancienne app : bandeau → 100% → install OK (pas `FileUriExposedException`) ?
- [ ] `git push` avec nouvelle version ?

---

## 11. Commandes mémo

```bash
# OTA preview (JS + siteUrl)
eas update --channel preview --message "ton message"

# Voir les OTA
eas update:list --channel preview

# Build APK preview
eas build --platform android --profile preview

# Vérifier ce que l'app verrait
curl -s https://api.github.com/repos/SamMasHack207/vestoram/releases/latest | grep tag_name
```

*Dernière mise à jour : phases 1-4 appliquées + `extra.siteUrl` configurable. Workflow `release.yml` supprimé (manuel).*
