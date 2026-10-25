# A2A Protocol: Claude Code (Team Leader) <-> Antigravity (Senior Developer Team)

This system establishes an **Agent-to-Agent (A2A)** protocol connection between **Claude Code** (acting as Lead Architect & Team Leader) and **Google Antigravity** (acting as the Senior Software Developer Squad).

---

## Architecture Overview

```
                      +---------------------------------------+
                      |         USER REQUEST / GOAL           |
                      +---------------------------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |       Claude Code (Team Leader)       |
                      |   • High-Level Architecture           |
                      |   • Requirements Decomposition        |
                      |   • Code Review & Integration         |
                      +---------------------------------------+
                                          |
                 +------------------------+------------------------+
                 | A2A Protocol Bridge                             |
                 | (Native MCP Stdio / HTTP / JSON-RPC 2.0)        |
                 v                                                 v
   +---------------------------+                     +---------------------------+
   |   A2A MCP Stdio Server    |                     |  A2A HTTP/JSON-RPC Server |
   |  (Direct inside Claude)   |                     |   (http://127.0.0.1:5188) |
   +---------------------------+                     +---------------------------+
                 \                                                 /
                  \                                               /
                   v                                             v
        +---------------------------------------------------------------+
        |           ANTIGRAVITY SENIOR DEVELOPER TEAM (agy)             |
        |                                                               |
        |  [web-engineer]           Frontend UI, SSR/SSG, React/Next    |
        |  [api-engineer]           REST/GraphQL APIs, DB schemas, ORM  |
        |  [mobile-engineer]        Flutter, Dart, iOS, Android         |
        |  [desktop-engineer]       Electron, Tauri, native macOS       |
        |  [test-engineer]          QA test suites, unit & integration  |
        |  [bug-triager]            Root cause analysis & reproduction  |
        |  [security-auditor]       OWASP audits, auth flow hardening   |
        |  [code-reviewer]          Multi-axis code review & logic      |
        |  [web-performance-auditor]Core Web Vitals & bundle profiling  |
        |  [solution-architect]     Requirements, SRS, HLD/LLD, task plan|
        |  [devops-engineer]        CI/CD, release, rollout, monitoring |
        |  [lead-software-engineer] Complex multi-file implementations  |
        +---------------------------------------------------------------+
```

---

## 1. Native Claude Code Integration

Claude Code automatically connects to the `a2a-antigravity` MCP server on startup.
It provides Claude Code with the following tools:

- `a2a_dispatch_to_antigravity(role, task_description, workspace_path, mode, effort, is_async)`
- `a2a_list_expert_agents()`
- `a2a_get_task_status(task_id)`
- `a2a_cancel_task(task_id)`

### In Claude Code, you can:
1. Ask Claude Code directly:
   > "Claude, design the database schema and delegate the API endpoints implementation to the Antigravity api-engineer."
2. Or use the slash command:
   > `/a2a web-engineer "Create the authentication login form with Formik and Tailwind"`

---

## 2. A2A CLI (`a2a`)

A dedicated CLI is installed at `~/.local/bin/a2a`:

```bash
# List available Antigravity developer roles & specialties
a2a list

# Check A2A server status & agent readiness
a2a status

# Open the web task panel (monitor, dispatch, cancel)
a2a dashboard

# Start / Stop the A2A HTTP & JSON-RPC daemon (listening on port 5188)
a2a server start
a2a server stop

# Dispatch a task directly from terminal
a2a run web-engineer "Create a user avatar component"
a2a run test-engineer "Write unit tests for the auth service"
a2a run code-reviewer "Review the latest changes in git"
```

---

## 3. A2A HTTP & JSON-RPC Endpoints

When running `a2a server start`:
- **Agent Card**: `GET http://127.0.0.1:5188/.well-known/agent.json`
- **Health Check**: `GET http://127.0.0.1:5188/health`
- **List Roles**: `GET http://127.0.0.1:5188/roles`
- **Dispatch Task**: `POST http://127.0.0.1:5188/tasks/send`
- **Task Status**: `GET http://127.0.0.1:5188/tasks/:id`
- **JSON-RPC 2.0**: `POST http://127.0.0.1:5188/rpc`

---

## 4. Web Task Panel

Open `http://127.0.0.1:5188/dashboard` (or run `a2a dashboard`).

- Monitor: stat cards, status filter, search, per-task detail with live log. Works on mobile.
- Control: dispatch a task (specialist, workspace, prompt, plan/edit mode, effort), cancel a running task, run a task again.
- Built with React, Vite and Ant Design in `panel/`. Light and dark themes.
- Tasks started from Claude Code (MCP) or the `a2a` CLI show up too, because the panel reads the task logs and PID files in `logs/`.

Rebuild after changing the UI:

```bash
cd ~/.a2a-antigravity/panel
npm install     # first time only
npm run build   # type-checks, then writes panel/dist
```

`npm run dev` serves the UI on port 5173 with `/api` proxied to the server. Set `VITE_A2A_TOKEN` to the contents of `token` for write calls in dev.

## 5. Security model

- The server only answers requests whose `Host` header is `127.0.0.1`, `localhost` or `[::1]` on the server port (blocks DNS rebinding).
- No CORS headers are sent.
- Every non-GET request needs the token in `~/.a2a-antigravity/token` (mode 0600, created on first start). Send it as `X-A2A-Token: <token>` or `Authorization: Bearer <token>`. A request with an `Origin` header must be same-origin.
- The panel receives the token inside its own HTML, which only same-origin pages can read.
- The MCP server and the `a2a` CLI run tasks in-process and do not use the HTTP API, so they need no token.
- Cancel stops the whole agent process group (SIGTERM, then SIGKILL after 5 seconds). Tasks started before this version run without their own process group, so cancel stops the agent and its descendants by walking the process tree.
- Panel dispatch defaults to "Plan only". "Edit files" lets the agent edit files and run commands in the chosen workspace.

## 6. Tests

```bash
cd ~/.a2a-antigravity
node --test test/server.test.js
```

The tests start a server on a random port with a fake agent binary, a temporary logs directory and a temporary token, so they use no agent quota and leave no history behind.
