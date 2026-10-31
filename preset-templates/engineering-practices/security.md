---
title: Security practices
roles: [security-auditor, code-reviewer, api-engineer]
---
## Input and injection
- Validate on the server against an allowlist; client-side checks are UX, not a boundary.
- Never build SQL, shell commands or other queries by concatenating untrusted input: use parameterized queries and argument arrays.
- Escape output for its context, with the right function for each context.

## Authentication and authorization
- Check both who the user is and whether that user may do this action on this resource; a missing ownership check is an IDOR.
- Hash passwords with bcrypt, scrypt or Argon2, never plain SHA or MD5.
- Session tokens are cryptographically random, HttpOnly and Secure, and invalidated on the server at sign-out.

## Secrets
- No secrets in source, comments, committed config or git history. Take them from environment variables or a secrets manager, with different values per environment. A committed secret must be rotated; deleting the file is not enough.

## Dependencies and privilege
- Run the ecosystem's audit tool (npm audit, pip-audit, or similar). Before adding a dependency, check its size, maintenance and license (GPL and AGPL carry obligations).
- Least privilege everywhere: narrow token scopes, file permissions, database roles and IAM policies.

## Reviewing
- Check the change against the OWASP categories: injection, broken authentication, sensitive data exposure, XXE, broken access control, misconfiguration, XSS, insecure deserialization, vulnerable components, and missing logging.
- Report each finding with file:line, a concrete exploit scenario and the fix.
