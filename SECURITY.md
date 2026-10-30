# Security

## What a2a-panel does with your machine

a2a-panel starts agent CLIs in headless/automated modes without interactive confirmation prompts. Delegated tasks can read and write files and run shell commands in the workspace you give them, without a prompt. Only delegate work, and only open workspaces, that you would let an unattended script touch:

- **Google Antigravity (`agy`)**: Starts with `--dangerously-skip-permissions` in edit mode, or `--mode plan` when planning.
- **Claude Code (`claude`)**: Starts with `--dangerously-skip-permissions` in edit mode, or `--permission-mode dontAsk` with read-only tools (`Read`, `Glob`, `Grep`, `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git log:*)`, `Bash(ls:*)`) in plan mode.
- **Codex (`codex`)**: Starts with `--dangerously-bypass-approvals-and-sandbox` in edit mode, or `-s read-only` in plan mode.

Use `--mode plan` for work that must not change anything.

## Account credentials and isolation

- The accounts directory (`A2A_ACCOUNTS_DIR` or `<DATA_DIR>/accounts`) stores CLI credentials and session tokens. It is created with permission mode `0700` so only the owner can read or write to it.
- **Claude Code**: Uses `CLAUDE_CONFIG_DIR` per account and strips `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, and `CLAUDE_CODE_OAUTH_TOKEN` from the task process environment so stored profile credentials take effect.
- **Codex**: Uses `CODEX_HOME` per account.
- **Antigravity**: each account has its own home that links to your real home except `.gemini` and `Library`; its `Library` excludes `Keychains` and has its own `Preferences` without `com.apple.security.plist`. On macOS each account gets its own keychain file with an empty password inside the `0700` account folder, so its sign-in is protected by file permissions only (like Codex's `auth.json`). agy may also store the sign-in in `.gemini/antigravity-cli/antigravity-oauth-token` inside the account home. Your real keychain, search list and keychain settings are never modified. Verified on macOS; on Linux, check that a new account shows signed out before signing in.

## Account names and photos

- To show real names and photos, a2a-panel reads the sign-in each tool stored for that account: the id_token claims in Codex's `auth.json` (read locally), and agy's stored token (account file or keychain item `antigravity`), whose access token is sent only to `https://www.googleapis.com/oauth2/v3/userinfo`.
- Tokens are never logged, copied, or returned by any API. Only name, email, plan and the photo are saved.
- Photos are downloaded only over HTTPS from `*.googleusercontent.com`, without credentials or redirects, limited to 512 KB and type-checked by their bytes like uploads.
- The access token is never refreshed by a2a-panel; when it has expired, only the email is shown.

## Profile pictures and media security

- Account profile pictures uploaded to the panel (`PUT /api/accounts/:id/avatar`) are type-checked by their magic byte signatures (PNG, JPEG, WebP) rather than file extensions or client-provided MIME types.
- Decoded image payload size is restricted to a maximum of 512 KB, and executable or scriptable formats (such as SVG) are strictly forbidden.
- Avatars are served with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'` to prevent browser MIME-sniffing and cross-site script execution.
- Deleting an account immediately removes its associated profile image.

## Task session isolation and quota tracking

- Codex quota snapshots are parsed exclusively from the task's own session rollout file (`$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*-<session_id>.jsonl`) matching the thread ID from `thread.started`. Rollout files for other sessions or thread IDs are never read or attributed to the task.

## Team runs

Leader plans are untrusted text: a leader model reads repository content that could contain prompt injection. Plan-first mode shows every instruction and check command for review before execution. The bridge executes leader-written verification commands only after you explicitly approve a plan; in unapproved or accept-edits runs, verification commands are not run directly by the bridge on the host and are instead passed to the developer task as instructions.

## The local HTTP server

- It listens on `127.0.0.1` only and rejects requests whose `Host` header is not local.
- It sends no CORS headers.
- Every non-GET request needs the token in the `token` file in the data folder (mode 0600, created on first start).
- The server refuses to start on any address except loopback (`127.0.0.1`, `localhost`, `::1`).
- Do not forward the port to a network or the internet.

### Not safe on a shared machine

The web panel is served with its token embedded, and `GET` requests need no token. Any process or user on the same machine that can reach `127.0.0.1:5188` can load `/dashboard`, read the token, and start agents as you. Browsers on other sites are blocked (Host check, no CORS, same-origin check), but other local users are not. Do not run the HTTP server on a machine you share with people you do not trust. The MCP server that Claude Code starts does not open a port, so it is not affected.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository rather than a public issue. Include the version, what you did, and what happened.
