---
title: Testing
roles: [test-engineer, api-engineer, web-engineer, bug-triager, code-reviewer, lead-software-engineer]
---
- API: Jest unit tests for services; supertest end-to-end tests for controllers against a separate test database, never the development or production one.
- Web: Vitest + React Testing Library. Query by role and label, not by class name or test id, and drive interactions with `@testing-library/user-event`.
- A bug fix starts with a test that fails because of the bug.
- Tests are deterministic: no real network (mock HTTP at the boundary), no sleeps, fixed clocks where time matters.

## Done means
- Run the lint, typecheck, test and build scripts from `package.json` for every workspace you touched (for example `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`) and report each command with its result.
- If a check fails for a reason unrelated to your change, say so with the output instead of skipping it.
