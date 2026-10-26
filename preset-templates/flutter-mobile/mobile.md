---
title: Mobile stack
roles: [mobile-engineer, code-reviewer, test-engineer, lead-software-engineer]
---
- **Flutter stable** with Material 3.
- State management: **Riverpod** (`riverpod_generator`). No `setState` beyond local UI state.
- Navigation: **go_router** with typed routes.
- Networking: **Dio** with an interceptor for auth and error mapping; repositories return domain models, never raw JSON.
- Folder layout is feature-first: `lib/features/<feature>/{data,domain,presentation}`.
- Strings go through `intl` / ARB files; no hard-coded user-facing text.
