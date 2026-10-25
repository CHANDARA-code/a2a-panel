# Security

## What agy-bridge does with your machine

agy-bridge starts the Antigravity CLI (`agy`) with `--dangerously-skip-permissions`, because headless `agy` cannot ask for approval. A delegated task can read and write files and run shell commands in the workspace you give it, without a prompt. Only delegate work, and only open workspaces, that you would let an unattended script touch.

Use `--mode plan` for work that must not change anything.

## The local HTTP server

- It listens on `127.0.0.1` only and rejects requests whose `Host` header is not local.
- It sends no CORS headers.
- Every non-GET request needs the token in the `token` file in the data folder (mode 0600, created on first start).
- Do not expose the port to a network or forward it to the internet.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository rather than a public issue. Include the version, what you did, and what happened.
