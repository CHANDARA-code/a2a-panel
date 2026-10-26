---
title: Default technology choices
roles: [solution-architect, devops-engineer, lead-software-engineer]
---
- Package manager: **pnpm**. Node.js current LTS.
- Hosting: Vercel for the app, managed PostgreSQL (Neon or Supabase).
- CI: GitHub Actions running lint, typecheck, test and `next build`.
- Monitoring: Sentry for errors, Vercel Analytics for Web Vitals.
