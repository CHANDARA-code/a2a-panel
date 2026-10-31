---
title: Default technology choices
roles: [solution-architect, devops-engineer, release-manager, lead-software-engineer]
---
When the task leaves a choice open, use these:

- Package manager: pnpm. Node.js: the current Active LTS release.
- Hosting: Vercel for the app, managed PostgreSQL (Neon or Supabase).
- CI: GitHub Actions running lint, typecheck, test and `next build` on every pull request.
- Monitoring: Sentry for errors, Vercel Analytics for Web Vitals.
- Versioning: semver, with one `CHANGELOG.md` at the repository root.

Add a dependency outside these only when the task needs it, and name it with the reason in your report.
