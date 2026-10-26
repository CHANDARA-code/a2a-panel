---
title: Frontend stack
roles: [web-engineer, web-performance-auditor, code-reviewer, test-engineer, lead-software-engineer]
---
- **Next.js 15 App Router**. Server Components by default; add `"use client"` only for interactivity.
- Styling: **Tailwind CSS** with **shadcn/ui** components. No CSS-in-JS.
- Data mutations through **server actions** with `zod` validation; reads in Server Components.
- Forms: `react-hook-form` + `zod` on the client, the same schema re-checked in the action.
- Images through `next/image`, fonts through `next/font`.
- Meet Core Web Vitals: LCP < 2.5s, CLS < 0.1, INP < 200ms on a mid-range phone.
