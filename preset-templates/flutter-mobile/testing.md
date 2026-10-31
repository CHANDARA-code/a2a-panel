---
title: Testing
roles: [test-engineer, mobile-engineer, bug-triager, code-reviewer, lead-software-engineer]
---
- Unit tests for repositories and providers (override providers in a test `ProviderContainer` or `ProviderScope`), widget tests for screens, `integration_test` for key flows.
- Mock with mocktail. Golden tests only for widgets whose layout matters; update goldens (`flutter test --update-goldens`) only when the visual change is intended, and say so in your report.
- A bug fix starts with a test that fails because of the bug.

## Done means
- Run `dart format --output=none --set-exit-if-changed .`, `flutter analyze` and `flutter test`, and report each command with its result.
- If you could not run the app on an iOS or Android device or simulator, say which platform you did not check.
