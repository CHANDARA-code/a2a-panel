---
title: Default technology choices
roles: [solution-architect, devops-engineer, release-manager, lead-software-engineer, api-engineer]
---
When the task leaves a choice open, use these:

- Backend when none exists: Firebase (Auth, Firestore, Cloud Functions in TypeScript).
- Local storage: `shared_preferences` for simple settings, `drift` for structured data, `flutter_secure_storage` for tokens and secrets.
- CI/CD: GitHub Actions + fastlane for store builds.
- Crash reporting: Firebase Crashlytics.
- Versions: `version: x.y.z+build` in `pubspec.yaml`; raise the build number for every store upload.

Add a dependency outside these only when the task needs it, and name it with the reason in your report.
