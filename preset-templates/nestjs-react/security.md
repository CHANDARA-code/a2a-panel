---
title: Security for this stack
roles: [security-auditor, code-reviewer, api-engineer, web-engineer]
---
- `helmet` on the API, and CORS limited to the web app's own origins (never `*` together with credentials).
- Rate limit sign-in and other sensitive routes with `@nestjs/throttler`.
- Hash passwords with argon2 or bcrypt. Never log tokens, passwords or whole request bodies.
- Queries go through Prisma's typed API. If raw SQL is unavoidable, use the `$queryRaw` tagged template, which parameterizes values; never pass user input to `$queryRawUnsafe` or `$executeRawUnsafe`.
- Authorization checks that the user owns the record, in the service, not only that they are signed in.
- In the web app, keep tokens in HttpOnly cookies rather than `localStorage` where the API allows it, and never pass untrusted HTML to `dangerouslySetInnerHTML` without sanitizing it.
