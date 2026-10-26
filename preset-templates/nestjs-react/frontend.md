---
title: Frontend stack
roles: [web-engineer, web-performance-auditor, code-reviewer, test-engineer, lead-software-engineer]
---
- React 19 + TypeScript, built with Vite. Function components and hooks only.
- UI library: **Ant Design 5** (`antd`, `@ant-design/icons`). Do not add Tailwind, MUI or another component library.
- Server state: **TanStack Query**. Client state: React state or context; reach for **Zustand** only for shared cross-page state.
- Routing: **React Router** (data routers).
- Forms: Ant Design `Form`, or `react-hook-form` + `zod` for complex validation.
- API calls live in `src/api/` as typed functions; components never call `fetch` directly.
- Every page must work at 360px width and support keyboard navigation.
