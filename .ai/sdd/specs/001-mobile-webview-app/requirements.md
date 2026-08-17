# Requirements — 001 Mobile WebView App

Status: Draft

## Purpose

Provide a stable Android mobile wrapper for BoutiqueCI using Expo + React Native WebView.

The mobile app must:
- expose the hosted marketplace reliably
- support mobile-native navigation behavior
- support marketplace payment flows
- support external links and downloads
- improve mobile usability without duplicating frontend logic

---

# Architecture Context

The mobile application is intentionally:

```text
WebView-first
```

The website remains the primary product surface.

The mobile app acts as:
- native shell
- navigation wrapper
- device integration layer

---

# Goals

- Preserve a single marketplace frontend.
- Improve Android mobile usability.
- Support hosted production deployment.
- Support mobile payment flows.
- Support future notification integrations.

---

# Non-Goals

This feature does NOT:
- create a fully native marketplace frontend
- duplicate website business logic
- create offline-first synchronization
- replace the hosted web platform

---

# Functional Requirements

## FR-001 — Hosted Website Rendering

THE APP SHALL render the hosted BoutiqueCI website inside a WebView.

---

## FR-002 — Android Back Navigation

THE APP SHALL support Android hardware back navigation inside the WebView.

---

## FR-003 — External Link Handling

THE APP SHALL open external links natively.

Examples:
- WhatsApp
- phone calls
- email links
- SMS links

---

## FR-004 — Internet Connectivity Handling

THE APP SHALL detect offline state.

THE APP SHALL display a user-friendly offline screen.

---

## FR-005 — Payment Flow Compatibility

THE APP SHALL support:
- PayDunya redirects
- external payment flows
- browser handoff when required

---

## FR-006 — Session Persistence

THE APP SHALL preserve WebView sessions and cookies.

---

## FR-007 — Pull-To-Refresh

THE APP SHALL support mobile refresh gestures.

---

## FR-008 — APK Build Support

THE APP SHALL support Android APK generation through Expo/EAS.

---

## FR-009 — Mobile Loading Experience

THE APP SHALL provide:
- splash screen
- loading indicators
- graceful WebView loading behavior

---

## FR-010 — Future Notification Readiness

THE APP SHALL remain compatible with future:
- push notifications
- deep links
- device integrations

---

# Non-Functional Requirements

## NFR-001 — Reliability

The WebView experience MUST remain stable during navigation and payment flows.

---

## NFR-002 — Performance

The app SHOULD minimize unnecessary reloads.

---

## NFR-003 — Compatibility

The app MUST support Android devices targeted by Expo SDK 57.

---

## NFR-004 — Maintainability

The mobile wrapper SHOULD remain lightweight and simple.

---

# Open Questions

- Should PDFs open inside the app or externally?
- Should payment redirects force external browser opening?
- Should future notifications use Expo Notifications or Firebase?
