# Changelog

All notable changes to a2a-panel are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-10-26

### Added

- Start at login: `a2a-panel autostart enable | disable | status`. It installs a per-user LaunchAgent on macOS, or a systemd user service on Linux, so the server and web dashboard come back after a restart and after a crash. It saves your `PATH` and any `A2A_*` / `AGY_BIN` variables, so tasks still find `agy`, Node.js and git. `enable --dry-run` prints the service file without installing it.
- On macOS, start-at-login logs go to `~/Library/Logs/a2a-panel/`.
- README: a "Keep the panel running after a restart" guide and an "Uninstall" section.
- This changelog. `npm run check` now fails if the version in `package.json` has no entry here, and the GitHub Release uses that entry as its notes.

### Changed

- With start at login turned on, `a2a-panel server start | stop | restart` control the login service, so a second server is never started next to it.
- `a2a-panel status` shows whether the server starts at login, plus the dashboard URL.

## [0.1.0] - 2026-10-26

First release on npm.

### Added

- Twelve Antigravity specialist roles, which Claude Code calls through the MCP server and other clients through the A2A HTTP / JSON-RPC server.
- Web task panel (React, Vite, Ant Design): live logs, dispatch, cancel and re-run, light and dark themes, mobile layout.
- Presets: your coding style, frontend and API libraries and default technology choices, kept as markdown files. Each file can be limited to certain specialists, and a repository can override them in `.agy/preferences/`. Presets start empty. Three starter templates: `nestjs-react`, `nextjs-fullstack`, `flutter-mobile`.
- Verification gate: the bridge runs `verification_command` itself and fails the task when it fails.
- Token usage per task and per role, conversation resume, a workspace change summary, timeouts, a concurrency cap and process-group cancel.
- `doctor` and `init` commands.

### Changed

- Renamed from `agy-bridge` to `a2a-panel`, for both the package and the command. `init` replaces an old `agy-bridge` MCP registration, and npm installs keep using an existing `~/.agy-bridge` data folder.

### Fixed

- Task logs show each tool call with its argument, failed tool steps, and actions `agy` denied.
- `GET /tasks/:id` and JSON-RPC `tasks/get` return usage, verification, conversation id and changes for async tasks.

[Unreleased]: https://github.com/CHANDARA-code/a2a-panel/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/CHANDARA-code/a2a-panel/releases/tag/v0.2.0
[0.1.0]: https://www.npmjs.com/package/a2a-panel/v/0.1.0
