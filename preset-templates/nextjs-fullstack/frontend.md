---
title: Frontend stack
roles: [web-engineer, web-performance-auditor, code-reviewer, test-engineer, lead-software-engineer]
---
## Versions
- Use the Next.js, React, Tailwind and Zod major versions already in `package.json`, and read that version's documentation before using an API: App Router behaviour such as caching and request APIs changes between Next.js majors. For a new project use the current stable majors (check with `npm view <package> version`; in October 2026: Next.js 16, React 19, Tailwind CSS 4, Zod 4).

## Stack
- App Router. Server Components by default; add `"use client"` only to the smallest component that needs interactivity, and pass it serializable props only, never secrets.
- Styling: Tailwind CSS with shadcn/ui components; no CSS-in-JS. Tailwind 4 is configured in CSS (`@import "tailwindcss"` and `@theme`) rather than in `tailwind.config.js`.
- Reads happen in Server Components; mutations go through server actions validated with `zod`.
- After a mutation, revalidate what changed (`revalidatePath` or `revalidateTag`) so pages do not show stale data.
- Forms: `react-hook-form` + `zod` on the client, with the same schema checked again in the server action.
- Only `NEXT_PUBLIC_` variables reach the browser; never put secrets in them.
- Images through `next/image`, fonts through `next/font`.
- Meet Core Web Vitals on a mid-range phone: LCP under 2.5 s, CLS under 0.1, INP under 200 ms.
