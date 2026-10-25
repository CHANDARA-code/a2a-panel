# agy-bridge

Delegate coding work from **Claude Code** to a team of **Google Antigravity** (`agy`) specialists, and watch and control it from a web panel.

Claude Code stays the team leader: it plans, splits the work and reviews the result. The heavy reading, editing and test running happens in Antigravity, so it uses your Antigravity quota instead of your Claude context. Claude reads back a short result: status, token usage, a `git` change summary and the tail of the output.

- **12 specialist roles** that follow the software lifecycle: `solution-architect` (requirements and design), `web-engineer`, `api-engineer`, `mobile-engineer`, `desktop-engineer`, `lead-software-engineer`, `test-engineer`, `bug-triager`, `code-reviewer`, `security-auditor`, `web-performance-auditor`, `devops-engineer`.
- **Web panel**: live logs, dispatch, cancel and re-run from the browser, with light and dark themes.
- **Token usage**: real token counts from `agy`, per task and per role (`agy-bridge usage`).
- **Safe process control**: cancel stops the whole process group; wall-clock and silence timeouts, a concurrency cap and bounded memory protect your machine.
- **Sessions**: continue an Antigravity conversation by id instead of resending context.
- **Standard interfaces**: an MCP server for Claude Code, and an A2A-style HTTP / JSON-RPC server for other clients.

## Requirements

- Node.js 18 or newer
- The Antigravity CLI (`agy`), installed and signed in
- Claude Code (for the MCP integration)
- macOS or Linux. Windows is not tested.

## Install

```bash
git clone <repo-url> agy-bridge
cd agy-bridge
npm run build:panel     # builds the web panel (optional, needed for the dashboard)
node cli.js doctor      # checks Node, agy, sign-in, git and Claude Code
node cli.js init        # registers the MCP server with Claude Code
```

With npm: `npm install -g agy-bridge`, then `agy-bridge doctor` and `agy-bridge init`. Restart Claude Code (or run `/mcp`) afterwards. In the examples below `agy-bridge` stands for `node cli.js` if you installed from a clone.

## Safety

Tasks run `agy` with `--dangerously-skip-permissions`, because headless `agy` cannot ask for approval. A task can edit files and run commands in its workspace without a prompt. Read [SECURITY.md](SECURITY.md) before you point it at a workspace you care about, and use `plan` mode when nothing should change.

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

Claude Code automatically connects to the `agy-bridge` MCP server on startup once you have run `agy-bridge init`.
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

## 2. Command line

The package installs the `agy-bridge` command (also available as `a2a`):

```bash
# List available Antigravity developer roles & specialties
agy-bridge list

# Check A2A server status & agent readiness
agy-bridge status

# Open the web task panel (monitor, dispatch, cancel)
agy-bridge dashboard

# Start / Stop the HTTP & JSON-RPC daemon (listening on port 5188)
agy-bridge server start
agy-bridge server stop

# Dispatch a task directly from terminal
agy-bridge run web-engineer "Create a user avatar component"
agy-bridge run test-engineer "Write unit tests for the auth service"
agy-bridge run code-reviewer "Review the latest changes in git"
```

---

## 3. A2A HTTP & JSON-RPC Endpoints

When running `agy-bridge server start`:
- **Agent Card**: `GET http://127.0.0.1:5188/.well-known/agent.json`
- **Health Check**: `GET http://127.0.0.1:5188/health`
- **List Roles**: `GET http://127.0.0.1:5188/roles`
- **Dispatch Task**: `POST http://127.0.0.1:5188/tasks/send`
- **Task Status**: `GET http://127.0.0.1:5188/tasks/:id`
- **JSON-RPC 2.0**: `POST http://127.0.0.1:5188/rpc`

---

## 4. Web Task Panel

Open `http://127.0.0.1:5188/dashboard` (or run `agy-bridge dashboard`).

- Monitor: stat cards, status filter, search, per-task detail with live log. Works on mobile.
- Control: dispatch a task (specialist, workspace, prompt, plan/edit mode, effort), cancel a running task, run a task again.
- Built with React, Vite and Ant Design in `panel/`. Light and dark themes.
- Tasks started from Claude Code (MCP) or the CLI show up too, because the panel reads the task logs and PID files in `logs/`.

Rebuild after changing the UI:

```bash
cd panel
npm install     # first time only
npm run build   # type-checks, then writes panel/dist
```

`npm run dev` serves the UI on port 5173 with `/api` proxied to the server. Set `VITE_A2A_TOKEN` to the contents of `token` for write calls in dev.

## 5. Security model

- The server only answers requests whose `Host` header is `127.0.0.1`, `localhost` or `[::1]` on the server port (blocks DNS rebinding).
- No CORS headers are sent.
- Every non-GET request needs the token in `the `token` file in the data folder` (mode 0600, created on first start). Send it as `X-A2A-Token: <token>` or `Authorization: Bearer <token>`. A request with an `Origin` header must be same-origin.
- The panel receives the token inside its own HTML, which only same-origin pages can read.
- The MCP server and the CLI run tasks in-process and do not use the HTTP API, so they need no token.
- Cancel stops the whole agent process group (SIGTERM, then SIGKILL after 5 seconds). Tasks started before this version run without their own process group, so cancel stops the agent and its descendants by walking the process tree.
- Panel dispatch defaults to "Plan only". "Edit files" lets the agent edit files and run commands in the chosen workspace.

## 6. Limits

Set these environment variables for the server, the MCP server and the CLI. `0` turns a limit off.

| Variable | Default | Effect |
|---|---|---|
| `A2A_TASK_TIMEOUT_MS` | `3600000` (60 min) | Stops a task that runs longer than this and marks it failed. |
| `A2A_IDLE_TIMEOUT_MS` | `0` (off) | Stops a task that prints nothing for this long. Off by default because headless `agy` can stay quiet while it works. |
| `A2A_MAX_CONCURRENT` | `4` | Refuses a new task while this many agents are running, across the server, MCP server and CLI. |
| `A2A_MAX_OUTPUT_CHARS` | `200000` | Output kept in memory per task. The log file under `logs/` keeps everything. |
| `A2A_KILL_ESCALATION_MS` | `5000` | Time between SIGTERM and SIGKILL when stopping a task. |

A stopped task shows `failed` with the reason (`Timed out after …` or `No output for …`).

## 7. Usage tracking and sessions

Tasks run with `--output-format stream-json`. The bridge turns the event stream into readable text, and records the token usage `agy` reports.

- `agy-bridge usage` shows totals and a per-role breakdown, read from `logs/usage.jsonl`. The same data is at `GET /api/usage`.
- Each synchronous MCP result ends with the task's token usage, its conversation id, and `git status` / `git diff --stat` of the workspace, so you can check the work without reading the agent's account.
- Pass `conversation_id` (from an earlier result) to continue that Antigravity conversation instead of resending context. Pass `model` to pick a model from `agy models`.
- A run whose final status from `agy` is not `SUCCESS` is marked failed.

## 8. Tests

```bash
node --test test/server.test.js
```

The tests start a server on a random port with a fake agent binary, a temporary logs directory and a temporary token, so they use no agent quota and leave no history behind.
