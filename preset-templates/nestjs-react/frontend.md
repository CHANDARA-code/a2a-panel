---
title: Frontend stack
roles: [web-engineer, web-performance-auditor, code-reviewer, test-engineer, lead-software-engineer]
---
## Versions
- Use the React, Ant Design, TanStack Query and React Router major versions already in `package.json`, and read that version's documentation before using an API. For a new project use the current stable majors (check with `npm view <package> version`; in October 2026: React 19, Ant Design 6, TanStack Query 5, React Router 8, Vite 8).

## Stack
- React + TypeScript, built with Vite. Function components and hooks only.
- UI library: Ant Design (`antd`, `@ant-design/icons`). Do not add Tailwind, MUI or another component library.
- Wrap the app in Ant Design's `<App>` and take `message`, `modal` and `notification` from `App.useApp()`; the static `message.success(...)` calls ignore the app's theme and context.
- Server state: TanStack Query. Query keys are arrays that hold every parameter (`['orders', { page, status }]`). After a mutation, invalidate the keys it affects. Never copy query data into `useState`.
- Client state: React state or context; Zustand only for state shared across pages.
- Routing: React Router, with lazily loaded route components to split the bundle.
- Forms: Ant Design `Form`, or `react-hook-form` + `zod` for complex validation.
- API calls live in `src/api/` as typed functions; components never call `fetch` directly.
- Only `VITE_`-prefixed variables reach the browser bundle; never put secrets in them.
- Every page works at 360 px width and with the keyboard alone.
