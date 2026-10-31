---
title: Default technology choices
roles: [solution-architect, devops-engineer, release-manager, lead-software-engineer, api-engineer, web-engineer]
---
When the task leaves a choice open, use these:

| Concern | Default |
|---|---|
| Package manager | npm workspaces (`apps/api`, `apps/web`) |
| Node.js | the current Active LTS release |
| Database | PostgreSQL 18 |
| Cache / queue | Redis + BullMQ |
| Containers | Docker, with `docker compose` for local development |
| CI | GitHub Actions: lint, typecheck, test and build on every pull request |
| Logging | `pino` (JSON), with a request id on every line |
| Versioning | semver, with one `CHANGELOG.md` at the repository root |

Add a dependency outside this list only when the task needs it, and name it with the reason in your report.
