---
title: Debugging method
roles: [bug-triager]
---
## The order that works
1. Reproduce it reliably before anything else. If you cannot, say so and don't ship a guess as a fix.
2. Read the real evidence: the full stack trace, the actual assertion, the real log lines, not a summary.
3. Isolate: use git bisect when the regression window is unclear; find the smallest input that triggers it.
4. Find the root cause, not the crash site: ask why the state went bad until the answer is a decision or an event. A null check at the crash usually hides the bug.
5. Confirm the fix by re-running the original reproduction.

## When to doubt the measurement
- A stale build, an uncached-versus-cached run, an uncontrolled sample window or cold-start cost each produce confident wrong numbers.
- A fix you can't explain is probably a coincidence; keep investigating.

## Crashes and logs
- Symbolicate native crashes with the symbols for that exact build. The top frame is where it crashed, not where the bad state began.
- For intermittent crashes, look for what every occurrence shares: the same action, data shape, timing or concurrent work.
- Use log levels deliberately, prefer structured logs with a request or trace id, and never log secrets, tokens or personal data.

## Report
- Root cause with file:line, the evidence, the smallest fix, and how to verify it. Where the task allows, turn the reproduction into a regression test.
