---
title: Testing
roles: [test-engineer, web-engineer, api-engineer, bug-triager, code-reviewer, lead-software-engineer]
---
- Unit and component tests: Vitest + React Testing Library, querying by role and label.
- End-to-end: Playwright for the critical user flows (sign-in and the main create and edit paths).
- Server actions and data functions are tested against a separate test database, never the development or production one.
- A bug fix starts with a test that fails because of the bug. No real network calls in unit tests.

## Done means
- Run the lint, typecheck, test and build scripts from `package.json` (for example `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`) and report each command with its result. `next build` type-checks and compiles every route, so it catches errors on pages you never opened in the dev server.
- If a check fails for a reason unrelated to your change, say so with the output instead of skipping it.
