# Design — 001 Mobile WebView App

Status: Draft

## Current Stack

Framework:
- Expo SDK 57
- React Native 0.86
- Expo Router
- react-native-webview

Build system:
- Expo + EAS
- Android native project generated

Current architecture:

```text
Expo App
   ↓
React Native WebView
   ↓
Hosted Django marketplace
```

---

# WebView Strategy

The application intentionally uses:

```text
single WebView architecture
```

Benefits:
- one frontend codebase
- lower maintenance
- faster marketplace iteration
- simpler operational scaling

---

# Current WebView Implementation

File:

```text
src/app/index.tsx
```

Current implemented features:
- loading screen
- offline detection
- Android back navigation
- external link handling
- shared cookies
- pull-to-refresh
- navigation tracking

---

# Hosted Environment

Current production URL:

```text
https://boutique-ci-demo.onrender.com
```

This should eventually move to:
- environment configuration
- production/release separation

---

# Navigation Design

## Internal Navigation

Handled inside WebView.

---

## External Navigation

Handled through:

```text
expo-linking
```

Supported protocols:
- tel:
- mailto:
- sms:
- WhatsApp links

---

# Offline Strategy

Current implementation:

```text
NetInfo
```

Behavior:
- detect network state
- display offline fallback screen

Future improvements:
- retry actions
- cached fallback pages

---

# Payment Flow Strategy

Critical area:
- PayDunya redirects
- external payment windows

Current direction:
- allow WebView navigation
- optionally open unsupported flows externally later

---

# Session Persistence

Current configuration:

```tsx
sharedCookiesEnabled
thirdPartyCookiesEnabled
```

Purpose:
- preserve authentication
- preserve marketplace sessions
- preserve checkout state

---

# APK Build Architecture

Current build tooling:

```text
Expo
EAS
Android Gradle
```

Current Android package:

```text
com.samhacher.shopapp
```

---

# Splash & Loading UX

Current implementation:
- Expo splash screen
- WebView loading indicator

Future improvements:
- branded loading transitions
- smoother startup experience

---

# Security Considerations

## Allowed Navigation

The app should avoid:
- unsafe redirects
- arbitrary domain navigation

Future improvements:
- allowlist navigation filtering

---

## WebView Hardening

Future hardening:
- stricter navigation validation
- file download handling
- safer external app delegation

---

# Future Compatibility

The architecture prepares:
- push notifications
- deep linking
- file downloads
- Play Store release workflows
- optional native integrations

---

# Risks

## Payment Redirect Compatibility

Some payment providers behave inconsistently inside WebViews.

---

## File Downloads

PDF receipts may require dedicated download handling.

---

## Session Persistence

Android WebView cookie behavior can vary across versions.
