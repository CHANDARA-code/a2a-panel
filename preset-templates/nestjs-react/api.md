---
title: API stack
roles: [api-engineer, code-reviewer, security-auditor, test-engineer, lead-software-engineer]
---
## Versions
- Use the NestJS, Prisma and library major versions already in `package.json`, and read that version's documentation before using an API. For a new project use the current stable majors (check with `npm view <package> version`; in October 2026 that is NestJS 12).

## Structure
- One module per domain (`orders/`, `menu-items/`): controller, service, DTOs. A new module does nothing until it is imported in `AppModule` or a parent module, and a new provider until it is listed in its module.
- Controllers stay thin: validate, call the service, return. Business rules live in services.
- REST with plural resource names and the global prefix `api`. Map domain errors to Nest HTTP exceptions (`NotFoundException`, `ConflictException`, ...); never leak stack traces or Prisma error messages.
- Document every endpoint and DTO with `@nestjs/swagger` decorators.

## Validation
- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`, which needs both `class-validator` and `class-transformer`.
- Every body, query and route parameter has a DTO or a pipe (`ParseIntPipe`, `ParseUUIDPipe`). Nested objects need `@ValidateNested()` and `@Type()`.

## Data: Prisma and PostgreSQL
- After changing the schema, create a named migration with `prisma migrate dev --name <change>` and run `prisma generate`. Never edit a migration that has already been applied; add a new one. CI and production apply migrations with `prisma migrate deploy`; never use `prisma db push` on a shared database.
- Never return Prisma models that hold secrets (password hashes, tokens) directly: use `select` or map to a response DTO.
- Use `$transaction` when several writes must succeed or fail together. Paginate every list endpoint.

## Config and auth
- Configuration through `@nestjs/config` and environment variables, validated at startup. No secrets in code.
- JWT access tokens through `@nestjs/passport`. Prefer a global auth guard plus an explicit `@Public()` decorator for open routes, so new routes are protected by default. Check that the user owns the resource, not only that they are signed in.
