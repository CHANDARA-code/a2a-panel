---
title: API practices
roles: [api-engineer]
---
## Conventions
- Match the existing API first: its status codes, error shape, pagination and auth. Consistent beats ideal.
- REST resources are plural nouns (/users/{id}/orders). GET has no side effects; PUT and DELETE are idempotent; PATCH updates part of a resource.
- Use the exact status: 201 with Location for a create, 204 for success with no body, 400 for invalid input, 401 unauthenticated, 403 not allowed, 404, 409 conflict, 422 semantically invalid, 429 with Retry-After. Use 5xx only for server or upstream faults.

## Errors
- One error envelope everywhere: {"error": {"code": "STABLE_CODE", "message": "...", "details": [...]}}. Clients branch on code, never on message.
- Never leak stack traces, SQL, file paths or internal host names.

## Compatibility
- Never break a shipped version: no renamed, removed or repurposed fields and no changed status meanings. New fields are optional with sensible defaults. A real break gets a new version and a deprecation period.
- Version in the path or a header, consistently.

## Safety
- Paginate every collection; prefer cursors, and return has_more or next_cursor.
- Payments, messages and provisioning accept an idempotency key so a retry cannot run twice.
- JWT: verify the signature and exp on every request, never trust unverified claims, and put nothing secret inside.
- Rate limit per identity (key, user or IP).
- Use OAuth 2.0 or OIDC for delegated user sign-in instead of a home-made scheme.
