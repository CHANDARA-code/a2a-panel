---
title: Backend and data
roles: [api-engineer, web-engineer, code-reviewer, security-auditor, lead-software-engineer]
---
- Database: **PostgreSQL** with **Drizzle ORM**; migrations with `drizzle-kit generate` and committed SQL.
- Public HTTP endpoints as Route Handlers (`app/api/**/route.ts`) only when something outside the app calls them; otherwise use server actions.
- Auth: **Auth.js** (NextAuth v5). Check the session in every action and route handler that changes data.
- Environment variables validated at startup with `zod` (`env.ts`).
