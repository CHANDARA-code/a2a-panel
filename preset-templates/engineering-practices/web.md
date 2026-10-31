---
title: Web practices
roles: [web-engineer, web-performance-auditor]
---
## Accessibility (WCAG 2.2 AA)
- Everything interactive works by keyboard (Tab, Enter or Space, Esc) with a visible focus style; never remove outlines without a replacement.
- Images have alt text (alt="" for decorative ones); inputs have a real label, not only a placeholder.
- Contrast at least 4.5:1 for normal text and 3:1 for large text; measure it, don't eyeball it.
- Use semantic elements (button, nav, main, article) before ARIA.

## Performance (Core Web Vitals)
- LCP at most 2.5 s: preload the hero image or text; never lazy-load above-the-fold content.
- INP at most 200 ms: split tasks longer than 50 ms and defer non-critical work.
- CLS at most 0.1: reserve space for images and embeds (width and height, or aspect-ratio); don't insert content above existing content after load.
- Ship less JavaScript: split by route, lazy-load below the fold, and check a dependency's size before adding it for a few lines of work.

## Security
- Content-Security-Policy without unsafe-inline or unsafe-eval.
- Session cookies HttpOnly, Secure and SameSite=Lax or Strict.
- Escape output by context (HTML body, attribute, inline script); prefer auto-escaping templates.
- Client-side validation is UX only; the server re-validates everything.
- Pin third-party scripts and add Subresource Integrity to files loaded from a CDN.

## Rendering and build
- Choose CSR, SSR, SSG or islands from how often the content changes and how interactive it is; don't build a full SPA for a mostly static site.
- Commit the lock file, keep build tools in devDependencies, and keep secrets in environment variables, never in source or a committed .env file.
