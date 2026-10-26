# Security

## What a2a-panel does with your machine

a2a-panel starts the Antigravity CLI (`agy`) with `--dangerously-skip-permissions`, because headless `agy` cannot ask for approval. A delegated task can read and write files and run shell commands in the workspace you give it, without a prompt. Only delegate work, and only open workspaces, that you would let an unattended script touch.

Use `--mode plan` for work that must not change anything.

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
