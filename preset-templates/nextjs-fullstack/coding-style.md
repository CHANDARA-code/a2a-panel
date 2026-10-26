---
title: Coding style
---
- TypeScript `strict`. No `any`, no non-null assertions without a comment saying why.
- `kebab-case` file names, `PascalCase` components, named exports (default export only where Next.js requires it).
- Server code stays on the server: mark modules with `import 'server-only'` when they touch secrets or the database.
- Prettier + ESLint (`next/core-web-vitals`); fix every warning you introduce.
- Small, focused changes; Conventional Commit messages.
