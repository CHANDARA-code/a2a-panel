---
title: Default technology choices
roles: [solution-architect, devops-engineer, lead-software-engineer, api-engineer, web-engineer]
---
When the task leaves a choice open, use these:

| Concern | Default |
|---|---|
| Package manager | npm (workspaces for the monorepo) |
| Node.js | current LTS |
| Database | PostgreSQL 16 |
| Cache / queue | Redis + BullMQ |
| Containers | Docker, `docker compose` for local development |
| CI | GitHub Actions: lint, typecheck, test, build |
| Logging | `pino` (JSON) |

Ask in your report before introducing a new dependency outside this list.
