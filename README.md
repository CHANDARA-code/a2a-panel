# agy-bridge

Delegate coding work from **Claude Code** to a team of **Google Antigravity** (`agy`) specialists, and watch and control it from a web panel.

Claude Code stays the team leader: it plans, splits the work and reviews the result. The heavy reading, editing and test running happens in Antigravity, so it uses your Antigravity quota instead of your Claude context. Claude reads back a short result: status, token usage, a `git` change summary and the tail of the output.

- **12 specialist roles** that follow the software lifecycle: `solution-architect` (requirements and design), `web-engineer`, `api-engineer`, `mobile-engineer`, `desktop-engineer`, `lead-software-engineer`, `test-engineer`, `bug-triager`, `code-reviewer`, `security-auditor`, `web-performance-auditor`, `devops-engineer`.
- **Web panel**: live logs, dispatch, cancel and re-run from the browser, with light and dark themes.
- **Token usage**: real token counts from `agy`, per task and per role (`agy-bridge usage`).
- **Safe process control**: cancel stops the whole process group; wall-clock and silence timeouts, a concurrency cap and bounded memory protect your machine.
- **Sessions**: continue an Antigravity conversation by id instead of resending context.
- **Presets**: your coding style, frontend and API libraries and default technology choices, kept as markdown files and sent to the specialists they apply to.
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

- `a2a_dispatch_to_antigravity(role, task_description, workspace_path, mode, effort, model, conversation_id, acceptance_criteria, verification_command, preset, is_async)`
- `a2a_list_expert_agents()`
- `a2a_list_presets()`
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
agy-bridge run web-engineer "Add a settings page" --preset my-team

# Manage preference presets (see "5. Presets")
agy-bridge presets                      # list
agy-bridge presets templates
agy-bridge presets new my-team --template nestjs-react
agy-bridge presets default my-team      # or: agy-bridge presets default none
agy-bridge presets show my-team
```

---

## 3. A2A HTTP & JSON-RPC Endpoints

When running `agy-bridge server start`:
- **Agent Card**: `GET http://127.0.0.1:5188/.well-known/agent.json`
- **Health Check**: `GET http://127.0.0.1:5188/health`
- **List Roles**: `GET http://127.0.0.1:5188/roles`
- **Dispatch Task**: `POST http://127.0.0.1:5188/tasks/send`. Optional `preset` (a preset id, or `null` / `"none"` for none; omitted means the default preset). JSON-RPC `message/send` takes the same field.
- **Presets** (panel API, token required for changes): `GET /api/presets`, `POST /api/presets` (`{id, template?, from?, title?}`), `GET|PUT|DELETE /api/presets/:id`, `POST|DELETE /api/presets/:id/default`, and `POST /api/prompt-preview` (`{role, workspace, prompt, preset}`) to see the exact prompt.
- **Task Status**: `GET http://127.0.0.1:5188/tasks/:id`. Returns status, output, `usage`, `verification`, `conversationId`, `changes` and `workspace`, so an async caller gets the same facts as a synchronous one. JSON-RPC `tasks/get` returns the same fields.
- **JSON-RPC 2.0**: `POST http://127.0.0.1:5188/rpc` with `message/send`, `tasks/get`, `tasks/list` and `tasks/cancel`. Streaming and push notifications are not implemented; the agent card says so.

---

## 4. Web Task Panel

Open `http://127.0.0.1:5188/dashboard` (or run `agy-bridge dashboard`).

- Monitor: stat cards, status filter, search, per-task detail with live log. Works on mobile.
- Control: dispatch a task (specialist, workspace, prompt, preset, plan/edit mode, effort), preview the exact prompt, cancel a running task, run a task again.
- Presets: create, edit and preview your preference files (see "5. Presets").
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

## 5. Presets

A preset holds your preferences as a folder of markdown files, one topic per file: coding style, frontend stack, API stack, testing, default technology choices, and anything else you add. When a task starts, the bridge adds the files that apply to that specialist to its prompt, under `### USER PREFERENCES`, before the task itself.

**Presets start empty.** Nothing is added to a prompt until you create a preset and either make it the default or pick it for a task.

### Files and roles

Each file can say which specialists it is for with a `roles` list in its frontmatter. A file without `roles` goes to every specialist. The `web-engineer` gets your frontend rules and not your ORM rules, so prompts stay short.

```markdown
---
title: Frontend stack
roles: [web-engineer, web-performance-auditor, code-reviewer, test-engineer]
---
- React 19 + TypeScript, built with Vite.
- UI library: Ant Design 5. Do not add Tailwind or MUI.
- Server state: TanStack Query.
```

In the panel you edit `roles` with a specialist picker; you don't need to write the frontmatter by hand.

### Where presets live

| Location | What it is |
|---|---|
| `presets/<id>/` in the data folder (`~/.agy-bridge/presets` for an npm install; the clone folder otherwise, git-ignored) | Your named presets: `preset.json` (title, description) and the `.md` files. Managed from the panel or the CLI. Override the folder with `A2A_PRESETS_DIR`. |
| `<workspace>/.agy/preferences/*.md` | Optional, per repository, can be committed so the team shares it. A file here replaces the preset file with the same name, and it applies even when no preset is chosen. |
| `preset-templates/` | Starter templates shipped with the bridge: `nestjs-react`, `nextjs-fullstack` and `flutter-mobile`. A new preset can copy one, then you edit it. |

### Which preset a task uses

- **Panel**: the Preset field in New task, pre-filled with the default. "Preview prompt" shows exactly what the agent will receive.
- **Claude Code**: the `preset` argument of `a2a_dispatch_to_antigravity`; `a2a_list_presets` lists them.
- **CLI**: `--preset <id>`. **HTTP / JSON-RPC**: the `preset` field.
- If no preset is given, the default preset is used. Use `none` (or `null` in JSON) to send no preset. An unknown preset id is refused.

The preset and the files a task received appear in the task list, the task detail and the log header (`Preset:` and `Preferences:` lines). A task's MCP result ends with them too. The preference section is capped at 16,000 characters, and each file at 20,000.

### Screenshots

**Presets start empty.**

![Presets page with no presets](docs/screenshots/09-presets-empty.png)

**New preset from a template.** Start from a template, copy another preset, or start empty.

![New preset dialog](docs/screenshots/10-new-preset.png)

**Editor.** One tab per markdown file. Set the file name and the specialists it applies to, then edit the markdown. Set a preset as the default, delete it, or discard your changes.

![Preset editor](docs/screenshots/11-preset-editor.png)

**Markdown preview.**

![Preset markdown preview](docs/screenshots/12-preset-preview.png)

**Picking a preset for a task.** The default preset is pre-selected.

![New task with a preset](docs/screenshots/13-new-task-preset.png)

**Prompt preview.** Shows exactly what the specialist receives, with the files that apply to it. For the `web-engineer` this preset leaves out `api.md`.

![Prompt preview](docs/screenshots/14-prompt-preview.png)

**The task records its preset.** Asked which libraries it was told to use, the agent answered Ant Design 5 and TanStack Query (from `frontend.md`), and Jest, supertest, Vitest and React Testing Library (from `testing.md`).

![Task detail with its preset](docs/screenshots/15-task-with-preset.png)

**Mobile.**

<img src="docs/screenshots/16-presets-mobile.png" alt="Preset editor on mobile" width="320">

## 6. Security model

- The server only answers requests whose `Host` header is `127.0.0.1`, `localhost` or `[::1]` on the server port (blocks DNS rebinding).
- No CORS headers are sent.
- Every non-GET request needs the token in `the `token` file in the data folder` (mode 0600, created on first start). Send it as `X-A2A-Token: <token>` or `Authorization: Bearer <token>`. A request with an `Origin` header must be same-origin.
- The panel receives the token inside its own HTML, which only same-origin pages can read.
- The MCP server and the CLI run tasks in-process and do not use the HTTP API, so they need no token.
- Cancel stops the whole agent process group (SIGTERM, then SIGKILL after 5 seconds). Tasks started before this version run without their own process group, so cancel stops the agent and its descendants by walking the process tree.
- Panel dispatch defaults to "Plan only". "Edit files" lets the agent edit files and run commands in the chosen workspace.

## 7. Limits

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

## 8. Usage tracking and sessions

Tasks run with `--output-format stream-json`. The bridge turns the event stream into readable text, and records the token usage `agy` reports.

- `agy-bridge usage` shows totals and a per-role breakdown, read from `logs/usage.jsonl`. The same data is at `GET /api/usage`.
- Each synchronous MCP result ends with the task's token usage, its conversation id, and `git status` / `git diff --stat` of the workspace, so you can check the work without reading the agent's account.
- Pass `conversation_id` (from an earlier result) to continue that Antigravity conversation instead of resending context. Pass `model` to pick a model from `agy models`.
- A run whose final status from `agy` is not `SUCCESS` is marked failed.

## 9. Verification gate

If a task has a `verification_command` (MCP tool, `/tasks/send`, or JSON-RPC `message/send`), the agent is told to run it, and then **the bridge runs it again itself** in the workspace once the agent has finished successfully.

- Exit code 0: the task stays `completed`.
- Non-zero exit or a timeout (`A2A_VERIFY_TIMEOUT_MS`, default 10 minutes): the task is marked `failed`, and the result includes the command's output tail.
- The result and the log record the outcome as "run by the bridge (not the agent)". `a2a_validate_delivery` uses the same gate.
- If the agent itself failed, the command is not run.
- The command runs through `sh -c` with your user's permissions, like the agent does. It can't be cancelled while it runs; the timeout is the limit.

A passing command only proves what that command checks. If the agent also wrote the tests, a green run says little, so review the diff too.

## 10. Tests

```bash
node --test test/server.test.js
```

The tests start a server on a random port with a fake agent binary, a temporary logs directory and a temporary token, so they use no agent quota and leave no history behind.
