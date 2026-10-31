---
title: Backend and data
roles: [api-engineer, web-engineer, code-reviewer, security-auditor, lead-software-engineer]
---
- Database: PostgreSQL with Drizzle ORM. After changing the schema, run `drizzle-kit generate` and commit the generated SQL migration; apply migrations with `drizzle-kit migrate` or the app's migrator. Never use `drizzle-kit push` on a shared or production database, and never edit a migration that has been applied.
- Public HTTP endpoints are Route Handlers (`app/api/**/route.ts`), only when something outside the app calls them; otherwise use server actions.
- Every server action is a public POST endpoint. Inside each one: check the session, check that the user may change this record, and validate the input with `zod`, even when the calling page already checked.
- Auth: Auth.js v5. It is still published as a beta (`next-auth@beta`), so pin the exact version. Read the session on the server; never trust a user id sent by the client.
- Environment variables are validated at startup with `zod` (`env.ts`), so the app fails fast when one is missing.
- Database access lives in server-only modules (`import 'server-only'`), and queries select only the columns they need.
