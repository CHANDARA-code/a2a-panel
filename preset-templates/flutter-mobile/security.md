---
title: Security for this stack
roles: [security-auditor, code-reviewer, mobile-engineer, api-engineer]
---
- Tokens and secrets go in `flutter_secure_storage` (Keychain and Keystore), never in `shared_preferences` or plain files.
- Anything shipped in the app can be extracted: no keys that grant privileged access in the bundle. Privileged calls go through your backend or Cloud Functions.
- Firestore and Cloud Storage security rules enforce sign-in and ownership on every read and write; the app's own checks are not a security boundary. Test the rules with the Firebase emulator.
- HTTPS only; never disable certificate validation, not even in debug code that could ship.
- Never log tokens or personal data, and keep debug logging out of release builds.
