---
title: Coding style
---
- TypeScript everywhere, `strict: true`. No `any`; use `unknown` and narrow it.
- Names: `camelCase` for variables and functions, `PascalCase` for types, classes and React components, `kebab-case` for file names (`order-item.service.ts`).
- Prefer small pure functions and early returns over nested conditionals.
- Comments explain *why*, not *what*. No commented-out code.
- Formatting is Prettier defaults (single quotes, trailing commas, 2 spaces); lint with ESLint and fix all warnings you introduce.
- Keep a change focused: do not reformat or rename code unrelated to the task.
- Commit messages use Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`).
