---
title: API stack
roles: [api-engineer, code-reviewer, security-auditor, test-engineer, lead-software-engineer]
---
- **NestJS 11** with one module per domain (`orders/`, `menu-items/` ...): controller, service, DTOs, entities.
- Database: **PostgreSQL** through **Prisma**. Schema changes go through `prisma migrate dev` with a named migration.
- Validate every request body with `class-validator` DTOs and a global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`.
- REST, plural resource names, global prefix `api`. Errors use Nest HTTP exceptions; never leak stack traces.
- Config via `@nestjs/config` and environment variables; no secrets in code.
- Document endpoints with `@nestjs/swagger` decorators.
- Auth: JWT access tokens via `@nestjs/passport`; guard every non-public route.
