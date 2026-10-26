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
git clone https://github.com/CHANDARA-code/agy-bridge.git agy-bridge
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

- `a2a_dispatch_to_antigravity(role, task_description, workspace_path, mode, effort, model, conversation_id, acceptance_criteria, verification_command, is_async)`
- `a2a_list_expert_agents()`
- `a2a_get_task_status(task_id)`
- `a2a_cancel_task(task_id)`
- `a2a_validate_delivery(task_summary, acceptance_criteria, verification_command, workspace_path)`

### In Claude Code, you can:
> "Design the database schema, then delegate the API endpoints to the Antigravity api-engineer and have the test-engineer cover them."

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
- **Task Status**: `GET http://127.0.0.1:5188/tasks/:id`. Returns status, output, `usage`, `verification`, `conversationId`, `changes` and `workspace`, so an async caller gets the same facts as a synchronous one. JSON-RPC `tasks/get` returns the same fields.
- **JSON-RPC 2.0**: `POST http://127.0.0.1:5188/rpc` with `message/send`, `tasks/get`, `tasks/list` and `tasks/cancel`. Streaming and push notifications are not implemented; the agent card says so.

---

## 4. Web Task Panel

Open `http://127.0.0.1:5188/dashboard` (or run `agy-bridge dashboard`).

- Monitor: stat cards, status filter, search, per-task detail with live log. Works on mobile.
- Control: dispatch a task (specialist, workspace, prompt, plan/edit mode, effort), cancel a running task, run a task again.
- Built with React, Vite and Ant Design in `panel/`. Light and dark themes.
- Tasks started from Claude Code (MCP) or the CLI show up too, because the panel reads the task logs and PID files in `logs/`.
- The live log shows each tool the agent runs, with its main argument, for example `[tool] run_command: npm test` or `[tool] read_file: /path/to/file.ts`. A tool call that fails shows as `[error] <tool>: <args> (<reason>)`. If `agy` reports denied actions, the task output ends with `[A2A] Antigravity denied these actions: …`.

Rebuild after changing the UI:

```bash
cd panel
npm install     # first time only
npm run build   # type-checks, then writes panel/dist
```

`npm run dev` serves the UI on port 5173 with `/api` proxied to the server. Set `VITE_A2A_TOKEN` to the contents of `token` for write calls in dev.

### Example: building an eMenu with the team

This walkthrough built an eMenu app (NestJS API + React web) in an empty git repository at `~/Downloads/emenu`. All the coding and testing was done by Antigravity agents.

1. Two tasks were sent in parallel with `POST /tasks/send` and `"async": true`. The `api-engineer` built the NestJS backend in `api/`, and the `web-engineer` built the React + Vite frontend in `web/`. Each task had a `verification_command` (`cd api && npm run build && npm test`, `cd web && npm run build && npm test -- --run`).
2. Both agents finished in about 10–12 minutes. The bridge then ran each verification command itself, and both passed: 32 API tests and 24 web tests.
3. A `code-reviewer` task in `plan` mode then reviewed both halves without editing files, and reported 13 findings ranked by severity.

**Overview while a task runs.** Stat cards, status filter, search and the task table. Running tasks have a Cancel button.

![Overview while a task is running](docs/screenshots/01-overview-running.png)

**Status filter.** The "Running" filter while the `api-engineer` and `web-engineer` worked in parallel.

![Running filter](docs/screenshots/02-filter-running.png)

**Task detail with live log.** Click a task to open its details, prompt and live log. Each tool call appears as it happens.

![Task detail with live log](docs/screenshots/03-task-detail-live-log.png)

**New task.** Pick a specialist, workspace, prompt, mode (plan only or edit files) and effort.

![New task dialog](docs/screenshots/04-new-task-dialog.png)

**All tasks completed.**

![Overview after all tasks completed](docs/screenshots/05-overview-completed.png)

**Completed task.** Finish time, exit code and the full result. The code review's findings are at the end of the log.

![Completed task detail](docs/screenshots/06-task-detail-completed.png)

**Dark theme.**

![Dark theme](docs/screenshots/07-dark-theme.png)

**Mobile layout.**

<img src="docs/screenshots/08-mobile.png" alt="Mobile layout" width="320">

**The result.** The customer menu and the kitchen order board the agents built:

![eMenu customer menu](docs/screenshots/emenu-menu.png)

![eMenu kitchen board](docs/screenshots/emenu-kitchen.png)

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
| `A2A_VERIFY_TIMEOUT_MS` | `600000` (10 min) | Limit for the bridge's own run of a `verification_command`. |
| `A2A_LOG_RETENTION_DAYS` | `14` | Task logs older than this are deleted when a new task starts. |

A stopped task shows `failed` with the reason (`Timed out after …` or `No output for …`).

## 7. Usage tracking and sessions

Tasks run with `--output-format stream-json`. The bridge turns the event stream into readable text, and records the token usage `agy` reports.

- `agy-bridge usage` shows totals and a per-role breakdown, read from `logs/usage.jsonl`. The same data is at `GET /api/usage`.
- Each synchronous MCP result ends with the task's token usage, its conversation id, and `git status` / `git diff --stat` of the workspace, so you can check the work without reading the agent's account.
- Pass `conversation_id` (from an earlier result) to continue that Antigravity conversation instead of resending context. Pass `model` to pick a model from `agy models`.
- A run whose final status from `agy` is not `SUCCESS` is marked failed.

## 8. Verification gate

If a task has a `verification_command` (MCP tool, `/tasks/send`, or JSON-RPC `message/send`), the agent is told to run it, and then **the bridge runs it again itself** in the workspace once the agent has finished successfully.

- Exit code 0: the task stays `completed`.
- Non-zero exit or a timeout (`A2A_VERIFY_TIMEOUT_MS`, default 10 minutes): the task is marked `failed`, and the result includes the command's output tail.
- The result and the log record the outcome as "run by the bridge (not the agent)". `a2a_validate_delivery` uses the same gate.
- If the agent itself failed, the command is not run.
- The command runs through `sh -c` with your user's permissions, like the agent does. It can't be cancelled while it runs; the timeout is the limit.

A passing command only proves what that command checks. If the agent also wrote the tests, a green run says little, so review the diff too.

## 9. Tests

```bash
node --test test/server.test.js
```

The tests start a server on a random port with a fake agent binary, a temporary logs directory and a temporary token, so they use no agent quota and leave no history behind.
