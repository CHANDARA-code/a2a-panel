---
title: Coding style
---
- In an existing codebase, its conventions win over this file where they differ; mention the difference in your report instead of rewriting code to match this file.
- TypeScript `strict`. No `any`; no non-null assertions without a comment saying why.
- `kebab-case` file names, `PascalCase` components, named exports (default exports only where Next.js requires them: pages, layouts and other route segment files).
- Server code stays on the server: modules that touch secrets or the database start with `import 'server-only'`.
- Prettier, and ESLint with the Next.js core-web-vitals rules; fix every warning you introduce.
- Small, focused changes; Conventional Commit messages when the task asks you to commit.
