---
title: Default technology choices
roles: [solution-architect, devops-engineer, lead-software-engineer, api-engineer]
---
- Backend when none exists: Firebase (Auth, Firestore, Cloud Functions in TypeScript).
- Local storage: `shared_preferences` for settings, `drift` for structured data.
- CI/CD: GitHub Actions + **fastlane** for store builds.
- Crash reporting: Firebase Crashlytics.
