---
title: Testing
roles: [test-engineer, api-engineer, web-engineer, bug-triager, code-reviewer, lead-software-engineer]
---
- API: **Jest** unit tests for services, **supertest** e2e tests for controllers.
- Web: **Vitest** + **React Testing Library**; query by role and label, not by class name or test id.
- A bug fix starts with a failing test that reproduces it.
- Tests must be deterministic: no real network, no sleeps, fixed clocks where time matters.
- Run the full suite before you report the task done, and include the summary line in your report.
