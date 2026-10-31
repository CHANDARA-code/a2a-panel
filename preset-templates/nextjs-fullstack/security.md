---
title: Security for this stack
roles: [security-auditor, code-reviewer, api-engineer, web-engineer]
---
- Treat every server action and route handler as a public endpoint: authenticate, check access to the specific record, and validate the input inside it.
- Secrets live only in server-side environment variables: never in `NEXT_PUBLIC_` variables, in props passed to client components, or in error messages.
- Queries go through Drizzle's query builder or its `sql` template, which parameterizes values; never build SQL strings from user input.
- Set security headers (Content-Security-Policy, `frame-ancestors`) through the `headers()` setting in `next.config`, and never pass untrusted HTML to `dangerouslySetInnerHTML` without sanitizing it.
- Rate limit sign-in and other actions that can be abused.
